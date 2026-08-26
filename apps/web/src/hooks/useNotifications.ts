import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export function useNotifications() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications?limit=20').then(r => r.data.data),
    refetchInterval: 30_000,
  });
  const { data: unreadData } = useQuery({
    queryKey: ['notifications','unread'],
    queryFn: () => api.get('/notifications/unread-count').then(r => r.data.data.count),
    refetchInterval: 30_000,
  });
  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => { qc.invalidateQueries({queryKey:['notifications']}); },
  });
  const markAllRead = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => { qc.invalidateQueries({queryKey:['notifications']}); },
  });
  return {
    notifications: data?.notifications ?? [],
    unreadCount: unreadData ?? 0,
    isLoading,
    markRead: markRead.mutate,
    markAllRead: markAllRead.mutate,
  };
}
