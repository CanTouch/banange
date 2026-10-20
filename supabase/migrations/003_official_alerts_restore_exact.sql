-- Add first_seen_status and restored_time_exact to official_alerts
alter table public.official_alerts
  add column if not exists first_seen_status text,
  add column if not exists restored_time_exact boolean not null default false;
