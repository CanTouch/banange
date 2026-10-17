'use client';

import React from 'react';
import { useI18n } from '@/lib/i18n';

export function LangToggle() {
  const { language, setLanguage } = useI18n();

  const toggle = () => {
    setLanguage(language === 'en' ? 'lg' : 'en');
  };

  return (
    <button
      onClick={toggle}
      className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:opacity-85 focus:outline-none focus:ring-2 focus:ring-[var(--focus)] transition-colors"
      aria-label={`Switch language to ${language === 'en' ? 'Luganda' : 'English'}`}
      title="Switch language (EN / LG)"
    >
      <span className={language === 'en' ? 'text-[var(--text)] font-bold' : 'text-[var(--muted)]'}>EN</span>
      <span className="mx-1 text-[var(--border)]">|</span>
      <span className={language === 'lg' ? 'text-[var(--text)] font-bold' : 'text-[var(--muted)]'}>LG</span>
    </button>
  );
}
