import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from './LanguageToggle';
import { FreshPathLogo } from './FreshPathLogo';
import { LogOut, User } from 'lucide-react';

interface Props {
  portalName?: string;
  userRole?: string;
  passId?: string;
  onLogout?: () => void;
}

export const Navbar: React.FC<Props> = ({ portalName, userRole, passId, onLogout }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-xs">
      <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand / Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="group-hover:scale-105 transition-transform drop-shadow-xs">
            <FreshPathLogo className="w-9 h-9" />
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-lg leading-tight tracking-tight text-charcoal flex items-center gap-1.5">
              FreshPath <span className="text-tomato-600 font-bold text-xs uppercase px-1.5 py-0.5 bg-tomato-50 rounded">Link</span>
            </span>
            {portalName && (
              <span className="text-xs font-semibold text-leaf-600">
                {portalName}
              </span>
            )}
          </div>
        </Link>

        {/* Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageToggle />

          {userRole && (
            <span className="hidden sm:inline-flex items-center gap-1 text-xs font-bold uppercase px-2 py-0.5 bg-tomato-50 text-tomato-600 rounded">
              {userRole}
            </span>
          )}

          {passId && (
            <span className="hidden sm:inline-flex items-center gap-1 text-xs font-mono font-bold px-2.5 py-1 bg-gray-100 border border-gray-300 rounded-full text-gray-700">
              <User className="w-3 h-3 text-gray-500" />
              {passId}
            </span>
          )}

          {onLogout ? (
            <button
              onClick={onLogout}
              className="p-2 rounded-lg text-gray-500 hover:text-tomato-600 hover:bg-gray-100 touch-target"
              title={t('logout')}
              aria-label="Log out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={() => navigate('/')}
              className="text-xs font-bold text-gray-600 hover:text-tomato-600 px-2 py-1"
            >
              {t('home')}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
