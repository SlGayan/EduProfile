import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    role: string;
  };
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Authentication token is required' });
  }

  const secret = process.env.APP_JWT_SECRET;
  if (!secret) {
    console.error('APP_JWT_SECRET is not set');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  jwt.verify(token, secret, (err, decoded: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    
    req.user = {
      id: decoded.id,
      role: decoded.role
    };
    next();
  });
};

export const requireRole = (requiredRole: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (req.user.role !== requiredRole.toLowerCase()) {
      return res.status(403).json({ error: `Access forbidden: Requires ${requiredRole} role` });
    }

    next();
  };
};
