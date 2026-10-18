import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, OPTIONS } from '../app/api/report/route';
import { getStore, MemoryStore } from '../lib/store';
import { hashDeviceId } from '../lib/device';

describe('POST /api/report handler', () => {
  const store = getStore() as MemoryStore;

  beforeEach(() => {
    store.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
    return new NextRequest('http://localhost:3000/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  it('valid report -> 201 with CORS headers', async () => {
    const devId = crypto.randomUUID();
    const req = makeRequest({
      kind: 'out',
      lat: 0.3536,
      lng: 32.6128,
      loc_precision: 'gps',
      device_id: devId,
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.cell_id).toBeDefined();
    expect(data.cell_lat).toBeDefined();
    expect(data.cell_lng).toBeDefined();
  });

  it('OPTIONS preflight -> 204 with CORS headers', async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('malformed or invalid JSON payload -> 400 invalid_request', async () => {
    const req = makeRequest({
      kind: 'wrong_kind',
      lat: 'not-a-number',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_request');
  });

  it('out-of-bounds -> 422', async () => {
    const devId = crypto.randomUUID();
    const req = makeRequest({
      kind: 'out',
      lat: 51.5074, // London
      lng: -0.1278,
      loc_precision: 'gps',
      device_id: devId,
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toBe('out_of_bounds');
  });

  it('second identical report within 10 min -> 429 rate_limited', async () => {
    const devId = crypto.randomUUID();
    const payload = {
      kind: 'out',
      lat: 0.3536,
      lng: 32.6128,
      loc_precision: 'gps',
      device_id: devId,
    };

    const res1 = await POST(makeRequest(payload));
    expect(res1.status).toBe(201);

    const res2 = await POST(makeRequest(payload));
    expect(res2.status).toBe(429);
    const data = await res2.json();
    expect(data.error).toBe('rate_limited');
    expect(data.retry_after_seconds).toBe(600);
    expect(data.message).toContain('already reported');
  });

  it('21st report in a day -> 429 daily_limit', async () => {
    const devId = crypto.randomUUID();
    const devHash = hashDeviceId(devId);

    // Pre-seed 20 reports within 24h
    for (let i = 0; i < 20; i++) {
      await store.insertReport({
        kind: i % 2 === 0 ? 'out' : 'back',
        cell_id: '70_6520',
        cell_lat: 0.35,
        cell_lng: 32.6,
        loc_precision: 'gps',
        device_hash: devHash,
        created_at: new Date(Date.now() - (20 - i) * 60 * 1000).toISOString(),
      });
    }

    // Now attempt 21st report
    const req = makeRequest({
      kind: 'out',
      lat: 0.3536,
      lng: 32.6128,
      loc_precision: 'gps',
      device_id: devId,
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toBe('daily_limit');
    expect(data.message).toContain('Daily report limit reached');
  });

  it('area lookup: valid area preserved, unknown area set to null', async () => {
    const devId1 = crypto.randomUUID();
    const req1 = makeRequest({
      kind: 'out',
      lat: 0.334,
      lng: 32.568,
      loc_precision: 'area',
      area_name: 'Makerere',
      device_id: devId1,
    });

    const res1 = await POST(req1);
    expect(res1.status).toBe(201);
    const reports1 = await store.reportsSince('1970-01-01');
    const stored1 = reports1.find((r) => r.device_hash === hashDeviceId(devId1));
    expect(stored1?.area_name).toBe('Makerere');

    const devId2 = crypto.randomUUID();
    const req2 = makeRequest({
      kind: 'out',
      lat: 0.334,
      lng: 32.568,
      loc_precision: 'gps',
      area_name: 'Nonexistent Fake Area 999',
      device_id: devId2,
    });

    const res2 = await POST(req2);
    expect(res2.status).toBe(201);
    const reports2 = await store.reportsSince('1970-01-01');
    const stored2 = reports2.find((r) => r.device_hash === hashDeviceId(devId2));
    expect(stored2?.area_name).toBeNull();
  });

  it('Turnstile: if TURNSTILE_SECRET is NOT set -> skips verification', async () => {
    const origSecret = process.env.TURNSTILE_SECRET;
    delete process.env.TURNSTILE_SECRET;

    try {
      const devId = crypto.randomUUID();
      const req = makeRequest({
        kind: 'out',
        lat: 0.3536,
        lng: 32.6128,
        loc_precision: 'gps',
        device_id: devId,
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
    } finally {
      if (origSecret) process.env.TURNSTILE_SECRET = origSecret;
    }
  });

  it('Turnstile: if TURNSTILE_SECRET is set and token is missing -> 403 challenge_failed', async () => {
    const origSecret = process.env.TURNSTILE_SECRET;
    process.env.TURNSTILE_SECRET = 'test-turnstile-secret';

    try {
      const devId = crypto.randomUUID();
      const req = makeRequest({
        kind: 'out',
        lat: 0.3536,
        lng: 32.6128,
        loc_precision: 'gps',
        device_id: devId,
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('challenge_failed');
      expect(data.message).toContain('Bot verification failed');
    } finally {
      if (origSecret) process.env.TURNSTILE_SECRET = origSecret;
      else delete process.env.TURNSTILE_SECRET;
    }
  });

  it('Turnstile: if TURNSTILE_SECRET is set and verification succeeds -> 201', async () => {
    const origSecret = process.env.TURNSTILE_SECRET;
    process.env.TURNSTILE_SECRET = 'test-turnstile-secret';

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: string | URL | Request) => {
      if (typeof url === 'string' && url.includes('challenges.cloudflare.com')) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    try {
      const devId = crypto.randomUUID();
      const req = makeRequest({
        kind: 'out',
        lat: 0.3536,
        lng: 32.6128,
        loc_precision: 'gps',
        device_id: devId,
        turnstile_token: 'valid-cf-token',
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.ok).toBe(true);
    } finally {
      if (origSecret) process.env.TURNSTILE_SECRET = origSecret;
      else delete process.env.TURNSTILE_SECRET;
    }
  });

  it('Turnstile: if TURNSTILE_SECRET is set and verification fails -> 403 challenge_failed', async () => {
    const origSecret = process.env.TURNSTILE_SECRET;
    process.env.TURNSTILE_SECRET = 'test-turnstile-secret';

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: string | URL | Request) => {
      if (typeof url === 'string' && url.includes('challenges.cloudflare.com')) {
        return new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    try {
      const devId = crypto.randomUUID();
      const req = makeRequest({
        kind: 'out',
        lat: 0.3536,
        lng: 32.6128,
        loc_precision: 'gps',
        device_id: devId,
        turnstile_token: 'invalid-cf-token',
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('challenge_failed');
    } finally {
      if (origSecret) process.env.TURNSTILE_SECRET = origSecret;
      else delete process.env.TURNSTILE_SECRET;
    }
  });

  it('database insert failure -> 500 server_error', async () => {
    const origInsert = store.insertReport;
    store.insertReport = vi.fn().mockRejectedValue(new Error('Connection to database timed out'));

    try {
      const devId = crypto.randomUUID();
      const req = makeRequest({
        kind: 'out',
        lat: 0.3536,
        lng: 32.6128,
        loc_precision: 'gps',
        device_id: devId,
      });

      const res = await POST(req);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe('server_error');
      expect(data.details).toContain('Connection to database timed out');
    } finally {
      store.insertReport = origInsert;
    }
  });

  it('blocked device -> 201 but nothing stored', async () => {
    const devId = crypto.randomUUID();
    const devHash = hashDeviceId(devId);
    store.blockDevice(devHash);

    const req = makeRequest({
      kind: 'out',
      lat: 0.3536,
      lng: 32.6128,
      loc_precision: 'gps',
      device_id: devId,
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.ok).toBe(true);

    // Verify nothing was stored
    const reports = await store.reportsSince('1970-01-01');
    expect(reports.length).toBe(0);
  });

  it('in production with missing Supabase keys -> 500 server_misconfigured', async () => {
    const origEnv = process.env.NODE_ENV;
    const origUrl = process.env.SUPABASE_URL;
    const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const devId = crypto.randomUUID();
      const req = makeRequest({
        kind: 'out',
        lat: 0.3536,
        lng: 32.6128,
        loc_precision: 'gps',
        device_id: devId,
      });

      const res = await POST(req);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe('server_misconfigured');
      expect(data.message).toContain('Database misconfigured');
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = origEnv;
      if (origUrl) process.env.SUPABASE_URL = origUrl;
      if (origKey) process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
    }
  });

  it('GET /api/map in production with missing Supabase keys -> 500 server_misconfigured', async () => {
    const { GET } = await import('../app/api/map/route');
    const origEnv = process.env.NODE_ENV;
    const origUrl = process.env.SUPABASE_URL;
    const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const res = await GET();
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe('server_misconfigured');
      expect(data.message).toContain('Database misconfigured');
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = origEnv;
      if (origUrl) process.env.SUPABASE_URL = origUrl;
      if (origKey) process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
    }
  });
});
