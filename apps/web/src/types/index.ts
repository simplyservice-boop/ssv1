export interface User {
  id: string; email: string; firstName: string; lastName: string;
  role: UserRole; phone?: string; avatarUrl?: string; bio?: string;
  isVerified: boolean; isActive: boolean; createdAt: string;
}
export type UserRole = 'OWNER'|'MANAGER'|'TENANT'|'CONTRACTOR'|'VENDOR'|'ADMIN';

export interface Property {
  id: string; name: string; address: string; city: string; state: string; zip: string;
  type: string; units: number; sqFootage?: number; yearBuilt?: number;
  description?: string; lat?: number; lng?: number; ownerId: string;
  _count?: { workOrders: number; leases: number };
}
export interface Unit {
  id: string; propertyId: string; unitNumber: string; floor?: number;
  bedrooms?: number; bathrooms?: number; sqFootage?: number;
  rentAmount?: number; isAvailable: boolean; features?: string[];
}
export interface Lease {
  id: string; unitId: string; propertyId: string; tenantId: string;
  startDate: string; endDate: string; rentAmount: number;
  depositAmount: number; status: string;
  tenant?: Pick<User,'id'|'firstName'|'lastName'|'email'>;
  unit?: Pick<Unit,'id'|'unitNumber'>;
}
export interface WorkOrder {
  id: string; title: string; description: string;
  status: WorkOrderStatus; priority: WorkOrderPriority; category: string;
  propertyId: string; unitId?: string; requestorId: string; assigneeId?: string;
  estimatedCost?: number; actualCost?: number; scheduledDate?: string;
  completedAt?: string; createdAt: string; updatedAt: string;
  property?: Pick<Property,'id'|'name'|'address'|'city'>;
  assignee?: Pick<User,'id'|'firstName'|'lastName'>;
  requestor?: Pick<User,'id'|'firstName'|'lastName'>;
  _count?: { comments: number };
}
export type WorkOrderStatus = 'OPEN'|'ASSIGNED'|'IN_PROGRESS'|'ON_HOLD'|'COMPLETED'|'CANCELLED';
export type WorkOrderPriority = 'LOW'|'MEDIUM'|'HIGH'|'EMERGENCY';

export interface Transaction {
  id: string; propertyId: string; userId: string;
  type: 'RENT'|'DEPOSIT'|'INCOME'|'EXPENSE'|'REFUND'|'FEE';
  amount: number; status: 'PENDING'|'COMPLETED'|'FAILED'|'REFUNDED';
  description?: string; category?: string; dueDate?: string; paidAt?: string;
  createdAt: string;
  property?: Pick<Property,'id'|'name'>;
  user?: Pick<User,'id'|'firstName'|'lastName'>;
}
export interface Notification {
  id: string; userId: string; type: string;
  title: string; body: string; isRead: boolean;
  link?: string; readAt?: string; createdAt: string;
}
export interface Conversation {
  id: string; subject?: string; type: string;
  participants: Array<{ userId: string; user: Pick<User,'id'|'firstName'|'lastName'|'avatarUrl'> }>;
  messages?: Message[]; property?: Pick<Property,'id'|'name'>; createdAt: string; updatedAt: string;
}
export interface Message {
  id: string; conversationId: string; senderId: string; content: string;
  type: string; createdAt: string;
  sender: Pick<User,'id'|'firstName'|'lastName'|'avatarUrl'>;
}
export interface ContractorProfile {
  id: string; userId: string; businessName?: string; licenseNumber?: string;
  specialties: string[]; hourlyRate?: number; bio?: string;
  yearsExperience?: number; rating?: number; reviewCount: number;
  user: Pick<User,'id'|'firstName'|'lastName'|'email'|'phone'|'avatarUrl'>;
}
export interface Inspection {
  id: string; propertyId: string; unitId?: string; type: string;
  status: string; title?: string; scheduledDate?: string;
  completedAt?: string; overallScore?: number; notes?: string; createdAt: string;
  property?: Pick<Property,'id'|'name'>; unit?: Pick<Unit,'id'|'unitNumber'>;
  creator?: Pick<User,'id'|'firstName'|'lastName'>;
  items?: InspectionItem[];
}
export interface InspectionItem {
  id: string; name: string; area?: string; condition: string;
  notes?: string; order: number;
}
export interface PaginatedResponse<T> {
  data: T[]; pagination: { page: number; limit: number; total: number; pages: number; };
}
