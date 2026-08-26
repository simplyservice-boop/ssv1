import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingUp, FileBarChart, Download, RefreshCcw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import { Layout } from '../components/layout/Layout';
import { StatCard } from '../components/ui/StatCard';
import { Button } from '../components/ui/Button';
import api from '../lib/api';
import { formatCurrency } from '../lib/utils';

const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];

export default function Reports() {
  const { data: summary, isLoading, refetch } = useQuery({ queryKey:['reports-summary'], queryFn: () => api.get('/financial/summary').then(r=>r.data) });
  const { data: woData } = useQuery({ queryKey:['wo-summary'], queryFn: () => api.get('/work-orders', { params:{ limit:100 } }).then(r=>r.data) });
  const { data: propData } = useQuery({ queryKey:['properties-report'], queryFn: () => api.get('/properties', { params:{ limit:100 } }).then(r=>r.data) });

  const stats = summary?.data || {};
  const workOrders = Array.isArray(woData?.data?.workOrders) ? woData.data.workOrders : [];
  const properties = Array.isArray(propData?.data?.properties) ? propData.data.properties : [];

  const woByStatus = Object.entries(
    workOrders.reduce((acc:any, wo:any) => { acc[wo.status] = (acc[wo.status]||0)+1; return acc; }, {})
  ).map(([name, value]) => ({ name: name.replace(/_/g,' '), value }));

  const woPriority = Object.entries(
    workOrders.reduce((acc:any, wo:any) => { acc[wo.priority] = (acc[wo.priority]||0)+1; return acc; }, {})
  ).map(([name, value]) => ({ name, value }));

  const propByType = Object.entries(
    properties.reduce((acc:any, p:any) => { acc[p.type||'OTHER'] = (acc[p.type||'OTHER']||0)+1; return acc; }, {})
  ).map(([name, value]) => ({ name: name.replace(/_/g,' '), value }));

  const monthly = Array.isArray(stats.monthly) ? stats.monthly : [];

  return (
    <Layout title="Reports">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
            <p className="text-sm text-gray-500 mt-1">Portfolio performance and operational insights</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" icon={<RefreshCcw className="w-4 h-4" />} onClick={()=>refetch()} loading={isLoading}>Refresh</Button>
            <Button variant="outline" icon={<Download className="w-4 h-4" />}>Export PDF</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Properties" value={properties.length} icon={<FileBarChart className="w-5 h-5" />} color="blue" />
          <StatCard title="Total Revenue" value={formatCurrency(stats.totalIncome||0)} icon={<TrendingUp className="w-5 h-5" />} color="green" />
          <StatCard title="Total Expenses" value={formatCurrency(stats.totalExpenses||0)} icon={<BarChart3 className="w-5 h-5" />} color="red" />
          <StatCard title="Net Income" value={formatCurrency((stats.totalIncome||0)-(stats.totalExpenses||0))} icon={<TrendingUp className="w-5 h-5" />} color="purple" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {monthly.length > 0 && (
            <div className="card">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Monthly Revenue Trend</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{fontSize:11}} />
                  <YAxis tick={{fontSize:11}} tickFormatter={(v)=>`$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v:any)=>formatCurrency(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="income" name="Income" stroke="#10b981" strokeWidth={2} dot={{r:3}} />
                  <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2} dot={{r:3}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {woByStatus.length > 0 && (
            <div className="card">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Work Orders by Status</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={woByStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                    {woByStatus.map((_:any,i:number)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {woPriority.length > 0 && (
            <div className="card">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Work Orders by Priority</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={woPriority} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{fontSize:11}} />
                  <YAxis dataKey="name" type="category" tick={{fontSize:11}} width={80} />
                  <Tooltip />
                  <Bar dataKey="value" name="Count" radius={[0,4,4,0]}>
                    {woPriority.map((_:any,i:number)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {propByType.length > 0 && (
            <div className="card">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Properties by Type</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={propByType}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{fontSize:11}} />
                  <YAxis tick={{fontSize:11}} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" name="Count" radius={[4,4,0,0]}>
                    {propByType.map((_:any,i:number)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {workOrders.length === 0 && properties.length === 0 && !isLoading && (
          <div className="card text-center py-16">
            <BarChart3 className="w-16 h-16 text-gray-200 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No Data Yet</h3>
            <p className="text-sm text-gray-500">Add properties and work orders to see analytics here.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
