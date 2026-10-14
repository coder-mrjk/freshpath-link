import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sprout, Truck, Warehouse, Store, ShoppingBasket, ShieldCheck, ChevronRight } from 'lucide-react';

export const EntrancePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const roles = [
    {
      id: 'farmer',
      title: t('roles.farmer'),
      portal: t('roles.farmerPortal'),
      description: t('roles.farmerDesc'),
      icon: Sprout,
      route: '/auth/farmer',
      cardBorder: 'hover:border-emerald-500/50 hover:shadow-[0_0_30px_rgba(46,125,50,0.35)]',
      iconBox: 'bg-[#2E7D32]/20 border border-[#4ADE80]/30 text-[#4ADE80] shadow-[0_0_20px_0_rgba(74,222,128,0.30)]',
      badge: 'bg-emerald-500/15 border border-emerald-400/30 text-emerald-300',
      hoverBg: 'hover:bg-emerald-950/10',
    },
    {
      id: 'driver',
      title: t('roles.driver'),
      portal: t('roles.driverPortal'),
      description: t('roles.driverDesc'),
      icon: Truck,
      route: '/auth/driver',
      cardBorder: 'hover:border-sky-500/50 hover:shadow-[0_0_30px_rgba(2,132,199,0.35)]',
      iconBox: 'bg-[#0284C7]/20 border border-sky-400/30 text-sky-400 shadow-[0_0_20px_0_rgba(2,132,199,0.30)]',
      badge: 'bg-sky-500/15 border border-sky-400/30 text-sky-300',
      hoverBg: 'hover:bg-sky-950/10',
    },
    {
      id: 'mandi',
      title: t('roles.mandi'),
      portal: t('roles.mandiPortal'),
      description: t('roles.mandiDesc'),
      icon: Warehouse,
      route: '/auth/mandi',
      cardBorder: 'hover:border-amber-500/50 hover:shadow-[0_0_30px_rgba(217,119,6,0.35)]',
      iconBox: 'bg-[#D97706]/20 border border-amber-400/30 text-amber-400 shadow-[0_0_20px_0_rgba(217,119,6,0.30)]',
      badge: 'bg-amber-500/15 border border-amber-400/30 text-amber-300',
      hoverBg: 'hover:bg-amber-950/10',
    },
    {
      id: 'shop',
      title: t('roles.shop'),
      portal: t('roles.shopPortal'),
      description: t('roles.shopDesc'),
      icon: Store,
      route: '/auth/shop',
      cardBorder: 'hover:border-purple-500/50 hover:shadow-[0_0_30px_rgba(147,51,234,0.35)]',
      iconBox: 'bg-[#9333EA]/20 border border-purple-400/30 text-purple-400 shadow-[0_0_20px_0_rgba(147,51,234,0.30)]',
      badge: 'bg-purple-500/15 border border-purple-400/30 text-purple-300',
      hoverBg: 'hover:bg-purple-950/10',
    },
    {
      id: 'consumer',
      title: t('roles.consumer'),
      portal: t('roles.consumerPortal'),
      description: t('roles.consumerDesc'),
      icon: ShoppingBasket,
      route: '/auth/consumer',
      cardBorder: 'hover:border-red-500/50 hover:shadow-[0_0_30px_rgba(193,18,31,0.35)]',
      iconBox: 'bg-[#C1121F]/20 border border-red-400/30 text-red-400 shadow-[0_0_20px_0_rgba(193,18,31,0.35)]',
      badge: 'bg-red-500/15 border border-red-400/30 text-red-300',
      hoverBg: 'hover:bg-red-950/10',
    },
  ];

  return (
    <div className="relative min-h-[calc(100vh-4rem)] bg-[#0F172A] text-slate-100 overflow-hidden py-10 sm:py-16 px-4">
      {/* Background Mesh Gradients */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {/* Top-right crimson radial glow */}
        <div
          className="absolute -top-32 -right-32 w-[650px] h-[650px] rounded-full blur-[120px] opacity-25 pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(193,18,31,0.6) 0%, rgba(158,14,25,0.2) 50%, transparent 70%)',
          }}
        />
        {/* Bottom-left emerald radial glow */}
        <div
          className="absolute -bottom-32 -left-32 w-[650px] h-[650px] rounded-full blur-[120px] opacity-20 pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(46,125,50,0.6) 0%, rgba(74,222,128,0.2) 50%, transparent 70%)',
          }}
        />
      </div>

      <div className="relative max-w-4xl mx-auto z-10">
        {/* Hero */}
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
          <div className="inline-block p-1 rounded-3xl bg-white/[0.04] border border-white/10 shadow-[0_0_35px_rgba(193,18,31,0.35)] backdrop-blur-2xl mb-6 hover:scale-105 transition-transform duration-300">
            <img
              src="/logo192.png"
              alt="FreshPath Link"
              className="w-20 h-20 rounded-2xl shadow-[0_0_30px_rgba(193,18,31,0.3)] object-cover"
            />
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-3">
            <span className="text-white">FreshPath</span>{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-rose-500 to-red-600">
              Link
            </span>
          </h1>

          <p className="mt-2 text-base sm:text-lg text-slate-400 font-medium leading-relaxed max-w-lg mx-auto">
            {t('appTagline')}
          </p>
        </div>

        {/* Role Selection */}
        <div className="mb-12">
          {/* Section Header with Subtle Gradient Underline */}
          <div className="text-center mb-8 sm:mb-10">
            <div className="inline-block">
              <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                {t('whoAreYou')}
              </h2>
              <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-red-500/80 to-transparent mt-2" />
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-2 font-medium">
              {t('selectRolePrompt')}
            </p>
          </div>

          {/* Role Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            {roles.map((role) => {
              const Icon = role.icon;
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => navigate(role.route)}
                  className={`group relative text-left p-5 sm:p-6 rounded-2xl backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)] hover:scale-[1.02] hover:shadow-2xl transition-all duration-300 flex items-start gap-4 overflow-hidden touch-target ${role.cardBorder} ${role.hoverBg}`}
                >
                  {/* Glowing Icon Container */}
                  <div
                    className={`p-3.5 rounded-2xl shrink-0 transition-transform duration-300 group-hover:scale-110 flex items-center justify-center ${role.iconBox}`}
                  >
                    <Icon className="w-7 h-7" />
                  </div>

                  {/* Card Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                      <span className="font-extrabold text-base text-[#dae2fd] group-hover:text-white transition-colors">
                        {role.title}
                      </span>
                      <span
                        className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${role.badge}`}
                      >
                        {role.portal}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed group-hover:text-slate-300 transition-colors">
                      {role.description}
                    </p>
                  </div>

                  <div className="self-center text-slate-600 group-hover:text-slate-300 group-hover:translate-x-1 transition-all duration-200 shrink-0">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Owner Login Link */}
        <div className="pt-8 border-t border-white/[0.08] text-center">
          <button
            type="button"
            onClick={() => navigate('/auth/control')}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 text-xs font-semibold text-slate-300 hover:text-white transition-all duration-200 shadow-lg backdrop-blur-xl hover:scale-105 touch-target"
          >
            <ShieldCheck className="w-4 h-4 text-red-500" />
            <span>{t('roles.ownerLink')} (Control Portal)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
