import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const input = path.join(__dirname, '../assets/images/Collection de badges de rangs.png');
const outputDir = path.join(__dirname, '../assets/images/ranks');

// Get image metadata first
const meta = await sharp(input).metadata();
console.log(`Image size: ${meta.width}x${meta.height}`);

const W = meta.width;
const H = meta.height;

// Row 1: 4 badges (Bronze, Argent, Or, Platine)
// Row 2: 3 badges (Rubis, Saphir, Diamants)
// Each badge takes ~W/4 width, rows split roughly in half

const col4W = Math.floor(W / 4); // 384px per badge in row 1
const col3W = Math.floor(W / 3); // 512px per badge in row 2
const rowH = Math.floor(H / 2);  // 512px per row

const badges = [
  // Row 1 — 4 badges
  { name: 'bronze',   left: 0,          top: 0,    width: col4W,        height: rowH },
  { name: 'silver',   left: col4W,       top: 0,    width: col4W,        height: rowH },
  { name: 'gold',     left: col4W * 2,   top: 0,    width: col4W,        height: rowH },
  { name: 'platine',  left: col4W * 3,   top: 0,    width: W - col4W*3,  height: rowH },
  // Row 2 — 3 badges
  { name: 'rubis',    left: 0,           top: rowH, width: col3W,        height: H - rowH },
  { name: 'saphir',   left: col3W,       top: rowH, width: col3W,        height: H - rowH },
  { name: 'diamant',  left: col3W * 2,   top: rowH, width: W - col3W*2,  height: H - rowH },
];

import { mkdirSync } from 'fs';
mkdirSync(outputDir, { recursive: true });

for (const b of badges) {
  const out = path.join(outputDir, `${b.name}.png`);
  await sharp(input)
    .extract({ left: b.left, top: b.top, width: b.width, height: b.height })
    .toFile(out);
  console.log(`✓ ${b.name}.png`);
}

console.log('Done!');
