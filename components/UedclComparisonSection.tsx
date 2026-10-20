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
              <span className="font-mono text-xs uppercase tracking-wider text-[var(--accent-amber)] font-semibold">
                UEDCL Notices
              </span>
              <div className="font-serif text-3xl font-bold text-[var(--accent-amber)]">
                {data.counters.uedcl_notices}
              </div>
              <p className="font-mono text-xs text-[var(--faint)]">
                Active or partial, not stale
              </p>
            </div>

            <div className="p-4 rounded-xl border border-[var(--border)]/60 bg-[#0A0F1E] space-y-1">
              <span className="font-mono text-xs uppercase tracking-wider text-[var(--out)] font-semibold">
                Citizen Reports
              </span>
              <div className="font-serif text-3xl font-bold text-[var(--out)]">
                {data.counters.citizen_reports}
              </div>
              <p className="font-mono text-xs text-[var(--faint)]">
                Distinct reporting areas
              </p>
            </div>

            <div className="p-4 rounded-xl border border-[var(--border)]/60 bg-[#0A0F1E] space-y-1">
              <span className="font-mono text-xs uppercase tracking-wider text-[var(--ink)] font-semibold">
                In Both
              </span>
              <div className="font-serif text-3xl font-bold text-white">
                {data.counters.in_both}
              </div>
              <p className="font-mono text-xs text-[var(--faint)]">
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
                <p className="font-mono text-xs text-[var(--muted)]">
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
                      <div className="pr-2 line-clamp-2">
                        <span className="text-white font-medium">{item.area}</span>
                        <span className="text-[var(--faint)] ml-1.5 text-xs">
                          ({item.service_area})
                        </span>
                      </div>
                      <div className="text-right whitespace-nowrap text-xs text-[var(--muted)] shrink-0">
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
                <p className="font-mono text-xs text-[var(--muted)]">
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
                      <div className="pr-2 line-clamp-2">
                        <span className="text-white font-medium">{item.area_name}</span>
                        <span className="text-[var(--faint)] ml-1.5 text-xs">
                          ({item.report_count} {item.report_count === 1 ? 'report' : 'reports'})
                        </span>
                      </div>
                      <div className="text-right whitespace-nowrap text-xs text-[var(--muted)] shrink-0">
                        {formatEAT(item.last_report_time)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 1d. Notice to restored per office (hidden until it has data) */}
          {data.office_durations.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-[var(--border)]/40">
              <h3 className="font-serif text-base font-semibold text-white">
                Notice to restored
              </h3>
              <p className="font-mono text-xs text-[var(--muted)]">
                Median duration per UEDCL service office (verified restore timestamps only).
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {data.office_durations.map((od) => (
                  <div
                    key={od.service_area}
                    className="p-3 rounded-lg border border-[var(--border)]/40 bg-[#0A0F1E] font-mono text-xs space-y-1"
                  >
                    <div className="text-[var(--muted)] font-semibold uppercase tracking-wider text-xs">
                      {od.service_area}
                    </div>
                    <div className="font-serif text-lg font-bold text-white">
                      {od.median_hours !== null ? `${od.median_hours}h` : 'not enough data yet'}
                    </div>
                    <div className="text-xs text-[var(--faint)]">
                      n = {od.sample_size}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stale notices warning (collapsed closed list) */}
          {data.footer.stale_notices.length > 0 && (
            <details className="group p-4 rounded-xl border border-amber-500/30 bg-amber-950/20 text-xs font-mono space-y-2 cursor-pointer">
              <summary className="text-[var(--accent-amber)] font-semibold flex items-center justify-between list-none select-none">
                <span className="flex items-center space-x-1.5">
                  <span>⚠ Not updated by UEDCL ({data.footer.stale_notices.length} notices &gt; 24h old)</span>
                </span>
                <span className="text-xs text-[var(--muted)] group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="space-y-2 text-[var(--muted)] max-h-48 overflow-y-auto text-xs pt-2 border-t border-amber-500/20 mt-2">
                {data.footer.stale_notices.map((sn, i) => (
                  <div key={i} className="flex justify-between items-start py-1 gap-2">
                    <span className="line-clamp-2 pr-2">
                      <strong className="text-white">{sn.service_area}</strong>: {sn.areas_raw}
                    </span>
                    <span className="text-[var(--accent-amber)] whitespace-nowrap shrink-0">
                      {Math.round(sn.age_hours)}h old
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* 1e. Footer */}
          <footer className="pt-4 border-t border-[var(--border)]/60 text-xs font-mono text-[var(--faint)] space-y-1">
            <p>
              UEDCL notices come from uedcl.co.ug/outage-alerts, captured every 15 minutes. Areas are matched to OpenStreetMap places by name: {data.footer.matched_count} of {data.footer.total_places} matched. Figures combine UEDCL&apos;s public notices with citizen reports.
            </p>
          </footer>
        </>
      )}
    </section>
  );
}
