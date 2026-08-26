import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { UserRole } from '@prisma/client';

export const getContractors = async (req: AuthRequest, res: Response) => {
  const { specialty, minRating, search, page='1', limit='20' } = req.query as Record<string,string>;
  const skip = (parseInt(page)-1)*parseInt(limit);
  const where: any = { user:{ role:UserRole.CONTRACTOR, isActive:true } };
  if (specialty) where.specialties = { has: specialty };
  if (minRating) where.rating = { gte: parseFloat(minRating) };
  if (search) where.user = { ...where.user, OR:[
    { firstName:{ contains:search, mode:'insensitive' } },
    { lastName: { contains:search, mode:'insensitive' } },
  ]};
  const [contractors, total] = await Promise.all([
    prisma.contractorProfile.findMany({ where, skip, take:parseInt(limit), orderBy:{rating:'desc'},
      include:{ user:{select:{id:true,firstName:true,lastName:true,email:true,phone:true,avatarUrl:true}} } }),
    prisma.contractorProfile.count({ where }),
  ]);
  res.json({ status:'success', data:{ contractors, pagination:{page:parseInt(page),limit:parseInt(limit),total,pages:Math.ceil(total/parseInt(limit))} } });
};

export const getContractor = async (req: AuthRequest, res: Response) => {
  const contractor = await prisma.contractorProfile.findUnique({ where:{id:req.params.id},
    include:{ user:{select:{id:true,firstName:true,lastName:true,email:true,phone:true,avatarUrl:true}} } });
  if (!contractor) throw new AppError(404,'Contractor not found');
  res.json({ status:'success', data:{ contractor } });
};

export const getContractorByUser = async (req: AuthRequest, res: Response) => {
  const contractor = await prisma.contractorProfile.findUnique({ where:{ userId:req.user!.userId },
    include:{ user:{select:{id:true,firstName:true,lastName:true,email:true,phone:true,avatarUrl:true}} } });
  if (!contractor) throw new AppError(404,'Contractor profile not found');
  res.json({ status:'success', data:{ contractor } });
};

export const updateContractorProfile = async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  const { companyName, licenseNumber, insurancePolicy, specialties, hourlyRate, bio, serviceRadius } = req.body;
  const contractor = await prisma.contractorProfile.upsert({
    where:{ userId },
    create:{ userId, companyName, licenseNumber, insurancePolicy, specialties, hourlyRate, bio, serviceRadius },
    update:{ companyName, licenseNumber, insurancePolicy, specialties, hourlyRate, bio, serviceRadius },
    include:{ user:{select:{id:true,firstName:true,lastName:true,email:true}} },
  });
  res.json({ status:'success', data:{ contractor } });
};

export const getContractorWorkOrders = async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  const { status, page='1', limit='20' } = req.query as Record<string,string>;
  const skip = (parseInt(page)-1)*parseInt(limit);
  const where: any = { assigneeId: userId };
  if (status) where.status = status;
  const [workOrders, total] = await Promise.all([
    prisma.workOrder.findMany({ where, skip, take:parseInt(limit), orderBy:{createdAt:'desc'},
      include:{ property:{select:{id:true,name:true,address:true,city:true}} } }),
    prisma.workOrder.count({ where }),
  ]);
  res.json({ status:'success', data:{ workOrders, pagination:{page:parseInt(page),limit:parseInt(limit),total,pages:Math.ceil(total/parseInt(limit))} } });
};
