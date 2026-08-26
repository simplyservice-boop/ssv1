import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', password:'', phone:'', role:'TENANT' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement>) => setForm(f=>({...f,[k]:e.target.value}));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try { await register(form); }
    catch (err: any) { setError(err.response?.data?.message || 'Registration failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary-900 via-secondary-800 to-primary-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl mb-4"><Zap className="w-8 h-8 text-white" /></div>
          <h1 className="text-3xl font-bold text-white">Simply Service</h1>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Create your account</h2>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="First name" value={form.firstName} onChange={set('firstName')} required />
              <Input label="Last name" value={form.lastName} onChange={set('lastName')} required />
            </div>
            <Input label="Email" type="email" value={form.email} onChange={set('email')} required />
            <Input label="Password" type="password" value={form.password} onChange={set('password')} hint="Min 8 characters" required />
            <Input label="Phone" type="tel" value={form.phone} onChange={set('phone')} placeholder="412-555-0000" />
            <div>
              <label className="label">Role</label>
              <select value={form.role} onChange={set('role')} className="input">
                <option value="TENANT">Tenant</option>
                <option value="OWNER">Property Owner</option>
                <option value="MANAGER">Property Manager</option>
                <option value="CONTRACTOR">Contractor</option>
                <option value="VENDOR">Vendor</option>
                <option value="UTILITY_PROVIDER">Utility Provider</option>
                <option value="INSURANCE_PARTNER">Insurance Partner</option>
                <option value="FINANCIAL_INSTITUTION">Financial Institution</option>
                <option value="ENTERPRISE">Enterprise</option>
                <option value="MUNICIPAL_PARTNER">Municipal Partner</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <Button type="submit" loading={loading} className="w-full">Create Account</Button>
          </form>
          <p className="text-center text-sm text-gray-600 mt-6">
            Already have an account? <Link to="/login" className="text-primary-600 font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
