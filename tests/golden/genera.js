/*
 * Registra i risultati di riferimento ("golden") eseguendo il codice ORIGINALE
 * delle tre app (cartella _sorgenti/, solo in locale).
 *
 *   node tests/golden/genera.js
 *
 * I JSON prodotti vanno committati: i test li confrontano con le funzioni nuove
 * in js/core/. Non si scrivono a mano: si rigenerano da qui.
 */
import fs from 'node:fs';
import path from 'node:path';
import { noleggioOriginale, trasportiOriginale, preventivoOriginale, listinoUiOriginale, scriptClassico, SORGENTI, RADICE } from './originali.js';
import { BOOK, PREVENTIVI } from '../fixtures/book-sintetico.js';
import { pdfSintetico } from '../fixtures/listino-sintetico.js';

if (!fs.existsSync(SORGENTI)) { console.error('Manca _sorgenti/: i golden si generano solo sul computer di Alessandro.'); process.exit(1); }
const OUT = path.join(RADICE, 'tests', 'golden');
// Una riga per caso: file compatti ma ancora leggibili nei diff
const scrivi = (nome, dati) => {
  const righe = Object.entries(dati).map(([k, v]) => Array.isArray(v)
    ? JSON.stringify(k) + ':[\n' + v.map(x => JSON.stringify(x)).join(',\n') + '\n]'
    : JSON.stringify(k) + ':' + JSON.stringify(v));
  fs.writeFileSync(path.join(OUT, nome), '{\n' + righe.join(',\n') + '\n}\n');
  console.log('scritto', nome);
};

/* ================= Noleggio ================= */
// Importi scritti come li scrive l'utente, ai bordi di ogni fascia di coefficienti e di spese.
export const IMPORTI_NOLEGGIO = [
  '1000', '2.500,50', '4999,99', '5000', '5.000,01', '7500', '9.999,99', '10000', '10.000,01', '12.345,67',
  '15000', '15000,01', '18.381,00 €', '20000', '25.000', '25.000,01', '33.333,33', '49.999,99', '50000', '50000,01',
  '75.000', '99.999,99', '100.000', '100.000,01', '250.000', '999.999', '999.999,01', '1.234.567,89', '0,01', ' 3 500 '
];
export const IMPORTI_NON_VALIDI = ['', '0', 'abc', '-5', '0,00 €'];
export const DATE_NOLEGGIO = ['2026-04-06', '2026-04-07', '2026-10-14', '2026-10-15', '2027-03-01'];
const DURATE = [12, 18, 24, 36, 48, 60];
const MODALITA = ['mensile', 'trimestrale'];

{
  const casi = [], txt = [], date = {};
  for (const d of DATE_NOLEGGIO) {
    const N = noleggioOriginale(d);
    N.azzera();
    const primo = N.calcola('10000', 24, 'mensile');
    date[d] = { badge: primo.badge, prossimo: primo.prossimo };
    for (const m of MODALITA) for (const durata of DURATE) {
      for (const imp of [...IMPORTI_NOLEGGIO, ...IMPORTI_NON_VALIDI]) {
        N.azzera();
        const r = N.calcola(imp, durata, m);
        delete r.badge; delete r.prossimo;
        casi.push({ data: d, importo: imp, durata, modalita: m, ...r });
      }
    }
    // TXT: tutte le durate e modalità su una scelta di importi, più un caso non valido
    if (d === '2026-10-14' || d === '2026-10-15') {
      for (const m of MODALITA) for (const durata of DURATE)
        for (const imp of ['4999,99', '12.345,67', '18.381,00 €', '50000,01', '250.000', '1.234.567,89', ''])
          txt.push({ data: d, importo: imp, durata, modalita: m, ...N.txt(imp, durata, m) });
    }
  }
  scrivi('noleggio.json', { fonte: 'Rel01_noleggio Release 03 · Ottobre 2026', date, casi, txt });
}

