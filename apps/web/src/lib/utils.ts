import { type ClassValue, clsx } from 'clsx';
export function cn(...inputs: ClassValue[]) { return inputs.filter(Boolean).join(' '); }
export function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.data)) return record.data as T[];
    if (Array.isArray(record.items)) return record.items as T[];
    if (Array.isArray(record.results)) return record.results as T[];
    if (Array.isArray(record.contractors)) return record.contractors as T[];
    if (Array.isArray(record.properties)) return record.properties as T[];
    if (Array.isArray(record.workOrders)) return record.workOrders as T[];
    if (Array.isArray(record.transactions)) return record.transactions as T[];
    if (Array.isArray(record.notifications)) return record.notifications as T[];
    if (Array.isArray(record.documents)) return record.documents as T[];
    if (Array.isArray(record.messages)) return record.messages as T[];
    if (Array.isArray(record.conversations)) return record.conversations as T[];
    if (Array.isArray(record.users)) return record.users as T[];
    if (Array.isArray(record.leases)) return record.leases as T[];
  }
  return [] as T[];
}
export const formatCurrency = (n: number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
export const formatDate = (d: string|Date) => new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(d));
export const formatRelative = (d: string|Date) => {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff/60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h}h ago`;
  const dy = Math.floor(h/24);
  if (dy < 7) return `${dy}d ago`;
  return formatDate(d);
};
export const statusColors: Record<string,string> = {
  OPEN:'badge-blue', ASSIGNED:'badge-purple', IN_PROGRESS:'badge-yellow',
  ON_HOLD:'badge-gray', COMPLETED:'badge-green', CANCELLED:'badge-gray',
  ACTIVE:'badge-green', EXPIRED:'badge-gray', PENDING:'badge-yellow',
  FAILED:'badge-red', REFUNDED:'badge-gray',
};
export const priorityColors: Record<string,string> = {
  LOW:'badge-gray', MEDIUM:'badge-blue', HIGH:'badge-yellow', EMERGENCY:'badge-red',
};
