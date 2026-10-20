import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Load .env.local
const envLocalPath = path.join(rootDir, '.env.local');
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"](.*)['"]$/, '$1');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

// 2. Load places cache
const placesPath = path.join(rootDir, 'data', 'places.osm.json');
if (!fs.existsSync(placesPath)) {
  console.error('data/places.osm.json not found! Run scripts/import-osm-places.mjs first.');
  process.exit(1);
}
const places = JSON.parse(fs.readFileSync(placesPath, 'utf8'));

// 3. Normalization & Matching Logic
export function normalizePlaceName(name) {
  if (!name) return '';
  let s = name.toLowerCase().trim();
  s = s.replace(/^parts?\s+of\s+/i, '');
  s = s.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'’]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  const trailingRegex = /\s+(?:tc|town\s+council|town|trading\s+centr[ec]|rd|road|ltd)$/i;
  while (trailingRegex.test(s)) {
    s = s.replace(trailingRegex, '').trim();
  }
  return s;
}

const COMPANY_REGEX = /\b(?:ltd|limited|industries|industry|corporation|factory|factories|school|schools|hospital|hospitals|university|universities)\b/i;

export function isCompanyName(name) {
  return COMPANY_REGEX.test(name);
}

function haversineKm(coord1, coord2) {
  const R = 6371;
  const dLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const dLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1.lat * Math.PI) / 180) *
      Math.cos((coord2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Build index
const placeIndex = new Map();
for (const p of places) {
  const norm = p.normalized_name;
  if (!norm) continue;
  const list = placeIndex.get(norm) || [];
  list.push(p);
  placeIndex.set(norm, list);
}

export function matchNoticeAreas(areas, placeLookup) {
  const areaCandidatesList = [];

  for (const rawArea of areas) {
    if (isCompanyName(rawArea)) {
      areaCandidatesList.push(null);
      continue;
    }

    const norm = normalizePlaceName(rawArea);
    if (!norm) {
      areaCandidatesList.push(null);
      continue;
    }

    const tier1 = placeLookup.get(norm) || [];
    if (tier1.length > 0) {
      areaCandidatesList.push({
        raw: rawArea,
        normalized: norm,
        candidates: tier1,
        tier: 1,
      });
      continue;
    }

    const firstWord = norm.split(' ')[0];
    if (firstWord && firstWord.length >= 5) {
      const tier2 = placeLookup.get(firstWord) || [];
      if (tier2.length > 0) {
        areaCandidatesList.push({
          raw: rawArea,
          normalized: norm,
          candidates: tier2,
          tier: 2,
        });
        continue;
      }
    }

    areaCandidatesList.push(null);
  }

  // Anchor = centroid of unambiguous tier-1 matches
  const unambiguousTier1 = [];
  for (const item of areaCandidatesList) {
    if (item && item.tier === 1 && item.candidates.length === 1) {
      unambiguousTier1.push(item.candidates[0]);
    }
  }

  let anchor = null;
  if (unambiguousTier1.length > 0) {
    const sumLat = unambiguousTier1.reduce((sum, p) => sum + p.lat, 0);
    const sumLng = unambiguousTier1.reduce((sum, p) => sum + p.lng, 0);
    anchor = {
      lat: sumLat / unambiguousTier1.length,
      lng: sumLng / unambiguousTier1.length,
    };
  }

  const matched = [];
  const unplaced = [];
  const seenPlaces = new Set();

  for (let i = 0; i < areas.length; i++) {
    const rawArea = areas[i];
    const item = areaCandidatesList[i];

    if (!item) {
      unplaced.push(rawArea);
      continue;
    }

    let chosen = null;
    let distKm = null;

    if (item.candidates.length === 1) {
      const cand = item.candidates[0];
      if (anchor) {
        distKm = haversineKm({ lat: cand.lat, lng: cand.lng }, anchor);
        if (distKm <= 40) {
          chosen = cand;
        }
      }
    } else if (item.candidates.length > 1) {
      if (anchor) {
        let nearestDist = Infinity;
        let nearestCand = null;
        for (const cand of item.candidates) {
          const d = haversineKm({ lat: cand.lat, lng: cand.lng }, anchor);
          if (d < nearestDist) {
            nearestDist = d;
            nearestCand = cand;
          }
        }
        if (nearestCand && nearestDist <= 40) {
          chosen = nearestCand;
          distKm = nearestDist;
        }
      }
    }

    if (chosen) {
      const dedupeKey = `${chosen.name}_${chosen.lat.toFixed(4)}_${chosen.lng.toFixed(4)}`;
      if (!seenPlaces.has(dedupeKey)) {
        seenPlaces.add(dedupeKey);
        matched.push({
          listed_name: rawArea,
          matched_name: chosen.name,
          district: chosen.district || 'Unknown',
          lat: chosen.lat,
          lng: chosen.lng,
          tier: item.tier,
          distance_to_anchor_km: distKm !== null ? Number(distKm.toFixed(1)) : null,
        });
      }
    } else {
      unplaced.push(rawArea);
    }
  }

  return { matched, unplaced, anchor };
}

async function run() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cleanUrl = supabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  const supabase = createClient(cleanUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: alerts } = await supabase
    .from('official_alerts')
    .select('*')
    .order('published_at', { ascending: false });

  const now = new Date();
  const nonStaleAlerts = (alerts || []).filter((a) => {
    const ageHours = (now.getTime() - new Date(a.published_at).getTime()) / (1000 * 3600);
    return (a.status === 'active' || a.status === 'partial') && ageHours <= 24;
  });

  console.log(`Analyzing ${nonStaleAlerts.length} non-stale active/partial notices...\n`);

  let placedNoticesCount = 0;
  let totalListedAreas = 0;
  let totalPlacedAreas = 0;
  const allUnplacedNames = [];
  const allMatches = [];

  for (const alert of nonStaleAlerts) {
    const { matched, unplaced } = matchNoticeAreas(alert.areas, placeIndex);
    totalListedAreas += alert.areas.length;
    totalPlacedAreas += matched.length;
    if (matched.length > 0) {
      placedNoticesCount++;
    }
    allUnplacedNames.push(...unplaced);
    allMatches.push(...matched);
  }

  // Old matching logic for BEFORE comparison
  const customAreasPath = path.join(rootDir, 'data', 'areas.custom.json');
  const starterAreasPath = path.join(rootDir, 'data', 'areas.starter.json');
  const areasPath = path.join(rootDir, 'data', 'areas.json');
  let oldBase = [];
  if (fs.existsSync(areasPath)) oldBase = JSON.parse(fs.readFileSync(areasPath, 'utf8'));
  else if (fs.existsSync(starterAreasPath)) oldBase = JSON.parse(fs.readFileSync(starterAreasPath, 'utf8'));
  const oldCustom = fs.existsSync(customAreasPath) ? JSON.parse(fs.readFileSync(customAreasPath, 'utf8')) : [];
  
  const oldPlaceMap = new Map();
  function oldNormalize(name) {
    let s = name.toLowerCase().trim();
    s = s.replace(/^(?:parts?\s+of\s+)/i, '');
    s = s.replace(/\s+(?:tc|t\/c|town|village|estate|rd|road|hill|quarters|market|substation)$/i, '');
    return s.trim();
  }
  for (const item of oldCustom) {
    const rawKey = item.name.toLowerCase().trim();
    if (!oldPlaceMap.has(rawKey)) oldPlaceMap.set(rawKey, item);
    const normKey = oldNormalize(item.name);
    if (!oldPlaceMap.has(normKey)) oldPlaceMap.set(normKey, item);
  }
  for (const item of oldBase) {
    const rawKey = item.name.toLowerCase().trim();
    if (!oldPlaceMap.has(rawKey)) oldPlaceMap.set(rawKey, item);
    const normKey = oldNormalize(item.name);
    if (!oldPlaceMap.has(normKey)) oldPlaceMap.set(normKey, item);
  }

  function oldMatchAreas(areas) {
    const matched = [];
    const seen = new Set();
    for (const a of areas) {
      const rawKey = a.toLowerCase().trim();
      let found = oldPlaceMap.get(rawKey);
      if (!found) {
        const normKey = oldNormalize(a);
        found = oldPlaceMap.get(normKey);
      }
      if (found) {
        const dedupe = `${found.name}_${found.lat}_${found.lng}`;
        if (!seen.has(dedupe)) {
          seen.add(dedupe);
          matched.push(found);
        }
      }
    }
    return matched;
  }

  let beforePlacedNotices = 0;
  let beforePlacedAreas = 0;
  for (const alert of nonStaleAlerts) {
    const oldM = oldMatchAreas(alert.areas);
    if (oldM.length > 0) beforePlacedNotices++;
    beforePlacedAreas += oldM.length;
  }

  console.log('=== Locate Rates BEFORE vs AFTER (Non-stale notices only) ===');
  console.log(`Notice-level locate rate:`);
  console.log(`  BEFORE: ${beforePlacedNotices} / ${nonStaleAlerts.length} (${((beforePlacedNotices / nonStaleAlerts.length) * 100).toFixed(1)}%)`);
  console.log(`  AFTER : ${placedNoticesCount} / ${nonStaleAlerts.length} (${((placedNoticesCount / nonStaleAlerts.length) * 100).toFixed(1)}%)`);
  console.log(`Area-level locate rate:`);
  console.log(`  BEFORE: ${beforePlacedAreas} / ${totalListedAreas} (${((beforePlacedAreas / totalListedAreas) * 100).toFixed(1)}%)`);
  console.log(`  AFTER : ${totalPlacedAreas} / ${totalListedAreas} (${((totalPlacedAreas / totalListedAreas) * 100).toFixed(1)}%)`);

  // Unplaced frequency count
  const unplacedFreq = new Map();
  for (const name of allUnplacedNames) {
    const clean = name.trim();
    if (!clean) continue;
    unplacedFreq.set(clean, (unplacedFreq.get(clean) || 0) + 1);
  }
  const sortedUnplaced = Array.from(unplacedFreq.entries()).sort((a, b) => b[1] - a[1]);

  console.log('\n=== 30 Most Frequent Unplaced Names ===');
  sortedUnplaced.slice(0, 30).forEach(([name, count], i) => {
    console.log(`  ${(i + 1).toString().padStart(2)}. ${name.padEnd(35)} (count: ${count})`);
  });

  console.log('\n=== 15 Randomly Chosen Matches ===');
  // Shuffle matches with seeded/consistent order
  const shuffled = [...allMatches].sort(() => 0.5 - Math.random());
  shuffled.slice(0, 15).forEach((m, i) => {
    console.log(`  ${(i + 1).toString().padStart(2)}. "${m.listed_name}" -> ${m.matched_name}, ${m.district}, ${m.lat}, ${m.lng}, tier ${m.tier}`);
  });
}

run().catch(console.error);
