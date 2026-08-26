import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { logger } from '../utils/logger';

export class AppError extends Error {
  constructor(public statusCode: number, message: string, public isOperational = true) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error(`${req.method} ${req.path} — ${err.message}`, { stack: err.stack });
  if (err instanceof AppError) return res.status(err.statusCode).json({ status: 'error', message: err.message });
  if (err instanceof TokenExpiredError) return res.status(401).json({ status: 'error', message: 'Token expired' });
  if (err instanceof JsonWebTokenError) return res.status(401).json({ status: 'error', message: 'Invalid token' });
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ status: 'error', message: 'A record with that value already exists' });
    if (err.code === 'P2025') return res.status(404).json({ status: 'error', message: 'Record not found' });
  }
  if (err instanceof Prisma.PrismaClientValidationError)
    return res.status(400).json({ status: 'error', message: 'Invalid data provided' });
  const message = process.env.NODE_ENV === 'development' ? err.message : 'Internal server error';
  return res.status(500).json({ status: 'error', message });
};

export const notFound = (req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(404, `Route ${req.originalUrl} not found`));
};
