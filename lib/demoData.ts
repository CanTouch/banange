import { Report } from './store';
import { latLngToCell } from './cells';
import customAreas from '../data/areas.custom.json';

export function generateDemoReports(): Report[] {
  const reports: Report[] = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;

  // Key areas for realistic clustering
  const sampleAreas = customAreas.slice(0, 20);

  // Generate episodes across the last 30 days
  let reportCounter = 1;

  for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
    const dayBase = now - dayOffset * dayMs;
    // 2-6 outage episodes per day
    const episodeCount = 2 + ((dayOffset * 7 + 3) % 5);

    for (let e = 0; e < episodeCount; e++) {
      const area = sampleAreas[(dayOffset * 3 + e * 4) % sampleAreas.length];
      const { cell_id, cell_lat, cell_lng } = latLngToCell(area.lat, area.lng);
      const startHour = 8 + ((e * 4 + dayOffset) % 12);
      const startMs = dayBase + startHour * hourMs;
      if (startMs > now) continue;

      const durationHours = 1 + ((dayOffset + e * 2) % 6);
      const endMs = startMs + durationHours * hourMs;
      const isCurrentlyDark = dayOffset === 0 && e >= episodeCount - 2 && endMs > now;

      // 2 to 4 devices report "out"
      const reporterCount = 1 + (e % 3);
      for (let r = 0; r < reporterCount; r++) {
        reports.push({
          id: `demo-out-${reportCounter++}`,
          created_at: new Date(startMs + r * 60 * 1000).toISOString(),
          kind: 'out',
          cell_id,
          cell_lat,
          cell_lng,
          loc_precision: 'pin',
          area_name: area.name,
          device_hash: `demo-device-${(dayOffset + r) % 50}`,
          flagged: false,
        });
      }

      // If not currently dark and end is in the past, report "back"
      if (!isCurrentlyDark && endMs <= now) {
        reports.push({
          id: `demo-back-${reportCounter++}`,
          created_at: new Date(endMs).toISOString(),
          kind: 'back',
          cell_id,
          cell_lat,
          cell_lng,
          loc_precision: 'pin',
          area_name: area.name,
          device_hash: `demo-device-${dayOffset % 50}`,
          flagged: false,
        });

        // If multiple reporters, second back report to confirm restoration
        if (reporterCount > 1) {
          reports.push({
            id: `demo-back-${reportCounter++}`,
            created_at: new Date(endMs + 3 * 60 * 1000).toISOString(),
            kind: 'back',
            cell_id,
            cell_lat,
            cell_lng,
            loc_precision: 'pin',
            area_name: area.name,
            device_hash: `demo-device-${(dayOffset + 1) % 50}`,
            flagged: false,
          });
        }
      }
    }
  }

  // Sort by created_at ascending
  reports.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return reports;
}
