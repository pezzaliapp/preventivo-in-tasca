/*
 * Listino: catalogo, configuratore, filtri, accessori consigliati, ritagli delle figure
 * e indice delle sezioni. Portato da Listino in tasca 1.4.0 (js/app.js) senza cambiare
 * la logica; le funzioni ricevono catalogo e scelte come parametri.
 */

export const VEHICLES = [
  { id: 'auto', label: 'Auto', hint: 'Vetture, SUV, furgoni' },
  { id: 'moto', label: 'Moto', hint: 'Moto e scooter' },
  { id: 'truck', label: 'Truck', hint: 'Camion, bus, agricoli' }
];
export const ACTIVITIES = [
  { id: 'equilibratura', label: 'Equilibratura' },
  { id: 'smontaggio', label: 'Smontaggio gomme' },
  { id: 'sollevamento', label: 'Sollevamento' },
  { id: 'assetto', label: 'Assetto ruote' },
  { id: 'altro', label: 'Altre attrezzature' }
];
export const FEATURES = [
  { id: 'touch', label: 'Touchscreen', re: /touch/i, act: ['equilibratura'] },
  { id: 'sonar', label: 'Sonar', re: /sonar/i, act: ['equilibratura'] },
  { id: 'laser', label: 'Laser', re: /laser/i, act: ['equilibratura'] },
  { id: 'lift', label: 'Sollevatore ruote', re: /sollevatore|\bLIFT\b|VDLL/i, act: ['equilibratura', 'smontaggio'] },
  { id: 'nls', label: 'Bloccaggio rapido NLS', re: /\bNLS\b/, act: ['equilibratura'] },
  { id: 'rlc', label: 'Analisi pneumatico RLC', re: /\bRLC\b/, act: ['equilibratura'] },
  { id: 'freno', label: 'Freno a pedale', re: /freno/i, act: ['equilibratura'] },
  { id: 'prot', label: 'Protezione ruota', re: /protezione ruota/i, act: ['equilibratura'] },
  { id: 'auto', label: 'Acquisizione dati automatica', re: /acquisizione/i, act: ['equilibratura'] },
  { id: 'mi', label: 'Motoinverter (MI)', re: /\bMI\b/, act: ['smontaggio'] },
  { id: 'lever', label: 'Leverless', re: /leverless/i, act: ['smontaggio'] },
  { id: 'vel', label: '2 velocità', re: /2 vel|2 speed/i, act: ['smontaggio'] },
  { id: 'prem', label: 'Premitallone', re: /premitallone/i, act: ['smontaggio'] },
  { id: 'gt', label: 'Versione GT / Racing', re: /\bGT\b|racing/i, act: ['smontaggio'] }
];
export const POWER = [
  { id: 'mono', label: 'Monofase 230V', test: t => /\b(230|220)\s?-?V?|1\s?ph/i.test(t) },
  { id: 'tri', label: 'Trifase 400V', test: t => /400\s?V|3\s?ph/i.test(t) },
  { id: 'batt', label: 'Batteria 12/24V', test: t => /12V|24V|batteri/i.test(t) },
  { id: 'nd', label: 'Non indicata', test: null }
];
export const PRICE = [
  { id: 'p1', label: 'Fino a 5.000 €', min: 0, max: 5000 },
  { id: 'p2', label: '5.000 – 10.000 €', min: 5000, max: 10000 },
  { id: 'p3', label: '10.000 – 20.000 €', min: 10000, max: 20000 },
  { id: 'p4', label: 'Oltre 20.000 €', min: 20000, max: Infinity }
];
export const CFG_INIZIALE = () => ({ vehicle: null, activity: null, open: 'vehicle', sel: {}, acc: false, sort: 'listino' });

export const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const cap = s => s.charAt(0) + s.slice(1).toLowerCase();

export function fam(cat, id) { return (cat && cat.families[id]) || {}; }

export function powerGroups(p) {
  const t = (p.power || '') + ' ' + p.name;
  const g = POWER.filter(x => x.test && x.test(t)).map(x => x.id);
  return g.length ? g : ['nd'];
}

/**
 * Prepara il catalogo letto dal PDF: regole dei veicoli, chiavi, campi di ricerca.
 * `Regole` e `Cerca` sono i file di Listino in tasca (facoltativi, come nell'originale).
 * Restituisce la mappa chiave → articolo.
 */
