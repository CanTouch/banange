'use client';

import React, { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { getOutageDurationHours } from '@/lib/duration';

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

export interface UnplacedOfficialNotice {
  service_area: string;
  areas_raw: string;
  published_at: string;
  status_raw: string;
}

interface AreaSheetProps {
  darkNowList: AreaOutageItem[];
  weeklyList: WeeklyAreaStat[];
  unplacedNotices?: UnplacedOfficialNotice[];
  onSelectArea: (lat: number, lng: number) => void;
  onReport: (kind: 'out' | 'back') => void;
  isReporting?: boolean;
}

export function AreaSheet({
  darkNowList,
  unplacedNotices = [],
  onSelectArea,
  onReport,
  isReporting = false,
}: AreaSheetProps) {
  const { t } = useI18n();
  const [expandedAll, setExpandedAll] = useState(false);

  const formatEATTime = (isoString?: string) => {
    if (!isoString) return '18:00';
    try {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Kampala',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date);
    } catch {
      return '18:00';
    }
  };

  const formatDuration = (isoString?: string) => {
    if (!isoString) return '0 m';
    const hours = getOutageDurationHours({ start: isoString }, undefined, { raw: true });
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (h > 0) {
      return `${h} h ${m} m`;
    }
    return `${Math.max(1, m)} m`;
  };

  return (
    <div className="w-full max-w-lg mx-auto rounded-t-[28px] border-t border-x border-[var(--border)] bg-[var(--surface)] backdrop-blur-xl px-5 pt-2.5 pb-4 shadow-2xl pointer-events-auto select-none">
      {/* Small grab handle */}
      <div className="w-9 h-1 rounded-full bg-[var(--faint)]/50 mx-auto mb-3" />

      {/* 6.a Two buttons side by side */}
      <div className="grid grid-cols-2 gap-3 mb-3.5">
        {/* Power is out here */}
        <button
          type="button"
          onClick={() => onReport('out')}
          disabled={isReporting}
          className="h-[52px] rounded-full bg-[var(--out)] text-[#05070D] font-sans font-bold text-sm shadow-[0_0_12px_#FF4B4B] hover:opacity-95 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          {isReporting ? (
            <span className="w-4 h-4 border-2 border-[#05070D] border-t-transparent rounded-full animate-spin" />
          ) : (
            <span>{t('btn_out')}</span>
          )}
        </button>

        {/* Power is back */}
        <button
          type="button"
          onClick={() => onReport('back')}
          disabled={isReporting}
          className="h-[52px] rounded-full border border-[var(--back)] bg-transparent text-[var(--back)] font-sans font-bold text-sm hover:bg-[var(--back)]/10 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          {isReporting ? (
            <span className="w-4 h-4 border-2 border-[var(--back)] border-t-transparent rounded-full animate-spin" />
          ) : (
            <span>{t('btn_back')}</span>
          )}
        </button>
      </div>

      {/* 6.b Mono section label "DARK NOW" with "See all N" */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] font-semibold">
          DARK NOW
        </span>
        {darkNowList.length > 2 && (
          <button
            type="button"
            onClick={() => setExpandedAll(!expandedAll)}
            className="font-mono text-[10px] text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer transition-colors"
          >
            {expandedAll ? 'Show less' : `See all ${darkNowList.length}`}
          </button>
        )}
      </div>

      {/* 6.c Dark Now list: up to 2 rows visible (80px), or expanded with scroll */}
      <div
        className={`overflow-y-auto pr-1 transition-all duration-300 divide-y divide-[var(--border)] ${
          expandedAll ? 'max-h-[200px]' : 'max-h-[82px]'
        }`}
      >
        {darkNowList.length === 0 ? (
          <div className="h-[40px] flex items-center justify-center text-xs text-[var(--muted)] font-mono">
            All areas lit up tonight
          </div>
        ) : (
          darkNowList.map((item, idx) => (
            <button
              key={`${item.name}-${idx}`}
              type="button"
              onClick={() => onSelectArea(item.lat, item.lng)}
              className="w-full h-[40px] flex items-center justify-between text-left group hover:opacity-85 transition-opacity cursor-pointer"
            >
              {/* Left: glowing red dot + area name in Instrument Serif 22px */}
              <div className="flex items-center min-w-0 mr-3">
                <span className="w-2 h-2 rounded-full bg-[var(--out)] shadow-[0_0_8px_#FF4B4B] mr-2.5 shrink-0" />
                <span className="font-serif text-[22px] leading-none text-[var(--ink)] truncate max-w-[160px] sm:max-w-[240px]">
                  {item.name}
                </span>
              </div>

              {/* Right: IBM Plex Mono 12px "since 18:42 · 2 h 10 m" */}
              <div className="font-mono text-[12px] text-[var(--muted)] shrink-0 whitespace-nowrap">
                <span>since {formatEATTime(item.since)} · </span>
                <span className="text-[var(--out)] font-medium">
                  {formatDuration(item.since)}
                </span>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Unplaced UEDCL Notices */}
      {unplacedNotices && unplacedNotices.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-[var(--border)]/70 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] font-semibold">
              Listed by UEDCL, not yet placed on the map
            </span>
            <span className="font-mono text-[10px] text-[var(--accent-amber)] font-medium">
              {unplacedNotices.length} {unplacedNotices.length === 1 ? 'notice' : 'notices'}
            </span>
          </div>

          <div
            className={`overflow-y-auto pr-1 transition-all duration-300 divide-y divide-[var(--border)]/50 ${
              expandedAll ? 'max-h-[160px]' : 'max-h-[84px]'
            }`}
          >
            {unplacedNotices.map((notice, idx) => (
              <div
                key={`${notice.service_area}-${idx}-${notice.published_at}`}
                className="py-1.5 flex flex-col gap-0.5 text-left"
              >
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="font-semibold text-white tracking-wide">
                    {notice.service_area}
                  </span>
                  <div className="flex items-center space-x-1.5 text-[var(--muted)]">
                    <span>{formatEATTime(notice.published_at)}</span>
                    <span>·</span>
                    <span className="text-[var(--accent-amber)] font-medium">{notice.status_raw}</span>
                  </div>
                </div>
                <div className="text-[12px] font-mono text-[var(--muted)] truncate" title={notice.areas_raw}>
                  {notice.areas_raw}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6.d Footer line: "Community reports, not official data" */}
      <p className="font-sans text-[11px] text-[var(--faint)] text-center mt-3 pt-2 border-t border-[var(--border)]/60">
        Community reports, not official data
      </p>
    </div>
  );
}
