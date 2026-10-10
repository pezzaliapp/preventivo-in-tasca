/*
 * Noleggio operativo BCC: calcoli portati da Rel01_noleggio (Release 03 · Ottobre 2026)
 * senza cambiare formule, ordine delle operazioni o arrotondamenti.
 * Funzioni pure: i coefficienti arrivano da data/noleggio/coefficienti.json
 * e la data di oggi entra come parametro.
 */
import { isoToIT } from './date.js';
import { numero2, leggiImporto } from './formato.js';
import { totals, lineNet, eRigaTrasporto, NOLEGGIO_INIZIALE } from './preventivo.js';

// Arrotondamento di Rel01 (diverso da quello dei trasporti: niente EPSILON)
const round2 = value => Math.round(Number(value) * 100) / 100;

/**
 * Prepara i dati letti dal JSON: "fino: null" diventa Infinity.
 * Le spese di contratto possono essere un elenco unico (Aprile 2026, come Rel01) oppure
 * due elenchi { mensile, trimestrale } (Ottobre 2026, come i simulatori BCC).
 */
export function preparaDati(json) {
  const scaglioni = elenco => elenco.map(s => ({ max: s.fino == null ? Infinity : s.fino, value: s.euro }));
  const listini = json.listini.map(l => {
    const sc = l.speseContratto;
    const spese = Array.isArray(sc)
      ? { mensile: scaglioni(sc), trimestrale: scaglioni(sc) }
      : { mensile: scaglioni(sc.mensile), trimestrale: scaglioni(sc.trimestrale) };
    return Object.assign({}, l, { speseContratto: spese });
  });
  return Object.assign({}, json, { listini });
}

/** Listino in vigore = ultimo con validoDal <= oggi (confronto di stringhe AAAA-MM-GG). */
export function listinoAttivo(dati, oggi) {
  let active = dati.listini[0];
  dati.listini.forEach(t => { if (t.validoDal <= oggi) active = t; });
  return active;
}

/** Primo listino futuro, per l'avviso "dal … nuovi coefficienti". */
export function prossimoListino(dati, oggi) {
  return dati.listini.find(t => t.validoDal > oggi) || null;
}

export function notaSimulazione(dati, listino) {
  return `Coefficienti BCC ${listino.nome} (in vigore dal ${isoToIT(listino.validoDal)}) — ${dati.notaArrotondamenti}`;
}

export function avvisoProssimo(prossimo) {
  return prossimo ? `Dal ${isoToIT(prossimo.validoDal)} si attiveranno automaticamente i nuovi coefficienti BCC ${prossimo.nome}.` : '';
}

export function speseContratto(importo, listino, modalita = 'mensile') {
  const s = listino.speseContratto[modalita === 'trimestrale' ? 'trimestrale' : 'mensile'];
  for (let i = 0; i < s.length; i++) if (importo <= s[i].max) return s[i].value;
  return s[s.length - 1].value;
}

/** Fascia "fino a" dei coefficienti; oltre l'ultima si usa l'ultima. */
export function fascia(importo, listino) {
  const bands = Object.keys(listino.mensile).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < bands.length; i++) if (importo <= bands[i]) return bands[i];
  return bands[bands.length - 1];
}

export function oltreUltimaFascia(importo, listino) {
  return importo > Math.max(...Object.keys(listino.mensile).map(Number));
}

/**
 * Rata: coefficiente della fascia dell'importo PIENO, applicato alla base della rata.
 * La base è l'importo pieno, oppure l'imponibile ridotto dal contributo del fornitore
 * (come nei simulatori BCC: la fascia usa Input!C4, la rata usa C16 = C4 − C4 × contributo).
 */
export function rataInfo(importo, durata, modalita, listino, base = importo) {
  const table = modalita === 'trimestrale' ? listino.trimestrale : listino.mensile;
  const bandLimit = fascia(importo, listino);
  const coeff = table[bandLimit] && table[bandLimit][durata];
  const rata = coeff ? round2(base * coeff) : 0;
  return { rata, fascia: bandLimit, coefficiente: coeff || 0 };
}

