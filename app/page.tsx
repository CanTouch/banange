'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { LiteModeProvider } from '@/lib/liteMode';
import { TopBar } from '@/components/TopBar';
import dynamic from 'next/dynamic';

const MapView = dynamic(() => import('@/components/MapView').then((mod) => mod.MapView), {
  ssr: false,
});
import { ReportButtons } from '@/components/ReportButtons';
import { BackPrompt } from '@/components/BackPrompt';
import { AreaSheet, AreaOutageItem, WeeklyAreaStat } from '@/components/AreaSheet';
import { LocationPicker } from '@/components/LocationPicker';
import { CelebrationOverlay } from '@/components/CelebrationOverlay';
import { AboutModal } from '@/components/AboutModal';
import { CellOut } from '@/lib/states';
import { POLL_SECONDS } from '@/lib/constants';
import { getClientDeviceId } from '@/lib/device';
import { enqueueReport, flushOfflineQueue } from '@/lib/offlineQueue';

function BanangeApp() {
  const { t } = useI18n();

  // State
  const [cells, setCells] = useState<Array<CellOut & { area?: string }>>([]);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyAreaStat[]>([]);
  const [isDev, setIsDev] = useState(false);
  const [totals, setTotals] = useState<{ dark_now: number; confirmed_now: number } | null>(null);
  const [apiFailed, setApiFailed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      setErrorMessage(null);
      setApiFailed(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to connect to outage database';
      setApiFailed(true);
      setErrorMessage(msg);
    }
  }, []);

  // Polling & online resync
  useEffect(() => {
    fetchMapData();

    const interval = setInterval(() => {
      fetchMapData();
    }, POLL_SECONDS * 1000);

    const handleOnline = () => {
      flushOfflineQueue(() => {
        fetchMapData();
      });
    };

    window.addEventListener('online', handleOnline);
    // Try flush on startup
    flushOfflineQueue(() => {
      fetchMapData();
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
          // Save or clear last out record
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

          // Trigger celebration
          setCelebrationType(payload.kind);

          // Fly map to reported location
          setFlyTo({
            lat: data.cell_lat || payload.lat,
            lng: data.cell_lng || payload.lng,
            zoom: 13,
            timestamp: Date.now(),
          });

          // Re-fetch map data
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
        // Network failure -> queue offline
        enqueueReport(body);
        showToast(t('offline_saved'));
      } finally {
        setIsReporting(false);
      }
    },
    [fetchMapData, showToast, t]
  );

  // Initiates report action from dock button
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
        // Denied, timeout or unavailable -> fallback to LocationPicker
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

  // Confirm location from LocationPicker
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

  // Confirm back from top prompt banner
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

  // Areas dark now for AreaSheet
  const darkNowList: AreaOutageItem[] = cells
    .filter((c) => c.state === 'out')
    .map((c) => ({
      name: c.area || 'Uganda',
      lat: c.lat,
      lng: c.lng,
      since: c.since,
      confirmed: c.confirmed,
    }));

  return (
    <main className="relative w-screen h-screen overflow-hidden flex flex-col bg-[var(--bg)] text-[var(--text)] select-none">
      {/* Top Bar */}
      <TopBar isDev={isDev} onOpenAbout={() => setIsAboutOpen(true)} />

      {/* Production / Database Error Banner */}
      {errorMessage && (
        <aside
          role="alert"
          aria-label="Database error notification"
          className="absolute top-16 left-4 right-4 z-40 mx-auto max-w-lg p-3.5 rounded-2xl bg-red-950/90 border border-red-500/80 shadow-2xl backdrop-blur-md text-red-200 text-xs font-semibold flex items-center justify-between gap-3 animate-pop-in pointer-events-auto"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => fetchMapData()}
            className="px-2.5 py-1 rounded-lg bg-red-900 border border-red-700 text-red-100 hover:bg-red-800 text-[11px] font-bold shrink-0 cursor-pointer"
          >
            Retry
          </button>
        </aside>
      )}

      {/* Stats Chip under Top Bar */}
      {!apiFailed && totals !== null && (
        <div className="absolute top-16 left-0 right-0 z-20 flex justify-center pointer-events-none px-4">
          <div className="px-3.5 py-1.5 rounded-full bg-[var(--surface)]/90 backdrop-blur-md border border-[var(--border)] shadow-md text-xs font-semibold flex items-center gap-2 pointer-events-auto">
            {totals.dark_now > 0 ? (
              <>
                <span className="w-2 h-2 rounded-full bg-[var(--out)] animate-pulse" />
                <span className="text-[var(--text)]">
                  {t('stats_dark_now', { n: totals.dark_now })}
                </span>
              </>
            ) : (
              <span className="text-[var(--muted)]">{t('stats_none')}</span>
            )}
          </div>
        </div>
      )}

      {/* "Is it back?" Prompt Banner */}
      <BackPrompt onConfirmBack={handleBackPromptConfirm} />

      {/* Floating Toast Notification */}
      {toast && (
        <div
          role="alert"
          className="absolute top-28 left-4 right-4 z-50 mx-auto max-w-sm p-3.5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-2xl backdrop-blur-md text-center text-xs font-medium text-[var(--text)] animate-pop-in"
        >
          {toast}
        </div>
      )}

      {/* Map View */}
      <MapView cells={cells} flyToLocation={flyTo} />

      {/* Bottom Area: Area Sheet & Report Buttons Dock */}
      <div className="absolute bottom-0 left-0 right-0 z-30 flex flex-col items-center pointer-events-none pb-safe">
        <AreaSheet
          darkNowList={darkNowList}
          weeklyList={weeklyStats}
          onSelectArea={(lat, lng) => {
            setFlyTo({ lat, lng, zoom: 13, timestamp: Date.now() });
          }}
        />
        <ReportButtons onReport={handleReportClick} isLoading={isReporting} />
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
