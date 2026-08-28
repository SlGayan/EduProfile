import { Response } from 'express';
import { AuthRequest } from '../../middleware/authMiddleware.js';
import { PrismaClient } from '@prisma/client';
import { classAnalyticsQuerySchema } from '../../validators/analyticsValidators.js';
import { READ_TX_OPTIONS, round2 } from '../../lib/queryHelpers.js';
import { deriveClassName } from '../../lib/classIdentity.js';

// Per-module client, matching every other file in apps/api/src. No shared
// singleton exists in this codebase; introducing one is out of scope here.
const prisma = new PrismaClient();

/**
 * AD-2 architecture rule: certificates are Principal-only. This endpoint must
 * never touch `CharacterCertificate` or return certificate-shaped fields —
 * the response is limited to roster/marks stats only.
 *
 * Scope: a teacher may in principle be assigned more than one `Class`
 * (`Teacher.classes` is an array), but the dashboard UI shows a single class
 * context (name + one set of stats), matching the "Class Teacher" homeroom
 * concept. The lowest-id class is treated as the teacher's primary/homeroom
 * class; this mirrors how `classContext` in the frontend shell assumed one
 * class per teacher.
 *
 * "Marks Pending" and "Needs Support" both need a notion of "the current
 * term" — TermMark carries no such flag, so the most recently recorded
 * (year, term) pair for the class's own students is used as the default
 * scope. Callers may override via `?year=&term=`, reusing the same query
 * shape as `GET /api/analytics/class/:classId` for consistency.
 *
 * "Marks Pending" counts a student the moment they're missing ANY expected
 * subject, not just when they have zero marks. The expected-subjects set for
 * a class is the union of (a) subjects with a `TeacherSubjectAssignment` for
 * this class (Story 12.3's real Class-Subject relation) and (b) subjects
 * that have ever had a `TermMark` recorded for one of this class's students,
 * across all years/terms. Deliberately NOT a global `Subject.count()` (the
 * prior approach): `Subject` is one table shared by every class, so any
 * unrelated class or test creating a new Subject row would silently inflate
 * every other class's expected count and misclassify fully-marked students
 * as pending.
 *
 * "Needs Support" flags a student the moment ANY ONE of their recorded
 * subjects is below 50 — deliberately not the same thing as their overall
 * average across subjects, which is a different (also legitimate) metric.
 */
