import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../../middleware/authMiddleware.js';

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
