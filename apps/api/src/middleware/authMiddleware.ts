import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    role: string;
  };
}

export const verifyToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const secret = process.env.APP_JWT_SECRET;
    if (!secret) {
      console.error('APP_JWT_SECRET is not set');
      return res.status(500).json({ error: 'Server misconfiguration' });
    }

    const decoded = jwt.verify(token, secret) as { id: number; role: string };
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
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
