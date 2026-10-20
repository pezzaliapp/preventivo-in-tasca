/*
 * Costo di trasporto: calcoli portati da calcolo-trasporti (build 13, dati v2)
 * senza cambiare formule, ordine delle operazioni o arrotondamenti.
 *
 * Differenze rispetto all'originale, solo di forma:
 *  - niente variabili globali: dati (D), carico e scelte (S), adeguamento (ADJ)
 *    e gasolio (FUEL) entrano come parametri;
 *  - il riepilogo usa la data italiana passata da fuori (decisione S-06) e gli
 *    importi con il punto delle migliaia (S-08).
 */
import { euroOTrattino, it1, itN } from './formato.js';
import { dataIt } from './date.js';

export const DATI_VERSIONE = 2;      // deve coincidere con "versione" in pallet.json e groupage.json
export const ISOLE = ['SICILIA', 'SARDEGNA'];
export const FUEL_DEFAULTS = { on: false, share: 30, shareIs: 15 };
export const ADJ_MIN = -90, ADJ_MAX = 300;

export const round2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
export const num = (v, d = 0) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : d; };
export const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/* ====================== Colli e pallet (non dipendono dalle tariffe) ====================== */
/* Criteri di classificazione dei pallet 2026:
   classe dal peso e dall'altezza, maggiorazione per area di base, lunghezza o peso: si applica la maggiore. */
export function palletClass(kg, h) {
  if (kg <= 150) return h <= 60 ? 'MINI' : h <= 80 ? 'QUARTER' : h <= 120 ? 'HALF' : h <= 160 ? 'MEDIUM' : 'LIGHT';
  if (kg <= 300) return h <= 80 ? 'QUARTER' : h <= 120 ? 'HALF' : h <= 160 ? 'MEDIUM' : 'LIGHT';
  if (kg <= 450) return h <= 120 ? 'HALF' : h <= 160 ? 'MEDIUM' : 'LIGHT';
  if (kg <= 600) return h <= 160 ? 'MEDIUM' : 'LARGE';
  if (kg <= 750) return 'LARGE';
  if (kg <= 900) return 'FULL';
  if (kg <= 1050) return 'BIG';
  return 'MEGA';
}
export function palletAreaPct(m2) {
  const T = [[1.28, 0], [1.39, 10], [1.59, 30], [1.89, 50], [2.27, 80], [2.51, 100], [2.87, 130], [3.07, 150], [3.84, 200]];
  for (const [max, pct] of T) if (m2 <= max + 0.005) return pct;
  return null;
}
export function palletWeightPct(kg) {
  if (kg <= 1200) return 0;
  if (kg <= 1800) return Math.ceil((kg - 1200) / 100) * 10;
  return null;
}
/** Classifica un collo: { type, pct, note } oppure null se non può viaggiare su pallet. */
export function palletPkg(kg, l1, l2, h) {
  kg = num(kg);
  if (![l1, l2, h].every(x => x > 0)) return null;
  const long = Math.max(l1, l2), short = Math.min(l1, l2);
  if (h > 240 || kg > 1800 || long > 300) return null;
  const wPct = palletWeightPct(kg);
  if (long > 240) {
    if (short > 120) return null;
    return { type: 'MEGA', pct: Math.max(long <= 270 ? 300 : 320, wPct), note: `lunghezza ${itN(long)} cm` };
  }
  const area = Math.round(l1 * l2 / 100) / 100;           // m² a due decimali, come nella tabella
  let aPct = palletAreaPct(area);
  if (aPct === null) return null;
  const type = palletClass(kg, h);
  if (type === 'MINI' || type === 'QUARTER') aPct = 0;      // nessuna maggiorazione per MINI e QUARTER
  const fuori = short > 160 || long > 240;
  return { type, pct: Math.max(aPct, wPct), note: aPct ? `base ${it1(area, 2)} m²${fuori ? ', misure oltre lo standard 240×160' : ''}` : '' };
}
export function palletOversize(a) {
  const m = a?.misure;
  return Array.isArray(m) && m.length === 3 ? palletPkg(a.kg, m[0], m[1], m[2]) : null;
}
export function pieces(a) {
  const out = [];
  (a?.colli || []).forEach(c => { for (let i = 0; i < (c.n || 1); i++) out.push(c); });
  return out;
}
export function totKg(a) { return a?.colli ? pieces(a).reduce((s, c) => s + num(c.kg), 0) : num(a?.kg); }

