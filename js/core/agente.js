/*
 * Book dell'agente: postazioni, consiglio a domande, prezzi concordati e controlli sul
 * preventivo. Portato da Listino in tasca 1.4.0 (js/app.js) senza cambiare la logica.
 * Il contenuto del book è riservato all'agente: nulla di qui va in stampa o in condivisione.
 *
 * Parametri comuni: pack (book sbloccato), cat (catalogo), byKey (chiave → articolo),
 * quote (preventivo), fmt (formattazione degli importi, es. euro di formato.js).
 */
import { lineNet, setLineNet, setGroupNet } from './preventivo.js';
import { fam } from './listino.js';

export const VEH_LABEL = { moto: 'moto', auto: 'auto', suv: 'SUV', furgoni: 'furgoni', pullman: 'pullman', camion: 'camion', agricoli: 'agricoli' };

export const byCode = (cat, code) => cat ? cat.products.find(p => p.code === code) : null;
export const packNotesFor = (pack, code) => pack ? pack.notes.filter(n => n.codes.includes(code)) : [];

export function drawingsFor(pack, codes) {
  if (!pack || !pack.disegni) return [];
  return pack.disegni.filter(d => d.codes.some(c => codes.includes(c)));
}

/* ---------- Postazioni ---------- */
export const postazioniPer = (pack, vehicle) => pack && vehicle ? pack.postazioni.filter(p => p.vehicle === vehicle) : [];
export const alimentazioneIniziale = post => post.power === 'mono' ? 'mono' : 'tri';

/** Articoli della postazione, con il codice giusto per l'alimentazione scelta. */
export function postItems(pack, cat, post, opts) {
  const power = opts.power || alimentazioneIniziale(post);
  const rows = [];
  for (const it of post.items) rows.push({ code: it.alt ? (it.alt[power] || it.code) : it.code, label: it.label, required: true });
  for (const it of post.optional || []) rows.push({ code: it.code, label: it.label, required: false, on: !!(opts.optional && opts.optional[it.code]) });
  return rows.map(r => {
    const p = byCode(cat, r.code);
    const manual = !p && pack.manual[r.code];
    return Object.assign(r, { product: p, manual, price: p ? p.price : null });
  });
}
export function postTotal(pack, cat, post, opts) {
  let sum = 0, missing = 0;
  for (const r of postItems(pack, cat, post, opts || {})) {
    if (!r.required && !r.on) continue;
    if (r.price == null) missing++; else sum += r.price;
  }
  return { sum, missing };
}

/** Righe da aggiungere al preventivo per una postazione (articoli del listino o voci manuali senza prezzo). */
export function righePostazione(pack, cat, post, opts, uid) {
  const nuove = [];
  for (const r of postItems(pack, cat, post, opts)) {
    if (!r.required && !r.on) continue;
    if (r.product) nuove.push({ product: r.product });
    else nuove.push({ item: { id: uid(), key: null, custom: true, manual: true, code: r.code, name: r.manual ? r.manual.name : r.label, power: '', price: 0, qty: 1, disc: '' } });
  }
  return nuove;
}

/* ---------- Consiglio a domande ---------- */
export function wizardResult(pack, a) {
  const T = pack.wizard.auto.results;
  if (a.mestiere === 'servizio') return { ids: ['auto-base'], why: T.base };
  if (!a.mestiere) {
    if (a.ruote === 'low') return { ids: ['auto-base'], partial: true, why: T.baseLow };
    return null;
  }
  if (a.ruote === 'high' || a.ribassati === 'si') {
    const why = a.ruote === 'high' ? T.altaHigh : T.altaRib;
    if (a.alta === 'cm') return { ids: ['auto-alta-cm'], why: why + ' ' + T.cm, alta: true };
    if (a.alta === 'puma') return { ids: ['auto-alta-puma'], why: why + ' ' + T.puma, alta: true };
    return { ids: ['auto-alta-puma', 'auto-alta-cm'], why: why + ' ' + T.both, alta: true };
  }
  if (!a.corrente || !a.ribassati) return null;
  return a.corrente === 'tri' ? { ids: ['auto-media-a'], why: T.mediaA } : { ids: ['auto-media-b'], why: T.mediaB };
}

