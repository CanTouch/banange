'use client';

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import enMessages from '../messages/en.json';
import lgMessages from '../messages/lg.json';

export type Language = 'en' | 'lg';
export type MessageKey = keyof typeof enMessages;

const translations: Record<Language, Record<string, string | boolean>> = {
  en: enMessages,
  lg: lgMessages,
};

export function getInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = window.localStorage.getItem('banange_lang');
    if (saved === 'en' || saved === 'lg') return saved;
    if (window.navigator?.language?.toLowerCase().startsWith('lg')) {
      return 'lg';
    }
  } catch {
    // ignore
  }
  return 'en';
}

export function formatMessage(
  lang: Language,
  key: string,
  params?: Record<string, string | number>
): string {
  const dict = translations[lang] || translations.en;
  let text = String(dict[key] ?? translations.en[key as MessageKey] ?? key);

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType>({
  language: 'en',
  setLanguage: () => {},
  t: (key, params) => formatMessage('en', key, params),
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    const lang = getInitialLanguage();
    setLanguageState(lang);
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      window.localStorage.setItem('banange_lang', lang);
    } catch {
      // ignore
    }
  };

  const t = useMemo(() => {
    return (key: string, params?: Record<string, string | number>) => {
      return formatMessage(language, key, params);
    };
  }, [language]);

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
