import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { verifyToken, requireRole, AuthRequest } from '../middleware/authMiddleware.js';
import { createClassSchema, updateClassSchema, addStudentSchema, assignTeacherSchema } from '../validators/classValidators.js';

const prisma = new PrismaClient();
const router = Router();

router.use(verifyToken);
router.use(requireRole(['ADMINISTRATOR', 'PRINCIPAL']));

router.get('/', async (req: AuthRequest, res) => {
    try {
        const classes = await prisma.class.findMany({
            include: {
                teacher: {
                    include: { user: { select: { email: true } } }
                },
                _count: {
                    select: { students: true }
                }
            }
        });
        return res.status(200).json({ classes });
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

        const { name, teacherId } = parsed.data;

        if (teacherId) {
            const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
            if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
        }

        const newClass = await prisma.class.create({
            data: {
                name,
                teacherId: teacherId ?? null,
            },
            include: { teacher: true }
        });

        return res.status(201).json({ class: newClass });
    } catch (err) {
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

        return res.status(200).json({ class: classData });
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

        const { name, teacherId } = parsed.data;

        const existing = await prisma.class.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Class not found' });

        if (teacherId) {
            const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
            if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
        }

        const updatedClass = await prisma.class.update({
            where: { id },
            data: {
                ...(name !== undefined && { name }),
                ...(teacherId !== undefined && { teacherId })
            },
        });

        return res.status(200).json({ class: updatedClass });
    } catch (err) {
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

        const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
        if (!teacher) return res.status(404).json({ error: 'Teacher not found' });

        const existing = await prisma.class.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Class not found' });

        const updatedClass = await prisma.class.update({
            where: { id },
            data: { teacherId }
        });

        return res.status(200).json({ class: updatedClass });
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

        const student = await prisma.student.findUnique({ where: { id: studentId } });
        if (!student) return res.status(404).json({ error: 'Student not found' });

        const existing = await prisma.class.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Class not found' });

        const updatedClass = await prisma.class.update({
            where: { id },
            data: {
                students: {
                    connect: { id: studentId }
                }
            },
            include: { students: true }
        });

        return res.status(200).json({ class: updatedClass });
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

        const updatedClass = await prisma.class.update({
            where: { id },
            data: {
                students: {
                    disconnect: { id: studentId }
                }
            },
            include: { students: true }
        });

        return res.status(200).json({ class: updatedClass });
    } catch (err) {
        console.error('Error removing student:', err);
        return res.status(500).json({ error: 'Failed to remove student from class' });
    }
});

export default router;
