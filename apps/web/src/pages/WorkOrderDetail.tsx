import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send, Bot, DollarSign } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import api from '../lib/api';
import { formatDate, formatCurrency, statusColors, priorityColors } from '../lib/utils';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

const STATUSES = ['OPEN','ASSIGNED','IN_PROGRESS','ON_HOLD','COMPLETED','CANCELLED'];

export default function WorkOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState<any>(null);
  const [loadingAI, setLoadingAI] = useState(false);

  const { data: wo, isLoading } = useQuery({
    queryKey: ['workOrder', id],
    queryFn: () => api.get(`/work-orders/${id}`).then(r => r.data.data.workOrder),
  });
  const { data: comments } = useQuery({
    queryKey: ['workOrder', id, 'comments'],
    queryFn: () => api.get(`/work-orders/${id}/comments`).then(r => r.data.data.comments),
    enabled: !!id,
  });

  const addComment = useMutation({
    mutationFn: (content: string) => api.post(`/work-orders/${id}/comments`, { content }),
    onSuccess: () => { qc.invalidateQueries({queryKey:['workOrder',id,'comments']}); setComment(''); },
  });
  const updateStatus = useMutation({
    mutationFn: (status: string) => api.patch(`/work-orders/${id}/status`, { status }),
    onSuccess: () => { qc.invalidateQueries({queryKey:['workOrder',id]}); toast.success('Status updated'); },
  });

  const handleAI = async () => {
    if (!wo) return;
    setLoadingAI(true);
    try {
      const { data } = await api.post('/ai/work-order-suggestion', { description: wo.description, propertyId: wo.propertyId });
      setAiSuggestion(data.data.suggestion);
    } catch (_) {}
    finally { setLoadingAI(false); }
  };

  if (isLoading) return <Layout><div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" /></div></Layout>;
  if (!wo) return <Layout><p className="text-center text-gray-500 py-20">Work order not found.</p></Layout>;

  return (
    <Layout title={wo.title}>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-4 flex-wrap">
          <Link to="/work-orders"><Button variant="ghost" icon={<ArrowLeft className="w-4 h-4" />}>Back</Button></Link>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <Button variant="secondary" icon={<Bot className="w-4 h-4" />} onClick={handleAI} loading={loadingAI} size="sm">AI Suggestion</Button>
            {(user?.role==='OWNER'||user?.role==='MANAGER'||user?.role==='ADMIN') && (
              <select value={wo.status} onChange={e=>updateStatus.mutate(e.target.value)} className="input w-auto text-sm">
                {STATUSES.map(s=><option key={s}>{s}</option>)}
              </select>
            )}
          </div>
        </div>

        {aiSuggestion && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-purple-600 mb-2 flex items-center gap-1"><Bot className="w-3 h-3" /> AI Analysis</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><p className="text-xs text-purple-500">Suggested Priority</p><p className="font-medium">{aiSuggestion.priority}</p></div>
              <div><p className="text-xs text-purple-500">Category</p><p className="font-medium">{aiSuggestion.category}</p></div>
              <div><p className="text-xs text-purple-500">Est. Cost</p><p className="font-medium">{formatCurrency(aiSuggestion.estimatedCost)}</p></div>
              <div><p className="text-xs text-purple-500">Specialist</p><p className="font-medium">{aiSuggestion.recommendedContractorSpecialty}</p></div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div className="flex gap-2 flex-wrap">
              <Badge label={wo.status.replace('_',' ')} color={statusColors[wo.status]??'badge-gray'} />
              <Badge label={wo.priority} color={priorityColors[wo.priority]??'badge-gray'} />
              <Badge label={wo.category} color="badge-blue" />
            </div>
            {wo.estimatedCost && <div className="flex items-center gap-1 text-green-600 font-medium text-sm"><DollarSign className="w-4 h-4" />Est. {formatCurrency(wo.estimatedCost)}</div>}
          </div>
          <p className="text-gray-700 text-sm leading-relaxed">{wo.description}</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100 text-sm">
            {wo.property && <div><p className="text-xs text-gray-400">Property</p><p className="font-medium">{wo.property.name}</p></div>}
            {wo.assignee && <div><p className="text-xs text-gray-400">Assigned To</p><p className="font-medium">{wo.assignee.firstName} {wo.assignee.lastName}</p></div>}
            {wo.scheduledDate && <div><p className="text-xs text-gray-400">Scheduled</p><p className="font-medium">{formatDate(wo.scheduledDate)}</p></div>}
            {wo.completedAt && <div><p className="text-xs text-gray-400">Completed</p><p className="font-medium text-green-600">{formatDate(wo.completedAt)}</p></div>}
            <div><p className="text-xs text-gray-400">Created</p><p className="font-medium">{formatDate(wo.createdAt)}</p></div>
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold mb-4">Comments ({(Array.isArray(comments) ? comments : []).length})</h3>
          <div className="space-y-4 mb-6">
            {(Array.isArray(comments) ? comments : []).map((c: any) => (
              <div key={c.id} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-xs font-bold flex-shrink-0">
                  {c.author?.firstName?.[0]}{c.author?.lastName?.[0]}
                </div>
                <div className="flex-1 bg-gray-50 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{c.author?.firstName} {c.author?.lastName}</span>
                    <span className="text-xs text-gray-400">{formatDate(c.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-700">{c.content}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <Input value={comment} onChange={e=>setComment(e.target.value)} placeholder="Add a comment..." onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(comment.trim())addComment.mutate(comment.trim());}}} />
            <Button onClick={()=>{if(comment.trim())addComment.mutate(comment.trim());}} loading={addComment.isPending} icon={<Send className="w-4 h-4" />}>Send</Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
