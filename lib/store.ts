import { getSupabaseServerClient } from './supabase-server';

export interface Report {
  id: string;
  created_at: string;
  kind: 'out' | 'back';
  cell_id: string;
  cell_lat: number;
  cell_lng: number;
  loc_precision: 'gps' | 'pin' | 'area';
  area_name?: string | null;
  device_hash: string;
  flagged: boolean;
}

export interface NewReport {
  id?: string;
  created_at?: string;
  kind: 'out' | 'back';
  cell_id: string;
  cell_lat: number;
  cell_lng: number;
  loc_precision: 'gps' | 'pin' | 'area';
  area_name?: string | null;
  device_hash: string;
  flagged?: boolean;
}

export interface ReportStore {
  insertReport(r: NewReport): Promise<void>;
  lastReport(deviceHash: string, kind: 'out' | 'back', sinceIso: string): Promise<boolean>;
  countReports(deviceHash: string, sinceIso: string): Promise<number>;
  isBlocked(deviceHash: string): Promise<boolean>;
  reportsSince(sinceIso: string, untilIso?: string, limit?: number): Promise<Report[]>;
  getBlockedDevices(): Promise<Set<string>>;
}

interface MemoryStoreState {
  reports: Report[];
  blocked: Set<string>;
}

declare global {
  // eslint-disable-next-line no-var
  var __banange_memory_store: MemoryStoreState | undefined;
}

function getMemoryStoreState(): MemoryStoreState {
  if (!globalThis.__banange_memory_store) {
    globalThis.__banange_memory_store = {
      reports: [],
      blocked: new Set<string>(),
    };
  }
  return globalThis.__banange_memory_store;
}

export class MemoryStore implements ReportStore {
  private get state(): MemoryStoreState {
    return getMemoryStoreState();
  }

  // Helper for tests to reset or seed
  public reset(): void {
    this.state.reports = [];
    this.state.blocked.clear();
  }

  public blockDevice(hash: string): void {
    this.state.blocked.add(hash);
  }

  async insertReport(r: NewReport): Promise<void> {
    const report: Report = {
      id: r.id || crypto.randomUUID(),
      created_at: r.created_at || new Date().toISOString(),
      kind: r.kind,
      cell_id: r.cell_id,
      cell_lat: r.cell_lat,
      cell_lng: r.cell_lng,
      loc_precision: r.loc_precision,
      area_name: r.area_name ?? null,
      device_hash: r.device_hash,
      flagged: r.flagged ?? false,
    };
    this.state.reports.push(report);
  }

  async lastReport(deviceHash: string, kind: 'out' | 'back', sinceIso: string): Promise<boolean> {
    const sinceTime = new Date(sinceIso).getTime();
    return this.state.reports.some(
      (r) =>
        r.device_hash === deviceHash &&
        r.kind === kind &&
        new Date(r.created_at).getTime() >= sinceTime
    );
  }

  async countReports(deviceHash: string, sinceIso: string): Promise<number> {
    const sinceTime = new Date(sinceIso).getTime();
    return this.state.reports.filter(
      (r) =>
        r.device_hash === deviceHash &&
        new Date(r.created_at).getTime() >= sinceTime
    ).length;
  }

  async isBlocked(deviceHash: string): Promise<boolean> {
    return this.state.blocked.has(deviceHash);
  }

  async reportsSince(sinceIso: string, untilIso?: string, limit = 20000): Promise<Report[]> {
    const sinceTime = new Date(sinceIso).getTime();
    const untilTime = untilIso ? new Date(untilIso).getTime() : Infinity;

    return this.state.reports
      .filter((r) => {
        if (r.flagged) return false;
        const t = new Date(r.created_at).getTime();
        return t >= sinceTime && t <= untilTime;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
  }

  async getBlockedDevices(): Promise<Set<string>> {
    return new Set(this.state.blocked);
  }
}

export class SupabaseStore implements ReportStore {
  async insertReport(r: NewReport): Promise<void> {
    const supabase = getSupabaseServerClient();
    if (!supabase) throw new Error('Supabase client not available');

    const { error } = await supabase.from('reports').insert({
      id: r.id,
      created_at: r.created_at,
      kind: r.kind,
      cell_id: r.cell_id,
      cell_lat: r.cell_lat,
      cell_lng: r.cell_lng,
      loc_precision: r.loc_precision,
      area_name: r.area_name ?? null,
      device_hash: r.device_hash,
      flagged: r.flagged ?? false,
    });

    if (error) throw error;
  }

  async lastReport(deviceHash: string, kind: 'out' | 'back', sinceIso: string): Promise<boolean> {
    const supabase = getSupabaseServerClient();
    if (!supabase) throw new Error('Supabase client not available');

    const { data, error } = await supabase
      .from('reports')
      .select('id')
      .eq('device_hash', deviceHash)
      .eq('kind', kind)
      .gte('created_at', sinceIso)
      .limit(1);

    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }

  async countReports(deviceHash: string, sinceIso: string): Promise<number> {
    const supabase = getSupabaseServerClient();
    if (!supabase) throw new Error('Supabase client not available');

    const { count, error } = await supabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('device_hash', deviceHash)
      .gte('created_at', sinceIso);

    if (error) throw error;
    return count ?? 0;
  }

  async isBlocked(deviceHash: string): Promise<boolean> {
    const supabase = getSupabaseServerClient();
    if (!supabase) throw new Error('Supabase client not available');

    const { data, error } = await supabase
      .from('blocked_devices')
      .select('device_hash')
      .eq('device_hash', deviceHash)
      .limit(1);

    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }

  async reportsSince(sinceIso: string, untilIso?: string, limit = 20000): Promise<Report[]> {
    const supabase = getSupabaseServerClient();
    if (!supabase) throw new Error('Supabase client not available');

    let query = supabase
      .from('reports')
      .select('*')
      .eq('flagged', false)
      .gte('created_at', sinceIso);

    if (untilIso) {
      query = query.lte('created_at', untilIso);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data as Report[]) || [];
  }

  async getBlockedDevices(): Promise<Set<string>> {
    const supabase = getSupabaseServerClient();
    if (!supabase) throw new Error('Supabase client not available');

    const { data, error } = await supabase.from('blocked_devices').select('device_hash');
    if (error) throw error;
    return new Set((data || []).map((row) => row.device_hash));
  }
}

export function isDevMode(): boolean {
  return !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
}

let storeInstance: ReportStore | null = null;

export function getStore(): ReportStore {
  if (!storeInstance) {
    if (isDevMode()) {
      storeInstance = new MemoryStore();
    } else {
      storeInstance = new SupabaseStore();
    }
  }
  return storeInstance;
}
