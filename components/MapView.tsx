'use client';

import React, { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { DEFAULT_ZOOM, UGANDA_BOUNDS, UGANDA_CENTER } from '@/lib/constants';
import { fetchBaseStyle, transformStyle } from '@/lib/mapStyle';
import { CellOut } from '@/lib/states';
import { useLiteMode } from '@/lib/liteMode';
import { formatGeoJSON } from '@/lib/history';

interface MapViewProps {
  cells: Array<CellOut & { area?: string }>;
  onDotClick?: (cell: CellOut & { area?: string }) => void;
  flyToLocation?: { lat: number; lng: number; zoom?: number; timestamp?: number } | null;
}

export function MapView({ cells, flyToLocation }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const isMapLoadedRef = useRef<boolean>(false);
  const cellsRef = useRef<Array<CellOut & { area?: string }>>(cells);
  const pulseAnimRef = useRef<number | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const { isLite } = useLiteMode();
  const isLiteRef = useRef(isLite);

  useEffect(() => {
    isLiteRef.current = isLite;
  }, [isLite]);

  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);

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

  const setupDataLayers = (map: maplibregl.Map, currentCells: Array<CellOut & { area?: string }>) => {
    const geojson = formatGeoJSON(currentCells);

    if (!map.getSource('cells-source')) {
      map.addSource('cells-source', {
        type: 'geojson',
        data: geojson,
      });
    } else {
      const source = map.getSource('cells-source') as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData(geojson);
      }
    }

    const lite = isLiteRef.current;

    // 1. Confirmed Out - Soft Radial Glow Halo (slow pulse)
    if (!lite && !map.getLayer('out-confirmed-halo')) {
      map.addLayer({
        id: 'out-confirmed-halo',
        type: 'circle',
        source: 'cells-source',
        filter: ['all', ['==', ['get', 'state'], 'out'], ['==', ['get', 'confirmed'], true]],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 18, 8, 26, 14, 38],
          'circle-color': '#FF4B4B',
          'circle-opacity': 0.35,
          'circle-blur': 0.8,
        },
      });
    }

    // 2. Confirmed Out - Inner Dot (solid red with white stroke)
    if (!map.getLayer('out-confirmed-inner')) {
      map.addLayer({
        id: 'out-confirmed-inner',
        type: 'circle',
        source: 'cells-source',
        filter: ['all', ['==', ['get', 'state'], 'out'], ['==', ['get', 'confirmed'], true]],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 6, 8, 7.5, 14, 10],
          'circle-color': '#FF4B4B',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#FFFFFF',
        },
      });
    }

    // 3. Unconfirmed Out - Dimmer Fill with Ring
    if (!map.getLayer('out-unconfirmed-inner')) {
      map.addLayer({
        id: 'out-unconfirmed-inner',
        type: 'circle',
        source: 'cells-source',
        filter: ['all', ['==', ['get', 'state'], 'out'], ['==', ['get', 'confirmed'], false]],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 5.5, 8, 7, 14, 9.5],
          'circle-color': '#FF4B4B',
          'circle-opacity': 0.38,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#FF7A7A',
          'circle-stroke-opacity': 0.85,
        },
      });
    }

    // 4. Power Back Restored - Amber Halo (fades over 2h)
    if (!lite && !map.getLayer('restored-halo')) {
      map.addLayer({
        id: 'restored-halo',
        type: 'circle',
        source: 'cells-source',
        filter: ['==', ['get', 'state'], 'restored'],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 16, 8, 22, 14, 32],
          'circle-color': '#FFB547',
          'circle-opacity': ['*', 0.35, ['get', 'fade']],
          'circle-blur': 0.7,
        },
      });
    }

    // 5. Power Back Restored - Inner Circle
    if (!map.getLayer('restored-inner')) {
      map.addLayer({
        id: 'restored-inner',
        type: 'circle',
        source: 'cells-source',
        filter: ['==', ['get', 'state'], 'restored'],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 5.5, 8, 7, 14, 9],
          'circle-color': '#FFB547',
          'circle-opacity': ['get', 'fade'],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-opacity': ['get', 'fade'],
        },
      });
    }
  };

  useEffect(() => {
    if (!mapRef.current || !isMapLoadedRef.current) return;
    const source = mapRef.current.getSource('cells-source') as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(formatGeoJSON(cells));
    }
  }, [cells]);

  useEffect(() => {
    if (!mapRef.current || !flyToLocation) return;
    mapRef.current.flyTo({
      center: [flyToLocation.lng, flyToLocation.lat],
      zoom: flyToLocation.zoom || 13,
      duration: 800,
      essential: true,
    });
  }, [flyToLocation]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    let isSubscribed = true;

    async function init() {
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

      map.addControl(
        new maplibregl.AttributionControl({
          compact: true,
          customAttribution: '© OpenStreetMap contributors · OpenFreeMap',
        }),
        'bottom-right'
      );

      map.on('load', () => {
        isMapLoadedRef.current = true;
        setupDataLayers(map, cellsRef.current);
      });

      // Dot click handler - small glass card
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
          const statusText = isOut
            ? `Out since ${timeEat} · ${props.confirmed ? 'Confirmed' : 'Unconfirmed'}`
            : `Power back at ${timeEat}`;

          const html = `
            <div class="flex flex-col gap-1 min-w-[170px] text-left">
              <h4 class="font-serif text-lg leading-tight font-normal text-[var(--ink)]">${props.area || 'Uganda'}</h4>
              <p class="font-mono text-[11px] text-[var(--muted)]">${statusText}</p>
              <p class="font-mono text-[10px] text-[var(--faint)] pt-1 mt-0.5 border-t border-[var(--border)]">
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

      // Slow pulse animation (2.4s) for confirmed out halo, respecting prefers-reduced-motion
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      let lastTime = 0;
      function pulseStep(time: number) {
        if (!isLiteRef.current && !prefersReducedMotion && map.getLayer('out-confirmed-halo')) {
          if (time - lastTime >= 33) {
            lastTime = time;
            const progress = (time % 2400) / 2400;
            const radius = 18 + 7 * Math.sin(progress * Math.PI);
            try {
              map.setPaintProperty('out-confirmed-halo', 'circle-radius', radius);
            } catch {
              // ignore
            }
          }
        }
        pulseAnimRef.current = requestAnimationFrame(pulseStep);
      }

      if (!prefersReducedMotion) {
        pulseAnimRef.current = requestAnimationFrame(pulseStep);
      }

      // Handle theme change event
      const onThemeChange = async (e: Event) => {
        const nextTheme = (e as CustomEvent).detail?.theme || 'dark';
        const freshBase = await fetchBaseStyle();
        const nextStyle = transformStyle(freshBase, nextTheme);
        map.setStyle(nextStyle);
        map.once('style.load', () => {
          setupDataLayers(map, cellsRef.current);
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
        isMapLoadedRef.current = false;
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full flex-1">
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />
      {/* Radial vignette */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background: 'var(--vignette)',
        }}
      />
    </div>
  );
}
