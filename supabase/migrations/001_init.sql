create extension if not exists pgcrypto;

create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  kind          text not null check (kind in ('out','back')),
  cell_id       text not null,
  cell_lat      double precision not null,
  cell_lng      double precision not null,
  loc_precision text not null check (loc_precision in ('gps','pin','area')),
  area_name     text,
  device_hash   text not null,
  flagged       boolean not null default false
);
create index reports_cell_time_idx   on public.reports (cell_id, created_at desc);
create index reports_device_kind_idx on public.reports (device_hash, kind, created_at desc);
create index reports_time_idx        on public.reports (created_at desc);

create table public.blocked_devices (
  device_hash text primary key,
  reason      text,
  created_at  timestamptz not null default now()
);

alter table public.reports enable row level security;
alter table public.blocked_devices enable row level security;
revoke all on public.reports from anon, authenticated;
revoke all on public.blocked_devices from anon, authenticated;
-- no policies on purpose: only the service role (server) can read/write
