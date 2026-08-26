import { Response } from 'express';
import { prisma } from '../index';
import { io } from '../index';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { UserRole, WorkOrderStatus } from '@prisma/client';

export const getWorkOrders = async (req: AuthRequest, res: Response) => {
  const { userId, role } = req.user!;
  const { page='1', limit='20', status, priority, category, propertyId, assigneeId } = req.query as Record<string,string>;
  const skip = (parseInt(page)-1)*parseInt(limit);
  const where: any = {};
  if (role===UserRole.TENANT) where.property = { leases:{some:{tenantId:userId,status:'ACTIVE'}} };
  else if (role===UserRole.CONTRACTOR) where.assigneeId = userId;
  else if (role===UserRole.OWNER) where.property = { ownerId: userId };
  else if (role===UserRole.MANAGER) where.property = { managers:{some:{managerId:userId,isActive:true}} };
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (category) where.category = category;
  if (propertyId) where.propertyId = propertyId;
  if (assigneeId) where.assigneeId = assigneeId;
  const [workOrders, total] = await Promise.all([
    prisma.workOrder.findMany({ where, skip, take:parseInt(limit), orderBy:[{priority:'desc'},{createdAt:'desc'}],
      include: { property:{select:{id:true,name:true,address:true,city:true}}, creator:{select:{id:true,firstName:true,lastName:true}}, assignee:{select:{id:true,firstName:true,lastName:true,avatarUrl:true}}, _count:{select:{comments:true,documents:true}} } }),
    prisma.workOrder.count({ where }),
  ]);
  res.json({ status:'success', data: { workOrders, pagination:{page:parseInt(page),limit:parseInt(limit),total,pages:Math.ceil(total/parseInt(limit))} } });
};

export const getWorkOrder = async (req: AuthRequest, res: Response) => {
  const wo = await prisma.workOrder.findUnique({ where:{id:req.params.id}, include: {
    property:{select:{id:true,name:true,address:true,city:true,state:true}}, unit:true,
    creator:{select:{id:true,firstName:true,lastName:true,email:true}},
    assignee:{select:{id:true,firstName:true,lastName:true,email:true,avatarUrl:true}},
    documents:true, comments:{orderBy:{createdAt:'asc'}},
  }});
  if (!wo) throw new AppError(404,'Work order not found');
  res.json({ status:'success', data: { workOrder: wo } });
};

export const createWorkOrder = async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  const { title, description, propertyId, unitId, priority, category, scheduledAt, assigneeId, estimatedCost, dueDate } = req.body;
  if (!title || !description || !propertyId) throw new AppError(400,'title, description, propertyId required');
  const workOrder = await prisma.workOrder.create({ data: { title, description, propertyId, unitId, priority, category, scheduledAt:scheduledAt?new Date(scheduledAt):undefined, assigneeId, estimatedCost:estimatedCost?parseFloat(estimatedCost):undefined, dueDate:dueDate?new Date(dueDate):undefined, creatorId:userId, status:WorkOrderStatus.OPEN },
    include: { property:{select:{id:true,name:true}}, assignee:{select:{id:true,firstName:true,lastName:true}} } });
  io.to(`property:${propertyId}`).emit('work_order:created', workOrder);
  res.status(201).json({ status:'success', data: { workOrder } });
};

export const updateWorkOrder = async (req: AuthRequest, res: Response) => {
  const wo = await prisma.workOrder.findUnique({ where:{id:req.params.id} });
  if (!wo) throw new AppError(404,'Work order not found');
  const updated = await prisma.workOrder.update({ where:{id:req.params.id}, data:req.body });
  io.to(`property:${wo.propertyId}`).emit('work_order:updated', updated);
  res.json({ status:'success', data: { workOrder: updated } });
};

export const deleteWorkOrder = async (req: AuthRequest, res: Response) => {
  await prisma.workOrder.update({ where:{id:req.params.id}, data:{status:WorkOrderStatus.CANCELLED} });
  res.json({ status:'success', message:'Work order cancelled' });
};

export const assignWorkOrder = async (req: AuthRequest, res: Response) => {
  const { assigneeId } = req.body;
  const updated = await prisma.workOrder.update({ where:{id:req.params.id}, data:{assigneeId, status:WorkOrderStatus.ASSIGNED},
    include:{assignee:{select:{id:true,firstName:true,lastName:true}}} });
  io.to(`property:${updated.propertyId}`).emit('work_order:assigned', updated);
  res.json({ status:'success', data: { workOrder: updated } });
};

export const updateWorkOrderStatus = async (req: AuthRequest, res: Response) => {
  const { status, notes, actualCost } = req.body;
  const data: any = { status };
  if (notes) data.notes = notes;
  if (actualCost) data.actualCost = parseFloat(actualCost);
  if (status===WorkOrderStatus.IN_PROGRESS) data.startedAt = new Date();
  if (status===WorkOrderStatus.COMPLETED)   data.completedAt = new Date();
  const updated = await prisma.workOrder.update({ where:{id:req.params.id}, data });
  io.to(`property:${updated.propertyId}`).emit('work_order:status_changed', {id:req.params.id, status});
  res.json({ status:'success', data: { workOrder: updated } });
};

export const getComments = async (req: AuthRequest, res: Response) => {
  const comments = await prisma.workOrderComment.findMany({ where:{workOrderId:req.params.id}, orderBy:{createdAt:'asc'} });
  res.json({ status:'success', data: { comments } });
};

export const addComment = async (req: AuthRequest, res: Response) => {
  const comment = await prisma.workOrderComment.create({ data:{workOrderId:req.params.id, authorId:req.user!.userId, content:req.body.content} });
  const wo = await prisma.workOrder.findUnique({ where:{id:req.params.id}, select:{propertyId:true} });
  if (wo) io.to(`property:${wo.propertyId}`).emit('work_order:comment', comment);
  res.status(201).json({ status:'success', data: { comment } });
};
