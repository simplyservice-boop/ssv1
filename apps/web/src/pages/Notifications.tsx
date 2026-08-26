import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck, Trash2, Filter } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import api from '../lib/api';
import { formatDate, cn, toArray } from '../lib/utils';

const TYPE_ICONS: Record<string,string> = {
  WORK_ORDER: '🔧', PAYMENT: '💳', LEASE: '📋', INSPECTION: '🔍',
  MAINTENANCE: '⚙️', MESSAGE: '💬', SYSTEM: '🔔', DOCUMENT: '📄',
};
const TYPE_COLORS: Record<string,string> = {
  WORK_ORDER:'warning', PAYMENT:'success', LEASE:'primary',
  INSPECTION:'default', MAINTENANCE:'warning', MESSAGE:'primary', SYSTEM:'default', DOCUMENT:'default',
};

export default function Notifications() {
  const qc = useQueryClient();
  const [typeFilter, setTypeFilter] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', typeFilter, unreadOnly],
    queryFn: () => api.get('/notifications', { params: { ...(typeFilter ? {type:typeFilter}:{}), ...(unreadOnly ? {unread:true}:{}) } }).then(r=>r.data),
    refetchInterval: 30000
  });

  const markRead = useMutation({
    mutationFn: (id:string) => api.patch(`/notifications/${id}/read`).then(r=>r.data),
    onSuccess: () => qc.invalidateQueries({queryKey:['notifications']})
  });

  const markAllRead = useMutation({
    mutationFn: () => api.patch('/notifications/read-all').then(r=>r.data),
    onSuccess: () => qc.invalidateQueries({queryKey:['notifications']})
  });

  const deleteNotif = useMutation({
    mutationFn: (id:string) => api.delete(`/notifications/${id}`).then(r=>r.data),
    onSuccess: () => qc.invalidateQueries({queryKey:['notifications']})
  });

  const notifications = toArray<any>(data?.data?.notifications ?? data?.notifications);
  const unreadCount = notifications.filter((n:any)=>!n.isRead).length;

  return (
    <Layout title="Notifications">
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            {unreadCount > 0 && <Badge variant="danger" size="sm">{unreadCount} unread</Badge>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={<CheckCheck className="w-4 h-4" />} onClick={()=>markAllRead.mutate()} loading={markAllRead.isPending}>Mark All Read</Button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={()=>setUnreadOnly(!unreadOnly)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', unreadOnly ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>Unread Only</button>
          <div className="w-px h-4 bg-gray-200" />
          {['','WORK_ORDER','PAYMENT','LEASE','INSPECTION','MESSAGE','SYSTEM'].map(t=>(
            <button key={t} onClick={()=>setTypeFilter(t)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', typeFilter===t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>{t||'All Types'}</button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent" /></div>
        ) : notifications.length === 0 ? (
          <EmptyState icon={<Bell className="w-12 h-12" />} title="No notifications" description="You're all caught up! Notifications will appear here." />
        ) : (
          <div className="space-y-2">
            {notifications.map((n:any)=>(
              <div key={n.id} className={cn('card flex items-start gap-4 transition-all', !n.isRead && 'border-l-4 border-l-indigo-500 bg-indigo-50/30')}>
                <div className="text-2xl flex-shrink-0 w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                  {TYPE_ICONS[n.type]||'🔔'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className={cn('text-sm', n.isRead ? 'text-gray-700' : 'text-gray-900 font-semibold')}>{n.title}</p>
                      {n.message && <p className="text-sm text-gray-500 mt-0.5">{n.message}</p>}
                    </div>
                    <Badge variant={TYPE_COLORS[n.type]||'default'} size="sm" className="flex-shrink-0">{(n.type||'').replace(/_/g,' ')}</Badge>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{formatDate(n.createdAt)}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!n.isRead && (
                    <button onClick={()=>markRead.mutate(n.id)} className="p-1.5 rounded-lg hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors" title="Mark as read">
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={()=>deleteNotif.mutate(n.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
