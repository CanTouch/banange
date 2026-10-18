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
    <div className="w-full grid grid-cols-2 gap-2.5 px-3 pb-3 pt-1 pointer-events-auto">
      {/* Power is out button: sleek glowing night-sky button */}
      <button
        onClick={() => onReport('out')}
        disabled={isLoading}
        aria-label={t('btn_out')}
        className="group relative flex items-center justify-center gap-2 h-11 sm:h-12 min-h-[44px] px-3 rounded-xl backdrop-blur-md bg-[#FF4D4D]/15 hover:bg-[#FF4D4D]/25 active:bg-[#FF4D4D]/35 border border-[#FF4D4D]/45 text-white font-bold text-xs sm:text-sm tracking-tight shadow-[0_0_16px_rgba(255,77,77,0.25)] hover:shadow-[0_0_24px_rgba(255,77,77,0.4)] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#FF4D4D] transition-all cursor-pointer disabled:opacity-50 select-none"
      >
        <span className="w-2 h-2 rounded-full bg-[#FF4D4D] shadow-[0_0_8px_#FF4D4D] animate-ping opacity-75" />
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#FF7A7A"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 transition-transform group-hover:scale-110"
        >
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          <line x1="2" y1="2" x2="22" y2="22" />
        </svg>
        <span className="truncate leading-tight text-slate-100">{t('btn_out')}</span>
      </button>

      {/* Power is back button: sleek glowing amber button */}
      <button
        onClick={() => onReport('back')}
        disabled={isLoading}
        aria-label={t('btn_back')}
        className="group relative flex items-center justify-center gap-2 h-11 sm:h-12 min-h-[44px] px-3 rounded-xl backdrop-blur-md bg-[#FFB020]/15 hover:bg-[#FFB020]/25 active:bg-[#FFB020]/35 border border-[#FFB020]/45 text-white font-bold text-xs sm:text-sm tracking-tight shadow-[0_0_16px_rgba(255,176,32,0.2)] hover:shadow-[0_0_24px_rgba(255,176,32,0.35)] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#FFB020] transition-all cursor-pointer disabled:opacity-50 select-none"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#FFB020"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 transition-transform group-hover:scale-110"
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        <span className="truncate leading-tight text-slate-100">{t('btn_back')}</span>
      </button>
    </div>
  );
}