/** Pallet necessari per un prodotto: [{ type, pct, note }] oppure null se non può andare su pallet. */
export function productPallets(a) {
  if (!a) return null;
  if (a.colli) {
    const ps = pieces(a);
    if (!ps.length) return null;
    const res = ps.map(c => palletPkg(c.kg, c.l, c.p, c.h));
    return res.every(Boolean) ? res : null;
  }
  if (a.groupage) { const o = palletOversize(a); return o ? [o] : null; }
  if (a.pallet) return [{ type: a.pallet, pct: 0, note: '', fixed: true }];
  return null;
}
/** Ingombro in groupage: metri di pianale (larghezza utile 2,4 m), quintali, colli. */
export function productGroupage(a) {
  if (a?.colli) {
    const ps = pieces(a);
    if (!ps.length) return null;
    const area = ps.reduce((s, c) => s + c.l * c.p / 10000, 0);
    const longest = Math.max(...ps.map(c => Math.max(c.l, c.p) / 100));
    return { ml: round2(Math.max(area / 2.4, longest > 2.4 ? longest : 0)), q: round2(totKg(a) / 100), b: ps.length };
  }
  if (a?.groupage) return { ml: num(a.groupage.ml), q: num(a.groupage.quintali), b: num(a.groupage.bancali, 1) };
  if (a?.pallet) return { ml: 0.6, q: num(a.kg) / 100, b: 1 };
  return null;
}

export function groupageBand(zona, ml, q, b) {
  const f = zona.fasce;
  const idx = (val, arr) => {
    if (!(val > 0) || !arr) return { i: 0, over: false };
    const i = arr.findIndex(lim => val <= lim + 1e-9);
    return i === -1 ? { i: arr.length - 1, over: true } : { i, over: false };
  };
  const r = [idx(ml, f.ml), idx(b, f.bancali), idx(q, f.quintali)];
  const i = Math.max(...r.map(x => x.i));
  return { i, over: r.some(x => x.over), ml: f.ml[i], b: f.bancali[i], q: f.quintali[i],
    // per le frasi della Consegna: tariffa minima (tutto entro la prima fascia) o chi ha deciso la fascia
    minima: i === 0, decisaDa: ['ml', 'bancali', 'quintali'].filter((k, n) => r[n].i === i) };
}

/** Frase della fascia groupage per lo schermo (decisione D-48). */
export function fraseFascia(fascia, zonaFasce) {
  const f = zonaFasce;
  if (fascia.minima) return `Tariffa minima (carico sotto la prima fascia: ${itN(f.ml[0])} m · ${f.bancali[0]} bancali · ${f.quintali[0]} q)`;
  const nomi = { ml: 'dai metri lineari', bancali: 'dai bancali', quintali: 'dal peso' };
  const da = fascia.decisaDa.map(k => nomi[k]);
  return `Fascia fino a ${itN(fascia.ml)} m · ${fascia.b} bancali · ${fascia.q} q, decisa ${da.length > 1 ? da.slice(0, -1).join(', ') + ' e ' + da.at(-1) : da[0]}`;
}

/**
 * Impila i colli sovrapponibili (decisione D-49): al massimo `livelliMassimi` (2) livelli e
 * `altezzaMassimaCm` (240) in totale; sopra va solo un collo che sta nell'ingombro di quello sotto.
 * Si mettono sotto i colli più grandi; ogni collo sotto prende il più grande che ci sta sopra.
 * Restituisce le pile, l'area a terra (m²) e la lunghezza più grande (m).
 */
export function impila(pezzi, regole) {
  const liberi = pezzi.map(p => ({ ...p, area: p.l * p.p, lungo: Math.max(p.l, p.p), corto: Math.min(p.l, p.p) }))
    .sort((a, b) => b.area - a.area || b.h - a.h);
  const usati = new Set();
  const pile = [];
  for (let i = 0; i < liberi.length; i++) {
    if (usati.has(i)) continue;
    usati.add(i);
    const pila = [liberi[i]];
    let altezza = liberi[i].h;
    while (pila.length < regole.livelliMassimi) {
      const sotto = pila[pila.length - 1];
      let scelto = -1;
      for (let j = i + 1; j < liberi.length; j++) {
        const c = liberi[j];
        if (usati.has(j) || c.lungo > sotto.lungo || c.corto > sotto.corto || altezza + c.h > regole.altezzaMassimaCm) continue;
        scelto = j; break; // già in ordine dal più grande
      }
      if (scelto < 0) break;
      usati.add(scelto);
      pila.push(liberi[scelto]);
      altezza += liberi[scelto].h;
    }
    pile.push(pila);
  }
  return {
    pile,
    area: pile.reduce((a, pila) => a + pila[0].l * pila[0].p / 10000, 0),
    lungo: Math.max(0, ...pile.map(pila => pila[0].lungo / 100))
  };
}

