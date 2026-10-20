-- Official outage alerts ingested from UEDCL
create table if not exists public.official_alerts (
  id                uuid primary key default gen_random_uuid(),
  source            text not null default 'uedcl',
  source_key        text not null unique,
  published_at      timestamptz not null,
  service_area      text not null,
  status_raw        text not null,
  status            text not null check (status in ('active', 'partial', 'restored', 'other')),
  areas_raw         text not null,
  areas             text[] not null default '{}',
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  restored_seen_at  timestamptz,
  dropped_at        timestamptz
);

create index if not exists official_alerts_source_key_idx on public.official_alerts (source_key);
create index if not exists official_alerts_published_idx on public.official_alerts (published_at desc);
create index if not exists official_alerts_status_idx on public.official_alerts (status);

-- Status change event history
create table if not exists public.official_alert_events (
  id                uuid primary key default gen_random_uuid(),
  alert_id          uuid not null references public.official_alerts (id) on delete cascade,
  status_raw        text not null,
  seen_at           timestamptz not null default now()
);

create index if not exists official_alert_events_alert_id_idx on public.official_alert_events (alert_id, seen_at desc);

-- RLS: Enabled, no public policies (server-side service role access only)
alter table public.official_alerts enable row level security;
alter table public.official_alert_events enable row level security;
revoke all on public.official_alerts from anon, authenticated;
revoke all on public.official_alert_events from anon, authenticated;