export const getTeacherDashboard = async (req: AuthRequest, res: Response) => {
  try {
    const parsedQuery = classAnalyticsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsedQuery.error.issues });
    }
    const { year: queryYear, term: queryTerm } = parsedQuery.data;

    const result = await prisma.$transaction(async (tx) => {
      const teacher = await tx.teacher.findUnique({
        where: { userId: req.user!.id, user: { deletedAt: null } },
        select: {
          classes: {
            orderBy: { id: 'asc' },
            take: 1,
            select: {
              id: true,
              gradeLevel: true,
              section: true,
              students: {
                where: { user: { deletedAt: null } },
                select: { id: true },
              },
            },
          },
        },
      });

      if (!teacher) {
        return { authz: { status: 403, error: 'Teacher profile not found' } } as const;
      }

      const primaryClass = teacher.classes[0] ?? null;
      if (!primaryClass) {
        return {
          authz: null,
          classId: null,
          className: null,
          studentCount: 0,
          marksPending: 0,
          classAverage: null,
          needsSupport: 0,
          scope: { year: null, term: null },
        } as const;
      }

      const studentIds = primaryClass.students.map((s) => s.id);
      const studentCount = studentIds.length;

      if (studentCount === 0) {
        return {
          authz: null,
          classId: primaryClass.id,
          className: deriveClassName(primaryClass),
          studentCount: 0,
          marksPending: 0,
          classAverage: null,
          needsSupport: 0,
          scope: { year: queryYear ?? null, term: queryTerm ?? null },
        } as const;
      }

      // Resolve the scope: explicit query params win; otherwise fall back to
      // the most recently recorded (year, term) among this class's marks.
      let year = queryYear;
      let term = queryTerm;

      if (year === undefined || term === undefined) {
        const latestYear = await tx.termMark.aggregate({
          where: { studentId: { in: studentIds } },
          _max: { year: true },
        });

        if (latestYear._max.year !== null) {
          year = year ?? latestYear._max.year;

          const latestTerm = await tx.termMark.aggregate({
            where: { studentId: { in: studentIds }, year },
            _max: { term: true },
          });
          term = term ?? latestTerm._max.term ?? undefined;
        }
      }

      // No marks recorded for this class at all: every student is pending,
      // there is no average, and nobody can be flagged as "needs support".
      // Echo back whatever the caller actually requested (or what was
      // resolved so far) rather than blanking it to null — a caller who
      // passed `?year=2024` should see that year reflected even when no
      // term could be resolved for it.
      if (year === undefined || term === undefined) {
        return {
          authz: null,
          classId: primaryClass.id,
          className: deriveClassName(primaryClass),
          studentCount,
          marksPending: studentCount,
          classAverage: null,
          needsSupport: 0,
          scope: { year: year ?? null, term: term ?? null },
        } as const;
      }

      const [termMarks, classAssignedSubjects, classRecordedSubjects] = await Promise.all([
        tx.termMark.findMany({
          where: { studentId: { in: studentIds }, year, term },
          select: { studentId: true, subjectId: true, marks: true },
        }),
        tx.teacherSubjectAssignment.findMany({
          where: { classId: primaryClass.id },
          select: { subjectId: true },
          distinct: ['subjectId'],
        }),
        tx.termMark.findMany({
          where: { studentId: { in: studentIds } },
          select: { subjectId: true },
          distinct: ['subjectId'],
        }),
      ]);

      const expectedSubjectCount = new Set([
        ...classAssignedSubjects.map((a) => a.subjectId),
        ...classRecordedSubjects.map((m) => m.subjectId),
      ]).size;

      // Group by student, keeping both the raw mark values (for the class
      // average, so a student with more subjects recorded doesn't pull the
      // average toward their own score — it's the average of each student's
      // own average, not a mean over every individual mark) and the distinct
      // subjects recorded (to detect partial grading for "pending" below).
      const marksByStudent = new Map<number, number[]>();
      const subjectsByStudent = new Map<number, Set<number>>();
      for (const m of termMarks) {
        const marks = marksByStudent.get(m.studentId);
        if (marks) {
          marks.push(m.marks);
        } else {
          marksByStudent.set(m.studentId, [m.marks]);
        }

        const subjects = subjectsByStudent.get(m.studentId);
        if (subjects) {
          subjects.add(m.subjectId);
        } else {
          subjectsByStudent.set(m.studentId, new Set([m.subjectId]));
        }
      }

      // Pending = missing ANY expected subject, not just missing all of them —
      // catches partial grading along with the zero-marks case (a student
      // absent from `subjectsByStudent` has a recorded count of 0).
      const marksPending = studentIds.filter((id) => {
        const recorded = subjectsByStudent.get(id)?.size ?? 0;
        return recorded < expectedSubjectCount;
      }).length;

      const studentAverages = [...marksByStudent.values()].map(
        (marks) => marks.reduce((sum, mark) => sum + mark, 0) / marks.length
      );

      const classAverage =
        studentAverages.length > 0
          ? round2(studentAverages.reduce((sum, avg) => sum + avg, 0) / studentAverages.length)
          : null;

      // Any ONE recorded subject below 50 is enough — not the same test as
      // the overall average above.
      const needsSupport = [...marksByStudent.values()].filter((marks) =>
        marks.some((mark) => mark < 50)
      ).length;

      return {
        authz: null,
        classId: primaryClass.id,
        className: deriveClassName(primaryClass),
        studentCount,
        marksPending,
        classAverage,
        needsSupport,
        scope: { year, term },
      } as const;
    }, READ_TX_OPTIONS);

    if (result.authz) {
      return res.status(result.authz.status).json({ error: result.authz.error });
    }

    const { authz: _authz, ...payload } = result;
    return res.status(200).json(payload);
  } catch (err) {
    console.error('Error building teacher dashboard:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