/** Colli di un articolo per l'impilamento: i colli del prospetto, oppure le misure del catalogo precedente. */
export function pezziImpilabili(a) {
  if (!a || !a.sovrapponibile) return null;
  if (a.colli) { const ps = pieces(a); return ps.length && ps.every(c => c.l > 0 && c.p > 0 && c.h > 0) ? ps.map(c => ({ l: c.l, p: c.p, h: c.h, kg: num(c.kg), nome: a.nome })) : null; }
  if (Array.isArray(a.misure) && a.misure.length === 3 && a.misure.every(x => x > 0)) return [{ l: a.misure[0], p: a.misure[1], h: a.misure[2], kg: num(a.kg), nome: a.nome }];
  return null;
}

/** Fonte del prezzo del gasolio salvato: "MIMIT", "MASE settimanale" o "Bollettino UE" (senza fonte: MIMIT). */
export function fonteGasolio(gasolio) {
  return gasolio?.attuale?.fonte || 'MIMIT';
}

/** Variazione % del gasolio rispetto al prezzo base del listino, o null. */
export function fuelDelta(gasolio) {
  const g = gasolio;
  if (!g?.base?.prezzo || !g?.attuale?.prezzo) return null;
  return (g.attuale.prezzo / g.base.prezzo - 1) * 100;
}
export function fuelPctFor(gasolio, FUEL, reg) {
  const d = fuelDelta(gasolio);
  if (!FUEL.on || d === null) return 0;
  return d * (ISOLE.includes(reg) ? FUEL.shareIs : FUEL.share) / 100;
}

/** Controllo versione dati: false se programma e tariffe non coincidono. */
export function versioneDatiOk(D) {
  return D.pallet?.versione === DATI_VERSIONE && D.groupage?.versione === DATI_VERSIONE;
}

/* ====================== Calcolo con le tariffe ====================== */
/**
 * Prepara il calcolatore per un insieme di dati:
 * D = { listini, pallet, groupage, articoli, geo, gasolio }.
 */
