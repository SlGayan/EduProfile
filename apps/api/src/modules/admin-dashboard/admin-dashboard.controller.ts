import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../../middleware/authMiddleware.js';
import { READ_TX_OPTIONS } from '../../lib/queryHelpers.js';
import { deriveClassName } from '../../lib/classIdentity.js';

// Per-module client, matching every other file in apps/api/src. No shared
// singleton exists in this codebase; introducing one is out of scope here.
const prisma = new PrismaClient();

/**
 * GET /api/admin/dashboard
 *
 * Landing-page stats for the Admin Dashboard: system-wide totals (users,
 * students, teachers, classes), items needing administrative attention
 * (pending activity reviews, classes with no teacher, subjects with no
 * teacher assigned to any class), and two roster breakdowns for the charts
 * (gender, grade level).
 *
 * Unlike the Principal Dashboard, this has no year/term/grade scope picker —
 * it is a single system-wide snapshot, so totals count every row regardless
 * of academic year. The one exception is grade distribution: a student can
 * carry class membership across multiple years (promotion/repetition), so
 * summing every year's classes would double-count a promoted student. That
 * chart is scoped to the latest academic year's classes only, matching the
 * "what does the school look like right now" reading a grade-by-grade chart
 * implies.
 */
export const getAdminDashboard = async (req: AuthRequest, res: Response) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const [
        totalUsers,
        totalStudents,
        totalTeachers,
        totalClasses,
        pendingActivities,
        unassignedClasses,
        unassignedSubjects,
        genderRows,
        latestYear,
      ] = await Promise.all([
        tx.user.count({ where: { deletedAt: null } }),
        tx.student.count({ where: { user: { deletedAt: null } } }),
        tx.teacher.count({ where: { user: { deletedAt: null } } }),
        tx.class.count(),
        tx.extracurricularActivity.count({ where: { status: 'PENDING' } }),
        tx.class.count({ where: { teacherId: null } }),
        tx.subject.count({ where: { teacherAssignments: { none: {} } } }),
        tx.student.groupBy({
          by: ['gender'],
          _count: { _all: true },
          where: { user: { deletedAt: null } },
        }),
        tx.class.aggregate({ _max: { year: true } }),
      ]);

      const year = latestYear._max.year;
      const gradeClasses =
        year === null
          ? []
          : await tx.class.findMany({
              where: { year },
              select: { gradeLevel: true, students: { select: { id: true } } },
            });

      const exampleUnassignedClass =
        unassignedClasses > 0
          ? await tx.class.findFirst({
              where: { teacherId: null },
              orderBy: [{ gradeLevel: 'asc' }, { section: 'asc' }],
              select: { gradeLevel: true, section: true },
            })
          : null;

      return {
        totalUsers,
        totalStudents,
        totalTeachers,
        totalClasses,
        pendingActivities,
        unassignedClasses,
        unassignedSubjects,
        genderRows,
        gradeClasses,
        exampleUnassignedClass,
      };
    }, READ_TX_OPTIONS);

    const gradeCounts = new Map<number, number>();
    for (const c of result.gradeClasses) {
      gradeCounts.set(c.gradeLevel, (gradeCounts.get(c.gradeLevel) ?? 0) + c.students.length);
    }
    const gradeDistribution = [...gradeCounts.entries()]
      .map(([gradeLevel, studentCount]) => ({ gradeLevel, studentCount }))
      .sort((a, b) => a.gradeLevel - b.gradeLevel);

    const genderDistribution = { male: 0, female: 0, other: 0, unspecified: 0 };
    for (const row of result.genderRows) {
      const count = row._count._all;
      if (row.gender === 'MALE') genderDistribution.male = count;
      else if (row.gender === 'FEMALE') genderDistribution.female = count;
      else if (row.gender === 'OTHER') genderDistribution.other = count;
      else genderDistribution.unspecified = count;
    }

    return res.status(200).json({
      totals: {
        totalUsers: result.totalUsers,
        totalStudents: result.totalStudents,
        totalTeachers: result.totalTeachers,
        totalClasses: result.totalClasses,
      },
      attentionRequired: {
        pendingActivities: result.pendingActivities,
        unassignedClasses: result.unassignedClasses,
        unassignedClassExample: result.exampleUnassignedClass
          ? deriveClassName(result.exampleUnassignedClass)
          : null,
        unassignedSubjects: result.unassignedSubjects,
      },
      genderDistribution,
      gradeDistribution,
    });
  } catch (err) {
    console.error('Error building admin dashboard:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
