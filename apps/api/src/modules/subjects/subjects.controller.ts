import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../../middleware/authMiddleware.js';
import { createSubjectSchema } from '../../validators/subjectValidators.js';

const prisma = new PrismaClient();

export const listSubjects = async (_req: AuthRequest, res: Response) => {
  try {
    const subjects = await prisma.subject.findMany({ orderBy: { name: 'asc' } });
    return res.status(200).json(subjects.map((s) => ({ id: String(s.id), name: s.name })));
  } catch (err) {
    console.error('Error listing subjects:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createSubject = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createSubjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }

    const existing = await prisma.subject.findUnique({ where: { name: parsed.data.name } });
    if (existing) {
      return res.status(409).json({ error: 'A subject with that name already exists' });
    }

    const subject = await prisma.subject.create({ data: { name: parsed.data.name } });
    return res.status(201).json({ id: String(subject.id), name: subject.name });
  } catch (err) {
    console.error('Error creating subject:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
