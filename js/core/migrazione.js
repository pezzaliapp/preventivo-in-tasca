/*
 * Migrazione dalle app precedenti e file di trasferimento: regole di unione dei dati.
 * Funzioni pure (nessun accesso a IndexedDB o localStorage): le usa js/migrazione.js.
 *
 * Principio: non si perde mai niente. Le app precedenti si leggono soltanto; nella nuova app
 * si riempie ciò che manca e non si sovrascrive ciò che l'utente ha già fatto qui.
 */

export const FORMATO_FILE = 'preventivo-in-tasca/dati';
export const VERSIONE_FILE = 1;

const vuoto = v => v === undefined || v === null || String(v).trim() === '';

/**
 * Impostazioni unite: i campi ancora uguali al valore predefinito (o vuoti) prendono quelli
 * importati; la numerazione dei preventivi prende il contatore più avanti nello stesso anno,
 * così non nascono due preventivi con lo stesso numero.
 */
export function unisciImpostazioni(attuali, importate, predefinite) {
  const out = Object.assign({}, attuali);
  if (!importate) return out;
  for (const k of ['company', 'seller', 'vat', 'defaultDisc', 'validity', 'notes']) {
    if (vuoto(importate[k])) continue;
    if (vuoto(attuali[k]) || String(attuali[k]) === String(predefinite[k])) out[k] = importate[k];
  }
  const anno = Math.max(Number(attuali.counterYear) || 0, Number(importate.counterYear) || 0);
  const contatore = s => (Number(s.counterYear) === anno ? Number(s.counter) || 0 : 0);
  out.counterYear = anno || attuali.counterYear;
  out.counter = Math.max(contatore(attuali), contatore(importate));
  return out;
}

/**
 * Preventivi da scrivere nell'archivio: quelli importati che non ci sono (stesso id), oppure
 * che ci sono ma sono stati salvati dopo. Restituisce { daScrivere, nuovi, aggiornati, uguali }.
 */
export function unisciPreventivi(esistenti, importati) {
  const perId = new Map(esistenti.map(q => [q.id, q]));
  const daScrivere = [];
  let nuovi = 0, aggiornati = 0, uguali = 0;
  for (const q of importati || []) {
    if (!q || !q.id || !Array.isArray(q.items)) continue;
    const c = perId.get(q.id);
    if (!c) { daScrivere.push(q); nuovi++; }
    else if ((q.savedAt || '') > (c.savedAt || '')) { daScrivere.push(q); aggiornati++; }
    else uguali++;
  }
  return { daScrivere, nuovi, aggiornati, uguali };
}

/** La bozza importata diventa il preventivo in corso solo se quello attuale è vuoto. */
export function scegliBozza(attuale, importata) {
  const piena = p => p && Array.isArray(p.items) && p.items.length > 0;
  return !piena(attuale) && piena(importata) ? importata : null;
}

/**
 * Dati dell'app trasporti e di Calcolo noleggio (localStorage, stessa origine) convertiti nelle
 * chiavi della nuova app. `vecchi`: { ct_state, ct_adj, ct_fuel, darkMode, an_divisore } come
 * testo; `nuovi`: le stesse chiavi pit_ già presenti. Si scrive solo ciò che manca.
 */
export function convertiPreferenze(vecchi, nuovi) {
  const leggi = t => { try { return JSON.parse(t); } catch (e) { return null; } };
  const out = {};
  const se = (chiave, valore) => { if (valore !== null && valore !== undefined && nuovi[chiave] == null) out[chiave] = valore; };
  const st = leggi(vecchi.ct_state);
  if (st && Array.isArray(st.cart)) se('pit_trasporto', { cart: st.cart, reg: st.reg || '', prov: st.prov || '', opts: st.opts || {} });
  const adj = leggi(vecchi.ct_adj);
  if (typeof adj === 'number' && adj) se('pit_trasporto_adj', adj);
  const fuel = leggi(vecchi.ct_fuel);
  if (fuel && typeof fuel === 'object') se('pit_trasporto_fuel', { on: !!fuel.on, share: Number(fuel.share), shareIs: Number(fuel.shareIs) });
  if (vecchi.darkMode === 'true') se('pit_tema', 'scuro');
  const div = parseFloat(vecchi.an_divisore);
  if (div >= 1 && nuovi.pit_an_divisore == null) out.pit_an_divisore = String(div); // l'analisi lo salva come testo
  return out;
}

/** File di trasferimento: tutto tranne il listino PDF, il catalogo estratto e il book (riservato). */
export function creaFileDati({ impostazioni, preventivi, bozza, preferenze, versioneApp, creato }) {
  return { formato: FORMATO_FILE, versione: VERSIONE_FILE, app: versioneApp, creato, impostazioni, preventivi, bozza, preferenze };
}

/** Controlla un file di trasferimento letto da disco. Restituisce { ok, dati } o { ok: false, errore }. */
export function leggiFileDati(testo) {
  let d;
  try { d = JSON.parse(testo); } catch (e) { return { ok: false, errore: 'Il file non è leggibile: non sembra un file di dati di Preventivo in tasca.' }; }
  if (!d || d.formato !== FORMATO_FILE) return { ok: false, errore: 'Questo file non è un file di dati di Preventivo in tasca.' };
  if (d.versione > VERSIONE_FILE) return { ok: false, errore: 'Il file viene da una versione più nuova dell\'app: aggiorna l\'app e riprova.' };
  const preferenze = {};
  for (const [k, v] of Object.entries(d.preferenze || {})) if (/^pit_[a-z_]+$/.test(k)) preferenze[k] = v; // solo chiavi della nuova app
  return {
    ok: true,
    dati: {
      impostazioni: d.impostazioni && typeof d.impostazioni === 'object' ? d.impostazioni : null,
      preventivi: Array.isArray(d.preventivi) ? d.preventivi.filter(q => q && q.id && Array.isArray(q.items)) : [],
      bozza: d.bozza && Array.isArray(d.bozza.items) ? d.bozza : null,
      preferenze,
      creato: d.creato || ''
    }
  };
}

/** Riepilogo in parole di un'importazione. */
export function riepilogo(es) {
  const parti = [];
  if (es.listino) parti.push(`listino (${es.listino} articoli${es.book ? ', con il book dell\'agente' : ''})`);
  if (es.preventivi) parti.push(`${es.preventivi} ${es.preventivi === 1 ? 'preventivo salvato' : 'preventivi salvati'}`);
  if (es.bozza) parti.push('il preventivo in corso');
  if (es.impostazioni) parti.push('impostazioni');
  if (es.trasporto) parti.push('carico e adeguamenti del trasporto');
  if (es.tema) parti.push('tema scuro');
  if (es.analisi) parti.push('divisore dell\'analisi mensile');
  return parti.length ? 'Importati: ' + parti.join(', ') + '.' : 'Niente da importare: i dati sono già qui.';
}
