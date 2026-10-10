/*
 * Preventivo: sconti in cascata, totali, IVA, numerazione e testo da condividere.
 * Portato da Listino in tasca 1.4.0 (js/app.js) senza cambiare i calcoli.
 * Funzioni pure: preventivo e impostazioni entrano come parametri.
 */
import { euro, percento } from './formato.js';
import { dataBreve } from './date.js';

/** Accetta "20", "20,5", "30+5", "30+10+2" (sconti in cascata). */
export function parseDisc(str) {
  const s = String(str == null ? '' : str).replace(/%/g, '').replace(/\s/g, '').replace(/,/g, '.');
  if (!s) return { factor: 1, pct: 0, valid: true };
  const parts = s.split('+').filter(Boolean);
  let f = 1;
  for (const p of parts) {
    const v = Number(p);
    if (!isFinite(v) || v < 0 || v > 100) return { factor: 1, pct: 0, valid: false };
    f *= 1 - v / 100;
  }
  return { factor: f, pct: (1 - f) * 100, valid: true };
}

/** La riga ha uno sconto suo (anche "0")? Se no vale lo sconto generale. */
export const scontoProprio = item => item.disc != null && String(item.disc).trim() !== '';

export function lineDisc(item, globalDisc) {
  return parseDisc(scontoProprio(item) ? item.disc : globalDisc);
}
export function lineNet(item, globalDisc) { return item.price * item.qty * lineDisc(item, globalDisc).factor; }

/** Totali del preventivo. `vat` = aliquota IVA dalle impostazioni. */
export function totals(quote, vat) {
  let gross = 0, net = 0, count = 0;
  for (const it of quote.items) { gross += it.price * it.qty; net += lineNet(it, quote.globalDisc); count += it.qty; }
  const vatV = quote.vatOn ? net * (Number(vat) || 0) / 100 : 0;
  return { gross, net, disc: gross - net, discPct: gross ? (1 - net / gross) * 100 : 0, vat: vatV, total: net + vatV, count, lines: quote.items.length };
}

/**
 * Prossimo numero "AAAA/NNN": il contatore riparte ogni anno.
 * Modifica `settings` (counterYear, counter) come l'originale e restituisce il numero.
 */
export function nextNumber(settings, anno) {
  if (settings.counterYear !== anno) { settings.counterYear = anno; settings.counter = 0; }
  settings.counter += 1;
  return `${anno}/${String(settings.counter).padStart(3, '0')}`;
}

/** Prezzi netti concordati (book): imposta il netto unitario di una riga. */
export function setLineNet(it, net) {
  if (it.custom || it.manual || !(it.price > 0)) { it.price = net; it.disc = '0'; return; }
  const d = Math.max(0, (1 - net / it.price) * 100);
  it.disc = String(Math.round(d * 1e6) / 1e6).replace('.', ',');
}
/** Stesso sconto su più righe, così che il netto complessivo sia quello richiesto. */
export function setGroupNet(lines, net) {
  const gross = lines.reduce((a, it) => a + it.price, 0);
  if (!(gross > 0)) return;
  const d = Math.max(0, (1 - net / gross) * 100);
  const v = String(Math.round(d * 1e6) / 1e6).replace('.', ',');
  lines.forEach(it => { it.disc = v; });
}

/**
 * Testo del preventivo per WhatsApp ed e-mail (solo prodotti, come Listino in tasca).
 * `extra` = righe aggiunte dal preventivo unico (noleggio), inserite prima delle note.
 */
export function shareText(quote, settings, extra = []) {
  const q = quote;
  const t = totals(q, settings.vat);
  const lines = q.items.map(it => {
    const d = lineDisc(it, q.globalDisc);
    return `• ${it.code ? it.code + ' ' : ''}${it.name}${it.qty > 1 ? ` (x${it.qty})` : ''}\n  ${euro(it.price * it.qty)}${d.pct ? ` − ${percento(d.pct)}% = ${euro(lineNet(it, q.globalDisc))}` : ''}`;
  });
  return [
    `Preventivo${q.number ? ' ' + q.number : ''}${q.customer ? ' per ' + q.customer : ''}`,
    dataBreve(q.date),
    '',
    ...lines,
    '',
    `Totale di listino: ${euro(t.gross)}`,
    t.disc ? `Sconto: − ${euro(t.disc)}` : null,
    `Totale netto: ${euro(t.net)}${q.vatOn ? '' : ' + IVA'}`,
    q.vatOn ? `Totale IVA ${settings.vat}% inclusa: ${euro(t.total)}` : null,
    ...extra,
    q.notes ? '\n' + q.notes : null,
    settings.seller ? '\n' + settings.seller : null
  ].filter(x => x !== null).join('\n');
}

/** Data di scadenza dell'offerta: data del preventivo + giorni di validità (30 se mancano). */
export function validoFino(dataISO, giorni) {
  return new Date(new Date(dataISO).getTime() + (Number(giorni) || 30) * 86400000);
}

/** Riga del preventivo che rappresenta il trasporto (aggiunta dal passo Consegna o scritta a mano). */
export const eRigaTrasporto = it => !!(it.trasporto || (it.custom && /trasport/i.test(it.name || '')));

/** Impostazioni iniziali dell'opzione noleggio di un preventivo (decisione a: trasporto incluso). */
export const NOLEGGIO_INIZIALE = durate => ({ attivo: true, modalita: 'mensile', durate: durate.slice(), includiTrasporto: true, contributo: '', benefici: true });

/* ---------- Nota per il cliente e trasporto (decisione D-42) ---------- */
export const NOTA_TRASPORTO_INCLUSO = 'Prezzi IVA esclusa. Trasporto incluso come indicato.';
const uguale = (a, b) => String(a || '').trim() === String(b || '').trim();

/**
 * Nota aggiornata quando il trasporto entra o esce dal preventivo. Si cambia solo una nota
 * predefinita (una delle `predefinite`) o quella del trasporto incluso: una nota scritta a mano resta.
 */
export function notaConTrasporto(notes, predefinite, haTrasporto) {
  if (haTrasporto && predefinite.some(n => uguale(notes, n))) return NOTA_TRASPORTO_INCLUSO;
  if (!haTrasporto && uguale(notes, NOTA_TRASPORTO_INCLUSO)) return predefinite[0];
  return notes;
}

/** Contraddizioni da segnalare prima di inviare (non vanno al cliente). */
export function contraddizioni(quote) {
  const out = [];
  const tr = quote.items.some(eRigaTrasporto);
  const n = quote.notes || '';
  if (tr && /trasport\w*[^.]*esclus|esclus\w*[^.]*trasport/i.test(n)) out.push('Le note per il cliente dicono che il trasporto è escluso, ma nel preventivo c\'è la riga del trasporto.');
  if (!tr && uguale(n, NOTA_TRASPORTO_INCLUSO)) out.push('Le note dicono "trasporto incluso come indicato", ma nel preventivo non c\'è la riga del trasporto.');
  return out;
}
