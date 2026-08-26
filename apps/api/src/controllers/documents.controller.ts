import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { storageService } from '../services/storage.service';

export const getDocuments = async (req: AuthRequest, res: Response) => {
  const { propertyId, workOrderId, type, page='1', limit='20' } = req.query as Record<string,string>;
  const skip = (parseInt(page)-1)*parseInt(limit);
  const where: any = {};
  if (propertyId)   where.propertyId   = propertyId;
  if (workOrderId)  where.workOrderId  = workOrderId;
  if (type)         where.type         = type;
  const [documents, total] = await Promise.all([
    prisma.document.findMany({ where, skip, take:parseInt(limit), orderBy:{createdAt:'desc'},
      include:{ uploader:{select:{id:true,firstName:true,lastName:true}} } }),
    prisma.document.count({ where }),
  ]);
  res.json({ status:'success', data:{ documents, pagination:{page:parseInt(page),limit:parseInt(limit),total,pages:Math.ceil(total/parseInt(limit))} } });
};

export const getDocument = async (req: AuthRequest, res: Response) => {
  const doc = await prisma.document.findUnique({ where:{id:req.params.id}, include:{uploader:{select:{id:true,firstName:true,lastName:true}}} });
  if (!doc) throw new AppError(404,'Document not found');
  const signedUrl = await storageService.getSignedDownloadUrl(doc.s3Key);
  res.json({ status:'success', data:{ document:{...doc, downloadUrl:signedUrl} } });
};

export const createDocument = async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  const { name, type, s3Key, url, mimeType, size, propertyId, unitId, leaseId, workOrderId, inspectionId } = req.body;
  if (!name || !s3Key || !url) throw new AppError(400,'name, s3Key, url required');
  const document = await prisma.document.create({ data:{
    name, type, s3Key, url, mimeType, size: size ? Number(size) : 0,
    propertyId, workOrderId, inspectionId, leaseId,
    uploaderId:userId,
  }});
  res.status(201).json({ status:'success', data:{ document } });
};

export const deleteDocument = async (req: AuthRequest, res: Response) => {
  const doc = await prisma.document.findUnique({ where:{id:req.params.id} });
  if (!doc) throw new AppError(404,'Document not found');
  try { await storageService.deleteFile(doc.s3Key); } catch (_) {}
  await prisma.document.delete({ where:{id:req.params.id} });
  res.json({ status:'success', message:'Document deleted' });
};

export const getSignedUploadUrl = async (req: AuthRequest, res: Response) => {
  const { fileName, mimeType, folder='documents' } = req.body;
  if (!fileName || !mimeType) throw new AppError(400,'fileName and mimeType required');
  const result = await storageService.getSignedUploadUrl(fileName, mimeType, folder);
  res.json({ status:'success', data: result });
};
