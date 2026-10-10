/*
 * Formati italiani per importi e numeri. Funzioni pure, usate da tutta l'app.
 * Gli importi hanno sempre il punto delle migliaia: 1.234,56 € (decisione S-08).
 */

function nf(opts) {
  try { return new Intl.NumberFormat('it-IT', Object.assign({ useGrouping: 'always' }, opts)); }
  catch (e) { return new Intl.NumberFormat('it-IT', opts); }
}
const EURO = nf({ style: 'currency', currency: 'EUR' });
const DUE = nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PCT = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });

/** "1.234,56 €". Arrotonda al centesimo prima di scrivere; vuoto o non valido vale 0. */
export const euro = n => EURO.format(Math.round((n || 0) * 100) / 100);

/** Come euro(), ma un valore non numerico diventa "—". */
export const euroOTrattino = v => Number.isFinite(v) ? euro(v) : '—';

/** "1.234,56" senza simbolo (testi del noleggio). */
export const numero2 = v => DUE.format(Number(v) || 0);

/** Percentuale con al massimo due decimali: 33,5 */
export const percento = v => PCT.format(v);

/** Numero con un numero fisso di decimali, senza separatore per le migliaia sotto 10.000 (trasporti). */
export const it1 = (v, dec = 1) => Number(v).toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec });

/** Numero con al massimo due decimali (metri, quintali, kg dei trasporti). */
export const itN = v => Number(v).toLocaleString('it-IT', { maximumFractionDigits: 2 });

/**
 * Legge un importo scritto all'italiana: "18.381,00 €" → 18381.
 * Toglie €, spazi e punti delle migliaia, la virgola diventa il punto decimale.
 * Un valore non leggibile vale 0. (Come Rel01: parseEuropeanFloat.)
 */
export function leggiImporto(raw) {
  if (!raw) return 0;
  const v = String(raw).replace(/€/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/** Testo sicuro dentro l'HTML. */
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
