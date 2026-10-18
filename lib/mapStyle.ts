import type { StyleSpecification } from 'maplibre-gl';

let cachedBaseStyle: StyleSpecification | null = null;

const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const FALLBACK_STYLE_URL = 'https://demotiles.maplibre.org/style.json';

export async function fetchBaseStyle(): Promise<StyleSpecification> {
  if (cachedBaseStyle) {
    return JSON.parse(JSON.stringify(cachedBaseStyle));
  }

  try {
    const res = await fetch(OPENFREEMAP_STYLE_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    cachedBaseStyle = data;
    return JSON.parse(JSON.stringify(data));
  } catch (err) {
    console.warn('Failed to load OpenFreeMap style, falling back to demotiles:', err);
    try {
      const res = await fetch(FALLBACK_STYLE_URL);
      const data = await res.json();
      cachedBaseStyle = data;
      return JSON.parse(JSON.stringify(data));
    } catch (fallbackErr) {
      console.warn('Failed to load fallback style:', fallbackErr);
      return {
        version: 8,
        name: 'Empty Fallback',
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: { 'background-color': '#0A1122' },
          },
        ],
      };
    }
  }
}

interface TransformStyleOptions {
  isPicker?: boolean;
}

function bumpTextSize(sizeExpr: any, delta = 1.5): any {
  if (typeof sizeExpr === 'number') {
    return sizeExpr + delta;
  }
  if (Array.isArray(sizeExpr)) {
    if (sizeExpr[0] === 'interpolate') {
      const copy = [...sizeExpr];
      for (let i = 4; i < copy.length; i += 2) {
        if (typeof copy[i] === 'number') {
          copy[i] = copy[i] + delta;
        }
      }
      return copy;
    }
    if (sizeExpr[0] === 'step') {
      const copy = [...sizeExpr];
      if (typeof copy[2] === 'number') copy[2] += delta;
      for (let i = 4; i < copy.length; i += 2) {
        if (typeof copy[i] === 'number') {
          copy[i] = copy[i] + delta;
        }
      }
      return copy;
    }
  }
  return sizeExpr;
}

