/* Trasporti: le funzioni nuove danno gli stessi risultati dell'app originale, al centesimo. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { leggiJSON, senzaMigliaia, datiTrasportiProva } from './aiuti.js';
import * as T from '../js/core/trasporti.js';

const G = leggiJSON('tests/golden/trasporti.json');
const D = datiTrasportiProva();
const calc = T.creaTrasporti(D);

const sintesi = R => ({
  ready: R.ready, total: R.total, mode: R.mode,
  lines: R.lines.map(l => [l.t, l.s, l.v, !!l.minor, !!l.adj]),
  notes: R.notes, infos: R.infos, used: [...R.used].sort(), alt: R.alt.map(a => [a.mode, a.label, a.total])
});
const senzaData = s => s.replace(/^Data: .*$/m, 'Data: —');

test('golden: tutti i carichi, destinazioni, servizi, adeguamenti e gasolio', () => {
  let n = 0;
  for (const c of G.casi) {
    const S = { cart: c.cart.map((l, i) => ({ uid: i + 1, ...l })), reg: c.reg, prov: c.prov, opts: c.opts };
    const R = calc.compute(S, c.adj, c.fuel);
    assert.deepEqual(sintesi(R), c.R, `${c.nome} → ${c.reg} ${c.prov}`);
    if (c.testo) assert.equal(senzaMigliaia(senzaData(calc.summaryText(R, S, '2026-10-10'))), senzaMigliaia(senzaData(c.testo)), c.nome);
    n++;
  }
  assert.ok(n > 3500, `casi: ${n}`);
});

test('golden: classificazione dei colli su pallet', () => {
  for (const [kg, l1, l2, h, atteso] of G.colli) assert.deepEqual(T.palletPkg(kg, l1, l2, h), atteso, `${kg} kg ${l1}×${l2}×${h}`);
});

test('isole e copertura: ogni provincia ha una tariffa pallet e groupage', () => {
  for (const r of D.geo) {
    assert.ok(D.pallet.tariffe[r.id], 'pallet ' + r.id);
    for (const p of r.province) assert.ok(calc.findGroupage(p.sigla, r.id), `groupage ${r.id} ${p.sigla}`);
  }
  assert.equal(calc.needsProvince('SARDEGNA'), false);
  assert.equal(calc.needsProvince('SICILIA'), true);
});

test('gasolio: incidenza diversa per le isole', () => {
  const fuel = { on: true, share: 30, shareIs: 15 };
  const d = T.fuelDelta(D.gasolio);
  assert.equal(T.fuelPctFor(D.gasolio, fuel, 'LOMBARDIA'), d * 30 / 100);
  assert.equal(T.fuelPctFor(D.gasolio, fuel, 'SICILIA'), d * 15 / 100);
  assert.equal(T.fuelPctFor(D.gasolio, { ...fuel, on: false }, 'LOMBARDIA'), 0);
});

test('gasolio: la fonte del prezzo è scritta accanto alla data', () => {
  assert.equal(T.fonteGasolio(D.gasolio), 'MIMIT');                     // dato senza fonte: MIMIT
  const UE = { ...D, gasolio: { ...D.gasolio, attuale: { prezzo: 2.241, data: '2026-10-12', fonte: 'Bollettino UE' } } };
  const c = T.creaTrasporti(UE);
  const S = { cart: [{ uid: 1, qty: 1, kind: 'art', artId: 'touch-mec-2000s' }], reg: 'LOMBARDIA', prov: 'MI', opts: {} };
  const R = c.compute(S, 0, { on: true, share: 30, shareIs: 15 });
  assert.ok(R.lines.some(l => l.adj && l.s === 'Prezzo Bollettino UE del 12/10/2026'));
  assert.match(c.summaryText(R, S, '2026-10-20'), /Gasolio: Bollettino UE 12\/10\/2026/);
  assert.match(T.infoGasolio(UE.gasolio, '2026-10-20'), /^Ultimo prezzo 2,241 €\/l \(Bollettino UE del 12\/10\/2026\)/);
});

test('riepilogo: data italiana passata da fuori', () => {
  const S = { cart: [{ uid: 1, qty: 1, kind: 'art', artId: 'touch-mec-2000s' }], reg: 'LOMBARDIA', prov: 'MI', opts: {} };
  const testo = calc.summaryText(calc.compute(S), S, '2026-10-11');
  assert.match(testo, /^Data: 11\/10\/2026$/m);
  assert.match(testo, /TOTALE: 86,00\s€ \+ IVA/);
});

test('controllo versione dei dati', () => {
  assert.equal(T.versioneDatiOk(D), true);
  assert.equal(T.versioneDatiOk({ ...D, pallet: { ...D.pallet, versione: 3 } }), false);
});

test('menu: famiglie in ordine, "Fuori prospetto 2026" in fondo; ricerca esatta prima', () => {
  const cat = T.categorie(D.articoli);
  assert.equal(cat.at(-1)[0], 'Fuori prospetto 2026');
  assert.equal(cat.reduce((s, [, n]) => s + n, 0), D.articoli.length);
  const r = T.filtraArticoli(D.articoli, '', 'touch mec 2000s');
  assert.equal(r[0].nome, 'TOUCH MEC 2000S');
});

test('Consegna: il dettaglio di ogni soluzione torna con i conti dell\'app originale', () => {
  let pallet = 0, groupage = 0;
  for (const c of G.casi.filter((x, i) => i % 3 === 0)) {
    const S = { cart: c.cart.map((l, i) => ({ uid: i + 1, ...l })), reg: c.reg, prov: c.prov, opts: c.opts };
    for (const mode of ['groupage', 'pallet', 'auto']) {
      const sol = calc.soluzione(S, c.adj, c.fuel, mode);
      assert.deepEqual(sintesi(sol.R), sintesi(calc.computeMode(S, c.adj, c.fuel, mode)));
      // ogni articolo su pallet: la somma dei suoi pallet × quantità è la riga di computeMode
      const righe = sol.R.lines.filter(l => !l.minor && !l.t.startsWith('Groupage:'));
      sol.pallet.filter(p => p.costo != null).forEach((p, i) => { assert.equal(p.costo, righe[i].v, `${c.nome} ${mode} ${p.titolo}`); pallet++; });
      if (sol.groupage) {
        const riga = sol.R.lines.find(l => l.t.startsWith('Groupage:'));
        assert.equal(sol.groupage.prezzo, riga.v);
        assert.match(riga.s, new RegExp(`Fascia fino a ${String(sol.groupage.fascia.ml).replace('.', ',')} m, ${sol.groupage.fascia.b} bancali, ${sol.groupage.fascia.q} q`));
        groupage++;
      }
    }
  }
  assert.ok(pallet > 1000 && groupage > 500, `${pallet} articoli su pallet, ${groupage} groupage`);
});

test('Consegna: frasi chiare quando una soluzione non può essere "pura"', () => {
  const S = { cart: [{ uid: 1, qty: 1, kind: 'art', artId: 'handy-scan' }, { uid: 2, qty: 1, kind: 'art', artId: 'pfa-40' }], reg: 'LOMBARDIA', prov: 'MI', opts: {} };
  const g = calc.soluzione(S, 0, T.FUEL_DEFAULTS, 'groupage');
  assert.ok(g.motivi.some(m => /HANDY SCAN: si spedisce solo su pallet/.test(m)), g.motivi.join(' | '));
  assert.equal(g.pura, false);
  const p = calc.soluzione(S, 0, T.FUEL_DEFAULTS, 'pallet');
  assert.ok(p.motivi.some(m => /PFA 40: per misure o peso non può viaggiare su pallet/.test(m)), p.motivi.join(' | '));
  const oltre = calc.soluzione({ cart: [{ uid: 1, qty: 1, kind: 'manual', manual: { type: 'groupage', ml: 14, q: 300, b: 40 } }], reg: 'SICILIA', prov: 'PA', opts: {} }, 0, T.FUEL_DEFAULTS, 'groupage');
  assert.equal(oltre.valida, false);
  assert.ok(oltre.R.notes.some(n => /supera l'ultima fascia/.test(n)));
});

test('colli sovrapponibili: spento = numeri dell\'app trasporti; acceso = 2 × L 3300 occupano metà dei metri', () => {
  // dati veri (articoli con "sovrapponibile") più le regole di impilamento
  const Dv = { ...D, articoli: leggiJSON('data/trasporti/articoli.json'), sovrapposizione: leggiJSON('data/trasporti/sovrapposizione.json') };
  const cv = T.creaTrasporti(Dv);
  const segnati = Dv.articoli.filter(a => a.sovrapponibile).map(a => a.nome).sort();
  assert.deepEqual(segnati, ['L 3100', 'L 3300 / L 3300 EVO', 'L 3500 EVO', 'L 3500N EVO', 'PFA 40', 'PFA 50']);
  // spento: identico all'originale su tutti i casi di riferimento con questi articoli
  let confrontati = 0;
  for (const c of G.casi) {
    const S = { cart: c.cart.map((l, i) => ({ uid: i + 1, ...l })), reg: c.reg, prov: c.prov, opts: { ...c.opts, impila: false } };
    if (!S.cart.some(l => l.kind === 'art' && Dv.articoli.find(a => a.id === l.artId)?.sovrapponibile)) continue;
    assert.deepEqual(sintesi(cv.compute(S, c.adj, c.fuel)), c.R, c.nome);
    confrontati++;
  }
  assert.ok(confrontati > 50, `casi con articoli sovrapponibili: ${confrontati}`);
  // acceso: 2 × L 3300 impilati occupano metà dei metri lineari; peso e bancali invariati
  const voci = [{ line: { kind: 'art', artId: 'l-3300-l-3300-evo' }, qty: 2 }];
  const spento = cv.groupageLoad(voci, {});
  const acceso = cv.groupageLoad(voci, { impila: true });
  assert.equal(acceso.ml, spento.ml / 2);
  assert.equal(acceso.q, spento.q);
  assert.equal(acceso.b, spento.b);
  assert.equal(acceso.pile.length, 1);
  // tre colli: due livelli al massimo → una pila da 2 e uno a terra
  const tre = cv.groupageLoad([{ line: { kind: 'art', artId: 'l-3300-l-3300-evo' }, qty: 3 }], { impila: true });
  assert.deepEqual(tre.pile.map(p => p.length), [2, 1]);
  // altezza massima 240 cm: 2 × L 3100 (110 cm) sì, ma un collo di 150 cm sopra uno di 100 no
  const st = T.impila([{ l: 160, p: 80, h: 100 }, { l: 160, p: 80, h: 150 }], { livelliMassimi: 2, altezzaMassimaCm: 240 });
  assert.equal(st.pile.length, 2);
  // sopra va solo ciò che sta nell'ingombro del collo sotto
  assert.equal(T.impila([{ l: 160, p: 80, h: 50 }, { l: 170, p: 80, h: 50 }], { livelliMassimi: 2, altezzaMassimaCm: 240 }).pile.length, 1);
  assert.equal(T.impila([{ l: 160, p: 80, h: 50 }, { l: 100, p: 90, h: 50 }], { livelliMassimi: 2, altezzaMassimaCm: 240 }).pile.length, 2);
  // nella soluzione groupage: frase "Colli impilati"
  const S = { cart: [{ uid: 1, qty: 2, kind: 'art', artId: 'l-3300-l-3300-evo' }], reg: 'LOMBARDIA', prov: 'MI', opts: { impila: true } };
  assert.deepEqual(cv.soluzione(S, 0, T.FUEL_DEFAULTS, 'groupage').groupage.impilati, ['L 3300 / L 3300 EVO su L 3300 / L 3300 EVO']);
  assert.equal(cv.soluzione(S, 0, T.FUEL_DEFAULTS, 'groupage').groupage.impilamentoSenzaEffetto, '');
  // PFA 40: le colonne (4,8 m) decidono i metri, impilarle non cambia nulla e lo si dice
  const pfa = cv.soluzione({ cart: [{ uid: 1, qty: 1, kind: 'art', artId: 'pfa-40' }], reg: 'LOMBARDIA', prov: 'MI', opts: { impila: true } }, 0, T.FUEL_DEFAULTS, 'groupage').groupage;
  assert.deepEqual(pfa.impilati, []);
  assert.equal(pfa.impilamentoSenzaEffetto, 'Impilamento senza effetto: i metri li decide la lunghezza (4,8 m)');
});

test('fascia groupage: tariffa minima o valore che decide la fascia', () => {
  const zona = D.groupage.zone[0];
  const f0 = T.groupageBand(zona, 1, 5, 1);
  assert.equal(T.fraseFascia(f0, zona.fasce), 'Tariffa minima (carico sotto la prima fascia: 3 m · 7 bancali · 40 q)');
  const fm = T.groupageBand(zona, 4.5, 5, 1);
  assert.equal(T.fraseFascia(fm, zona.fasce), 'Fascia fino a 5 m · 13 bancali · 60 q, decisa dai metri lineari');
  const fq = T.groupageBand(zona, 1, 65, 12);
  assert.equal(T.fraseFascia(fq, zona.fasce), 'Fascia fino a 6 m · 16 bancali · 70 q, decisa dal peso');
});
