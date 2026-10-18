'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import { useI18n } from '@/lib/i18n';
import { UGANDA_CENTER } from '@/lib/constants';
import { fetchBaseStyle, transformStyle } from '@/lib/mapStyle';
import { createTurnstileCallbacks } from '@/lib/turnstileClient';

interface LocationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (location: {
    lat: number;
    lng: number;
    loc_precision: 'gps' | 'pin' | 'area';
    area_name?: string;
    turnstile_token?: string;
  }) => void;
  initialCoords?: { lat: number; lng: number };
  initialPrecision?: 'gps' | 'pin' | 'area';
  kind?: 'out' | 'back' | null;
  isSubmitting?: boolean;
  resetSignal?: number;
  onTurnstileError?: (code: string) => void;
}

interface AreaResult {
  name: string;
  lat: number;
  lng: number;
}

export function LocationPicker({
  isOpen,
  onClose,
  onConfirm,
  initialCoords = UGANDA_CENTER,
  initialPrecision = 'pin',
  kind = 'out',
  isSubmitting = false,
  resetSignal = 0,
  onTurnstileError,
}: LocationPickerProps) {
  const { t } = useI18n();
  const [coords, setCoords] = useState(initialCoords);
  const [precision, setPrecision] = useState<'gps' | 'pin' | 'area'>(initialPrecision);
  const [selectedArea, setSelectedArea] = useState<string>('');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AreaResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  // Search autocomplete
  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/areas?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.results || []);
        }
      } catch {
        // ignore
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Init mini map when open
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    let isSubscribed = true;

    async function initMap() {
      if (mapRef.current) return;

      // Ensure worker URL is set to CSP worker in public directory
      if (typeof maplibregl.setWorkerUrl === 'function') {
        maplibregl.setWorkerUrl('/maplibre-gl-csp-worker.js');
      } else if ('workerUrl' in (maplibregl as Record<string, unknown>)) {
        (maplibregl as Record<string, unknown>).workerUrl = '/maplibre-gl-csp-worker.js';
      }

      const base = await fetchBaseStyle();
      if (!isSubscribed || !mapContainerRef.current) return;

      const currentTheme = (document.documentElement.getAttribute('data-theme') || 'dark') as 'dark' | 'light';
      const styled = transformStyle(base, currentTheme, { isPicker: true });

      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: styled,
        center: [coords.lng, coords.lat],
        zoom: 12,
        maxZoom: 16,
        minZoom: 6,
      });

      const markerEl = document.createElement('div');
      markerEl.className = 'w-6 h-6 rounded-full bg-[var(--out)] border-2 border-white shadow-lg cursor-grab active:cursor-grabbing flex items-center justify-center';
      markerEl.innerHTML = '<div class="w-2 h-2 rounded-full bg-white"></div>';

      const marker = new maplibregl.Marker({
        element: markerEl,
        draggable: true,
      })
        .setLngLat([coords.lng, coords.lat])
        .addTo(map);

      marker.on('dragend', () => {
        const lngLat = marker.getLngLat();
        setCoords({ lat: lngLat.lat, lng: lngLat.lng });
        setPrecision('pin');
        setSelectedArea('');
      });

      map.on('click', (e) => {
        marker.setLngLat(e.lngLat);
        setCoords({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        setPrecision('pin');
        setSelectedArea('');
      });

      mapRef.current = map;
      markerRef.current = marker;
    }

    initMap();

    return () => {
      isSubscribed = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, [isOpen]);

  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  // Token stored in one place: both ref (synchronous immediate access) and state (triggers re-render)
  const tokenRef = useRef<string | null>(null);
  const [turnstileToken, setTurnstileTokenState] = useState<string | null>(null);

  const siteKey = typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY : undefined;
  const isTurnstileConfigured = Boolean(siteKey);

  // 8-second fallback timeout
  const [isTimedOut, setIsTimedOut] = useState(false);
  const timeoutTimerRef = useRef<NodeJS.Timeout | null>(null);

  const setToken = useCallback((tok: string | null) => {
    tokenRef.current = tok;
    setTurnstileTokenState(tok);
    if (tok) {
      setIsTimedOut(false);
      if (timeoutTimerRef.current) {
        clearTimeout(timeoutTimerRef.current);
      }
    }
  }, []);

  const resetTurnstile = useCallback(() => {
    setToken(null);
    setIsTimedOut(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = typeof window !== 'undefined' ? (window as any) : null;
    if (win?.turnstile && widgetIdRef.current) {
      try {
        win.turnstile.reset(widgetIdRef.current);
      } catch (err) {
        console.error('Turnstile reset error:', err);
      }
    }
  }, [setToken]);

  // Keep onTurnstileError callback in a ref to prevent effect re-runs on parent re-renders
  const onTurnstileErrorRef = useRef(onTurnstileError);
  useEffect(() => {
    onTurnstileErrorRef.current = onTurnstileError;
  }, [onTurnstileError]);

  // Sync coords and precision when isOpen or initialCoords changes
  useEffect(() => {
    if (isOpen) {
      setCoords(initialCoords);
      setPrecision(initialPrecision);
      setSelectedArea('');
      setQuery('');
      setSuggestions([]);
      if (markerRef.current) {
        markerRef.current.setLngLat([initialCoords.lng, initialCoords.lat]);
      }
      if (mapRef.current) {
        mapRef.current.setCenter([initialCoords.lng, initialCoords.lat]);
      }
    }
  }, [isOpen, initialCoords, initialPrecision]);

  // Reset widget ONLY when resetSignal fires after a report was sent, NEVER on mount or on success
  const prevResetSignalRef = useRef(resetSignal);
  useEffect(() => {
    if (resetSignal > 0 && resetSignal !== prevResetSignalRef.current) {
      prevResetSignalRef.current = resetSignal;
      resetTurnstile();
    }
  }, [resetSignal, resetTurnstile]);

  // Start 8-second fallback timer when open
  const startTimeoutTimer = useCallback(() => {
    if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
    setIsTimedOut(false);
    if (!isTurnstileConfigured) return;

    timeoutTimerRef.current = setTimeout(() => {
      if (!tokenRef.current) {
        setIsTimedOut(true);
      }
    }, 8000);
  }, [isTurnstileConfigured]);

  useEffect(() => {
    if (isOpen) {
      startTimeoutTimer();
    } else {
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      setIsTimedOut(false);
    }
    return () => {
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
    };
  }, [isOpen, startTimeoutTimer]);

  const handleRetry = useCallback(() => {
    resetTurnstile();
    startTimeoutTimer();
  }, [resetTurnstile, startTimeoutTimer]);

  // Clean up widget when sheet closes
  useEffect(() => {
    if (!isOpen) {
      setToken(null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = typeof window !== 'undefined' ? (window as any) : null;
      if (win?.turnstile && widgetIdRef.current) {
        try {
          win.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
        widgetIdRef.current = null;
      }
    }
  }, [isOpen, setToken]);

  // Turnstile widget lifecycle (only runs when isOpen / siteKey changes, NOT on error handler or coords changes)
  useEffect(() => {
    if (!isOpen || !isTurnstileConfigured || !siteKey || typeof window === 'undefined') {
      return;
    }

    let isMounted = true;

    const renderWidget = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = window as any;
      if (!isMounted || !win.turnstile || !turnstileContainerRef.current) return;

      // Do NOT destroy and recreate if already rendered for this open session
      if (widgetIdRef.current) {
        return;
      }

      try {
        const currentTheme = (document.documentElement.getAttribute('data-theme') || 'dark') as 'dark' | 'light';
        const callbacks = createTurnstileCallbacks({
          setToken: (tok) => {
            if (isMounted) setToken(tok);
          },
          onToastError: (code) => {
            if (isMounted) onTurnstileErrorRef.current?.(code);
          },
          resetWidget: () => {
            resetTurnstile();
          },
        });

        const id = win.turnstile.render(turnstileContainerRef.current, {
          sitekey: siteKey,
          theme: currentTheme === 'light' ? 'light' : 'dark',
          size: 'normal',
          ...callbacks,
        });
        widgetIdRef.current = id;
      } catch (err) {
        console.error('Failed to render Turnstile widget:', err);
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).turnstile) {
      renderWidget();
    } else {
      const existingScript = document.querySelector('script[src*="turnstile/v0/api.js"]');
      if (!existingScript) {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.onload = () => {
          if (isMounted) renderWidget();
        };
        document.head.appendChild(script);
      } else {
        const interval = setInterval(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((window as any).turnstile) {
            clearInterval(interval);
            if (isMounted) renderWidget();
          }
        }, 100);
        return () => {
          clearInterval(interval);
          isMounted = false;
        };
      }
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen, isTurnstileConfigured, siteKey, setToken, resetTurnstile]);

  if (!isOpen) return null;

  const handleSelectArea = (area: AreaResult) => {
    setCoords({ lat: area.lat, lng: area.lng });
    setPrecision('area');
    setSelectedArea(area.name);
    setQuery(area.name);
    setSuggestions([]);

    if (mapRef.current && markerRef.current) {
      markerRef.current.setLngLat([area.lng, area.lat]);
      mapRef.current.flyTo({ center: [area.lng, area.lat], zoom: 13, essential: true });
    }
  };

  const hasToken = Boolean(tokenRef.current || turnstileToken);
  const isChecking = isTurnstileConfigured && !hasToken;
  const isSendDisabled = isSubmitting || (isChecking && !isTimedOut);

  const handleActionClick = () => {
    if (isTimedOut && !hasToken) {
      handleRetry();
      return;
    }
    if (isSendDisabled) return;
    onConfirm({
      lat: coords.lat,
      lng: coords.lng,
      loc_precision: precision,
      area_name: selectedArea || undefined,
      turnstile_token: tokenRef.current || turnstileToken || undefined,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Location picker"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-pop-in"
    >
      <div className="relative w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-t-3xl sm:rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
          <div className="flex flex-col">
            <h2 className="text-lg font-bold font-heading text-[var(--text)]">
              {t('loc_confirm')}
            </h2>
            <p className="text-xs text-[var(--muted)]">{t('loc_helper')}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
            aria-label={t('close')}
          >
            ✕
          </button>
        </div>

        {/* Autocomplete Input */}
        <div className="relative mt-4 shrink-0">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('loc_type_area')}
            className="w-full h-11 px-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] placeholder-[var(--muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus)] transition-all"
          />
          {isSearching && (
            <span className="absolute right-3 top-3 text-xs text-[var(--muted)] animate-pulse">
              ...
            </span>
          )}

          {suggestions.length > 0 && (
            <ul
              role="listbox"
              className="absolute left-0 right-0 top-12 z-20 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl overflow-hidden"
            >
              {suggestions.map((item, idx) => (
                <li key={idx}>
                  <button
                    type="button"
                    onClick={() => handleSelectArea(item)}
                    className="w-full text-left px-3.5 py-2.5 text-sm text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <span className="font-medium">{item.name}</span>
                    <span className="text-[11px] text-[var(--muted)]">Select</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Interactive mini map */}
        <div className="relative mt-4 w-full h-44 sm:h-56 rounded-2xl overflow-hidden border border-[var(--border)] shrink-0">
          <div ref={mapContainerRef} className="w-full h-full" />
          <div className="absolute bottom-2 left-2 right-2 px-2.5 py-1 rounded-lg bg-[var(--surface)]/90 backdrop-blur-sm border border-[var(--border)] text-[11px] text-[var(--muted)] text-center pointer-events-none">
            Drag pin or tap map to adjust
          </div>
        </div>

        {/* Turnstile verification widget (visible inside confirm-location sheet, above Send button) */}
        {isTurnstileConfigured && (
          <div className="w-full flex flex-col items-center justify-center my-3 min-h-[65px] shrink-0">
            <div
              ref={turnstileContainerRef}
              id="turnstile-widget"
              className="flex justify-center items-center min-h-[65px] w-full max-w-[320px] overflow-hidden"
            />
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-xl border border-[var(--border)] text-[var(--muted)] font-semibold text-sm hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
          >
            {t('close')}
          </button>
          <button
            type="button"
            onClick={handleActionClick}
            disabled={isSubmitting || (isChecking && !isTimedOut)}
            className={`flex-1 h-12 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
              isSubmitting || (isChecking && !isTimedOut)
                ? 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed opacity-60'
                : isTimedOut && !hasToken
                ? 'bg-amber-600/30 text-amber-200 border border-amber-500/50 hover:bg-amber-600/40 cursor-pointer active:scale-[0.98]'
                : kind === 'back'
                ? 'bg-[var(--back)] text-white shadow-[0_0_15px_rgba(255,176,32,0.35)] hover:brightness-105 active:scale-[0.98] cursor-pointer'
                : 'bg-[var(--out)] text-white shadow-[0_0_15px_rgba(255,75,75,0.35)] hover:brightness-105 active:scale-[0.98] cursor-pointer'
            }`}
          >
            {isSubmitting ? (
              <span>Sending…</span>
            ) : hasToken || !isTurnstileConfigured ? (
              <span>{t('btn_send') || 'Send'}</span>
            ) : isTimedOut ? (
              <span className="flex items-center gap-1.5">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                >
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                <span>{t('btn_retry') || 'Tap to retry'}</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-ping shrink-0" />
                <span>{t('btn_checking') || 'Checking…'}</span>
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
