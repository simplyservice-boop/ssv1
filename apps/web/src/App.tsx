import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import Landing from './pages/Landing';

const Login          = lazy(() => import('./pages/Login'));
const Register       = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const Dashboard      = lazy(() => import('./pages/Dashboard'));
const Properties     = lazy(() => import('./pages/Properties'));
const PropertyDetail = lazy(() => import('./pages/PropertyDetail'));
const WorkOrders     = lazy(() => import('./pages/WorkOrders'));
const WorkOrderDetail= lazy(() => import('./pages/WorkOrderDetail'));
const Financial      = lazy(() => import('./pages/Financial'));
const Messages       = lazy(() => import('./pages/Messages'));
const Inspections    = lazy(() => import('./pages/Inspections'));
const Documents      = lazy(() => import('./pages/Documents'));
const Contractors    = lazy(() => import('./pages/Contractors'));
const AIAssistant    = lazy(() => import('./pages/AIAssistant'));
const Notifications  = lazy(() => import('./pages/Notifications'));
const Settings       = lazy(() => import('./pages/Settings'));
const Profile        = lazy(() => import('./pages/Profile'));
const MapView        = lazy(() => import('./pages/MapView'));
const Tenants        = lazy(() => import('./pages/Tenants'));
const Reports        = lazy(() => import('./pages/Reports'));

const Spinner = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 4000, style: { borderRadius: '10px', background: '#1e293b', color: '#fff' } }} />
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login"          element={<Login />} />
          <Route path="/register"       element={<Register />} />
          <Route path="/forgot-password"element={<ForgotPassword />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard"    element={<Dashboard />} />
            <Route path="/properties"   element={<Properties />} />
            <Route path="/properties/:id" element={<PropertyDetail />} />
            <Route path="/work-orders"  element={<WorkOrders />} />
            <Route path="/work-orders/:id" element={<WorkOrderDetail />} />
            <Route path="/financial"    element={<Financial />} />
            <Route path="/messages"     element={<Messages />} />
            <Route path="/inspections"  element={<Inspections />} />
            <Route path="/documents"    element={<Documents />} />
            <Route path="/contractors"  element={<Contractors />} />
            <Route path="/ai-assistant" element={<AIAssistant />} />
            <Route path="/notifications"element={<Notifications />} />
            <Route path="/settings"     element={<Settings />} />
            <Route path="/profile"      element={<Profile />} />
            <Route path="/map"          element={<MapView />} />
            <Route path="/tenants"      element={<Tenants />} />
            <Route path="/reports"      element={<Reports />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
