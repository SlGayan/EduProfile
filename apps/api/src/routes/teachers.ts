import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { verifyToken, requireRole, AuthRequest } from '../middleware/authMiddleware.js';

const prisma = new PrismaClient();
const router = Router();

router.use(verifyToken);

router.get('/', requireRole(['ADMINISTRATOR', 'PRINCIPAL']), async (req: AuthRequest, res) => {
  try {
    const teachers = await prisma.teacher.findMany({
      where: { user: { deletedAt: null } },
      select: { id: true, user: { select: { email: true } } },
    });

    return res.status(200).json({ teachers });
  } catch (err) {
    console.error('Error fetching teachers:', err);
    return res.status(500).json({ error: 'Failed to fetch teachers' });
  }
});

export default router;
