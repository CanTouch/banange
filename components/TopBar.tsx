'use client';

import React, { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { LangToggle } from './LangToggle';
import { ThemeToggle } from './ThemeToggle';
import { DevBadge } from './DevBadge';

interface TopBarProps {
  isDev?: boolean;
  onOpenAbout: () => void;
  onThemeChange?: (theme: 'dark' | 'light') => void;
}

export function TopBar({ isDev, onOpenAbout, onThemeChange }: TopBarProps) {
  const { t } = useI18n();
  const [copiedToast, setCopiedToast] = useState(false);

  const handleShare = async () => {
    const shareData = {
      title: 'Banange',
      text: "Banange: where's the power gone? Report and see outages across Uganda.",
      url: process.env.NEXT_PUBLIC_SITE_URL || 'https://banange.kuppelabs.com',
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <header className="relative z-30 h-14 w-full bg-[var(--surface)]/90 backdrop-blur-md border-b border-[var(--border)] px-4 flex items-center justify-between select-none">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-heading font-extrabold text-xl tracking-tight text-[var(--text)]">
              Banange
            </span>
            <DevBadge isDev={isDev} />
          </div>
          <span className="text-[11px] text-[var(--muted)] font-medium truncate max-w-[170px] sm:max-w-none">
            {t('tagline')}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Share Button */}
        <button
          onClick={handleShare}
          className="relative p-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:opacity-85 focus:outline-none focus:ring-2 focus:ring-[var(--focus)] transition-colors"
          aria-label={t('share')}
          title={t('share')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3"></circle>
            <circle cx="6" cy="12" r="3"></circle>
            <circle cx="18" cy="19" r="3"></circle>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
          </svg>
          {copiedToast && (
            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[var(--surface)] border border-[var(--border)] text-[10px] text-[var(--text)] rounded shadow-lg whitespace-nowrap">
              Link copied!
            </span>
          )}
        </button>

        {/* Language Toggle */}
        <LangToggle />

        {/* Theme Toggle */}
        <ThemeToggle onThemeChange={onThemeChange} />

        {/* Info Icon / About Modal */}
        <button
          onClick={onOpenAbout}
          className="p-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:opacity-85 focus:outline-none focus:ring-2 focus:ring-[var(--focus)] transition-colors"
          aria-label={t('about_title')}
          title={t('about_title')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        </button>
      </div>
    </header>
  );
}
