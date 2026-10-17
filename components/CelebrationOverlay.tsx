'use client';

import React, { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useLiteMode } from '@/lib/liteMode';

interface CelebrationOverlayProps {
  type: 'out' | 'back' | null;
  onDismiss: () => void;
}

export function CelebrationOverlay({ type, onDismiss }: CelebrationOverlayProps) {
  const { t } = useI18n();
  const { isLite } = useLiteMode();
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (!type) {
      setActiveStep(0);
      return;
    }

    if (!isLite && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(30);
      } catch {
        // ignore
      }
    }

    if (isLite) {
      const timer = setTimeout(() => {
        onDismiss();
      }, 1200);
      return () => clearTimeout(timer);
    }

    if (type === 'out') {
      // Stagger letters E, E, H, H (150ms each)
      const t1 = setTimeout(() => setActiveStep(1), 150);
      const t2 = setTimeout(() => setActiveStep(2), 300);
      const t3 = setTimeout(() => setActiveStep(3), 450);
      const t4 = setTimeout(() => setActiveStep(4), 600);
      const autoDismiss = setTimeout(() => {
        onDismiss();
      }, 1800);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
        clearTimeout(autoDismiss);
      };
    } else if (type === 'back') {
      const autoDismiss = setTimeout(() => {
        onDismiss();
      }, 1500);

      return () => clearTimeout(autoDismiss);
    }
  }, [type, isLite, onDismiss]);

  if (!type) return null;

  // Lite mode display
  if (isLite) {
    return (
      <div
        role="status"
        aria-live="polite"
        onClick={onDismiss}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 cursor-pointer select-none"
      >
        <div className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-2xl text-center max-w-xs w-full animate-fade-in">
          <h2 className="text-xl font-bold font-heading text-[var(--text)] mb-1">
            {type === 'out' ? t('out_title') : t('back_title')}
          </h2>
          <p className="text-sm text-[var(--muted)]">
            {type === 'out' ? t('out_sub') : t('back_sub')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onDismiss}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 cursor-pointer select-none overflow-hidden"
    >
      {type === 'back' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-96 h-96 rounded-full bg-gradient-radial from-[var(--back)]/40 to-transparent animate-bloom" />
        </div>
      )}

      <div className="relative p-7 rounded-3xl bg-[var(--surface)]/95 border border-[var(--border)] shadow-[0_12px_40px_rgba(0,0,0,0.6)] text-center max-w-sm w-full animate-pop-in">
        {type === 'out' ? (
          <>
            {/* E E H H animated letters */}
            <div className="flex items-center justify-center gap-1.5 mb-3 font-heading text-4xl font-extrabold text-[var(--out)] tracking-wider">
              <span className={`inline-block transition-transform duration-200 ${activeStep >= 1 ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}>
                E
              </span>
              <span className={`inline-block transition-transform duration-200 ${activeStep >= 2 ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}>
                E
              </span>
              <span className={`inline-block transition-transform duration-200 ${activeStep >= 3 ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}>
                H
              </span>
              <span className={`inline-block transition-transform duration-200 ${activeStep >= 4 ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}>
                H
              </span>
              <span className="text-2xl text-[var(--muted)]">…</span>
            </div>

            <h2 className="text-lg font-bold font-heading text-[var(--text)] mb-1.5">
              {t('out_title')}
            </h2>
            <p className="text-sm text-[var(--muted)]">{t('out_sub')}</p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-[var(--back)]/20 border border-[var(--back)] flex items-center justify-center text-[var(--back)] text-2xl animate-pop-in">
              ⚡
            </div>
            <h2 className="text-2xl font-extrabold font-heading text-[var(--text)] mb-1.5">
              {t('back_title')}
            </h2>
            <p className="text-sm text-[var(--muted)]">{t('back_sub')}</p>
          </>
        )}
      </div>
    </div>
  );
}
