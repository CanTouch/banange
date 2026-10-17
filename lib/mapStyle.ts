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
      // Return a minimal valid style specification if all external calls fail
      return {
        version: 8,
        name: 'Empty Fallback',
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: { 'background-color': '#0B1020' },
          },
        ],
      };
    }
  }
}

export function transformStyle(
  baseStyle: StyleSpecification,
  theme: 'dark' | 'light'
): StyleSpecification {
  const style: StyleSpecification = JSON.parse(JSON.stringify(baseStyle));

  if (theme === 'dark') {
    for (const layer of style.layers || []) {
      const id = layer.id.toLowerCase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const paint = (layer.paint as Record<string, any>) || {};

      if (layer.type === 'background') {
        paint['background-color'] = '#0B1020';
      } else if (id.includes('water')) {
        if (layer.type === 'fill') paint['fill-color'] = '#0F1A33';
        if (layer.type === 'line') paint['line-color'] = '#0F1A33';
      } else if (id.includes('boundary') || id.includes('admin')) {
        if (layer.type === 'line') paint['line-color'] = '#26325A';
      } else if (layer.type === 'line') {
        paint['line-color'] = '#1E2A4A';
      } else if (id.includes('land') || id.includes('park') || id.includes('building')) {
        if (layer.type === 'fill') paint['fill-color'] = '#0B1020';
      }

      if (layer.type === 'symbol') {
        if (id.includes('poi') || id.includes('minor') || id.includes('service')) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          layer.layout = { ...(layer.layout as any), visibility: 'none' };
        } else {
          paint['text-color'] = '#8A94AD';
          paint['text-halo-color'] = '#0B1020';
        }
      }

      layer.paint = paint;
    }
  } else {
    // Light theme
    for (const layer of style.layers || []) {
      const id = layer.id.toLowerCase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const paint = (layer.paint as Record<string, any>) || {};

      if (layer.type === 'background') {
        paint['background-color'] = '#F7F4EE';
      } else if (id.includes('land') && layer.type === 'fill') {
        paint['fill-color'] = '#F7F4EE';
      }

      layer.paint = paint;
    }
  }

  return style;
}
