'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { DEFAULT_ZOOM, KAMPALA_CENTER, UGANDA_BOUNDS, UGANDA_CENTER, UGANDA_ZOOM } from '@/lib/constants';
import { fetchBaseStyle, transformStyle } from '@/lib/mapStyle';
import { CellOut } from '@/lib/states';
import { useLiteMode } from '@/lib/liteMode';
import { formatGeoJSON } from '@/lib/history';

export interface OfficialPlacedPoint {
  id: string;
  place_name: string;
  lat: number;
  lng: number;
  service_area: string;
  published_at: string;
  status_raw: string;
  status: 'active' | 'partial';
  is_partial: boolean;
}

interface MapViewProps {
  cells: Array<CellOut & { area?: string }>;
  officialPlaces?: OfficialPlacedPoint[];
  onDotClick?: (cell: CellOut & { area?: string }) => void;
  flyToLocation?: { lat: number; lng: number; zoom?: number; timestamp?: number } | null;
}

function createRingImageData(dashed: boolean): ImageData | null {
  if (typeof document === 'undefined') return null;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const center = size / 2;
  const radius = 22;
  ctx.strokeStyle = '#F59E0B'; // Amber
  ctx.lineWidth = 4;
  if (dashed) {
    ctx.setLineDash([7, 6]);
  }
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

function formatOfficialGeoJSON(places: OfficialPlacedPoint[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: places.map((p) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [p.lng, p.lat],
      },
      properties: {
        id: p.id,
        place_name: p.place_name,
        service_area: p.service_area,
        published_at: p.published_at,
        status_raw: p.status_raw,
        status: p.status,
        is_partial: p.is_partial,
        icon: p.is_partial ? 'amber-ring-dashed' : 'amber-ring-solid',
      },
    })),
  };
}