/* ================= Trasporti ================= */
const FIX = path.join(RADICE, 'tests', 'fixtures', 'trasporti');
const dati = {};
for (const k of ['listini', 'pallet', 'groupage', 'articoli', 'geo', 'gasolio']) dati[k] = JSON.parse(fs.readFileSync(path.join(FIX, k + '.json'), 'utf8'));
const T = trasportiOriginale(dati);
const FUEL0 = { on: false, share: 30, shareIs: 15 };
const OPT0 = { ass: false, pre: false, dis: false, disEur: 0 };
// Riassunto stabile del risultato (Set → array)
const sintesi = R => ({
  ready: R.ready, total: R.total, mode: R.mode,
  lines: R.lines.map(l => [l.t, l.s, l.v, !!l.minor, !!l.adj]),
  notes: R.notes, infos: R.infos, used: [...R.used].sort(), alt: R.alt.map(a => [a.mode, a.label, a.total])
});
const art = id => ({ kind: 'art', artId: id });
const man = m => ({ kind: 'manual', manual: m });
let uid = 1;
const carrello = righe => righe.map(([line, qty]) => ({ uid: uid++, qty, ...line }));

export const DESTINAZIONI_BREVI = [['LOMBARDIA', 'MI'], ['PIEMONTE', 'CN'], ['LAZIO', 'RM'], ['CAMPANIA', 'NA'], ['CALABRIA', 'RC'],
  ['SICILIA', 'PA'], ['SARDEGNA', ''], ['SARDEGNA', 'SS'], ["VALLE D'AOSTA", 'AO'], ['TRENTINO', 'BZ'], ['PUGLIA', 'LE'], ['LAZIO', '']];
const tutteProvince = dati.geo.flatMap(r => r.province.map(p => [r.id, p.sigla]));

const casiT = [];
const prova = (nome, cart, reg, prov, opts = OPT0, adj = 0, fuel = FUEL0, conTesto = false) => {
  T.imposta({ cart, reg, prov, opts }, adj, fuel);
  const R = T.compute();
  const caso = { nome, cart: cart.map(({ uid, ...l }) => l), reg, prov, opts, adj, fuel, R: sintesi(R) };
  if (conTesto && R.ready) caso.testo = T.riepilogo();
  casiT.push(caso);
};

// 1. Ogni articolo del catalogo, da solo, verso destinazioni diverse (isole comprese)
for (const a of dati.articoli) for (const [reg, prov] of DESTINAZIONI_BREVI) prova('articolo', carrello([[art(a.id), 1]]), reg, prov);
// 2. Carichi misti verso tutte le province
const CARICHI = {
  misto: [[art('touch-mec-2000s'), 1], [art('ft-600-hy-ft-600-hy'), 1], [art('handy-scan'), 2]],
  'molti pallet': [[art('touch-mec-2000s'), 4], [art('touch-mec-2000s-p'), 3]],
  'fuori misura': [[art('l-45-l-45'), 1], [art('pfa-40'), 1]],
  'colli manuali': [[man({ type: 'pallet', pallet: 'MEDIUM + 30%' }), 2], [man({ type: 'groupage', ml: 3.5, q: 12, b: 2 }), 1]],
  'tutto in groupage': [[man({ type: 'groupage', ml: 7, q: 90, b: 18 }), 1], [art('l-40-l-40'), 1]],
  'oltre ultima fascia': [[man({ type: 'groupage', ml: 14, q: 300, b: 40 }), 1]],
  'da quotare': [[art('mtb'), 1], [art('touch-mec-2000s'), 1]]
};
for (const [nome, righe] of Object.entries(CARICHI)) for (const [reg, prov] of tutteProvince) prova(nome, carrello(righe), reg, prov);
// 3. Servizi, adeguamenti e gasolio su alcuni carichi e destinazioni
const OPZIONI = [];
for (const ass of [false, true]) for (const pre of [false, true]) for (const dis of [false, true]) for (const disEur of dis ? [0, 12.345] : [0])
  OPZIONI.push({ ass, pre, dis, disEur });
