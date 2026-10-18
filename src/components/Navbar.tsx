import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from './LanguageToggle';
import { LogOut, User, Settings } from 'lucide-react';
import { UserSettingsModal } from './UserSettingsModal';

interface Props {
  portalName?: string;
  userRole?: 'farmer' | 'driver' | 'mandi' | 'shop' | 'consumer' | 'owner';
  passId?: string;
  displayName?: string;
  onLogout?: () => void;
}

export const Navbar: React.FC<Props> = ({ portalName, userRole, passId, displayName, onLogout }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-2xl border-b border-white/[0.08] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.5)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Brand / Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="group-hover:scale-105 transition-transform duration-300 drop-shadow-md">
              <img
                src="/logo192.png"
                alt="FreshPath Link"
                className="w-9 h-9 object-contain drop-shadow-[0_0_12px_rgba(193,18,31,0.35)]"
              />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-lg leading-tight tracking-tight text-white flex items-center gap-1.5">
                FreshPath{' '}
                <span className="bg-gradient-to-r from-red-500 to-red-700 text-white font-bold text-xs uppercase px-2 py-0.5 rounded-full shadow-[0_0_12px_rgba(193,18,31,0.4)]">
                  Link
                </span>
              </span>
              {portalName && (
                <span className="text-xs font-semibold text-emerald-400 tracking-wide">
                  {portalName}
                </span>
              )}
            </div>
          </Link>

          {/* Right Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageToggle />

            {userRole && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-3 py-1 bg-emerald-500/15 border border-emerald-400/30 text-emerald-400 rounded-full shadow-[0_0_12px_rgba(74,222,128,0.25)]">
                {userRole}
              </span>
            )}

            {(displayName || passId) && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 bg-white/5 border border-white/10 rounded-full text-slate-200 backdrop-blur-md">
                <User className="w-3.5 h-3.5 text-emerald-400" />
                <span className="max-w-[160px] truncate">{displayName || passId}</span>
              </span>
            )}

            {onLogout && (
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 rounded-xl text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all duration-200 touch-target flex items-center justify-center"
                title="User Profile & Settings"
                aria-label="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}

            {onLogout ? (
              <button
                onClick={onLogout}
                className="p-2 rounded-xl text-slate-400 hover:text-red-400 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-red-500/30 transition-all duration-200 touch-target flex items-center justify-center"
                title={t('logout')}
                aria-label="Log out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => navigate('/')}
                className="text-xs font-bold text-slate-300 hover:text-white px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
              >
                {t('home')}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Universal Settings Modal */}
      <UserSettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        portalRole={userRole === 'owner' ? 'control' : userRole}
      />
    </>
  );
};
