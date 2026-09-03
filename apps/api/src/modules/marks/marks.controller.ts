import { Response } from 'express';
import { AuthRequest } from '../../middleware/authMiddleware.js';
import { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';
import csvParser from 'csv-parser';
import { Readable } from 'stream';
import { createMarkSchema } from '../../validators/markValidators.js';

const prisma = new PrismaClient();

// Story 13.3 — a TermMark now anchors to the Enrollment it was earned in,
// not the student's current class membership (Epic 13 AD). Thrown by
// `resolveEnrollmentId` and caught by each caller to map straight to the
// I/O matrix's 404 (no candidate)/400 (ambiguous) responses, without ever
// reaching the write path.
class EnrollmentResolutionError extends Error {
  status: 400 | 404;
  constructor(status: 400 | 404, message: string) {
    super(message);
    this.status = status;
  }
}

// Shared by importMarks/createMark: resolves the single Enrollment a mark
// anchors to for (studentId, year), scoped to `candidateClassIds` -- the
// classes the calling teacher is authorized to act in for this row. No
// heuristic fallback: zero matches is a 404, more than one (e.g. a
// mid-year transfer leaving two same-year enrollments) is a 400.
async function resolveEnrollmentId(
  studentId: number,
  candidateClassIds: number[],
  year: number,
  studentLabel: string
): Promise<number> {
  const matches = await prisma.enrollment.findMany({
    where: { studentId, class: { id: { in: candidateClassIds }, year } },
    select: { id: true },
  });
  if (matches.length === 0) {
    throw new EnrollmentResolutionError(404, `No enrollment found for student ${studentLabel} in ${year}`);
  }
  if (matches.length > 1) {
    throw new EnrollmentResolutionError(400, `Multiple enrollments match student ${studentLabel} in ${year}, cannot resolve`);
  }
  return matches[0]!.id;
}

// Story 13.3 — TermMark now carries TWO unique indexes: the anchor
// (enrollmentId, subjectId, term) and the retained natural-key guard
// (studentId, subjectId, term, year) (`TermMark_natural_key_guard` in
// schema.prisma). Only a P2002 on the natural-key guard means "this exact
// student/subject/term/year mark already exists under a different
// enrollment" and maps to 409 (matching the existing 409-on-conflict
// convention in routes/classes.ts's enrol route). A P2002 on the anchor key
// instead (e.g. a concurrent double-submit of the identical
// enrollmentId/subjectId/term) is a different situation and must NOT be
// mislabeled with the same message -- it falls through to the generic 500.
const NATURAL_KEY_GUARD_FIELDS = ['studentId', 'subjectId', 'term', 'year'];

function isNaturalKeyViolation(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
    return false;
  }
  const target = err.meta?.target;
  // Postgres (this project's connector) reports `target` as the array of
  // column names in the violated index; some other connectors/versions
  // report the constraint/index name as a single string instead. Handle both.
  if (typeof target === 'string') {
    return target === 'TermMark_natural_key_guard';
  }
  if (Array.isArray(target)) {
    const fields = new Set(target as unknown[]);
    return (
      fields.size === NATURAL_KEY_GUARD_FIELDS.length &&
      NATURAL_KEY_GUARD_FIELDS.every((f) => fields.has(f))
    );
  }
  return false;
}

const DUPLICATE_MARK_MESSAGE =
  'A mark for this student/subject/term/year already exists under a different enrollment';

const markRowSchema = z.object({
  studentIndexNumber: z.string().min(1),
  subjectName: z.string().min(1),
  term: z.coerce.number().int().min(1).max(3),
  year: z.coerce.number().int().min(2000).max(2100),
  marks: z.coerce.number().int().min(0).max(100),
});

type MarkRow = z.infer<typeof markRowSchema>;

const myMarksYearSchema = z.coerce.number().int().min(2000).max(2100);
const myMarksTermSchema = z.coerce.number().int().min(1).max(3);

