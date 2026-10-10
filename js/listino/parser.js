/*
 * Listino in tasca - parser del listino PDF.
 * Lavora solo in locale: riceve un documento pdf.js gia' aperto e restituisce
 * prodotti, sezioni e caratteristiche. Nessun dato lascia il dispositivo.
 */
(function (root) {
  'use strict';

  const PARSER_VERSION = 4;
  const RE_CODE = /^(\d{8})(.*)$/;
  const RE_PRICE = /^(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})\s*(€)?$/;
  const RE_POWER = /\b(\d\s?ph\b[^€]*?\d{2,3}\s?V[\w\/\-\s.,]*Hz|\d{2,3}\s?V[\w\/\-\s.]*Hz|\d\s?ph)/i;
  const SKIP_LINE = /^(CODICE|CODE|DESCRIZIONE|DESCRIPTION|S = Incluso|Vuoto = )/i;

  const ACTIVITIES = {
    equilibratura: { label: 'Equilibratura', re: /^equilibrat/i },
    smontaggio: { label: 'Smontaggio gomme', re: /^(smontagomme|bead)/i },
    sollevamento: { label: 'Sollevamento', re: /^(sollevat|colonne)/i },
    assetto: { label: 'Assetto ruote', re: /^assett/i },
    altro: { label: 'Altre attrezzature', re: /^$/ }
  };

  function priceToNumber(s) {
    const m = s.replace(/\s*€$/, '').trim().match(/^([\d.]+),(\d{2})$/);
    if (!m) return NaN;
    return Number(m[1].replace(/\./g, '') + '.' + m[2]);
  }

  async function pageItems(page) {
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const seen = new Set();
    const out = [];
    for (const it of tc.items) {
      const str = (it.str || '').replace(/\s+/g, ' ').trim();
      if (!str) continue;
      const [a, b, c, d, e, f] = it.transform;
      const x = e, y = vp.height - f;
      const key = str + '|' + Math.round(x) + '|' + Math.round(y);
      if (seen.has(key)) continue; // ombre/duplicati di InDesign
      seen.add(key);
      out.push({ str, x, y, w: it.width || 0, size: Math.hypot(c, d), rotated: Math.abs(b) > 0.01 });
    }
    return { items: out, height: vp.height, width: vp.width };
  }

  function groupLines(items, tol = 3) {
    const sorted = items.filter(i => !i.rotated).sort((p, q) => p.y - q.y || p.x - q.x);
    const lines = [];
    for (const it of sorted) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - it.y) <= tol) {
        last.items.push(it);
      } else {
        lines.push({ y: it.y, items: [it] });
      }
    }
    for (const l of lines) {
      l.items.sort((p, q) => p.x - q.x);
      l.text = l.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
    }
    return lines;
  }

  function parseIndex(lines) {
    const entries = [];
    for (const l of lines) {
      const m = l.text.replace(/\s*\.{3,}\s*/g, ' ... ').match(/^(.+?)\s*\.\.\.\s*(\d{1,3})$/);
      if (!m) continue;
      const name = m[1].replace(/\s+/g, ' ').trim();
      const page = Number(m[2]);
      const letters = name.replace(/[^A-Za-zÀ-ÿ]/g, '');
      const main = letters.length > 0 && letters === letters.toUpperCase();
      entries.push({ name, page, main });
    }
    return entries;
  }

  function sectionFor(pageNo, index) {
    let main = null, sub = null;
    for (const e of index) {
      if (e.page > pageNo) continue;
      if (e.main) {
        if (!main || e.page >= main.page) { main = e; }
      }
    }
    for (const e of index) {
      if (e.main || e.page > pageNo) continue;
      if (main && e.page < main.page) continue;
      if (!sub || e.page >= sub.page) sub = e;
    }
    return { main: main ? main.name : '', sub: sub ? sub.name : '' };
  }

  function classify(section, text) {
    const main = section.main.toUpperCase();
    const sub = section.sub;
    let activity = 'altro';
    if (/EQUILIBRAT/.test(main)) activity = 'equilibratura';
    else if (/SMONTAGOMME/.test(main)) activity = 'smontaggio';
    else if (/SOLLEVAT/.test(main)) activity = 'sollevamento';
    else if (/ASSETT/.test(main)) activity = 'assetto';
    if (ACTIVITIES.equilibratura.re.test(sub)) activity = 'equilibratura';

    const hay = (sub + ' ' + text).toLowerCase();
    const vehicles = new Set();
    if (/\bmoto\b|motocicl/.test(hay)) vehicles.add('moto');
    if (/camion|autocarr|truck|\bbus\b|mezzi pesanti|agricol/.test(hay)) vehicles.add('truck');
    if (/\bauto\b|vettur|furgon|commerciali|fuoristrada|suv/.test(hay)) vehicles.add('auto');
    // Sottosezione esplicita: ha la precedenza sulle parole nel testo
    const s = sub.toLowerCase();
    if (/\bmoto\b/.test(s)) { vehicles.clear(); vehicles.add('moto'); }
    else if (/camion|autocarr/.test(s)) { vehicles.clear(); vehicles.add('truck'); }
    else if (/\bauto\b/.test(s)) { vehicles.delete('moto'); vehicles.add('auto'); }

    const accessory = /^(accessori|sollevatori per equilibratrici)/i.test(sub) || /^ACCESSORI/i.test(text);
    return { activity, vehicles: vehicles.size ? [...vehicles] : ['auto', 'moto', 'truck'], accessory };
  }

  function featuresFrom(lines) {
    const feats = [];
    let cur = null;
    for (const l of lines) {
      const first = l.items[0];
      if (first && first.str === '•') {
        if (cur) feats.push(cur);
        cur = { x: l.items[1] ? l.items[1].x : first.x + 10, text: l.items.slice(1).map(i => i.str).join(' ') };
      } else if (cur && first && Math.abs(first.x - cur.x) < 4 && first.size < 12) {
        cur.text += ' ' + l.text;
      } else if (cur) {
        feats.push(cur); cur = null;
      }
    }
    if (cur) feats.push(cur);
    return feats.map(f => f.text.replace(/\s+/g, ' ').replace(/\s+([.,;:)])/g, '$1').trim()).filter(Boolean);
  }

  function titleFrom(items, height) {
    const big = items.filter(i => i.size >= 16 && i.y < height * 0.2 && !i.rotated)
      .sort((p, q) => p.y - q.y || p.x - q.x);
    if (!big.length) return '';
    const y0 = big[0].y;
    const row = big.filter(i => Math.abs(i.y - y0) < 14).sort((p, q) => p.x - q.x);
    let t = '';
    let prevEnd = -1;
    for (const i of row) {
      const gap = i.x - prevEnd;
      t += (t && gap > 3 ? ' ' : '') + i.str;
      prevEnd = i.x + i.w;
    }
    return t.replace(/\s+/g, ' ').trim();
  }

  function subtitleFrom(lines, height) {
    const cand = lines.filter(l => l.y < height * 0.2 && l.items.every(i => i.size >= 10.5 && i.size < 16));
    return cand.length ? cand[0].text : '';
  }

  function optionalPage(text) {
    const m = text.match(/ACCESSORI OPTIONAL a pag\.?\s*(\d+)/i);
    return m ? Number(m[1]) : null;
  }

  function extractRows(lines) {
    const priced = [], loose = [];
    lines.forEach((l, idx) => {
      let codeItem = null, codeIdx = -1;
      l.items.forEach((it, k) => { if (codeItem === null && RE_CODE.test(it.str)) { codeItem = it; codeIdx = k; } });
      if (!codeItem) return;
      let priceItem = null;
      for (let k = l.items.length - 1; k > codeIdx; k--) {
        if (RE_PRICE.test(l.items[k].str)) { priceItem = l.items[k]; break; }
      }
      if (priceItem) priced.push({ line: l, idx, codeItem, priceItem, codes: [] });
      else loose.push({ line: l, codeItem });
    });
    // Prezzi senza codice sulla propria riga (es. "Kit di cablaggio 350,00" a meta'
    // fra i codici 25100044 e 25100045): diventano una riga con i codici sciolti
    // appena sopra e sotto, se sono piu' vicini a questo prezzo che a ogni altro.
    if (loose.length) {
      const pricedLines = new Set(priced.map(r => r.line));
      const orphans = [];
      for (const l of lines) {
        if (pricedLines.has(l) || l.items.some(it => RE_CODE.test(it.str))) continue;
        const pi = [...l.items].reverse().find(it => RE_PRICE.test(it.str));
        if (pi) orphans.push({ line: l, priceItem: pi });
      }
      for (const o of orphans) {
        const near = loose.filter(lc => {
          if (lc.used || lc.codeItem.x >= o.priceItem.x) return false;
          const d = Math.abs(lc.line.y - o.line.y);
          if (d > 32) return false;
          // un prezzo vero sulla stessa colonna e piu' vicino vince
          return !priced.some(r => Math.abs(r.codeItem.x - lc.codeItem.x) <= 6 && Math.abs(r.line.y - lc.line.y) < d);
        }).sort((a, b) => Math.abs(a.line.y - o.line.y) - Math.abs(b.line.y - o.line.y));
        if (!near.length) continue;
        near.forEach(lc => { lc.used = true; });
        priced.push({ line: o.line, idx: lines.indexOf(o.line), codeItem: near[0].codeItem, priceItem: o.priceItem, codes: near.slice(1) });
      }
      priced.sort((a, b) => a.line.y - b.line.y);
    }
    // Codici senza prezzo sulla propria riga: varianti che condividono il prezzo
    // della riga prezzata piu' vicina nella stessa colonna (es. stesso accessorio
    // per macchine diverse).
    for (const lc of loose) {
      if (lc.used) continue;
      let best = null, bestD = Infinity;
      for (const r of priced) {
        if (Math.abs(r.codeItem.x - lc.codeItem.x) > 6) continue;
        const d = Math.abs(r.line.y - lc.line.y);
        if (d < bestD) { bestD = d; best = r; }
      }
      if (best && bestD <= 45) best.codes.push(lc);
    }
    return priced;
  }

  function cleanDesc(s) {
    s = s.replace(/\s+/g, ' ').replace(/\s+([,.;:)])/g, '$1').trim();
    return /[A-Za-zÀ-ÿ0-9]{2}/.test(s) ? s : '';
  }

  function buildProducts(lines, rows, pageHeight, pageWidth) {
    const products = [];
    const rowTop = r => Math.min(r.line.y, ...r.codes.map(c => c.line.y));
    const rowBot = r => Math.max(r.line.y, ...r.codes.map(c => c.line.y));
    rows.forEach((r, n) => {
      const m = r.codeItem.str.match(RE_CODE);
      const left = r.codeItem.x + r.codeItem.w - 1 - (m[2] ? r.codeItem.w * 0.4 : 0);
      const right = r.priceItem.x + 1;
      const prev = n > 0 ? rows[n - 1] : null;
      const next = n < rows.length - 1 ? rows[n + 1] : null;
      const t = rowTop(r), b = rowBot(r);
      const top = Math.max(prev ? (rowBot(prev) + t) / 2 : -Infinity, t - 36);
      const bottom = Math.min(next ? (rowTop(next) + b) / 2 : Infinity, b + 36);

      const parts = [];
      let power = '';
      const codeLines = new Set([r.line, ...r.codes.map(c => c.line)]);
      for (const l of lines) {
        if (l.y < top || l.y > bottom) continue;
        if (SKIP_LINE.test(l.text)) continue;
        if (!codeLines.has(l) && rows.some(o => o.line === l)) continue;
        for (const it of l.items) {
          if (it === r.codeItem || it === r.priceItem) continue;
          if (RE_CODE.test(it.str) && Math.abs(it.x - r.codeItem.x) < 6) continue;
          if (it.x < left || it.x + it.w > right + 2) continue;
          if (it.size >= 14) continue;
          if (l === r.line && RE_POWER.test(it.str)) { power = (power ? power + ' ' : '') + it.str; continue; }
          if (/^S$/.test(it.str)) continue;
          parts.push({ y: l.y, x: it.x, str: it.str });
        }
      }
      parts.sort((p, q) => (Math.abs(p.y - q.y) > 3 ? p.y - q.y : p.x - q.x));
      let desc = cleanDesc(parts.map(p => p.str).join(' '));
      if (m[2] && cleanDesc(m[2])) desc = cleanDesc(m[2] + ' ' + desc);
      const pm = desc.match(RE_POWER);
      if (!power && pm && /ph/i.test(pm[0]) && /V/.test(pm[0])) { power = pm[0].trim(); desc = cleanDesc(desc.replace(pm[0], '')); }
      const priceText = r.priceItem.str;
      const band = {
        y0: Math.max(0, (isFinite(top) ? top : t - 36) - 6) / pageHeight,
        y1: Math.min(pageHeight, (isFinite(bottom) ? bottom : b + 36) + 6) / pageHeight,
        // ritaglio orizzontale: dall'immagine a sinistra fino al prezzo compreso
        x1: Math.min(1, (r.priceItem.x + r.priceItem.w + 10) / (pageWidth || 595)),
        // inizio della colonna codice: a sinistra c'e' di solito la foto dell'accessorio
        xc: Math.max(0, (r.codeItem.x - 3) / (pageWidth || 595))
      };
      const base = {
        desc, power: power.replace(/\s+/g, ' ').trim(),
        price: priceToNumber(priceText), priceHasEuro: /€/.test(priceText), band
      };
      const allCodes = [{ line: r.line, codeItem: r.codeItem }, ...r.codes]
        .sort((p, q) => p.line.y - q.line.y);
      for (const c of allCodes) {
        products.push(Object.assign({ code: c.codeItem.str.match(RE_CODE)[1], shared: allCodes.length > 1 }, base));
      }
    });
    // Celle di descrizione unite su due righe della tabella: la seconda riga riceve
    // solo il seguito ("stallonatore", "alluminio. Set di 4 pezzi."). Se la descrizione
    // comincia in minuscolo, la ricompongo e la do a entrambe le righe.
    for (let i = 1; i < products.length; i++) {
      const cur = products[i];
      if (!/^[a-zà-ù]/.test(cur.desc || '')) continue;
      let j = i - 1;
      while (j >= 0 && products[j].band === cur.band) j--;
      if (j < 0 || !products[j].desc) continue;
      const prevBand = products[j].band, prevDesc = products[j].desc;
      const joined = cleanDesc(prevDesc + ' ' + cur.desc);
      const curBand = cur.band, curDesc = cur.desc;
      for (const p of products) {
        if ((p.band === prevBand && p.desc === prevDesc) || (p.band === curBand && p.desc === curDesc)) p.desc = joined;
      }
    }
    return products;
  }

  async function parseListino(pdf, onProgress) {
    const n = pdf.numPages;
    const pages = [];
    let index = [];
    let title = '';
    for (let p = 1; p <= n; p++) {
      const page = await pdf.getPage(p);
      const { items, height, width } = await pageItems(page);
      const lines = groupLines(items);
      const text = lines.map(l => l.text).join('\n');
      if (!index.length && /\bINDICE\b/.test(text)) index = parseIndex(lines);
      if (p === 1 && !title) title = lines.filter(l => l.items.some(i => i.size >= 14)).map(l => l.text).join(' ').trim();
      pages.push({ p, items, lines, height, width, text });
      if (onProgress) onProgress(p, n, 'lettura');
      page.cleanup && page.cleanup();
    }

    const products = [];
    const families = {};
    const seen = new Map();
    for (const pg of pages) {
      const rows = extractRows(pg.lines);
      if (!rows.length) continue;
      const section = index.length ? sectionFor(pg.p, index) : { main: '', sub: '' };
      const famTitle = titleFrom(pg.items, pg.height) || section.sub || section.main || ('Pagina ' + pg.p);
      const subtitle = subtitleFrom(pg.lines, pg.height);
      const features = featuresFrom(pg.lines);
      const famId = 'p' + pg.p;
      const cls = classify(section, famTitle + ' ' + subtitle);
      families[famId] = {
        id: famId, page: pg.p, title: famTitle, subtitle, features,
        main: section.main, sub: section.sub, optionalPage: optionalPage(pg.text),
        activity: cls.activity, vehicles: cls.vehicles, accessory: cls.accessory
      };
      for (const pr of buildProducts(pg.lines, rows, pg.height, pg.width)) {
        if (!isFinite(pr.price)) continue;
        const accessory = !pr.priceHasEuro || /^(accessori|sollevatori per equilibratrici)/i.test(section.sub) || /^ACCESSORI/i.test(famTitle);
        const item = {
          code: pr.code,
          name: pr.desc || `Articolo a pag. ${pg.p}, vedi figura`,
          described: !!pr.desc,
          band: pr.band,
          shared: pr.shared,
          power: pr.power,
          price: pr.price,
          family: famId,
          page: pg.p,
          activity: cls.activity,
          vehicles: cls.vehicles,
          accessory
        };
        // stesso codice su piu' pagine: tengo la prima, ma completo la descrizione se mancava
        const key = pr.code + '|' + pr.power;
        if (seen.has(key)) {
          const old = seen.get(key);
          if (!old.described && pr.desc) { old.name = pr.desc; old.described = true; }
          continue;
        }
        seen.set(key, item);
        products.push(item);
      }
      if (onProgress) onProgress(pg.p, n, 'analisi');
    }

    return {
      title: title || 'Listino',
      pages: n,
      index,
      families,
      products,
      parsedAt: new Date().toISOString(),
      parserVersion: PARSER_VERSION
    };
  }

  const api = { parseListino, priceToNumber, ACTIVITIES, PARSER_VERSION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ListinoParser = api;
})(typeof self !== 'undefined' ? self : this);
