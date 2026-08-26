import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DollarSign, TrendingUp, TrendingDown, Plus, Download, Filter } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { Layout } from '../components/layout/Layout';
import { StatCard } from '../components/ui/StatCard';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import api from '../lib/api';
import { formatCurrency, formatDate } from '../lib/utils';

const TYPES = ['RENT','DEPOSIT','MAINTENANCE','UTILITY','INSURANCE','TAX','MANAGEMENT_FEE','OTHER_INCOME','OTHER_EXPENSE'];
const CATS  = ['INCOME','EXPENSE'];

function CreateTransactionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ type:'RENT', category:'INCOME', amount:'', description:'', propertyId:'' });
  const { data: props } = useQuery({ queryKey:['properties-list'], queryFn: () => api.get('/properties').then(r=>r.data) });
  const propertyOptions = Array.isArray(props?.data?.properties) ? props.data.properties : [];
  const create = useMutation({
    mutationFn: (d:any) => api.post('/financial/transactions', d).then(r=>r.data),
    onSuccess: () => { qc.invalidateQueries({queryKey:['transactions']}); onClose(); setForm({ type:'RENT', category:'INCOME', amount:'', description:'', propertyId:'' }); }
  });
  const set = (k:string,v:string) => setForm(p=>({...p,[k]:v}));
  return (
    <Modal open={open} onClose={onClose} title="Record Transaction">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
          <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.propertyId} onChange={e=>set('propertyId',e.target.value)}>
            <option value="">Select property...</option>
            {propertyOptions.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.category} onChange={e=>set('category',e.target.value)}>
              {CATS.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.type} onChange={e=>set('type',e.target.value)}>
              {TYPES.map(t=><option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
            </select>
          </div>
        </div>
        <Input label="Amount ($)" type="number" placeholder="0.00" value={form.amount} onChange={e=>set('amount',e.target.value)} />
        <Input label="Description" placeholder="Transaction description..." value={form.description} onChange={e=>set('description',e.target.value)} />
        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" loading={create.isPending} onClick={()=>create.mutate({...form, amount:parseFloat(form.amount)})}>Save Transaction</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function Financial() {
  const [showCreate, setShowCreate] = useState(false);
  const [catFilter, setCatFilter] = useState('');
  const { data, isLoading } = useQuery({ queryKey:['transactions', catFilter], queryFn: () => api.get('/financial/transactions', { params: catFilter ? { category: catFilter } : {} }).then(r=>r.data) });
  const { data: summary } = useQuery({ queryKey:['financial-summary'], queryFn: () => api.get('/financial/summary').then(r=>r.data) });

  const transactions = Array.isArray(data?.data?.transactions) ? data.data.transactions : [];
  const stats = summary?.data || {};

  const chartData = stats.monthly || [];

  const catColor = (cat:string) => cat === 'INCOME' ? 'success' : cat === 'EXPENSE' ? 'danger' : 'default';

  return (
    <Layout title="Financial">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Financial Overview</h1>
            <p className="text-sm text-gray-500 mt-1">Track income, expenses, and portfolio performance</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" icon={<Download className="w-4 h-4" />}>Export</Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={()=>setShowCreate(true)}>Record Transaction</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="Total Income" value={formatCurrency(stats.totalIncome||0)} icon={<TrendingUp className="w-5 h-5" />} trend={{ value: stats.incomeGrowth||0, label:'vs last month' }} color="green" />
          <StatCard title="Total Expenses" value={formatCurrency(stats.totalExpenses||0)} icon={<TrendingDown className="w-5 h-5" />} color="red" />
          <StatCard title="Net Operating Income" value={formatCurrency((stats.totalIncome||0)-(stats.totalExpenses||0))} icon={<DollarSign className="w-5 h-5" />} color="blue" />
          <StatCard title="Transactions" value={stats.count||transactions.length} icon={<Filter className="w-5 h-5" />} color="purple" />
        </div>

        {chartData.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Revenue vs Expenses (Monthly)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{fontSize:12}} />
                  <YAxis tick={{fontSize:12}} tickFormatter={(v)=>`$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v:any)=>formatCurrency(v)} />
                  <Legend />
                  <Bar dataKey="income" name="Income" fill="#10b981" radius={[4,4,0,0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Net Income Trend</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{fontSize:12}} />
                  <YAxis tick={{fontSize:12}} tickFormatter={(v)=>`$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v:any)=>formatCurrency(v)} />
                  <Area type="monotone" dataKey="net" name="Net" stroke="#6366f1" fill="#ede9fe" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Transactions</h3>
            <div className="flex gap-2">
              {['','INCOME','EXPENSE'].map(c=>(
                <button key={c} onClick={()=>setCatFilter(c)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${catFilter===c ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{c||'All'}</button>
              ))}
            </div>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Date</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Description</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Type</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Category</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Property</th>
                    <th className="text-right py-3 px-2 font-medium text-gray-500">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions.map((t:any)=>(
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="py-3 px-2 text-gray-500 whitespace-nowrap">{formatDate(t.transactionDate||t.createdAt)}</td>
                      <td className="py-3 px-2 font-medium text-gray-900 max-w-xs truncate">{t.description||'—'}</td>
                      <td className="py-3 px-2"><Badge variant="default" size="sm">{(t.type||'').replace(/_/g,' ')}</Badge></td>
                      <td className="py-3 px-2"><Badge variant={catColor(t.category)} size="sm">{t.category}</Badge></td>
                      <td className="py-3 px-2 text-gray-500">{t.property?.name||'—'}</td>
                      <td className={`py-3 px-2 text-right font-semibold ${t.category==='INCOME' ? 'text-green-600' : 'text-red-600'}`}>{t.category==='INCOME' ? '+' : '-'}{formatCurrency(t.amount)}</td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr><td colSpan={6} className="py-12 text-center text-gray-400">No transactions found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <CreateTransactionModal open={showCreate} onClose={()=>setShowCreate(false)} />
    </Layout>
  );
}