export function creaTrasporti(D) {
  const artById = id => D.articoli.find(a => a.id === id) || null;
  const regById = id => D.geo.find(r => r.id === id) || null;
  const palletType = id => (D.pallet?.tipi || []).find(t => t.id === id) || null;

  function lineService(line) {
    if (line.kind === 'manual') return line.manual.type;
    const a = artById(line.artId);
    if (!a) return 'quote';
    if (productPallets(a)) return 'pallet';
    if (productGroupage(a)) return 'groupage';
    return 'quote';
  }
  function lineTitle(line) {
    if (line.kind === 'manual') return line.manual.type === 'pallet' ? `Collo su pallet ${line.manual.pallet}` : 'Collo in groupage';
    return artById(line.artId)?.nome || 'Articolo';
  }
  function palletDesc(id) {
    const t = palletType(id);
    if (!t) return id;
    const base = `h ${t.altezzaCm} cm, fino a ${t.kgMax} kg`;
    return t.nota ? `${base}, ${t.nota}` : base;
  }
  /* Tariffa di un pallet: usa la riga del listino con la maggiorazione se esiste, altrimenti la applica */
  function palletRate(reg, pl) {
    const rates = D.pallet.tariffe[reg] || {};
    if (pl.fixed) return rates[pl.type] ?? null;
    const exact = rates[`${pl.type} + ${pl.pct}%`];
    if (pl.pct && exact != null) return exact;
    return rates[pl.type] != null ? rates[pl.type] * (1 + pl.pct / 100) : null;
  }
  function findGroupage(provSigla, regId) {
    for (const z of D.groupage?.zone || []) {
      for (const g of z.gruppi) {
        if (g.province.includes(provSigla)) return { zona: z, gruppo: g };
        if (g.tutte && regId && norm(g.regione) === norm(regId)) return { zona: z, gruppo: g };
      }
    }
    return null;
  }
  function groupageLoad(items, opts = {}) {
    let ml = 0, q = 0, b = 0;
    // Colli sovrapponibili impilati (interruttore della Consegna, spento di base): i metri lineari
    // si calcolano sull'ingombro a terra dopo l'impilamento; peso e bancali come prima.
    const regole = D.sovrapposizione;
    if (opts.impila && regole) {
      const pezzi = [];
      const resto = [];
      for (const it of items) {
        const a = it.line.kind === 'art' ? artById(it.line.artId) : null;
        const ps = pezziImpilabili(a);
        if (!ps) { resto.push(it); continue; }
        for (let k = 0; k < it.qty; k++) pezzi.push(...ps);
        const g = productGroupage(a);
        q += g.q * it.qty; b += g.b * it.qty;
      }
      if (pezzi.length) {
        const st = impila(pezzi, regole);
        ml += round2(Math.max(st.area / 2.4, st.lungo > 2.4 ? st.lungo : 0));
        const base = groupageLoad(resto);
        return { ml: round2(ml + base.ml), q: round2(q + base.q), b: Math.round(b + base.b), pile: st.pile, lungo: st.lungo };
      }
    }
    for (const { line, qty } of items) {
      if (line.kind === 'manual') {
        ml += num(line.manual.ml) * qty; q += num(line.manual.q) * qty; b += num(line.manual.b) * qty;
      } else {
        const g = productGroupage(artById(line.artId));
        if (g) { ml += g.ml * qty; q += g.q * qty; b += g.b * qty; }
      }
    }
    return { ml: round2(ml), q: round2(q), b: Math.round(b) };
  }

  /* mode: "auto" (per ogni prodotto il servizio più conveniente), "pallet" (dove possibile), "groupage" (tutto in groupage) */
  function decideService(line, mode, reg, prov) {
    const base = lineService(line);
    if (line.kind !== 'art' || base === 'quote') return { svc: base };
    const a = artById(line.artId);
    const pal = productPallets(a);
    const grp = productGroupage(a);
    if (!pal) return { svc: grp ? 'groupage' : 'quote' };
    if (a.soloPallet || !grp) return { svc: 'pallet', pal };
    if (mode === 'groupage') return { svc: 'groupage' };
    if (mode === 'pallet' || !reg) return { svc: 'pallet', pal };
    // automatico: per ogni prodotto il servizio che costa meno
    const rates = pal.map(pl => palletRate(reg, pl));
    if (rates.some(r => r == null)) return { svc: 'groupage' };
    const palCost = rates.reduce((x, y) => x + y, 0);
    const hit = findGroupage(prov, reg);
    if (!hit) return { svc: 'pallet', pal };
    const band = groupageBand(hit.zona, grp.ml, grp.q, grp.b);
    return palCost <= hit.gruppo.prezzi[band.i] ? { svc: 'pallet', pal } : { svc: 'groupage' };
  }

  function computeMode(S, ADJ, FUEL, mode = 'auto') {
    const R = { lines: [], notes: [], infos: [], total: null, used: new Set(), alt: [], ready: false };
    const reg = S.reg, prov = S.prov;
    const cart = S.cart.map(line => ({ line, qty: Math.max(1, line.qty | 0), ...decideService(line, mode, reg, prov) }));
    if (!cart.length) return R;

    const opts = S.opts;
    let costTot = 0;
    let priced = false;

    if (!reg) { R.notes.push('Scegli la regione di destinazione per vedere il costo.'); }

    /* --- Pallet --- */
    const pal = cart.filter(c => c.svc === 'pallet');
    if (pal.length && reg) {
      const reg0 = D.pallet.regole;
      let sub = 0, nPal = 0;
      const missing = [];
      for (const c of pal) {
        const list = c.line.kind === 'manual' ? [{ type: c.line.manual.pallet, pct: 0, note: '', fixed: true }] : c.pal;
        const rs = list.map(pl => palletRate(reg, pl));
        if (rs.some(r => r == null)) { missing.push(lineTitle(c.line)); continue; }
        const cost = rs.reduce((x, y) => x + y, 0) * c.qty;
        sub += cost; nPal += list.length * c.qty;
        const lab = pl => `${pl.type}${!pl.fixed && pl.pct ? ` +${pl.pct}%` : ''}`;
        let desc;
        if (list.length === 1) {
          const pl = list[0];
          desc = `${c.qty} × pallet ${lab(pl)}${!pl.fixed && pl.pct ? ` fuori misura (${pl.note})` : ''}`;
        } else {
          const counts = {};
          list.forEach(pl => { const k = lab(pl); counts[k] = (counts[k] || 0) + 1; });
          desc = `${c.qty > 1 ? c.qty + ' × ' : ''}${list.length} colli su pallet: ${Object.entries(counts).map(([k, n]) => (n > 1 ? n + ' × ' : '') + k).join(', ')}`;
        }
        R.lines.push({ t: lineTitle(c.line), s: desc, v: round2(cost) });
        if (list.some(pl => !pl.fixed && pl.pct)) R.ovs = true;
      }
      if (missing.length) R.notes.push(`Tariffa pallet non trovata per: ${missing.join(', ')}.`);
      if (nPal) {
        const sped = Math.ceil(nPal / reg0.maxPalletPerSpedizione);
        if (sped > 1) R.infos.push(`${nPal} pallet: il trasportatore accetta al massimo ${reg0.maxPalletPerSpedizione} pallet per spedizione, calcolate ${sped} spedizioni.`);
        if (opts.pre) {
          const c = reg0.preavvisoEuro * sped;
          sub += c;
          R.lines.push({ t: 'Preavviso telefonico', s: sped > 1 ? `${sped} spedizioni` : '1 spedizione', v: round2(c), minor: true });
        }
        if (opts.ass) {
          const c = sub * reg0.assicurazionePct / 100;
          sub += c;
          R.lines.push({ t: 'Assicurazione all risk pallet', s: `${reg0.assicurazionePct}%`, v: round2(c), minor: true });
        }
        costTot += sub; priced = true; R.used.add('pallet');
      }
    }

    /* --- Groupage --- */
    const grp = cart.filter(c => c.svc === 'groupage');
    if (grp.length && reg) {
      const regObj = regById(reg);
      const needProv = !(regObj && D.groupage.zone.some(z => z.gruppi.some(g => g.tutte && norm(g.regione) === norm(reg))));
      if (needProv && !prov) {
        R.notes.push('Scegli la provincia: il groupage ha tariffe diverse per provincia.');
      } else {
        const hit = findGroupage(prov, reg);
        if (!hit) {
          R.notes.push('Nessuna tariffa groupage per questa provincia.');
        } else {
          const load = groupageLoad(grp, opts);
          const band = groupageBand(hit.zona, load.ml, load.q, load.b);
          let c = hit.gruppo.prezzi[band.i];
          const names = grp.map(g => `${g.qty > 1 ? g.qty + ' × ' : ''}${lineTitle(g.line)}`).join(', ');
          const carico = [load.ml ? `${itN(load.ml)} m` : null, load.b ? `${load.b} ${load.b === 1 ? 'bancale' : 'bancali'}` : null, load.q ? `${itN(load.q)} q` : null].filter(Boolean).join(', ');
          R.lines.push({
            t: `Groupage: ${names}`,
            s: `Carico ${carico}. Fascia fino a ${itN(band.ml)} m, ${band.b} bancali, ${band.q} q`,
            v: round2(c)
          });
          if (band.over) R.notes.push("Il carico supera l'ultima fascia del listino groupage: la cifra è una stima minima, va richiesta una quotazione.");
          if (opts.ass) {
            const a = c * D.groupage.regole.assicurazionePct / 100;
            c += a;
            R.lines.push({ t: 'Assicurazione all risk groupage', s: `${D.groupage.regole.assicurazionePct}%`, v: round2(a), minor: true });
          }
          if (reg === 'SICILIA') R.infos.push('Sicilia: tariffa groupage per resa intermodale.');
          const lung = /SUD|ISOLE/i.test(hit.zona.zona) ? 16 : 12;
          R.infos.push(`Groupage: verificare che a destino possa accedere un automezzo lungo fino a ${lung} m.`);
          costTot += c; priced = true; R.used.add('groupage');
        }
      }
    }

    /* --- Articoli non quotabili e avvisi prodotto --- */
    const quote = cart.filter(c => c.svc === 'quote');
    if (quote.length) R.notes.push(`Imballo non disponibile per ${quote.map(c => lineTitle(c.line)).join(', ')}: costo da richiedere, non incluso nel totale.`);
    const arts = cart.filter(c => c.line.kind === 'art').map(c => artById(c.line.artId)).filter(Boolean);
    const prev = arts.filter(a => a.preventivo).map(a => a.nome);
    if (prev.length && (R.used.has('groupage') || R.ovs)) R.notes.push(`Prodotti di grandi dimensioni (${prev.join(', ')}): stima da confermare con il trasportatore.`);
    const noSp = arts.filter(a => a.noSponda).map(a => a.nome);
    if (noSp.length) R.infos.push(`Scarico senza sponda idraulica per ${noSp.join(', ')}: a destino serve un mezzo di sollevamento.`);
    const cor = arts.filter(a => a.corriere).map(a => a.nome);
    if (cor.length) R.infos.push(`${cor.join(', ')}: articolo piccolo, di solito conviene il corriere espresso.`);
    if (opts.dis && priced && !(num(opts.disEur) > 0)) R.notes.push('Località disagiata o oltre 30 km dal capoluogo: possibile supplemento, il costo va confermato.');

    if (!priced) return R;

    /* --- Adeguamenti --- */
    const base = round2(R.lines.reduce((s, l) => s + l.v, 0));
    let total = base;
    if (ADJ) {
      const v = round2(base * ADJ / 100);
      R.lines.push({ t: `Adeguamento costi ${ADJ > 0 ? '+' : '−'}${it1(Math.abs(ADJ))}%`, s: 'Impostato su questo dispositivo', v, minor: true, adj: true });
      total = round2(total + v);
    }
    const fp = fuelPctFor(D.gasolio, FUEL, reg);
    if (fp) {
      const v = round2(total * fp / 100);
      R.lines.push({ t: `Adeguamento gasolio ${fp > 0 ? '+' : '−'}${it1(Math.abs(fp))}%`, s: `Prezzo ${fonteGasolio(D.gasolio)} del ${dataIt(D.gasolio.attuale.data)}`, v, minor: true, adj: true });
      total = round2(total + v);
      R.used.add('gasolio');
    }
    /* --- Supplemento fisso per località disagiata / oltre 30 km (importo inserito a mano) --- */
    if (opts.dis && num(opts.disEur) > 0) {
      const v = round2(num(opts.disEur));
      R.lines.push({ t: 'Supplemento località disagiata / oltre 30 km', s: 'Importo indicato', v, minor: true });
      total = round2(total + v);
    }
    /* --- Arrotondamento all'euro, come nelle offerte --- */
    const rounded = Math.round(total);
    if (Math.abs(rounded - total) >= 0.005) {
      R.lines.push({ t: 'Arrotondamento', s: '', v: round2(rounded - total), minor: true });
    }
    R.total = rounded;
    R.ready = true;
    return R;
  }

  /* Calcola le tre soluzioni (per prodotto, tutto in groupage, tutto su pallet)
     e propone la più conveniente; le altre restano come confronto. */
  const LABEL = { auto: 'Pallet e groupage separati', groupage: 'Tutto in groupage', pallet: 'Tutto su pallet, anche i fuori misura' };
  function compute(S, ADJ = 0, FUEL = FUEL_DEFAULTS) {
    const all = ['auto', 'groupage', 'pallet'].map(m => ({ m, R: computeMode(S, ADJ, FUEL, m) }));
    const valid = all.filter(x => x.R.ready && !x.R.notes.some(n => /provincia|tariffa|supera l'ultima fascia/i.test(n)));
    const main = valid.length ? valid.reduce((best, x) => x.R.total < best.R.total - 0.005 ? x : best, valid[0]) : all[0];
    const R = main.R;
    R.mode = main.m;
    R.alt = [];
    valid.filter(x => x !== main).forEach(x => {
      const same = Math.abs(x.R.total - R.total) < 0.5 || R.alt.some(y => Math.abs(y.total - x.R.total) < 0.5);
      const meaningful = (x.m === 'groupage' && x.R.used.has('groupage')) || (x.m === 'pallet' && x.R.used.has('pallet')) || x.m === 'auto';
      const sensible = x.R.total <= R.total * 2;
      if (!same && meaningful && sensible) R.alt.push({ mode: x.m, label: LABEL[x.m], total: x.R.total, cheaper: false });
    });
    return R;
  }

  /**
   * Dettaglio di una soluzione ("groupage" = tutto in groupage, "pallet" = tutto su pallet,
   * "auto" = per prodotto il più conveniente): gli stessi conti di computeMode, ma divisi
   * pallet per pallet e con carico e fascia del groupage. Nessun numero nuovo: i costi dei
   * pallet sono quelli che computeMode somma, il prezzo del groupage è quello della fascia.
   */
  function soluzione(S, ADJ, FUEL, mode) {
    const R = computeMode(S, ADJ, FUEL, mode);
    const reg = S.reg, prov = S.prov;
    const cart = S.cart.map(line => ({ line, qty: Math.max(1, line.qty | 0), ...decideService(line, mode, reg, prov) }));
    const pallet = cart.filter(c => c.svc === 'pallet').map(c => {
      const list = c.line.kind === 'manual' ? [{ type: c.line.manual.pallet, pct: 0, note: '', fixed: true }] : c.pal;
      const pallets = list.map(pl => ({ tipo: pl.type, maggiorazione: !pl.fixed && pl.pct ? pl.pct : 0, nota: !pl.fixed && pl.pct ? pl.note : '', costo: reg ? palletRate(reg, pl) : null }));
      return { titolo: lineTitle(c.line), uid: c.line.uid, qty: c.qty, pallets, costo: reg && pallets.every(p => p.costo != null) ? round2(pallets.reduce((a, p) => a + p.costo, 0) * c.qty) : null };
    });
    const gr = cart.filter(c => c.svc === 'groupage');
    let groupage = null;
    if (gr.length && reg) {
      const hit = findGroupage(prov, reg);
      if (hit) {
        const carico = groupageLoad(gr, S.opts || {});
        const fascia = groupageBand(hit.zona, carico.ml, carico.q, carico.b);
        // Impilamento: si dice solo se riduce davvero i metri lineari (D-58); se a decidere è la
        // lunghezza di un collo oltre 2,4 m, impilare non cambia nulla e lo si scrive.
        let impilati = (carico.pile || []).filter(p => p.length > 1).map(p => p.map(c => c.nome).reverse().join(' su '));
        let impilamentoSenzaEffetto = '';
        if (impilati.length && carico.ml >= groupageLoad(gr, {}).ml) {
          impilati = [];
          impilamentoSenzaEffetto = carico.lungo > 2.4
            ? `Impilamento senza effetto: i metri li decide la lunghezza (${itN(carico.lungo)} m)`
            : 'Impilamento senza effetto sui metri lineari';
        }
        groupage = { articoli: gr.map(c => ({ titolo: lineTitle(c.line), uid: c.line.uid, qty: c.qty })), carico, fascia, frase: fraseFascia(fascia, hit.zona.fasce), impilati, impilamentoSenzaEffetto, prezzo: hit.gruppo.prezzi[fascia.i], zona: hit.zona.zona };
      }
    }
    // Perché un articolo non sta nella soluzione richiesta (frasi per l'utente)
    const motivi = [];
    for (const c of cart) {
      const nome = lineTitle(c.line);
      if (mode === 'groupage' && c.svc === 'pallet') {
        const a = c.line.kind === 'art' ? artById(c.line.artId) : null;
        motivi.push(c.line.kind === 'manual' ? `${nome}: è un collo su pallet, viaggia su pallet.`
          : a && a.soloPallet ? `${nome}: si spedisce solo su pallet.` : `${nome}: mancano i dati per il groupage, viaggia su pallet.`);
      }
      if (mode === 'pallet' && c.svc === 'groupage') motivi.push(c.line.kind === 'manual' ? `${nome}: è un collo in groupage.` : `${nome}: per misure o peso non può viaggiare su pallet, va in groupage.`);
      if (c.svc === 'quote') motivi.push(`${nome}: imballo non disponibile, costo da richiedere.`);
    }
    const valida = R.ready && !R.notes.some(n => /provincia|tariffa|supera l'ultima fascia/i.test(n));
    return { mode, R, pallet, groupage, motivi, valida, pura: !motivi.length };
  }

  function needsProvince(reg) {
    return !D.groupage.zone.some(z => z.gruppi.some(g => g.tutte && norm(g.regione) === norm(reg)));
  }

  function destLabel(S) {
    const r = regById(S.reg);
    if (!r) return 'Destinazione da scegliere';
    const p = r.province.find(x => x.sigla === S.prov);
    return p ? `${p.nome} (${p.sigla}), ${r.nome}` : r.nome;
  }

  /** Listini usati: [{ etichetta, valore, chi }] per "Calcolato su". */
  function riferimenti(used) {
    const L = D.listini, out = [];
    if (used.has('pallet')) { const s = L.servizi.pallet; out.push({ etichetta: 'Pallet', valore: `listino ${s.riferimento.toLowerCase()}`, chi: s.fornitore || '' }); }
    if (used.has('groupage')) { const s = L.servizi.groupage; out.push({ etichetta: 'Groupage', valore: `listino ${s.riferimento.toLowerCase()}`, chi: s.fornitore || '' }); }
    if (used.has('gasolio')) out.push({ etichetta: 'Gasolio', valore: `${fonteGasolio(D.gasolio)} ${dataIt(D.gasolio.attuale.data)}`, chi: '' });
    return out;
  }
  const riferimentoTesto = r => `${r.etichetta}: ${r.valore}${r.chi ? ` · ${r.chi}` : ''}`;

  /** Testo da condividere (WhatsApp, e-mail). `oggi` = data italiana AAAA-MM-GG. */
  function summaryText(R, S, oggi) {
    const L = [];
    L.push('STIMA COSTO DI TRASPORTO');
    L.push(`Data: ${dataIt(oggi)}`);
    L.push(`Destinazione: ${destLabel(S)}`);
    L.push('');
    L.push('Carico:');
    S.cart.forEach(l => L.push(`- ${l.qty} × ${lineTitle(l)}`));
    L.push('');
    R.lines.forEach(l => L.push(`${l.t}${l.s ? ` (${l.s})` : ''}: ${euroOTrattino(l.v)}`));
    L.push('');
    L.push(`TOTALE: ${euroOTrattino(R.total)} + IVA`);
    const notes = [...R.notes, ...R.infos];
    if (notes.length) { L.push(''); notes.forEach(n => L.push(`Nota: ${n}`)); }
    const refs = riferimenti(R.used).map(riferimentoTesto);
    if (refs.length) { L.push(''); L.push(`Calcolato su: ${refs.join('; ')}`); }
    return L.join('\n');
  }

  return {
    D, artById, regById, palletType, sovrapponibili: cart => cart.some(l => l.kind === 'art' && pezziImpilabili(artById(l.artId))), palletDesc, lineService, lineTitle, palletRate, findGroupage, groupageLoad,
    decideService, computeMode, compute, soluzione, needsProvince, destLabel, riferimenti, riferimentoTesto, summaryText
  };
}

/** Riga descrittiva di un articolo nel menu (pallet tipo, colli, kg, groupage, da quotare). */
export function artMeta(a) {
  const pl = productPallets(a);
  const kg = totKg(a);
  const w = kg ? `${itN(Math.round(kg))} kg` : '';
  if (pl) return [pl.length === 1 ? `pallet ${pl[0].type}${!pl[0].fixed && pl[0].pct ? ' +' + pl[0].pct + '%' : ''}` : `${pl.length} colli`, w].filter(Boolean).join(', ');
  if (productGroupage(a)) return ['groupage', w].filter(Boolean).join(', ');
  return 'da quotare';
}

/** Famiglie del catalogo con conteggio, A→Z, "Fuori prospetto 2026" in fondo. */
export function categorie(articoli) {
  const m = new Map();
  for (const a of articoli) m.set(a.categoria, (m.get(a.categoria) || 0) + 1);
  const last = c => c === 'Fuori prospetto 2026' ? 1 : 0;
  return [...m.entries()].sort((a, b) => last(a[0]) - last(b[0]) || a[0].localeCompare(b[0], 'it'));
}

/** Articoli filtrati per famiglia e testo, nell'ordine del menu originale. */
export function filtraArticoli(articoli, cat, testo) {
  const q = norm(testo);
  let list = articoli.filter(a => !cat || a.categoria === cat);
  const legacy = a => a.fonte === 'Catalogo precedente' ? 1 : 0;
  if (q) {
    list = list.filter(a => norm(a.nome).includes(q));
    const rank = a => { const n = norm(a.nome); return n === q ? 0 : n.startsWith(q) ? 1 : 2; };
    return list.sort((a, b) => rank(a) - rank(b) || legacy(a) - legacy(b) || a.nome.localeCompare(b.nome, 'it', { numeric: true }));
  }
  return list.sort((a, b) => legacy(a) - legacy(b) || a.categoria.localeCompare(b.categoria, 'it') || a.nome.localeCompare(b.nome, 'it', { numeric: true }));
}

/** Testo informativo sul gasolio per le impostazioni. */
export function infoGasolio(gasolio, oggi) {
  if (!gasolio) return 'Dati gasolio non disponibili senza connessione.';
  const d = fuelDelta(gasolio), g = gasolio;
  const vecchio = g.attuale.data < oggi;
  return `${vecchio ? 'Ultimo prezzo' : 'Oggi'} ${it1(g.attuale.prezzo, 3)} €/l (${fonteGasolio(g)} del ${dataIt(g.attuale.data)}), ${g.base.descrizione} ${it1(g.base.prezzo, 3)} €/l: ${d >= 0 ? '+' : '−'}${it1(Math.abs(d))}%.${vecchio ? ' Il dato nuovo arriva in automatico appena è pubblicato.' : ''}`;
}
