/* Migrazione dalle app precedenti e file di trasferimento: nulla si perde, nulla si sovrascrive. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/core/migrazione.js';

const PRED = { company: '', seller: '', vat: 22, defaultDisc: '', validity: 30, notes: 'Prezzi IVA esclusa.', counterYear: 2026, counter: 0 };

test('impostazioni: si riempie ciò che è vuoto o predefinito, non si tocca ciò che è stato scritto qui', () => {
  const attuali = { ...PRED, seller: 'Mario, 333', vat: 22, counter: 3 };
  const vecchie = { company: 'Officina Srl\nVia Roma 1', seller: 'Luigi', vat: 10, defaultDisc: '30+5', validity: 60, notes: 'Note mie', counterYear: 2026, counter: 41 };
  const u = M.unisciImpostazioni(attuali, vecchie, PRED);
  assert.equal(u.company, 'Officina Srl\nVia Roma 1');
  assert.equal(u.seller, 'Mario, 333');      // già scritto qui: resta
  assert.equal(u.vat, 10);                   // era il predefinito: prende quello importato
  assert.equal(u.defaultDisc, '30+5');
  assert.equal(u.notes, 'Note mie');
  assert.equal(u.counter, 41);               // numerazione: il contatore più avanti
  // contatore dell'anno scorso: non conta
  assert.equal(M.unisciImpostazioni({ ...PRED, counter: 5 }, { counterYear: 2025, counter: 90 }, PRED).counter, 5);
});

test('preventivi: si aggiungono quelli che mancano e si aggiornano solo se salvati dopo', () => {
  const esistenti = [{ id: 'a', savedAt: '2026-10-01', items: [] }, { id: 'b', savedAt: '2026-10-05', items: [] }];
  const importati = [{ id: 'a', savedAt: '2026-10-03', items: [] }, { id: 'b', savedAt: '2026-10-01', items: [] }, { id: 'c', savedAt: '2026-09-01', items: [] }, { id: '', items: [] }, null];
  const r = M.unisciPreventivi(esistenti, importati);
  assert.deepEqual(r.daScrivere.map(q => q.id), ['a', 'c']);
  assert.deepEqual([r.nuovi, r.aggiornati, r.uguali], [1, 1, 1]);
});

test('bozza: entra solo se quella attuale è vuota', () => {
  const piena = { items: [{ code: 'x' }] }, vuota = { items: [] };
  assert.equal(M.scegliBozza(vuota, piena), piena);
  assert.equal(M.scegliBozza(piena, { items: [{ code: 'y' }] }), null);
  assert.equal(M.scegliBozza(vuota, vuota), null);
});

test('trasporti, tema e analisi: chiavi vecchie convertite solo se mancano', () => {
  const vecchi = {
    ct_state: JSON.stringify({ cart: [{ uid: 1, qty: 2, kind: 'art', artId: 'pfa-40' }], reg: 'LOMBARDIA', prov: 'MI', opts: { ass: true } }),
    ct_adj: '5', ct_fuel: JSON.stringify({ on: true, share: 30, shareIs: 15 }), darkMode: 'true', an_divisore: '1.3'
  };
  const out = M.convertiPreferenze(vecchi, {});
  assert.equal(out.pit_trasporto.cart[0].artId, 'pfa-40');
  assert.equal(out.pit_trasporto_adj, 5);
  assert.deepEqual(out.pit_trasporto_fuel, { on: true, share: 30, shareIs: 15 });
  assert.equal(out.pit_tema, 'scuro');
  assert.equal(out.pit_an_divisore, '1.3');
  // già presenti nella nuova app: non si sovrascrivono
  assert.deepEqual(M.convertiPreferenze(vecchi, { pit_trasporto: {}, pit_trasporto_adj: 2, pit_trasporto_fuel: {}, pit_tema: 'chiaro', pit_an_divisore: '1' }), {});
  // tema chiaro nelle vecchie app (darkMode "false") e dati rotti: niente
  assert.deepEqual(M.convertiPreferenze({ darkMode: 'false', ct_state: '{rotto', ct_adj: '0' }, {}), {});
});

test('file di trasferimento: senza listino, catalogo né book; controllo del formato', () => {
  const f = M.creaFileDati({ impostazioni: PRED, preventivi: [{ id: 'a', items: [] }], bozza: { items: [] }, preferenze: { pit_tema: 'scuro' }, versioneApp: '0.7.0', creato: '2026-10-10T10:00:00Z' });
  const testo = JSON.stringify(f);
  assert.doesNotMatch(testo, /catalog|agentPack|listino|pack/i);
  const r = M.leggiFileDati(testo);
  assert.equal(r.ok, true);
  assert.equal(r.dati.preventivi.length, 1);
  assert.equal(M.leggiFileDati('ciao').ok, false);
  assert.equal(M.leggiFileDati(JSON.stringify({ formato: 'altro' })).ok, false);
  assert.match(M.leggiFileDati(JSON.stringify({ ...f, versione: 99 })).errore, /versione più nuova/);
  // solo chiavi della nuova app tra le preferenze
  const strano = M.leggiFileDati(JSON.stringify({ ...f, preferenze: { pit_tema: 'scuro', ct_state: 'x', 'pit_<script>': 1 } }));
  assert.deepEqual(Object.keys(strano.dati.preferenze), ['pit_tema']);
});

test('riepilogo in parole', () => {
  assert.equal(M.riepilogo({ listino: 512, book: true, preventivi: 3, impostazioni: true, trasporto: true, tema: true }),
    'Importati: listino (512 articoli, con il book dell\'agente), 3 preventivi salvati, impostazioni, carico e adeguamenti del trasporto, tema scuro.');
  assert.equal(M.riepilogo({}), 'Niente da importare: i dati sono già qui.');
});
