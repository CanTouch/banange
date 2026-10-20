'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { LiteModeProvider } from '@/lib/liteMode';
import { TopBar } from '@/components/TopBar';
import dynamic from 'next/dynamic';

const MapView = dynamic(() => import('@/components/MapView').then((mod) => mod.MapView), {
  ssr: false,
});

import { BackPrompt } from '@/components/BackPrompt';
import { AreaSheet, AreaOutageItem, WeeklyAreaStat, UnplacedOfficialNotice } from '@/components/AreaSheet';
import { LocationPicker } from '@/components/LocationPicker';
import { CelebrationOverlay } from '@/components/CelebrationOverlay';
import { AboutModal } from '@/components/AboutModal';
import { CellOut } from '@/lib/states';
import { POLL_SECONDS } from '@/lib/constants';
import { getClientDeviceId } from '@/lib/device';
import { enqueueReport, flushOfflineQueue } from '@/lib/offlineQueue';
import { TimeSlider } from '@/components/TimeSlider';
import { useLiteMode } from '@/lib/liteMode';
import { isOutageActive } from '@/lib/duration';

function BanangeApp() {
  const { t } = useI18n();
  const { isLite } = useLiteMode();

  // State
  const [cells, setCells] = useState<Array<CellOut & { area?: string }>>([]);
  const [historicalCells, setHistoricalCells] = useState<Array<CellOut & { area?: string }> | null>(null);
  const [historyLabel, setHistoryLabel] = useState<string | null>(null);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyAreaStat[]>([]);
  const [unplacedNotices, setUnplacedNotices] = useState<UnplacedOfficialNotice[]>([]);
  const [officialPlaces, setOfficialPlaces] = useState<Array<{
    id: string;
    place_name: string;
    lat: number;
    lng: number;
    service_area: string;
    published_at: string;
    status_raw: string;
    status: 'active' | 'partial';
    is_partial: boolean;
  }>>([]);
  const [isDev, setIsDev] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [totals, setTotals] = useState<{ dark_now: number; confirmed_now: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [latestIngestAt, setLatestIngestAt] = useState<string | null>(null);
  // Feature flag: -7d to Now slider card and Play 24h (off by default)
  const [showTimeSlider] = useState<boolean>(false);

  // Time label: "SUN 18 OCT · 20:14 EAT"
  const [currentTimeLabel, setCurrentTimeLabel] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      try {
        const parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Africa/Kampala',
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).formatToParts(new Date());

        const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
        const weekday = (p.weekday || '').toUpperCase();
        const day = p.day || '';
        const month = (p.month || '').toUpperCase();
        const hour = p.hour || '00';
        const minute = p.minute || '00';
        setCurrentTimeLabel(`${weekday} ${day} ${month} · ${hour}:${minute} EAT`);
      } catch {
        setCurrentTimeLabel('EAT');
      }
    };

    updateTime();
    const timer = setInterval(updateTime, 60000);
    return () => clearInterval(timer);
  }, []);

  // Modals & Overlays
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pendingReportKind, setPendingReportKind] = useState<'out' | 'back' | null>(null);
  const [celebrationType, setCelebrationType] = useState<'out' | 'back' | null>(null);
  const [isReporting, setIsReporting] = useState(false);

  // Toast / Status Message with specific code
  const [toast, setToast] = useState<{ message: string; code?: string } | null>(null);

  // Map Navigation
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom?: number; timestamp: number } | null>(null);

  // Picker coords and Turnstile reset signal
  const [pickerInitialCoords, setPickerInitialCoords] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const [pickerInitialPrecision, setPickerInitialPrecision] = useState<'gps' | 'pin' | 'area'>('pin');
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);

  const showToast = useCallback((msg: string, code?: string) => {
    setToast({ message: msg, code });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  }, []);

  const handleTurnstileError = useCallback(
    (code: string) => {
      showToast(t('err_check_failed'), code);
    },
    [showToast, t]
  );

  // Fetch live map data
  const fetchMapData = useCallback(async () => {
    try {
      const res = await fetch('/api/map');
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to fetch map data');
      }
      const data = await res.json();
      setCells(data.cells || []);
      setWeeklyStats(data.areas || []);
      setTotals(data.totals || { dark_now: 0, confirmed_now: 0 });
      setUnplacedNotices(data.unplaced_notices || []);
      setOfficialPlaces(data.official_places || []);
      setLatestIngestAt(data.latest_ingest_at || null);
      setIsDev(Boolean(data.dev_mode));
      setIsDemo(Boolean(data.demo_mode));
      setErrorMessage(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to connect to outage database';
      setErrorMessage(msg);
    }
  }, []);

  const isHistoricalRef = useRef(false);

  // Polling & online resync
  useEffect(() => {
    fetchMapData();

    const interval = setInterval(() => {
      if (!isHistoricalRef.current) {
        fetchMapData();
      }
    }, POLL_SECONDS * 1000);

    const handleOnline = () => {
      flushOfflineQueue(() => {
        if (!isHistoricalRef.current) {
          fetchMapData();
        }
      });
    };

    window.addEventListener('online', handleOnline);
    flushOfflineQueue(() => {
      if (!isHistoricalRef.current) {
        fetchMapData();
      }
    });

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
    };
  }, [fetchMapData]);

  // Submit report API call
  const submitReport = useCallback(
    async (payload: {
      kind: 'out' | 'back';
      lat: number;
      lng: number;
      loc_precision: 'gps' | 'pin' | 'area';
      area_name?: string;
      turnstile_token?: string;
    }) => {
      setIsReporting(true);
      const deviceId = getClientDeviceId();

      const body: Record<string, unknown> = {
        ...payload,
        device_id: deviceId,
      };

      if (payload.turnstile_token) {
        body.turnstile_token = payload.turnstile_token;
      }

      try {
        const res = await fetch('/api/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          const data = await res.json();
          setIsPickerOpen(false);
          setPendingReportKind(null);

          if (payload.kind === 'out') {
            try {
              localStorage.setItem(
                'banange_last_out',
                JSON.stringify({
                  lat: data.cell_lat || payload.lat,
                  lng: data.cell_lng || payload.lng,
                  loc_precision: payload.loc_precision,
                  at: new Date().toISOString(),
                })
              );
            } catch {
              // ignore
            }
          } else {
            try {
              localStorage.removeItem('banange_last_out');
            } catch {
              // ignore
            }
          }

          setCelebrationType(payload.kind);

          setFlyTo({
            lat: data.cell_lat || payload.lat,
            lng: data.cell_lng || payload.lng,
            zoom: 13,
            timestamp: Date.now(),
          });

          fetchMapData();
        } else {
          const errData = await res.json().catch(() => ({}));
          const errType = errData.error || '';

          if (res.status === 429) {
            if (errType === 'daily_limit') {
              showToast(t('err_daily_limit'), 'DAILY_LIMIT');
            } else {
              const mins = Math.ceil((errData.retry_after_seconds || 600) / 60);
              showToast(t('err_rate', { n: mins }), 'RATE_LIMITED');
            }
          } else if (res.status === 403) {
            showToast(t('err_check_failed'), 'CHECK_FAILED');
          } else if (res.status === 422) {
            showToast(t('err_bounds'), 'OUT_OF_BOUNDS');
          } else if (res.status === 400) {
            showToast(t('err_invalid_request'), 'INVALID_REQUEST');
          } else if (res.status >= 500) {
            showToast(t('err_server_problem'), 'SERVER_PROBLEM');
          } else {
            showToast(errData.message || t('err_generic'), `ERR_${res.status}`);
          }
        }
      } catch {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        enqueueReport(body as any);
        showToast(t('offline_saved'), 'OFFLINE');
        setIsPickerOpen(false);
        setPendingReportKind(null);
      } finally {
        setIsReporting(false);
        // Reset turnstile widget signal after every report
        setTurnstileResetSignal((s) => s + 1);
      }
    },
    [fetchMapData, showToast, t]
  );

  const handleReportClick = (kind: 'out' | 'back') => {
    setPendingReportKind(kind);
    setPickerInitialPrecision('pin');
    setIsPickerOpen(true);

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPickerInitialCoords({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          setPickerInitialPrecision('gps');
        },
        () => {
          // If geolocation is denied or timed out, user can still pin/search in the sheet
        },
        {
          timeout: 8000,
          enableHighAccuracy: false,
          maximumAge: 60000,
        }
      );
    }
  };

  const handlePickerConfirm = (loc: {
    lat: number;
    lng: number;
    loc_precision: 'gps' | 'pin' | 'area';
    area_name?: string;
    turnstile_token?: string;
  }) => {
    if (!pendingReportKind) return;
    submitReport({
      kind: pendingReportKind,
      lat: loc.lat,
      lng: loc.lng,
      loc_precision: loc.loc_precision,
      area_name: loc.area_name,
      turnstile_token: loc.turnstile_token,
    });
  };

  const handleBackPromptConfirm = (saved: {
    lat: number;
    lng: number;
    loc_precision: 'gps' | 'pin' | 'area';
  }) => {
    setPendingReportKind('back');
    setPickerInitialCoords({ lat: saved.lat, lng: saved.lng });
    setPickerInitialPrecision(saved.loc_precision);
    setIsPickerOpen(true);
  };

  const displayedCells = historicalCells !== null ? historicalCells : cells;

  const darkNowList: AreaOutageItem[] = displayedCells
    .filter(
      (c) =>
        c.state === 'out' &&
        isOutageActive({
          area: c.area || 'Uganda',
          start: c.since,
          lastReport: c.last_activity,
          restoredAt: c.restored_at,
          confirmed: c.confirmed,
          devices: c.reporters,
        })
    )
    .map((c) => ({
      name: c.area || 'Uganda',
      lat: c.lat,
      lng: c.lng,
      since: c.since,
      confirmed: c.confirmed,
    }));

  const darkCount = darkNowList.length;
  // Placed official places count (unique alerts active) + unplaced notices count
  const uedclCount = new Set([
    ...officialPlaces.map((op) => op.service_area + op.published_at),
    ...unplacedNotices.map((un) => un.service_area + un.published_at),
  ]).size;

  return (
    <main className="relative w-screen h-screen overflow-hidden flex flex-col bg-[var(--bg)] text-[var(--ink)] select-none">
      {/* Top Bar */}
      <TopBar isDev={isDev} isDemo={isDemo} onOpenAbout={() => setIsAboutOpen(true)} />

      {/* 1. Status Chip floating over the map on top-left (below toggle on mobile, top-18 on desktop) */}
      <div className="absolute top-26 left-4 sm:top-18 sm:left-5 z-20 pointer-events-none select-none max-w-sm sm:max-w-md animate-fade-in">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[var(--surface)]/90 border border-[var(--border)] shadow-xl backdrop-blur-md">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              darkCount > 0 || uedclCount > 0 ? 'bg-[var(--out)] shadow-[0_0_8px_#FF4B4B]' : 'bg-emerald-400'
            }`}
          />
          <span className="font-mono text-xs font-semibold text-[var(--ink)]">
            {uedclCount === 0 && darkCount === 0
              ? 'No outages listed or reported right now'
              : `${uedclCount} UEDCL ${uedclCount === 1 ? 'notice' : 'notices'} active · ${darkCount} citizen ${
                  darkCount === 1 ? 'report' : 'reports'
                }`}
          </span>
        </div>
      </div>

      {/* Production / Database Error Banner */}
      {errorMessage && (
        <aside
          role="alert"
          aria-label="Database error notification"
          className="absolute top-20 left-4 right-4 z-40 mx-auto max-w-lg p-3 rounded-2xl bg-red-950/90 border border-red-500/80 shadow-2xl backdrop-blur-md text-red-200 text-xs font-semibold flex items-center justify-between gap-3 animate-pop-in pointer-events-auto"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping shrink-0" />
            <span className="font-mono">{errorMessage}</span>
          </div>
          <button
            onClick={() => fetchMapData()}
            className="px-2.5 py-1 rounded-lg bg-red-900 border border-red-700 text-red-100 hover:bg-red-800 text-xs font-mono shrink-0 cursor-pointer"
          >
            Retry
          </button>
        </aside>
      )}

      {/* "Is it back?" Prompt Banner */}
      <BackPrompt onConfirmBack={handleBackPromptConfirm} />

      {/* Floating Toast Notification */}
      {toast && (
        <div
          role="alert"
          className="absolute top-28 left-4 right-4 z-[60] mx-auto max-w-sm p-3.5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-2xl backdrop-blur-md text-center text-xs font-medium text-[var(--ink)] animate-pop-in flex flex-col items-center gap-1 pointer-events-auto"
        >
          <span>{toast.message}</span>
          {toast.code && (
            <span className="font-mono text-xs tracking-wider text-[var(--muted)] opacity-85 uppercase">
              [{toast.code}]
            </span>
          )}
        </div>
      )}

      {/* Map View */}
      <MapView cells={displayedCells} officialPlaces={officialPlaces} flyToLocation={flyTo} />

      {/* No outages reported overlay when in historical mode with 0 outages */}
      {historicalCells !== null && darkCount === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="px-4 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] backdrop-blur-md font-mono text-xs text-[var(--muted)] shadow-xl">
            No outages reported at this time
          </div>
        </div>
      )}

      {/* Bottom Area: History Scrubber (feature-flagged) + Bottom Sheet */}
      <div className="absolute bottom-0 left-0 right-0 z-30 flex flex-col items-center pointer-events-none pb-safe">
        {/* Phase 2: History Scrubber / Time Slider (Hidden behind feature flag, off by default) */}
        {showTimeSlider && (
          <div className="w-full max-w-lg px-3 mb-2 pointer-events-auto">
            <TimeSlider
              isLite={isLite}
              latestIngestTime={latestIngestAt}
              onHistoricalChange={(hCells, isLiveNow, label) => {
                if (isLiveNow) {
                  isHistoricalRef.current = false;
                  setHistoricalCells(null);
                  setHistoryLabel(null);
                  fetchMapData();
                } else {
                  isHistoricalRef.current = true;
                  setHistoricalCells(hCells);
                  setHistoryLabel(label || null);
                }
              }}
            />
          </div>
        )}

        {/* 6. Bottom Sheet (includes side-by-side buttons, dark now list, and footer) */}
        <AreaSheet
          darkNowList={darkNowList}
          weeklyList={weeklyStats}
          unplacedNotices={unplacedNotices}
          onSelectArea={(lat, lng) => {
            setFlyTo({ lat, lng, zoom: 13, timestamp: Date.now() });
          }}
          onReport={handleReportClick}
          isReporting={isReporting}
        />
      </div>

      {/* Location Picker Sheet */}
      <LocationPicker
        isOpen={isPickerOpen}
        kind={pendingReportKind}
        initialCoords={pickerInitialCoords}
        initialPrecision={pickerInitialPrecision}
        isSubmitting={isReporting}
        resetSignal={turnstileResetSignal}
        onTurnstileError={handleTurnstileError}
        onClose={() => {
          setIsPickerOpen(false);
          setPendingReportKind(null);
        }}
        onConfirm={handlePickerConfirm}
      />

      {/* Celebration Feedback Overlay */}
      <CelebrationOverlay
        type={celebrationType}
        onDismiss={() => setCelebrationType(null)}
      />

      {/* About Modal */}
      <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
    </main>
  );
}

export default function Home() {
  return (
    <LiteModeProvider>
      <I18nProvider>
        <BanangeApp />
      </I18nProvider>
    </LiteModeProvider>
  );
}