export const importMarks = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file provided' });
    }
    
    if (!req.user || req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Unauthorized: Only teachers can import marks' });
    }
    
    const teacherUserId = req.user.id;

    // Parse CSV
    const rows: any[] = [];
    await new Promise((resolve, reject) => {
      Readable.from(req.file!.buffer)
        .pipe(csvParser())
        .on('data', (data) => rows.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    const parsedRows: MarkRow[] = [];
    const errors: any[] = [];

    rows.forEach((row, index) => {
      const parsed = markRowSchema.safeParse(row);
      if (!parsed.success) {
        errors.push({ row: index + 1, data: row, issues: parsed.error.issues });
      } else {
        parsedRows.push(parsed.data);
      }
    });

    if (errors.length > 0) {
      return res.status(400).json({ error: 'CSV Validation failed', details: errors });
    }
    
    if (parsedRows.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty' });
    }
    
    // Look up Teacher to ensure they exist and get their owned classes plus
    // any per-class/subject teaching assignments (Story 12.3).
    const teacher = await prisma.teacher.findUnique({
      where: { userId: teacherUserId, user: { deletedAt: null } },
      include: { classes: true, subjectAssignments: true }
    });

    if (!teacher) {
      return res.status(403).json({ error: 'Teacher profile not found' });
    }

    const teacherClassIds = teacher.classes.map(c => c.id);
    if (teacherClassIds.length === 0 && teacher.subjectAssignments.length === 0) {
      return res.status(403).json({ error: 'Teacher is not assigned to any classes' });
    }

    // Get unique students and subjects
    const uniqueIndexNumbers = [...new Set(parsedRows.map(r => r.studentIndexNumber))];
    const uniqueSubjectNames = [...new Set(parsedRows.map(r => r.subjectName))];

    // Fetch students
    const students = await prisma.student.findMany({
      where: { indexNumber: { in: uniqueIndexNumbers }, user: { deletedAt: null } },
      include: { classes: true }
    });

    const studentMap = new Map(students.map(s => [s.indexNumber, s]));

    // Resolve subject names to ids up front so the per-row authorization
    // check below can be subject-aware; brand-new subjects (no existing
    // Subject row) can never match an assignment, so they're left out of
    // this lookup on purpose.
    const existingSubjects = await prisma.subject.findMany({
      where: { name: { in: uniqueSubjectNames } },
    });
    const subjectIdByName = new Map(existingSubjects.map(s => [s.name, s.id]));

    // classId:subjectId pairs the teacher is explicitly assigned to teach,
    // independent of Class.teacherId ownership.
    const assignedClassSubjectPairs = new Set(
      teacher.subjectAssignments.map(a => `${a.classId}:${a.subjectId}`)
    );

    // Ensure all students exist and the teacher may edit marks for them:
    // either the teacher owns one of the student's classes, or the teacher
    // has a TeacherSubjectAssignment for the student's class and this row's
    // subject.
    for (const row of parsedRows) {
      const student = studentMap.get(row.studentIndexNumber);
      if (!student) {
        return res.status(400).json({ error: `Student with index number ${row.studentIndexNumber} not found` });
      }

      const studentClassIds = student.classes.map(c => c.id);
      const ownsAClass = studentClassIds.some(cId => teacherClassIds.includes(cId));

      const rowSubjectId = subjectIdByName.get(row.subjectName);
      const hasSubjectAssignment =
        rowSubjectId !== undefined &&
        studentClassIds.some(cId => assignedClassSubjectPairs.has(`${cId}:${rowSubjectId}`));

      if (!ownsAClass && !hasSubjectAssignment) {
        return res.status(403).json({ error: `You do not have permission to modify marks for student ${row.studentIndexNumber}` });
      }
    }

    // Story 13.3 — classIds the teacher is subject-assigned in, grouped by
    // subject, reused below to build each row's enrollment-resolution
    // candidate set (mirrors the ownsAClass/hasSubjectAssignment check above).
    const assignedClassIdsBySubject = new Map<number, number[]>();
    for (const a of teacher.subjectAssignments) {
      const list = assignedClassIdsBySubject.get(a.subjectId) ?? [];
      list.push(a.classId);
      assignedClassIdsBySubject.set(a.subjectId, list);
    }

    // Resolve every row's anchor Enrollment BEFORE the transaction opens:
    // if any row is unresolved (404/400), the whole import bails out here
    // and no TermMark for ANY row -- including already-resolved ones -- is
    // ever written, preserving the pre-13.3 all-or-nothing guarantee.
    const rowEnrollmentIds: number[] = [];
    for (const row of parsedRows) {
      const student = studentMap.get(row.studentIndexNumber)!;
      const rowSubjectId = subjectIdByName.get(row.subjectName);
      const candidateClassIds = [
        ...new Set([...teacherClassIds, ...(rowSubjectId !== undefined ? assignedClassIdsBySubject.get(rowSubjectId) ?? [] : [])]),
      ];
      try {
        const enrollmentId = await resolveEnrollmentId(student.id, candidateClassIds, row.year, row.studentIndexNumber);
        rowEnrollmentIds.push(enrollmentId);
      } catch (e) {
        if (e instanceof EnrollmentResolutionError) {
          return res.status(e.status).json({ error: e.message });
        }
        throw e;
      }
    }

    await prisma.$transaction(async (tx) => {
      // Upsert subjects inside the transaction so a brand-new subject name
      // can never be left committed if the import fails partway through.
      const subjectMap = new Map<string, number>();
      for (const subName of uniqueSubjectNames) {
        const subject = await tx.subject.upsert({
          where: { name: subName },
          update: {},
          create: { name: subName },
        });
        subjectMap.set(subName, subject.id);
      }

      for (let i = 0; i < parsedRows.length; i++) {
        const row = parsedRows[i]!;
        const student = studentMap.get(row.studentIndexNumber)!;
        const subjectId = subjectMap.get(row.subjectName)!;
        const enrollmentId = rowEnrollmentIds[i]!;

        await tx.termMark.upsert({
          where: {
            enrollmentId_subjectId_term: {
              enrollmentId,
              subjectId,
              term: row.term,
            },
          },
          update: { marks: row.marks },
          create: {
            studentId: student.id,
            subjectId,
            term: row.term,
            year: row.year,
            marks: row.marks,
            enrollmentId,
          },
        });
      }
    });

    return res.status(200).json({ message: `Successfully imported ${parsedRows.length} mark(s)` });

  } catch (err: any) {
    if (isNaturalKeyViolation(err)) {
      return res.status(409).json({ error: DUPLICATE_MARK_MESSAGE });
    }
    console.error('Import marks error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};

// POST /api/marks — single-record equivalent of `/import`'s per-row logic:
// same field rules, same class-ownership check, same subject/mark upsert.
export const createMark = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Unauthorized: Only teachers can add marks' });
    }

    const parsed = createMarkSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }
    const { studentIndexNumber, subjectName, term, year, marks } = parsed.data;

    const teacher = await prisma.teacher.findUnique({
      where: { userId: req.user.id, user: { deletedAt: null } },
      include: { classes: true },
    });

    if (!teacher) {
      return res.status(403).json({ error: 'Teacher profile not found' });
    }

    const teacherClassIds = teacher.classes.map((c) => c.id);
    if (teacherClassIds.length === 0) {
      return res.status(403).json({ error: 'Teacher is not assigned to any classes' });
    }

    const student = await prisma.student.findFirst({
      where: { indexNumber: studentIndexNumber, user: { deletedAt: null } },
      include: { classes: true },
    });

    if (!student) {
      return res.status(404).json({ error: `Student with index number ${studentIndexNumber} not found` });
    }

    const isTeacherOfStudent = student.classes.some((c) => teacherClassIds.includes(c.id));
    if (!isTeacherOfStudent) {
      return res
        .status(403)
        .json({ error: `You do not have permission to modify marks for student ${studentIndexNumber}` });
    }

    // Story 13.3 — resolve this mark's anchor Enrollment before writing
    // anything. Unlike importMarks, createMark has no TeacherSubjectAssignment
    // awareness (a pre-existing gap predating this story), so the candidate
    // set is just the classes the teacher owns.
    let enrollmentId: number;
    try {
      enrollmentId = await resolveEnrollmentId(student.id, teacherClassIds, year, studentIndexNumber);
    } catch (e) {
      if (e instanceof EnrollmentResolutionError) {
        return res.status(e.status).json({ error: e.message });
      }
      throw e;
    }

    const mark = await prisma.$transaction(async (tx) => {
      // Upsert the subject inside the transaction, matching `importMarks` —
      // a brand-new subject name is never left committed if the mark write fails.
      const subject = await tx.subject.upsert({
        where: { name: subjectName },
        update: {},
        create: { name: subjectName },
      });

      const existing = await tx.termMark.findUnique({
        where: { enrollmentId_subjectId_term: { enrollmentId, subjectId: subject.id, term } },
        select: { id: true },
      });

      const termMark = await tx.termMark.upsert({
        where: { enrollmentId_subjectId_term: { enrollmentId, subjectId: subject.id, term } },
        update: { marks },
        create: { studentId: student.id, subjectId: subject.id, term, year, marks, enrollmentId },
      });

      return { termMark, subjectName: subject.name, created: existing === null };
    });

    return res.status(mark.created ? 201 : 200).json({
      id: String(mark.termMark.id),
      studentName: student.fullName,
      studentIndexNumber: student.indexNumber,
      subject: mark.subjectName,
      term: mark.termMark.term,
      year: mark.termMark.year,
      marks: mark.termMark.marks,
    });
  } catch (err: any) {
    if (isNaturalKeyViolation(err)) {
      return res.status(409).json({ error: DUPLICATE_MARK_MESSAGE });
    }
    console.error('Create mark error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};

export const getMyMarks = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const student = await prisma.student.findUnique({
      where: { userId: req.user.id, user: { deletedAt: null } },
    });

    if (!student) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    const { year, term } = req.query;

    if ((year !== undefined && typeof year !== 'string') || (term !== undefined && typeof term !== 'string')) {
      return res.status(400).json({ error: 'Invalid year or term parameter' });
    }

    let yearFilter: { year?: number } = {};
    if (year && year !== 'all') {
      const parsedYear = myMarksYearSchema.safeParse(year);
      if (!parsedYear.success) {
        return res.status(400).json({ error: 'Invalid year parameter' });
      }
      yearFilter = { year: parsedYear.data };
    }

    let termFilter: { term?: number } = {};
    if (term && term !== 'all') {
      const parsedTerm = myMarksTermSchema.safeParse(term);
      if (!parsedTerm.success) {
        return res.status(400).json({ error: 'Invalid term parameter' });
      }
      termFilter = { term: parsedTerm.data };
    }

    const termMarks = await prisma.termMark.findMany({
      where: {
        studentId: student.id,
        ...yearFilter,
        ...termFilter,
      },
      include: { subject: true },
      orderBy: [{ year: 'desc' }, { term: 'asc' }, { subject: { name: 'asc' } }],
    });

    return res.status(200).json(
      termMarks.map((m) => ({
        id: String(m.id),
        subject: m.subject.name,
        term: m.term,
        year: m.year,
        marks: m.marks,
      }))
    );
  } catch (err: any) {
    console.error('Get my marks error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};

export const getClassMarks = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const teacher = await prisma.teacher.findUnique({
      where: { userId: req.user.id, user: { deletedAt: null } },
      include: { classes: true, subjectAssignments: true },
    });

    if (!teacher) {
      return res.status(403).json({ error: 'Teacher profile not found' });
    }

    // View access is granted for a whole class if the teacher owns it OR has
    // any TeacherSubjectAssignment in it (view is not subject-filtered, per
    // Story 12.3 -- only editing via importMarks is subject-scoped).
    const teacherClassIds = [
      ...new Set([
        ...teacher.classes.map((c) => c.id),
        ...teacher.subjectAssignments.map((a) => a.classId),
      ]),
    ];
    if (teacherClassIds.length === 0) {
      return res.status(403).json({ error: 'Teacher is not assigned to any classes' });
    }

    // Story 13.3 — anchored to the enrollment's class, not the student's
    // current class list: a teacher must keep seeing marks recorded under
    // their class's enrollment even after the student transfers away.
    const termMarks = await prisma.termMark.findMany({
      where: {
        enrollment: { classId: { in: teacherClassIds } },
      },
      include: { student: true, subject: true },
      orderBy: [
        { student: { fullName: 'asc' } },
        { subject: { name: 'asc' } },
        { year: 'desc' },
        { term: 'asc' },
      ],
    });

    return res.status(200).json(
      termMarks.map((m) => ({
        id: String(m.id),
        studentName: m.student.fullName,
        studentIndexNumber: m.student.indexNumber,
        subject: m.subject.name,
        term: m.term,
        year: m.year,
        marks: m.marks,
      }))
    );
  } catch (err: any) {
    console.error('Get class marks error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};
