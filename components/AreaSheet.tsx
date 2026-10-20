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

export interface DarkNowRow {
  kind: 'citizen' | 'official_unplaced';
  name: string;
  lat?: number;
  lng?: number;
  since?: string;
  confirmed?: boolean;
  service_area?: string;
  status_raw?: string;
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

  // Merge citizen reports and unplaced UEDCL notices
  const combinedRows: DarkNowRow[] = [
    ...darkNowList.map((item): DarkNowRow => ({
      kind: 'citizen',
      name: item.name,
      lat: item.lat,
      lng: item.lng,
      since: item.since,
      confirmed: item.confirmed,
    })),
    ...unplacedNotices.map((n): DarkNowRow => ({
      kind: 'official_unplaced',
      name: n.areas_raw,
      service_area: n.service_area,
      status_raw: n.status_raw,
      since: n.published_at,
    })),
  ];

  return (
    <div className="w-full max-w-lg mx-auto rounded-t-[28px] border-t border-x border-[var(--border)] bg-[var(--surface)] backdrop-blur-xl px-5 pt-2.5 pb-4 shadow-2xl pointer-events-auto select-none">
      {/* Small grab handle */}
      <div className="w-9 h-1 rounded-full bg-[var(--faint)]/50 mx-auto mb-3" />

      {/* 5. Buttons: "Power is out here" primary; "Power is back" neutral outline (not amber) */}
      <div className="grid grid-cols-2 gap-3 mb-3.5">
        {/* Power is out here (Primary) */}
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

        {/* Power is back (Neutral outline, not amber) */}
        <button
          type="button"
          onClick={() => onReport('back')}
          disabled={isReporting}
          className="h-[52px] rounded-full border border-[var(--border)] bg-transparent text-[var(--ink)] hover:bg-[var(--border)]/30 font-sans font-semibold text-sm active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
        >
          {isReporting ? (
            <span className="w-4 h-4 border-2 border-[var(--ink)] border-t-transparent rounded-full animate-spin" />
          ) : (
            <span>{t('btn_back')}</span>
          )}
        </button>
      </div>

      {/* Mono section label "DARK NOW" with "See all N" */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--muted)] font-semibold">
          DARK NOW
        </span>
        {combinedRows.length > 2 && (
          <button
            type="button"
            onClick={() => setExpandedAll(!expandedAll)}
            className="font-mono text-xs text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer transition-colors"
          >
            {expandedAll ? 'Show less' : `See all ${combinedRows.length}`}
          </button>
        )}
      </div>

      {/* Merged Dark Now list: up to 2 rows visible, or expanded with scroll */}
      <div
        className={`overflow-y-auto pr-1 transition-all duration-300 divide-y divide-[var(--border)] ${
          expandedAll ? 'max-h-[220px]' : 'max-h-[105px]'
        }`}
      >
        {combinedRows.length === 0 ? (
          <div className="h-[44px] flex items-center justify-center text-sm text-[var(--muted)] font-mono">
            No citizen reports right now
          </div>
        ) : (
          combinedRows.map((row, idx) => {
            if (row.kind === 'citizen') {
              return (
                <button
                  key={`citizen-${row.name}-${idx}`}
                  type="button"
                  onClick={() => {
                    if (row.lat !== undefined && row.lng !== undefined) {
                      onSelectArea(row.lat, row.lng);
                    }
                  }}
                  className="w-full py-2.5 flex items-center justify-between text-left group hover:opacity-85 transition-opacity cursor-pointer gap-2"
                >
                  {/* Left: glowing red dot + area name (never truncate with ellipsis, wrap to 2 lines) */}
                  <div className="flex items-center min-w-0 flex-1 mr-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[var(--out)] shadow-[0_0_8px_#FF4B4B] mr-2.5 shrink-0" />
                    <span className="font-serif text-[20px] sm:text-[22px] leading-snug text-[var(--ink)] line-clamp-2">
                      {row.name}
                    </span>
                  </div>

                  {/* Right: IBM Plex Mono 12px "since 18:42 · 2 h 10 m" */}
                  <div className="font-mono text-xs text-[var(--muted)] shrink-0 whitespace-nowrap text-right">
                    <span>since {formatEATTime(row.since)} · </span>
                    <span className="text-[var(--out)] font-medium">
                      {formatDuration(row.since)}
                    </span>
                  </div>
                </button>
              );
            }

            // Official notice unplaced
            return (
              <div
                key={`official-${row.service_area}-${idx}-${row.since}`}
                className="py-2.5 flex items-start justify-between text-left gap-2"
              >
                {/* Left: Amber hollow ring + area name wrap to 2 lines + tag */}
                <div className="flex items-start min-w-0 flex-1 mr-2">
                  <span className="w-3 h-3 rounded-full border-2 border-[#F59E0B] bg-transparent mr-2.5 shrink-0 mt-1" />
                  <div className="flex flex-col">
                    <div className="flex items-center flex-wrap gap-1.5 mb-0.5">
                      <span className="font-mono text-xs font-semibold text-white">
                        {row.service_area}
                      </span>
                      <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[var(--accent-amber)] font-medium">
                        location not mapped yet
                      </span>
                    </div>
                    <span className="font-serif text-[18px] sm:text-[20px] leading-snug text-[var(--ink)] line-clamp-2">
                      {row.name}
                    </span>
                  </div>
                </div>

                {/* Right: Status and time */}
                <div className="font-mono text-xs text-[var(--muted)] shrink-0 whitespace-nowrap text-right">
                  <div className="text-[var(--accent-amber)] font-medium">{row.status_raw}</div>
                  <div>{formatEATTime(row.since)}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer line: "Community reports, not official data" */}
      <p className="font-sans text-xs text-[var(--faint)] text-center mt-3 pt-2 border-t border-[var(--border)]/60">
        Community reports, not official data
      </p>
    </div>
  );
}
