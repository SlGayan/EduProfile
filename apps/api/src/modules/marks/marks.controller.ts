import { Response } from 'express';
import { AuthRequest } from '../../middleware/authMiddleware.js';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import csvParser from 'csv-parser';
import { Readable } from 'stream';
import { createMarkSchema } from '../../validators/markValidators.js';

const prisma = new PrismaClient();

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
    
    // Look up Teacher to ensure they exist and get their classes
    const teacher = await prisma.teacher.findUnique({
      where: { userId: teacherUserId, user: { deletedAt: null } },
      include: { classes: true }
    });
    
    if (!teacher) {
      return res.status(403).json({ error: 'Teacher profile not found' });
    }
    
    const teacherClassIds = teacher.classes.map(c => c.id);
    if (teacherClassIds.length === 0) {
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
    
    // Ensure all students exist and are in the teacher's classes
    for (const row of parsedRows) {
      const student = studentMap.get(row.studentIndexNumber);
      if (!student) {
        return res.status(400).json({ error: `Student with index number ${row.studentIndexNumber} not found` });
      }
      
      const studentClassIds = student.classes.map(c => c.id);
      const isTeacherOfStudent = studentClassIds.some(cId => teacherClassIds.includes(cId));
      
      if (!isTeacherOfStudent) {
        return res.status(403).json({ error: `You do not have permission to modify marks for student ${row.studentIndexNumber}` });
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

      for (const row of parsedRows) {
        const student = studentMap.get(row.studentIndexNumber)!;
        const subjectId = subjectMap.get(row.subjectName)!;

        await tx.termMark.upsert({
          where: {
            studentId_subjectId_term_year: {
              studentId: student.id,
              subjectId: subjectId,
              term: row.term,
              year: row.year
            }
          },
          update: { marks: row.marks },
          create: {
            studentId: student.id,
            subjectId: subjectId,
            term: row.term,
            year: row.year,
            marks: row.marks
          }
        });
      }
    });

    return res.status(200).json({ message: `Successfully imported ${parsedRows.length} mark(s)` });

  } catch (err: any) {
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

    const mark = await prisma.$transaction(async (tx) => {
      // Upsert the subject inside the transaction, matching `importMarks` —
      // a brand-new subject name is never left committed if the mark write fails.
      const subject = await tx.subject.upsert({
        where: { name: subjectName },
        update: {},
        create: { name: subjectName },
      });

      const existing = await tx.termMark.findUnique({
        where: { studentId_subjectId_term_year: { studentId: student.id, subjectId: subject.id, term, year } },
        select: { id: true },
      });

      const termMark = await tx.termMark.upsert({
        where: { studentId_subjectId_term_year: { studentId: student.id, subjectId: subject.id, term, year } },
        update: { marks },
        create: { studentId: student.id, subjectId: subject.id, term, year, marks },
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
      include: { classes: true },
    });

    if (!teacher) {
      return res.status(403).json({ error: 'Teacher profile not found' });
    }

    const teacherClassIds = teacher.classes.map((c) => c.id);
    if (teacherClassIds.length === 0) {
      return res.status(403).json({ error: 'Teacher is not assigned to any classes' });
    }

    const termMarks = await prisma.termMark.findMany({
      where: {
        student: {
          classes: { some: { id: { in: teacherClassIds } } },
        },
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
