import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, ShieldCheck, Sparkles, Wrench } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export default function Landing() {
  const { user } = useAuthStore();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 2200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="min-h-screen overflow-hidden bg-[#08111f] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.28),_transparent_36%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.2),_transparent_28%),linear-gradient(135deg,_#08111f_0%,_#0f172a_55%,_#111827_100%)]" />
      <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:72px_72px]" />

      <section className="relative flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-6xl">
          <div className={`mx-auto flex min-h-[78vh] flex-col items-center justify-center rounded-[2rem] border border-white/10 bg-white/6 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl transition-all duration-700 ${showSplash ? 'opacity-100 translate-y-0' : 'opacity-100'}`}>
            <div className={`flex flex-col items-center gap-4 text-center transition-all duration-700 ${showSplash ? 'opacity-100 scale-100' : 'pointer-events-none absolute opacity-0 scale-95'}`}>
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-cyan-400 via-sky-500 to-emerald-400 text-2xl font-black text-slate-950 shadow-lg shadow-cyan-500/30">
                SS
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">Simply Service</p>
                <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">We&apos;ve Got Your Service Needs Covered</h1>
              </div>
              <p className="max-w-2xl text-sm text-slate-200/80 sm:text-base">
                A role-aware platform for properties, work orders, finance, messaging, and AI-assisted operations.
              </p>
            </div>

            <div className={`w-full transition-all duration-700 ${showSplash ? 'opacity-0 translate-y-6' : 'opacity-100 translate-y-0'}`}>
              <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
                <div className="space-y-6">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-4 py-2 text-xs font-medium uppercase tracking-[0.25em] text-cyan-100/80">
                    <Sparkles className="h-4 w-4" /> Platform overview
                  </div>
                  <div className="space-y-4">
                    <h2 className="max-w-2xl text-4xl font-black leading-tight text-white sm:text-5xl">
                      One app for owners, tenants, contractors, and admin operations.
                    </h2>
                    <p className="max-w-xl text-base leading-7 text-slate-200/80">
                      Manage properties, requests, bids, invoices, messages, and smart workflows from a responsive dashboard built for mobile and desktop.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Link to={user ? '/dashboard' : '/register'} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition-transform hover:-translate-y-0.5">
                      {user ? 'Open dashboard' : 'Create account'}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    <Link to="/login" className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10">
                      Sign in
                    </Link>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    { icon: Building2, title: 'Properties', text: 'Role-based property management and onboarding.' },
                    { icon: Wrench, title: 'Work Orders', text: 'Track requests, bids, and job completion.' },
                    { icon: ShieldCheck, title: 'Security', text: 'JWT auth, RBAC, and protected routes.' },
                    { icon: Sparkles, title: 'AI Tools', text: 'Estimates, summaries, and smart assistance.' },
                  ].map((card) => {
                    const Icon = card.icon;
                    return (
                      <div key={card.title} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-lg shadow-black/10">
                        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-cyan-200">
                          <Icon className="h-5 w-5" />
                        </div>
                        <h3 className="text-sm font-semibold text-white">{card.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-slate-300/80">{card.text}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}