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
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const saved = localStorage.getItem('banange_theme') as 'dark' | 'light' | null;
    if (saved) {
      setTheme(saved);
    }
  }, []);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

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
        <div className="relative z-40 bg-amber-600/90 text-white font-mono text-xs uppercase tracking-wider py-1 px-3 text-center border-b border-amber-500/40">
          DEMO DATA — 30-day simulated dataset
        </div>
      )}
      <header className="relative z-30 h-16 w-full px-5 flex items-center justify-between pointer-events-none select-none">
        {/* Left: Wordmark in Instrument Serif 30px (amber dot removed) */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <Link href="/" className="flex items-center gap-1.5 group">
            <span className="font-serif text-[30px] leading-none text-[var(--ink)] tracking-tight">
              Banange
            </span>
          </Link>
          <DevBadge isDev={isDev} />
        </div>

        {/* Right: Single menu button with dropdown */}
        <div className="relative pointer-events-auto" ref={menuRef}>
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="w-10 h-10 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--faint)] backdrop-blur-md flex items-center justify-center transition-colors cursor-pointer shadow-md"
            title="Menu"
            aria-label="Open menu"
            aria-expanded={isMenuOpen}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {/* Menu Dropdown: Stats, Language, Theme, About */}
          {isMenuOpen && (
            <div className="absolute right-0 top-12 w-48 rounded-2xl bg-[var(--surface)] border border-[var(--border)] backdrop-blur-xl shadow-2xl p-1.5 z-50 flex flex-col gap-1 animate-pop-in">
              <Link
                href="/insights"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-[var(--border)]/40 text-sm font-sans text-[var(--ink)] transition-colors cursor-pointer"
              >
                <span>Stats</span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--muted)]">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              </Link>

              <button
                type="button"
                onClick={() => {
                  setLanguage(language === 'en' ? 'lg' : 'en');
                  setIsMenuOpen(false);
                }}
                className="flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl hover:bg-[var(--border)]/40 text-sm font-sans text-[var(--ink)] transition-colors cursor-pointer text-left"
              >
                <span>Language</span>
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-[var(--border)]/50 text-[var(--muted)]">
                  {language === 'en' ? 'English (LG)' : 'Luganda (EN)'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  toggleTheme();
                  setIsMenuOpen(false);
                }}
                className="flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl hover:bg-[var(--border)]/40 text-sm font-sans text-[var(--ink)] transition-colors cursor-pointer text-left"
              >
                <span>Theme</span>
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-[var(--border)]/50 text-[var(--muted)]">
                  {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </span>
              </button>

              <div className="h-px bg-[var(--border)] my-0.5" />

              <button
                type="button"
                onClick={() => {
                  onOpenAbout();
                  setIsMenuOpen(false);
                }}
                className="flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl hover:bg-[var(--border)]/40 text-sm font-sans text-[var(--ink)] transition-colors cursor-pointer text-left"
              >
                <span>About</span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--muted)]">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </header>
    </>
  );
}
