import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Filter, Wrench } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { WorkOrder } from '../types';
import { formatDate, statusColors, priorityColors } from '../lib/utils';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';

const CATEGORIES = ['PLUMBING','ELECTRICAL','HVAC','GENERAL','CARPENTRY','PAINTING','CLEANING','LANDSCAPING','APPLIANCE','ROOFING','OTHER'];
const STATUSES = ['OPEN','ASSIGNED','IN_PROGRESS','ON_HOLD','COMPLETED','CANCELLED'];
const PRIORITIES = ['LOW','MEDIUM','HIGH','EMERGENCY'];

export default function WorkOrders() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title:'', description:'', priority:'MEDIUM', category:'GENERAL', propertyId:'', estimatedCost:'' });
  const set = (k:string) => (e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => setForm(f=>({...f,[k]:e.target.value}));

  const params = new URLSearchParams();
  if (search)         params.set('search', search);
  if (filterStatus)   params.set('status', filterStatus);
  if (filterPriority) params.set('priority', filterPriority);

  const { data, isLoading } = useQuery({
    queryKey: ['workOrders', search, filterStatus, filterPriority],
    queryFn: () => api.get(`/work-orders?${params}&limit=30`).then(r => r.data.data),
  });
  const { data: propData } = useQuery({
    queryKey: ['properties','dropdown'],
    queryFn: () => api.get('/properties?limit=50').then(r=>r.data.data.properties),
    enabled: user?.role !== 'TENANT' && user?.role !== 'CONTRACTOR',
  });

  const addMutation = useMutation({
    mutationFn: (body: any) => api.post('/work-orders', body),
    onSuccess: () => { qc.invalidateQueries({queryKey:['workOrders']}); setShowAdd(false); toast.success('Work order created!'); },
  });

  const workOrders: WorkOrder[] = Array.isArray(data?.workOrders) ? data.workOrders : [];
  const properties: any[] = Array.isArray(propData) ? propData : [];

  return (
    <Layout title="Work Orders">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-48"><Input placeholder="Search work orders..." value={search} onChange={e=>setSearch(e.target.value)} leftIcon={<Search className="w-4 h-4" />} /></div>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="input w-auto">
            <option value="">All Statuses</option>
            {STATUSES.map(s=><option key={s}>{s}</option>)}
          </select>
          <select value={filterPriority} onChange={e=>setFilterPriority(e.target.value)} className="input w-auto">
            <option value="">All Priorities</option>
            {PRIORITIES.map(p=><option key={p}>{p}</option>)}
          </select>
          <Button onClick={()=>setShowAdd(true)} icon={<Plus className="w-4 h-4" />}>New Work Order</Button>
        </div>

        {isLoading ? <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>
        : workOrders.length === 0 ? <EmptyState icon={Wrench} title="No work orders found" description="Submit a new maintenance request to get started." action={<Button onClick={()=>setShowAdd(true)} icon={<Plus className="w-4 h-4" />}>New Work Order</Button>} />
        : (
          <div className="space-y-3">
            {workOrders.map(wo => (
              <Link key={wo.id} to={`/work-orders/${wo.id}`} className="card flex items-start gap-4 hover:shadow-card-hover transition-shadow group p-4">
                <div className={`w-3 h-3 rounded-full mt-1.5 flex-shrink-0 ${wo.priority==='EMERGENCY'?'bg-red-500':wo.priority==='HIGH'?'bg-orange-500':wo.priority==='MEDIUM'?'bg-yellow-500':'bg-gray-300'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-gray-900 group-hover:text-primary-600 transition-colors truncate">{wo.title}</h3>
                    <Badge label={wo.priority} color={priorityColors[wo.priority]??'badge-gray'} />
                  </div>
                  <p className="text-sm text-gray-500 truncate mt-0.5">{wo.property?.name} · {wo.category} · {formatDate(wo.createdAt)}</p>
                  {wo.assignee && <p className="text-xs text-gray-400 mt-0.5">Assigned to: {wo.assignee.firstName} {wo.assignee.lastName}</p>}
                </div>
                <Badge label={wo.status.replace('_',' ')} color={statusColors[wo.status]??'badge-gray'} />
              </Link>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={showAdd} onClose={()=>setShowAdd(false)} title="New Work Order" size="lg">
        <form onSubmit={e=>{e.preventDefault();addMutation.mutate({...form,estimatedCost:form.estimatedCost?parseFloat(form.estimatedCost):undefined,propertyId:form.propertyId||undefined});}} className="space-y-4">
          <Input label="Title" value={form.title} onChange={set('title')} required />
          <div><label className="label">Description</label><textarea value={form.description} onChange={set('description')} className="input h-24 resize-none" required /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Priority</label><select value={form.priority} onChange={set('priority')} className="input">{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select></div>
            <div><label className="label">Category</label><select value={form.category} onChange={set('category')} className="input">{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div>
          </div>
          {properties.length > 0 && (
            <div><label className="label">Property</label><select value={form.propertyId} onChange={set('propertyId')} className="input"><option value="">Select property...</option>{properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          )}
          <Input label="Estimated Cost ($)" type="number" step="0.01" value={form.estimatedCost} onChange={set('estimatedCost')} />
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={()=>setShowAdd(false)}>Cancel</Button>
            <Button type="submit" loading={addMutation.isPending}>Create</Button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}
