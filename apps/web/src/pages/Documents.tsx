import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Upload, Grid, List, Download, Trash2, Plus, Search } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import api from '../lib/api';
import { formatDate, cn, toArray } from '../lib/utils';

const DOC_TYPES = ['LEASE','INSPECTION_REPORT','INVOICE','CONTRACT','PERMIT','INSURANCE','PHOTO','OTHER'];
const TYPE_COLORS: Record<string,string> = { LEASE:'primary', INSPECTION_REPORT:'warning', INVOICE:'success', CONTRACT:'default', PERMIT:'primary', INSURANCE:'warning', PHOTO:'default', OTHER:'default' };

function UploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name:'', documentType:'LEASE', propertyId:'', description:'' });
  const [file, setFile] = useState<File|null>(null);
  const { data: props } = useQuery({ queryKey:['properties-list'], queryFn: () => api.get('/properties').then(r=>r.data) });
  const propertyOptions = toArray<any>(props?.data?.properties ?? props?.properties);
  const upload = useMutation({
    mutationFn: async (d:any) => {
      const fd = new FormData();
      Object.entries(d).forEach(([k,v])=>{ if(v) fd.append(k, v as string); });
      if(file) fd.append('file', file);
      return api.post('/documents', fd, { headers:{'Content-Type':'multipart/form-data'} }).then(r=>r.data);
    },
    onSuccess: () => { qc.invalidateQueries({queryKey:['documents']}); onClose(); setForm({ name:'', documentType:'LEASE', propertyId:'', description:'' }); setFile(null); }
  });
  const set = (k:string,v:string) => setForm(p=>({...p,[k]:v}));
  return (
    <Modal open={open} onClose={onClose} title="Upload Document">
      <div className="space-y-4">
        <Input label="Document Name" placeholder="e.g. Lease Agreement 2025" value={form.name} onChange={e=>set('name',e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.documentType} onChange={e=>set('documentType',e.target.value)}>
              {DOC_TYPES.map(t=><option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.propertyId} onChange={e=>set('propertyId',e.target.value)}>
              <option value="">None</option>
              {propertyOptions.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">File</label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-indigo-400 transition-colors" onClick={()=>document.getElementById('doc-file-input')?.click()}>
            {file ? (
              <div className="flex items-center justify-center gap-2 text-gray-700"><FileText className="w-5 h-5 text-indigo-600" /><span className="text-sm font-medium">{file.name}</span></div>
            ) : (
              <div className="text-gray-400"><Upload className="w-8 h-8 mx-auto mb-2 opacity-50" /><p className="text-sm">Click to select file</p></div>
            )}
          </div>
          <input id="doc-file-input" type="file" className="hidden" onChange={e=>setFile(e.target.files?.[0]||null)} />
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" loading={upload.isPending} onClick={()=>upload.mutate(form)} disabled={!form.name}>Upload</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function Documents() {
  const qc = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [view, setView] = useState<'grid'|'list'>('list');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const { data, isLoading } = useQuery({ queryKey:['documents', typeFilter], queryFn: () => api.get('/documents', { params: typeFilter ? { documentType: typeFilter } : {} }).then(r=>r.data) });
  const documentList = toArray<any>(data?.data?.documents ?? data?.documents);
  const deleteDoc = useMutation({
    mutationFn: (id:string) => api.delete(`/documents/${id}`).then(r=>r.data),
    onSuccess: () => qc.invalidateQueries({queryKey:['documents']})
  });
  const docs = documentList.filter((d:any)=>!search||d.name?.toLowerCase().includes(search.toLowerCase()));

  const fileIcon = (type:string) => {
    const t = type?.toLowerCase();
    if(t?.includes('pdf')||t?.includes('lease')) return '📄';
    if(t?.includes('image')||t?.includes('photo')||t?.includes('png')||t?.includes('jpg')) return '🖼️';
    if(t?.includes('sheet')||t?.includes('csv')) return '📊';
    return '📁';
  };

  return (
    <Layout title="Documents">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
            <p className="text-sm text-gray-500 mt-1">Manage leases, reports, and property files</p>
          </div>
          <Button icon={<Upload className="w-4 h-4" />} onClick={()=>setShowUpload(true)}>Upload Document</Button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Search documents..." value={search} onChange={e=>setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {['','LEASE','INSPECTION_REPORT','INVOICE','CONTRACT','PHOTO'].map(t=>(
              <button key={t} onClick={()=>setTypeFilter(t)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${typeFilter===t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{t||'All'}</button>
            ))}
          </div>
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            <button onClick={()=>setView('list')} className={cn('p-2', view==='list' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:bg-gray-50')}><List className="w-4 h-4" /></button>
            <button onClick={()=>setView('grid')} className={cn('p-2', view==='grid' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:bg-gray-50')}><Grid className="w-4 h-4" /></button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent" /></div>
        ) : docs.length === 0 ? (
          <EmptyState icon={<FileText className="w-12 h-12" />} title="No documents found" description="Upload your first document to get started" action={<Button icon={<Plus className="w-4 h-4" />} onClick={()=>setShowUpload(true)}>Upload Document</Button>} />
        ) : view === 'list' ? (
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 bg-gray-50"><th className="text-left py-3 px-4 font-medium text-gray-500">Name</th><th className="text-left py-3 px-4 font-medium text-gray-500">Type</th><th className="text-left py-3 px-4 font-medium text-gray-500">Property</th><th className="text-left py-3 px-4 font-medium text-gray-500">Uploaded</th><th className="text-right py-3 px-4 font-medium text-gray-500">Actions</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {docs.map((d:any)=>(
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4"><div className="flex items-center gap-2"><span className="text-lg">{fileIcon(d.mimeType||d.documentType)}</span><span className="font-medium text-gray-900">{d.name}</span></div></td>
                    <td className="py-3 px-4"><Badge variant={TYPE_COLORS[d.documentType]||'default'} size="sm">{(d.documentType||'').replace(/_/g,' ')}</Badge></td>
                    <td className="py-3 px-4 text-gray-500">{d.property?.name||'—'}</td>
                    <td className="py-3 px-4 text-gray-500 whitespace-nowrap">{formatDate(d.createdAt)}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        {d.fileUrl && <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"><Download className="w-4 h-4" /></a>}
                        <button onClick={()=>deleteDoc.mutate(d.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {docs.map((d:any)=>(
              <div key={d.id} className="card hover:shadow-md transition-shadow group">
                <div className="text-4xl mb-3">{fileIcon(d.mimeType||d.documentType)}</div>
                <p className="font-medium text-gray-900 text-sm truncate mb-1">{d.name}</p>
                <Badge variant={TYPE_COLORS[d.documentType]||'default'} size="sm">{(d.documentType||'').replace(/_/g,' ')}</Badge>
                <p className="text-xs text-gray-400 mt-2">{formatDate(d.createdAt)}</p>
                <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  {d.fileUrl && <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs hover:bg-indigo-50 hover:text-indigo-600"><Download className="w-3.5 h-3.5" />Open</a>}
                  <button onClick={()=>deleteDoc.mutate(d.id)} className="p-1.5 rounded-lg bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <UploadModal open={showUpload} onClose={()=>setShowUpload(false)} />
    </Layout>
  );
}
