import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, MapPin, Home, Wrench, DollarSign, ClipboardCheck, FileText, Bot } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import api from '../lib/api';
import { formatCurrency } from '../lib/utils';

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const [aiSummary, setAiSummary] = useState('');
  const [loadingAI, setLoadingAI] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['property', id],
    queryFn: () => api.get(`/properties/${id}`).then(r => r.data.data.property),
  });

  const { data: units } = useQuery({
    queryKey: ['property', id, 'units'],
    queryFn: () => api.get(`/properties/${id}/units`).then(r => r.data.data.units),
    enabled: !!id,
  });

  const { data: woData } = useQuery({
    queryKey: ['workOrders', 'property', id],
    queryFn: () => api.get(`/work-orders?propertyId=${id}&limit=5`).then(r => r.data.data),
    enabled: !!id,
  });

  const handleAISummary = async () => {
    setLoadingAI(true);
    try {
      const { data: d } = await api.post(`/properties/${id}/ai-summary`);
      setAiSummary(d.data.summary);
    } catch (_) {}
    finally { setLoadingAI(false); }
  };

  if (isLoading) return <Layout><div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" /></div></Layout>;
  if (!data) return <Layout><p className="text-center text-gray-500 py-20">Property not found.</p></Layout>;

  const p = data;
  const workOrders = Array.isArray(woData?.workOrders) ? woData.workOrders : [];
  const unitList = Array.isArray(units) ? units : [];

  return (
    <Layout title={p.name}>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/properties"><Button variant="ghost" icon={<ArrowLeft className="w-4 h-4" />}>Back</Button></Link>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="secondary" icon={<Bot className="w-4 h-4" />} onClick={handleAISummary} loading={loadingAI}>AI Summary</Button>
          </div>
        </div>

        {aiSummary && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex gap-3">
            <Bot className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-purple-900">{aiSummary}</p>
          </div>
        )}

        <div className="card">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold">{p.name}</h2>
              <div className="flex items-center gap-1 text-gray-500 text-sm mt-1">
                <MapPin className="w-4 h-4" /><span>{p.address}, {p.city}, {p.state} {p.zip}</span>
              </div>
            </div>
            <Badge label={p.type} color="badge-blue" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
            <div><p className="text-xs text-gray-500">Units</p><p className="font-semibold">{p.units}</p></div>
            {p.sqFootage && <div><p className="text-xs text-gray-500">Sq Footage</p><p className="font-semibold">{p.sqFootage.toLocaleString()} sq ft</p></div>}
            {p.yearBuilt && <div><p className="text-xs text-gray-500">Year Built</p><p className="font-semibold">{p.yearBuilt}</p></div>}
            <div><p className="text-xs text-gray-500">Work Orders</p><p className="font-semibold text-orange-600">{p._count?.workOrders ?? 0} open</p></div>
          </div>
          {p.description && <p className="text-gray-600 text-sm mt-4">{p.description}</p>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2"><Home className="w-4 h-4 text-gray-500" /> Units ({unitList.length})</h3>
            </div>
            {unitList.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">No units found.</p> : (
              <div className="space-y-2">
                {unitList.map((u: any) => (
                  <div key={u.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-sm">Unit {u.unitNumber}</p>
                      <p className="text-xs text-gray-500">{u.bedrooms}bd / {u.bathrooms}ba · {u.sqFootage} sq ft</p>
                    </div>
                    <div className="text-right">
                      {u.rentAmount && <p className="text-sm font-semibold text-green-600">{formatCurrency(u.rentAmount)}/mo</p>}
                      <Badge label={u.isAvailable ? 'Available' : 'Occupied'} color={u.isAvailable ? 'badge-green' : 'badge-gray'} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2"><Wrench className="w-4 h-4 text-gray-500" /> Recent Work Orders</h3>
              <Link to={`/work-orders?propertyId=${id}`} className="text-primary-600 text-sm hover:underline">View all</Link>
            </div>
            {workOrders.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">No work orders.</p> : (
              <div className="space-y-2">
                {workOrders.map((wo: any) => (
                  <Link key={wo.id} to={`/work-orders/${wo.id}`} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{wo.title}</p>
                      <p className="text-xs text-gray-400">{wo.category}</p>
                    </div>
                    <Badge label={wo.status.replace('_',' ')} color="badge-yellow" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
