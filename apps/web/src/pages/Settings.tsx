import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { User, Lock, Bell, Shield, Check } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { cn } from '../lib/utils';

type Tab = 'profile'|'password'|'notifications'|'security';

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label:'8+ characters', pass: password.length >= 8 },
    { label:'Uppercase letter', pass: /[A-Z]/.test(password) },
    { label:'Lowercase letter', pass: /[a-z]/.test(password) },
    { label:'Number', pass: /\d/.test(password) },
    { label:'Special character', pass: /[!@#$%^&*]/.test(password) },
  ];
  const score = checks.filter(c=>c.pass).length;
  const colors = ['bg-red-400','bg-red-400','bg-orange-400','bg-yellow-400','bg-green-400','bg-green-500'];
  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-2">
        {[0,1,2,3,4].map(i=><div key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors', i < score ? colors[score] : 'bg-gray-200')} />)}
      </div>
      <div className="grid grid-cols-2 gap-1">
        {checks.map(c=>(
          <div key={c.label} className={cn('flex items-center gap-1.5 text-xs', c.pass ? 'text-green-600' : 'text-gray-400')}>
            <div className={cn('w-3.5 h-3.5 rounded-full flex items-center justify-center', c.pass ? 'bg-green-100' : 'bg-gray-100')}>
              {c.pass ? <Check className="w-2.5 h-2.5" /> : <span className="w-1 h-1 bg-gray-300 rounded-full" />}
            </div>
            {c.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Settings() {
  const { user, setUser } = useAuthStore();
  const [tab, setTab] = useState<Tab>('profile');
  const [profile, setProfile] = useState({ firstName: user?.firstName||'', lastName: user?.lastName||'', email: user?.email||'', phone: user?.phone||'' });
  const [passwords, setPasswords] = useState({ current:'', next:'', confirm:'' });
  const [notifPrefs, setNotifPrefs] = useState({ emailWorkOrders: true, emailPayments: true, emailInspections: true, pushAll: true });
  const [saved, setSaved] = useState(false);

  const updateProfile = useMutation({
    mutationFn: (d:any) => api.patch('/users/me', d).then(r=>r.data),
    onSuccess: (data) => { if(data.data) setUser(data.data); setSaved(true); setTimeout(()=>setSaved(false), 2500); }
  });

  const changePassword = useMutation({
    mutationFn: (d:any) => api.patch('/users/me/password', d).then(r=>r.data),
    onSuccess: () => { setPasswords({ current:'', next:'', confirm:'' }); setSaved(true); setTimeout(()=>setSaved(false), 2500); }
  });

  const tabs: { key:Tab; label:string; icon: React.ReactNode }[] = [
    { key:'profile', label:'Profile', icon:<User className="w-4 h-4" /> },
    { key:'password', label:'Password', icon:<Lock className="w-4 h-4" /> },
    { key:'notifications', label:'Notifications', icon:<Bell className="w-4 h-4" /> },
    { key:'security', label:'Security', icon:<Shield className="w-4 h-4" /> },
  ];

  return (
    <Layout title="Settings">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your account preferences and security</p>
        </div>

        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {tabs.map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)} className={cn('flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all', tab===t.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {saved && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
            <Check className="w-4 h-4" />Changes saved successfully!
          </div>
        )}

        {tab === 'profile' && (
          <div className="card space-y-5">
            <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-2xl">
                {(user?.firstName?.[0]||'U').toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{user?.firstName} {user?.lastName}</p>
                <p className="text-sm text-gray-500">{user?.email}</p>
                <span className="inline-flex mt-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium">{user?.role}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" value={profile.firstName} onChange={e=>setProfile(p=>({...p,firstName:e.target.value}))} />
              <Input label="Last Name" value={profile.lastName} onChange={e=>setProfile(p=>({...p,lastName:e.target.value}))} />
            </div>
            <Input label="Email Address" type="email" value={profile.email} onChange={e=>setProfile(p=>({...p,email:e.target.value}))} />
            <Input label="Phone Number" type="tel" value={profile.phone} onChange={e=>setProfile(p=>({...p,phone:e.target.value}))} />
            <Button className="w-full" loading={updateProfile.isPending} onClick={()=>updateProfile.mutate(profile)}>Save Changes</Button>
          </div>
        )}

        {tab === 'password' && (
          <div className="card space-y-5">
            <h2 className="font-semibold text-gray-900">Change Password</h2>
            <Input label="Current Password" type="password" value={passwords.current} onChange={e=>setPasswords(p=>({...p,current:e.target.value}))} />
            <div>
              <Input label="New Password" type="password" value={passwords.next} onChange={e=>setPasswords(p=>({...p,next:e.target.value}))} />
              {passwords.next && <PasswordStrength password={passwords.next} />}
            </div>
            <Input label="Confirm New Password" type="password" value={passwords.confirm} onChange={e=>setPasswords(p=>({...p,confirm:e.target.value}))} error={passwords.confirm && passwords.next !== passwords.confirm ? 'Passwords do not match' : ''} />
            <Button className="w-full" loading={changePassword.isPending} disabled={!passwords.current||!passwords.next||passwords.next!==passwords.confirm} onClick={()=>changePassword.mutate({currentPassword:passwords.current,newPassword:passwords.next})}>Update Password</Button>
          </div>
        )}

        {tab === 'notifications' && (
          <div className="card space-y-4">
            <h2 className="font-semibold text-gray-900">Notification Preferences</h2>
            {[
              { key:'emailWorkOrders', label:'Work Order Updates', desc:'Get notified when work orders are created or updated' },
              { key:'emailPayments', label:'Payment Alerts', desc:'Receive notifications for transactions and payments' },
              { key:'emailInspections', label:'Inspection Reminders', desc:'Get reminded about scheduled inspections' },
              { key:'pushAll', label:'Push Notifications', desc:'Enable real-time push notifications in the browser' },
            ].map(pref=>(
              <div key={pref.key} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{pref.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{pref.desc}</p>
                </div>
                <button onClick={()=>setNotifPrefs(p=>({...p,[pref.key]:!p[pref.key as keyof typeof p]}))} className={cn('relative w-11 h-6 rounded-full transition-colors', notifPrefs[pref.key as keyof typeof notifPrefs] ? 'bg-indigo-600' : 'bg-gray-300')}>
                  <div className={cn('absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', notifPrefs[pref.key as keyof typeof notifPrefs] ? 'translate-x-5' : 'translate-x-0.5')} />
                </button>
              </div>
            ))}
            <Button className="w-full" onClick={()=>{setSaved(true); setTimeout(()=>setSaved(false),2500);}}>Save Preferences</Button>
          </div>
        )}

        {tab === 'security' && (
          <div className="card space-y-4">
            <h2 className="font-semibold text-gray-900">Security Overview</h2>
            <div className="space-y-3">
              {[
                { label:'Two-Factor Authentication', status:'Not enabled', action:'Enable', color:'orange' },
                { label:'Active Sessions', status:'1 active session', action:'Manage', color:'blue' },
                { label:'API Access', status:'No active tokens', action:'Generate Token', color:'gray' },
              ].map(item=>(
                <div key={item.label} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.status}</p>
                  </div>
                  <Button variant="outline" size="sm">{item.action}</Button>
                </div>
              ))}
            </div>
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-sm font-medium text-amber-800">Security Tip</p>
              <p className="text-xs text-amber-600 mt-1">Enable two-factor authentication to add an extra layer of protection to your account.</p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
