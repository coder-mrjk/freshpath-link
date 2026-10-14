import React from 'react';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../i18n/config';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Languages } from 'lucide-react';

export const LanguageToggle: React.FC = () => {
  const { i18n } = useTranslation();
  const { currentUser } = useAuth();
  const currentLang = i18n.language || 'en';

  const toggle = async () => {
    const next = currentLang.startsWith('ta') ? 'en' : 'ta';
    changeLanguage(next);

    if (currentUser) {
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          preferredLang: next,
        });
      } catch (e) {
        // Non-blocking preference sync
      }
    }
  };

  return (
    <button
      onClick={toggle}
      type="button"
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-red-500/50 backdrop-blur-md transition-all duration-200 touch-target shadow-xs"
      aria-label="Toggle language between English and Tamil"
    >
      <Languages className="w-4 h-4 text-red-400" />
      <span className="font-medium">{currentLang.startsWith('ta') ? 'English' : 'தமிழ்'}</span>
    </button>
  );
};
