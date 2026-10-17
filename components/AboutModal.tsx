'use client';

import React from 'react';
import { useI18n } from '@/lib/i18n';
import { useLiteMode } from '@/lib/liteMode';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  const { t } = useI18n();
  const { isLite, setLite } = useLiteMode();

  if (!isOpen) return null;

  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'hello@kuppelabs.com';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('about_title')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-pop-in"
    >
      <div className="relative w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 shadow-2xl flex flex-col max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
          <h2 className="text-xl font-bold font-heading text-[var(--text)]">
            {t('about_title')}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
            aria-label={t('close')}
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-4 text-sm text-[var(--text)] leading-relaxed">
          {/* Disclaimer */}
          <div>
            <h3 className="font-semibold text-xs tracking-wider uppercase text-[var(--muted)] mb-1">
              Disclaimer
            </h3>
            <p className="text-[var(--muted)]">{t('about_disclaimer')}</p>
          </div>

          {/* Privacy */}
          <div>
            <h3 className="font-semibold text-xs tracking-wider uppercase text-[var(--muted)] mb-1">
              Privacy
            </h3>
            <p className="text-[var(--muted)]">{t('about_privacy')}</p>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold text-xs tracking-wider uppercase text-[var(--muted)] mb-1">
              {t('about_contact')}
            </h3>
            <a
              href={`mailto:${contactEmail}`}
              className="text-[var(--focus)] hover:underline font-medium"
            >
              {contactEmail}
            </a>
          </div>

          {/* Credits */}
          <div>
            <h3 className="font-semibold text-xs tracking-wider uppercase text-[var(--muted)] mb-1">
              Credits
            </h3>
            <p className="text-[var(--muted)] text-xs">{t('about_credits')}</p>
          </div>

          {/* Lite Mode Switch */}
          <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between">
            <label htmlFor="lite-toggle" className="text-sm font-semibold text-[var(--text)] cursor-pointer">
              {t('lite_mode')}
            </label>
            <button
              id="lite-toggle"
              role="switch"
              aria-checked={isLite}
              onClick={() => setLite(!isLite)}
              className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                isLite ? 'bg-[var(--focus)]' : 'bg-[var(--surface-2)] border border-[var(--border)]'
              }`}
            >
              <span
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  isLite ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full h-11 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          {t('close')}
        </button>
      </div>
    </div>
  );
}
