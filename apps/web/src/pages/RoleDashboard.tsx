import React from 'react';
import { Link } from 'react-router-dom';
import { Banknote, Bell, Building2, ClipboardCheck, LayoutDashboard, Map, MessageSquare, ShieldCheck, Users, Wrench } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useAuthStore } from '../store/authStore';
import type { UserRole } from '../types';

const roleConfig: Record<UserRole, { title: string; subtitle: string; focus: string[]; actions: Array<{ label: string; to: string; icon: any; accent: string }> }> = {
  OWNER: {
    title: 'Owner workspace',
    subtitle: 'Track performance, properties, and recurring service needs in one place.',
    focus: ['Portfolio health', 'Leasing & rent', 'Preventative maintenance'],
    actions: [
      { label: 'Properties', to: '/properties', icon: Building2, accent: 'bg-blue-500' },
      { label: 'Map view', to: '/map', icon: Map, accent: 'bg-violet-500' },
      { label: 'Financial', to: '/financial', icon: Banknote, accent: 'bg-emerald-500' },
    ],
  },
  MANAGER: {
    title: 'Manager workspace',
    subtitle: 'Keep daily operations moving with maintenance, inspections, and team status.',
    focus: ['Work order queue', 'Inspections', 'Vendor coordination'],
    actions: [
      { label: 'Work orders', to: '/work-orders', icon: Wrench, accent: 'bg-amber-500' },
      { label: 'Inspections', to: '/inspections', icon: ClipboardCheck, accent: 'bg-cyan-500' },
      { label: 'Messages', to: '/messages', icon: MessageSquare, accent: 'bg-indigo-500' },
    ],
  },
  TENANT: {
    title: 'Tenant portal',
    subtitle: 'View requests, payment activity, and your property status quickly and clearly.',
    focus: ['Service requests', 'Payments', 'Communication'],
    actions: [
      { label: 'Messages', to: '/messages', icon: MessageSquare, accent: 'bg-indigo-500' },
      { label: 'Work orders', to: '/work-orders', icon: Wrench, accent: 'bg-amber-500' },
      { label: 'Financial', to: '/financial', icon: Banknote, accent: 'bg-emerald-500' },
    ],
  },
  CONTRACTOR: {
    title: 'Contractor workspace',
    subtitle: 'Manage assigned work, route timing, and job communication without switching tools.',
    focus: ['Assigned jobs', 'Scheduling', 'Field updates'],
    actions: [
      { label: 'Work orders', to: '/work-orders', icon: Wrench, accent: 'bg-amber-500' },
      { label: 'Notifications', to: '/notifications', icon: Bell, accent: 'bg-rose-500' },
      { label: 'Messages', to: '/messages', icon: MessageSquare, accent: 'bg-indigo-500' },
    ],
  },
  ADMIN: {
    title: 'Admin center',
    subtitle: 'Monitor health, user activity, financials, and compliance across the platform.',
    focus: ['System health', 'Users', 'Risk and operations'],
    actions: [
      { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, accent: 'bg-sky-500' },
      { label: 'Reports', to: '/reports', icon: ShieldCheck, accent: 'bg-fuchsia-500' },
      { label: 'Users', to: '/tenants', icon: Users, accent: 'bg-slate-600' },
    ],
  },
  VENDOR: {
    title: 'Vendor workspace',
    subtitle: 'Review opportunities, resolve service requests, and track support outcomes.',
    focus: ['Service requests', 'Performance', 'Payments'],
    actions: [
      { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, accent: 'bg-sky-500' },
      { label: 'Messages', to: '/messages', icon: MessageSquare, accent: 'bg-indigo-500' },
      { label: 'Financial', to: '/financial', icon: Banknote, accent: 'bg-emerald-500' },
    ],
  },
  UTILITY_PROVIDER: {
    title: 'Utility operations',
    subtitle: 'Track utility usage, monitors, and service coordination with resident-facing teams.',
    focus: ['Consumption', 'Service alerts', 'Billing status'],
    actions: [
      { label: 'Properties', to: '/properties', icon: Building2, accent: 'bg-blue-500' },
      { label: 'Map view', to: '/map', icon: Map, accent: 'bg-violet-500' },
      { label: 'Messages', to: '/messages', icon: MessageSquare, accent: 'bg-indigo-500' },
    ],
  },
  INSURANCE_PARTNER: {
    title: 'Insurance partner desk',
    subtitle: 'Monitor claims, inspection coverage, and insured property risk in real time.',
    focus: ['Claims pipeline', 'Inspections', 'Renewal checks'],
    actions: [
      { label: 'Inspections', to: '/inspections', icon: ClipboardCheck, accent: 'bg-cyan-500' },
      { label: 'Reports', to: '/reports', icon: ShieldCheck, accent: 'bg-fuchsia-500' },
      { label: 'Messages', to: '/messages', icon: MessageSquare, accent: 'bg-indigo-500' },
    ],
  },
  FINANCIAL_INSTITUTION: {
    title: 'Finance partner workspace',
    subtitle: 'Review payment flows, tenant activity, and portfolio performance for financing partners.',
    focus: ['Portfolio analytics', 'Payment posture', 'Risk tracking'],
    actions: [
      { label: 'Financial', to: '/financial', icon: Banknote, accent: 'bg-emerald-500' },
      { label: 'Reports', to: '/reports', icon: ShieldCheck, accent: 'bg-fuchsia-500' },
      { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, accent: 'bg-sky-500' },
    ],
  },
  ENTERPRISE: {
    title: 'Enterprise network',
    subtitle: 'Coordinate portfolio-wide operations, compliance, and service quality across business units.',
    focus: ['Multi-site oversight', 'Performance', 'Operational governance'],
    actions: [
      { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, accent: 'bg-sky-500' },
      { label: 'Properties', to: '/properties', icon: Building2, accent: 'bg-blue-500' },
      { label: 'Reports', to: '/reports', icon: ShieldCheck, accent: 'bg-fuchsia-500' },
    ],
  },
  MUNICIPAL_PARTNER: {
    title: 'Municipal partner portal',
    subtitle: 'Review compliance, community service, and property health across public-facing assets.',
    focus: ['Compliance', 'Inspection readiness', 'Public records'],
    actions: [
      { label: 'Inspections', to: '/inspections', icon: ClipboardCheck, accent: 'bg-cyan-500' },
      { label: 'Map view', to: '/map', icon: Map, accent: 'bg-violet-500' },
      { label: 'Reports', to: '/reports', icon: ShieldCheck, accent: 'bg-fuchsia-500' },
    ],
  },
};

