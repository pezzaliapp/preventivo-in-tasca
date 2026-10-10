/* Contrasti WCAG AA dei token, in tema chiaro e scuro. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RADICE } from './aiuti.js';

const css = fs.readFileSync(path.join(RADICE, 'css/tokens.css'), 'utf8');
const leggiBlocco = testo => Object.fromEntries([...testo.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map(m => [m[1], m[2]]));
const chiaro = leggiBlocco(css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)')));
const scuro = Object.assign({}, chiaro, leggiBlocco(css.slice(css.indexOf(':root[data-theme="dark"]'))));

function luminanza(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export const contrasto = (a, b) => { const [x, y] = [luminanza(a), luminanza(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [testo, sfondo, minimo]: 4.5 per il testo, 3 per bordi e indicatori
const COPPIE = [
  ['ink', 'paper', 4.5], ['ink', 'card', 4.5], ['ink', 'field', 4.5], ['muted', 'paper', 4.5], ['muted', 'card', 4.5],
  ['on-accent', 'accent', 4.5], ['on-accent', 'accent-press', 4.5], ['ink', 'accent-soft', 4.5],
  ['danger', 'card', 4.5], ['danger', 'danger-soft', 4.5], ['ok', 'ok-soft', 4.5], ['warn', 'warn-soft', 4.5], ['info', 'info-soft', 4.5],
  ['on-bar', 'bar', 4.5], ['on-bar-muted', 'bar', 4.5], ['accent', 'bar', 3],
  ['line-strong', 'card', 3], ['line-strong', 'field', 3], ['focus', 'paper', 3], ['focus', 'card', 3]
];

for (const [nome, t] of [['chiaro', chiaro], ['scuro', scuro]]) {
  test(`contrasti AA in tema ${nome}`, () => {
    for (const [a, b, min] of COPPIE) {
      assert.ok(t[a] && t[b], `token mancante: ${a} o ${b}`);
      const c = contrasto(t[a], t[b]);
      assert.ok(c >= min, `${a} su ${b}: ${c.toFixed(2)} < ${min}`);
    }
  });
}

test('il tema scuro è uguale nei due blocchi (automatico e scelto a mano)', () => {
  const auto = leggiBlocco(css.slice(css.indexOf('@media (prefers-color-scheme: dark)'), css.indexOf(':root[data-theme="dark"]')));
  const manuale = leggiBlocco(css.slice(css.indexOf(':root[data-theme="dark"]')));
  assert.deepEqual(auto, manuale);
});
