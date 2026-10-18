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

export function transformStyle(
  baseStyle: StyleSpecification,
  theme: 'dark' | 'light'
): StyleSpecification {
  const style: StyleSpecification = JSON.parse(JSON.stringify(baseStyle));

  if (theme === 'dark') {
    // "Black Marble" palette: near-black land #0A1122, darker water #05070D, faint borders #22315E, no road clutter
    for (const layer of style.layers || []) {
      const id = layer.id.toLowerCase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const paint = (layer.paint as Record<string, any>) || {};

      if (layer.type === 'background') {
        paint['background-color'] = '#0A1122';
      } else if (id.includes('water')) {
        if (layer.type === 'fill') paint['fill-color'] = '#05070D';
        if (layer.type === 'line') paint['line-color'] = '#05070D';
      } else if (id.includes('boundary') || id.includes('admin')) {
        if (layer.type === 'line') {
          paint['line-color'] = '#22315E';
          paint['line-width'] = 1;
          paint['line-opacity'] = 0.8;
        }
      } else if (id.includes('land') || id.includes('park') || id.includes('building') || id.includes('area')) {
        if (layer.type === 'fill') paint['fill-color'] = '#0A1122';
      } else if (layer.type === 'line') {
        // No road clutter: hide minor roads, tunnel, path, service, pedestrian
        if (
          id.includes('minor') ||
          id.includes('service') ||
          id.includes('track') ||
          id.includes('path') ||
          id.includes('footway') ||
          id.includes('cycleway') ||
          id.includes('residential') ||
          id.includes('tunnel') ||
          id.includes('bridge')
        ) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          layer.layout = { ...(layer.layout as any), visibility: 'none' };
        } else {
          // Major trunk or arterial highway lines kept extremely faint
          paint['line-color'] = '#121A33';
          paint['line-opacity'] = 0.4;
          paint['line-width'] = 0.75;
        }
      }

      if (layer.type === 'symbol') {
        if (
          id.includes('poi') ||
          id.includes('minor') ||
          id.includes('service') ||
          id.includes('road') ||
          id.includes('street') ||
          id.includes('house')
        ) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          layer.layout = { ...(layer.layout as any), visibility: 'none' };
        } else {
          // Country / City labels in muted blue-grey
          paint['text-color'] = '#56627F';
          paint['text-halo-color'] = '#0A1122';
          paint['text-halo-width'] = 1;
        }
      }

      layer.paint = paint;
    }
  } else {
    // Warm Paper palette: bg #F3EDE0, ink #14110D, muted borders #D8CEBC
    for (const layer of style.layers || []) {
      const id = layer.id.toLowerCase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const paint = (layer.paint as Record<string, any>) || {};

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
      } else if (id.includes('land') || id.includes('park') || id.includes('building')) {
        if (layer.type === 'fill') paint['fill-color'] = '#F3EDE0';
      } else if (layer.type === 'line') {
        paint['line-color'] = '#E7DFD2';
        paint['line-opacity'] = 0.6;
      }

      if (layer.type === 'symbol') {
        if (id.includes('poi') || id.includes('minor') || id.includes('service')) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          layer.layout = { ...(layer.layout as any), visibility: 'none' };
        } else {
          paint['text-color'] = '#14110D';
          paint['text-halo-color'] = '#F3EDE0';
          paint['text-halo-width'] = 1;
        }
      }

      layer.paint = paint;
    }
  }

  return style;
}
