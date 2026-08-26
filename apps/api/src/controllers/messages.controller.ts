import { Response } from 'express';
import { prisma } from '../index';
import { io } from '../index';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const getConversations = async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  const conversations = await prisma.conversation.findMany({
    where: { participants:{some:{userId}} },
    include: {
      participants:{ include:{user:{select:{id:true,firstName:true,lastName:true,avatarUrl:true}}} },
      messages:{ orderBy:{createdAt:'desc'}, take:1 },
      property:{ select:{id:true,name:true} },
    },
    orderBy: { updatedAt:'desc' },
  });
  res.json({ status:'success', data:{ conversations } });
};

export const getConversation = async (req: AuthRequest, res: Response) => {
  const conv = await prisma.conversation.findUnique({ where:{id:req.params.id}, include:{
    participants:{ include:{user:{select:{id:true,firstName:true,lastName:true,avatarUrl:true}}} },
    property:{ select:{id:true,name:true} },
  }});
  if (!conv) throw new AppError(404,'Conversation not found');
  res.json({ status:'success', data:{ conversation: conv } });
};

export const createConversation = async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  const { participantIds, propertyId, subject, isGroup } = req.body;
  const allIds: string[] = Array.from(new Set([userId, ...(participantIds || [])]));
  const conversation = await prisma.conversation.create({
    data: { subject, propertyId, isGroup: Boolean(isGroup), participants:{ create: allIds.map(id => ({ userId: id })) } },
    include:{ participants:{ include:{user:{select:{id:true,firstName:true,lastName:true}}} } },
  });
  res.status(201).json({ status:'success', data:{ conversation } });
};

export const getMessages = async (req: AuthRequest, res: Response) => {
  const { page='1', limit='50' } = req.query as Record<string,string>;
  const skip = (parseInt(page)-1)*parseInt(limit);
  const messages = await prisma.message.findMany({ where:{conversationId:req.params.id}, skip, take:parseInt(limit), orderBy:{createdAt:'asc'},
    include:{sender:{select:{id:true,firstName:true,lastName:true,avatarUrl:true}}} });
  res.json({ status:'success', data:{ messages } });
};

export const sendMessage = async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  const { content, attachmentUrls = [] } = req.body;
  const message = await prisma.message.create({ data:{conversationId:req.params.id,senderId:userId,content,attachmentUrls},
    include:{sender:{select:{id:true,firstName:true,lastName:true,avatarUrl:true}}} });
  await prisma.conversation.update({ where:{id:req.params.id}, data:{updatedAt:new Date()} });
  io.to(`conversation:${req.params.id}`).emit('message:new', message);
  res.status(201).json({ status:'success', data:{ message } });
};

export const markRead = async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  await prisma.messageParticipant.updateMany({ where:{conversationId:req.params.id,userId}, data:{lastReadAt:new Date()} });
  res.json({ status:'success', message:'Marked as read' });
};
