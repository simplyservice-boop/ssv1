import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { UserRole } from '@prisma/client';
import { aiService } from '../services/ai.service';

export const getProperties = async (req: AuthRequest, res: Response) => {
  const { role, userId } = req.user!;
  const { page='1', limit='20', status, type, city, state, search } = req.query as Record<string,string>;
  const skip = (parseInt(page)-1)*parseInt(limit);
  const where: any = {};
  if (role===UserRole.OWNER) where.ownerId = userId;
  else if (role===UserRole.MANAGER) where.managers = { some: { managerId: userId, isActive: true } };
  else if (role===UserRole.TENANT) where.leases = { some: { tenantId: userId, status: 'ACTIVE' } };
  else if (role===UserRole.CONTRACTOR) where.workOrders = { some: { assigneeId: userId } };
  if (status) where.status = status;
  if (type)   where.type   = type;
  if (city)   where.city   = { contains: city,   mode: 'insensitive' };
  if (state)  where.state  = state;
  if (search) where.OR = [
    { name:    { contains: search, mode: 'insensitive' } },
    { address: { contains: search, mode: 'insensitive' } },
    { city:    { contains: search, mode: 'insensitive' } },
  ];
  const [properties, total] = await Promise.all([
    prisma.property.findMany({ where, skip, take: parseInt(limit), orderBy: { createdAt:'desc' },
      include: { owner: { select:{id:true,firstName:true,lastName:true,email:true} }, _count: { select:{workOrders:true,units_rel:true,leases:true} } } }),
    prisma.property.count({ where }),
  ]);
  res.json({ status:'success', data: { properties, pagination: { page:parseInt(page), limit:parseInt(limit), total, pages:Math.ceil(total/parseInt(limit)) } } });
};

export const getMapProperties = async (req: AuthRequest, res: Response) => {
  const { role, userId } = req.user!;
  const where: any = { latitude: { not: null }, longitude: { not: null } };
  if (role===UserRole.OWNER) where.ownerId = userId;
  else if (role===UserRole.MANAGER) where.managers = { some: { managerId: userId, isActive: true } };
  const properties = await prisma.property.findMany({ where, select: { id:true,name:true,address:true,city:true,state:true,latitude:true,longitude:true,status:true,type:true,coverImageUrl:true,aiSummary:true, _count:{select:{workOrders:true}} } });
  res.json({ status:'success', data: { properties } });
};

export const getAllLeases = async (req: AuthRequest, res: Response) => {
  const { userId, role } = req.user!;
  const where: any = {};

  if (role === UserRole.OWNER) {
    where.property = { ownerId: userId };
  } else if (role === UserRole.MANAGER) {
    where.property = { managers: { some: { managerId: userId, isActive: true } } };
  } else if (role === UserRole.TENANT) {
    where.tenantId = userId;
  }

  const leases = await prisma.lease.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      property: { select: { id: true, name: true, address: true, city: true, state: true } },
      unit: { select: { id: true, unitNumber: true } },
      tenant: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  res.json({ status: 'success', data: { leases } });
};

export const getProperty = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const property = await prisma.property.findUnique({ where:{id}, include: {
    owner: { select:{id:true,firstName:true,lastName:true,email:true,phone:true} },
    managers: { include:{manager:{select:{id:true,firstName:true,lastName:true,email:true}}} },
    units_rel: true,
    leases: { where:{status:{in:['ACTIVE','PENDING_RENEWAL']}}, include:{tenant:{select:{id:true,firstName:true,lastName:true,email:true}}} },
    documents: { take:10, orderBy:{createdAt:'desc'} },
    photos: { orderBy:{order:'asc'} },
    _count: { select:{workOrders:true,inspections:true,transactions:true} },
  }});
  if (!property) throw new AppError(404,'Property not found');
  res.json({ status:'success', data: { property } });
};

export const createProperty = async (req: AuthRequest, res: Response) => {
  const property = await prisma.property.create({ data: { ...req.body, ownerId: req.user!.userId } });
  res.status(201).json({ status:'success', data: { property } });
};

export const updateProperty = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const prop = await prisma.property.findUnique({ where:{id} });
  if (!prop) throw new AppError(404,'Property not found');
  const updated = await prisma.property.update({ where:{id}, data: req.body });
  res.json({ status:'success', data: { property: updated } });
};

export const deleteProperty = async (req: AuthRequest, res: Response) => {
  await prisma.property.update({ where:{id:req.params.id}, data:{status:'ARCHIVED'} });
  res.json({ status:'success', message:'Property archived' });
};

export const getPropertyStats = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const [woStats, txStats, occupancy] = await Promise.all([
    prisma.workOrder.groupBy({ by:['status'], where:{propertyId:id}, _count:{id:true} }),
    prisma.transaction.aggregate({ where:{propertyId:id,status:'COMPLETED'}, _sum:{amount:true}, _count:{id:true} }),
    prisma.lease.count({ where:{propertyId:id,status:'ACTIVE'} }),
  ]);
  res.json({ status:'success', data: { workOrders:woStats, revenue:txStats._sum.amount??0, transactionCount:txStats._count.id, activeLeases:occupancy } });
};

export const addPropertyManager = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { managerId } = req.body;
  const mgr = await prisma.propertyManager.upsert({ where:{propertyId_managerId:{propertyId:id,managerId}}, update:{isActive:true}, create:{propertyId:id,managerId} });
  res.json({ status:'success', data: { manager: mgr } });
};

export const removePropertyManager = async (req: AuthRequest, res: Response) => {
  const { id, managerId } = req.params;
  await prisma.propertyManager.updateMany({ where:{propertyId:id,managerId}, data:{isActive:false} });
  res.json({ status:'success', message:'Manager removed' });
};

export const getPropertyUnits = async (req: AuthRequest, res: Response) => {
  const units = await prisma.unit.findMany({ where:{propertyId:req.params.id}, include:{leases:{where:{status:'ACTIVE'},include:{tenant:{select:{id:true,firstName:true,lastName:true}}}}} });
  res.json({ status:'success', data: { units } });
};

export const createUnit = async (req: AuthRequest, res: Response) => {
  const unit = await prisma.unit.create({ data:{...req.body, propertyId:req.params.id} });
  res.status(201).json({ status:'success', data: { unit } });
};

export const updateUnit = async (req: AuthRequest, res: Response) => {
  const unit = await prisma.unit.update({ where:{id:req.params.unitId}, data:req.body });
  res.json({ status:'success', data: { unit } });
};

export const generatePropertySummary = async (req: AuthRequest, res: Response) => {
  const property = await prisma.property.findUnique({ where:{id:req.params.id}, include:{_count:{select:{workOrders:true,leases:true,inspections:true}}} });
  if (!property) throw new AppError(404,'Property not found');
  const summary = await aiService.generatePropertySummary(property as any);
  await prisma.property.update({ where:{id:req.params.id}, data:{aiSummary:summary, aiSummaryAt:new Date()} });
  res.json({ status:'success', data: { summary } });
};
