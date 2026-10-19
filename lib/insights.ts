import { getStore, isDemoMode } from './store';
import { computeState } from './states';
import { parseCell } from './cells';
import { GRID_SIZE_DEG } from './constants';
import { findDistrict, nearestArea } from './areas';

export interface SummaryData {
  total_outages: number;
  total_hours_dark_estimated: number;
  worst_area: string;
  last_outage_time: string | null;
}

export interface RankedArea {
  district: string;
  name: string;
  outages: number;
  hours_dark_estimated: number;
}

export interface HeatmapDay {
  date: string;
  outages: number;
  hours_dark_estimated: number;
}

export interface HeatmapRow {
  district: string;
  area: string;
  days: HeatmapDay[];
}

export interface InsightsData {
  range_days: number;
  generated_at: string;
  demo_mode?: boolean;
  selected_district?: string;
  districts?: string[];
  summary: SummaryData;
  ranked_areas: RankedArea[];
  heatmap: {
    dates: string[];
    rows: HeatmapRow[];
  };
}

export async function getInsightsData(days: 7 | 30 = 7, filterDistrict?: string): Promise<InsightsData> {
  const store = getStore();
  const now = new Date();
  const sinceMs = now.getTime() - days * 24 * 60 * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();

  const [reports, blocked] = await Promise.all([
    store.reportsSince(sinceIso),
    store.getBlockedDevices(),
  ]);

  const { episodes } = computeState(reports, now, blocked);

  const inRangeEpisodes = episodes.filter((ep) => {
    const epStart = new Date(ep.start).getTime();
    return epStart >= sinceMs || (ep.end && new Date(ep.end).getTime() >= sinceMs);
  });

  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Africa/Kampala' });
    if (!dates.includes(dateStr)) {
      dates.push(dateStr);
    }
  }

  // Pre-calculate district for each episode
  const allEpisodeDistricts = new Set<string>();
  const epDetails = inRangeEpisodes.map((ep) => {
    const { ix, iy } = parseCell(ep.cell_id);
    const lat = Number((ix * GRID_SIZE_DEG).toFixed(3));
    const lng = Number((iy * GRID_SIZE_DEG).toFixed(3));
    const area = nearestArea(lat, lng);
    const district = findDistrict(lat, lng);
    allEpisodeDistricts.add(district);
    return { ep, area, district };
  });

  // Filter by district if requested
  const filteredDetails =
    filterDistrict && filterDistrict !== 'all'
      ? epDetails.filter((item) => item.district.toLowerCase() === filterDistrict.toLowerCase())
      : epDetails;

  let totalOutages = filteredDetails.length;
  let totalHoursDark = 0;
  let lastOutageTime: string | null = null;

  const areaStatsMap = new Map<
    string,
    { district: string; name: string; outages: number; hours_dark_estimated: number }
  >();
  const areaToDistrict = new Map<string, string>();
  const heatmapMap = new Map<string, Map<string, { outages: number; hours: number }>>();

  for (const { ep, area, district } of filteredDetails) {
    const hours = ep.durationHoursEstimated;
    totalHoursDark += hours;

    if (!lastOutageTime || new Date(ep.start).getTime() > new Date(lastOutageTime).getTime()) {
      lastOutageTime = ep.start;
    }

    areaToDistrict.set(area, district);

    let stat = areaStatsMap.get(area);
    if (!stat) {
      stat = { district, name: area, outages: 0, hours_dark_estimated: 0 };
      areaStatsMap.set(area, stat);
    }
    stat.outages += 1;
    stat.hours_dark_estimated += hours;

    const epDate = new Date(ep.start).toLocaleDateString('en-CA', { timeZone: 'Africa/Kampala' });
    let areaHeat = heatmapMap.get(area);
    if (!areaHeat) {
      areaHeat = new Map();
      heatmapMap.set(area, areaHeat);
    }
    const dayVal = areaHeat.get(epDate) || { outages: 0, hours: 0 };
    dayVal.outages += 1;
    dayVal.hours += hours;
    areaHeat.set(epDate, dayVal);
  }

  const rankedAreas = Array.from(areaStatsMap.values())
    .map((a) => ({
      ...a,
      hours_dark_estimated: Math.round(a.hours_dark_estimated * 10) / 10,
    }))
    .sort((a, b) => b.hours_dark_estimated - a.hours_dark_estimated);

  const top15 = rankedAreas.slice(0, 15);
  const worstArea = rankedAreas.length > 0 ? rankedAreas[0].name : 'None';

  const topHeatmapAreas = rankedAreas.slice(0, 20).map((a) => a.name);
  const heatmapRows = topHeatmapAreas.map((area) => {
    const dayMap = heatmapMap.get(area);
    const daysData = dates.map((d) => {
      const val = dayMap?.get(d) || { outages: 0, hours: 0 };
      return {
        date: d,
        outages: val.outages,
        hours_dark_estimated: Math.round(val.hours * 10) / 10,
      };
    });
    return {
      district: areaToDistrict.get(area) || 'Kampala',
      area,
      days: daysData,
    };
  });

  return {
    range_days: days,
    generated_at: now.toISOString(),
    demo_mode: isDemoMode(),
    selected_district: filterDistrict || 'all',
    districts: Array.from(allEpisodeDistricts).sort(),
    summary: {
      total_outages: totalOutages,
      total_hours_dark_estimated: Math.round(totalHoursDark * 10) / 10,
      worst_area: worstArea,
      last_outage_time: lastOutageTime,
    },
    ranked_areas: top15,
    heatmap: {
      dates,
      rows: heatmapRows,
    },
  };
}
