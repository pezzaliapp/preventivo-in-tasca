/*
 * Listino in tasca - ricerca articoli.
 *
 * Idee riprese dalla ricerca di QUOTE:
 *  - confronto "compatto" senza spazi e trattini, cosi' "geo10" trova "GEO 10",
 *    "f536" trova "F 536S" e "mec822" trova "MEC 822VDL";
 *  - punteggio: codice esatto, poi nome che inizia per la ricerca, poi parole.
 * In piu' le parole devono corrispondere dall'inizio, cosi' "geo" non trova
 * "Peugeot".
 */
(function (root) {
  'use strict';

  // Lettere, cifre e "ø" (diametri come Ø40); tutto il resto separa le parole.
  const words = s => String(s || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ø]+/g, ' ').trim();
  const compact = s => words(s).replace(/ /g, '');
  const isModel = t => /[a-zø]/.test(t) && /[0-9]/.test(t); // es. f536, geo10, pfa40

  /** Prepara i campi di ricerca di un articolo (una volta, all'avvio). */
  function prepare(p, fam) {
    fam = fam || {};
    const w = words([p.code, p.name, p.power, fam.title, fam.subtitle, fam.sub, fam.main].join(' '));
    p._w = ' ' + w + ' ';
    p._c = w.replace(/ /g, '');
    p._n = compact(p.name);
    p._t = compact(fam.title);
  }

  // Una parola cercata corrisponde se compare all'inizio di una parola del testo
  // o subito dopo una cifra ("vdll" in "822VDLL"). Le sigle con lettere e cifre
  // e le parole lunghe si confrontano anche senza spazi ("f536" in "F 536S").
  function tokenMatch(p, t) {
    let i = p._w.indexOf(t);
    while (i > 0) {
      if (/[\s0-9]/.test(p._w[i - 1])) return true;
      i = p._w.indexOf(t, i + 1);
    }
    return (isModel(t) || t.length >= 6) && p._c.includes(t);
  }

  function score(p, toks, qc) {
    let s = 0;
    if (p.code === qc) s += 1000;
    else if (qc.length >= 3 && p.code.startsWith(qc)) s += 500;
    if (qc.length >= 2 && p._n.startsWith(qc)) s += 100;
    else if (qc.length >= 2 && p._t.startsWith(qc)) s += 90;
    else if (qc.length >= 3 && p._n.includes(qc)) s += 60 - Math.min(p._n.length, 200) / 1000;
    if (toks.every(t => tokenMatch(p, t))) s += 20;
    else if ((isModel(qc) || qc.length >= 6) && p._c.includes(qc)) s += 10;
    return s;
  }

  /** Articoli che corrispondono alla ricerca, dal piu' pertinente. */
  function search(products, query) {
    const qw = words(query);
    if (!qw) return [];
    const toks = qw.split(' ');
    const qc = qw.replace(/ /g, '');
    const out = [];
    products.forEach((p, i) => {
      if (p._w === undefined) prepare(p);
      const s = score(p, toks, qc);
      if (s > 0) out.push({ p, s, i });
    });
    out.sort((a, b) => b.s - a.s || (a.p.accessory ? 1 : 0) - (b.p.accessory ? 1 : 0) || a.i - b.i);
    return out.map(r => r.p);
  }

  const api = { prepare, search, words, compact };
  root.Cerca = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
