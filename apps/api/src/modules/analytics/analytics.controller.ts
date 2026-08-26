import { Response } from 'express';
import { AuthRequest } from '../../middleware/authMiddleware.js';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  parseId,
  schoolAnalyticsQuerySchema,
  classAnalyticsQuerySchema,
} from '../../validators/analyticsValidators.js';
import { READ_TX_OPTIONS, round2 } from '../../lib/queryHelpers.js';

// Per-module client, matching every other file in apps/api/src. No shared
// singleton exists in this codebase; introducing one is out of scope here.
const prisma = new PrismaClient();

type AuthzFailure = { status: number; error: string };

/**
 * The JWT carries a lowercase, frontend-normalized role (see routes/auth.ts) —
 * ADMINISTRATOR is stored as 'admin', not 'administrator'. Route-level
 * `requireRole` guards use the uppercase Prisma enum names because it
 * re-normalizes internally; in-handler comparisons must use these values.
 */
const ROLE_ADMIN = 'admin';
const ROLE_PRINCIPAL = 'principal';

/**
 * Sorting is pinned to a fixed locale. A bare `localeCompare()` follows the
 * host's ICU build and `LANG`, so identical data could order differently
 * between a developer machine and the server. Ties fall through to a numeric id
 * so the order is total: `Class.name` has no unique constraint, and two classes
 * genuinely can share a name.
 */
function byName<T extends { id: number; name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, 'en') || a.id - b.id;
}

/**
 * Soft delete lives on `User`, not `Student` — omitting this filter would let
 * deactivated students drag every average they ever contributed to.
 */
function activeStudentFilter(classId?: number): Prisma.StudentWhereInput {
  return {
    user: { deletedAt: null },
    ...(classId !== undefined ? { classes: { some: { id: classId } } } : {}),
  };
}

/**
 * Administrators and Principals reach every class (AC4). Teachers reach only
 * classes they are assigned to (AC3).
 *
 * The ownership test runs from the teacher's side (`teacher.classes`) rather
 * than comparing `Class.teacherId` directly, because `Class.teacherId` is
 * nullable — an unassigned class holds `null`, and a direct comparison risks
 * matching on a null-ish value.
 *
 * Authorization deliberately runs BEFORE the class-existence check, so a
 * teacher probing ids they don't own always receives 403 and can't use the
 * 403/404 split to enumerate which class ids exist.
 */
async function authorizeClassAccess(
  req: AuthRequest,
  classId: number
): Promise<AuthzFailure | null> {
  if (!req.user) {
    return { status: 401, error: 'Unauthorized' };
  }

  // Short-circuit before any Teacher lookup: an ADMINISTRATOR (and, in this
  // codebase, a PRINCIPAL) has no Teacher row, so falling through would yield
  // a misleading 403 'Teacher profile not found'. Learned in Story 9.2.
  if (req.user.role === ROLE_ADMIN || req.user.role === ROLE_PRINCIPAL) {
    return null;
  }

  const teacher = await prisma.teacher.findUnique({
    where: { userId: req.user.id, user: { deletedAt: null } },
    include: { classes: { select: { id: true } } },
  });

  if (!teacher) {
    return { status: 403, error: 'Teacher profile not found' };
  }

  if (!teacher.classes.some((c) => c.id === classId)) {
    return { status: 403, error: 'You do not have permission to view analytics for this class' };
  }

  return null;
}

/**
 * AC1 — per-subject class averages plus each student's mark series across
 * terms and years, for one class.
 *
 * Scope caveat, by design and worth knowing before reading the numbers:
 * `TermMark` has no `classId`, so marks reach a class only through the
 * student's *current* enrollment. A student who sits in two classes therefore
 * contributes their full mark series to both, and a transfer retroactively
 * changes a historical average. `?year=` / `?term=` exist so a caller can pin
 * the report to a fixed window and get a reproducible number.
 */
