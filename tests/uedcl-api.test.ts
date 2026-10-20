import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

// Mock supabase-server
const mockExistingRows: any[] = [];
const mockInsertedRows: any[] = [];
const mockEvents: any[] = [];
const mockUpdates: any[] = [];

vi.mock('@/lib/supabase-server', () => {
  return {
    getSupabaseServerClient: () => ({
      from: (table: string) => {
        if (table === 'official_alerts') {
          return {
            select: () => {
              const res = Promise.resolve({ data: [...mockExistingRows], error: null }) as any;
              res.order = () => Promise.resolve({ data: [...mockExistingRows], error: null });
              return res;
            },
            insert: (doc: any) => {
              const row = { id: `id-${mockInsertedRows.length + 1}`, ...doc };
              mockInsertedRows.push(row);
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: row, error: null }),
                }),
              };
            },
            update: (updates: any) => {
              return {
                eq: (col: string, val: any) => {
                  mockUpdates.push({ col, val, updates });
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        }
        if (table === 'outage_daily_summary') {
          return {
            upsert: () => Promise.resolve({ error: null }),
          };
        }
        if (table === 'official_alert_events') {
          return {
            insert: (doc: any) => {
              mockEvents.push(doc);
              return Promise.resolve({ error: null });
            },
          };
        }
        return {};
      },
    }),
  };
});