const ADJ = [0, 5, -3.5];
const FUEL = [FUEL0, { on: true, share: 30, shareIs: 15 }];
for (const nome of ['misto', 'molti pallet', 'colli manuali', 'fuori misura'])
  for (const [reg, prov] of [['LOMBARDIA', 'BG'], ['SICILIA', 'CT']])
    for (const opts of OPZIONI) for (const adj of ADJ) for (const fuel of FUEL)
      prova('opzioni ' + nome, carrello(CARICHI[nome]), reg, prov, opts, adj, fuel, adj === 5 && fuel.share === 30);
// 4. Carico vuoto e regione mancante
prova('vuoto', [], 'LOMBARDIA', 'MI');
prova('senza regione', carrello(CARICHI.misto), '', '');

// 5. Classificazione dei colli su una griglia di pesi e misure
const pkg = [];
for (const kg of [0, 50, 150, 151, 300, 301, 450, 451, 600, 601, 750, 751, 900, 901, 1050, 1051, 1200, 1250, 1300, 1800, 1801])
  for (const [l1, l2] of [[100, 120], [120, 120], [130, 110], [150, 100], [170, 110], [200, 110], [230, 110], [240, 160], [250, 110], [270, 120], [290, 100], [300, 80], [301, 80], [250, 130], [200, 200], [0, 100]])
    for (const h of [40, 60, 61, 80, 120, 160, 161, 240, 241])
      pkg.push([kg, l1, l2, h, T.palletPkg(kg, l1, l2, h)]);

scrivi('trasporti.json', { fonte: 'calcolo-trasporti build 13, dati v2 (tests/fixtures/trasporti)', casi: casiT, colli: pkg });

/* ================= Preventivo (Listino in tasca) ================= */
{
  const P = preventivoOriginale();
  const sconti = ['', ' ', '0', '10', '20,5', '20.5', '30+5', '30+10+2', '30 + 5 %', '50%', '100', '100+10', '101', '-5', 'abc', '30++5', '+30', '30+', '33,333', '0+0+0', '12,5+7,5'];
  const parse = sconti.map(s => [s, P.parseDisc(s)]);
  const preventivi = [
    { globalDisc: '', vatOn: false, items: [{ price: 9500, qty: 1, disc: '' }] },
    { globalDisc: '30+5', vatOn: true, items: [{ price: 9500, qty: 2, disc: '' }, { price: 65, qty: 1, disc: '10' }, { price: 350, qty: 3, disc: '0' }] },
    { globalDisc: '25', vatOn: true, items: [{ price: 1234.56, qty: 7, disc: '12,5+7,5' }, { price: 0.1, qty: 3, disc: '' }, { price: 19.99, qty: 13, disc: '33,333' }] },
    { globalDisc: 'abc', vatOn: false, items: [{ price: 100, qty: 1, disc: '' }, { price: 100, qty: 1, disc: '200' }] },
    { globalDisc: '40', vatOn: true, items: [] },
    { globalDisc: '15', vatOn: true, items: [{ price: 21500, qty: 1, disc: null }, { price: 890, qty: 2, disc: undefined }, { price: 75, qty: 4, disc: ' ' }] }
  ];
  const totali = [];
  for (const vat of [22, 10, 0, '22']) for (const q of preventivi) {
    P.S.settings = { vat }; P.S.quote = q;
    totali.push({ vat, quote: q, totals: P.totals(), nets: q.items.map(it => P.lineNet(it)) });
  }
  const testi = [];
  const base = { date: '2026-10-10T08:30:00.000Z', notes: 'Prezzi IVA esclusa.' };
  for (const [i, q] of preventivi.entries()) for (const seller of ['', 'Mario Rossi, 333 1234567']) {
    const quote = Object.assign({}, base, q, {
      number: i % 2 ? '2026/007' : null, customer: i % 3 ? 'Officina Bianchi' : '',
      items: q.items.map((it, k) => Object.assign({ code: k ? '' : '01100313', name: 'Articolo ' + k }, it)), notes: i === 4 ? '' : base.notes
    });
    P.S.settings = { vat: 22, seller }; P.S.quote = quote;
    testi.push({ settings: P.S.settings, quote, testo: P.shareText() });
  }
  const numeri = [];
  P.S.settings = { counterYear: 2025, counter: 41 };
  for (let k = 0; k < 3; k++) numeri.push(P.nextNumber());
  const netti = [];
  for (const [it, net] of [[{ price: 9500, disc: '' }, 7000], [{ price: 1234.56, disc: '' }, 999.99], [{ price: 100, disc: '' }, 150], [{ custom: true, price: 0, disc: '' }, 80], [{ manual: true, price: 10, disc: '' }, 8]]) {
    const c = Object.assign({}, it); P.setLineNet(c, net); netti.push({ prima: it, net, dopo: c });
  }
  const gruppi = [];
  for (const [prezzi, net] of [[[9500, 2300, 640], 9900], [[1000, 1000], 2500], [[0], 10]]) {
    const lines = prezzi.map(p => ({ price: p, disc: '' })); P.setGroupNet(lines, net); gruppi.push({ prezzi, net, sconti: lines.map(l => l.disc) });
  }
  scrivi('preventivo.json', { fonte: 'listino-in-tasca 1.4.0, js/app.js', parse, totali, testi, numeri, netti, gruppi });
}

