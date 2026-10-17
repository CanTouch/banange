import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/report/route';
import { getStore, MemoryStore } from '../lib/store';
import { hashDeviceId } from '../lib/device';

describe('POST /api/report handler', () => {
  const store = getStore() as MemoryStore;

  beforeEach(() => {
    store.reset();
  });

  function makeRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost:3000/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('valid report -> 201', async () => {
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
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.cell_id).toBeDefined();
    expect(data.cell_lat).toBeDefined();
    expect(data.cell_lng).toBeDefined();
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

  it('second identical report within 10 min -> 429', async () => {
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
  });

  it('21st report in a day -> 429', async () => {
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
});
