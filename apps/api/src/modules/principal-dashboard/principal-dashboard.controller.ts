import { Response } from 'express';
import { AuthRequest } from '../../middleware/authMiddleware.js';
import { Prisma, PrismaClient } from '@prisma/client';
import { principalDashboardQuerySchema } from '../../validators/analyticsValidators.js';
import { READ_TX_OPTIONS, round2 } from '../../lib/queryHelpers.js';
import { deriveClassName } from '../../lib/classIdentity.js';

// Per-module client, matching every other file in apps/api/src. No shared
// singleton exists in this codebase; introducing one is out of scope here.
const prisma = new PrismaClient();

type ClassRow = {
  id: number;
  gradeLevel: number;
  section: string;
  teacher: { displayName: string | null } | null;
  students: { id: number; status: string }[];
};

type MarkRow = { studentId: number; marks: number };
type CurrentTermMarkRow = { studentId: number; marks: number; subjectId: number };

/**
 * Shared scope resolution for both endpoints below. A "scope" is one
 * (year, term, gradeLevel | classId) combination:
 *
 *  - `classId`, when given, is the most specific filter and pins `year` and
 *    `gradeLevel` to that class's own values, overriding whatever the query
 *    string asked for. The class picker on the frontend is always populated
 *    from the currently-selected year/grade, so a real mismatch here only
 *    happens via a stale or hand-crafted request — pinning to the class's
 *    truth is friendlier than a confusing empty scope.
 *  - `year` defaults to the latest year any `Class` row exists for.
 *  - `term` defaults to the most recently recorded term among that year's
 *    students, mirroring teacher-dashboard.controller's same default-scope
 *    resolution. Falls back to 1 when nothing has been recorded yet.
 *
 * Every class for the resolved year is fetched once (`yearClasses`) and used
 * for two different things: the grade-performance breakdown always spans
 * every grade in that year regardless of the grade/class filter, while
 * `scopedClasses` narrows to the selected grade/class for the roster and
 * completion figures.
 *
 * A mark reaches a class only through the student's *current* class
 * membership (`TermMark` has no `classId`), so a dual-enrolled student's mark
 * is credited to every class they sit in — matching
 * `analytics.controller.ts#getSchoolAnalytics`'s `classBreakdown` semantics.
 * Unlike that endpoint, a student in no class at all for the resolved year is
 * excluded entirely: this dashboard is scoped to one academic year's roster,
 * not "every active student regardless of year".
 */
