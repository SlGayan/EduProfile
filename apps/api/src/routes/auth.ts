import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';

const prisma = new PrismaClient();
const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Basic rate limiter to mitigate brute force attacks
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

router.post('/login', limiter, async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }

  let { email, password } = parsed.data;

  // normalize email for lookup
  email = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const secret = process.env.APP_JWT_SECRET;
    if (!secret) {
      console.error('APP_JWT_SECRET is not set');
      return res.status(500).json({ error: 'Server misconfiguration' });
    }

    // normalize role string to be consistent with frontend (lowercase, map ADMINISTRATOR->admin)
    const rawRole = (user.role as unknown as string) || '';
    const normalizedRole = rawRole === 'ADMINISTRATOR' ? 'admin' : rawRole.toLowerCase();

    const signOptions = { expiresIn: process.env.JWT_EXPIRES_IN || '15m' } as unknown as SignOptions;
    const token = jwt.sign({ id: user.id, role: normalizedRole }, secret as Secret, signOptions);

    return res.status(200).json({ token, user: { id: user.id, email: user.email, role: normalizedRole } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
