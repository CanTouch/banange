import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. favicon.svg
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#0B1020"/>
  <circle cx="16" cy="16" r="8" fill="#FF4D4D" filter="drop-shadow(0 0 4px #FF4D4D)"/>
  <circle cx="16" cy="16" r="4" fill="#FFFFFF"/>
</svg>`;
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), faviconSvg, 'utf8');

// 2. manifest.webmanifest
const manifest = {
  name: "Banange",
  short_name: "Banange",
  start_url: "/",
  display: "standalone",
  background_color: "#0B1020",
  theme_color: "#0B1020",
  icons: [
    {
      src: "/icon-192.png",
      sizes: "192x192",
      type: "image/png"
    },
    {
      src: "/icon-512.png",
      sizes: "512x512",
      type: "image/png"
    }
  ]
};
fs.writeFileSync(path.join(publicDir, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2), 'utf8');

// 3. Generate PNGs using sharp
async function generateImages() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch (err) {
    console.warn('sharp not available, skipping PNG generation:', err.message);
    return;
  }

  // Icon 512 SVG
  const icon512Svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="100" fill="#0B1020"/>
    <circle cx="256" cy="256" r="140" fill="#FF4D4D" opacity="0.3"/>
    <circle cx="256" cy="256" r="90" fill="#FF4D4D"/>
    <circle cx="256" cy="256" r="40" fill="#FFFFFF"/>
    <text x="256" y="440" font-family="sans-serif" font-weight="700" font-size="52" fill="#E8ECF5" text-anchor="middle">Banange</text>
  </svg>`;

  // Icon 192 SVG
  const icon192Svg = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
    <rect width="192" height="192" rx="40" fill="#0B1020"/>
    <circle cx="96" cy="96" r="50" fill="#FF4D4D" opacity="0.3"/>
    <circle cx="96" cy="96" r="32" fill="#FF4D4D"/>
    <circle cx="96" cy="96" r="14" fill="#FFFFFF"/>
  </svg>`;

  // OG 1200x630 SVG
  const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="#0B1020"/>
    <g opacity="0.6">
      <!-- Uganda scatter dots -->
      <circle cx="580" cy="350" r="14" fill="#FF4D4D"/>
      <circle cx="610" cy="360" r="10" fill="#FFB020"/>
      <circle cx="590" cy="380" r="8" fill="#FF4D4D"/>
      <circle cx="550" cy="330" r="12" fill="#FF4D4D"/>
      <circle cx="640" cy="330" r="16" fill="#FFB020"/>
      <circle cx="680" cy="280" r="10" fill="#FF4D4D"/>
      <circle cx="520" cy="220" r="14" fill="#FF4D4D"/>
      <circle cx="480" cy="290" r="8" fill="#FFB020"/>
      <circle cx="430" cy="420" r="10" fill="#FF4D4D"/>
      <circle cx="460" cy="460" r="14" fill="#FF4D4D"/>
    </g>
    <text x="120" y="260" font-family="system-ui, sans-serif" font-weight="800" font-size="84" fill="#E8ECF5">Banange</text>
    <text x="120" y="330" font-family="system-ui, sans-serif" font-weight="500" font-size="34" fill="#FFB020">UEDCL, eehh?? Where's the power?</text>
    <text x="120" y="400" font-family="system-ui, sans-serif" font-weight="400" font-size="24" fill="#8A94AD">Community map of power outages across Uganda</text>
    <rect x="120" y="470" width="220" height="52" rx="14" fill="#1A2442" stroke="#26325A" stroke-width="2"/>
    <text x="230" y="504" font-family="system-ui, sans-serif" font-weight="600" font-size="20" fill="#E8ECF5" text-anchor="middle">banange.kuppelabs.com</text>
  </svg>`;

  try {
    await sharp(Buffer.from(icon512Svg)).png().toFile(path.join(publicDir, 'icon-512.png'));
    await sharp(Buffer.from(icon192Svg)).png().toFile(path.join(publicDir, 'icon-192.png'));
    await sharp(Buffer.from(ogSvg)).png().toFile(path.join(publicDir, 'og.png'));
    console.log('Successfully generated public/icon-512.png, public/icon-192.png, public/og.png');
  } catch (err) {
    console.warn('sharp conversion error:', err);
  }
}

generateImages();