export function MapView({ cells, officialPlaces = [], flyToLocation }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const isMapLoadedRef = useRef<boolean>(false);
  const cellsRef = useRef<Array<CellOut & { area?: string }>>(cells);
  const officialPlacesRef = useRef<OfficialPlacedPoint[]>(officialPlaces);
  const pulseAnimRef = useRef<number | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [mapScope, setMapScope] = useState<'kampala' | 'uganda'>('kampala');

  const handleJump = (scope: 'kampala' | 'uganda') => {
    setMapScope(scope);
    const map = mapRef.current;
    if (!map) return;
    if (scope === 'kampala') {
      map.flyTo({
        center: [KAMPALA_CENTER.lng, KAMPALA_CENTER.lat],
        zoom: DEFAULT_ZOOM,
        essential: true,
      });
    } else {
      map.flyTo({
        center: [UGANDA_CENTER.lng, UGANDA_CENTER.lat],
        zoom: UGANDA_ZOOM,
        essential: true,
      });
    }
  };

  const { isLite } = useLiteMode();
  const isLiteRef = useRef(isLite);

  useEffect(() => {
    isLiteRef.current = isLite;
  }, [isLite]);

  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);

  useEffect(() => {
    officialPlacesRef.current = officialPlaces;
  }, [officialPlaces]);

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

  const setupDataLayers = (
    map: maplibregl.Map,
    currentCells: Array<CellOut & { area?: string }>,
    currentOfficial: OfficialPlacedPoint[]
  ) => {
    // 1. Citizen reports source & layers
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

    // Confirmed Out - Soft Radial Glow Halo (slow pulse)
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

    // Confirmed Out - Inner Dot (solid red with white stroke)
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

    // Unconfirmed Out - Dimmer Fill with Ring
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

    // Power Back Restored - Amber Halo (fades over 2h)
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

    // Power Back Restored - Inner Circle
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

    // 2. Official UEDCL Amber Layer
    if (!map.hasImage('amber-ring-solid')) {
      const c1 = createRingImageData(false);
      if (c1) map.addImage('amber-ring-solid', c1);
    }
    if (!map.hasImage('amber-ring-dashed')) {
      const c2 = createRingImageData(true);
      if (c2) map.addImage('amber-ring-dashed', c2);
    }

    const officialGeojson = formatOfficialGeoJSON(currentOfficial);
    if (!map.getSource('official-places-source')) {
      map.addSource('official-places-source', {
        type: 'geojson',
        data: officialGeojson,
      });
    } else {
      const source = map.getSource('official-places-source') as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData(officialGeojson);
      }
    }

    // Hollow amber ring layer (dashed for Feeder Partly In / partial)
    if (!map.getLayer('official-places-rings')) {
      map.addLayer({
        id: 'official-places-rings',
        type: 'symbol',
        source: 'official-places-source',
        layout: {
          'icon-image': ['get', 'icon'],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.45, 8, 0.55, 14, 0.75],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
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
    if (!mapRef.current || !isMapLoadedRef.current) return;
    const source = mapRef.current.getSource('official-places-source') as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(formatOfficialGeoJSON(officialPlaces));
    }
  }, [officialPlaces]);

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
        center: [KAMPALA_CENTER.lng, KAMPALA_CENTER.lat],
        zoom: DEFAULT_ZOOM,
        minZoom: 5,
        maxZoom: 16,
        maxBounds,
        cooperativeGestures: false,
        attributionControl: false,
      });
      mapRef.current = map;

      map.addControl(
        new maplibregl.AttributionControl({
          compact: false,
          customAttribution: '© OpenStreetMap contributors · OpenFreeMap',
        }),
        'bottom-right'
      );

      map.on('load', () => {
        isMapLoadedRef.current = true;
        setupDataLayers(map, cellsRef.current, officialPlacesRef.current);
      });

      // Citizen dot click handler
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
              <p class="font-mono text-xs text-[var(--muted)]">${statusText}</p>
              <p class="font-mono text-xs text-[var(--faint)] pt-1 mt-0.5 border-t border-[var(--border)]">
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

      // Official amber ring click handler
      map.on('click', 'official-places-rings', (e) => {
        const feature = e.features?.[0];
        if (!feature) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const props = feature.properties as any;
        const coordinates = (feature.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
        const timeEat = formatEAT(props.published_at);

        const html = `
          <div class="flex flex-col gap-1 min-w-[180px] text-left">
            <div class="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-1 mb-0.5">
              <span class="font-mono text-xs font-bold text-[#F59E0B] tracking-wide uppercase">${props.service_area || 'UEDCL'}</span>
              <span class="font-mono text-xs text-[var(--muted)]">${timeEat}</span>
            </div>
            <h4 class="font-serif text-lg leading-tight font-normal text-[var(--ink)]">${props.place_name}</h4>
            <p class="font-mono text-xs text-[#F59E0B] font-medium">${props.status_raw}</p>
            <p class="font-mono text-xs text-[var(--faint)] pt-1 mt-0.5 border-t border-[var(--border)]">
              Listed by UEDCL
            </p>
          </div>
        `;

        if (popupRef.current) {
          popupRef.current.remove();
        }

        popupRef.current = new maplibregl.Popup({ offset: 14 })
          .setLngLat(coordinates)
          .setHTML(html)
          .addTo(map);
      });

      map.on('mouseenter', 'official-places-rings', () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', 'official-places-rings', () => {
        map.getCanvas().style.cursor = '';
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
          setupDataLayers(map, cellsRef.current, officialPlacesRef.current);
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

      {/* Quick-jump toggle: Kampala / All Uganda (top right) */}
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 pointer-events-auto">
        <div className="flex items-center bg-[var(--surface)]/90 backdrop-blur-md border border-[var(--border)] rounded-full p-0.5 shadow-lg">
          <button
            type="button"
            onClick={() => handleJump('kampala')}
            className={`px-3 py-1 text-xs font-mono rounded-full transition-all cursor-pointer ${
              mapScope === 'kampala'
                ? 'bg-[#FF4B4B] text-white shadow-sm font-semibold'
                : 'text-[var(--muted)] hover:text-[var(--ink)]'
            }`}
            aria-label="View Kampala"
          >
            Kampala
          </button>
          <button
            type="button"
            onClick={() => handleJump('uganda')}
            className={`px-3 py-1 text-xs font-mono rounded-full transition-all cursor-pointer ${
              mapScope === 'uganda'
                ? 'bg-[#FF4B4B] text-white shadow-sm font-semibold'
                : 'text-[var(--muted)] hover:text-[var(--ink)]'
            }`}
            aria-label="View All Uganda"
          >
            All Uganda
          </button>
        </div>
      </div>

      {/* Map Legend with amber entry (below status chip on mobile, below toggle on desktop) */}
      <div className="absolute top-26 left-3 sm:top-16 sm:right-4 sm:left-auto z-20 pointer-events-auto">
        <div className="flex flex-col gap-1.5 bg-[var(--surface)]/90 backdrop-blur-md border border-[var(--border)] rounded-2xl px-3 py-2 shadow-lg">
          <div className="flex items-center gap-2 font-mono text-xs text-[var(--muted)]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF4B4B] shadow-[0_0_6px_#FF4B4B] shrink-0" />
            <span>Citizen report</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs text-[var(--muted)]">
            <span className="w-3 h-3 rounded-full border-2 border-[#F59E0B] bg-transparent shrink-0" />
            <span>Listed by UEDCL</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs text-[var(--muted)]">
            <span className="w-3 h-3 rounded-full border-2 border-dashed border-[#F59E0B] bg-transparent shrink-0" />
            <span>Partly restored</span>
          </div>
        </div>
      </div>

      {/* Visible OSM Attribution */}
      <div className="absolute bottom-1 right-2 z-20 pointer-events-none text-xs font-mono text-[var(--faint)] bg-[var(--surface)]/80 px-2 py-0.5 rounded border border-[var(--border)]/50 backdrop-blur-xs">
        © OpenStreetMap contributors · OpenFreeMap
      </div>
    </div>
  );
}
