import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ClipboardCheck, Calendar, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import api from '../lib/api';
import { formatDate } from '../lib/utils';

const TYPES = ['MOVE_IN','MOVE_OUT','ROUTINE','ANNUAL','DRIVE_BY','SPECIAL'];
const STATUS_MAP: Record<string,string> = { SCHEDULED:'default', IN_PROGRESS:'warning', COMPLETED:'success', CANCELLED:'danger' };

function CreateInspectionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ type:'ROUTINE', propertyId:'', unitId:'', scheduledDate:'', notes:'' });
  const { data: props } = useQuery({ queryKey:['properties-list'], queryFn: () => api.get('/properties').then(r=>r.data) });
  const propertyOptions = Array.isArray(props?.data?.properties) ? props.data.properties : [];
  const create = useMutation({
    mutationFn: (d:any) => api.post('/inspections', d).then(r=>r.data),
    onSuccess: () => { qc.invalidateQueries({queryKey:['inspections']}); onClose(); setForm({ type:'ROUTINE', propertyId:'', unitId:'', scheduledDate:'', notes:'' }); }
  });
  const set = (k:string,v:string) => setForm(p=>({...p,[k]:v}));
  return (
    <Modal open={open} onClose={onClose} title="Schedule Inspection">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
          <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.propertyId} onChange={e=>set('propertyId',e.target.value)}>
            <option value="">Select property...</option>
            {propertyOptions.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Inspection Type</label>
          <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.type} onChange={e=>set('type',e.target.value)}>
            {TYPES.map(t=><option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
          </select>
        </div>
        <Input label="Scheduled Date" type="datetime-local" value={form.scheduledDate} onChange={e=>set('scheduledDate',e.target.value)} />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Any specific areas to inspect..." value={form.notes} onChange={e=>set('notes',e.target.value)} />
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" loading={create.isPending} onClick={()=>create.mutate({...form, scheduledDate: form.scheduledDate ? new Date(form.scheduledDate).toISOString() : undefined})}>Schedule</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function Inspections() {
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const { data, isLoading } = useQuery({ queryKey:['inspections', statusFilter], queryFn: () => api.get('/inspections', { params: statusFilter ? { status: statusFilter } : {} }).then(r=>r.data) });
  const inspections = Array.isArray(data?.data?.inspections) ? data.data.inspections : [];

  return (
    <Layout title="Inspections">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Inspections</h1>
            <p className="text-sm text-gray-500 mt-1">Schedule and track property inspections</p>
          </div>
          <Button icon={<Plus className="w-4 h-4" />} onClick={()=>setShowCreate(true)}>Schedule Inspection</Button>
        </div>

        <div className="flex gap-2">
          {['','SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED'].map(s=>(
            <button key={s} onClick={()=>setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter===s ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{s||'All'}</button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent" /></div>
        ) : inspections.length === 0 ? (
          <EmptyState icon={<ClipboardCheck className="w-12 h-12" />} title="No inspections found" description="Schedule your first inspection to get started" action={<Button icon={<Plus className="w-4 h-4" />} onClick={()=>setShowCreate(true)}>Schedule Inspection</Button>} />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {inspections.map((insp:any)=>(
              <div key={insp.id} className="card hover:shadow-md transition-shadow cursor-pointer" onClick={()=>navigate(`/inspections/${insp.id}`)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center">
                      <ClipboardCheck className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-gray-900">{(insp.type||'').replace(/_/g,' ')} Inspection</span>
                        <Badge variant={STATUS_MAP[insp.status]||'default'} size="sm">{insp.status}</Badge>
                      </div>
                      <p className="text-sm text-gray-500">{insp.property?.name||'—'} {insp.unit ? `· Unit ${insp.unit.unitNumber}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Scheduled</p>
                      <div className="flex items-center gap-1 text-sm text-gray-700">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        {insp.scheduledAt ? formatDate(insp.scheduledAt) : 'TBD'}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Items</p>
                      <p className="text-sm font-medium text-gray-900">{insp._count?.items||insp.items?.length||0}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <CreateInspectionModal open={showCreate} onClose={()=>setShowCreate(false)} />
    </Layout>
  );
}
