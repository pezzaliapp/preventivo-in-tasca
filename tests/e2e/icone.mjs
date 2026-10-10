/*
 * Genera le icone PNG da icons/icon.svg con il Chromium già installato.
 *   node tests/e2e/icone.mjs
 * La versione "maskable" ha il disegno ridotto all'80% (zona sicura di Android).
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const svg = fs.readFileSync('icons/icon.svg', 'utf8');
const pieno = svg.replace('rx="112"', 'rx="0"');
const USCITE = [
  ['icons/icon-192.png', 192, svg, false],
  ['icons/icon-512.png', 512, svg, false],
  ['icons/apple-touch-icon.png', 180, pieno, false],
  ['icons/icon-maskable-512.png', 512, pieno, true]
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size, disegno, maskable] of USCITE) {
  const interno = maskable
    ? `<div style="width:${size}px;height:${size}px;background:#18222B;display:grid;place-items:center"><div style="width:${size * 0.8}px;height:${size * 0.8}px">${disegno.replace('<svg ', '<svg width="100%" height="100%" ')}</div></div>`
    : disegno.replace('<svg ', `<svg width="${size}" height="${size}" `);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${interno}</body></html>`);
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('scritta', file);
}
await browser.close();