async function resolveScope(
  tx: Prisma.TransactionClient,
  query: {
    classId: number | undefined;
    year: number | undefined;
    term: number | undefined;
    gradeLevel: number | undefined;
  }
) {
  let targetClass: { id: number; gradeLevel: number; year: number } | null = null;
  if (query.classId !== undefined) {
    targetClass = await tx.class.findUnique({
      where: { id: query.classId },
      select: { id: true, gradeLevel: true, year: true },
    });
    if (!targetClass) {
      return { notFound: true as const };
    }
  }

  const latestYear = targetClass
    ? null
    : (await tx.class.aggregate({ _max: { year: true } }))._max.year;
  const resolvedYear = targetClass?.year ?? query.year ?? latestYear ?? null;

  const yearClasses: ClassRow[] =
    resolvedYear === null
      ? []
      : await tx.class.findMany({
          where: { year: resolvedYear },
          select: {
            id: true,
            gradeLevel: true,
            section: true,
            teacher: { select: { displayName: true } },
            students: { where: { user: { deletedAt: null } }, select: { id: true, status: true } },
          },
        });

  const gradeLevel = targetClass?.gradeLevel ?? query.gradeLevel ?? undefined;
  const scopedClasses = targetClass
    ? yearClasses.filter((c) => c.id === targetClass!.id)
    : gradeLevel !== undefined
      ? yearClasses.filter((c) => c.gradeLevel === gradeLevel)
      : yearClasses;

  const allStudentIds = [...new Set(yearClasses.flatMap((c) => c.students.map((s) => s.id)))];
  const scopedClassIds = new Set(scopedClasses.map((c) => c.id));

  let term = query.term;
  if (term === undefined && allStudentIds.length > 0 && resolvedYear !== null) {
    const latestTerm = await tx.termMark.aggregate({
      where: { studentId: { in: allStudentIds }, year: resolvedYear },
      _max: { term: true },
    });
    term = latestTerm._max.term ?? undefined;
  }
  term = term ?? 1;

  const [assignments, allTimeSubjects, currentTermMarks, previousTermMarks] = await Promise.all([
    tx.teacherSubjectAssignment.findMany({
      where: { classId: { in: yearClasses.map((c) => c.id) } },
      select: { classId: true, subjectId: true },
      distinct: ['classId', 'subjectId'],
    }),
    tx.termMark.findMany({
      where: { studentId: { in: allStudentIds } },
      select: { studentId: true, subjectId: true },
      distinct: ['studentId', 'subjectId'],
    }),
    resolvedYear === null || allStudentIds.length === 0
      ? Promise.resolve([] as CurrentTermMarkRow[])
      : tx.termMark.findMany({
          where: { studentId: { in: allStudentIds }, year: resolvedYear, term },
          select: { studentId: true, marks: true, subjectId: true },
        }),
    resolvedYear === null || allStudentIds.length === 0 || term <= 1
      ? Promise.resolve([] as MarkRow[])
      : tx.termMark.findMany({
          where: { studentId: { in: allStudentIds }, year: resolvedYear, term: term - 1 },
          select: { studentId: true, marks: true },
        }),
  ]);

  const classesByStudent = new Map<number, number[]>();
  for (const c of yearClasses) {
    for (const s of c.students) {
      const list = classesByStudent.get(s.id);
      if (list) list.push(c.id);
      else classesByStudent.set(s.id, [c.id]);
    }
  }

  const assignedSubjectsByClass = new Map<number, Set<number>>();
  for (const a of assignments) {
    const set = assignedSubjectsByClass.get(a.classId);
    if (set) set.add(a.subjectId);
    else assignedSubjectsByClass.set(a.classId, new Set([a.subjectId]));
  }

  // "Ever recorded" subjects, folded onto every class the student currently
  // sits in — matches teacher-dashboard.controller's expected-subjects rule
  // (union of assigned + ever-recorded, never a global Subject.count()).
  const recordedSubjectsByClass = new Map<number, Set<number>>();
  for (const m of allTimeSubjects) {
    for (const classId of classesByStudent.get(m.studentId) ?? []) {
      const set = recordedSubjectsByClass.get(classId);
      if (set) set.add(m.subjectId);
      else recordedSubjectsByClass.set(classId, new Set([m.subjectId]));
    }
  }

  function expectedSubjectCount(classId: number): number {
    return new Set([
      ...(assignedSubjectsByClass.get(classId) ?? []),
      ...(recordedSubjectsByClass.get(classId) ?? []),
    ]).size;
  }

  const actualByClass = new Map<number, { count: number; sum: number }>();
  for (const m of currentTermMarks) {
    for (const classId of classesByStudent.get(m.studentId) ?? []) {
      const entry = actualByClass.get(classId) ?? { count: 0, sum: 0 };
      entry.count += 1;
      entry.sum += m.marks;
      actualByClass.set(classId, entry);
    }
  }

  const scopedCurrentMarks = currentTermMarks.filter((m) =>
    (classesByStudent.get(m.studentId) ?? []).some((cid) => scopedClassIds.has(cid))
  );
  const scopedPreviousMarks = previousTermMarks.filter((m) =>
    (classesByStudent.get(m.studentId) ?? []).some((cid) => scopedClassIds.has(cid))
  );

  return {
    notFound: false as const,
    resolvedYear,
    term,
    gradeLevel: gradeLevel ?? null,
    classId: targetClass?.id ?? null,
    yearClasses,
    scopedClasses,
    classesByStudent,
    expectedSubjectCount,
    actualByClass,
    currentTermMarks,
    scopedCurrentMarks,
    scopedPreviousMarks,
  };
}

