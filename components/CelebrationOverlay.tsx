'use client';

import React, { useEffect } from 'react';
import { useI18n } from '@/lib/i18n';
import { useLiteMode } from '@/lib/liteMode';

interface CelebrationOverlayProps {
  type: 'out' | 'back' | null;
  onDismiss: () => void;
}

export function CelebrationOverlay({ type, onDismiss }: CelebrationOverlayProps) {
  const { t } = useI18n();
  const { isLite } = useLiteMode();

  useEffect(() => {
    if (!type) return;

    if (!isLite && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(25);
      } catch {
        // ignore
      }
    }

    const timer = setTimeout(() => {
      onDismiss();
    }, 2200);

    return () => clearTimeout(timer);
  }, [type, isLite, onDismiss]);

  if (!type) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onDismiss}
      className="fixed inset-0 z-50 pointer-events-none flex flex-col items-center justify-end pb-40 px-4"
    >
      {/* Glass pill with Instrument Serif text, floating up and fading */}
      <div className="pointer-events-auto px-6 py-3 rounded-full bg-[var(--surface)]/95 border border-[var(--border)] shadow-[0_8px_30px_rgba(0,0,0,0.6)] backdrop-blur-xl flex items-center gap-3 animate-float-fade cursor-pointer">
        <span
          className={`w-2 h-2 rounded-full ${
            type === 'out'
              ? 'bg-[var(--out)] shadow-[0_0_8px_#FF4B4B]'
              : 'bg-[var(--back)] shadow-[0_0_8px_#FFB547]'
          }`}
        />
        <span className="font-serif text-2xl font-normal text-[var(--ink)] tracking-wide">
          {type === 'out' ? t('out_title') : t('back_title')}
        </span>
        <span className="font-mono text-xs text-[var(--muted)]">
          {type === 'out' ? t('out_sub') : t('back_sub')}
        </span>
      </div>
    </div>
  );
}
