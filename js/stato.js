/*
 * Stato condiviso dell'app: il preventivo in corso e le impostazioni.
 * Le schermate leggono da qui e si iscrivono ai cambiamenti; la bozza si salva
 * da sola (anche quando l'app va in background o si chiude).
 */
import { Store } from './store.js';
import { totals, notaConTrasporto, eRigaTrasporto } from './core/preventivo.js';

export const IMPOSTAZIONI_PREDEFINITE = {
  company: '',
  seller: '',
  vat: 22,
  defaultDisc: '',
  validity: 30,
  notes: 'Prezzi IVA esclusa. Resa franco stabilimento del produttore, imballo e trasporto esclusi.',
  counterYear: new Date().getFullYear(),
  counter: 0
};

export const stato = {
  impostazioni: Object.assign({}, IMPOSTAZIONI_PREDEFINITE),
  preventivo: null,
  archivioDisponibile: true
};

export function nuovoPreventivo() {
  return {
    id: null, number: null, date: new Date().toISOString(),
    customer: '', reference: '',
    globalDisc: stato.impostazioni.defaultDisc || '',
    vatOn: false,
    items: [],
    notes: stato.impostazioni.notes,
    savedAt: null
  };
}

const ascoltatori = new Set();
/** Si iscrive ai cambiamenti; restituisce la funzione per disiscriversi. */
export function ascolta(fn) { ascoltatori.add(fn); return () => ascoltatori.delete(fn); }
function avvisa() { ascoltatori.forEach(fn => { try { fn(stato); } catch (e) { console.error(e); } }); }
/** Ridisegna chi ascolta senza salvare nulla (per esempio quando arrivano i coefficienti BCC). */
export const aggiornaViste = () => avvisa();

function rimanda(fn, ms) {
  let t = null;
  const d = () => { clearTimeout(t); t = setTimeout(() => { t = null; fn(); }, ms); };
  d.subito = () => { if (t !== null) { clearTimeout(t); t = null; fn(); } };
  d.annulla = () => { clearTimeout(t); t = null; };
  return d;
}
// Un salvataggio che non riesce non si ignora: lo si dice (una volta) a chi usa l'app.
let erroreSegnalato = false;
function nonSalvato(e) {
  console.error('Salvataggio non riuscito', e);
  if (erroreSegnalato) return;
  erroreSegnalato = true;
  ascoltatoriErrore.forEach(fn => fn(e));
}
const ascoltatoriErrore = new Set();
/** Chi vuole sapere se il salvataggio sul dispositivo non riesce (l'app mostra un avviso). */
export function seSalvataggioFallisce(fn) { ascoltatoriErrore.add(fn); }
const salvaBozza = rimanda(() => { Store.set('kv', 'draft', stato.preventivo).catch(nonSalvato); }, 400);
const salvaImpostazioni = rimanda(() => { Store.set('kv', 'settings', stato.impostazioni).catch(nonSalvato); }, 300);

/*
 * Copia SINCRONA della bozza in localStorage, scritta a ogni modifica.
 * L'archivio IndexedDB scrive in modo asincrono: se la pagina si chiude o si ricarica subito
 * dopo una modifica, quella scrittura può andare persa. localStorage invece è già scritto.
 * All'avvio vale questa copia (è sempre la più recente); se non si può scrivere, si toglie,
 * così non resta mai una copia vecchia che prevale sull'archivio.
 */
const CHIAVE_BOZZA = 'pit_bozza';
function specchioBozza() {
  try { localStorage.setItem(CHIAVE_BOZZA, JSON.stringify(stato.preventivo)); }
  catch (e) { try { localStorage.removeItem(CHIAVE_BOZZA); } catch (x) { /* */ } }
}
function leggiSpecchio() {
  try { const p = JSON.parse(localStorage.getItem(CHIAVE_BOZZA)); return p && Array.isArray(p.items) ? p : null; } catch (e) { return null; }
}

/** Da chiamare dopo ogni modifica al preventivo. */
export function preventivoCambiato({ scriveNote = false } = {}) {
  const p = stato.preventivo;
  // mentre si scrive la nota, la regola del trasporto non interviene
  if (p && !scriveNote) p.notes = notaConTrasporto(p.notes, [stato.impostazioni.notes, IMPOSTAZIONI_PREDEFINITE.notes], p.items.some(eRigaTrasporto));
  specchioBozza(); salvaBozza(); avvisa();
}
export function impostazioniCambiate() { salvaImpostazioni(); avvisa(); }
/** Scrive subito le impostazioni (per esempio il contatore dei numeri, insieme al preventivo salvato). */
export function salvaImpostazioniOra() {
  salvaImpostazioni.annulla();
  return Store.set('kv', 'settings', stato.impostazioni);
}
/** Salva subito tutto (prima di ricaricare o quando l'app va in background). */
export function salvaTutto() { salvaBozza.subito(); salvaImpostazioni.subito(); }

export function totaleCorrente() {
  return stato.preventivo ? totals(stato.preventivo, stato.impostazioni.vat) : totals({ items: [] }, 0);
}

export async function caricaStato() {
  try {
    const [settings, draft] = await Promise.all([Store.get('kv', 'settings'), Store.get('kv', 'draft')]);
    if (settings) stato.impostazioni = Object.assign({}, IMPOSTAZIONI_PREDEFINITE, settings);
    stato.preventivo = leggiSpecchio() || (draft && draft.items ? draft : nuovoPreventivo());
  } catch (e) {
    console.error(e);
    stato.archivioDisponibile = false;
    stato.preventivo = leggiSpecchio() || nuovoPreventivo();
  }
  avvisa();
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') salvaTutto(); });
window.addEventListener('pagehide', salvaTutto);
