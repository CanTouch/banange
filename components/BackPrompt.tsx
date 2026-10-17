'use client';

import React, { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { BACK_PROMPT_REASK_MIN, OUT_TTL_HOURS } from '@/lib/constants';

interface SavedOutReport {
  lat: number;
  lng: number;
  loc_precision: 'gps' | 'pin' | 'area';
  at: string;
}

interface BackPromptProps {
  onConfirmBack: (data: SavedOutReport) => void;
}

export function BackPrompt({ onConfirmBack }: BackPromptProps) {
  const { t } = useI18n();
  const [activeReport, setActiveReport] = useState<SavedOutReport | null>(null);

  const checkPrompt = () => {
    try {
      // Check snooze
      const snoozeUntil = localStorage.getItem('banange_back_snooze');
      if (snoozeUntil && Date.now() < parseInt(snoozeUntil, 10)) {
        setActiveReport(null);
        return;
      }

      const raw = localStorage.getItem('banange_last_out');
      if (!raw) {
        setActiveReport(null);
        return;
      }

      const parsed: SavedOutReport = JSON.parse(raw);
      const repAgeMs = Date.now() - new Date(parsed.at).getTime();
      const maxAgeMs = OUT_TTL_HOURS * 60 * 60 * 1000;

      if (repAgeMs <= maxAgeMs && repAgeMs >= 0) {
        setActiveReport(parsed);
      } else {
        localStorage.removeItem('banange_last_out');
        setActiveReport(null);
      }
    } catch {
      setActiveReport(null);
    }
  };

  useEffect(() => {
    checkPrompt();

    const onFocus = () => checkPrompt();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkPrompt();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  if (!activeReport) return null;

  const handleYes = () => {
    try {
      localStorage.removeItem('banange_last_out');
      localStorage.removeItem('banange_back_snooze');
    } catch {
      // ignore
    }
    const rep = activeReport;
    setActiveReport(null);
    onConfirmBack(rep);
  };

  const handleNo = () => {
    try {
      const snoozeTime = Date.now() + BACK_PROMPT_REASK_MIN * 60 * 1000;
      localStorage.setItem('banange_back_snooze', snoozeTime.toString());
    } catch {
      // ignore
    }
    setActiveReport(null);
  };

  return (
    <aside
      aria-label="Power status verification"
      className="absolute top-16 left-4 right-4 z-40 mx-auto max-w-lg p-3.5 rounded-2xl bg-[var(--surface)] border border-amber-500/40 shadow-xl backdrop-blur-md transition-all animate-pop-in"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-3 h-3 rounded-full bg-[var(--back)] animate-ping" />
          <p className="text-sm font-semibold text-[var(--text)]">
            {t('prompt_back_q')}
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={handleNo}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
          >
            {t('prompt_no')}
          </button>
          <button
            onClick={handleYes}
            className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-[var(--back)] text-[var(--btn-text)] shadow-[0_0_12px_var(--back-glow)] hover:opacity-90 transition-opacity"
          >
            {t('prompt_yes')}
          </button>
        </div>
      </div>
    </aside>
  );
}