/* ---------- Prezzi concordati e trasporto specifico ---------- */
export const firstLine = (quote, code) => quote.items.find(i => i.code === code);
const packBaseLines = (quote, pb) => { const l = pb.codes.map(c => firstLine(quote, c)); return l.every(Boolean) ? l : null; };
const b300Context = (quote, b) => b.withCodes.every(c => quote.items.some(i => i.code === c));
export const hasTransportFor = (quote, label) => quote.items.some(i => i.custom && i.name.trim().toLowerCase() === label.toLowerCase());
export function addTransportLine(quote, label, price, uid) {
  if (hasTransportFor(quote, label)) return;
  quote.items.push({ id: uid(), key: null, custom: true, code: '', name: label, power: '', price, qty: 1, disc: '0' });
}
export function applyPackPricing(pack, quote, uid) {
  const pr = pack.pricing;
  if (!pr) return;
  const pb = pr.packBase, b = pr.b300;
  const lines = pb && packBaseLines(quote, pb);
  if (lines) setGroupNet(lines, pb.net);
  const b3 = b && firstLine(quote, b.code);
  if (b3) { setLineNet(b3, b300Context(quote, b) ? b.netWith : b.netAlone); addTransportLine(quote, b.transportLabel, b.transport, uid); }
}
/** Imposta il netto di un gruppo di righe (pulsante "netto pacchetto"). */
export function nettoPacchetto(quote, codes, net) {
  const lines = codes.map(c => firstLine(quote, c));
  if (lines.some(l => !l)) return false;
  setGroupNet(lines, net);
  return true;
}

function pricingChecks(pack, quote, out, covered, fmt) {
  const pr = pack.pricing;
  if (!pr) return;
  const unit = it => lineNet(it, quote.globalDisc) / (it.qty || 1);
  const near = (a, x) => Math.abs(a - x) < 0.5;
  const b = pr.b300, pb = pr.packBase;
  if (b) {
    const it = firstLine(quote, b.code);
    if (it) {
      const withPack = b300Context(quote, b);
      const exp = withPack ? b.netWith : b.netAlone;
      const fill = t => String(t).replace('{ctx}', withPack ? b.ctxWith : b.ctxAlone).replace(/\{exp\}/g, fmt(exp)).replace('{net}', fmt(unit(it))).replace(/\{price\}/g, fmt(b.transport));
      if (near(unit(it), exp)) out.push({ kind: 'ok', msg: fill(b.msgOk) });
      else out.unshift({ kind: 'must', msg: fill(b.msgWrong), setNet: { id: it.id, net: exp, label: fill(b.fixLabel) } });
      covered.add(b.code); // il trasporto della B 300 ha la sua regola
      if (!hasTransportFor(quote, b.transportLabel)) out.unshift({ kind: 'must', msg: fill(b.transportMsg), addTransport: { label: b.transportLabel, price: b.transport, text: fill(b.transportAdd) } });
    }
  }
  if (pb) {
    const lines = packBaseLines(quote, pb);
    if (lines) {
      const net = lines.reduce((a, it) => a + unit(it), 0);
      const hasB = !!firstLine(quote, pb.b300);
      const fill = t => String(t).replace(/\{exp\}/g, fmt(pb.net)).replace(/\{total\}/g, fmt(pb.total)).replace('{net}', fmt(net)).replace('{tot}', hasB ? String(pb.totText).replace('{total}', fmt(pb.total)) : '');
      if (near(net, pb.net)) out.push({ kind: 'ok', msg: fill(pb.msgOk) });
      else out.unshift({ kind: 'tip', msg: fill(pb.msgWrong), packNet: { codes: pb.codes.join(','), net: pb.net, label: fill(pb.fixLabel) } });
    }
  }
}