export function RoleDashboard({ role }: { role: UserRole }) {
  const { user } = useAuthStore();
  const config = roleConfig[role] || roleConfig.OWNER;

  return (
    <Layout title={`${config.title}`}>
      <div className="space-y-6">
        <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-900 to-sky-800 p-6 text-white shadow-lg">
          <p className="text-xs uppercase tracking-[0.2em] text-sky-200">Simply Service</p>
          <h1 className="mt-2 text-3xl font-bold">{config.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-200">{config.subtitle}</p>
          <div className="mt-4 flex items-center gap-3 text-sm text-sky-100">
            <span className="rounded-full bg-white/10 px-3 py-1">Signed in as {user?.firstName} {user?.lastName}</span>
            <span className="rounded-full bg-white/10 px-3 py-1">Role: {role}</span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {config.focus.map((item) => (
            <div key={item} className="card border-l-4 border-indigo-500">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Priority</p>
              <h2 className="mt-3 text-lg font-semibold text-gray-900">{item}</h2>
              <p className="mt-2 text-sm text-gray-500">Actionable updates are surfaced here to keep your workflow efficient.</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {config.actions.map(({ label, to, icon: Icon, accent }) => (
            <Link key={to} to={to} className="card group hover:shadow-card-hover transition-all">
              <div className="flex items-center justify-between">
                <div className={`rounded-xl p-3 text-white ${accent}`}><Icon className="h-5 w-5" /></div>
                <span className="text-sm font-semibold text-primary-600 group-hover:underline">Open</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">{label}</h3>
              <p className="mt-1 text-sm text-gray-500">Navigate to the relevant workspace for {role.toLowerCase()} tasks.</p>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
}

export default RoleDashboard;
