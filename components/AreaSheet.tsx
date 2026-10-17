'use client';

import React, { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useLiteMode } from '@/lib/liteMode';

export interface AreaOutageItem {
  name: string;
  lat: number;
  lng: number;
  since?: string;
  confirmed?: boolean;
}

export interface WeeklyAreaStat {
  name: string;
  episodes_7d: number;
  hours_dark_7d_estimated: number;
  dark_now: boolean;
}

interface AreaSheetProps {
  darkNowList: AreaOutageItem[];
  weeklyList: WeeklyAreaStat[];
  onSelectArea: (lat: number, lng: number) => void;
}

export function AreaSheet({
  darkNowList,
  weeklyList,
  onSelectArea,
}: AreaSheetProps) {
  const { t } = useI18n();
  const { isLite } = useLiteMode();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'now' | 'week'>('now');

  const formatEATTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Kampala',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date);
    } catch {
      return '';
    }
  };

  return (
    <div className="w-full flex flex-col items-center pointer-events-auto">
      {/* Drag / Toggle Handle Bar */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--surface)]/90 backdrop-blur-md border border-[var(--border)] shadow-md text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)] transition-colors cursor-pointer mb-2 select-none"
        aria-expanded={isOpen}
        aria-label="Toggle area outage details"
      >
        <span className="w-8 h-1 rounded-full bg-[var(--border)] inline-block" />
        <span>{isOpen ? 'Hide list' : `Outage info (${darkNowList.length} dark)`}</span>
      </button>

      {/* Expanded Sheet Modal / Drawer */}
      {isOpen && (
        <div
          className={`w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-t-3xl p-4 shadow-2xl flex flex-col max-h-[60vh] ${
            isLite ? '' : 'transition-all duration-300 animate-pop-in'
          }`}
        >
          {/* Tabs */}
          <div className="flex border-b border-[var(--border)] pb-2 mb-3 gap-2">
            <button
              onClick={() => setActiveTab('now')}
              className={`flex-1 py-1.5 text-sm font-semibold rounded-xl transition-colors ${
                activeTab === 'now'
                  ? 'bg-[var(--surface-2)] text-[var(--out)] font-bold'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              {t('tab_now')} ({darkNowList.length})
            </button>
            <button
              onClick={() => setActiveTab('week')}
              className={`flex-1 py-1.5 text-sm font-semibold rounded-xl transition-colors ${
                activeTab === 'week'
                  ? 'bg-[var(--surface-2)] text-[var(--back)] font-bold'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              {t('tab_week')}
            </button>
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[140px]">
            {activeTab === 'now' ? (
              darkNowList.length === 0 ? (
                <div className="py-8 text-center text-sm text-[var(--muted)]">
                  {t('stats_none')}
                </div>
              ) : (
                darkNowList.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      onSelectArea(item.lat, item.lng);
                      setIsOpen(false);
                    }}
                    className="w-full text-left p-3 rounded-xl bg-[var(--surface-2)]/60 hover:bg-[var(--surface-2)] border border-[var(--border)]/50 transition-colors flex items-center justify-between group"
                  >
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm text-[var(--text)] group-hover:text-[var(--out)] transition-colors">
                        {item.name}
                      </span>
                      {item.since && (
                        <span className="text-xs text-[var(--muted)]">
                          {t('since_label', { time: formatEATTime(item.since) })}
                        </span>
                      )}
                    </div>
                    {item.confirmed && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--out)]/10 text-[var(--out)] border border-[var(--out)]/30">
                        {t('tag_confirmed')}
                      </span>
                    )}
                  </button>
                ))
              )
            ) : weeklyList.length === 0 ? (
              <div className="py-8 text-center text-sm text-[var(--muted)]">
                No recorded outages this week yet.
              </div>
            ) : (
              weeklyList.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-[var(--surface-2)]/60 border border-[var(--border)]/50 flex items-center justify-between"
                >
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm text-[var(--text)]">
                      {item.name}
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      {t('week_stat_row', {
                        name: item.name,
                        episodes: item.episodes_7d,
                        hours: item.hours_dark_7d_estimated,
                      })}
                    </span>
                  </div>
                  {item.dark_now && (
                    <span className="w-2.5 h-2.5 rounded-full bg-[var(--out)] animate-pulse" title="Dark now" />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Disclaimer Footer */}
          <div className="pt-3 mt-2 border-t border-[var(--border)] text-center text-[11px] text-[var(--muted)]">
            {t('disclaimer')}
          </div>
        </div>
      )}
    </div>
  );
}