/** Controlli sul preventivo: accessori da non dimenticare, trasporto, installazione, garanzia. */
export function quoteChecks({ pack, cat, byKey, quote, fmt }) {
  if (!pack) return [];
  const items = quote.items;
  const codes = new Set(items.map(i => i.code));
  const prods = items.map(i => i.key ? byKey.get(i.key) : null).filter(Boolean);
  const out = [];
  for (const r of pack.rules) {
    let hit;
    if (r.when) hit = r.when.some(c => codes.has(c));
    else if (r.whenSub) hit = prods.some(p => !p.accessory && new RegExp(r.whenSub, 'i').test(fam(cat, p.family).sub || ''));
    else if (r.whenActivity) hit = prods.some(p => !p.accessory && p.activity === r.whenActivity && !(r.exceptCodes || []).includes(p.code));
    else if (r.nameMatch) hit = prods.some(p => new RegExp(r.nameMatch).test(p.name));
    if (!hit) continue;
    if (r.need) {
      const missing = r.need.filter(c => !codes.has(c));
      if (r.any ? missing.length < r.need.length : !missing.length) continue;
      out.push({ kind: r.kind, msg: r.msg, add: missing.filter(c => byCode(cat, c)) });
    } else out.push({ kind: 'info', msg: r.msg });
  }
  for (const it of items) {
    if (it.custom && it.manual && !(it.price > 0)) out.unshift({ kind: 'must', msg: `${it.code} ${it.name}: non è nel listino, inserisci il prezzo nella riga.` });
  }
  const tr = pack.transport;
  const incl = [];
  const covered = new Set();
  for (const c in tr.includedCodes) {
    const rule = typeof tr.includedCodes[c] === 'string' ? { text: tr.includedCodes[c] } : tr.includedCodes[c];
    for (const it of items.filter(i => i.code === c)) {
      const unitNet = lineNet(it, quote.globalDisc) / (it.qty || 1);
      const fill = t => String(t || '').replace(/\{min\}/g, fmt(rule.minNet)).replace(/\{net\}/g, fmt(unitNet));
      if (rule.minNet && unitNet < rule.minNet - 0.005) {
        out.unshift({ kind: 'must', msg: fill(rule.belowMsg), setNet: { id: it.id, net: rule.minNet, label: fill(rule.fixLabel) } });
        if ((quote.notes || '').includes(rule.text)) out.unshift({ kind: 'must', msg: 'Le note per il cliente dicono «' + rule.text + '», ma con questo prezzo non è così.', removeNote: rule.text });
      } else {
        covered.add(c);
        out.push({ kind: 'ok', msg: rule.minNet ? fill(rule.okMsg) : rule.text, note: rule.text });
        incl.push(rule.text);
      }
    }
  }
  if (tr.includedPack.codes.every(c => codes.has(c))) {
    incl.push(tr.includedPack.text);
    out.push({ kind: 'ok', msg: tr.includedPack.text, note: tr.includedPack.text });
  }
  pricingChecks(pack, quote, out, covered, fmt);
  const dws = drawingsFor(pack, [...codes]);
  if (dws.length) out.push({ kind: 'info', msg: 'Disegni per l\'incasso: ' + dws.map(d => d.title).join(', ') + '. Se il cliente installa a incasso, mandaglieli con l\'ordine.', drawings: dws });
  const hasMachines = prods.some(p => !p.accessory) || items.some(i => i.manual);
  const specificTransport = pack.pricing ? Object.values(pack.pricing).map(x => (x.transportLabel || '').toLowerCase()).filter(Boolean) : [];
  const hasTransportLine = items.some(i => i.custom && /trasport/i.test(i.name) && !specificTransport.includes(i.name.trim().toLowerCase()));
  const hasInstallLine = items.some(i => i.custom && /install/i.test(i.name));
  // macchine non coperte dal trasporto incluso
  if (tr.includedPack.codes.every(c => codes.has(c))) { tr.includedPack.codes.forEach(c => covered.add(c)); (tr.includedPack.alsoCovers || []).forEach(c => covered.add(c)); }
  // le voci libere di trasporto specifiche (es. "Trasporto B 300") non valgono come trasporto generale
  const uncovered = items.some(i => !covered.has(i.code) && (i.manual || (i.key && byKey.get(i.key) && !byKey.get(i.key).accessory)));
  if (uncovered && !hasTransportLine) out.push({ kind: 'tip', msg: incl.length ? tr.tipOther : tr.tipQuote, custom: 'Trasporto' });
  if (hasMachines && !hasInstallLine) out.push({ kind: 'tip', msg: tr.tipInstall, custom: 'Installazione' });
  if (hasMachines) out.push({ kind: 'info', msg: tr.warranty, note: tr.warrantyNote });
  return out;
}

/** Ordine di visualizzazione dei controlli (come checksHTML dell'originale). */
export function ordinaControlli(list) {
  const order = { must: 0, tip: 1, ok: 2, info: 3 };
  return list.slice().sort((a, b) => order[a.kind] - order[b.kind]);
}

/** Note dell'agente per una famiglia di articoli (scheda prodotto). */
export function noteFamiglia(pack, items) {
  if (!pack) return null;
  const codes = items.map(p => p.code);
  const notes = [];
  for (const n of pack.notes) if (n.codes.some(c => codes.includes(c)) && !notes.includes(n)) notes.push(n);
  const infos = pack.rules.filter(r => r.kind === 'info' && r.when && r.when.some(c => codes.includes(c)));
  const tags = (items.find(p => p.agentVehicles) || {}).agentVehicles;
  const dws = drawingsFor(pack, codes);
  if (!notes.length && !infos.length && !tags && !dws.length) return null;
  return { notes, infos, tags, dws };
}

/** Testo delle note per il cliente senza una riga (pulsante "Togli dalle note"). */
export function togliNota(notes, n) {
  return (notes || '').split('\n').filter(l => l.trim() !== n).join('\n').replace(n, '').trim();
}
export function aggiungiNota(notes, n) {
  return (notes ? notes.replace(/\s+$/, '') + '\n' : '') + n;
}
