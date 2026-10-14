import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FreshPathLogo } from '../../components/FreshPathLogo';
import { Sprout, Truck, Warehouse, Store, ShoppingBasket, ShieldCheck } from 'lucide-react';

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
      color: 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:border-emerald-500',
      badgeColor: 'bg-emerald-100 text-emerald-800',
      route: '/auth/farmer',
    },
    {
      id: 'driver',
      title: t('roles.driver'),
      portal: t('roles.driverPortal'),
      description: t('roles.driverDesc'),
      icon: Truck,
      color: 'bg-blue-50 text-blue-600 border-blue-200 hover:border-blue-500',
      badgeColor: 'bg-blue-100 text-blue-800',
      route: '/auth/driver',
    },
    {
      id: 'mandi',
      title: t('roles.mandi'),
      portal: t('roles.mandiPortal'),
      description: t('roles.mandiDesc'),
      icon: Warehouse,
      color: 'bg-amber-50 text-amber-600 border-amber-200 hover:border-amber-500',
      badgeColor: 'bg-amber-100 text-amber-800',
      route: '/auth/mandi',
    },
    {
      id: 'shop',
      title: t('roles.shop'),
      portal: t('roles.shopPortal'),
      description: t('roles.shopDesc'),
      icon: Store,
      color: 'bg-purple-50 text-purple-600 border-purple-200 hover:border-purple-500',
      badgeColor: 'bg-purple-100 text-purple-800',
      route: '/auth/shop',
    },
    {
      id: 'consumer',
      title: t('roles.consumer'),
      portal: t('roles.consumerPortal'),
      description: t('roles.consumerDesc'),
      icon: ShoppingBasket,
      color: 'bg-tomato-50 text-tomato-500 border-tomato-200 hover:border-tomato-500',
      badgeColor: 'bg-tomato-100 text-tomato-700',
      route: '/auth/consumer',
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
      {/* Hero */}
      <div className="text-center max-w-xl mx-auto mb-10">
        <div className="inline-flex items-center justify-center p-3 rounded-3xl bg-white shadow-xl border border-gray-100 mb-4 hover:scale-105 transition-transform">
          <FreshPathLogo className="w-16 h-16 drop-shadow-md" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-charcoal tracking-tight">
          {t('appName')}
        </h1>
        <p className="mt-2 text-base sm:text-lg text-gray-600">
          {t('appTagline')}
        </p>
      </div>

      {/* Role Selection */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-charcoal text-center mb-2">
          {t('whoAreYou')}
        </h2>
        <p className="text-sm text-gray-500 text-center mb-6">
          {t('selectRolePrompt')}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {roles.map((role) => {
            const Icon = role.icon;
            return (
              <button
                key={role.id}
                onClick={() => navigate(role.route)}
                className={`p-5 rounded-2xl border-2 text-left transition-all transform hover:-translate-y-0.5 hover:shadow-md flex items-start gap-4 ${role.color}`}
              >
                <div className="p-3 rounded-xl bg-white shadow-xs shrink-0">
                  <Icon className="w-7 h-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-base text-charcoal">
                      {role.title}
                    </span>
                    <span
                      className={`text-[11px] font-extrabold uppercase px-2 py-0.5 rounded-full ${role.badgeColor}`}
                    >
                      {role.portal}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {role.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Owner Login Link */}
      <div className="pt-6 border-t border-gray-200 text-center">
        <button
          onClick={() => navigate('/auth/control')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-tomato-600 transition-colors"
        >
          <ShieldCheck className="w-4 h-4" />
          <span>{t('roles.ownerLink')} (Control Portal)</span>
        </button>
      </div>
    </div>
  );
};
