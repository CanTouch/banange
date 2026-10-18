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
import { AreaSheet, AreaOutageItem, WeeklyAreaStat } from '@/components/AreaSheet';
import { LocationPicker } from '@/components/LocationPicker';
import { CelebrationOverlay } from '@/components/CelebrationOverlay';
import { AboutModal } from '@/components/AboutModal';
import { CellOut } from '@/lib/states';
import { POLL_SECONDS } from '@/lib/constants';
import { getClientDeviceId } from '@/lib/device';
import { enqueueReport, flushOfflineQueue } from '@/lib/offlineQueue';
import { TimeSlider } from '@/components/TimeSlider';
import { useLiteMode } from '@/lib/liteMode';

function BanangeApp() {
  const { t } = useI18n();
  const { isLite } = useLiteMode();

  // State
  const [cells, setCells] = useState<Array<CellOut & { area?: string }>>([]);
  const [historicalCells, setHistoricalCells] = useState<Array<CellOut & { area?: string }> | null>(null);
  const [historyLabel, setHistoryLabel] = useState<string | null>(null);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyAreaStat[]>([]);
  const [isDev, setIsDev] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [totals, setTotals] = useState<{ dark_now: number; confirmed_now: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  // Toast / Status Message
  const [toast, setToast] = useState<string | null>(null);

  // Map Navigation
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom?: number; timestamp: number } | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast(null);
    }, 4000);
  }, []);

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
    }) => {
      setIsReporting(true);
      const deviceId = getClientDeviceId();

      const body = {
        ...payload,
        device_id: deviceId,
      };

      try {
        const res = await fetch('/api/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          const data = await res.json();
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
        } else if (res.status === 429) {
          const errData = await res.json().catch(() => ({}));
          const mins = Math.ceil((errData.retry_after_seconds || 600) / 60);
          showToast(t('err_rate', { n: mins }));
        } else if (res.status === 422) {
          showToast(t('err_bounds'));
        } else {
          showToast(t('err_generic'));
        }
      } catch {
        enqueueReport(body);
        showToast(t('offline_saved'));
      } finally {
        setIsReporting(false);
      }
    },
    [fetchMapData, showToast, t]
  );

  const handleReportClick = (kind: 'out' | 'back') => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setPendingReportKind(kind);
      setIsPickerOpen(true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        submitReport({
          kind,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          loc_precision: 'gps',
        });
      },
      () => {
        setPendingReportKind(kind);
        setIsPickerOpen(true);
      },
      {
        timeout: 8000,
        enableHighAccuracy: false,
        maximumAge: 60000,
      }
    );
  };

  const handlePickerConfirm = (loc: {
    lat: number;
    lng: number;
    loc_precision: 'pin' | 'area';
    area_name?: string;
  }) => {
    if (!pendingReportKind) return;
    setIsPickerOpen(false);
    submitReport({
      kind: pendingReportKind,
      lat: loc.lat,
      lng: loc.lng,
      loc_precision: loc.loc_precision,
      area_name: loc.area_name,
    });
    setPendingReportKind(null);
  };

  const handleBackPromptConfirm = (saved: {
    lat: number;
    lng: number;
    loc_precision: 'gps' | 'pin' | 'area';
  }) => {
    submitReport({
      kind: 'back',
      lat: saved.lat,
      lng: saved.lng,
      loc_precision: saved.loc_precision,
    });
  };

  const displayedCells = historicalCells !== null ? historicalCells : cells;

  const darkNowList: AreaOutageItem[] = displayedCells
    .filter((c) => c.state === 'out')
    .map((c) => ({
      name: c.area || 'Uganda',
      lat: c.lat,
      lng: c.lng,
      since: c.since,
      confirmed: c.confirmed,
    }));

  const darkCount = darkNowList.length;

  return (
    <main className="relative w-screen h-screen overflow-hidden flex flex-col bg-[var(--bg)] text-[var(--ink)] select-none">
      {/* Top Bar */}
      <TopBar isDev={isDev} isDemo={isDemo} onOpenAbout={() => setIsAboutOpen(true)} />

      {/* 4. Status Line & 5. Headline floating on top-left over map */}
      <div className="absolute top-16 left-5 z-20 pointer-events-none select-none max-w-xs sm:max-w-md animate-fade-in">
        {/* Status Line: IBM Plex Mono 10px uppercase tracking-[0.14em] text-[var(--muted)] */}
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] mb-1">
          {historyLabel ? historyLabel.toUpperCase() : currentTimeLabel || 'KAMPALA · EAT'}
        </p>

        {/* Headline: Instrument Serif 54px line-height 0.96 */}
        <div className="font-serif text-[42px] sm:text-[54px] leading-[0.96] text-[var(--ink)] tracking-tight">
          {darkCount > 0 ? (
            <>
              <div>
                {darkCount} {darkCount === 1 ? 'area' : 'areas'}
              </div>
              <div className="italic text-[var(--muted)]">in the dark</div>
            </>
          ) : (
            <>
              <div>All lit</div>
              <div className="italic text-[var(--muted)]">up tonight</div>
            </>
          )}
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
            className="px-2.5 py-1 rounded-lg bg-red-900 border border-red-700 text-red-100 hover:bg-red-800 text-[11px] font-mono shrink-0 cursor-pointer"
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
          className="absolute top-28 left-4 right-4 z-50 mx-auto max-w-sm p-3.5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-2xl backdrop-blur-md text-center text-xs font-medium text-[var(--ink)] animate-pop-in"
        >
          {toast}
        </div>
      )}

      {/* Map View */}
      <MapView cells={displayedCells} flyToLocation={flyTo} />

      {/* No outages reported overlay when in historical mode with 0 outages */}
      {historicalCells !== null && darkCount === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="px-4 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] backdrop-blur-md font-mono text-xs text-[var(--muted)] shadow-xl">
            No outages reported at this time
          </div>
        </div>
      )}

      {/* Bottom Area: History Scrubber + Bottom Sheet */}
      <div className="absolute bottom-0 left-0 right-0 z-30 flex flex-col items-center pointer-events-none pb-safe">
        {/* Phase 2: History Scrubber / Time Slider */}
        <div className="w-full max-w-lg px-3 mb-2 pointer-events-auto">
          <TimeSlider
            isLite={isLite}
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

        {/* 6. Bottom Sheet (includes side-by-side buttons, dark now list, and footer) */}
        <AreaSheet
          darkNowList={darkNowList}
          weeklyList={weeklyStats}
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
