import { Request, Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { paymentService } from '../services/payment.service';
import { UserRole, TransactionType, TransactionStatus } from '@prisma/client';

const incomeTypes = new Set<TransactionType>([
  TransactionType.RENT_PAYMENT,
  TransactionType.SECURITY_DEPOSIT,
  TransactionType.REFUND,
]);

const expenseTypes = new Set<TransactionType>([
  TransactionType.MAINTENANCE_FEE,
  TransactionType.CONTRACTOR_PAYMENT,
  TransactionType.UTILITY_PAYMENT,
  TransactionType.LATE_FEE,
  TransactionType.OTHER,
]);

const transactionTypeAliases: Record<string, TransactionType> = {
  RENT: TransactionType.RENT_PAYMENT,
  RENT_PAYMENT: TransactionType.RENT_PAYMENT,
  DEPOSIT: TransactionType.SECURITY_DEPOSIT,
  SECURITY_DEPOSIT: TransactionType.SECURITY_DEPOSIT,
  MAINTENANCE: TransactionType.MAINTENANCE_FEE,
  MAINTENANCE_FEE: TransactionType.MAINTENANCE_FEE,
  UTILITY: TransactionType.UTILITY_PAYMENT,
  UTILITY_PAYMENT: TransactionType.UTILITY_PAYMENT,
  OTHER_INCOME: TransactionType.OTHER,
  OTHER_EXPENSE: TransactionType.OTHER,
  INSURANCE: TransactionType.OTHER,
  TAX: TransactionType.OTHER,
  MANAGEMENT_FEE: TransactionType.OTHER,
  OTHER: TransactionType.OTHER,
  REFUND: TransactionType.REFUND,
  LATE_FEE: TransactionType.LATE_FEE,
  CONTRACTOR_PAYMENT: TransactionType.CONTRACTOR_PAYMENT,
};

function getCategory(type: TransactionType) {
  return incomeTypes.has(type) ? 'INCOME' : 'EXPENSE';
}

function normalizeTransactionType(type?: string, category?: string): TransactionType | undefined {
  if (!type && !category) return undefined;
  if (type) {
    const mapped = transactionTypeAliases[type] ?? transactionTypeAliases[type.toUpperCase()];
    if (mapped) return mapped;
  }
  if (category?.toUpperCase() === 'INCOME') return TransactionType.OTHER;
  if (category?.toUpperCase() === 'EXPENSE') return TransactionType.OTHER;
  return undefined;
}

function serializeTransaction<T extends { type: TransactionType }>(transaction: T) {
  return {
    ...transaction,
    category: getCategory(transaction.type),
    transactionDate: (transaction as any).paidAt ?? (transaction as any).createdAt,
  };
}

export const getTransactions = async (req: AuthRequest, res: Response) => {
  const { userId, role } = req.user!;
  const { page='1', limit='20', type, status, propertyId, startDate, endDate, category } = req.query as Record<string,string>;
  const skip = (parseInt(page)-1)*parseInt(limit);
  const where: any = {};
  if (role===UserRole.TENANT) where.userId = userId;
  else if (role===UserRole.OWNER) where.property = { ownerId: userId };
  else if (role===UserRole.MANAGER) where.property = { managers:{some:{managerId:userId,isActive:true}} };
  const normalizedType = normalizeTransactionType(type, category);
  if (normalizedType) where.type = normalizedType;
  if (status) where.status = status;
  if (propertyId) where.propertyId = propertyId;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate)   where.createdAt.lte = new Date(endDate);
  }
  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({ where, skip, take:parseInt(limit), orderBy:{createdAt:'desc'},
      include:{ property:{select:{id:true,name:true}}, lease:{select:{id:true,unit:{select:{id:true,unitNumber:true}}}}, workOrder:{select:{id:true,title:true}}, user:{select:{id:true,firstName:true,lastName:true}} } }),
    prisma.transaction.count({ where }),
  ]);
  res.json({ status:'success', data:{ transactions: transactions.map(serializeTransaction), pagination:{page:parseInt(page),limit:parseInt(limit),total,pages:Math.ceil(total/parseInt(limit))} } });
};