function average(rows: MarkRow[]): number | null {
  if (rows.length === 0) return null;
  return round2(rows.reduce((sum, m) => sum + m.marks, 0) / rows.length);
}

/**
 * GET /api/principals/me/dashboard?year=&term=&gradeLevel=&classId=
 *
 * Landing-page stats for the Principal Dashboard: roster totals, marks
 * completion, the school average (with a term-over-term delta), and a
 * grade-level performance breakdown for the chart. "Certificate requests"
 * intentionally is NOT part of this response — the frontend already has a
 * dedicated `GET /api/certificates/eligible-count` for that figure, and
 * duplicating its eligibility rule here would be a second place for the two
 * to drift.
 */
export const getPrincipalDashboard = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = principalDashboardQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }

    const result = await prisma.$transaction(async (tx) => {
      const scope = await resolveScope(tx, {
        classId: parsed.data.classId,
        year: parsed.data.year,
        term: parsed.data.term,
        gradeLevel: parsed.data.gradeLevel,
      });
      if (scope.notFound) return scope;

      const yearsRows = await tx.class.findMany({
        select: { year: true },
        distinct: ['year'],
        orderBy: { year: 'desc' },
      });

      return { ...scope, years: yearsRows.map((r) => r.year) };
    }, READ_TX_OPTIONS);

    if (result.notFound) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const {
      resolvedYear,
      term,
      gradeLevel,
      classId,
      yearClasses,
      scopedClasses,
      classesByStudent,
      expectedSubjectCount,
      actualByClass,
      currentTermMarks,
      scopedCurrentMarks,
      scopedPreviousMarks,
      years,
    } = result;

    const subjectId = parsed.data.subjectId ?? null;

    const grades = [...new Set(yearClasses.map((c) => c.gradeLevel))].sort((a, b) => a - b);
    const classes = (gradeLevel !== null ? yearClasses.filter((c) => c.gradeLevel === gradeLevel) : yearClasses)
      .map((c) => ({ id: c.id, name: deriveClassName(c), gradeLevel: c.gradeLevel }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id - b.id);

    const rosterStatus = new Map<number, string>();
    for (const c of scopedClasses) {
      for (const s of c.students) rosterStatus.set(s.id, s.status);
    }
    const totals = {
      studentCount: rosterStatus.size,
      activeStudentCount: [...rosterStatus.values()].filter((s) => s === 'ACTIVE').length,
    };

    let totalExpected = 0;
    let totalActual = 0;
    let classCount = 0;
    let classesPending = 0;
    let classesMissing = 0;
    for (const c of scopedClasses) {
      const expected = c.students.length * expectedSubjectCount(c.id);
      if (expected === 0) continue;
      const actual = actualByClass.get(c.id)?.count ?? 0;
      classCount += 1;
      totalExpected += expected;
      totalActual += actual;
      if (actual < expected) classesPending += 1;
      if (actual === 0) classesMissing += 1;
    }

    const currentAverage = average(scopedCurrentMarks);
    const previousAverage = average(scopedPreviousMarks);

    // Grade performance always spans every grade in the resolved year,
    // independent of the grade/class filter — the chart's purpose is
    // cross-grade comparison, so narrowing it to match the stat cards would
    // leave it showing a single bar whenever a grade is selected. `subjectId`,
    // by contrast, DOES narrow it: it exists only to let the chart answer
    // "how is each grade doing in Mathematics", so it is applied here and
    // nowhere else in this response — the stat cards above are deliberately
    // computed over every subject regardless of this filter.
    const classById = new Map(yearClasses.map((c) => [c.id, c]));
    const relevantMarks = subjectId === null
      ? currentTermMarks
      : currentTermMarks.filter((m) => m.subjectId === subjectId);

    const gradeStats = new Map<number, { sum: number; count: number; studentCount: number }>();
    for (const c of yearClasses) {
      const stat = gradeStats.get(c.gradeLevel) ?? { sum: 0, count: 0, studentCount: 0 };
      stat.studentCount += c.students.length;
      gradeStats.set(c.gradeLevel, stat);
    }
    for (const m of relevantMarks) {
      for (const cid of classesByStudent.get(m.studentId) ?? []) {
        const cls = classById.get(cid);
        if (!cls) continue;
        const stat = gradeStats.get(cls.gradeLevel)!;
        stat.sum += m.marks;
        stat.count += 1;
      }
    }
    const gradePerformance = [...gradeStats.entries()]
      .map(([gl, stat]) => ({
        gradeLevel: gl,
        average: stat.count > 0 ? round2(stat.sum / stat.count) : null,
        studentCount: stat.studentCount,
        markCount: stat.count,
      }))
      .sort((a, b) => a.gradeLevel - b.gradeLevel);

    return res.status(200).json({
      scope: { year: resolvedYear, term, gradeLevel, classId, subjectId },
      filters: { years, grades, classes },
      totals,
      marksCompletion: {
        percent: totalExpected > 0 ? round2((totalActual / totalExpected) * 100) : null,
        classesPending,
        classCount,
      },
      reportsPending: classesMissing,
      schoolAverage: {
        current: currentAverage,
        previousTerm: previousAverage,
        deltaPercent: currentAverage !== null && previousAverage !== null
          ? round2(currentAverage - previousAverage)
          : null,
      },
      gradePerformance,
    });
  } catch (err) {
    console.error('Error building principal dashboard:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/principals/me/pending-marks?year=&term=&gradeLevel=&classId=
 *
 * Backs the "View Pending Marks" quick action: every class in scope with its
 * marks-completion figure, so a principal can see at a glance which classes
 * (and which teacher) still owe marks for the term. A class with no expected
 * marks (no roster, or no assigned/recorded subject yet) reports `null`
 * completion rather than 100% — there is nothing to be "complete" about.
 */
export const getPendingMarksClasses = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = principalDashboardQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }

    const result = await prisma.$transaction(async (tx) => {
      const scope = await resolveScope(tx, {
        classId: parsed.data.classId,
        year: parsed.data.year,
        term: parsed.data.term,
        gradeLevel: parsed.data.gradeLevel,
      });
      if (scope.notFound) return scope;

      const yearsRows = await tx.class.findMany({
        select: { year: true },
        distinct: ['year'],
        orderBy: { year: 'desc' },
      });

      return { ...scope, years: yearsRows.map((r) => r.year) };
    }, READ_TX_OPTIONS);

    if (result.notFound) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const {
      resolvedYear,
      term,
      gradeLevel,
      classId,
      yearClasses,
      scopedClasses,
      expectedSubjectCount,
      actualByClass,
      years,
    } = result;

    const grades = [...new Set(yearClasses.map((c) => c.gradeLevel))].sort((a, b) => a - b);

    const classes = scopedClasses
      .map((c) => {
        const expected = c.students.length * expectedSubjectCount(c.id);
        const actual = actualByClass.get(c.id)?.count ?? 0;
        return {
          classId: c.id,
          className: deriveClassName(c),
          gradeLevel: c.gradeLevel,
          teacherName: c.teacher?.displayName ?? null,
          studentCount: c.students.length,
          expectedMarks: expected,
          actualMarks: actual,
          completionPercent: expected > 0 ? round2((actual / expected) * 100) : null,
        };
      })
      .sort((a, b) => {
        const ap = a.completionPercent ?? 100;
        const bp = b.completionPercent ?? 100;
        return ap - bp || a.className.localeCompare(b.className, 'en');
      });

    return res.status(200).json({
      scope: { year: resolvedYear, term, gradeLevel, classId },
      filters: { years, grades },
      classes,
    });
  } catch (err) {
    console.error('Error building pending-marks list:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
