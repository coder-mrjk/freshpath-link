import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sprout } from 'lucide-react';

export const AuthPage: React.FC = () => {
  const { role = 'consumer' } = useParams<{ role: string }>();
  const { t } = useTranslation();

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-md border border-gray-100 text-center">
        <div className="w-12 h-12 bg-tomato-50 rounded-2xl flex items-center justify-center text-tomato-500 mx-auto mb-4">
          <Sprout className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-charcoal capitalize">
          {role} Portal Login
        </h1>
        <p className="text-xs text-gray-500 mt-1 mb-6">
          Authentication module (Milestone M1)
        </p>

        <div className="p-4 bg-sandBg rounded-xl text-xs text-gray-600 mb-6 text-left space-y-2">
          <p className="font-semibold text-charcoal">Role: {role.toUpperCase()}</p>
          <p>Full registration & approval system initializes in Milestone M1.</p>
        </div>

        <Link
          to="/"
          className="inline-block w-full py-3 bg-tomato-500 text-white font-bold rounded-xl text-sm shadow hover:bg-tomato-600 transition-colors"
        >
          {t('home')}
        </Link>
      </div>
    </div>
  );
};