export function preparaCatalogo(cat, { Regole, Cerca } = {}) {
  if (Regole) { try { Regole.applyVehicleRules(cat); } catch (e) { console.error(e); } }
  const byKey = new Map();
  for (const p of cat.products) {
    p.key = p.code + '|' + (p.power || '');
    const f = cat.families[p.family] || {};
    p._hay = norm([p.code, p.name, f.title, f.subtitle, f.sub, f.main].join(' '));
    if (Cerca) Cerca.prepare(p, f);
    p._feat = p.name + ' ' + (f.title || '');
    p._power = powerGroups(p);
    byKey.set(p.key, p);
  }
  return byKey;
}

/** Applica il book dell'agente: nomi corretti e veicoli idonei. */
export function applyPack(cat, pack, Cerca) {
  if (!pack || !cat) return;
  const names = pack.names || {};
  const veh = (pack.vehicles && pack.vehicles.byCode) || {};
  for (const p of cat.products) {
    if (names[p.code]) { p.name = names[p.code]; p.described = true; }
    const tags = veh[p.code];
    if (tags) {
      p.agentVehicles = tags;
      const v = new Set();
      if (tags.some(t => t === 'auto' || t === 'suv')) v.add('auto');
      if (tags.some(t => t === 'camion' || t === 'pullman' || t === 'agricoli')) v.add('truck');
      if (tags.includes('moto')) v.add('moto');
      if (v.size) p.vehicles = [...v];
    }
    if (Cerca) Cerca.prepare(p, fam(cat, p.family));
    p._feat = p.name + ' ' + (fam(cat, p.family).title || '');
  }
}

/* ---------- Configuratore ---------- */
export function machineBase(cat, cfg, withAcc) {
  return cat.products.filter(p =>
    (!cfg.vehicle || p.vehicles.includes(cfg.vehicle)) &&
    (!cfg.activity || p.activity === cfg.activity) &&
    (withAcc || !p.accessory));
}

export function filterGroups(cat, cfg, base) {
  const groups = [];
  const machines = base.filter(p => !p.accessory);
  if (!machines.length) return groups;
  // Tipologia: sottosezioni del listino
  const subs = new Map();
  for (const p of machines) { const s = fam(cat, p.family).sub || ''; if (s) subs.set(s, (subs.get(s) || 0) + 1); }
  if (subs.size > 1) groups.push({ id: 'tipo', label: 'Tipologia', opts: [...subs].map(([s, n]) => ({ id: s, label: s, n })) });
  // Caratteristiche
  const feats = FEATURES.filter(f => !cfg.activity || f.act.includes(cfg.activity))
    .map(f => ({ id: f.id, label: f.label, n: machines.filter(p => f.re.test(p._feat)).length }))
    .filter(o => o.n > 0 && o.n < machines.length);
  if (feats.length) groups.push({ id: 'feat', label: 'Caratteristiche', opts: feats, all: true });
  // Alimentazione
  const pw = POWER.map(x => ({ id: x.id, label: x.label, n: machines.filter(p => p._power.includes(x.id)).length })).filter(o => o.n > 0);
  if (pw.length > 1) groups.push({ id: 'power', label: 'Alimentazione', opts: pw });
  // Prezzo
  const pr = PRICE.map(x => ({ id: x.id, label: x.label, n: machines.filter(p => p.price >= x.min && p.price < x.max).length })).filter(o => o.n > 0);
  if (pr.length > 1) groups.push({ id: 'price', label: 'Prezzo di listino', opts: pr });
  return groups;
}

export function applyFilters(cat, cfg, list) {
  const sel = cfg.sel;
  return list.filter(p => {
    if (p.accessory) return true; // gli accessori non hanno questi filtri
    for (const g of Object.keys(sel)) {
      const v = sel[g];
      if (!v || !v.length) continue;
      if (g === 'tipo' && !v.includes(fam(cat, p.family).sub)) return false;
      if (g === 'feat' && !v.every(id => FEATURES.find(f => f.id === id).re.test(p._feat))) return false;
      if (g === 'power' && !v.some(id => p._power.includes(id))) return false;
      if (g === 'price' && !v.some(id => { const r = PRICE.find(x => x.id === id); return p.price >= r.min && p.price < r.max; })) return false;
    }
    return true;
  });
}

export function sortList(list, sort) {
  if (sort === 'asc') return [...list].sort((a, b) => a.price - b.price);
  if (sort === 'desc') return [...list].sort((a, b) => b.price - a.price);
  return list;
}

