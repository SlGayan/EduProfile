import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { verifyToken, type AuthRequest } from '../middleware/authMiddleware.js';

const prisma = new PrismaClient();
const router = Router();

const loginSchema = z.object({
  email: z.string().email().endsWith("@edu.com", "Login is restricted to @edu.com emails"),
  password: z.string().min(1),
});

// Basic rate limiter to mitigate brute force attacks
const limiter = rateLimit({
  windowMs: 3 * 60 * 1000, // 5 minutes
  max: 20, // limit each IP to 20 requests per windowMs
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

    const user = await prisma.user.findUnique({ where: { email, deletedAt: null } });
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

    // Read the expiry back off the token we just signed (its `exp` claim, in
    // seconds since epoch) rather than parsing the JWT_EXPIRES_IN string — this
    // stays accurate regardless of what that env var is set to.
    const decoded = jwt.decode(token);
    if (!decoded || typeof decoded === 'string' || typeof decoded.exp !== 'number') {
      console.error('Failed to decode freshly-signed JWT');
      return res.status(500).json({ error: 'Internal server error' });
    }
    const tokenExpiry = decoded.exp * 1000;

    return res.status(200).json({
      token,
      tokenExpiry,
      user: { id: user.id, email: user.email, role: normalizedRole, mustChangePassword: user.mustChangePassword },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const registerSchema = z.object({
  email: z.string().email().endsWith("@edu.com", "Registration is restricted to @edu.com emails"),
  password: z.string().min(6),
  role: z.literal('STUDENT').optional().default('STUDENT'),
});

router.post('/register', limiter, async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }

    let { email, password, role } = parsed.data;
    email = email.trim().toLowerCase();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: role as import("@prisma/client").UserRole,
      },
    });

    const rawRole = (user.role as unknown as string) || '';
    const normalizedRole = rawRole === 'ADMINISTRATOR' ? 'admin' : rawRole.toLowerCase();

    return res.status(201).json({ user: { id: user.id, email: user.email, role: normalizedRole } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const changePasswordSchema = z.object({
  newPassword: z
    .string()
    .min(6)
    .regex(/^(?=.*[A-Za-z])(?=.*\d)/, 'Password must contain at least one letter and one number'),
});

router.post('/change-password', verifyToken, async (req: AuthRequest, res) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }

    const { newPassword } = parsed.data;
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { password: hashedPassword, mustChangePassword: false },
    });

    return res.status(200).json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
