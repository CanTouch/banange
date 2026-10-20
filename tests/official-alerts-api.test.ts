import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockAlerts: any[] = [];
const mockReports: any[] = [];

vi.mock('@/lib/supabase-server', () => {
  return {
    getSupabaseServerClient: () => ({
      from: (table: string) => {
        if (table === 'official_alerts') {
          return {
            select: () => ({
              order: () => Promise.resolve({ data: mockAlerts, error: null }),
            }),
          };
        }
        return {};
      },
    }),
  };
});

vi.mock('@/lib/store', () => {
  return {
    getStore: () => ({
      reportsSince: () => Promise.resolve(mockReports),
      getBlockedDevices: () => Promise.resolve(new Set()),
    }),
  };
});

describe('Official Alerts API (/api/official-alerts)', () => {
  beforeEach(() => {
    mockAlerts.length = 0;
    mockReports.length = 0;
  });

  it('outputs the exact required CSV columns', async () => {
    const { GET } = await import('../app/api/official-alerts/route');

    mockAlerts.push({
      id: 'a1',
      source: 'uedcl',
      source_key: 'key-1',
      published_at: '2026-10-20T06:00:00+03:00',
      service_area: 'BANDA',
      status_raw: 'Ongoing',
      status: 'active',
      first_seen_status: 'active',
      areas_raw: 'Ntinda, Kiwatule',
      areas: ['Ntinda', 'Kiwatule'],
      first_seen_at: '2026-10-20T06:00:00+03:00',
      last_seen_at: '2026-10-20T06:00:00+03:00',
      restored_seen_at: null,
      restored_time_exact: false,
      dropped_at: null,
    });

    const req = new NextRequest('http://localhost:3000/api/official-alerts?format=csv');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');

    const csvText = await res.text();
    const lines = csvText.trim().split('\n');
    const expectedHeaders =
      'published_at,service_area,status_raw,status,areas_raw,matched_count,total_areas,stale,restored_time_exact';
    expect(lines[0]).toBe(expectedHeaders);
    expect(lines.length).toBe(2);
  });

  it('performs 1.5 km proximity comparison between citizen reports and UEDCL places', async () => {
    const { GET } = await import('../app/api/official-alerts/route');

    // UEDCL alert at Ntinda (lat ~0.354, lng ~32.615)
    mockAlerts.push({
      id: 'a1',
      source: 'uedcl',
      source_key: 'key-1',
      published_at: new Date().toISOString(),
      service_area: 'BANDA',
      status_raw: 'Ongoing',
      status: 'active',
      first_seen_status: 'active',
      areas_raw: 'Ntinda',
      areas: ['Ntinda'],
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      restored_seen_at: null,
      restored_time_exact: false,
      dropped_at: null,
    });

    // Citizen report 1: inside Ntinda (lat 0.354, lng 32.615) -> dist < 1.5 km
    // Citizen report 2: far away in Gulu (lat 2.77, lng 32.30) -> dist >> 1.5 km
    mockReports.push(
      {
        id: 'r1',
        kind: 'out',
        created_at: new Date().toISOString(),
        cell_lat: 0.354,
        cell_lng: 32.615,
        area_name: 'Ntinda',
        device_hash: 'd1',
        flagged: false,
      },
      {
        id: 'r2',
        kind: 'out',
        created_at: new Date().toISOString(),
        cell_lat: 2.77,
        cell_lng: 32.3,
        area_name: 'Gulu Town',
        device_hash: 'd2',
        flagged: false,
      }
    );

    const req = new NextRequest('http://localhost:3000/api/official-alerts');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();

    // 1 notice, 2 citizen areas, 1 in both
    expect(body.counters.uedcl_notices).toBe(1);
    expect(body.counters.citizen_reports).toBe(2);
    expect(body.counters.in_both).toBe(1);

    // Gulu Town is not on UEDCL's list
    expect(body.citizen_only_areas.some((c: any) => c.area_name === 'Gulu Town')).toBe(true);
  });
});
