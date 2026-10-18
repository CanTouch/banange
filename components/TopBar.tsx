'use client';

import React from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { DevBadge } from './DevBadge';

interface TopBarProps {
  isDev?: boolean;
  isDemo?: boolean;
  onOpenAbout: () => void;
  onThemeChange?: (theme: 'dark' | 'light') => void;
}

export function TopBar({ isDev, isDemo, onOpenAbout, onThemeChange }: TopBarProps) {
  const { language, setLanguage } = useI18n();
  const [theme, setTheme] = React.useState<'dark' | 'light'>('dark');

  React.useEffect(() => {
    const saved = localStorage.getItem('banange_theme') as 'dark' | 'light' | null;
    if (saved) {
      setTheme(saved);
    }
  }, []);

  const toggleTheme = () => {
    const current = (document.documentElement.getAttribute('data-theme') || theme) as 'dark' | 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('banange_theme', next);
    document.documentElement.setAttribute('data-theme', next);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', next === 'light' ? '#F3EDE0' : '#05070D');
    }
    window.dispatchEvent(new CustomEvent('banange_theme_change', { detail: { theme: next } }));
    if (onThemeChange) onThemeChange(next);
  };

  return (
    <>
      {isDemo && (
        <div className="relative z-40 bg-amber-600/90 text-white font-mono text-[10px] uppercase tracking-wider py-1 px-3 text-center border-b border-amber-500/40">
          DEMO DATA — 30-day simulated dataset
        </div>
      )}
      <header className="relative z-30 h-16 w-full px-5 flex items-center justify-between pointer-events-none select-none">
        {/* Left: Wordmark in Instrument Serif 30px with small glowing amber dot */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <Link href="/" className="flex items-center gap-1.5 group">
            <span className="font-serif text-[30px] leading-none text-[var(--ink)] tracking-tight">
              Banange
            </span>
            <span
              className="w-2 h-2 rounded-full bg-[var(--back)] shadow-[0_0_8px_#FFB547] translate-y-[2px]"
              title="Uganda Outages Map"
            />
          </Link>
          <DevBadge isDev={isDev} />
        </div>

        {/* Right: Round 36px action buttons */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Insights button */}
          <Link
            href="/insights"
            className="w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--faint)] backdrop-blur-md flex items-center justify-center transition-colors"
            title="Outage Insights"
            aria-label="Insights"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </Link>

          {/* Language EN/LG */}
          <button
            type="button"
            onClick={() => setLanguage(language === 'en' ? 'lg' : 'en')}
            className="w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--faint)] backdrop-blur-md flex items-center justify-center font-mono text-[11px] font-semibold transition-colors cursor-pointer"
            title="Toggle language (English / Luganda)"
            aria-label="Toggle language"
          >
            {language === 'en' ? 'LG' : 'EN'}
          </button>

          {/* Theme sun/moon */}
          <button
            type="button"
            onClick={toggleTheme}
            className="w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--faint)] backdrop-blur-md flex items-center justify-center transition-colors cursor-pointer"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              // Sun icon for dark mode
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              // Moon icon for light mode
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          {/* About button */}
          <button
            type="button"
            onClick={onOpenAbout}
            className="w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--faint)] backdrop-blur-md flex items-center justify-center transition-colors cursor-pointer"
            title="About Banange"
            aria-label="About"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </button>
        </div>
      </header>
    </>
  );
}
