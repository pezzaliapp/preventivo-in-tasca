/* Script del gasolio (Python): i test veri sono in tests/gasolio_script.py, con pagine di esempio e senza rete. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { RADICE } from './aiuti.js';

test('aggiorna_gasolio.py: catena di fonti, data, fonte e verifica serale', () => {
  const r = spawnSync('python3', [path.join(RADICE, 'tests', 'gasolio_script.py')], { encoding: 'utf8' });
  assert.equal(r.error, undefined, 'python3 non trovato');
  assert.equal(r.status, 0, r.stderr);
});
