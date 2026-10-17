import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const starterPath = path.join(dataDir, 'areas.starter.json');
const outputPath = path.join(dataDir, 'areas.json');

async function fallback() {
  console.warn('Falling back to data/areas.starter.json...');
  try {
    fs.copyFileSync(starterPath, outputPath);
    console.log('Copied areas.starter.json to areas.json');
  } catch (err) {
    console.error('Failed to copy starter file:', err);
  }
}

async function run() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const tmpZip = path.join(dataDir, 'UG.zip');
  const tmpTxt = path.join(dataDir, 'UG.txt');

  try {
    console.log('Downloading GeoNames UG.zip...');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch('https://download.geonames.org/export/dump/UG.zip', {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(tmpZip, buffer);

    console.log('Unzipping UG.zip...');
    try {
      execSync(`unzip -o -q "${tmpZip}" UG.txt -d "${dataDir}"`);
    } catch {
      // try python or tar/unzip
      execSync(`python3 -m zipfile -e "${tmpZip}" "${dataDir}"`);
    }

    if (!fs.existsSync(tmpTxt)) {
      throw new Error('UG.txt was not extracted');
    }

    console.log('Parsing UG.txt...');
    const content = fs.readFileSync(tmpTxt, 'utf8');
    const lines = content.split('\n');

    const areas = [];
    const seen = new Set();

    for (const line of lines) {
      if (!line.trim()) continue;
      const cols = line.split('\t');
      if (cols.length < 15) continue;

      const rawName = cols[1];
      const lat = parseFloat(cols[4]);
      const lng = parseFloat(cols[5]);
      const featureClass = cols[6];
      const featureCode = cols[7];
      const pop = parseInt(cols[14], 10) || 0;

      if (isNaN(lat) || isNaN(lng)) continue;

      let keep = false;
      let type = 'place';

      if (featureCode === 'ADM2' || featureCode === 'ADM1') {
        keep = true;
        type = 'district';
      } else if (['PPLC', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4'].includes(featureCode)) {
        keep = true;
        type = 'town';
      } else if (featureClass === 'P' && pop >= 5000) {
        keep = true;
        type = 'town';
      } else if (featureClass === 'P' && lat >= 0.15 && lat <= 0.5 && lng >= 32.4 && lng <= 32.8) {
        keep = true;
        type = 'place';
      }

      if (!keep) continue;

      let name = rawName.trim();
      if (featureCode === 'ADM2') {
        name = name.replace(/\s+District$/i, '').trim();
      }

      if (name.length < 3) continue;

      const dedupeKey = `${name.toLowerCase()}_${lat.toFixed(2)}_${lng.toFixed(2)}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      areas.push({
        name,
        lat: Number(lat.toFixed(4)),
        lng: Number(lng.toFixed(4)),
        type,
        pop,
      });
    }

    // Sort by population descending
    areas.sort((a, b) => b.pop - a.pop);
    const sliced = areas.slice(0, 4000);

    // Merge in any starter areas that might be missing or specific to Kampala
    const starterData = JSON.parse(fs.readFileSync(starterPath, 'utf8'));
    for (const item of starterData) {
      const dedupeKey = `${item.name.toLowerCase()}_${item.lat.toFixed(2)}_${item.lng.toFixed(2)}`;
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        sliced.push(item);
      }
    }

    fs.writeFileSync(outputPath, JSON.stringify(sliced, null, 2), 'utf8');
    console.log(`Saved ${sliced.length} areas to data/areas.json`);

    // Clean up temp files
    try {
      if (fs.existsSync(tmpZip)) fs.unlinkSync(tmpZip);
      if (fs.existsSync(tmpTxt)) fs.unlinkSync(tmpTxt);
    } catch {
      // ignore
    }
  } catch (err) {
    console.warn('GeoNames fetch/build failed:', err.message);
    await fallback();
  }
}

run();
