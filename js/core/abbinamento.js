/*
 * Abbinamento articolo del listino ↔ articolo del catalogo trasporti (pesi e misure).
 * Il listino usa codici a 8 cifre, il catalogo trasporti nomi di modello ("TOUCH MEC 2000S"):
 * l'abbinamento si fa sul dispositivo, al volo, con le stesse idee di cerca.js
 * (sigle attaccate, confronto dall'inizio della parola). Nessun codice o prezzo del listino
 * entra nella repo.
 *
 * Esito: "sicuro" (un solo articolo con tutte le parole), "incerto" (2–3 proposte),
 * "nessuno". Le scelte fatte a mano si ricordano sul dispositivo (fuori da qui).
 */

const parole = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ø]+/g, ' ').trim();
const compatto = s => parole(s).replace(/ /g, '');
const modello = t => /[a-zø]/.test(t) && /[0-9]/.test(t); // es. 2000s, f536, pfa40
const VUOTE = new Set(['cod', 'con', 'per', 'e', 'di', 'da', 'il', 'la', 'lo', 'le', 'i', 'gli', 'a', 'in', 'su', 'plt', 'x']);

/** Parole significative del nome di un articolo del catalogo trasporti, e codici a 8 cifre. */
export function chiavi(nome) {
  const tutte = parole(nome).split(' ').filter(Boolean);
  return {
    codici: tutte.filter(t => /^\d{8}$/.test(t)),
    parole: tutte.filter(t => !/^\d{8}$/.test(t) && !VUOTE.has(t))
  };
}

/** Testo del listino in cui cercare: nome dell'articolo, titolo e sottotitolo della famiglia. */
export function testoListino(item, famiglia = {}) {
  const t = parole([item.name, famiglia.title, famiglia.subtitle].join(' '));
  return { w: ' ' + t + ' ', c: t.replace(/ /g, '') };
}

// Una parola corrisponde se compare all'inizio di una parola del testo (o dopo una cifra,
// come in cerca.js); le sigle con lettere e cifre anche senza spazi. Le parole di una sola
// lettera devono comparire intere.
function corrisponde(h, t) {
  if (t.length === 1) return h.w.includes(' ' + t + ' ');
  let i = h.w.indexOf(t);
  while (i > 0) {
    if (/[\s0-9]/.test(h.w[i - 1])) return true;
    i = h.w.indexOf(t, i + 1);
  }
  return (modello(t) || t.length >= 6) && h.c.includes(t);
}

/** Nome del modello nel catalogo, senza parentesi e codici: "TOUCH MEC 2000S LIFT ( con … cod. 21100399 )" → "touchmec2000slift". */
export function nucleo(nome) {
  const senza = String(nome || '').replace(/\([^)]*\)/g, ' ').replace(/\bcod\.?\s*\d{8}\b/gi, ' ');
  return compatto(senza);
}
const parolaModello = t => modello(t) || /^\d{2,}$/.test(t);

/**
 * Abbinamento SICURO (decisione D-43): il nome del modello del catalogo deve coincidere
 * esattamente con il titolo della famiglia o con l'inizio del nome nel listino (a parole intere);
 * dopo il modello, nel nome non ci devono essere altre sigle; e nessuna parola delle varianti più
 * lunghe dello stesso modello (es. "-P", "LIFT") deve comparire nel listino. Tra più modelli che
 * coincidono vince il più lungo solo se contiene gli altri. Nel dubbio: nessuna scelta sicura.
 */
