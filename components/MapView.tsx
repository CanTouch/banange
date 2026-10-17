'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import { DEFAULT_ZOOM, UGANDA_BOUNDS, UGANDA_CENTER } from '@/lib/constants';
import { fetchBaseStyle, transformStyle } from '@/lib/mapStyle';
import { CellOut } from '@/lib/states';
import { useLiteMode } from '@/lib/liteMode';
import { useI18n } from '@/lib/i18n';

interface MapViewProps {
  cells: Array<CellOut & { area?: string }>;
  onDotClick?: (cell: CellOut & { area?: string }) => void;
  flyToLocation?: { lat: number; lng: number; zoom?: number; timestamp?: number } | null;
}

export function MapView({ cells, flyToLocation }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const pulseAnimRef = useRef<number | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const { isLite } = useLiteMode();
  const { t } = useI18n();

  const isLiteRef = useRef(isLite);
  useEffect(() => {
    isLiteRef.current = isLite;
  }, [isLite]);

  const formatEAT = (isoStr?: string) => {
    if (!isoStr) return '';
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Kampala',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(isoStr));
    } catch {
      return '';
    }
  };

  const formatDuration = (sinceIso: string) => {
    const diffMs = Date.now() - new Date(sinceIso).getTime();
    const hours = Math.floor(diffMs / (3600 * 1000));
    const mins = Math.floor((diffMs % (3600 * 1000)) / (60 * 1000));
    if (hours > 0) {
      return `${hours} h ${mins} m`;
    }
    return `${Math.max(1, mins)} m`;
  };

  const getGeoJSON = useCallback(() => {
    return {
      type: 'FeatureCollection' as const,
      features: cells.map((c) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [c.lng, c.lat],
        },
        properties: {
          cell_id: c.cell_id,
          state: c.state,
          confirmed: c.confirmed,
          approximate: c.approximate,
          since: c.since,
          last_activity: c.last_activity,
          restored_at: c.restored_at || '',
          fade: c.fade ?? 1,
          reporters: c.reporters,
          area: c.area || '',
        },
      })),
    };
  }, [cells]);

  const addDataLayers = useCallback((map: maplibregl.Map) => {
    if (!map.getSource('cells-source')) {
      map.addSource('cells-source', {
        type: 'geojson',
        data: getGeoJSON(),
      });
    }

    const lite = isLiteRef.current;

    // 1. Confirmed Out - Halo
    if (!lite && !map.getLayer('out-confirmed-halo')) {
      map.addLayer({
        id: 'out-confirmed-halo',
        type: 'circle',
        source: 'cells-source',
        filter: ['all', ['==', ['get', 'state'], 'out'], ['==', ['get', 'confirmed'], true]],
        paint: {
          'circle-radius': 22,
          'circle-color': '#FF4D4D',
          'circle-opacity': 0.35,
          'circle-blur': 0.8,
        },
      });
    }

    // 2. Confirmed Out - Inner Circle
    if (!map.getLayer('out-confirmed-inner')) {
      map.addLayer({
        id: 'out-confirmed-inner',
        type: 'circle',
        source: 'cells-source',
        filter: ['all', ['==', ['get', 'state'], 'out'], ['==', ['get', 'confirmed'], true]],
        paint: {
          'circle-radius': 7,
          'circle-color': '#FF4D4D',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#FFFFFF',
        },
      });
    }

    // 3. Unconfirmed Out - Inner Circle
    if (!map.getLayer('out-unconfirmed-inner')) {
      map.addLayer({
        id: 'out-unconfirmed-inner',
        type: 'circle',
        source: 'cells-source',
        filter: ['all', ['==', ['get', 'state'], 'out'], ['==', ['get', 'confirmed'], false]],
        paint: {
          'circle-radius': 6,
          'circle-color': '#FF4D4D',
          'circle-opacity': 0.6,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#FF4D4D',
          'circle-stroke-opacity': 0.8,
        },
      });
    }

    // 4. Restored - Halo
    if (!lite && !map.getLayer('restored-halo')) {
      map.addLayer({
        id: 'restored-halo',
        type: 'circle',
        source: 'cells-source',
        filter: ['==', ['get', 'state'], 'restored'],
        paint: {
          'circle-radius': 16,
          'circle-color': '#FFB020',
          'circle-opacity': ['*', 0.35, ['get', 'fade']],
          'circle-blur': 0.7,
        },
      });
    }

    // 5. Restored - Inner Circle
    if (!map.getLayer('restored-inner')) {
      map.addLayer({
        id: 'restored-inner',
        type: 'circle',
        source: 'cells-source',
        filter: ['==', ['get', 'state'], 'restored'],
        paint: {
          'circle-radius': 6,
          'circle-color': '#FFB020',
          'circle-opacity': ['get', 'fade'],
          'circle-stroke-width': 1,
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-opacity': ['get', 'fade'],
        },
      });
    }
  }, [getGeoJSON]);

  // Update source data when cells change
  useEffect(() => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource('cells-source') as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(getGeoJSON());
    }
  }, [cells, getGeoJSON]);

  // FlyTo effect
  useEffect(() => {
    if (!mapRef.current || !flyToLocation) return;
    mapRef.current.flyTo({
      center: [flyToLocation.lng, flyToLocation.lat],
      zoom: flyToLocation.zoom || 13,
      duration: 800,
      essential: true,
    });
  }, [flyToLocation]);

  // Init Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    let isSubscribed = true;

    async function init() {
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

      const maxBounds: [number, number, number, number] = [
        UGANDA_BOUNDS.lngMin - 1.0,
        UGANDA_BOUNDS.latMin - 1.0,
        UGANDA_BOUNDS.lngMax + 1.0,
        UGANDA_BOUNDS.latMax + 1.0,
      ];

      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: styled,
        center: [UGANDA_CENTER.lng, UGANDA_CENTER.lat],
        zoom: DEFAULT_ZOOM,
        minZoom: 5,
        maxZoom: 16,
        maxBounds,
        cooperativeGestures: false,
        attributionControl: false,
      });

      // Attribution bottom-left
      map.addControl(
        new maplibregl.AttributionControl({
          compact: true,
          customAttribution: '© OpenStreetMap contributors · OpenFreeMap',
        }),
        'bottom-left'
      );

      map.on('load', () => {
        addDataLayers(map);
      });

      // Dot click handler
      const interactiveLayers = ['out-confirmed-inner', 'out-unconfirmed-inner', 'restored-inner'];

      interactiveLayers.forEach((layerId) => {
        map.on('click', layerId, (e) => {
          const feature = e.features?.[0];
          if (!feature) return;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const props = feature.properties as any;
          const coordinates = (feature.geometry as GeoJSON.Point).coordinates.slice() as [number, number];

          const isOut = props.state === 'out';
          const timeEat = isOut ? formatEAT(props.since) : formatEAT(props.restored_at);
          const timeText = isOut
            ? `Out since ${timeEat} (${formatDuration(props.since)})`
            : `Power back at ${timeEat}`;

          const confirmedTag = props.confirmed
            ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-[#FF4D4D]/20 text-[#FF4D4D] border border-[#FF4D4D]/40">Confirmed</span>`
            : `<span class="px-2 py-0.5 rounded text-[10px] font-medium bg-[#8A94AD]/20 text-[#8A94AD] border border-[#8A94AD]/40">Unconfirmed</span>`;

          const approxTag = props.approximate
            ? `<span class="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-400 border border-amber-500/40">Approximate location</span>`
            : '';

          const html = `
            <div class="flex flex-col gap-1.5 min-w-[180px] text-left">
              <h4 class="font-bold text-sm text-[var(--text)]">${props.area || 'Uganda'}</h4>
              <p class="text-xs text-[var(--muted)] font-medium">${timeText}</p>
              <div class="flex flex-wrap gap-1 mt-1">
                ${confirmedTag}
                ${approxTag}
              </div>
              <p class="text-[11px] text-[var(--muted)] mt-1 border-t border-[var(--border)] pt-1">
                ${props.reporters || 1} people reported
              </p>
            </div>
          `;

          if (popupRef.current) {
            popupRef.current.remove();
          }

          popupRef.current = new maplibregl.Popup({ offset: 12 })
            .setLngLat(coordinates)
            .setHTML(html)
            .addTo(map);
        });

        map.on('mouseenter', layerId, () => {
          map.getCanvas().style.cursor = 'pointer';
        });

        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = '';
        });
      });

      // Pulse animation for confirmed out halo (cap 30 fps)
      let lastTime = 0;
      function pulseStep(time: number) {
        if (!isLiteRef.current && map.getLayer('out-confirmed-halo')) {
          if (time - lastTime >= 33) {
            lastTime = time;
            const progress = (time % 2400) / 2400;
            const radius = 18 + 8 * Math.sin(progress * Math.PI);
            try {
              map.setPaintProperty('out-confirmed-halo', 'circle-radius', radius);
            } catch {
              // ignore
            }
          }
        }
        pulseAnimRef.current = requestAnimationFrame(pulseStep);
      }

      pulseAnimRef.current = requestAnimationFrame(pulseStep);

      // Handle theme change event
      const onThemeChange = async (e: Event) => {
        const nextTheme = (e as CustomEvent).detail?.theme || 'dark';
        const freshBase = await fetchBaseStyle();
        const nextStyle = transformStyle(freshBase, nextTheme);
        map.setStyle(nextStyle);
        map.once('style.load', () => {
          addDataLayers(map);
        });
      };

      window.addEventListener('banange_theme_change', onThemeChange);

      mapRef.current = map;
    }

    init();

    return () => {
      isSubscribed = false;
      if (pulseAnimRef.current) {
        cancelAnimationFrame(pulseAnimRef.current);
      }
      if (popupRef.current) {
        popupRef.current.remove();
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [addDataLayers]);

  return (
    <div className="relative w-full h-full flex-1">
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
