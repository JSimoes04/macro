// Gera os ícones e ecrãs de arranque a partir do mesmo desenho.
// Uso: node scripts/generate-icons.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const BG = '#111110';
const SEGMENTS = ['#3987e5', '#d95926', '#199e70']; // proteína, gordura, hidratos
const R = 148;
const STROKE = 56;
const CIRC = 2 * Math.PI * R;
const GAP = 24 + STROKE; // as pontas redondas comem metade do traço de cada lado

function ring() {
  const dash = CIRC / SEGMENTS.length - GAP;
  return SEGMENTS.map((color, i) => {
    const offset = -i * (dash + GAP);
    return `<circle cx="256" cy="256" r="${R}" stroke="${color}" stroke-dasharray="${dash.toFixed(2)} ${CIRC.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"/>`;
  }).join('');
}

function icon({ rounded }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="${BG}"/>
  <g fill="none" stroke-width="${STROKE}" stroke-linecap="round" transform="rotate(-78 256 256)">${ring()}</g>
</svg>`;
}

function splash(background) {
  const w = 1170;
  const h = 2532;
  const size = 300;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${background}"/>
  <svg x="${(w - size) / 2}" y="${(h - size) / 2}" width="${size}" height="${size}" viewBox="0 0 512 512">${icon({ rounded: true }).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>
</svg>`;
}

const png = (svg, size, file) => sharp(Buffer.from(svg)).resize(size, size).png().toFile(file);

await mkdir('public/splash', { recursive: true });
await writeFile('public/favicon.svg', icon({ rounded: true }) + '\n');
await png(icon({ rounded: true }), 192, 'public/pwa-192.png');
await png(icon({ rounded: true }), 512, 'public/pwa-512.png');
await png(icon({ rounded: false }), 512, 'public/pwa-maskable-512.png');
// O iOS aplica a sua própria máscara e não aceita transparência.
await png(icon({ rounded: false }), 180, 'public/apple-touch-icon.png');
await sharp(Buffer.from(splash('#f2f2f0'))).png().toFile('public/splash/iphone-390x844-light.png');
await sharp(Buffer.from(splash('#000000'))).png().toFile('public/splash/iphone-390x844-dark.png');
console.log('Ícones gerados em public/');
