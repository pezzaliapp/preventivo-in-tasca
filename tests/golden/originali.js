/*
 * Banco di prova delle app ORIGINALI (cartella _sorgenti/, solo in locale).
 * Esegue il loro codice così com'è dentro un contesto vm isolato, con un DOM
 * minimo finto, per registrare i risultati di riferimento ("golden").
 * Serve solo a genera.js: i test normali leggono i JSON già registrati.
 */
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
export const RADICE = path.resolve(QUI, '..', '..');
export const SORGENTI = path.join(RADICE, '_sorgenti');
const leggi = p => fs.readFileSync(path.join(SORGENTI, p), 'utf8');

/* Elemento finto: quanto basta per value, textContent e stile. */
function elemento() {
  return {
    value: '', textContent: '', innerHTML: '', style: {}, hidden: false, disabled: false,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, setAttribute() {}, removeAttribute() {}, appendChild() {}, click() {}
  };
}

/* ---------- Calcolo noleggio (Rel01) ---------- */
export function noleggioOriginale(dataISO) {
  const els = new Map();
  const get = id => { if (!els.has(id)) els.set(id, elemento()); return els.get(id); };
  const avvisi = [];
  let ultimoBlob = null;
  const document = {
    getElementById: get,
    querySelector: () => elemento(),
    createElement: () => elemento(),
    addEventListener() {},
    visibilityState: 'visible',
    body: { classList: { toggle() {}, add() {}, contains: () => false }, appendChild() {}, removeChild() {} }
  };
  const window = { location: { search: dataISO ? '?data=' + dataISO : '' } };
  const ctx = vm.createContext({
    window, document, URLSearchParams, Intl, Number, String, Math, Object, Array, parseFloat, parseInt,
    localStorage: { getItem: () => null, setItem() {} },
    navigator: {},
    alert: m => avvisi.push(m),
    console: { log() {}, error() {} },
    Blob: class { constructor(parti) { ultimoBlob = parti.join(''); } },
    URL: { createObjectURL: () => 'blob:', revokeObjectURL() {} }
  });
  vm.runInContext(leggi('Rel01_noleggio-main/app.js'), ctx, { filename: 'Rel01/app.js' });

  function calcola(importo, durata, modalita) {
    get('importo').value = importo; get('durata').value = String(durata); get('modalita').value = modalita;
    avvisi.length = 0;
    window.calcola();
    const t = id => get(id).textContent;
    return {
      avviso: avvisi[0] || null,
      etichetta: t('labelRata'), rata: t('rataMensile'), spese: t('speseContratto'),
      giornaliero: t('costoGiornaliero'), orario: t('costoOrario'),
      fascia: t('fasciaApplicata'), vrPerc: t('vrPerc'), vrEuro: t('vrEuro'), finanziato: t('importoFinanziato'),
      badge: t('simBadge'), prossimo: t('nextTariffNotice')
    };
  }
  function txt(importo, durata, modalita) {
    get('importo').value = importo; get('durata').value = String(durata); get('modalita').value = modalita;
    avvisi.length = 0; ultimoBlob = null;
    window.generaTXT();
    return { avviso: avvisi[0] || null, testo: ultimoBlob };
  }
  // Pulisco i risultati tra un caso e l'altro, come una pagina appena aperta
  function azzera() { for (const e of els.values()) e.textContent = ''; }
  return { calcola, txt, azzera, listini: window.__noleggio.TARIFF_SETS, attivo: window.__noleggio.getActiveTariff };
}

/* ---------- Calcolo trasporti ---------- */
export function trasportiOriginale(dati) {
  let src = leggi('calcolo-trasporti-main/app.js');
  // Non avvio l'interfaccia (init legge rete e DOM): espongo lo stato interno.
  if (!src.includes('\ninit();\n')) throw new Error('app.js trasporti: avvio non trovato');
  src = src.replace('\ninit();\n', '\n') + `
globalThis.__T = {
  D, compute, computeMode, summaryText, palletPkg, palletClass, productPallets, productGroupage, groupageBand, fuelDelta,
  imposta(s, adj, fuel){ S = s; ADJ = adj; FUEL = fuel; },
  riepilogo(){ LAST = compute(); return summaryText(); }
};`;
  const ctx = vm.createContext({
    document: { getElementById: () => elemento(), addEventListener() {} },
    window: { addEventListener() {} }, navigator: {}, localStorage: { getItem: () => null },
    sessionStorage: { getItem: () => null }, Intl, console
  });
  vm.runInContext(src, ctx, { filename: 'trasporti/app.js' });
  Object.assign(ctx.__T.D, dati);
  return ctx.__T;
}