/* ================= Listino: parser, regole, ricerca, chiave del book ================= */
{
  const L = path.join(SORGENTI, 'listino-in-tasca-main', 'js');
  const parser = scriptClassico(path.join(L, 'parser.js')).ListinoParser;
  const cat = await parser.parseListino(pdfSintetico());
  delete cat.parsedAt;
  const regole = scriptClassico(path.join(L, 'regole.js')).Regole;
  const conRegole = regole.applyVehicleRules(JSON.parse(JSON.stringify(cat)));
  const cerca = scriptClassico(path.join(L, 'cerca.js')).Cerca;
  const prodotti = JSON.parse(JSON.stringify(conRegole.products));
  prodotti.forEach(p => cerca.prepare(p, conRegole.families[p.family]));
  const ricerche = ['01100313', '0110', 'mec', 'mec1000', 'MEC 1000', 'f536', 'f 536', 'geo10', 'geo', 'nls', 'pfa40', 'cablaggio', 'alluminio set', 'moto', 'xyz', '', 'Ø40', 'truck 26', 'velocita', 'velocità']
    .map(q => [q, cerca.search(prodotti, q).map(p => p.code + '|' + p.power)]);
  const agente = scriptClassico(path.join(L, 'agente.js'), { atob, TextEncoder, TextDecoder }).Agente;
  const canonico = agente.canonical(cat);
  const hash = (await import('node:crypto')).createHash('sha256').update(agente.KDF_LABEL + canonico).digest('hex');
  const parsePrezzi = ['9.500,00 €', '65,00', '1.250,00', '0,99', '12.345.678,90', '1,5', 'abc', '9.500,00€'].map(s => [s, parser.priceToNumber(s)]);
  scrivi('listino.json', { fonte: 'listino-in-tasca 1.4.0, PARSER_VERSION ' + parser.PARSER_VERSION, catalogo: cat, conRegole, ricerche, canonico, chiaveSha256: hash, parsePrezzi });
}

