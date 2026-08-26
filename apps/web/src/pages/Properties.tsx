import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Building2, MapPin, Home } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { Property } from '../types';
import toast from 'react-hot-toast';

const TYPES = ['APARTMENT','HOUSE','TOWNHOUSE','CONDO','COMMERCIAL','INDUSTRIAL','LAND','OTHER'];

export default function Properties() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name:'',address:'',city:'Pittsburgh',state:'PA',zip:'',type:'APARTMENT',units:'1',description:'',lat:'',lng:'' });
  const set = (k:string) => (e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => setForm(f=>({...f,[k]:e.target.value}));

  const { data, isLoading } = useQuery({
    queryKey: ['properties', search],
    queryFn: () => api.get(`/properties?search=${search}&limit=20`).then(r=>r.data.data),
  });

  const addMutation = useMutation({
    mutationFn: (body: any) => api.post('/properties', body),
    onSuccess: () => { qc.invalidateQueries({queryKey:['properties']}); setShowAdd(false); toast.success('Property added!'); },
  });

  const properties: Property[] = data?.properties ?? [];

  return (
    <Layout title="Properties">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="flex-1"><Input placeholder="Search properties..." value={search} onChange={e=>setSearch(e.target.value)} leftIcon={<Search className="w-4 h-4" />} /></div>
          <Button onClick={()=>setShowAdd(true)} icon={<Plus className="w-4 h-4" />}>Add Property</Button>
        </div>

        {isLoading ? <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>
        : properties.length === 0 ? <EmptyState icon={Building2} title="No properties yet" description="Add your first property to get started." action={<Button onClick={()=>setShowAdd(true)} icon={<Plus className="w-4 h-4" />}>Add Property</Button>} />
        : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {properties.map(p => (
              <Link key={p.id} to={`/properties/${p.id}`} className="card hover:shadow-card-hover transition-shadow group">
                <div className="flex items-start justify-between mb-4">
                  <div className="bg-primary-50 p-2 rounded-lg"><Building2 className="w-5 h-5 text-primary-600" /></div>
                  <span className="badge badge-blue text-xs">{p.type}</span>
                </div>
                <h3 className="font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">{p.name}</h3>
                <div className="flex items-center gap-1 text-gray-500 text-sm mt-1">
                  <MapPin className="w-3 h-3" /><span>{p.address}, {p.city}, {p.state}</span>
                </div>
                <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100 text-sm text-gray-600">
                  <span className="flex items-center gap-1"><Home className="w-3 h-3" />{p.units} units</span>
                  {p._count && <span className="text-orange-600">{p._count.workOrders} work orders</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={showAdd} onClose={()=>setShowAdd(false)} title="Add Property" size="lg">
        <form onSubmit={e=>{e.preventDefault();addMutation.mutate({...form,units:parseInt(form.units),lat:form.lat?parseFloat(form.lat):undefined,lng:form.lng?parseFloat(form.lng):undefined});}} className="space-y-4">
          <Input label="Property Name" value={form.name} onChange={set('name')} required />
          <Input label="Address" value={form.address} onChange={set('address')} required />
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2"><Input label="City" value={form.city} onChange={set('city')} required /></div>
            <Input label="State" value={form.state} onChange={set('state')} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="ZIP" value={form.zip} onChange={set('zip')} required />
            <div><label className="label">Type</label><select value={form.type} onChange={set('type')} className="input">{TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
          </div>
          <Input label="Number of Units" type="number" min="1" value={form.units} onChange={set('units')} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Latitude (optional)" type="number" step="any" value={form.lat} onChange={set('lat')} placeholder="40.4406" />
            <Input label="Longitude (optional)" type="number" step="any" value={form.lng} onChange={set('lng')} placeholder="-79.9959" />
          </div>
          <div><label className="label">Description</label><textarea value={form.description} onChange={set('description')} className="input h-20 resize-none" placeholder="Brief property description..." /></div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" onClick={()=>setShowAdd(false)} type="button">Cancel</Button>
            <Button type="submit" loading={addMutation.isPending}>Add Property</Button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}
