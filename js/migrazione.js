/*
 * Importazione dalle app precedenti (stessa origine pezzaliapp.github.io) e file di trasferimento.
 *
 * Le app precedenti si LEGGONO SOLTANTO: nessuna scrittura, nessuna cancellazione.
 * Attenzione: aprire con IndexedDB un database che non esiste lo crea vuoto, e un
 * "listino-in-tasca" vuoto romperebbe Listino in tasca. Per questo, se il database non c'è,
 * la creazione viene annullata subito (transazione di aggiornamento interrotta).
 */
import { Store, Pref } from './store.js';
import { stato, IMPOSTAZIONI_PREDEFINITE, impostazioniCambiate, preventivoCambiato } from './stato.js';
import { caricaListinoSalvato } from './catalogo.js';
import * as M from './core/migrazione.js';

const DB_VECCHIO = 'listino-in-tasca';
const CHIAVI_VECCHIE = ['ct_state', 'ct_adj', 'ct_fuel', 'darkMode', 'an_divisore'];

/** Apre un database SOLO se esiste già; altrimenti annulla la creazione e restituisce null. */
export function apriSeEsiste(nome) {
  return new Promise(resolve => {
    let nuovo = false;
    let req;
    try { req = indexedDB.open(nome); } catch (e) { resolve(null); return; }
    req.onupgradeneeded = e => { nuovo = true; e.target.transaction.abort(); }; // non esisteva: niente creazione
    req.onsuccess = () => { if (nuovo) { req.result.close(); resolve(null); } else resolve(req.result); };
    req.onerror = e => { e.preventDefault && e.preventDefault(); resolve(null); };
    req.onblocked = () => resolve(null);
  });
}

function leggiTutto(db) {
  const negozi = ['kv', 'files', 'quotes'].filter(n => db.objectStoreNames.contains(n));
  if (!negozi.includes('kv')) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const t = db.transaction(negozi, 'readonly');
    const out = {};
    const get = (s, k, dove) => { const r = t.objectStore(s).get(k); r.onsuccess = () => { out[dove] = r.result; }; };
    get('kv', 'catalog', 'catalog'); get('kv', 'settings', 'settings'); get('kv', 'draft', 'draft'); get('kv', 'agentPack', 'agentPack');
    if (negozi.includes('files')) get('files', 'listino', 'pdf');
    if (negozi.includes('quotes')) { const r = t.objectStore('quotes').getAll(); r.onsuccess = () => { out.quotes = r.result; }; }
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
  });
}

function vecchieChiavi() {
  const v = {};
  try { for (const k of CHIAVI_VECCHIE) { const x = localStorage.getItem(k); if (x !== null) v[k] = x; } } catch (e) { /* */ }
  return v;
}
function chiaviNuove() {
  const n = {};
  try { for (const k of ['pit_trasporto', 'pit_trasporto_adj', 'pit_trasporto_fuel', 'pit_tema', 'pit_an_divisore']) { const x = localStorage.getItem(k); if (x !== null) n[k] = x; } } catch (e) { /* */ }
  return n;
}

/** Cosa c'è da importare dalle app precedenti su questo dispositivo (senza toccarle). */
export async function rilevaVecchieApp() {
  const db = await apriSeEsiste(DB_VECCHIO);
  let d = null;
  if (db) { try { d = await leggiTutto(db); } catch (e) { d = null; } db.close(); }
  const ls = vecchieChiavi();
  const trovato = {
    listino: d && d.catalog && d.catalog.products ? d.catalog.products.length : 0,
    book: !!(d && d.agentPack && d.agentPack.pack),
    preventivi: d && d.quotes ? d.quotes.length : 0,
    bozza: !!(d && d.draft && d.draft.items && d.draft.items.length),
    impostazioni: !!(d && d.settings),
    trasporto: !!(ls.ct_state || ls.ct_adj || ls.ct_fuel),
    tema: ls.darkMode === 'true',
    analisi: !!ls.an_divisore
  };
  trovato.qualcosa = Object.values(trovato).some(Boolean);
  return trovato;
}

