'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { InsightsData } from '@/lib/insights';

export function InsightsClient({ initialData }: { initialData?: InsightsData | null }) {
  const { language, setLanguage } = useI18n();
  const [days, setDays] = useState<7 | 30>((initialData?.range_days as 7 | 30) || 7);
  const [data, setData] = useState<InsightsData | null>(initialData || null);
  const [loading, setLoading] = useState<boolean>(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{
    area: string;
    date: string;
    hours: number;
    outages: number;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [bubbleChartWidth, setBubbleChartWidth] = useState<number | null>(null);
  const containerElRef = useRef<HTMLDivElement | null>(null);

  const bubbleContainerRef = useCallback((el: HTMLDivElement | null) => {
    containerElRef.current = el;
    if (!el) return;
    const update = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) {
        setBubbleChartWidth(w);
      }
    };
    update();
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.round(entry.contentRect.width);
        if (w > 0) {
          setBubbleChartWidth(w);
        }
      }
    });
    observer.observe(el);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (containerElRef.current) {
        const w = Math.round(containerElRef.current.getBoundingClientRect().width);
        if (w > 0) setBubbleChartWidth(w);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchInsights = useCallback(async (selectedDays: 7 | 30) => {
    if (initialData && initialData.range_days === selectedDays && data === initialData) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/insights?days=${selectedDays}`);
      if (!res.ok) throw new Error('Failed to load insights data');
      const json: InsightsData = await res.json();
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [initialData, data]);

  useEffect(() => {
    if (!initialData || days !== initialData.range_days) {
      fetchInsights(days);
    }
  }, [days, fetchInsights, initialData]);

  // Format Kampala EAT datetime
  const formatEAT = (isoStr: string | null) => {
    if (!isoStr) return 'None recorded';
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Kampala',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(isoStr)) + ' EAT';
    } catch {
      return isoStr;
    }
  };

  // Day header formatter: "Mon 12"
  const formatDayHeader = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Kampala',
        weekday: 'short',
        day: 'numeric',
      }).format(d);
    } catch {
      return dateStr.slice(5);
    }
  };

  // Plural helper
  const pluralOutages = (count: number) => {
    return `${count} ${count === 1 ? 'outage' : 'outages'}`;
  };

  // Format hours label ("under 1 h" instead of "0 h" if outages occurred)
  const formatHoursText = (hours: number, outages?: number) => {
    if (hours === 0 && outages && outages > 0) {
      return 'under 1 h';
    }
    if (hours === 0) {
      return '0 h';
    }
    return `${hours} h`;
  };

  // Format short hours for Outage Severity bubble chart
  const formatShortHours = (hours: number, outages?: number) => {
    if (hours === 0 && outages && outages > 0) {
      return '45m';
    }
    if (hours <= 0) {
      return '0m';
    }
    if (hours < 1) {
      return `${Math.round(hours * 60)}m`;
    }
    if (hours < 10) {
      const formatted = hours % 1 === 0 ? hours.toFixed(0) : hours.toFixed(1);
      return `${formatted}h`;
    }
    return `${Math.round(hours)}h`;
  };

  // CSV Download
  const downloadCSV = () => {
    if (!data) return;
    const header = 'area,date,outages,hours_dark_estimated\n';
    const rows: string[] = [];

    data.heatmap.rows.forEach((r) => {
      r.days.forEach((d) => {
        rows.push(`"${r.area.replace(/"/g, '""')}","${d.date}",${d.outages},${d.hours_dark_estimated}`);
      });
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(header + rows.join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `banange-outages-${days}d.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Canvas Share Image Generator
  const downloadShareImage = () => {
    if (!data) return;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background: deep night-sky
    ctx.fillStyle = '#05070D';
    ctx.fillRect(0, 0, 1200, 630);

    // Accent line
    ctx.strokeStyle = '#1D2848';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(80, 130);
    ctx.lineTo(1120, 130);
    ctx.stroke();

    // Wordmark
    ctx.fillStyle = '#E9EEF8';
    ctx.font = 'bold 38px Georgia, serif';
    ctx.fillText('Banange', 80, 95);

    ctx.fillStyle = '#7B87A3';
    ctx.font = '14px monospace';
    ctx.fillText(`OUTAGE INTELLIGENCE · LAST ${days} DAYS · ESTIMATED`, 260, 95);

    // Top 5 Areas
    ctx.fillStyle = '#E9EEF8';
    ctx.font = '22px Georgia, serif';
    ctx.fillText('Top Outage Areas by Estimated Hours Dark', 80, 180);

    const top5 = data.ranked_areas.slice(0, 5);
    const maxVal = top5[0]?.hours_dark_estimated || 1;

    top5.forEach((item, i) => {
      const y = 230 + i * 62;
      ctx.fillStyle = '#7B87A3';
      ctx.font = '16px monospace';
      ctx.fillText(`${i + 1}.`, 80, y);

      ctx.fillStyle = '#E9EEF8';
      ctx.font = '20px Georgia, serif';
      ctx.fillText(item.name, 120, y);

      const barWidth = Math.max(10, Math.min(600, (item.hours_dark_estimated / maxVal) * 550));
      ctx.fillStyle = '#FF4B4B';
      ctx.fillRect(400, y - 16, barWidth, 18);

      ctx.fillStyle = '#FFB547';
      ctx.font = '15px monospace';
      const hoursLabel = formatHoursText(item.hours_dark_estimated, item.outages);
      ctx.fillText(`${hoursLabel} est`, 420 + barWidth, y - 2);
    });

    // Footer
    ctx.strokeStyle = '#1D2848';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(80, 560);
    ctx.lineTo(1120, 560);
    ctx.stroke();

    ctx.fillStyle = '#7B87A3';
    ctx.font = '13px monospace';
    ctx.fillText('Community reports, not official data. · https://banange.kuppelabs.com', 80, 595);

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `banange-insights-${days}d.png`;
    link.href = dataUrl;
    link.click();
  };

  const getHeatmapColor = (hours: number, outages: number) => {
    if (outages === 0 && hours === 0) return 'bg-[#05070D] text-[var(--faint)] border-[var(--border)]/40';
    if (hours < 2) return 'bg-[#FF4B4B]/20 text-[#FF9999] border-[#FF4B4B]/30';
    if (hours < 5) return 'bg-[#FF4B4B]/40 text-white font-medium border-[#FF4B4B]/50';
    if (hours < 10) return 'bg-[#FF4B4B]/65 text-white font-semibold border-[#FF4B4B]/70 shadow-[0_0_6px_rgba(255,75,75,0.3)]';
    return 'bg-[#FF4B4B] text-[#05070D] font-bold border-red-300 shadow-[0_0_10px_#FF4B4B]';
  };

  const totalHeatmapOutages =
    data?.heatmap.rows.reduce(
      (sum, r) => sum + r.days.reduce((dSum, d) => dSum + d.outages, 0),
      0
    ) || 0;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)] flex flex-col font-sans selection:bg-[#FF4B4B]/30 select-none">
      <canvas ref={canvasRef} className="hidden" />

      {/* Top Banner for Demo Mode */}
      {data?.demo_mode && (
        <div className="bg-amber-600/90 text-white font-mono text-[10px] uppercase tracking-wider py-1.5 px-4 text-center border-b border-amber-500/40 sticky top-0 z-50">
          DEMO DATA — Simulated 30-day Uganda outage dataset (Supabase writes disabled)
        </div>
      )}

      {/* Navigation Header */}
      <header className="border-b border-[var(--border)] bg-[var(--surface)] backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link href="/" className="flex items-center space-x-1.5 group">
              <span className="font-serif text-[26px] leading-none text-[var(--ink)] group-hover:text-[var(--out)] transition-colors">
                Banange
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--back)] shadow-[0_0_6px_#FFB547]" />
            </Link>
            <span className="font-mono text-xs text-[var(--muted)]">/</span>
            <span className="font-mono text-xs tracking-wider uppercase text-[var(--muted)]">Insights</span>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Range Toggle */}
            <div className="bg-[var(--bg)] border border-[var(--border)] p-0.5 rounded-lg flex font-mono text-xs">
              <button
                type="button"
                onClick={() => setDays(7)}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                  days === 7
                    ? 'bg-[var(--surface)] text-[var(--ink)] border border-[var(--border)] font-semibold shadow-sm'
                    : 'text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                7d
              </button>
              <button
                type="button"
                onClick={() => setDays(30)}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                  days === 30
                    ? 'bg-[var(--surface)] text-[var(--ink)] border border-[var(--border)] font-semibold shadow-sm'
                    : 'text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                30d
              </button>
            </div>

            {/* Back to Live Map */}
            <Link
              href="/"
              className="font-mono text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--faint)] transition-colors flex items-center space-x-1.5"
            >
              <span>Map</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </Link>

            {/* Language toggle */}
            <button
              type="button"
              onClick={() => setLanguage(language === 'en' ? 'lg' : 'en')}
              className="w-8 h-8 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)] font-mono text-[10px] font-semibold flex items-center justify-center cursor-pointer transition-colors"
            >
              {language.toUpperCase()}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-5 py-8 flex-1 w-full space-y-8">
        {/* Title & Action Bar (Clean typography, no red boxes behind headers) */}
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 border-b border-[var(--border)] pb-6">
          <div>
            <h1 className="font-serif text-[42px] sm:text-[48px] leading-tight text-[var(--ink)] tracking-tight">
              Outage Intelligence
            </h1>
            <p className="font-mono text-xs text-[var(--muted)] mt-1 tracking-wide">
              LAST {days} DAYS · ESTIMATED PUBLIC CROWD REPORTS ACROSS UGANDA
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={downloadCSV}
              disabled={!data || loading}
              className="font-mono text-xs px-3.5 py-2 rounded-lg bg-[var(--surface)] hover:bg-[var(--surface)]/90 border border-[var(--border)] text-[var(--ink)] transition-all flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Download CSV</span>
            </button>

            <button
              type="button"
              onClick={downloadShareImage}
              disabled={!data || loading}
              className="font-mono text-xs px-3.5 py-2 rounded-lg border border-[var(--out)]/50 bg-[var(--out)]/10 text-[var(--out)] hover:bg-[var(--out)]/20 transition-all flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Download share image</span>
            </button>
          </div>
        </div>

        {/* Loading / Error States */}
        {loading && (
          <div className="py-20 flex flex-col items-center justify-center space-y-3">
            <div className="w-7 h-7 border-2 border-[var(--out)] border-t-transparent rounded-full animate-spin" />
            <p className="font-mono text-xs text-[var(--muted)]">Loading estimated records...</p>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl border border-red-500/30 bg-red-950/30 font-mono text-xs text-red-300">
            {error}
          </div>
        )}

        {data && (
          <>
            {/* 1. Stats Row: Instrument Serif 40px numbers and mono small labels */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Total Outages */}
              <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] backdrop-blur-md">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] font-semibold">
                  TOTAL OUTAGES
                </p>
                <p className="font-serif text-[40px] leading-tight text-[var(--ink)] mt-1">
                  {data.summary.total_outages}
                </p>
                <p className="font-mono text-[11px] text-[var(--faint)] mt-0.5">
                  {pluralOutages(data.summary.total_outages)}
                </p>
              </div>

              {/* Hours Dark */}
              <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] backdrop-blur-md">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] font-semibold">
                  HOURS DARK
                </p>
                <p className="font-serif text-[40px] leading-tight text-[var(--out)] mt-1">
                  {formatHoursText(data.summary.total_hours_dark_estimated, data.summary.total_outages)}
                </p>
                <p className="font-mono text-[11px] text-[var(--faint)] mt-0.5">
                  Estimated duration
                </p>
              </div>

              {/* Worst Area */}
              <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] backdrop-blur-md">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] font-semibold">
                  WORST AREA
                </p>
                <p className="font-serif text-[28px] sm:text-[32px] leading-tight text-[var(--back)] mt-1 truncate" title={data.summary.worst_area}>
                  {data.summary.worst_area}
                </p>
                <p className="font-mono text-[11px] text-[var(--faint)] mt-0.5">
                  Most estimated dark hours
                </p>
              </div>

              {/* Last Outage Time */}
              <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] backdrop-blur-md">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] font-semibold">
                  LAST OUTAGE TIME
                </p>
                <p className="font-mono text-sm sm:text-base font-semibold text-[var(--ink)] mt-2 truncate">
                  {formatEAT(data.summary.last_outage_time)}
                </p>
                <p className="font-mono text-[11px] text-[var(--faint)] mt-0.5">
                  Kampala EAT
                </p>
              </div>
            </div>

            {/* 2. Ranked List with thin red glow bars */}
            <div className="p-5 sm:p-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] backdrop-blur-md space-y-4">
              <div>
                <h2 className="font-serif text-2xl text-[var(--ink)] font-normal">
                  Top 15 Areas by Estimated Hours Dark
                </h2>
                <p className="font-mono text-[11px] text-[var(--muted)] mt-0.5">
                  CUMULATIVE ESTIMATED OUTAGE DURATION OVER THE LAST {days} DAYS
                </p>
              </div>

              {data.ranked_areas.length === 0 ? (
                <p className="font-mono text-xs text-[var(--muted)] py-6 text-center">
                  No outages recorded in this period.
                </p>
              ) : (
                <div className="w-full space-y-3 pt-2">
                  {data.ranked_areas.map((item, idx) => {
                    const maxVal = data.ranked_areas[0]?.hours_dark_estimated || 1;
                    const pct = Math.max(3, Math.min(100, (item.hours_dark_estimated / maxVal) * 100));

                    return (
                      <div key={item.name} className="flex items-center text-xs space-x-3">
                        <span className="w-5 font-mono text-[11px] text-[var(--faint)] text-right">
                          {idx + 1}
                        </span>
                        <span className="w-28 sm:w-36 truncate font-serif text-[19px] leading-tight text-[var(--ink)]" title={item.name}>
                          {item.name}
                        </span>
                        {/* Thin red glow bar */}
                        <div className="flex-1 bg-[var(--border)]/40 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[var(--out)] shadow-[0_0_8px_#FF4B4B] transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-24 text-right font-mono text-xs text-[var(--back)] font-medium">
                          {formatHoursText(item.hours_dark_estimated, item.outages)}{' '}
                          <span className="text-[10px] text-[var(--faint)]">est</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. Bubble Chart: Red glowing circles on a faint dot grid */}
            <div className="p-5 sm:p-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] backdrop-blur-md space-y-4">
              <div>
                <h2 className="font-serif text-2xl text-[var(--ink)] font-normal">
                  Outage Severity Distribution
                </h2>
                <p className="font-mono text-[11px] text-[var(--muted)] mt-0.5">
                  AREAS SIZED BY ESTIMATED DARK HOURS ON FAINT COORDINATE GRID
                </p>
              </div>

              {(() => {
                const topAreas = data.ranked_areas.slice(0, 10);
                if (topAreas.length === 0) {
                  return (
                    <div className="py-12 border border-[var(--border)] rounded-xl text-center font-mono text-xs text-[var(--muted)]">
                      No outage severity data recorded
                    </div>
                  );
                }

                // Layout configuration based on width
                const w = Math.max(300, bubbleChartWidth || 800);
                const isMobile = w < 600;
                const cols = isMobile ? (w < 420 ? 2 : 3) : 5;
                const maxHours = Math.max(...topAreas.map((a) => a.hours_dark_estimated), 1);
                const minR = 26;
                const maxR = 56;

                const items = topAreas.map((area, idx) => {
                  const ratio = Math.max(0, Math.min(1, area.hours_dark_estimated / maxHours));
                  const r = minR + ratio * (maxR - minR);
                  return { ...area, r, idx };
                });

                const rowCount = Math.ceil(items.length / cols);
                const rowHeight = maxR * 2 + 56;
                const placed: Array<(typeof items)[0] & { cx: number; cy: number }> = [];

                for (let rowIdx = 0; rowIdx < rowCount; rowIdx++) {
                  const rowItems = items.slice(rowIdx * cols, (rowIdx + 1) * cols);
                  const cy = 24 + maxR + rowIdx * rowHeight;
                  const colWidth = w / rowItems.length;

                  const placedRow = rowItems.map((item, colIdx) => ({
                    ...item,
                    cx: colWidth * (colIdx + 0.5),
                    cy,
                  }));

                  // If two dots are closer than their radii plus 12px, nudge them apart
                  for (let iter = 0; iter < 12; iter++) {
                    for (let i = 0; i < placedRow.length - 1; i++) {
                      const a = placedRow[i];
                      const b = placedRow[i + 1];
                      const minDistance = a.r + b.r + 12;
                      const dist = b.cx - a.cx;
                      if (dist < minDistance) {
                        const overlap = minDistance - dist;
                        a.cx -= overlap / 2;
                        b.cx += overlap / 2;
                      }
                    }
                  }

                  // Clamp within container with margin so nothing is clipped
                  const leftPad = placedRow[0].r + 14;
                  const rightPad = w - (placedRow[placedRow.length - 1].r + 14);
                  if (placedRow[0].cx < leftPad) {
                    const shift = leftPad - placedRow[0].cx;
                    placedRow.forEach((it) => (it.cx += shift));
                  }
                  const lastItem = placedRow[placedRow.length - 1];
                  if (lastItem.cx > rightPad) {
                    const shift = lastItem.cx - rightPad;
                    placedRow.forEach((it) => (it.cx -= shift));
                  }

                  placed.push(...placedRow);
                }

                const totalSvgHeight = rowCount * rowHeight + 16;

                return (
                  <div
                    ref={bubbleContainerRef}
                    className="relative w-full rounded-xl border border-[var(--border)] bg-[#05070D] overflow-hidden"
                    style={{ minHeight: `${totalSvgHeight}px` }}
                  >
                    <svg
                      className="w-full h-full block"
                      viewBox={`0 0 ${w} ${totalSvgHeight}`}
                      style={{ width: '100%', height: `${totalSvgHeight}px` }}
                    >
                      <defs>
                        <pattern id="dot-grid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                          <circle cx="2" cy="2" r="1" fill="#1D2848" opacity="0.8" />
                        </pattern>
                        {/* Soft red outer glow: rgba(255,75,75,0.45), blur 14px */}
                        <filter id="soft-red-glow" x="-50%" y="-50%" width="200%" height="200%">
                          <feDropShadow
                            dx="0"
                            dy="0"
                            stdDeviation="14"
                            floodColor="rgba(255, 75, 75, 0.45)"
                          />
                        </filter>
                      </defs>
                      <rect width="100%" height="100%" fill="url(#dot-grid)" />

                      {placed.map((item) => {
                        const label = formatShortHours(item.hours_dark_estimated, item.outages);
                        // Font size: 12px default, shrink to 10px if label length > 4 and r is close to minimum
                        const fontSize = label.length > 4 && item.r <= 28 ? 10 : 12;

                        return (
                          <g key={item.name}>
                            {/* Dot with fill #FF4B4B at 85% opacity, 1px lighter ring (#FFA3A3), and soft red glow */}
                            <circle
                              cx={item.cx}
                              cy={item.cy}
                              r={item.r}
                              fill="#FF4B4B"
                              fillOpacity="0.85"
                              stroke="#FFA3A3"
                              strokeWidth="1"
                              filter="url(#soft-red-glow)"
                            />

                            {/* Hours text: white #FFFFFF, IBM Plex Mono, 12px (or 10px fallback), weight 600, centred both ways */}
                            <text
                              x={item.cx}
                              y={item.cy}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fill="#FFFFFF"
                              fontFamily="var(--font-mono), 'IBM Plex Mono', monospace"
                              fontWeight="600"
                              fontSize={fontSize}
                              style={{
                                paintOrder: 'stroke fill',
                                stroke: '#05070D',
                                strokeWidth: 2,
                                strokeLinejoin: 'round',
                                textShadow: '0 0 6px rgba(5, 7, 13, 0.9)',
                              }}
                            >
                              {label}
                            </text>

                            {/* Area name: white #E9EEF8, Hanken Grotesk 12px, centred 8px below the dot */}
                            <text
                              x={item.cx}
                              y={item.cy + item.r + 8}
                              textAnchor="middle"
                              dominantBaseline="hanging"
                              fill="#E9EEF8"
                              fontFamily="var(--font-sans), 'Hanken Grotesk', system-ui, sans-serif"
                              fontSize="12"
                              fontWeight="500"
                            >
                              {item.name}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                );
              })()}
            </div>

            {/* 4. Heatmap Grid: Area x Day */}
            <div className="p-5 sm:p-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] backdrop-blur-md space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="font-serif text-2xl text-[var(--ink)] font-normal">
                    Area × Day Heatmap
                  </h2>
                  <p className="font-mono text-[11px] text-[var(--muted)] mt-0.5">
                    INTENSITY REPRESENTS ESTIMATED HOURS DARK. TAP ANY CELL FOR DETAILS.
                  </p>
                </div>

                <div className="flex items-center space-x-2 font-mono text-[10px] text-[var(--muted)]">
                  <span>0 h</span>
                  <span className="w-3.5 h-3.5 rounded bg-[#05070D] border border-[var(--border)]" />
                  <span className="w-3.5 h-3.5 rounded bg-[#FF4B4B]/20 border border-[#FF4B4B]/30" />
                  <span className="w-3.5 h-3.5 rounded bg-[#FF4B4B]/40 border border-[#FF4B4B]/50" />
                  <span className="w-3.5 h-3.5 rounded bg-[#FF4B4B]/65 border border-[#FF4B4B]/70" />
                  <span className="w-3.5 h-3.5 rounded bg-[#FF4B4B] border border-red-300" />
                  <span>10+ h</span>
                </div>
              </div>

              {selectedCell && (
                <div className="p-3 rounded-lg border border-[var(--back)]/30 bg-[var(--back)]/10 flex items-center justify-between font-mono text-xs animate-pop-in">
                  <div>
                    <span className="font-serif text-sm font-normal text-[var(--ink)]">{selectedCell.area}</span> on{' '}
                    <span className="text-[var(--back)] font-medium">{formatDayHeader(selectedCell.date)}</span>:
                    <span className="ml-2 font-bold text-[var(--out)]">
                      {formatHoursText(selectedCell.hours, selectedCell.outages)} estimated dark
                    </span>{' '}
                    ({pluralOutages(selectedCell.outages)})
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCell(null)}
                    className="text-[var(--muted)] hover:text-[var(--ink)] font-bold ml-2 px-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Empty heatmap state message */}
              {totalHeatmapOutages === 0 ? (
                <div className="py-12 border border-[var(--border)] rounded-xl text-center font-mono text-xs text-[var(--muted)]">
                  No outages recorded this week
                </div>
              ) : (
                <div className="overflow-x-auto border border-[var(--border)] rounded-xl max-h-[500px]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[var(--surface)] text-[var(--muted)] sticky top-0 z-20 backdrop-blur-md">
                      <tr>
                        <th className="py-2.5 px-3 sticky left-0 z-30 bg-[#0A0F1E] border-r border-b border-[var(--border)] min-w-[130px] font-mono font-semibold text-[11px] uppercase tracking-wider text-[var(--muted)]">
                          Area
                        </th>
                        {data.heatmap.dates.map((d) => (
                          <th
                            key={d}
                            className="py-2.5 px-2 text-center border-b border-[var(--border)] min-w-[50px] font-mono text-[10px] text-[var(--muted)] whitespace-nowrap"
                          >
                            {formatDayHeader(d)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.heatmap.rows.map((row) => (
                        <tr key={row.area} className="border-b border-[var(--border)]/40 hover:bg-[var(--surface)]/40">
                          <td
                            className="py-2 px-3 sticky left-0 z-10 bg-[#0A0F1E] border-r border-[var(--border)] font-serif text-[17px] text-[var(--ink)] truncate max-w-[140px]"
                            title={row.area}
                          >
                            {row.area}
                          </td>
                          {row.days.map((day) => (
                            <td key={day.date} className="p-1 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedCell({
                                    area: row.area,
                                    date: day.date,
                                    hours: day.hours_dark_estimated,
                                    outages: day.outages,
                                  })
                                }
                                className={`w-full h-8 rounded border transition-transform hover:scale-105 flex items-center justify-center font-mono text-[10px] cursor-pointer ${getHeatmapColor(
                                  day.hours_dark_estimated,
                                  day.outages
                                )}`}
                                title={`${row.area} (${day.date}): ${formatHoursText(day.hours_dark_estimated, day.outages)} (${pluralOutages(day.outages)})`}
                              >
                                {day.hours_dark_estimated === 0 && day.outages > 0
                                  ? '<1h'
                                  : day.hours_dark_estimated > 0
                                  ? `${day.hours_dark_estimated}h`
                                  : ''}
                              </button>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-[var(--border)] py-6 px-5 text-center font-mono text-[11px] text-[var(--faint)]">
        <p>Banange Community Outage Map · All metric figures are estimated based on public crowd reports.</p>
      </footer>
    </div>
  );
}
