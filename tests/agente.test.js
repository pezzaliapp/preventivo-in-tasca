/* Configuratore e book dell'agente: stessi risultati di Listino in tasca, su listino e book sintetici. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { leggiJSON, scriptClassico } from './aiuti.js';
import { pdfSintetico } from './fixtures/listino-sintetico.js';
import { BOOK, PREVENTIVI } from './fixtures/book-sintetico.js';
import * as L from '../js/core/listino.js';
import * as A from '../js/core/agente.js';
import { euro } from '../js/core/formato.js';

const G = leggiJSON('tests/golden/agente.json');
const parser = scriptClassico('js/listino/parser.js').ListinoParser;
const Regole = scriptClassico('js/listino/regole.js').Regole;
const Cerca = scriptClassico('js/listino/cerca.js').Cerca;
const base = JSON.stringify(await parser.parseListino(pdfSintetico()));
const J = o => JSON.parse(JSON.stringify(o));
const vista = p => ({ key: p.key, name: p.name, vehicles: p.vehicles, _power: p._power, _feat: p._feat, agentVehicles: p.agentVehicles || null, described: p.described });

function catalogo(pack) {
  const cat = JSON.parse(base);
  const byKey = L.preparaCatalogo(cat, { Regole, Cerca });
  if (pack) L.applyPack(cat, pack, Cerca);
  return { cat, byKey };
}

test('catalogo preparato come l\'originale (regole dei veicoli, alimentazione, chiavi)', () => {
  assert.deepEqual(J(catalogo(null).cat.products.map(vista)), G.prodotti);
  assert.deepEqual(J(catalogo(J(BOOK)).cat.products.map(vista)), G.prodottiBook);
});

test('configuratore: base, filtri, filtri combinati e ordinamenti per ogni veicolo e lavoro', () => {
  const { cat } = catalogo(null);
  for (const c of G.cfgCasi) {
    const cfg = { vehicle: c.vehicle, activity: c.activity, open: 'needs', sel: {}, acc: c.acc, sort: 'listino' };
    const b = L.machineBase(cat, cfg, c.acc);
    const tag = `${c.vehicle}/${c.activity}/${c.acc}`;
    assert.deepEqual(b.map(p => p.key), c.base, tag);
    assert.deepEqual(J(L.filterGroups(cat, cfg, b)), c.groups, tag);
    for (const [g, id, keys] of c.filtrati) assert.deepEqual(L.applyFilters(cat, { ...cfg, sel: { [g]: [id] } }, b).map(p => p.key), keys, `${tag} ${g}=${id}`);
    assert.deepEqual(L.applyFilters(cat, { ...cfg, sel: c.sel }, b).map(p => p.key), c.combinati, tag);
    assert.deepEqual(['listino', 'asc', 'desc'].map(s => L.sortList(b, s).map(p => p.key)), c.ordini, tag);
  }
});

test('accessori consigliati e ritagli delle figure', () => {
  const { cat } = catalogo(null);
  for (const [fid, keys] of G.accessori) assert.deepEqual(L.suggestedAccessories(cat, cat.families[fid]).map(p => p.key), keys, fid);
  for (const [key, crop] of G.ritagli) assert.deepEqual(J(L.productCrop(cat, cat.products.find(p => p.key === key))), crop, key);
});

test('postazioni: articoli per alimentazione, facoltativi, voci senza prezzo, totali', () => {
  const pack = J(BOOK);
  const { cat } = catalogo(pack);
  for (const c of G.postazioni) {
    const post = pack.postazioni.find(p => p.id === c.id);
    const opts = { power: c.power || undefined, optional: c.optional };
    const righe = J(J(A.postItems(pack, cat, post, opts)).map(r => ({ code: r.code, label: r.label, required: r.required, on: r.on, price: r.price, manual: r.manual || null, product: r.product ? r.product.key : null })));
    assert.deepEqual(righe, c.righe, c.id);
    assert.deepEqual(A.postTotal(pack, cat, post, opts), c.totale, c.id);
  }
});

test('consiglio a domande: 243 combinazioni di risposte', () => {
  for (const [ans, atteso] of G.risposte) assert.deepEqual(J(A.wizardResult(BOOK, ans)), atteso, JSON.stringify(ans));
});

test('controlli prima di inviare e prezzi concordati', () => {
  const pack = J(BOOK);
  const { cat, byKey } = catalogo(pack);
  for (const c of G.controlli) assert.deepEqual(J(A.quoteChecks({ pack, cat, byKey, quote: J(c.quote), fmt: euro })), c.checks, JSON.stringify(c.quote.items.map(i => i.code)));
  let n = 0;
  for (const c of G.prezzi) {
    const q = J(c.quote);
    A.applyPackPricing(pack, q, () => 'nuova' + (++n));
    assert.deepEqual(q.items.map(({ id, ...r }) => r), c.dopo);
  }
  assert.equal(G.controlli.length, PREVENTIVI.length);
});

test('note del book per una famiglia e disegni', () => {
  const pack = J(BOOK);
  const { cat } = catalogo(pack);
  const pfa = cat.products.filter(p => p.family === 'p7');
  const n = A.noteFamiglia(pack, pfa);
  assert.equal(n.notes[0].title, 'PFA 40');
  assert.equal(n.dws[0].id, '03c89b2a1496afb3c082');
  assert.equal(A.noteFamiglia(null, pfa), null);
  assert.equal(A.togliNota('Riga 1\nTrasporto incluso\nRiga 3', 'Trasporto incluso'), 'Riga 1\nRiga 3');
  assert.equal(A.aggiungiNota('Riga 1  ', 'Nuova'), 'Riga 1\nNuova');
});
