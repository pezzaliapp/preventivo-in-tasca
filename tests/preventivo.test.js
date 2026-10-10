/* Preventivo: sconti in cascata, totali, IVA, numerazione e testo come Listino in tasca. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { leggiJSON } from './aiuti.js';
import * as P from '../js/core/preventivo.js';

const G = leggiJSON('tests/golden/preventivo.json');

test('golden: lettura degli sconti ("30+5", virgole, %, valori non validi)', () => {
  for (const [s, atteso] of G.parse) assert.deepEqual(P.parseDisc(s), atteso, JSON.stringify(s));
});

test('golden: netti di riga e totali con IVA 22, 10, 0 e "22"', () => {
  // JSON non conserva undefined: le righe senza "disc" valgono come disc vuoto, come nell'originale
  for (const c of G.totali) {
    assert.deepEqual(P.totals(c.quote, c.vat), c.totals, JSON.stringify(c.quote.globalDisc) + ' iva ' + c.vat);
    assert.deepEqual(c.quote.items.map(it => P.lineNet(it, c.quote.globalDisc)), c.nets);
  }
});

test('golden: testo da condividere identico', () => {
  for (const c of G.testi) assert.equal(P.shareText(c.quote, c.settings), c.testo);
});

test('golden: numerazione AAAA/NNN che riparte ogni anno', () => {
  const st = { counterYear: 2025, counter: 41 };
  const anno = new Date().getFullYear(); // l'originale usava l'anno corrente
  assert.deepEqual([0, 1, 2].map(() => P.nextNumber(st, anno)), G.numeri);
  assert.equal(P.nextNumber(st, anno + 1), `${anno + 1}/001`);
});

test('golden: prezzi netti concordati del book (riga e gruppo)', () => {
  for (const c of G.netti) { const it = { ...c.prima }; P.setLineNet(it, c.net); assert.deepEqual(it, c.dopo); }
  for (const c of G.gruppi) {
    const lines = c.prezzi.map(p => ({ price: p, disc: '' }));
    P.setGroupNet(lines, c.net);
    assert.deepEqual(lines.map(l => l.disc), c.sconti);
  }
});

test('sconto di riga "0" non prende lo sconto generale (usato per il trasporto)', () => {
  const q = { globalDisc: '30', vatOn: false, items: [{ price: 100, qty: 1, disc: '' }, { price: 98, qty: 1, disc: '0' }] };
  const t = P.totals(q, 22);
  assert.equal(t.net, 70 + 98);
});

test('validità: data del preventivo più i giorni (30 se mancano)', () => {
  assert.equal(P.validoFino('2026-10-10T08:00:00Z', 30).toISOString(), '2026-11-09T08:00:00.000Z');
  assert.equal(P.validoFino('2026-10-10T08:00:00Z', '').toISOString(), '2026-11-09T08:00:00.000Z');
});

test('nota per il cliente: segue il trasporto solo se è quella predefinita', () => {
  const std = 'Prezzi IVA esclusa. Resa franco stabilimento del produttore, imballo e trasporto esclusi.';
  assert.equal(P.notaConTrasporto(std, [std], true), P.NOTA_TRASPORTO_INCLUSO);
  assert.equal(P.notaConTrasporto(P.NOTA_TRASPORTO_INCLUSO, [std], false), std);
  assert.equal(P.notaConTrasporto('Nota mia', [std], true), 'Nota mia');
  const conTr = { notes: 'Consegna esclusa, trasporto escluso.', items: [{ custom: true, name: 'Trasporto a Milano (MI), Lombardia', trasporto: {} }] };
  assert.equal(P.contraddizioni(conTr).length, 1);
  assert.deepEqual(P.contraddizioni({ notes: std, items: [] }), []);
  assert.equal(P.contraddizioni({ notes: P.NOTA_TRASPORTO_INCLUSO, items: [] }).length, 1);
  assert.deepEqual(P.contraddizioni({ notes: 'Trasporto incluso.', items: [{ custom: true, name: 'Trasporto' }] }), []);
});
