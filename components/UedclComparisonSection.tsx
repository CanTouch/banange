'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ComparisonSummary } from '@/lib/official-comparison';

export function UedclComparisonSection() {
  const [data, setData] = useState<ComparisonSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/official-alerts')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load official alerts');
        return res.json();
      })
      .then((json) => setData(json))
      .catch((err) => console.warn('Could not load comparison:', err))
      .finally(() => setLoading(false));
  }, []);

  const downloadUedclCsv = () => {
    window.location.href = '/api/official-alerts?format=csv';
  };

  const formatEAT = (iso: string) => {
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Kampala',
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: 'short',
      }).format(d);
    } catch {
      return iso;
    }
  };

  return (
    <section className="p-5 sm:p-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] backdrop-blur-md space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[var(--border)]/60 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-[var(--accent-amber)]" />
            <h2 className="font-serif text-xl sm:text-2xl font-bold text-[var(--ink)]">
              UEDCL says vs citizens say
            </h2>
          </div>
          <p className="font-mono text-xs text-[var(--muted)] mt-1">
            Last 24 hours · Africa/Kampala time
          </p>
        </div>
        <div>
          <button
            onClick={downloadUedclCsv}
            type="button"
            className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[#05070D] font-mono text-xs text-[var(--ink)] hover:bg-[var(--border)]/30 transition-colors cursor-pointer"
          >
            Download UEDCL CSV ↓
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center font-mono text-xs text-[var(--faint)]">
          Comparing UEDCL notices and crowd reports…
        </div>
      ) : !data ? (
        <div className="py-8 text-center font-mono text-xs text-[var(--faint)]">
          Comparison data unavailable.
        </div>
      ) : (
        <>
          {/* 1a. Three counters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-[var(--border)]/60 bg-[#0A0F1E] space-y-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--accent-amber)] font-semibold">
                UEDCL Notices
              </span>
              <div className="font-serif text-3xl font-bold text-[var(--accent-amber)]">
                {data.counters.uedcl_notices}
              </div>
              <p className="font-mono text-[11px] text-[var(--faint)]">
                Active or partial, not stale
              </p>
            </div>

            <div className="p-4 rounded-xl border border-[var(--border)]/60 bg-[#0A0F1E] space-y-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--out)] font-semibold">
                Citizen Reports
              </span>
              <div className="font-serif text-3xl font-bold text-[var(--out)]">
                {data.counters.citizen_reports}
              </div>
              <p className="font-mono text-[11px] text-[var(--faint)]">
                Distinct reporting areas
              </p>
            </div>

            <div className="p-4 rounded-xl border border-[var(--border)]/60 bg-[#0A0F1E] space-y-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink)] font-semibold">
                In Both
              </span>
              <div className="font-serif text-3xl font-bold text-white">
                {data.counters.in_both}
              </div>
              <p className="font-mono text-[11px] text-[var(--faint)]">
                Within 1.5 km of an active notice
              </p>
            </div>
          </div>

          {/* 1b & 1c: Lists */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 1b. UEDCL listed, no citizen report */}
            <div className="space-y-3">
              <div className="border-b border-[var(--border)]/40 pb-2">
                <h3 className="font-serif text-base font-semibold text-[var(--accent-amber)]">
                  UEDCL listed, no citizen report
                </h3>
                <p className="font-mono text-[11px] text-[var(--muted)]">
                  Tap Power is out here if you are in one of these areas.
                </p>
              </div>

              {data.uedcl_only_areas.length === 0 ? (
                <p className="font-mono text-xs text-[var(--faint)] py-3">
                  None in this period.
                </p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {data.uedcl_only_areas.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg border border-[var(--border)]/40 bg-[#0A0F1E] flex items-center justify-between text-xs font-mono"
                    >
                      <div className="truncate pr-2">
                        <span className="text-white font-medium">{item.area}</span>
                        <span className="text-[var(--faint)] ml-1.5 text-[10px]">
                          ({item.service_area})
                        </span>
                      </div>
                      <div className="text-right whitespace-nowrap text-[11px] text-[var(--muted)]">
                        <span className="text-[var(--accent-amber)] mr-2">{item.status_raw}</span>
                        <span>{formatEAT(item.published_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 1c. Citizen reports with no matching UEDCL notice we could place */}
            <div className="space-y-3">
              <div className="border-b border-[var(--border)]/40 pb-2">
                <h3 className="font-serif text-base font-semibold text-[var(--out)]">
                  Citizen reports with no matching UEDCL notice we could place
                </h3>
                <p className="font-mono text-[11px] text-[var(--muted)]">
                  {data.footer.total_places - data.footer.matched_count} of {data.footer.total_places} listed areas could not be placed on the map, so some matches may be missing.
                </p>
              </div>

              {data.citizen_only_areas.length === 0 ? (
                <p className="font-mono text-xs text-[var(--faint)] py-3">
                  All citizen reports matched an official notice.
                </p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {data.citizen_only_areas.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg border border-[var(--border)]/40 bg-[#0A0F1E] flex items-center justify-between text-xs font-mono"
                    >
                      <div className="truncate pr-2">
                        <span className="text-white font-medium">{item.area_name}</span>
                        <span className="text-[var(--faint)] ml-1.5 text-[10px]">
                          ({item.report_count} {item.report_count === 1 ? 'report' : 'reports'})
                        </span>
                      </div>
                      <div className="text-right whitespace-nowrap text-[11px] text-[var(--muted)]">
                        {formatEAT(item.last_report_time)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 1d. Notice to restored per office */}
          <div className="space-y-3 pt-2 border-t border-[var(--border)]/40">
            <h3 className="font-serif text-base font-semibold text-white">
              Notice to restored
            </h3>
            <p className="font-mono text-xs text-[var(--muted)]">
              Median duration per UEDCL service office (verified restore timestamps only).
            </p>

            {data.office_durations.length === 0 ? (
              <p className="font-mono text-xs text-[var(--faint)] py-2">
                No restored notices with verified timestamps yet.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {data.office_durations.map((od) => (
                  <div
                    key={od.service_area}
                    className="p-3 rounded-lg border border-[var(--border)]/40 bg-[#0A0F1E] font-mono text-xs space-y-1"
                  >
                    <div className="text-[var(--muted)] font-semibold uppercase tracking-wider text-[10px]">
                      {od.service_area}
                    </div>
                    <div className="font-serif text-lg font-bold text-white">
                      {od.median_hours !== null ? `${od.median_hours}h` : 'not enough data yet'}
                    </div>
                    <div className="text-[10px] text-[var(--faint)]">
                      n = {od.sample_size}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stale notices warning if any */}
          {data.footer.stale_notices.length > 0 && (
            <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-950/20 text-xs font-mono space-y-2">
              <div className="text-[var(--accent-amber)] font-semibold flex items-center space-x-1.5">
                <span>⚠ Not updated by UEDCL ({data.footer.stale_notices.length} notices &gt; 24h old)</span>
              </div>
              <div className="space-y-1 text-[var(--muted)] max-h-36 overflow-y-auto text-[11px]">
                {data.footer.stale_notices.map((sn, i) => (
                  <div key={i} className="flex justify-between items-center py-0.5">
                    <span className="truncate pr-2">
                      <strong className="text-white">{sn.service_area}</strong>: {sn.areas_raw.slice(0, 50)}...
                    </span>
                    <span className="text-[var(--accent-amber)] whitespace-nowrap">
                      {Math.round(sn.age_hours)}h old
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 1e. Footer */}
          <footer className="pt-4 border-t border-[var(--border)]/60 text-[11px] font-mono text-[var(--faint)] space-y-1">
            <p>
              UEDCL notices come from uedcl.co.ug/outage-alerts, captured every 15 minutes. Areas are matched to places by name: {data.footer.matched_count} of {data.footer.total_places} matched. Citizen-reported data, not official.
            </p>
            <p className="text-[10px] text-[var(--faint)]/80">
              Place boundary and centroid dataset: GeoNames UG &amp; Uganda Bureau of Statistics (UBOS).
            </p>
          </footer>
        </>
      )}
    </section>
  );
}
