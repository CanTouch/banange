import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  parseUedclAlertsHtml,
  parseUedclAlertsHtmlWithStats,
  mapUedclStatus,
  cleanAreaName,
  parseAreaNames,
  computeUedclSourceKey,
  parseKampalaDateToIso,
} from '../lib/uedcl';

describe('UEDCL Parser', () => {
  it('cleans area names properly', () => {
    expect(cleanAreaName('Part Of Kiwanga')).toBe('Kiwanga');
    expect(cleanAreaName('Parts Of Nagulu')).toBe('Nagulu');
    expect(cleanAreaName('Najjera1')).toBe('Najjera1');
    expect(cleanAreaName(' Najjera 2 ')).toBe('Najjera 2');
    expect(cleanAreaName('Muduma.')).toBe('Muduma');
  });

  it('parses messy area text with space before/after comma and trailing commas', () => {
    const raw = 'Viseki Millers, Bulenga Kikaaya, Bulenga Gogonya, Bulenga Tc , Nankuwadde Tc ,Nankuwadde Mpawo, Kireka Bbira, Bulenga Musoke Rd, Kalambi, Kiwuumu, Bulaga Tc, Buloba Tc, Buloba Kapeeka, Buyara Tc, Bujjuko,Muduma.\n';
    const parsed = parseAreaNames(raw);
    expect(parsed).toEqual([
      'Viseki Millers',
      'Bulenga Kikaaya',
      'Bulenga Gogonya',
      'Bulenga Tc',
      'Nankuwadde Tc',
      'Nankuwadde Mpawo',
      'Kireka Bbira',
      'Bulenga Musoke Rd',
      'Kalambi',
      'Kiwuumu',
      'Bulaga Tc',
      'Buloba Tc',
      'Buloba Kapeeka',
      'Buyara Tc',
      'Bujjuko',
      'Muduma',
    ]);
  });

  it('maps statuses correctly according to specification (including Completed -> restored)', () => {
    expect(mapUedclStatus('Ongoing')).toEqual({ status: 'active', isUnknown: false });
    expect(mapUedclStatus('Feeder Partly In')).toEqual({ status: 'partial', isUnknown: false });
    expect(mapUedclStatus('Restored')).toEqual({ status: 'restored', isUnknown: false });
    expect(mapUedclStatus('Completed')).toEqual({ status: 'restored', isUnknown: false });
    expect(mapUedclStatus('Unknown Status 123')).toEqual({ status: 'other', isUnknown: true });
  });

  it('correctly handles Kampala timezone (+03:00) and returns null on bad dates', () => {
    const iso = parseKampalaDateToIso('2026-10-20 06:51');
    expect(iso).toBe('2026-10-20T06:51:00+03:00');

    expect(parseKampalaDateToIso('invalid-date')).toBeNull();
    expect(parseKampalaDateToIso('')).toBeNull();
    expect(parseKampalaDateToIso('2026-99-99 99:99')).toBeNull();
  });

  it('skips rows with bad dates and reports skipped_bad_date', () => {
    const badDateHtml = `
      <table class="custom-outage-table">
        <tr><th>Date</th><th>District</th><th>Status</th><th>Affected Areas</th></tr>
        <tr><td>Not A Date</td><td>BANDA</td><td>Ongoing</td><td>Area 1</td></tr>
        <tr><td>2026-10-20 06:51</td><td>BANDA</td><td>Ongoing</td><td>Area 2</td></tr>
      </table>
    `;
    const res = parseUedclAlertsHtmlWithStats(badDateHtml);
    expect(res.skipped_bad_date).toBe(1);
    expect(res.alerts.length).toBe(1);
    expect(res.alerts[0].published_at).toBe('2026-10-20T06:51:00+03:00');
  });

  it('computes stable and deterministic source_key across runs', () => {
    const key1 = computeUedclSourceKey(
      '2026-10-20T06:51:00+03:00',
      'BANDA',
      'ntinda,kiwatule,mogas,najjera1,najjera 2,kungu,buwate,kyanja'
    );
    const key2 = computeUedclSourceKey(
      '2026-10-20T06:51:00+03:00',
      'BANDA',
      'ntinda,kiwatule,mogas,najjera1,najjera 2,kungu,buwate,kyanja'
    );
    expect(key1).toBe(key2);
    expect(key1).toMatch(/^[a-f0-9]{40}$/);
  });

  it('parses real fixture file and matches row counts and sample rows', () => {
    const fixtureHtml = fs.readFileSync(
      path.join(__dirname, 'fixtures/uedcl-outage-alerts.html'),
      'utf8'
    );
    const alerts = parseUedclAlertsHtml(fixtureHtml);

    expect(alerts.length).toBe(42);

    // Test specific required real row 1:
    // "2026-10-20 06:51 | BANDA | Ongoing | Ntinda, Kiwatule, Mogas, Najjera1, Najjera 2, Kungu, Buwate, Kyanja"
    const row1 = alerts.find(
      (a) =>
        a.published_at === '2026-10-20T06:51:00+03:00' &&
        a.service_area === 'BANDA' &&
        a.areas.includes('Najjera1')
    );
    expect(row1).toBeDefined();
    expect(row1?.status).toBe('active');
    expect(row1?.status_raw).toBe('Ongoing');
    expect(row1?.areas).toEqual([
      'Ntinda',
      'Kiwatule',
      'Mogas',
      'Najjera1',
      'Najjera 2',
      'Kungu',
      'Buwate',
      'Kyanja',
    ]);

    // Test specific required real row 2:
    // "2026-10-20 06:21 | BANDA | Feeder Partly In | Kyaliwajjala,Namugongo,Sonde"
    const simulatedHtml = `
      <table class="custom-outage-table">
        <tr><th>Date</th><th>District</th><th>Status</th><th>Affected Areas</th></tr>
        <tr>
          <td>2026-10-20 06:21</td>
          <td>BANDA</td>
          <td>Feeder Partly In</td>
          <td>Kyaliwajjala,Namugongo,Sonde</td>
        </tr>
      </table>
    `;
    const simulatedAlerts = parseUedclAlertsHtml(simulatedHtml);
    expect(simulatedAlerts.length).toBe(1);
    expect(simulatedAlerts[0].published_at).toBe('2026-10-20T06:21:00+03:00');
    expect(simulatedAlerts[0].service_area).toBe('BANDA');
    expect(simulatedAlerts[0].status).toBe('partial');
    expect(simulatedAlerts[0].status_raw).toBe('Feeder Partly In');
    expect(simulatedAlerts[0].areas).toEqual(['Kyaliwajjala', 'Namugongo', 'Sonde']);

    // Check Completed row in fixture is mapped to restored
    const completedAlert = alerts.find((a) => a.status_raw === 'Completed');
    expect(completedAlert).toBeDefined();
    expect(completedAlert?.status).toBe('restored');
  });

  it('safely handles empty page or missing table', () => {
    expect(parseUedclAlertsHtml('')).toEqual([]);
    expect(parseUedclAlertsHtml('<html><body>No table</body></html>')).toEqual([]);
  });
});
