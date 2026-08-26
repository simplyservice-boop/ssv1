import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { aiService } from '../services/ai.service';

export const chatWithAssistant = async (req: AuthRequest, res: Response) => {
  const { messages, message, history, context } = req.body;
  const normalizedMessages = Array.isArray(messages) && messages.length
    ? messages
    : [
        ...(Array.isArray(history) ? history : []),
        ...(message ? [{ role: 'user', content: String(message) }] : []),
      ];
  if (!normalizedMessages.length) throw new AppError(400,'Message content required');
  const response = await aiService.chat(normalizedMessages, context);
  res.json({ status:'success', data:{ response } });
};

export const summarizeDocument = async (req: AuthRequest, res: Response) => {
  const { documentId, text } = req.body;
  let content = text;
  if (documentId && !content) {
    const doc = await prisma.document.findUnique({ where:{id:documentId} });
    if (!doc) throw new AppError(404,'Document not found');
    content = `Document: ${doc.name} (${doc.type})`;
  }
  if (!content) throw new AppError(400,'Document ID or text required');
  const summary = await aiService.summarize(content);
  res.json({ status:'success', data:{ summary } });
};

export const generateWorkOrderSuggestion = async (req: AuthRequest, res: Response) => {
  const { description, propertyId } = req.body;
  if (!description) throw new AppError(400,'Description required');
  let propertyContext: any;
  if (propertyId) propertyContext = await prisma.property.findUnique({ where:{id:propertyId}, select:{name:true,type:true,city:true} });
  const suggestion = await aiService.suggestWorkOrder(description, propertyContext);
  res.json({ status:'success', data:{ suggestion } });
};

export const matchContractors = async (req: AuthRequest, res: Response) => {
  const { workOrderId } = req.body;
  if (!workOrderId) throw new AppError(400,'workOrderId required');
  const workOrder = await prisma.workOrder.findUnique({ where:{id:workOrderId}, include:{property:{select:{city:true,state:true}}} });
  if (!workOrder) throw new AppError(404,'Work order not found');
  const contractors = await prisma.contractorProfile.findMany({ where:{ specialties:{ has: workOrder.category } },
    include:{ user:{select:{id:true,firstName:true,lastName:true}} }, take:10 });
  const matches = await aiService.matchContractors(workOrder as any, contractors as any);
  res.json({ status:'success', data:{ matches } });
};

export const generatePortfolioReport = async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  const properties = await prisma.property.findMany({ where:{ ownerId:userId }, include:{ _count:{select:{workOrders:true,leases:true}} } });
  const transactions = await prisma.transaction.findMany({ where:{ property:{ownerId:userId}, status:'COMPLETED' }, select:{type:true,amount:true,createdAt:true} });
  const report = await aiService.generatePortfolioReport(properties as any, transactions as any);
  res.json({ status:'success', data:{ report } });
};
