import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuthRequest extends Request {
  user?: {
    id: number;
    role: string;
  };
}

export const verifyToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const secret = process.env.APP_JWT_SECRET;
  if (!secret) {
    console.error('APP_JWT_SECRET is not set');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  let decoded: { id: number; role: string };
  try {
    decoded = jwt.verify(token, secret) as { id: number; role: string };
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: decoded.id, deletedAt: null } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (err) {
    console.error('verifyToken DB lookup failed:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  req.user = decoded;
  next();
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Normalize role comparison (map admin <-> ADMINISTRATOR)
    const normalizedUserRole =
      req.user.role === 'admin' ? 'ADMINISTRATOR' : req.user.role.toUpperCase();
    const normalizedAllowedRoles = allowedRoles.map((role) =>
      role === 'admin' ? 'ADMINISTRATOR' : role.toUpperCase()
    );

    if (!normalizedAllowedRoles.includes(normalizedUserRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};