/* ================= Listino: configuratore e book dell'agente (sintetici) ================= */
{
  const L = path.join(SORGENTI, 'listino-in-tasca-main', 'js');
  const parser = scriptClassico(path.join(L, 'parser.js')).ListinoParser;
  const Regole = scriptClassico(path.join(L, 'regole.js')).Regole;
  const Cerca = scriptClassico(path.join(L, 'cerca.js')).Cerca;
  const base = JSON.stringify(await parser.parseListino(pdfSintetico()));
  const X = listinoUiOriginale({ Regole, Cerca });
  const J = o => JSON.parse(JSON.stringify(o));
  const vistaProdotto = p => ({ key: p.key, name: p.name, vehicles: p.vehicles, _power: p._power, _feat: p._feat, agentVehicles: p.agentVehicles || null, described: p.described });

  // senza book
  X.S.pack = null;
  X.indexCatalog(JSON.parse(base));
  const prodotti = X.S.catalog.products.map(vistaProdotto);
  const cfgCasi = [];
  for (const vehicle of [null, 'auto', 'moto', 'truck']) for (const activity of [null, 'equilibratura', 'smontaggio', 'sollevamento', 'assetto', 'altro']) for (const acc of [false, true]) {
    X.S.cfg = { vehicle, activity, open: 'needs', sel: {}, acc, sort: 'listino' };
    const b = X.machineBase(acc);
    const groups = X.filterGroups(b);
    const filtrati = [];
    for (const g of groups) for (const o of g.opts) {
      X.S.cfg.sel = { [g.id]: [o.id] };
      filtrati.push([g.id, o.id, X.applyFilters(b).map(p => p.key)]);
    }
    X.S.cfg.sel = groups.length > 1 ? { [groups[0].id]: [groups[0].opts[0].id], [groups.at(-1).id]: groups.at(-1).opts.map(o => o.id) } : {};
    const combinati = X.applyFilters(b).map(p => p.key);
    const ordini = ['listino', 'asc', 'desc'].map(sort => { X.S.cfg.sort = sort; return X.sortList(b).map(p => p.key); });
    cfgCasi.push({ vehicle, activity, acc, base: b.map(p => p.key), groups: J(groups), filtrati, sel: J(X.S.cfg.sel), combinati, ordini });
  }
  const accessori = Object.values(X.S.catalog.families).map(f => [f.id, X.suggestedAccessories(f).map(p => p.key)]);
  const ritagli = X.S.catalog.products.map(p => [p.key, J(X.productCrop(p))]);

  // con il book sintetico
  X.S.pack = J(BOOK);
  X.indexCatalog(JSON.parse(base));
  const prodottiBook = X.S.catalog.products.map(vistaProdotto);
  const postazioni = [];
  for (const post of BOOK.postazioni) for (const power of [undefined, 'tri', 'mono']) for (const opt of [{}, { '25100040': true }, { '25100040': true, '99999999': true }]) {
    const opts = { power, optional: opt };
    postazioni.push({ id: post.id, power: power || null, optional: opt, righe: J(X.postItems(X.S.pack.postazioni.find(p => p.id === post.id), opts)).map(r => ({ code: r.code, label: r.label, required: r.required, on: r.on, price: r.price, manual: r.manual || null, product: r.product ? r.product.key : null })), totale: J(X.postTotal(X.S.pack.postazioni.find(p => p.id === post.id), opts)) });
  }
  const risposte = [];
  const val = { mestiere: [undefined, 'gommista', 'servizio'], ruote: [undefined, 'low', 'high'], ribassati: [undefined, 'si', 'no'], corrente: [undefined, 'tri', 'mono'], alta: [undefined, 'puma', 'cm'] };
  for (const m of val.mestiere) for (const r of val.ruote) for (const b of val.ribassati) for (const c of val.corrente) for (const a of val.alta) {
    const ans = Object.fromEntries(Object.entries({ mestiere: m, ruote: r, ribassati: b, corrente: c, alta: a }).filter(([, x]) => x !== undefined));
    risposte.push([ans, J(X.wizardResult(ans))]);
  }
  const controlli = [], prezzi = [];
  for (const q of PREVENTIVI) {
    const items = q.items.map((it, i) => Object.assign({ id: 'i' + i }, it, it.custom ? { key: null } : { key: X.byCode(it.code).key, name: X.byCode(it.code).name }));
    X.S.quote = J(Object.assign({}, q, { items }));
    controlli.push({ quote: J(X.S.quote), checks: J(X.quoteChecks()) });
    X.S.quote = J(Object.assign({}, q, { items }));
    X.applyPackPricing();
    prezzi.push({ quote: J(Object.assign({}, q, { items })), dopo: J(X.S.quote.items).map(({ id, ...r }) => r) });
  }
  scrivi('agente.json', { fonte: 'listino-in-tasca 1.4.0, js/app.js, con listino e book sintetici', prodotti, cfgCasi, accessori, ritagli, prodottiBook, postazioni, risposte, controlli, prezzi });
}
