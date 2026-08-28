import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { verifyToken, requireRole, AuthRequest } from '../middleware/authMiddleware.js';
import { createClassSchema, updateClassSchema, addStudentSchema, assignTeacherSchema } from '../validators/classValidators.js';
import { listAssignmentsForClass } from '../modules/teacherSubjectAssignments/teacherSubjectAssignments.controller.js';
import { deriveClassName, withClassName } from '../lib/classIdentity.js';

const prisma = new PrismaClient();
const router = Router();

// Story 13.1 — the identity triple is unique, so a create/update that would
// duplicate it comes back from Prisma as P2002. Mapped to 409 rather than the
// generic 500; the existing row is left untouched either way.
function isUniqueIdentityViolation(err: unknown): boolean {
    return (
        typeof err === 'object' &&
        err !== null &&
        (err as { code?: string }).code === 'P2002'
    );
}

router.use(verifyToken);
router.use(requireRole(['ADMINISTRATOR', 'PRINCIPAL']));

router.get('/', async (req: AuthRequest, res) => {
    try {
        const classes = await prisma.class.findMany({
            include: {
                teacher: {
                    include: { user: { select: { email: true } } }
                },
                students: {
                    select: { id: true }
                },
                _count: {
                    select: { students: true }
                }
            }
        });
        return res.status(200).json({ classes: classes.map(withClassName) });
    } catch (err) {
        console.error('Error fetching classes:', err);
        return res.status(500).json({ error: 'Failed to fetch classes' });
    }
});

router.post('/', async (req: AuthRequest, res) => {
    try {
        const parsed = createClassSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
        }

        const { gradeLevel, section, year, teacherId } = parsed.data;

        if (teacherId) {
            const teacher = await prisma.teacher.findUnique({ where: { id: teacherId, user: { deletedAt: null } } });
            if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
        }

        const duplicate = await prisma.class.findUnique({
            where: { gradeLevel_section_year: { gradeLevel, section, year } }
        });
        if (duplicate) {
            return res.status(409).json({
                error: `Class "${deriveClassName(duplicate)}" already exists for ${year}`
            });
        }

        const newClass = await prisma.class.create({
            data: {
                gradeLevel,
                section,
                year,
                teacherId: teacherId ?? null,
            },
            include: { teacher: true }
        });

        return res.status(201).json({ class: withClassName(newClass) });
    } catch (err) {
        if (isUniqueIdentityViolation(err)) {
            return res.status(409).json({ error: 'A class with that grade, section and year already exists' });
        }
        console.error('Error creating class:', err);
        return res.status(500).json({ error: 'Failed to create class' });
    }
});

router.get('/:id', async (req: AuthRequest, res) => {
    try {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid class ID' });

        const classData = await prisma.class.findUnique({
            where: { id },
            include: {
                teacher: { include: { user: { select: { email: true } } } },
                students: { include: { user: { select: { email: true } } } }
            }
        });

        if (!classData) return res.status(404).json({ error: 'Class not found' });

        return res.status(200).json({ class: withClassName(classData) });
    } catch (err) {
        console.error('Error fetching class:', err);
        return res.status(500).json({ error: 'Failed to fetch class' });
    }
});

router.put('/:id', async (req: AuthRequest, res) => {
    try {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid class ID' });

        const parsed = updateClassSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
        }

        const { gradeLevel, section, year, teacherId } = parsed.data;

        const existing = await prisma.class.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Class not found' });

        if (teacherId) {
            const teacher = await prisma.teacher.findUnique({ where: { id: teacherId, user: { deletedAt: null } } });
            if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
        }

        const nextIdentity = {
            gradeLevel: gradeLevel ?? existing.gradeLevel,
            section: section ?? existing.section,
            year: year ?? existing.year,
        };
        const duplicate = await prisma.class.findUnique({
            where: { gradeLevel_section_year: nextIdentity }
        });
        if (duplicate && duplicate.id !== id) {
            return res.status(409).json({
                error: `Class "${deriveClassName(duplicate)}" already exists for ${nextIdentity.year}`
            });
        }

        const updatedClass = await prisma.class.update({
            where: { id },
            data: {
                ...(gradeLevel !== undefined && { gradeLevel }),
                ...(section !== undefined && { section }),
                ...(year !== undefined && { year }),
                ...(teacherId !== undefined && { teacherId })
            },
        });

        return res.status(200).json({ class: withClassName(updatedClass) });
    } catch (err) {
        if (isUniqueIdentityViolation(err)) {
            return res.status(409).json({ error: 'A class with that grade, section and year already exists' });
        }
        console.error('Error updating class:', err);
        return res.status(500).json({ error: 'Failed to update class' });
    }
});