async function applica({ impostazioni, preventivi, bozza, preferenze, listino }) {
  const esito = {};
  if (listino && listino.catalog) {
    const attuale = await Store.get('kv', 'catalog');
    if (!attuale && listino.pdf) {
      await Store.set('files', 'listino', listino.pdf);
      await Store.set('kv', 'catalog', listino.catalog);
      if (listino.agentPack && listino.agentPack.pack) { await Store.set('kv', 'agentPack', listino.agentPack); esito.book = true; }
      esito.listino = listino.catalog.products.length;
    }
  }
  if (impostazioni) {
    const unite = M.unisciImpostazioni(stato.impostazioni, impostazioni, IMPOSTAZIONI_PREDEFINITE);
    if (JSON.stringify(unite) !== JSON.stringify(stato.impostazioni)) { stato.impostazioni = unite; impostazioniCambiate(); esito.impostazioni = true; }
  }
  if (preventivi && preventivi.length) {
    const r = M.unisciPreventivi(await Store.all('quotes'), preventivi);
    for (const q of r.daScrivere) await Store.set('quotes', null, q);
    if (r.daScrivere.length) esito.preventivi = r.daScrivere.length;
  }
  const b = M.scegliBozza(stato.preventivo, bozza);
  if (b) { stato.preventivo = b; preventivoCambiato(); esito.bozza = true; }
  for (const [k, v] of Object.entries(preferenze || {})) {
    try {
      if (k === 'pit_an_divisore') localStorage.setItem(k, String(v)); // l'analisi lo legge come testo
      else localStorage.setItem(k, JSON.stringify(v));
    } catch (e) { /* spazio pieno */ }
    if (k.startsWith('pit_trasporto')) esito.trasporto = true;
    if (k === 'pit_tema') esito.tema = true;
    if (k === 'pit_an_divisore') esito.analisi = true;
  }
  if (esito.listino) await caricaListinoSalvato();
  if (esito.tema) import('./app.js').then(a => a.applicaTema()).catch(() => {}); // vale subito, non solo alla riapertura
  return esito;
}

/** Importa dalle app precedenti. Restituisce { esito, testo }. */
export async function importaDaVecchieApp() {
  const db = await apriSeEsiste(DB_VECCHIO);
  let d = null;
  if (db) { try { d = await leggiTutto(db); } finally { db.close(); } }
  const esito = await applica({
    impostazioni: d && d.settings,
    preventivi: d && d.quotes,
    bozza: d && d.draft,
    preferenze: M.convertiPreferenze(vecchieChiavi(), chiaviNuove()),
    listino: d && d.catalog ? { catalog: d.catalog, pdf: d.pdf, agentPack: d.agentPack } : null
  });
  const testo = M.riepilogo(esito);
  Pref.set('importazione', { data: new Date().toISOString(), testo });
  return { esito, testo };
}

/** Contenuto del file di trasferimento (senza listino, catalogo né book). */
export async function fileDati(versioneApp) {
  const preferenze = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!/^pit_[a-z_]+$/.test(k) || k === 'pit_bozza') continue;
      const v = localStorage.getItem(k);
      try { preferenze[k] = k === 'pit_an_divisore' ? v : JSON.parse(v); } catch (e) { /* */ }
    }
  } catch (e) { /* */ }
  return M.creaFileDati({
    impostazioni: stato.impostazioni,
    preventivi: await Store.all('quotes'),
    bozza: stato.preventivo,
    preferenze,
    versioneApp,
    creato: new Date().toISOString()
  });
}

/** Importa un file di trasferimento. Restituisce { ok, testo }. */
export async function importaFile(testoFile) {
  const r = M.leggiFileDati(testoFile);
  if (!r.ok) return { ok: false, testo: r.errore };
  const n = chiaviNuove();
  const pref = {};
  for (const [k, v] of Object.entries(r.dati.preferenze)) if (n[k] == null || k === 'pit_abbinamenti') pref[k] = v;
  // abbinamenti: si uniscono (quelli già scelti qui restano)
  if (pref.pit_abbinamenti) pref.pit_abbinamenti = Object.assign({}, pref.pit_abbinamenti, Pref.get('abbinamenti', {}) || {});
  const esito = await applica({ impostazioni: r.dati.impostazioni, preventivi: r.dati.preventivi, bozza: r.dati.bozza, preferenze: pref });
  return { ok: true, testo: M.riepilogo(esito) };
}