/* ---------- Listino in tasca: calcoli del preventivo ---------- */
// Le funzioni stanno dentro app.js (IIFE con l'interfaccia): prendo i blocchi di
// codice tra i loro commenti di sezione ed eseguo quelli, senza riscriverli.
function blocco(src, da, a) {
  const i = src.indexOf(da), j = src.indexOf(a, i);
  if (i < 0 || j < 0) throw new Error('blocco non trovato: ' + da);
  return src.slice(i, j);
}
export function preventivoOriginale() {
  const src = leggi('listino-in-tasca-main/js/app.js');
  const codice = [
    blocco(src, '  const esc = s =>', '  const norm = s =>'),
    blocco(src, '  /* ---------- sconti ---------- */', '  /* ---------- persistenza ---------- */'),
    blocco(src, '  function nextNumber()', '  async function saveQuote()'),
    blocco(src, '  function shareText()', '  async function shareQuote()'),
    blocco(src, '  function setLineNet(', '  function firstLine(')
  ].join('\n');
  const ctx = vm.createContext({ Intl, Date, Number, String, Math, isFinite });
  vm.runInContext(`'use strict';
const S = { settings: {}, quote: null };
const saveSettings = () => {};
${codice}
globalThis.__P = { S, parseDisc, lineDisc, lineNet, totals, nextNumber, shareText, setLineNet, setGroupNet, money };`, ctx);
  return ctx.__P;
}

/* ---------- Script classici del listino (parser, regole, cerca, agente) ---------- */
export function scriptClassico(file, extra = {}) {
  const ctx = vm.createContext(Object.assign({ console }, extra));
  ctx.self = ctx;
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  return ctx;
}

/* ---------- Listino in tasca: catalogo, configuratore e book dell'agente ---------- */
export function listinoUiOriginale({ Regole, Cerca }) {
  const src = leggi('listino-in-tasca-main/js/app.js');
  const codice = [
    blocco(src, '  const esc = s =>', '  const norm = s =>'),
    blocco(src, '  const norm = s =>', '  const uid = () =>'),
    blocco(src, '  const FEATURES = [', '  const DEFAULT_SETTINGS'),
    blocco(src, '  /* ---------- sconti ---------- */', '  /* ---------- persistenza ---------- */'),
    blocco(src, '  function indexCatalog(cat)', '  function updateHeader()'),
    blocco(src, '  function machineBase(withAcc)', '  function configHTML()'),
    blocco(src, '  function sortList(list)', '  function resultsHTML(list)'),
    blocco(src, '  function famCrop(f)', '  function itemCrop(it)'),
    blocco(src, '  function suggestedAccessories(f)', '  let figZoom'),
    blocco(src, '  const VEH_LABEL', '  function vehChips(tags)'),
    blocco(src, '  // Articoli della postazione', '  function postTotalLabel(post)'),
    blocco(src, '  function wizardResult(a)', '  function openWizard()'),
    blocco(src, '  function setLineNet(', '  function checksHTML()'),
    blocco(src, '  function drawingsFor(codes)', '  function drawingListHTML(list)')
  ].join('\n');
  const window = { Regole, Cerca };
  const ctx = vm.createContext({ Intl, Date, Number, String, Math, isFinite, Map, Set, Object, Array, RegExp, JSON, console, window, Cerca, Regole,
    PdfView: { setSource() {} } });
  vm.runInContext(`'use strict';
const S = { catalog: null, byKey: new Map(), settings: { vat: 22 }, quote: null, cfg: null, pack: null };
const uid = () => 'r' + (++globalThis.__seq);
const updateHeader = () => {};
${codice}
globalThis.__L = { S, indexCatalog, applyPack, machineBase, filterGroups, applyFilters, sortList, famCrop, productCrop, suggestedAccessories,
  postItems, postTotal, wizardResult, applyPackPricing, quoteChecks, drawingsFor, byCode };`, Object.assign(ctx, { __seq: 0 }));
  return ctx.__L;
}
