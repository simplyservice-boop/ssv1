import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const getNotifications = async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  const { isRead, page='1', limit='20' } = req.query as Record<string,string>;
  const skip = (parseInt(page)-1)*parseInt(limit);
  const where: any = { userId };
  if (isRead !== undefined) where.isRead = isRead === 'true';
  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({ where, skip, take:parseInt(limit), orderBy:{createdAt:'desc'} }),
    prisma.notification.count({ where }),
  ]);
  res.json({ status:'success', data:{ notifications, pagination:{page:parseInt(page),limit:parseInt(limit),total,pages:Math.ceil(total/parseInt(limit))} } });
};

export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  const count = await prisma.notification.count({ where:{ userId:req.user!.userId, isRead:false } });
  res.json({ status:'success', data:{ count } });
};

export const markRead = async (req: AuthRequest, res: Response) => {
  const notif = await prisma.notification.findUnique({ where:{id:req.params.id} });
  if (!notif) throw new AppError(404,'Notification not found');
  if (notif.userId !== req.user!.userId) throw new AppError(403,'Forbidden');
  await prisma.notification.update({ where:{id:req.params.id}, data:{ isRead:true } });
  res.json({ status:'success', message:'Marked as read' });
};

export const markAllRead = async (req: AuthRequest, res: Response) => {
  await prisma.notification.updateMany({ where:{ userId:req.user!.userId, isRead:false }, data:{ isRead:true } });
  res.json({ status:'success', message:'All notifications marked as read' });
};

export const deleteNotification = async (req: AuthRequest, res: Response) => {
  const notif = await prisma.notification.findUnique({ where:{id:req.params.id} });
  if (!notif) throw new AppError(404,'Notification not found');
  if (notif.userId !== req.user!.userId) throw new AppError(403,'Forbidden');
  await prisma.notification.delete({ where:{id:req.params.id} });
  res.json({ status:'success', message:'Notification deleted' });
};
