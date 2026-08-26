import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap, Mail } from 'lucide-react';
import api from '../lib/api';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try { await api.post('/auth/forgot-password', { email }); setSent(true); }
    catch (_) { setSent(true); }
    finally { setLoading(false); }
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary-900 to-primary-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-primary-600 rounded-xl mb-3"><Zap className="w-6 h-6 text-white" /></div>
          <h2 className="text-xl font-semibold">Reset your password</h2>
        </div>
        {sent ? (
          <div className="text-center">
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-4 mb-6">
              If that email exists, a reset link has been sent. Check your inbox.
            </div>
            <Link to="/login" className="text-primary-600 font-medium">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Email address" type="email" value={email} onChange={e=>setEmail(e.target.value)} leftIcon={<Mail className="w-4 h-4" />} required />
            <Button type="submit" loading={loading} className="w-full">Send Reset Link</Button>
            <p className="text-center text-sm"><Link to="/login" className="text-primary-600">Back to sign in</Link></p>
          </form>
        )}
      </div>
    </div>
  );
}
