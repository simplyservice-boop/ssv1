import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Search, Mail, Phone, Home, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import api from '../lib/api';
import { formatDate, formatCurrency, toArray } from '../lib/utils';

const STATUS_COLORS: Record<string,string> = { ACTIVE:'success', EXPIRED:'danger', PENDING:'warning', TERMINATED:'danger', MONTH_TO_MONTH:'default' };

export default function Tenants() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({ queryKey:['tenants'], queryFn: () => api.get('/users', { params: { role:'TENANT' } }).then(r=>r.data) });
  const { data: leasesData } = useQuery({ queryKey:['leases-all'], queryFn: () => api.get('/properties/leases/all').then(r=>r.data).catch(()=>({data:[]})) });

  const tenantList = toArray<any>(data?.data?.users ?? data?.users);
  const tenants = tenantList.filter((t:any) =>
    !search ||
    `${t.firstName || ''} ${t.lastName || ''}`.trim().toLowerCase().includes(search.toLowerCase()) ||
    (t.email || '').toLowerCase().includes(search.toLowerCase())
  );
  const leases = toArray<any>(leasesData?.data?.leases ?? leasesData?.leases);
  const getTenantLease = (userId: string) => leases.find((l:any) => l.tenantId === userId || l.tenant?.id === userId);

  return (
    <Layout title="Tenants">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
            <p className="text-sm text-gray-500 mt-1">{tenants.length} tenant{tenants.length!==1?'s':''} in your portfolio</p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Search tenants by name or email..." value={search} onChange={e=>setSearch(e.target.value)} />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent" /></div>
        ) : tenants.length === 0 ? (
          <EmptyState icon={<Users className="w-12 h-12" />} title="No tenants found" description="Tenants will appear here once leases are created" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {tenants.map((t:any)=>{
              const lease = getTenantLease(t.id);
              return (
                <div key={t.id} className="card hover:shadow-md transition-shadow cursor-pointer" onClick={()=>navigate(`/properties${lease?.property?.id ? `/${lease.property.id}` : ''}`)}>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                      {(t.firstName?.[0]||'?').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="font-semibold text-gray-900">{t.firstName} {t.lastName}</p>
                        {lease && <Badge variant={STATUS_COLORS[lease.status]||'default'} size="sm">{lease.status?.replace(/_/g,' ')}</Badge>}
                      </div>
                      <div className="space-y-1.5">
                        {t.email && <div className="flex items-center gap-1.5 text-xs text-gray-500"><Mail className="w-3 h-3 text-gray-400" />{t.email}</div>}
                        {t.phone && <div className="flex items-center gap-1.5 text-xs text-gray-500"><Phone className="w-3 h-3 text-gray-400" />{t.phone}</div>}
                        {lease?.unit && <div className="flex items-center gap-1.5 text-xs text-gray-500"><Home className="w-3 h-3 text-gray-400" />{lease.property?.name} · Unit {lease.unit?.unitNumber}</div>}
                      </div>
                    </div>
                  </div>
                  {lease && (
                    <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Monthly Rent</p>
                        <p className="text-sm font-semibold text-gray-900">{formatCurrency(lease.monthlyRent||0)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Lease Start</p>
                        <p className="text-sm text-gray-700">{formatDate(lease.startDate)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Lease End</p>
                        <p className="text-sm text-gray-700">{formatDate(lease.endDate)}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