describe('UEDCL Ingest API (/api/ingest/uedcl)', () => {
  const originalEnv = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret-token-12345';
    mockExistingRows.length = 0;
    mockInsertedRows.length = 0;
    mockEvents.length = 0;
    mockUpdates.length = 0;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalEnv;
  });

  it('rejects requests without valid Authorization header (401)', async () => {
    const { POST } = await import('../app/api/ingest/uedcl/route');

    const req1 = new NextRequest('http://localhost:3000/api/ingest/uedcl', {
      method: 'POST',
    });
    const res1 = await POST(req1);
    expect(res1.status).toBe(401);

    const req2 = new NextRequest('http://localhost:3000/api/ingest/uedcl', {
      method: 'POST',
      headers: {
        authorization: 'Bearer wrong-secret',
      },
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(401);

    // Also verify wrong auth with posted HTML gives 401
    const req3 = new NextRequest('http://localhost:3000/api/ingest/uedcl', {
      method: 'POST',
      headers: {
        'content-type': 'text/html',
        authorization: 'Bearer wrong-secret',
      },
      body: '<table class="custom-outage-table"></table>',
    });
    const res3 = await POST(req3);
    expect(res3.status).toBe(401);
  });

  it('rejects posted HTML without custom-outage-table with 400', async () => {
    const { POST } = await import('../app/api/ingest/uedcl/route');

    const req = new NextRequest('http://localhost:3000/api/ingest/uedcl', {
      method: 'POST',
      headers: {
        'content-type': 'text/html',
        authorization: 'Bearer test-secret-token-12345',
      },
      body: '<html><body><h1>Not an outage table</h1></body></html>',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'unexpected_page' });
    expect(mockInsertedRows.length).toBe(0);
  });

  it('ingests posted HTML fixture directly with source: "posted" without calling fetch', async () => {
    const { POST } = await import('../app/api/ingest/uedcl/route');

    const fetchSpy = vi.spyOn(global, 'fetch');

    const fixtureHtml = fs.readFileSync(
      path.join(__dirname, 'fixtures/uedcl-outage-alerts.html'),
      'utf8'
    );

    const req = new NextRequest('http://localhost:3000/api/ingest/uedcl', {
      method: 'POST',
      headers: {
        'content-type': 'text/html; charset=utf-8',
        authorization: 'Bearer test-secret-token-12345',
      },
      body: fixtureHtml,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe('posted');
    expect(body.fetched).toBe(42);
    expect(body.inserted).toBe(42);
    expect(mockInsertedRows.length).toBe(42);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses fetch path when body is empty and reports source: "fetched"', async () => {
    const { POST } = await import('../app/api/ingest/uedcl/route');

    const fixtureHtml = fs.readFileSync(
      path.join(__dirname, 'fixtures/uedcl-outage-alerts.html'),
      'utf8'
    );

    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(fixtureHtml),
      } as any)
    );

    const req = new NextRequest('http://localhost:3000/api/ingest/uedcl', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-secret-token-12345',
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe('fetched');
    expect(body.fetched).toBe(42);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('safely handles empty page or 0 rows without marking anything dropped', async () => {
    const { POST } = await import('../app/api/ingest/uedcl/route');

    vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve('<html><body>No tables here</body></html>'),
      } as any)
    );

    mockExistingRows.push({
      id: 'existing-1',
      source_key: 'key-1',
      status: 'active',
      status_raw: 'Ongoing',
      first_seen_status: 'active',
      restored_seen_at: null,
      restored_time_exact: false,
      dropped_at: null,
    });

    const req = new NextRequest('http://localhost:3000/api/ingest/uedcl', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-secret-token-12345',
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      source: 'fetched',
      fetched: 0,
      inserted: 0,
      updated: 0,
      restored: 0,
      dropped: 0,
      unknown_status: 0,
      skipped_bad_date: 0,
    });
    expect(mockUpdates.length).toBe(0);
  });

  it('records restored timing accurately based on first_seen_status', async () => {
    const { POST } = await import('../app/api/ingest/uedcl/route');

    // Case 1: First seen with restored status ("Completed")
    const completedHtml = `
      <table class="custom-outage-table">
        <tr><th>Date</th><th>District</th><th>Status</th><th>Affected Areas</th></tr>
        <tr><td>2026-10-19 15:25</td><td>BOMBO</td><td>Completed</td><td>Luwero Kiwoko Rd</td></tr>
      </table>
    `;

    vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(completedHtml),
      } as any)
    );

    const req1 = new NextRequest('http://localhost:3000/api/ingest/uedcl', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret-token-12345' },
    });

    const res1 = await POST(req1);
    expect(res1.status).toBe(200);
    expect(mockInsertedRows.length).toBe(1);
    expect(mockInsertedRows[0].status).toBe('restored');
    expect(mockInsertedRows[0].first_seen_status).toBe('restored');
    expect(mockInsertedRows[0].restored_seen_at).toBeNull();
    expect(mockInsertedRows[0].restored_time_exact).toBe(false);

    // Case 2: Row first seen as active that later shows restored
    const { computeUedclSourceKey, normalizeAreasText } = await import('../lib/uedcl');
    const computedKey = computeUedclSourceKey(
      '2026-10-20T06:51:00+03:00',
      'BANDA',
      normalizeAreasText('Ntinda, Kiwatule')
    );

    mockExistingRows.push({
      id: 'existing-alert-2',
      source_key: computedKey,
      status: 'active',
      status_raw: 'Ongoing',
      first_seen_status: 'active',
      restored_seen_at: null,
      restored_time_exact: false,
      dropped_at: null,
    });

    const transitionedHtml = `
      <table class="custom-outage-table">
        <tr><th>Date</th><th>District</th><th>Status</th><th>Affected Areas</th></tr>
        <tr><td>2026-10-20 06:51</td><td>BANDA</td><td>Completed</td><td>Ntinda, Kiwatule</td></tr>
      </table>
    `;

    vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(transitionedHtml),
      } as any)
    );

    const req2 = new NextRequest('http://localhost:3000/api/ingest/uedcl', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret-token-12345' },
    });

    const res2 = await POST(req2);
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.updated).toBe(1); // Status changed from Ongoing to Completed
    expect(body2.restored).toBe(1);

    const updateRecord = mockUpdates.find((u) => u.val === 'existing-alert-2');
    expect(updateRecord).toBeDefined();
    expect(updateRecord?.updates.status).toBe('restored');
    expect(updateRecord?.updates.restored_time_exact).toBe(true);
    expect(updateRecord?.updates.restored_seen_at).toBeDefined();
  });

  it('counts in "updated" only rows whose status actually changed', async () => {
    const { POST } = await import('../app/api/ingest/uedcl/route');

    const sameHtml = `
      <table class="custom-outage-table">
        <tr><th>Date</th><th>District</th><th>Status</th><th>Affected Areas</th></tr>
        <tr><td>2026-10-20 06:51</td><td>BANDA</td><td>Ongoing</td><td>Ntinda, Kiwatule</td></tr>
      </table>
    `;

    const { computeUedclSourceKey, normalizeAreasText } = await import('../lib/uedcl');
    const existingKey = computeUedclSourceKey(
      '2026-10-20T06:51:00+03:00',
      'BANDA',
      normalizeAreasText('Ntinda, Kiwatule')
    );

    mockExistingRows.push({
      id: 'existing-alert-same',
      source_key: existingKey,
      status: 'active',
      status_raw: 'Ongoing',
      first_seen_status: 'active',
      restored_seen_at: null,
      restored_time_exact: false,
      dropped_at: null,
    });

    vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(sameHtml),
      } as any)
    );

    const req = new NextRequest('http://localhost:3000/api/ingest/uedcl', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret-token-12345' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(0);
  });

  it('handles UEDCL downtime gracefully returning 502 without crashing', async () => {
    const { POST } = await import('../app/api/ingest/uedcl/route');

    vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.reject(new Error('Connection timeout'))
    );

    const req = new NextRequest('http://localhost:3000/api/ingest/uedcl', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-secret-token-12345',
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('uedcl_unavailable');
  });
});
