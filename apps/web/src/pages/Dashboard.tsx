import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Wrench, DollarSign, Users, AlertTriangle, CheckCircle2, Clock, TrendingUp } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { StatCard } from '../components/ui/StatCard';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import { formatCurrency, formatDate, priorityColors, statusColors, toArray } from '../lib/utils';
import { WorkOrder, Transaction, Notification } from '../types';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { user } = useAuthStore();

  const { data: props } = useQuery({ queryKey:['properties','summary'], queryFn:()=>api.get('/properties?limit=5').then(r=>r.data.data) });
  const { data: woData } = useQuery({ queryKey:['workOrders','recent'], queryFn:()=>api.get('/work-orders?limit=5').then(r=>r.data.data) });
  const { data: txData } = useQuery({ queryKey:['financial','recent'], queryFn:()=>api.get('/financial/transactions?limit=5').then(r=>r.data.data), enabled: user?.role!=='TENANT' });
  const { data: notifData } = useQuery({ queryKey:['notifications','recent'], queryFn:()=>api.get('/notifications?limit=5&isRead=false').then(r=>r.data.data) });

  const properties = toArray<any>(props?.properties ?? props?.data?.properties);
  const workOrders: WorkOrder[] = toArray<WorkOrder>(woData?.workOrders ?? woData?.data?.workOrders);
  const transactions: Transaction[] = toArray<Transaction>(txData?.transactions ?? txData?.data?.transactions);
  const notifications: Notification[] = toArray<Notification>(notifData?.notifications ?? notifData?.data?.notifications);

  const openWOs = workOrders.filter(w => w.status === 'OPEN').length;
  const inProgressWOs = workOrders.filter(w => w.status === 'IN_PROGRESS').length;
  const emergencyWOs = workOrders.filter(w => w.priority === 'EMERGENCY').length;

  return (
    <Layout title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${user?.firstName}`}>
      <div className="space-y-6">
        {emergencyWOs > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-red-700 text-sm font-medium">{emergencyWOs} emergency work order{emergencyWOs>1?'s':''} require immediate attention</p>
            <Link to="/work-orders?priority=EMERGENCY" className="ml-auto text-red-600 text-sm font-semibold hover:underline">View →</Link>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Properties" value={properties.length} icon={Building2} color="bg-blue-500" />
          <StatCard title="Open Work Orders" value={openWOs} icon={Wrench} color="bg-orange-500" />
          <StatCard title="In Progress" value={inProgressWOs} icon={Clock} color="bg-yellow-500" />
          {user?.role !== 'TENANT' && user?.role !== 'CONTRACTOR' && (
            <StatCard title="Active Leases" value={properties.reduce((s:number,p:any)=>s+(p._count?.leases??0),0)} icon={Users} color="bg-green-500" />
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Recent Work Orders</h2>
              <Link to="/work-orders" className="text-primary-600 text-sm hover:underline">View all →</Link>
            </div>
            {workOrders.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">No work orders</p>
            ) : (
              <div className="space-y-3">
                {workOrders.map(wo => (
                  <Link key={wo.id} to={`/work-orders/${wo.id}`} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors group">
                    <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${wo.priority==='EMERGENCY'?'bg-red-500':wo.priority==='HIGH'?'bg-orange-500':wo.priority==='MEDIUM'?'bg-yellow-500':'bg-gray-300'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate group-hover:text-primary-600">{wo.title}</p>
                      <p className="text-xs text-gray-500 truncate">{wo.property?.name} · {formatDate(wo.createdAt)}</p>
                    </div>
                    <span className={`${statusColors[wo.status]??'badge-gray'}`}>{wo.status.replace('_',' ')}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            {notifications.length > 0 && (
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold">Unread Alerts</h2>
                  <Link to="/notifications" className="text-primary-600 text-sm hover:underline">All →</Link>
                </div>
                <div className="space-y-2">
                  {notifications.slice(0,4).map(n => (
                    <div key={n.id} className="p-2 bg-gray-50 rounded-lg">
                      <p className="text-xs font-medium text-gray-800">{n.title}</p>
                      <p className="text-xs text-gray-500 truncate">{n.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {transactions.length > 0 && (
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold">Recent Transactions</h2>
                  <Link to="/financial" className="text-primary-600 text-sm hover:underline">All →</Link>
                </div>
                <div className="space-y-2">
                  {transactions.slice(0,4).map(t => (
                    <div key={t.id} className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{t.description||t.type}</p>
                        <p className="text-xs text-gray-400">{formatDate(t.createdAt)}</p>
                      </div>
                      <span className={`text-xs font-bold ml-2 ${t.type==='INCOME'||t.type==='RENT'?'text-green-600':'text-red-600'}`}>
                        {t.type==='EXPENSE'?'-':'+'}{formatCurrency(t.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
