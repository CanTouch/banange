'use client';

import React, { useState, useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { useI18n } from '@/lib/i18n';
import { UGANDA_CENTER } from '@/lib/constants';
import { fetchBaseStyle, transformStyle } from '@/lib/mapStyle';

interface LocationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (location: {
    lat: number;
    lng: number;
    loc_precision: 'pin' | 'area';
    area_name?: string;
  }) => void;
  initialCoords?: { lat: number; lng: number };
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
}: LocationPickerProps) {
  const { t } = useI18n();
  const [coords, setCoords] = useState(initialCoords);
  const [precision, setPrecision] = useState<'pin' | 'area'>('pin');
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
      const styled = transformStyle(base, currentTheme);

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

  const handleConfirm = () => {
    onConfirm({
      lat: coords.lat,
      lng: coords.lng,
      loc_precision: precision,
      area_name: selectedArea || undefined,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Location picker"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-pop-in"
    >
      <div className="relative w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl flex flex-col max-h-[90vh]">
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
            className="p-1.5 rounded-xl text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
            aria-label={t('close')}
          >
            ✕
          </button>
        </div>

        {/* Autocomplete Input */}
        <div className="relative mt-4">
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
                    className="w-full text-left px-3.5 py-2.5 text-sm text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors flex items-center justify-between"
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
        <div className="relative mt-4 w-full h-56 sm:h-64 rounded-2xl overflow-hidden border border-[var(--border)]">
          <div ref={mapContainerRef} className="w-full h-full" />
          <div className="absolute bottom-2 left-2 right-2 px-2.5 py-1 rounded-lg bg-[var(--surface)]/90 backdrop-blur-sm border border-[var(--border)] text-[11px] text-[var(--muted)] text-center pointer-events-none">
            Drag pin or tap map to adjust
          </div>
        </div>

        {/* Actions */}
        <div className="mt-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-12 rounded-xl border border-[var(--border)] text-[var(--muted)] font-semibold text-sm hover:bg-[var(--surface-2)] transition-colors"
          >
            {t('close')}
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 h-12 rounded-xl bg-[var(--out)] text-[var(--btn-text)] font-semibold text-sm shadow-[0_0_15px_var(--out-glow)] hover:brightness-105 active:scale-[0.98] transition-all"
          >
            {t('loc_confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
