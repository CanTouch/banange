# Banange: Community Power Outage Map for Uganda

**Banange** is a community-driven map of power outages across Uganda. Anyone in Uganda can tap "Power is out here" or "Power is back" without creating an account. Reports are aggregated to a ~550m grid to protect privacy. A public night-sky themed map displays where power is out, whether confirmed by multiple nearby devices, duration of outages, and weekly outage rankings by area.

Tagline: *"UEDCL, eehh?? Where's the power?"*  
Production URL: [https://banange.kuppelabs.com](https://banange.kuppelabs.com)

---

## Quick Start

### 1. Run in DEV MODE (zero setup)
If `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is not provided, Banange automatically runs in **DEV MODE** using an in-memory store and displays a visible `DEV MODE` badge.

```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Run Tests
```bash
npm test
```
Runs the full Vitest suite covering grid cells, state machine transitions, area searches, i18n key parity, and API route validation.

### 3. Build Areas Data
```bash
npm run build:areas
```
Downloads and extracts Uganda GeoNames data from `download.geonames.org`, filters districts, towns, and Greater Kampala places, and outputs `data/areas.json`. If offline, it gracefully falls back to `data/areas.starter.json`.

### 4. Generate Images & Favicons
```bash
npm run make:images
```
Generates `public/favicon.svg`, `public/icon-192.png`, `public/icon-512.png`, and `public/og.png` using `sharp`.

### 5. Build for Production
```bash
npm run build
```

---

## Environment Variables

| Variable | Description | Required? |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Site URL (default: `https://banange.kuppelabs.com`) | Optional |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Contact email displayed in About modal | Optional |
| `SUPABASE_URL` | Supabase project URL (if absent -> DEV MODE) | Optional locally |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role secret (server-side only) | Server only |
| `DEVICE_SALT` | Secret salt for hashing device IDs | Server only (falls back to `dev-salt`) |
| `TURNSTILE_SECRET` | Cloudflare Turnstile server secret | Optional (enables bot challenge if set) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`| Cloudflare Turnstile public site key | Optional |

See `.env.example` for reference.

---

## Human Steps to Go Live

1. **Create Supabase Project:**
   - Create a project on [supabase.com](https://supabase.com).
   - In the SQL Editor, paste and execute `supabase/migrations/001_init.sql`.
   - Copy the Project URL and Service Role secret (Project Settings > API).
2. **Configure Environment Variables:**
   - Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CONTACT_EMAIL` in Vercel (Production & Preview) and `.env.local`.
   - Generate `DEVICE_SALT` using `openssl rand -hex 32` and set it in Vercel.
3. **Deploy to Vercel:**
   - Push repository to GitHub.
   - Import into Vercel and trigger deployment.
4. **Set Custom Domain:**
   - In Vercel > Project Settings > Domains, add `banange.kuppelabs.com`.
   - Configure the CNAME DNS record shown by Vercel with your DNS provider.
5. **Enable Analytics:**
   - Enable Vercel Web Analytics in the project dashboard.
6. **Optional Bot Challenge:**
   - Create a Turnstile widget on Cloudflare and add `TURNSTILE_SECRET` & `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.

---

## Admin SQL

Run these queries in the Supabase SQL editor:

```sql
-- Flag all reports from a spamming device:
update reports set flagged = true where device_hash = '<hash>';

-- Block a malicious device:
insert into blocked_devices (device_hash, reason) values ('<hash>', 'spam');

-- Identify top reporting devices in the last 24 hours:
select device_hash, count(*) from reports where created_at > now() - interval '24 hours' group by 1 order by 2 desc limit 20;

-- Clean up reports older than 180 days:
delete from reports where created_at < now() - interval '180 days';
```

---

## Decisions Made

1. **Dev Mode Memory Store:** Used global singleton state for `MemoryStore` so hot reloads during development preserve in-memory outage reports.
2. **Area Search Ranking:** Prefix matches are sorted by shorter name length first (e.g. "Ntinda" before "Ntungamo" on query "nt"), followed by population and administrative type (districts and towns prioritized over local places).
3. **MapLibre ESM Integration:** Utilized namespace import for MapLibre GL to ensure full compatibility with modern ESM module resolution and Next.js Turbopack compiler.
4. **Confirmation Window & Neighborhood:** Confirmation evaluates distinct devices across the 3x3 cell neighborhood within a 30-minute window. Confirmed outages require at least 2 "back" reports to restore.

---

## Known Issues

1. **Luganda Translations:** Luganda strings in `messages/lg.json` are draft translations marked with `"_review": true` and require native speaker review before commercial promotion.
2. **Vercel Hobby Plan:** Vercel Hobby accounts are non-commercial only; ensure proper plan tier is chosen if monetized.
