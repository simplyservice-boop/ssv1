import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { hashPassword, comparePassword } from '../utils/bcrypt';

export const getUsers = async (req: AuthRequest, res: Response) => {
  const { role, search } = req.query as Record<string,string>;
  const where: any = {};
  if (role) where.role = role;
  if (search) where.OR = [
    { firstName: { contains: search, mode: 'insensitive' } },
    { lastName:  { contains: search, mode: 'insensitive' } },
    { email:     { contains: search, mode: 'insensitive' } },
  ];
  const users = await prisma.user.findMany({ where, select: { id:true, email:true, firstName:true, lastName:true, phone:true, avatarUrl:true, role:true, isActive:true, isVerified:true, createdAt:true }, orderBy: { createdAt:'desc' } });
  res.json({ status:'success', data: { users } });
};

export const getUser = async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id:true, email:true, firstName:true, lastName:true, phone:true, avatarUrl:true, role:true, isActive:true, isVerified:true, lastLoginAt:true, createdAt:true, contractorProfile:true } });
  if (!user) throw new AppError(404, 'User not found');
  res.json({ status:'success', data: { user } });
};

export const updateUser = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (id !== req.user!.userId && req.user!.role !== 'ADMIN') throw new AppError(403, 'Cannot update another user profile');
  const { firstName, lastName, phone, avatarUrl } = req.body;
  const user = await prisma.user.update({ where: { id }, data: { firstName, lastName, phone, avatarUrl }, select: { id:true, email:true, firstName:true, lastName:true, phone:true, avatarUrl:true, role:true } });
  res.json({ status:'success', data: { user } });
};

export const getCurrentUser = async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { id:true, email:true, firstName:true, lastName:true, phone:true, avatarUrl:true, role:true, isActive:true, isVerified:true, lastLoginAt:true, createdAt:true, contractorProfile:true } });
  if (!user) throw new AppError(404, 'User not found');
  res.json({ status:'success', data: { user } });
};

export const updateCurrentUser = async (req: AuthRequest, res: Response) => {
  req.params.id = req.user!.userId;
  return updateUser(req, res);
};

export const updatePassword = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (id !== req.user!.userId) throw new AppError(403, 'Cannot change another user password');
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) throw new AppError(400, 'Current and new passwords are required');
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(404, 'User not found');
  if (!(await comparePassword(currentPassword, user.passwordHash))) throw new AppError(400, 'Current password is incorrect');
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
  await prisma.refreshToken.deleteMany({ where: { userId: id } });
  res.json({ status:'success', message: 'Password updated successfully' });
};

export const updateCurrentPassword = async (req: AuthRequest, res: Response) => {
  req.params.id = req.user!.userId;
  return updatePassword(req, res);
};

export const deleteUser = async (req: AuthRequest, res: Response) => {
  await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ status:'success', message: 'User deactivated' });
};

export const uploadAvatar = async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { avatarUrl: req.body.avatarUrl } });
  res.json({ status:'success', data: { avatarUrl: user.avatarUrl } });
};