export function transformStyle(
  baseStyle: StyleSpecification,
  theme: 'dark' | 'light',
  options: TransformStyleOptions = {}
): StyleSpecification {
  const style: StyleSpecification = JSON.parse(JSON.stringify(baseStyle));
  const isPicker = Boolean(options.isPicker);

  if (theme === 'dark') {
    for (const layer of style.layers || []) {
      const id = layer.id.toLowerCase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const paint = (layer.paint as Record<string, any>) || {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const layout = (layer.layout as Record<string, any>) || {};

      // 1. Background & Land: #0A1122
      if (layer.type === 'background') {
        paint['background-color'] = '#0A1122';
      } else if (id.includes('water')) {
        // Water: #05070D
        if (layer.type === 'fill') paint['fill-color'] = '#05070D';
        if (layer.type === 'line') paint['line-color'] = '#05070D';
      } else if (id.includes('boundary') || id.includes('admin')) {
        if (layer.type === 'line') {
          paint['line-color'] = '#22315E';
          paint['line-width'] = 1;
          paint['line-opacity'] = 0.8;
        }
      } else if (id.includes('building') || (layer as any)['source-layer'] === 'building') {
        // 2 & 3. Buildings:
        // - In Confirm location picker (small map): hide buildings entirely at all zooms
        // - In main map: below zoom 16 hide entirely; at zoom 16+ very dark fill #0A1122 with max 10% opacity outline
        if (isPicker) {
          layout.visibility = 'none';
        } else {
          layer.minzoom = 16;
          paint['fill-color'] = '#0A1122';
          paint['fill-outline-color'] = 'rgba(29, 40, 72, 0.1)';
          paint['fill-opacity'] = 0.8;
        }
      } else if (id.includes('land') || id.includes('park') || id.includes('area') || id.includes('residential')) {
        if (layer.type === 'fill') paint['fill-color'] = '#0A1122';
      } else if (layer.type === 'line') {
        // 4. Dim roads slightly (line colour #1D2848) so labels stand out
        if (id.includes('casing') || id.includes('tunnel')) {
          paint['line-color'] = '#0A1122';
          paint['line-opacity'] = 0.3;
        } else if (id.includes('highway') || id.includes('road') || id.includes('pier') || id.includes('aeroway')) {
          paint['line-color'] = '#1D2848';
          paint['line-opacity'] = 0.85;
          if (typeof paint['line-width'] === 'number') {
            paint['line-width'] = Math.max(1, paint['line-width']);
          }
        } else if (id.includes('railway')) {
          paint['line-color'] = '#121A33';
          paint['line-opacity'] = 0.4;
        }
      }

      // 1 & 3. Place names, road names, and symbols:
      if (layer.type === 'symbol') {
        // In picker: hide POIs, house numbers, airport, shields
        // In main map: hide POI icons, house numbers, shields to keep map uncluttered
        const isPoiOrHouse =
          id.includes('poi') ||
          id.includes('house') ||
          id.includes('airport') ||
          id.includes('shield');

        if (isPoiOrHouse) {
          layout.visibility = 'none';
        } else {
          // Place names (suburb, neighbourhood, village, city, road names)
          layout.visibility = 'visible';

          // Pure white text with dark halo
          paint['text-color'] = '#FFFFFF';
          paint['text-halo-color'] = '#05070D';
          paint['text-halo-width'] = 2;
          paint['text-halo-blur'] = 0.5;

          // Semibold / Bold font
          layout['text-font'] = ['Noto Sans Bold', 'Noto Sans Regular'];

          // 1-2px larger text size
          if (layout['text-size']) {
            layout['text-size'] = bumpTextSize(layout['text-size'], 1.5);
          }
        }
      }

      layer.paint = paint;
      layer.layout = layout;
    }
  } else {
    // Warm Paper palette: bg #F3EDE0, ink #14110D, muted borders #D8CEBC
    for (const layer of style.layers || []) {
      const id = layer.id.toLowerCase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const paint = (layer.paint as Record<string, any>) || {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const layout = (layer.layout as Record<string, any>) || {};

      if (layer.type === 'background') {
        paint['background-color'] = '#F3EDE0';
      } else if (id.includes('water')) {
        if (layer.type === 'fill') paint['fill-color'] = '#E3DBD0';
        if (layer.type === 'line') paint['line-color'] = '#D2C7B8';
      } else if (id.includes('boundary') || id.includes('admin')) {
        if (layer.type === 'line') {
          paint['line-color'] = '#C8BEAD';
          paint['line-width'] = 1;
        }
      } else if (id.includes('building') || (layer as any)['source-layer'] === 'building') {
        if (isPicker) {
          layout.visibility = 'none';
        } else {
          layer.minzoom = 16;
          paint['fill-color'] = '#E8E0D2';
          paint['fill-outline-color'] = 'rgba(200, 190, 173, 0.2)';
        }
      } else if (id.includes('land') || id.includes('park')) {
        if (layer.type === 'fill') paint['fill-color'] = '#F3EDE0';
      } else if (layer.type === 'line') {
        paint['line-color'] = '#D8CEBC';
        paint['line-opacity'] = 0.8;
      }

      if (layer.type === 'symbol') {
        if (id.includes('poi') || id.includes('house') || id.includes('shield')) {
          layout.visibility = 'none';
        } else {
          layout.visibility = 'visible';
          paint['text-color'] = '#14110D';
          paint['text-halo-color'] = '#F3EDE0';
          paint['text-halo-width'] = 2;
          paint['text-halo-blur'] = 0.5;
          layout['text-font'] = ['Noto Sans Bold', 'Noto Sans Regular'];
          if (layout['text-size']) {
            layout['text-size'] = bumpTextSize(layout['text-size'], 1.5);
          }
        }
      }

      layer.paint = paint;
      layer.layout = layout;
    }
  }

  // 1. Keep symbol layers above every other layer (except outage dots which are added later)
  const nonSymbolLayers = (style.layers || []).filter((l) => l.type !== 'symbol');
  const symbolLayers = (style.layers || []).filter((l) => l.type === 'symbol');
  style.layers = [...nonSymbolLayers, ...symbolLayers];

  return style;
}
