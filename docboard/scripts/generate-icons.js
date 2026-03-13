#!/usr/bin/env node
// Run on VPS where sharp is available:
// cd /var/www/dokterdibya/docboard && node scripts/generate-icons.js
const path = require('path');

async function generate() {
  const sharp = require('sharp');
  const svg = `<svg width='512' height='512' viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'>
    <rect width='512' height='512' rx='96' fill='#0F172A'/>
    <rect x='128' y='149' width='75' height='213' rx='16' fill='#3B82F6'/>
    <rect x='128' y='149' width='256' height='75' rx='16' fill='#3B82F6'/>
    <circle cx='331' cy='309' r='75' stroke='#3B82F6' stroke-width='30' fill='none'/>
  </svg>`;

  const buf = Buffer.from(svg);
  const outDir = path.join(__dirname, '../public/icons');

  await sharp(buf).resize(512, 512).png().toFile(path.join(outDir, 'icon-512.png'));
  await sharp(buf).resize(192, 192).png().toFile(path.join(outDir, 'icon-192.png'));
  console.log('Icons generated in', outDir);
}

generate().catch(console.error);
