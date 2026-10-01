import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

const roleRouteMap = {
  OWNER: '/owner',
  MANAGER: '/manager',
  TENANT: '/tenant',
  CONTRACTOR: '/contractor',
  VENDOR: '/vendor',
  UTILITY_PROVIDER: '/utility',
  INSURANCE_PARTNER: '/insurance',
  FINANCIAL_INSTITUTION: '/finance',
  ENTERPRISE: '/enterprise',
  MUNICIPAL_PARTNER: '/municipal',
  ADMIN: '/admin',
} as const;

export function useAuth() {
  const { user, token, setAuth, logout: storeLogout } = useAuthStore();
  const navigate = useNavigate();

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    const authUser = data.data.user;
    setAuth(authUser, data.data.accessToken);
    toast.success(`Welcome back, ${authUser.firstName}!`);
    navigate(roleRouteMap[authUser.role as keyof typeof roleRouteMap] || '/dashboard');
  }, [setAuth, navigate]);

  const register = useCallback(async (payload: Record<string,string>) => {
    const { data } = await api.post('/auth/register', payload);
    const authUser = data.data.user;
    setAuth(authUser, data.data.accessToken);
    toast.success('Account created! Welcome to Simply Service.');
    navigate(roleRouteMap[authUser.role as keyof typeof roleRouteMap] || '/dashboard');
  }, [setAuth, navigate]);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch (_) {}
    storeLogout();
    navigate('/login');
  }, [storeLogout, navigate]);

  return { user, token, isAuthenticated: !!token, login, register, logout };
}
