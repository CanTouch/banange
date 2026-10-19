import { CONFIRM_MIN_DEVICES, CONFIRM_WINDOW_MIN, GRID_SIZE_DEG, OUT_TTL_HOURS, RECENT_RESTORE_HOURS } from './constants';
import { neighbours, parseCell } from './cells';
import { findDistrict, isInsideGreaterKampala } from './areas';
import { Report } from './store';

export type Episode = {
  cell_id: string;
  start: string;
  lastActivity: string;
  end?: string;
  endedBy?: 'restored' | 'expired';
  confirmed: boolean;
  approximate: boolean;
  devices: number;
  durationHoursEstimated: number;
};

export type CellOut = {
  cell_id: string;
  lat: number;
  lng: number;
  state: 'out' | 'restored';
  confirmed: boolean;
  approximate: boolean;
  since: string;
  last_activity: string;
  restored_at?: string;
  fade?: number; /* 0..1 for restored */
  reporters: number;
};

interface OpenEpisode {
  cell_id: string;
  start: string;
  lastActivity: string;
  outReports: Array<{ device: string; time: number }>;
  outDevices: Set<string>;
  backDevices: Set<string>;
  approximate: boolean;
  confirmed: boolean;
}

export function computeState(
  reports: Report[],
  now: Date,
  blocked: Set<string>
): { cells: CellOut[]; episodes: Episode[] } {
  const nowMs = now.getTime();
  const outTtlMs = OUT_TTL_HOURS * 60 * 60 * 1000;
  const recentRestoreMs = RECENT_RESTORE_HOURS * 60 * 60 * 1000;
  const confirmWindowMs = CONFIRM_WINDOW_MIN * 60 * 1000;

  // 1. Drop invalid reports and sort ascending by time
  const validReports = reports
    .filter((r) => {
      if (r.flagged) return false;
      if (blocked.has(r.device_hash)) return false;
      const t = new Date(r.created_at).getTime();
      return t <= nowMs;
    })
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const openEpisodes = new Map<string, OpenEpisode>();
  const closedEpisodes: Episode[] = [];
  const latestClosedByCell = new Map<string, Episode>();

  function expireCellsBefore(timeMs: number, targetCellId?: string) {
    const checkCells = targetCellId ? [targetCellId] : Array.from(openEpisodes.keys());
    for (const cid of checkCells) {
      const ep = openEpisodes.get(cid);
      if (!ep) continue;
      const lastActMs = new Date(ep.lastActivity).getTime();
      if (timeMs - lastActMs > outTtlMs) {
        const startMs = new Date(ep.start).getTime();
        const durationHours = Math.max(0, (lastActMs - startMs) / (1000 * 60 * 60));
        const finished: Episode = {
          cell_id: ep.cell_id,
          start: ep.start,
          lastActivity: ep.lastActivity,
          end: ep.lastActivity,
          endedBy: 'expired',
          confirmed: ep.confirmed,
          approximate: ep.approximate,
          devices: ep.outDevices.size,
          durationHoursEstimated: durationHours,
        };
        closedEpisodes.push(finished);
        latestClosedByCell.set(cid, finished);
        openEpisodes.delete(cid);
      }
    }
  }

  const cellDistrictCache = new Map<string, string>();
  function getCellDistrict(cid: string): string {
    let d = cellDistrictCache.get(cid);
    if (!d) {
      const { ix, iy } = parseCell(cid);
      d = findDistrict(ix * GRID_SIZE_DEG, iy * GRID_SIZE_DEG);
      cellDistrictCache.set(cid, d);
    }
    return d;
  }

  function isCellInKampala(cid: string): boolean {
    const { ix, iy } = parseCell(cid);
    const lat = ix * GRID_SIZE_DEG;
    const lng = iy * GRID_SIZE_DEG;
    if (isInsideGreaterKampala(lat, lng)) return true;
    return getCellDistrict(cid).toLowerCase() === 'kampala';
  }

  function evaluateConfirmation(cellId: string, currentEventTimeMs: number) {
    const windowStart = currentEventTimeMs - confirmWindowMs;
    const inKampala = isCellInKampala(cellId);

    if (inKampala) {
      const neighs = neighbours(cellId);
      // Check confirmation for all open episodes in the 3x3 neighborhood
      for (const c of neighs) {
        const ep = openEpisodes.get(c);
        if (!ep) continue;
        if (ep.confirmed) continue;

        const cNeighs = neighbours(c);
        const devicesInWindow = new Set<string>();
        for (const n of cNeighs) {
          const nEp = openEpisodes.get(n);
          if (!nEp) continue;
          for (const outRep of nEp.outReports) {
            if (outRep.time >= windowStart && outRep.time <= currentEventTimeMs) {
              devicesInWindow.add(outRep.device);
            }
          }
        }

        if (devicesInWindow.size >= CONFIRM_MIN_DEVICES) {
          ep.confirmed = true;
        }
      }
    } else {
      // Outside Kampala: density is lower.
      // Confirm an outage when 3 different devices report within the same district within 30 minutes.
      const district = getCellDistrict(cellId);
      const districtOpenEpisodes: OpenEpisode[] = [];
      const devicesInDistrict = new Set<string>();

      for (const ep of openEpisodes.values()) {
        if (getCellDistrict(ep.cell_id) === district) {
          districtOpenEpisodes.push(ep);
          for (const outRep of ep.outReports) {
            if (outRep.time >= windowStart && outRep.time <= currentEventTimeMs) {
              devicesInDistrict.add(outRep.device);
            }
          }
        }
      }

      if (devicesInDistrict.size >= CONFIRM_MIN_DEVICES) {
        for (const ep of districtOpenEpisodes) {
          ep.confirmed = true;
        }
      }
    }
  }

  // 2. Process events
  for (const r of validReports) {
    const tMs = new Date(r.created_at).getTime();
    const cellId = r.cell_id;
    const device = r.device_hash;

    // Expiry check before applying event
    expireCellsBefore(tMs, cellId);

    if (r.kind === 'out') {
      let ep = openEpisodes.get(cellId);
      if (!ep) {
        ep = {
          cell_id: cellId,
          start: r.created_at,
          lastActivity: r.created_at,
          outReports: [{ device, time: tMs }],
          outDevices: new Set([device]),
          backDevices: new Set(),
          approximate: r.loc_precision !== 'gps',
          confirmed: false,
        };
        openEpisodes.set(cellId, ep);
      } else {
        ep.outDevices.add(device);
        ep.outReports.push({ device, time: tMs });
        ep.lastActivity = r.created_at;
        ep.backDevices.clear();
        if (r.loc_precision !== 'gps') {
          ep.approximate = true;
        }
      }

      evaluateConfirmation(cellId, tMs);
    } else if (r.kind === 'back') {
      const ep = openEpisodes.get(cellId);
      if (ep) {
        ep.backDevices.add(device);
        const needed = ep.confirmed ? 2 : 1;
        if (ep.backDevices.size >= needed) {
          const startMs = new Date(ep.start).getTime();
          const durationHours = Math.max(0, (tMs - startMs) / (1000 * 60 * 60));
          const finished: Episode = {
            cell_id: ep.cell_id,
            start: ep.start,
            lastActivity: ep.lastActivity,
            end: r.created_at,
            endedBy: 'restored',
            confirmed: ep.confirmed,
            approximate: ep.approximate,
            devices: ep.outDevices.size,
            durationHoursEstimated: durationHours,
          };
          closedEpisodes.push(finished);
          latestClosedByCell.set(cellId, finished);
          openEpisodes.delete(cellId);
        }
      }
    }
  }

  // Final expiry check at `now`
  expireCellsBefore(nowMs);

  // Generate episodes array
  const allEpisodes: Episode[] = [...closedEpisodes];
  for (const ep of openEpisodes.values()) {
    const startMs = new Date(ep.start).getTime();
    const durationHours = Math.max(0, (nowMs - startMs) / (1000 * 60 * 60));
    allEpisodes.push({
      cell_id: ep.cell_id,
      start: ep.start,
      lastActivity: ep.lastActivity,
      confirmed: ep.confirmed,
      approximate: ep.approximate,
      devices: ep.outDevices.size,
      durationHoursEstimated: durationHours,
    });
  }

  // 4. Cells output
  const cellsOut: CellOut[] = [];

  // Open cells
  for (const ep of openEpisodes.values()) {
    const { ix, iy } = parseCell(ep.cell_id);
    const lat = Number((ix * GRID_SIZE_DEG).toFixed(3));
    const lng = Number((iy * GRID_SIZE_DEG).toFixed(3));

    cellsOut.push({
      cell_id: ep.cell_id,
      lat,
      lng,
      state: 'out',
      confirmed: ep.confirmed,
      approximate: ep.approximate,
      since: ep.start,
      last_activity: ep.lastActivity,
      reporters: ep.outDevices.size,
    });
  }

  // Restored cells (only cells without open episodes)
  for (const [cellId, closed] of latestClosedByCell.entries()) {
    if (openEpisodes.has(cellId)) continue;
    if (closed.endedBy === 'restored' && closed.end) {
      const endMs = new Date(closed.end).getTime();
      const elapsed = nowMs - endMs;
      if (elapsed <= recentRestoreMs && elapsed >= 0) {
        const fade = Math.max(0, Math.min(1, 1 - elapsed / recentRestoreMs));
        const { ix, iy } = parseCell(cellId);
        const lat = Number((ix * GRID_SIZE_DEG).toFixed(3));
        const lng = Number((iy * GRID_SIZE_DEG).toFixed(3));

        cellsOut.push({
          cell_id: cellId,
          lat,
          lng,
          state: 'restored',
          confirmed: closed.confirmed,
          approximate: closed.approximate,
          since: closed.start,
          last_activity: closed.lastActivity,
          restored_at: closed.end,
          fade: Number(fade.toFixed(3)),
          reporters: closed.devices,
        });
      }
    }
  }

  return {
    cells: cellsOut,
    episodes: allEpisodes,
  };
}