export function sceltaSicura(item, famiglia, articoli) {
  const nome = parole(item.name).split(' ').filter(Boolean);
  const titolo = compatto(famiglia && famiglia.title);
  const prefissi = new Map();
  for (let k = 1; k <= nome.length; k++) prefissi.set(nome.slice(0, k).join(''), k);
  const tutte = new Set(nome);
  const stretti = [];
  for (const a of articoli) {
    const cc = nucleo(a.nome);
    if (!cc) continue;
    if (cc === titolo) stretti.push({ a, cc, resto: nome });
    else if (prefissi.has(cc)) {
      const resto = nome.slice(prefissi.get(cc));
      if (resto.some(parolaModello)) continue; // dopo il modello c'è un'altra sigla: è un altro modello
      stretti.push({ a, cc, resto });
    }
  }
  if (!stretti.length) return null;
  stretti.sort((x, y) => y.cc.length - x.cc.length);
  const top = stretti[0];
  if (stretti.some(x => x !== top && x.cc === top.cc && x.a.id !== top.a.id)) return null; // nomi uguali: ambiguo
  if (!stretti.every(x => top.cc.startsWith(x.cc))) return null;                       // modelli diversi
  // varianti più lunghe dello stesso modello: se una loro parola compare nel listino, nel dubbio no
  for (const a of articoli) {
    const cc = nucleo(a.nome);
    if (cc.length <= top.cc.length || !cc.startsWith(top.cc)) continue;
    const delTop = new Set(parole(String(top.a.nome).replace(/\([^)]*\)/g, ' ')).split(' '));
    const extra = parole(String(a.nome).replace(/\([^)]*\)/g, ' ')).split(' ').filter(t => t && !VUOTE.has(t) && !delTop.has(t));
    if (extra.some(t => tutte.has(t))) return null;
  }
  return top.a;
}

/**
 * Proposte per un articolo del listino, dalla più probabile.
 * Restituisce { esito: 'sicuro'|'incerto'|'nessuno', articolo, proposte: [{ art, prese, totale, completo }] }.
 */
export function abbina(item, famiglia, articoli) {
  const h = testoListino(item, famiglia);
  // codice del listino scritto nel nome dell'articolo trasporti: abbinamento certo
  const perCodice = articoli.filter(a => chiavi(a.nome).codici.includes(item.code));
  if (perCodice.length === 1) return { esito: 'sicuro', articolo: perCodice[0], proposte: [{ art: perCodice[0], prese: 1, totale: 1, completo: true }] };

  const candidati = [];
  for (const a of articoli) {
    const k = chiavi(a.nome);
    if (!k.parole.length) continue;
    const prese = k.parole.filter(t => corrisponde(h, t));
    const completo = prese.length === k.parole.length;
    // candidato se compare una sua sigla di modello ("2000s"), un numero di modello ("1000")
    // insieme ad almeno un'altra parola, oppure tutte le sue parole (almeno due)
    const numero = t => /^\d{2,}$/.test(t);
    if (!prese.some(modello) && !(prese.some(numero) && prese.length >= 2) && !(completo && k.parole.length >= 2)) continue;
    candidati.push({ art: a, prese: prese.length, totale: k.parole.length, completo });
  }
  const vecchio = a => a.fonte === 'Catalogo precedente' ? 1 : 0;
  const sicuro = sceltaSicura(item, famiglia, articoli);
  candidati.sort((x, y) => (y.completo - x.completo) || (y.prese - x.prese) || (x.totale - y.totale) || (vecchio(x.art) - vecchio(y.art)) || x.art.nome.localeCompare(y.art.nome, 'it'));
  if (sicuro) return { esito: 'sicuro', articolo: sicuro, proposte: candidati.slice(0, 3) };
  const buoni = candidati.filter(c => c.prese / c.totale >= 0.5);
  if (buoni.length) return { esito: 'incerto', articolo: null, proposte: buoni.slice(0, 3) };
  return { esito: 'nessuno', articolo: null, proposte: [] };
}

/**
 * Consegna (decisione D-46): se anche una sola MACCHINA del preventivo non ha peso e misure
 * (abbinamento "da scegliere"), il costo del trasporto non si mostra: sarebbe incompleto ma
 * sembrerebbe giusto. Gli accessori esclusi possono restare fuori.
 * `voci`: [{ it, p, stato }] come le prepara la Consegna. Restituisce le macchine mancanti
 * e quelle incluse nel calcolo (per "Calcolato su: …").
 */
export function controlloCarico(voci) {
  const nome = v => `${v.it.name || v.it.code}`;
  const macchina = v => !(v.p && v.p.accessory);
  const mancanti = voci.filter(v => v.stato === 'da-scegliere' && macchina(v));
  const incluse = voci.filter(v => v.stato === 'art' || v.stato === 'manuale');
  return { completo: !mancanti.length, mancanti: mancanti.map(v => ({ code: v.it.code, nome: nome(v) })), incluse: incluse.map(nome) };
}
