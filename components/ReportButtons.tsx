'use client';

import React from 'react';
import { useI18n } from '@/lib/i18n';

interface ReportButtonsProps {
  onReport: (kind: 'out' | 'back') => void;
  isLoading?: boolean;
}

export function ReportButtons({ onReport, isLoading }: ReportButtonsProps) {
  const { t } = useI18n();

  return (
    <div className="w-full grid grid-cols-2 gap-3 px-4 pb-4 pt-1 pointer-events-auto">
      {/* Power is out button */}
      <button
        onClick={() => onReport('out')}
        disabled={isLoading}
        aria-label={t('btn_out')}
        className="group relative flex items-center justify-center gap-2 h-14 min-h-[56px] px-3 rounded-2xl bg-[var(--out)] text-[var(--btn-text)] font-semibold text-[17px] sm:text-[18px] shadow-[0_0_20px_var(--out-glow)] hover:brightness-105 active:scale-[0.98] focus:outline-none focus:ring-[3px] focus:ring-[var(--focus)] transition-all cursor-pointer disabled:opacity-50 select-none"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 transition-transform group-hover:scale-110"
        >
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          <line x1="2" y1="2" x2="22" y2="22" />
        </svg>
        <span className="truncate leading-tight">{t('btn_out')}</span>
      </button>

      {/* Power is back button */}
      <button
        onClick={() => onReport('back')}
        disabled={isLoading}
        aria-label={t('btn_back')}
        className="group relative flex items-center justify-center gap-2 h-14 min-h-[56px] px-3 rounded-2xl bg-[var(--back)] text-[var(--btn-text)] font-semibold text-[17px] sm:text-[18px] shadow-[0_0_20px_var(--back-glow)] hover:brightness-105 active:scale-[0.98] focus:outline-none focus:ring-[3px] focus:ring-[var(--focus)] transition-all cursor-pointer disabled:opacity-50 select-none"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 transition-transform group-hover:scale-110"
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        <span className="truncate leading-tight">{t('btn_back')}</span>
      </button>
    </div>
  );
}
