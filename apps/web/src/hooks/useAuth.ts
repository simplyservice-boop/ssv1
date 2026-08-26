import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

export function useAuth() {
  const { user, token, setAuth, logout: storeLogout } = useAuthStore();
  const navigate = useNavigate();

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    setAuth(data.data.user, data.data.accessToken);
    toast.success(`Welcome back, ${data.data.user.firstName}!`);
    navigate('/dashboard');
  }, [setAuth, navigate]);

  const register = useCallback(async (payload: Record<string,string>) => {
    const { data } = await api.post('/auth/register', payload);
    setAuth(data.data.user, data.data.accessToken);
    toast.success('Account created! Welcome to Simply Service.');
    navigate('/dashboard');
  }, [setAuth, navigate]);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch (_) {}
    storeLogout();
    navigate('/login');
  }, [storeLogout, navigate]);

  return { user, token, isAuthenticated: !!token, login, register, logout };
}