/** Conteggi dei passi 1 e 2 del configuratore. */
export const contaVeicolo = (cat, v) => cat.products.filter(p => !p.accessory && p.vehicles.includes(v)).length;
export const contaAttivita = (cat, cfg, a) => cat.products.filter(p => !p.accessory && p.activity === a && (!cfg.vehicle || p.vehicles.includes(cfg.vehicle))).length;
/** Cambiando veicolo, un'attività senza prodotti si azzera (come l'originale). */
export const attivitaAncoraValida = (cat, cfg) => cat.products.some(p => !p.accessory && p.activity === cfg.activity && (!cfg.vehicle || p.vehicles.includes(cfg.vehicle)));

/** Risultati raggruppati per famiglia, nell'ordine scelto. */
export function raggruppaPerFamiglia(list, sort) {
  const groups = new Map();
  for (const p of sortList(list, sort)) {
    if (!groups.has(p.family)) groups.set(p.family, []);
    groups.get(p.family).push(p);
  }
  return groups;
}

export function suggestedAccessories(cat, f) {
  if (f.accessory) return [];
  let subName = null;
  if (f.optionalPage) {
    const target = cat.families['p' + f.optionalPage];
    if (target) subName = target.sub;
  }
  if (subName) return cat.products.filter(p => p.accessory && fam(cat, p.family).sub === subName);
  return cat.products.filter(p => p.accessory && p.activity === f.activity && p.vehicles.some(v => f.vehicles.includes(v)) && fam(cat, p.family).accessory);
}

/* ---------- Figure dal PDF ---------- */
export function famCrop(f) {
  return f.accessory ? null : { x0: 0.04, x1: 0.46, y0: 0.085, y1: 0.5 };
}
/** Ritaglio della figura di un articolo: foto della macchina oppure riga dell'accessorio. */
export function productCrop(cat, p) {
  if (!p) return null;
  const f = fam(cat, p.family);
  if (!p.accessory && !f.accessory) { const c = famCrop(f); return c ? Object.assign({ page: p.page }, c) : null; }
  if (p.band) {
    // foto a sinistra del codice; se non c'e' spazio, tutta la riga
    if (p.band.xc > 0.12) return { page: p.page, x0: 0.055, x1: p.band.xc, y0: p.band.y0, y1: p.band.y1 };
    return { page: p.page, x0: 0.02, x1: p.band.x1 || 0.62, y0: p.band.y0, y1: p.band.y1 };
  }
  return null;
}

/* ---------- Ricerca e indice ---------- */
/** Ricerca: con cerca.js come l'originale, altrimenti per parole contenute. */
export function cerca(cat, q, Cerca) {
  if (Cerca) return Cerca.search(cat.products, q);
  const nq = norm(q).trim();
  const toks = nq.split(/\s+/).filter(Boolean);
  const list = cat.products.filter(p => toks.every(t => p._hay.includes(t)));
  list.sort((a, b) => (b.code.startsWith(nq) ? 1 : 0) - (a.code.startsWith(nq) ? 1 : 0));
  return list;
}

/** Indice del listino come menu: sezioni principali con sottosezioni e conteggi. */
export function sezioni(cat) {
  const idx = (cat.index || []).filter(e => cat.products.some(p => p.page >= e.page));
  const mains = [];
  let cur = null;
  for (const e of idx) {
    if (e.main) { cur = { e, subs: [] }; mains.push(cur); }
    else if (cur) cur.subs.push(e);
  }
  const count = (from, to) => cat.products.filter(p => p.page >= from && p.page < to).length;
  const nextPage = e => { const i = idx.indexOf(e); const nx = idx.slice(i + 1).find(x => x.page > e.page); return nx ? nx.page : 9999; };
  const nextMain = e => { const i = idx.indexOf(e); const nx = idx.slice(i + 1).find(x => x.main && x.page > e.page); return nx ? nx.page : 9999; };
  return mains.map(m => {
    const to = nextMain(m.e);
    return {
      nome: m.e.name, da: m.e.page, a: to, n: count(m.e.page, to),
      sotto: m.subs.map(s => { const a = Math.min(nextPage(s), to); return { nome: s.name, da: s.page, a, n: count(s.page, a) }; }).filter(s => s.n)
    };
  }).filter(m => m.n);
}
export const articoliSezione = (cat, da, a) => cat.products.filter(p => p.page >= da && p.page < a);
