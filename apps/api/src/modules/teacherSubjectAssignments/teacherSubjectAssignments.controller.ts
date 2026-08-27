import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../../middleware/authMiddleware.js';
import { createAssignmentSchema } from '../../validators/teacherSubjectAssignmentValidators.js';

const prisma = new PrismaClient();

// Advisory soft cap on concurrent subject-teaching assignments per teacher.
// Never blocks creation — surfaced only as a `warning` field in the 201 body.
const ASSIGNMENT_SOFT_CAP = 3;

// POST /api/teacher-subject-assignments
export const createAssignment = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = createAssignmentSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
        }

        const { teacherId, subjectId, classId } = parsed.data;

        const teacher = await prisma.teacher.findUnique({ where: { id: teacherId, user: { deletedAt: null } } });
        if (!teacher) return res.status(404).json({ error: 'Teacher not found' });

        const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
        if (!subject) return res.status(404).json({ error: 'Subject not found' });

        const classRecord = await prisma.class.findUnique({ where: { id: classId } });
        if (!classRecord) return res.status(404).json({ error: 'Class not found' });

        const existing = await prisma.teacherSubjectAssignment.findUnique({
            where: { teacherId_subjectId_classId: { teacherId, subjectId, classId } },
        });
        if (existing) return res.status(409).json({ error: 'Assignment already exists' });

        // Ownership (Class.teacherId) and subject assignment coexist harmlessly —
        // deliberately no guard here against the teacher already owning the class.
        const existingCount = await prisma.teacherSubjectAssignment.count({ where: { teacherId } });

        const assignment = await prisma.teacherSubjectAssignment.create({
            data: { teacherId, subjectId, classId },
        });

        const body: Record<string, unknown> = { assignment };
        if (existingCount + 1 > ASSIGNMENT_SOFT_CAP) {
            body.warning = `Teacher now has ${existingCount + 1} concurrent subject assignments, exceeding the advisory cap of ${ASSIGNMENT_SOFT_CAP}.`;
        }

        return res.status(201).json(body);
    } catch (err) {
        if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') {
            return res.status(409).json({ error: 'Assignment already exists' });
        }
        console.error('Error creating teacher subject assignment:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// DELETE /api/teacher-subject-assignments/:id
export const deleteAssignment = async (req: AuthRequest, res: Response) => {
    try {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid assignment ID' });

        const existing = await prisma.teacherSubjectAssignment.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Assignment not found' });

        await prisma.teacherSubjectAssignment.delete({ where: { id } });

        return res.status(200).json({ message: 'Assignment successfully deleted' });
    } catch (err) {
        if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2025') {
            return res.status(404).json({ error: 'Assignment not found' });
        }
        console.error('Error deleting teacher subject assignment:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// GET /api/classes/:id/subject-assignments
export const listAssignmentsForClass = async (req: AuthRequest, res: Response) => {
    try {
        const classId = parseInt(req.params.id as string, 10);
        if (isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID' });

        const classRecord = await prisma.class.findUnique({ where: { id: classId } });
        if (!classRecord) return res.status(404).json({ error: 'Class not found' });

        const assignments = await prisma.teacherSubjectAssignment.findMany({
            where: { classId },
            include: {
                teacher: { include: { user: { select: { email: true } } } },
                subject: true,
            },
            orderBy: { id: 'asc' },
        });

        return res.status(200).json({ assignments });
    } catch (err) {
        console.error('Error listing subject assignments for class:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
