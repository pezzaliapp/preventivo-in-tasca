/*
 * Listino caricato sul dispositivo: catalogo, figure dal PDF e book dell'agente.
 * Il PDF si legge in locale con pdf.js e resta solo in IndexedDB: non va mai in rete.
 * Usa i file di Listino in tasca portati 1:1 (caricati come script classici):
 * ListinoParser, Regole, Cerca, Agente, PdfView.
 */
import { Store } from './store.js';
import { stato, preventivoCambiato } from './stato.js';
import { preparaCatalogo, applyPack, fam } from './core/listino.js';

const W = window;
export const listino = {
  catalog: null,
  byKey: new Map(),
  pack: null, packId: '', packState: null,
  lettura: null // { fatto, totale, nome, fase } mentre legge il PDF
};

const ascoltatori = new Set();
export function ascoltaListino(fn) { ascoltatori.add(fn); return () => ascoltatori.delete(fn); }
const avvisa = () => ascoltatori.forEach(fn => { try { fn(listino); } catch (e) { console.error(e); } });

function indicizza(cat) {
  listino.catalog = cat;
  listino.byKey = preparaCatalogo(cat, { Regole: W.Regole, Cerca: W.Cerca });
  if (listino.pack) applyPack(cat, listino.pack, W.Cerca);
  if (W.PdfView) W.PdfView.setSource(() => Store.get('files', 'listino'));
  import('./figure.js').then(f => f.svuotaImmaginiPagine()).catch(() => {});
}

/** All'avvio: catalogo e book già salvati. Se è cambiato il lettore del PDF, rilegge il file salvato. */
export async function caricaListinoSalvato() {
  try {
    const [cat, ap] = await Promise.all([Store.get('kv', 'catalog'), Store.get('kv', 'agentPack')]);
    if (ap && ap.pack && cat && cat.products) { listino.pack = ap.pack; listino.packId = ap.packId || ''; listino.packState = 'stored'; }
    else if (ap) Store.del('kv', 'agentPack').catch(() => {});
    if (cat && cat.products) {
      indicizza(cat);
      if (W.ListinoParser && cat.parserVersion !== W.ListinoParser.PARSER_VERSION) {
        // lettura in sottofondo: le schermate mostrano l'avanzamento
        Store.get('files', 'listino').then(bytes => { if (bytes) leggiPdf(bytes, { name: cat.fileName, size: cat.fileSize }, 'Aggiorno i dati del listino'); });
        avvisa();
        return;
      }
    }
  } catch (e) { console.error(e); }
  avvisa();
  if (listino.catalog) sblocca(!listino.pack).catch(() => {}).then(() => precaricaDisegni());
}

/**
 * Legge il PDF (già in memoria) ed estrae il catalogo. Restituisce { ok, messaggio }.
 */
export async function leggiPdf(bytes, meta, etichetta) {
  listino.lettura = { fatto: 0, totale: 0, nome: etichetta, fase: 'Apertura del file' };
  avvisa();
  try {
    const pdf = await W.PdfView.load(bytes);
    listino.lettura.totale = pdf.numPages;
    const cat = await W.ListinoParser.parseListino(pdf, (p, n, fase) => {
      listino.lettura.fatto = fase === 'lettura' ? p : n;
      listino.lettura.fase = fase === 'lettura' ? 'Lettura pagine' : 'Analisi prodotti';
      avvisa();
    });
    pdf.destroy();
    if (!cat.products.length) throw new Error('Nel PDF non ho trovato righe con codice a 8 cifre e prezzo. Controlla che sia il listino giusto.');
    cat.fileName = meta.name;
    cat.fileSize = meta.size;
    await Store.set('files', 'listino', bytes);
    await Store.set('kv', 'catalog', cat);
    Store.persist();
    W.PdfView.reset();
    indicizza(cat);
    listino.lettura = null;
    avvisa();
    sblocca(true).catch(() => {}).then(() => precaricaDisegni());
    return { ok: true, messaggio: `Listino caricato: ${cat.products.length} articoli` };
  } catch (err) {
    console.error(err);
    listino.lettura = null;
    avvisa();
    return { ok: false, messaggio: err && err.message ? err.message : 'Impossibile leggere il PDF' };
  }
}

/** Da un file scelto dall'utente. */
export async function caricaFile(file) {
  if (!file) return { ok: false, messaggio: '' };
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) return { ok: false, messaggio: 'Scegli un file PDF' };
  return leggiPdf(await file.arrayBuffer(), { name: file.name, size: file.size }, file.name);
}

/**
 * Sblocca il book con il listino caricato. Se il listino non corrisponde ma il book era
 * già stato sbloccato su questo dispositivo, resta quello salvato. Restituisce true se è nuovo.
 */
export async function sblocca(annuncia) {
  if (!listino.catalog || !W.Agente) return false;
  const res = await W.Agente.unlock(listino.catalog);
  if (res.pack) {
    const nuovo = !listino.pack || listino.packId !== res.packId;
    listino.pack = res.pack;
    listino.packId = res.packId;
    listino.packState = 'ok';
    await Store.set('kv', 'agentPack', { pack: res.pack, packId: res.packId, at: new Date().toISOString() }).catch(() => {});
    applyPack(listino.catalog, listino.pack, W.Cerca);
    if (nuovo) { listino.appenaSbloccato = !!annuncia; avvisa(); }
    return nuovo;
  }
  listino.packState = listino.pack ? 'stored' : res.error;
  return false;
}

/**
 * Disegni del book disponibili anche offline: si scaricano in sottofondo, uno alla volta, solo
 * quando il book c'è. Il service worker li tiene nella copia offline ("prima la copia"), quindi
 * quelli già salvati non passano dalla rete.
 */
let disegniInCorso = null;
export function precaricaDisegni() {
  const lista = (listino.pack && listino.pack.disegni) || [];
  if (disegniInCorso || !lista.length || !('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return disegniInCorso;
  disegniInCorso = (async () => {
    for (const d of lista) {
      try { await fetch('data/d/' + encodeURIComponent(d.id) + '.bin'); } catch (e) { break; } // offline: si riprova alla prossima apertura
    }
  })().finally(() => { disegniInCorso = null; });
  return disegniInCorso;
}

export async function rimuoviListino() {
  await Store.del('files', 'listino');
  await Store.del('kv', 'catalog');
  await Store.del('kv', 'agentPack');
  listino.pack = null; listino.packId = ''; listino.packState = null;
  if (W.PdfView) W.PdfView.reset();
  listino.catalog = null;
  listino.byKey = new Map();
  avvisa();
}

/* ---------- Righe del preventivo dal listino ---------- */
export const nuovoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Aggiunge un articolo (o +1 se c'è già). */
export function aggiungiArticolo(p) {
  const q = stato.preventivo;
  const ex = q.items.find(i => i.key === p.key && !i.custom);
  if (ex) ex.qty += 1;
  else q.items.push({ id: nuovoId(), key: p.key, code: p.code, name: p.name, power: p.power, price: p.price, qty: 1, disc: '', page: p.page, family: fam(listino.catalog, p.family).title });
  preventivoCambiato();
  try { navigator.vibrate && navigator.vibrate(8); } catch (e) { /* */ }
}
export const nelPreventivo = key => stato.preventivo ? stato.preventivo.items.filter(i => i.key === key).reduce((a, i) => a + i.qty, 0) : 0;
