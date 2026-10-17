import { GRID_SIZE_DEG } from './constants';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface CellCoords {
  cell_id: string;
  cell_lat: number;
  cell_lng: number;
}

export function latLngToCell(lat: number, lng: number): CellCoords {
  const ix = Math.round(lat / GRID_SIZE_DEG);
  const iy = Math.round(lng / GRID_SIZE_DEG);
  const cell_id = `${ix}_${iy}`;
  const cell_lat = Number((ix * GRID_SIZE_DEG).toFixed(3));
  const cell_lng = Number((iy * GRID_SIZE_DEG).toFixed(3));
  return { cell_id, cell_lat, cell_lng };
}

export function parseCell(cell_id: string): { ix: number; iy: number } {
  const [ixStr, iyStr] = cell_id.split('_');
  return {
    ix: parseInt(ixStr, 10),
    iy: parseInt(iyStr, 10),
  };
}

export function neighbours(cell_id: string): string[] {
  const { ix, iy } = parseCell(cell_id);
  const result: string[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      result.push(`${ix + dx}_${iy + dy}`);
    }
  }
  return result;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371; // Earth's mean radius in km
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const sinDLat2 = Math.sin(dLat / 2);
  const sinDLng2 = Math.sin(dLng / 2);

  const h = sinDLat2 * sinDLat2 + Math.cos(lat1) * Math.cos(lat2) * sinDLng2 * sinDLng2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}
