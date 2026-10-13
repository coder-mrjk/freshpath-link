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
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-gray-300 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-tomato-500 touch-target transition-colors"
      aria-label="Toggle language between English and Tamil"
    >
      <Languages className="w-4 h-4 text-tomato-500" />
      <span>{currentLang.startsWith('ta') ? 'English' : 'தமிழ்'}</span>
    </button>
  );
};