/** Base su cui si calcola la rata, tolto il contributo del fornitore (in %). */
export const baseRata = (imponibile, contributoPct = 0) => imponibile - imponibile * ((Number(contributoPct) || 0) / 100);

/**
 * Costo giornaliero "su base mensile": rata mensile / 22 giorni lavorativi.
 * In trimestrale la rata copre tre mesi, quindi prima si divide per 3 (decisione D-32;
 * Rel01 divideva la rata trimestrale per 22, contro la sua stessa etichetta "su base mensile").
 */
export function costoGiornaliero(rata, modalita) {
  return round2((modalita === 'trimestrale' ? rata / 3 : rata) / 22);
}

export function valoreRiacquisto(importo, durata, dati) {
  const perc = dati.valoreRiacquistoPercento[durata] || 0;
  return { perc, valore: round2(importo * (perc / 100)) };
}

/**
 * Canone secondo l'importo (regola BCC, decisione D-40): da 2.700 € solo mensile, da 1.500 €
 * a meno di 2.700 € trimestrale, sotto 1.500 € nessun noleggio (null).
 * L'importo è quello pieno della fornitura (come Input!C4 dei simulatori).
 */
export function modalitaPerImporto(imponibile, dati) {
  const c = dati.canone;
  if (!(imponibile >= c.minimo)) return null;
  return imponibile >= c.sogliaMensile ? 'mensile' : 'trimestrale';
}

export const messaggioMinimo = dati => `Importo sotto il minimo finanziabile da BCC (${numero2(dati.canone.minimo).replace(/,00$/, '')} €).`;

/** Messaggio d'errore per dati non validi o importo sotto il minimo finanziabile, oppure null. */
export function controllaDati(imponibile, durata, dati) {
  if (!imponibile || imponibile <= 0) return 'Per favore, inserisci un importo valido.';
  if (dati.durate.indexOf(durata) === -1) return 'Durata non valida.';
  if (imponibile < dati.canone.minimo) return messaggioMinimo(dati);
  return null;
}
/** Nota da mostrare quando BCC prevede il canone trimestrale. */
export const notaCanone = (modalita, dati) => modalita === 'trimestrale' ? dati.canone.notaTrimestrale : null;

