import { Request, Response } from 'express';
import { prisma } from '../index';
import { hashPassword, comparePassword } from '../utils/bcrypt';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { v4 as uuid } from 'uuid';
import { UserRole } from '@prisma/client';

export const register = async (req: Request, res: Response) => {
  const { email, password, firstName, lastName, phone, role } = req.body;
  if (!email || !password || !firstName || !lastName)
    throw new AppError(400, 'Email, password, first and last name are required');
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError(409, 'Email already registered');
  const allowed: UserRole[] = [
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.TENANT,
    UserRole.CONTRACTOR,
    UserRole.VENDOR,
    UserRole.UTILITY_PROVIDER,
    UserRole.INSURANCE_PARTNER,
    UserRole.FINANCIAL_INSTITUTION,
    UserRole.ENTERPRISE,
    UserRole.MUNICIPAL_PARTNER,
    UserRole.ADMIN,
  ];
  const userRole: UserRole = allowed.includes(role) ? role : UserRole.TENANT;
  const passwordHash = await hashPassword(password);
  const verifyToken = uuid();
  const user = await prisma.user.create({
    data: { email: email.toLowerCase().trim(), passwordHash, firstName: firstName.trim(), lastName: lastName.trim(), phone: phone?.trim(), role: userRole, verifyToken },
    select: { id:true, email:true, firstName:true, lastName:true, role:true, isVerified:true, createdAt:true },
  });
  const accessToken  = signAccessToken({ userId: user.id, email: user.email, role: user.role });
  const refreshToken = signRefreshToken({ userId: user.id, email: user.email, role: user.role });
  await prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 7*24*60*60*1000) } });
  res.status(201).json({ status:'success', data: { user, accessToken, refreshToken } });
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) throw new AppError(400, 'Email and password are required');
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !(await comparePassword(password, user.passwordHash))) throw new AppError(401, 'Invalid email or password');
  if (!user.isActive) throw new AppError(403, 'Account is disabled');
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const accessToken  = signAccessToken({ userId: user.id, email: user.email, role: user.role });
  const refreshToken = signRefreshToken({ userId: user.id, email: user.email, role: user.role });
  await prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 7*24*60*60*1000) } });
  const { passwordHash, verifyToken, resetToken, resetTokenExp, ...safeUser } = user;
  res.json({ status:'success', data: { user: safeUser, accessToken, refreshToken } });
};

export const refreshToken = async (req: Request, res: Response) => {
  const { refreshToken: token } = req.body;
  if (!token) throw new AppError(400, 'Refresh token required');
  const stored = await prisma.refreshToken.findUnique({ where: { token } });
  if (!stored || stored.expiresAt < new Date()) throw new AppError(401, 'Invalid or expired refresh token');
  const payload = verifyRefreshToken(token);
  const accessToken  = signAccessToken({ userId: payload.userId, email: payload.email, role: payload.role });
  const newRefresh   = signRefreshToken({ userId: payload.userId, email: payload.email, role: payload.role });
  await prisma.refreshToken.delete({ where: { token } });
  await prisma.refreshToken.create({ data: { token: newRefresh, userId: payload.userId, expiresAt: new Date(Date.now() + 7*24*60*60*1000) } });
  res.json({ status:'success', data: { accessToken, refreshToken: newRefresh } });
};

export const logout = async (req: AuthRequest, res: Response) => {
  const { refreshToken: token } = req.body;
  if (token) await prisma.refreshToken.deleteMany({ where: { token } });
  res.json({ status:'success', message: 'Logged out' });
};

export const me = async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id:true, email:true, firstName:true, lastName:true, phone:true, avatarUrl:true, role:true, isActive:true, isVerified:true, lastLoginAt:true, createdAt:true, contractorProfile:true },
  });
  if (!user) throw new AppError(404, 'User not found');
  res.json({ status:'success', data: { user } });
};

export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body;
  const user = await prisma.user.findUnique({ where: { email: email?.toLowerCase() } });
  if (user) {
    const resetToken = uuid();
    await prisma.user.update({ where: { id: user.id }, data: { resetToken, resetTokenExp: new Date(Date.now() + 60*60*1000) } });
  }
  res.json({ status:'success', message: 'If that email exists, a reset link has been sent' });
};

export const resetPassword = async (req: Request, res: Response) => {
  const { token, password } = req.body;
  if (!token || !password) throw new AppError(400, 'Token and new password are required');
  const user = await prisma.user.findFirst({ where: { resetToken: token, resetTokenExp: { gte: new Date() } } });
  if (!user) throw new AppError(400, 'Invalid or expired reset token');
  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash, resetToken: null, resetTokenExp: null } });
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  res.json({ status:'success', message: 'Password reset successfully' });
};

export const verifyEmail = async (req: Request, res: Response) => {
  const { token } = req.params;
  const user = await prisma.user.findFirst({ where: { verifyToken: token } });
  if (!user) throw new AppError(400, 'Invalid verification token');
  await prisma.user.update({ where: { id: user.id }, data: { isVerified: true, verifyToken: null } });
  res.json({ status:'success', message: 'Email verified successfully' });
};