export const getClassAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseId(req.params.classId);
    if (classId === null) {
      return res.status(400).json({ error: 'Invalid class ID' });
    }

    const parsedQuery = classAnalyticsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsedQuery.error.issues });
    }
    const { year, term } = parsedQuery.data;

    const authz = await authorizeClassAccess(req, classId);
    if (authz) {
      return res.status(authz.status).json({ error: authz.error });
    }

    // TermMark has NO relation to Class — marks link Student -> Subject only.
    // Every class-scoped aggregate therefore filters through the student, and
    // because Student.classes is many-to-many it is always a `some` check.
    const markScope: Prisma.TermMarkWhereInput = {
      student: activeStudentFilter(classId),
      ...(year !== undefined ? { year } : {}),
      ...(term !== undefined ? { term } : {}),
    };

    const result = await prisma.$transaction(async (tx) => {
      const schoolClass = await tx.class.findUnique({
        where: { id: classId },
        select: { id: true, name: true },
      });

      if (!schoolClass) {
        return null;
      }

      const grouped = await tx.termMark.groupBy({
        by: ['subjectId', 'term', 'year'],
        where: markScope,
        _avg: { marks: true },
        _count: { marks: true },
      });

      const subjects = await tx.subject.findMany({
        where: { id: { in: [...new Set(grouped.map((g) => g.subjectId))] } },
        select: { id: true, name: true },
      });

      const termMarks = await tx.termMark.findMany({
        where: markScope,
        select: {
          term: true,
          year: true,
          marks: true,
          studentId: true,
          student: { select: { fullName: true, indexNumber: true } },
          subject: { select: { name: true } },
        },
        orderBy: [{ year: 'asc' }, { term: 'asc' }, { subject: { name: 'asc' } }],
      });

      return { schoolClass, grouped, subjects, termMarks };
    }, READ_TX_OPTIONS);

    if (result === null) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const { schoolClass, grouped, subjects, termMarks } = result;
    const subjectNames = new Map(subjects.map((s) => [s.id, s.name]));

    const subjectAverages = grouped
      .map((g) => ({
        subjectId: g.subjectId,
        subject: subjectNames.get(g.subjectId) ?? 'Unknown',
        term: g.term,
        year: g.year,
        // groupBy never emits an empty group, but _avg is typed nullable —
        // the fallback keeps a NaN out of the response either way.
        average: round2(g._avg.marks ?? 0),
        markCount: g._count.marks,
      }))
      .sort(
        (a, b) =>
          byName({ id: a.subjectId, name: a.subject }, { id: b.subjectId, name: b.subject }) ||
          a.year - b.year ||
          a.term - b.term
      );

    // Students with no marks in scope are absent by construction: "progress"
    // over zero data points is nothing to plot, and a class with no marks must
    // return an empty array rather than N empty shells (task 2.8).
    const progressByStudent = new Map<
      number,
      {
        studentId: number;
        studentName: string;
        indexNumber: string;
        marks: Array<{ subject: string; term: number; year: number; marks: number }>;
      }
    >();

    for (const m of termMarks) {
      let entry = progressByStudent.get(m.studentId);
      if (!entry) {
        entry = {
          studentId: m.studentId,
          studentName: m.student.fullName,
          indexNumber: m.student.indexNumber,
          marks: [],
        };
        progressByStudent.set(m.studentId, entry);
      }
      entry.marks.push({
        subject: m.subject.name,
        term: m.term,
        year: m.year,
        marks: m.marks,
      });
    }

    // Sorted here rather than in the `orderBy` above so that student ordering
    // uses the same JS collation as every other array in this response —
    // Postgres and ICU disagree on non-ASCII names.
    const studentProgress = [...progressByStudent.values()].sort((a, b) =>
      byName(
        { id: a.studentId, name: a.studentName },
        { id: b.studentId, name: b.studentName }
      )
    );

    return res.status(200).json({
      classId: schoolClass.id,
      className: schoolClass.name,
      scope: { year: year ?? null, term: term ?? null },
      subjectAverages,
      studentProgress,
    });
  } catch (err) {
    console.error('Error building class analytics:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * AC2 — school-wide aggregates for a Principal/Administrator, optionally
 * narrowed to one class and/or one year.
 *
 * There is no per-grade filter: `Class` carries only `name` and `year`, with no
 * grade column anywhere in the schema. Deriving a grade by parsing the class
 * name would break the moment a class is named differently, so the filter is
 * omitted rather than faked. Per the Story 10.1 review decision, per-class is
 * the supported granularity.
 */
export const getSchoolAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = schoolAnalyticsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }

    const { classId, year } = parsed.data;

    const markScope: Prisma.TermMarkWhereInput = {
      student: activeStudentFilter(classId),
      ...(year !== undefined ? { year } : {}),
    };

    const result = await prisma.$transaction(async (tx) => {
      // A `?classId=` naming no real class is a 404, not an empty 200 — an
      // empty 200 is indistinguishable from a real class with no marks, and
      // `/class/:classId` already answers 404 for the same mistake.
      if (classId !== undefined) {
        const exists = await tx.class.findUnique({ where: { id: classId }, select: { id: true } });
        if (!exists) return null;
      }

      const grouped = await tx.termMark.groupBy({
        by: ['subjectId'],
        where: markScope,
        _avg: { marks: true },
        _count: { marks: true },
      });

      const subjects = await tx.subject.findMany({
        where: { id: { in: [...new Set(grouped.map((g) => g.subjectId))] } },
        select: { id: true, name: true },
      });

      // The per-class breakdown cannot be a groupBy: a mark reaches a class only
      // through the student's many-to-many `classes`, so one mark can legitimately
      // count toward more than one class. Fold it in memory instead — one query,
      // narrow select, rather than one query per class.
      const scopedMarks = await tx.termMark.findMany({
        where: markScope,
        select: {
          marks: true,
          studentId: true,
          student: { select: { classes: { select: { id: true } } } },
        },
      });

      // The class roster comes from the Class table, NOT from the marks. A class
      // with no marks recorded yet is exactly the one a principal needs to see,
      // and deriving the roster from marks made it invisible. This is also the
      // only source of a true enrollment count.
      const classes = await tx.class.findMany({
        where: classId !== undefined ? { id: classId } : {},
        select: {
          id: true,
          name: true,
          students: { where: { user: { deletedAt: null } }, select: { id: true } },
        },
      });

      return { grouped, subjects, scopedMarks, classes };
    }, READ_TX_OPTIONS);

    if (result === null) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const { grouped, subjects, scopedMarks, classes } = result;
    const subjectNames = new Map(subjects.map((s) => [s.id, s.name]));

    const subjectAverages = grouped
      .map((g) => ({
        subjectId: g.subjectId,
        subject: subjectNames.get(g.subjectId) ?? 'Unknown',
        average: round2(g._avg.marks ?? 0),
        markCount: g._count.marks,
      }))
      .sort((a, b) =>
        byName({ id: a.subjectId, name: a.subject }, { id: b.subjectId, name: b.subject })
      );

    const rosterIds = new Set(classes.map((c) => c.id));
    const classStats = new Map<number, { total: number; count: number; scored: Set<number> }>();
    for (const c of classes) {
      classStats.set(c.id, { total: 0, count: 0, scored: new Set() });
    }

    for (const m of scopedMarks) {
      for (const c of m.student.classes) {
        // A classId filter narrows which STUDENTS are in scope, but those
        // students may also sit in other classes; don't report those here.
        if (!rosterIds.has(c.id)) continue;
        const stat = classStats.get(c.id)!;
        stat.total += m.marks;
        stat.count += 1;
        stat.scored.add(m.studentId);
      }
    }

    const classBreakdown = classes
      .map((c) => {
        const stat = classStats.get(c.id)!;
        return {
          classId: c.id,
          className: c.name,
          // null, not 0: a class with no marks has no average, and 0 would read
          // as "everyone scored zero" on a chart.
          average: stat.count > 0 ? round2(stat.total / stat.count) : null,
          studentCount: c.students.length, // enrolled, not merely scored
          scoredStudentCount: stat.scored.size,
          markCount: stat.count,
        };
      })
      .sort((a, b) => byName({ id: a.classId, name: a.className }, { id: b.classId, name: b.className }));

    // School-level truth. Summing classBreakdown does NOT reproduce these:
    // a dual-enrolled student's mark is credited to every class they sit in,
    // and a student in no class at all (routine right after a bulk import,
    // before class assignment) is counted here but appears in no class row.
    const totals = {
      markCount: scopedMarks.length,
      studentCount: new Set(scopedMarks.map((m) => m.studentId)).size,
      unassignedMarkCount: scopedMarks.filter(
        (m) => !m.student.classes.some((c) => rosterIds.has(c.id))
      ).length,
    };

    return res.status(200).json({
      scope: { classId: classId ?? null, year: year ?? null },
      totals,
      subjectAverages,
      classBreakdown,
    });
  } catch (err) {
    console.error('Error building school analytics:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