/** Ultimo giorno di validità delle rate se esiste già un listino futuro ("2026-10-14"), altrimenti null. */
export function validoFinoAl(dati, oggi) {
  const p = prossimoListino(dati, oggi);
  if (!p) return null;
  const d = new Date(p.validoDal + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Tutti i risultati di una simulazione. `contributoPct`: contributo del fornitore in %. */
export function calcola(imponibile, durata, modalita, listino, dati, contributoPct = 0) {
  const base = baseRata(imponibile, contributoPct);
  const info = rataInfo(imponibile, durata, modalita, listino, base);
  const giorno = costoGiornaliero(info.rata, modalita);
  const costoOrario = round2(giorno / 8);
  const vr = valoreRiacquisto(imponibile, durata, dati);
  return {
    imponibile, durata, modalita, contributoPct: Number(contributoPct) || 0, base,
    rata: info.rata, fascia: info.fascia, coefficiente: info.coefficiente,
    numeroCanoni: numeroCanoni(durata, modalita),
    speseContratto: speseContratto(imponibile, listino, modalita),
    costoGiornaliero: giorno, costoOrario,
    vrPerc: vr.perc, vrEuro: vr.valore,
    importoFinanziato: round2(imponibile - vr.valore)
  };
}

/** Numero di canoni: uno al mese, oppure uno ogni tre mesi in trimestrale (12 mesi = 4 canoni). */
export function numeroCanoni(durata, modalita) {
  return modalita === 'trimestrale' ? durata / 3 : durata;
}

/** "12 mesi – 4 canoni trimestrali" / "12 mesi – 12 canoni mensili" */
export function descriviDurata(durata, modalita) {
  const n = numeroCanoni(durata, modalita);
  return `${durata} mesi – ${n} ${n === 1 ? 'canone' : 'canoni'} ${modalita === 'trimestrale' ? 'trimestrali' : 'mensili'}`;
}

/** Canoni per tutte le durate: sempre con i coefficienti MENSILI (come l'originale, S-02). */
export function canoniPerDurate(imponibile, listino, dati, contributoPct = 0) {
  const bandLimit = fascia(imponibile, listino);
  const coeffBand = listino.mensile[bandLimit];
  const base = baseRata(imponibile, contributoPct);
  const canoni = {};
  dati.durate.forEach(mesi => { canoni[mesi] = round2(base * (coeffBand[mesi] || 0)); });
  return { canoni, fascia: bandLimit };
}

/** Rate per tutte le durate nella modalità scelta (riquadro "Oppure a noleggio operativo"). */
export function rateTutteLeDurate(imponibile, modalita, listino, dati, contributoPct = 0) {
  return dati.durate.map(d => calcola(imponibile, d, modalita, listino, dati, contributoPct));
}

/**
 * Documenti richiesti al cliente per l'importo (simulatori BCC): la fascia A vale sempre,
 * la B si aggiunge oltre 15.000 € e fino a 30.000 €, la C oltre 30.000 €.
 */
export function documentiPerImporto(testi, importo) {
  return testi.documentiCliente.fasce.filter(f => f.oltre === undefined || (importo > f.oltre && (f.fino === undefined || importo <= f.fino)));
}

/** Testo del preventivo TXT di noleggio, identico a Rel01 (importi con il punto delle migliaia). */
export function testoTXT(imponibile, durata, modalita, oggi, dati, contributoPct = 0) {
  const listino = listinoAttivo(dati, oggi);
  const notaSim = notaSimulazione(dati, listino);
  const r = calcola(imponibile, durata, modalita, listino, dati, contributoPct);
  const { canoni, fascia: bandLimit } = canoniPerDurate(imponibile, listino, dati, contributoPct);
  const labelRata = modalita === 'trimestrale' ? 'Rata trimestrale' : 'Rata mensile';
  const f = numero2;

  let testo = '';
  testo += 'PREVENTIVO DI NOLEGGIO OPERATIVO (simulazione)\n';
  testo += '---------------------------------------------------\n\n';
  testo += `Data simulazione: ${isoToIT(oggi)}\n`;
  testo += `${notaSim}\n\n`;
  testo += `Imponibile fornitura: ${f(imponibile)} €\n`;
  if (r.contributoPct) testo += `Contributo fornitore: ${f(r.contributoPct)}% (rata calcolata su ${f(r.base)} €)\n`;
  testo += `Fascia applicata (fino a): ${f(bandLimit)} €\n`;
  testo += `Modalità canone: ${modalita === 'trimestrale' ? 'Trimestrale' : 'Mensile'}\n\n`;
  testo += `Durata selezionata: ${durata} mesi\n`;
  testo += `${labelRata}: ${f(r.rata)} €\n`;
  testo += `Spese di contratto: ${f(r.speseContratto)} €\n`;
  testo += `Costo giornaliero (su base mensile): ${f(r.costoGiornaliero)} €\n`;
  testo += `Costo orario: ${f(r.costoOrario)} €\n\n`;
  testo += `Valore di riacquisto (VR): ${f(r.vrPerc)}% = ${f(r.vrEuro)} €\n`;
  testo += `Importo finanziato (imponibile - VR): ${f(r.importoFinanziato)} €\n\n`;
  testo += 'CANONI MENSILI DISPONIBILI:\n';
  dati.durate.forEach(mesi => { testo += `${mesi} mesi: ${f(canoni[mesi])} €\n`; });
  testo += '\nDETTAGLI CONTRATTUALI:\n';
  testo += `Spese incasso RID: ${f(dati.speseIncassoRidMese)} € al mese\n\n`;
  testo += 'NOTE TECNICHE:\n';
  testo += '- ' + notaSim + '\n';
  testo += '- Tutti gli importi indicati sono da intendersi IVA esclusa.\n\n';

  return { nomeFile: `preventivo_noleggio_${String(Math.round(Number(imponibile) || 0))}.txt`, testo };
}

export const ERRORE_TXT = 'Inserisci un importo valido prima di generare il file TXT.';

/**
 * Opzione "Oppure a noleggio operativo" di un preventivo.
 * Base = totale netto IVA esclusa; senza la riga del trasporto se l'interruttore è spento.
 * Restituisce le rate per le durate scelte nella modalità scelta, o il motivo per cui non si può.
 */
export function opzionePreventivo(quote, dati, listino) {
  const o = Object.assign(NOLEGGIO_INIZIALE(dati.durate), quote.noleggio || {});
  const netto = totals(quote, 0).net;
  const trasporto = quote.items.filter(eRigaTrasporto).reduce((a, it) => a + lineNet(it, quote.globalDisc), 0);
  const base = Math.round((o.includiTrasporto ? netto : netto - trasporto) * 100) / 100;
  const contributo = Math.max(0, Math.min(100, leggiImporto(o.contributo)));
  const durate = dati.durate.filter(d => o.durate.includes(d));
  const errore = !base || base <= 0 ? 'Il preventivo è vuoto.' : controllaDati(base, durate[0] || dati.durate[0], dati);
  const modalita = errore ? null : modalitaPerImporto(base, dati);
  o.modalita = modalita || o.modalita; // la modalità la decide l'importo, non una scelta
  const rate = errore ? [] : durate.map(d => calcola(base, d, modalita, listino, dati, contributo));
  return {
    opzioni: o, netto, trasporto, base, contributo, errore, durate, modalita,
    baseRata: baseRata(base, contributo),
    nota: errore ? null : notaCanone(modalita, dati),
    rate,
    speseContratto: errore ? null : speseContratto(base, listino, modalita),
    rid: dati.speseIncassoRidMese,
    oltreUltimaFascia: !errore && oltreUltimaFascia(base, listino),
    visibile: o.attivo && !errore && rate.length > 0
  };
}

/**
 * Descrizione del canone per il cliente: "Canone mensile, IVA esclusa, trasporto incluso".
 * Niente cifra della base e niente contributo del fornitore (dati interni, decisione D-41).
 */
export function descrizioneCanone(op) {
  return `Canone ${op.modalita === 'trimestrale' ? 'trimestrale' : 'mensile'}, IVA esclusa${op.trasporto ? (op.opzioni.includiTrasporto ? ', trasporto incluso' : ', trasporto escluso') : ''}`;
}

/** Righe del testo condiviso (WhatsApp, e-mail) per l'opzione noleggio. `fino` = validità ("2026-10-14") o null. */
export function testoOpzione(op, testi, listino, fino = null) {
  if (!op.visibile) return [];
  const f = numero2, m = op.modalita;
  return [
    '',
    testi.titolo.toUpperCase(),
    descrizioneCanone(op) + (op.nota ? `. ${op.nota}.` : '.'),
    ...(fino ? [`RATE VALIDE FINO AL ${isoToIT(fino)}`] : []),
    ...op.rate.map(r => `• ${descriviDurata(r.durata, m)} da ${f(r.rata)} €`),
    testi.spese.replace('{spese}', f(op.speseContratto) + ' €'),
    testi.rid.replace('{rid}', f(op.rid) + ' €'),
    testi.canoni,
    testi.primoCanone[m],
    testi.simulazione,
    `Coefficienti BCC ${listino.nome}.`
  ];
}