export const getTransaction = async (req: AuthRequest, res: Response) => {
  const tx = await prisma.transaction.findUnique({ where:{id:req.params.id}, include:{property:true,lease:{include:{unit:true}},workOrder:true,user:{select:{id:true,firstName:true,lastName:true,email:true}}} });
  if (!tx) throw new AppError(404,'Transaction not found');
  res.json({ status:'success', data:{ transaction: serializeTransaction(tx) } });
};

export const createTransaction = async (req: AuthRequest, res: Response) => {
  const { userId } = req.user!;
  const { propertyId, leaseId, type, amount, description, dueDate, category } = req.body;
  if (!propertyId || !type || !amount) throw new AppError(400,'propertyId, type, amount required');
  const normalizedType = normalizeTransactionType(type, category);
  if (!normalizedType) throw new AppError(400, 'Invalid transaction type');
  const transaction = await prisma.transaction.create({ data:{
    propertyId, leaseId, userId, type: normalizedType, amount:parseFloat(amount), description, status:TransactionStatus.PENDING,
    dueDate:dueDate?new Date(dueDate):undefined,
  }});
  res.status(201).json({ status:'success', data:{ transaction: serializeTransaction(transaction) } });
};

export const getFinancialSummary = async (req: AuthRequest, res: Response) => {
  const { userId, role } = req.user!;
  const { propertyId, year } = req.query as Record<string,string>;
  const currentYear = year ? parseInt(year) : new Date().getFullYear();
  const startDate = new Date(currentYear,0,1);
  const endDate   = new Date(currentYear,11,31);
  const where: any = { createdAt:{gte:startDate,lte:endDate}, status:'COMPLETED' };
  if (propertyId) where.propertyId = propertyId;
  else if (role===UserRole.OWNER) where.property = { ownerId: userId };
  const transactions = await prisma.transaction.findMany({
    where,
    select: { id:true, type:true, amount:true, createdAt:true, paidAt:true },
    orderBy: { createdAt: 'asc' },
  });

  const totalIncome = transactions
    .filter((transaction) => incomeTypes.has(transaction.type))
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalExpenses = transactions
    .filter((transaction) => !incomeTypes.has(transaction.type))
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const monthBuckets = Array.from({ length: 12 }, (_, index) => ({
    month: new Date(currentYear, index, 1).toLocaleString('default', { month: 'short' }),
    income: 0,
    expenses: 0,
    net: 0,
  }));

  const byTypeMap = new Map<string, { type: TransactionType; amount: number; count: number; category: string }>();
  for (const transaction of transactions) {
    const sourceDate = transaction.paidAt ?? transaction.createdAt;
    if (sourceDate.getFullYear() === currentYear) {
      const bucket = monthBuckets[sourceDate.getMonth()];
      if (incomeTypes.has(transaction.type)) bucket.income += transaction.amount;
      else bucket.expenses += transaction.amount;
      bucket.net = bucket.income - bucket.expenses;
    }

    const existing = byTypeMap.get(transaction.type) ?? { type: transaction.type, amount: 0, count: 0, category: getCategory(transaction.type) };
    existing.amount += transaction.amount;
    existing.count += 1;
    byTypeMap.set(transaction.type, existing);
  }

  res.json({
    status:'success',
    data:{
      totalIncome,
      totalExpenses,
      netIncome: totalIncome - totalExpenses,
      count: transactions.length,
      monthly: monthBuckets,
      byType: Array.from(byTypeMap.values()),
      year: currentYear,
    },
  });
};

export const createPaymentIntent = async (req: AuthRequest, res: Response) => {
  const { amount, currency='usd', metadata } = req.body;
  if (!amount) throw new AppError(400,'Amount required');
  const intent = await paymentService.createPaymentIntent(amount, currency, metadata);
  res.json({ status:'success', data:{ clientSecret: intent.client_secret } });
};

export const handleWebhook = async (req: Request, res: Response) => {
  await paymentService.handleWebhook(req);
  res.json({ received: true });
};
