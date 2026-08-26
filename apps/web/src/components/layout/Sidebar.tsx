import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Wrench, DollarSign, MessageSquare,
  ClipboardCheck, FileText, Users, Bot, Bell, Settings, LogOut, Zap, Map,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import api from '../../lib/api';

const links = [
  { to:'/dashboard',     icon:LayoutDashboard, label:'Dashboard',    roles:['OWNER','MANAGER','TENANT','CONTRACTOR','ADMIN'] },
  { to:'/properties',    icon:Building2,       label:'Properties',   roles:['OWNER','MANAGER','ADMIN'] },
  { to:'/work-orders',   icon:Wrench,          label:'Work Orders',  roles:['OWNER','MANAGER','TENANT','CONTRACTOR','ADMIN'] },
  { to:'/financial',     icon:DollarSign,      label:'Financial',    roles:['OWNER','MANAGER','ADMIN'] },
  { to:'/messages',      icon:MessageSquare,   label:'Messages',     roles:['OWNER','MANAGER','TENANT','CONTRACTOR','ADMIN'] },
  { to:'/inspections',   icon:ClipboardCheck,  label:'Inspections',  roles:['OWNER','MANAGER','ADMIN'] },
  { to:'/documents',     icon:FileText,        label:'Documents',    roles:['OWNER','MANAGER','TENANT','ADMIN'] },
  { to:'/contractors',   icon:Users,           label:'Contractors',  roles:['OWNER','MANAGER','ADMIN'] },
  { to:'/ai-assistant',  icon:Bot,             label:'AI Assistant', roles:['OWNER','MANAGER','ADMIN'] },
  { to:'/map',           icon:Map,             label:'Map View',     roles:['OWNER','MANAGER','TENANT','CONTRACTOR','ADMIN'] },
  { to:'/notifications', icon:Bell,            label:'Notifications',roles:['OWNER','MANAGER','TENANT','CONTRACTOR','ADMIN'] },
  { to:'/settings',      icon:Settings,        label:'Settings',     roles:['OWNER','MANAGER','TENANT','CONTRACTOR','ADMIN'] },
];

export function Sidebar() {
  const { user } = useAuthStore();
  const { sidebarOpen } = useUIStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch (_) {}
    useAuthStore.getState().logout();
    navigate('/login');
  };

  const allowed = links.filter(l => user && l.roles.includes(user.role));

  return (
    <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} transition-all duration-300 bg-secondary-900 flex flex-col h-screen fixed left-0 top-0 z-30 overflow-hidden`}>
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
        <div className="bg-primary-600 rounded-lg p-1.5 flex-shrink-0"><Zap className="w-5 h-5 text-white" /></div>
        {sidebarOpen && <span className="text-white font-bold text-base whitespace-nowrap">Simply Service</span>}
      </div>
      <nav className="flex-1 py-4 overflow-y-auto">
        {allowed.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-colors text-sm font-medium
               ${isActive ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`
            }
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span className="whitespace-nowrap">{label}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-white/10">
        {sidebarOpen && user && (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {user.firstName[0]}{user.lastName[0]}
            </div>
            <div className="min-w-0">
              <p className="text-white text-xs font-medium truncate">{user.firstName} {user.lastName}</p>
              <p className="text-gray-400 text-xs truncate">{user.role}</p>
            </div>
          </div>
        )}
        <button onClick={handleLogout} className="flex items-center gap-3 text-gray-400 hover:text-white text-sm w-full px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors">
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {sidebarOpen && 'Sign out'}
        </button>
      </div>
    </aside>
  );
}
