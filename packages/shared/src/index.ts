export type UserRole = 'OWNER'|'MANAGER'|'TENANT'|'CONTRACTOR'|'VENDOR'|'UTILITY_PROVIDER'|'INSURANCE_PARTNER'|'FINANCIAL_INSTITUTION'|'ENTERPRISE'|'MUNICIPAL_PARTNER'|'ADMIN';
export type PropertyType = 'SINGLE_FAMILY'|'MULTI_FAMILY'|'APARTMENT_COMPLEX'|'COMMERCIAL_OFFICE'|'RETAIL'|'INDUSTRIAL'|'MIXED_USE'|'MUNICIPAL'|'LAND';
export type PropertyStatus = 'ACTIVE'|'INACTIVE'|'UNDER_CONSTRUCTION'|'FOR_SALE'|'FOR_LEASE'|'ARCHIVED';
export type WorkOrderStatus = 'DRAFT'|'OPEN'|'ASSIGNED'|'IN_PROGRESS'|'ON_HOLD'|'PENDING_REVIEW'|'COMPLETED'|'CANCELLED';
export type WorkOrderPriority = 'LOW'|'MEDIUM'|'HIGH'|'URGENT'|'EMERGENCY';
export type WorkOrderCategory = 'PLUMBING'|'ELECTRICAL'|'HVAC'|'ROOFING'|'STRUCTURAL'|'LANDSCAPING'|'CLEANING'|'PAINTING'|'FLOORING'|'APPLIANCES'|'PEST_CONTROL'|'SECURITY'|'GENERAL_MAINTENANCE'|'INSPECTION'|'OTHER';
export type InspectionStatus = 'SCHEDULED'|'IN_PROGRESS'|'COMPLETED'|'FAILED'|'CANCELLED';
export type InspectionType = 'MOVE_IN'|'MOVE_OUT'|'ROUTINE'|'ANNUAL'|'CODE_COMPLIANCE'|'SAFETY'|'INSURANCE'|'CUSTOM';
export type LeaseStatus = 'DRAFT'|'ACTIVE'|'EXPIRED'|'TERMINATED'|'PENDING_RENEWAL';
export type TransactionType = 'RENT_PAYMENT'|'SECURITY_DEPOSIT'|'MAINTENANCE_FEE'|'LATE_FEE'|'REFUND'|'CONTRACTOR_PAYMENT'|'UTILITY_PAYMENT'|'OTHER';
export type TransactionStatus = 'PENDING'|'COMPLETED'|'FAILED'|'REFUNDED';
export type DocumentType = 'LEASE'|'INSPECTION_REPORT'|'WORK_ORDER_ATTACHMENT'|'INSURANCE_POLICY'|'PERMIT'|'WARRANTY'|'INVOICE'|'RECEIPT'|'PHOTO'|'FLOOR_PLAN'|'OTHER';
export type MessageStatus = 'SENT'|'DELIVERED'|'READ';
export type NotificationChannel = 'EMAIL'|'SMS'|'IN_APP'|'PUSH';

export interface BaseEntity { id: string; createdAt: string; updatedAt: string; }
export interface User extends BaseEntity {
  email: string; firstName: string; lastName: string;
  phone?: string|null; avatarUrl?: string|null; role: UserRole;
  isActive: boolean; isVerified: boolean;
}
export interface Property extends BaseEntity {
  name: string; type: PropertyType; status: PropertyStatus;
  address: string; city: string; state: string; zip: string;
  latitude?: number|null; longitude?: number|null; units: number;
  sqFootage?: number|null; ownerId: string; owner?: User;
  aiSummary?: string|null;
}
export interface Unit extends BaseEntity {
  propertyId: string; unitNumber: string; sqFootage?: number|null;
  bedrooms?: number|null; bathrooms?: number|null;
  monthlyRent?: number|null; isAvailable: boolean;
}
export interface WorkOrder extends BaseEntity {
  title: string; description: string; status: WorkOrderStatus;
  priority: WorkOrderPriority; category: WorkOrderCategory;
  propertyId: string; creatorId: string; assigneeId?: string|null;
  estimatedCost?: number|null; actualCost?: number|null;
  property?: Property; creator?: User; assignee?: User;
}
export interface Inspection extends BaseEntity {
  propertyId: string; creatorId: string; type: InspectionType;
  status: InspectionStatus; scheduledAt: string;
  overallScore?: number|null; notes?: string|null;
}
export interface Document extends BaseEntity {
  name: string; type: DocumentType; url: string; s3Key: string;
  mimeType: string; size: number; uploaderId: string;
  propertyId?: string|null;
}
export interface Transaction extends BaseEntity {
  propertyId: string; userId: string; type: TransactionType;
  status: TransactionStatus; amount: number; currency: string;
  description?: string|null;
}
export interface Message extends BaseEntity {
  conversationId: string; senderId: string; content: string;
  status: MessageStatus; sender?: User;
}
export interface Notification extends BaseEntity {
  userId: string; title: string; body: string; type: string;
  channel: NotificationChannel; isRead: boolean;
}
export interface ContractorProfile extends BaseEntity {
  userId: string; companyName?: string|null;
  specialties: string[]; hourlyRate?: number|null;
  rating?: number|null; isVerified: boolean; bio?: string|null;
  user?: User;
}
export interface ApiResponse<T = unknown> { status: string; data: T; message?: string; }
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}
