import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ta from './locales/ta.json';

const savedLang = localStorage.getItem('freshpath_lang') || 'en';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ta: { translation: ta },
  },
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export function changeLanguage(lang: 'en' | 'ta') {
  i18n.changeLanguage(lang);
  localStorage.setItem('freshpath_lang', lang);
}

export default i18n;