router.delete('/:id', async (req: AuthRequest, res) => {
    try {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid class ID' });

        const existing = await prisma.class.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Class not found' });

        await prisma.class.delete({ where: { id } });

        return res.status(200).json({ message: 'Class successfully deleted' });
    } catch (err) {
        if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2003') {
            return res.status(409).json({ error: 'Cannot delete class with active subject-teaching assignments' });
        }
        console.error('Error deleting class:', err);
        return res.status(500).json({ error: 'Failed to delete class' });
    }
});

router.post('/:id/teacher', async (req: AuthRequest, res) => {
    try {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid class ID' });

        const parsed = assignTeacherSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });

        const { teacherId } = parsed.data;

        const teacher = await prisma.teacher.findUnique({ where: { id: teacherId, user: { deletedAt: null } } });
        if (!teacher) return res.status(404).json({ error: 'Teacher not found' });

        const existing = await prisma.class.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Class not found' });

        const updatedClass = await prisma.class.update({
            where: { id },
            data: { teacherId }
        });

        return res.status(200).json({ class: withClassName(updatedClass) });
    } catch (err) {
        console.error('Error assigning teacher:', err);
        return res.status(500).json({ error: 'Failed to assign teacher' });
    }
});

router.post('/:id/students', async (req: AuthRequest, res) => {
    try {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid class ID' });

        const parsed = addStudentSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });

        const { studentId } = parsed.data;

        const student = await prisma.student.findUnique({ where: { id: studentId, user: { deletedAt: null } } });
        if (!student) return res.status(404).json({ error: 'Student not found' });

        const existing = await prisma.class.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Class not found' });

        // A student may sit in only one class per academic year. Before Story
        // 13.1 this guard was wrapped in `if (existing.year !== null)`, which
        // silently disabled it for year-less classes; `year` is required now,
        // so the guard runs unconditionally. Behaviour is otherwise unchanged.
        const conflict = await prisma.class.findFirst({
            where: {
                id: { not: id },
                year: existing.year,
                students: { some: { id: studentId } }
            }
        });
        if (conflict) {
            return res.status(409).json({
                error: `Student is already enrolled in "${deriveClassName(conflict)}" for ${existing.year}`
            });
        }

        // Story 13.2 (AD-1 Phase 1): keep Enrollment in sync with the implicit
        // relation. enrolledAt = Jan 1 of class year (AD-10). Both writes run
        // in a transaction so the two representations never diverge.
        // Date.UTC is used so the stored value is midnight UTC, matching the
        // make_date output in the backfill migration (PostgreSQL TIMESTAMP
        // without timezone, treated as UTC by Prisma).
        const enrolledAt = new Date(Date.UTC(existing.year, 0, 1)); // Jan 1 UTC
        const updatedClass = await prisma.$transaction(async (tx) => {
            const cls = await tx.class.update({
                where: { id },
                data: {
                    students: {
                        connect: { id: studentId }
                    }
                },
                include: { students: true }
            });
            await tx.enrollment.create({
                data: { studentId, classId: id, enrolledAt, status: 'ACTIVE' }
            });
            return cls;
        });

        return res.status(200).json({ class: withClassName(updatedClass) });
    } catch (err) {
        console.error('Error adding student:', err);
        return res.status(500).json({ error: 'Failed to add student to class' });
    }
});

router.delete('/:id/students/:studentId', async (req: AuthRequest, res) => {
    try {
        const id = parseInt(req.params.id as string, 10);
        const studentId = parseInt(req.params.studentId as string, 10);
        if (isNaN(id) || isNaN(studentId)) return res.status(400).json({ error: 'Invalid ID' });

        const existing = await prisma.class.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Class not found' });

        // Story 13.2 (AD-1 Phase 1 / AD-3): close the open Enrollment row rather
        // than deleting it. Both writes run in a transaction so the implicit
        // relation and Enrollment stay consistent. A missing Enrollment row is
        // a warning, not an error — the implicit disconnect still proceeds.
        const updatedClass = await prisma.$transaction(async (tx) => {
            const closed = await tx.enrollment.updateMany({
                where: { studentId, classId: id, leftAt: null },
                data: { leftAt: new Date(), status: 'LEFT' },
            });
            if (closed.count === 0) {
                console.warn(
                    `[classes] unenrol: no open Enrollment found for student ${studentId} in class ${id} — ` +
                    'implicit relation will still be disconnected'
                );
            }
            return tx.class.update({
                where: { id },
                data: {
                    students: {
                        disconnect: { id: studentId }
                    }
                },
                include: { students: true }
            });
        });

        return res.status(200).json({ class: withClassName(updatedClass) });
    } catch (err) {
        console.error('Error removing student:', err);
        return res.status(500).json({ error: 'Failed to remove student from class' });
    }
});

router.get('/:id/subject-assignments', listAssignmentsForClass);

export default router;
