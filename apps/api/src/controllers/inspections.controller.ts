import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { InspectionStatus } from '@prisma/client';

export const getInspections = async (req: AuthRequest, res: Response) => {
  const { propertyId, status, startDate, endDate, page='1', limit='20' } = req.query as Record<string,string>;
  const skip = (parseInt(page)-1)*parseInt(limit);
  const where: any = {};
  if (propertyId) where.propertyId = propertyId;
  if (status)     where.status = status;
  if (startDate || endDate) {
    where.scheduledAt = {};
    if (startDate) where.scheduledAt.gte = new Date(startDate);
    if (endDate)   where.scheduledAt.lte = new Date(endDate);
  }
  const [inspections, total] = await Promise.all([
    prisma.inspection.findMany({ where, skip, take:parseInt(limit), orderBy:{scheduledAt:'desc'},
      include:{ property:{select:{id:true,name:true}}, creator:{select:{id:true,firstName:true,lastName:true}} } }),
    prisma.inspection.count({ where }),
  ]);
  res.json({ status:'success', data:{ inspections, pagination:{page:parseInt(page),limit:parseInt(limit),total,pages:Math.ceil(total/parseInt(limit))} } });
};

export const getInspection = async (req: AuthRequest, res: Response) => {
  const inspection = await prisma.inspection.findUnique({ where:{id:req.params.id}, include:{
    property:{select:{id:true,name:true,address:true}},
    creator:{select:{id:true,firstName:true,lastName:true}},
    items: true, documents:true,
  }});
  if (!inspection) throw new AppError(404,'Inspection not found');
  res.json({ status:'success', data:{ inspection } });
};

export const createInspection = async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  const { propertyId, type, scheduledAt, notes, items } = req.body;
  const inspection = await prisma.inspection.create({ data:{
    propertyId,
    type,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
    notes,
    creatorId: userId,
    status: InspectionStatus.SCHEDULED,
    items: items?.length ? { create: items.map((item: any, index: number) => ({
      area: item.area,
      item: item.item,
      condition: item.condition,
      notes: item.notes,
      photoUrls: item.photoUrls || [],
      inspection: undefined,
    })) } : undefined,
  }, include:{ items:true } });
  res.status(201).json({ status:'success', data:{ inspection } });
};

export const updateInspection = async (req: AuthRequest, res: Response) => {
  const { items, ...rest } = req.body;
  const { scheduledDate, ...safeRest } = rest;
  const inspection = await prisma.inspection.update({ where:{id:req.params.id}, data:{
    ...safeRest,
    scheduledAt: scheduledDate ? new Date(scheduledDate) : undefined,
  }, include:{items:true} });
  res.json({ status:'success', data:{ inspection } });
};

export const completeInspection = async (req: AuthRequest, res: Response) => {
  const { overallScore, notes, findings } = req.body;
  const inspection = await prisma.inspection.update({ where:{id:req.params.id}, data:{
    status:InspectionStatus.COMPLETED, overallScore, notes, findings,
    completedAt: new Date(),
  }});
  res.json({ status:'success', data:{ inspection } });
};

export const deleteInspection = async (req: AuthRequest, res: Response) => {
  await prisma.inspection.update({ where:{id:req.params.id}, data:{status:InspectionStatus.CANCELLED} });
  res.json({ status:'success', message:'Inspection cancelled' });
};
