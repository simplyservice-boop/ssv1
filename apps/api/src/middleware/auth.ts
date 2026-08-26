import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../utils/jwt';
import { AppError } from './errorHandler';
import { UserRole } from '@prisma/client';

export interface AuthRequest extends Request { user?: JwtPayload; }

export const authenticate = (req: AuthRequest, _res: Response, next: NextFunction) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return next(new AppError(401, 'No token provided'));
  try { req.user = verifyAccessToken(auth.split(' ')[1]); next(); }
  catch { next(new AppError(401, 'Invalid or expired token')); }
};

export const authorize = (...roles: UserRole[]) => (req: AuthRequest, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new AppError(401, 'Not authenticated'));
  if (!roles.includes(req.user.role as UserRole)) return next(new AppError(403, 'Insufficient permissions'));
  next();
};

export const optionalAuth = (req: AuthRequest, _res: Response, next: NextFunction) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    try { req.user = verifyAccessToken(auth.split(' ')[1]); } catch { /* ignore */ }
  }
  next();
};
