/*
 * Contenuto del preventivo per il cliente, come dati: lo usa il PDF ("Invia PDF") e ha
 * gli stessi testi della stampa (stampaHTML in js/moduli/invia.js e riquadroNoleggioHTML).
 * Funzioni pure. SOLO dati per il cliente: niente book dell'agente, niente contributo del
 * fornitore né base della rata (D-41), niente note "Solo per te".
 */
import { totals, lineDisc, lineNet, validoFino } from './preventivo.js';
import { euro, percento, numero2 } from './formato.js';
import { isoToIT } from './date.js';
import { descrizioneCanone, descriviDurata } from './noleggio.js';

export const PIEDE = 'Preventivo in tasca · Alessandro Pezzali';
const righeTesto = s => String(s || '').split('\n').map(r => r.trim()).filter(Boolean);
const dataIT = iso => new Date(iso).toLocaleDateString('it-IT');

/**
 * Modello del preventivo. `nol`: { op, testi, listino, fino } come in invia.js (o null);
 * `imgs`: id riga → immagine (data URL), solo se l'interruttore immagini è acceso.
 */
export function modelloPreventivo({ quote, settings, nol = null, imgs = {} }) {
  const p = quote, s = settings;
  const t = totals(p, s.vat);
  const conImg = p.showImages !== false && Object.keys(imgs).length > 0;
  const totali = [{ etichetta: 'Totale di listino', valore: euro(t.gross) }];
  if (t.disc) totali.push({ etichetta: 'Sconto', valore: '− ' + euro(t.disc) });
  totali.push({ etichetta: `Totale netto${p.vatOn ? ' imponibile' : ' (IVA esclusa)'}`, valore: euro(t.net), forte: true });
  if (p.vatOn) {
    totali.push({ etichetta: `IVA ${s.vat}%`, valore: euro(t.vat) });
    totali.push({ etichetta: 'Totale IVA inclusa', valore: euro(t.total), forte: true });
  }
  return {
    azienda: righeTesto(s.company),
    titolo: `Preventivo${p.number ? ' ' + p.number : ''}`,
    data: `Data ${dataIT(p.date)}`,
    valido: `Valido fino al ${validoFino(p.date, s.validity).toLocaleDateString('it-IT')}`,
    cliente: p.customer || p.reference ? { nome: p.customer || '', riferimento: p.reference || '' } : null,
    conImg,
    righe: p.items.map(it => {
      const d = lineDisc(it, p.globalDisc);
      return {
        img: conImg ? imgs[it.id] || null : null,
        codice: it.code || '',
        descrizione: [it.name || '', it.power || '', it.dettaglio || ''].filter(Boolean),
        qta: String(it.qty),
        listino: euro(it.price),
        sconto: d.pct ? percento(d.pct) + '%' : '',
        netto: euro(lineNet(it, p.globalDisc))
      };
    }),
    totali,
    noleggio: nol && nol.op && nol.op.visibile ? modelloNoleggio(nol) : null,
    note: righeTesto(p.notes),
    firma: righeTesto(s.seller),
    piede: PIEDE
  };
}

/** Riquadro "Oppure a noleggio operativo": stesse regole e testi di riquadroNoleggioHTML. */
function modelloNoleggio({ op, testi, listino, fino }) {
  const m = op.modalita;
  return {
    titolo: testi.titolo,
    validita: fino ? `Rate valide fino al ${isoToIT(fino)}` : '',
    base: `${descrizioneCanone(op)}.${op.nota ? ` ${op.nota}.` : ''}`,
    intestazione: ['Durata', m === 'trimestrale' ? 'Canone trimestrale' : 'Canone mensile'],
    rate: op.rate.map(r => [descriviDurata(r.durata, m), numero2(r.rata) + ' €']),
    note: [
      testi.spese.replace('{spese}', numero2(op.speseContratto) + ' €'),
      testi.rid.replace('{rid}', numero2(op.rid) + ' €'),
      testi.canoni,
      testi.primoCanone[m]
    ],
    benefici: op.opzioni.benefici ? [testi.beneficiFiscali, testi.beneficiFinanziari].map(b => ({ titolo: b.titolo, testi: b.testi.slice() })) : null,
    simulazione: `${testi.simulazione} Coefficienti BCC ${listino.nome}.`
  };
}

/** Nome del file: Preventivo_AAAA-NNN_Cliente.pdf, solo lettere, cifre, - e _. */
export function nomeFilePdf(quote) {
  const pulito = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return ['Preventivo', pulito((quote.number || '').replace('/', '-')), pulito(quote.customer)].filter(Boolean).join('_') + '.pdf';
}

/** App aperta nel browser interno di WhatsApp, Instagram, Facebook (o in una WebView Android). */
export function browserInterno(ua) {
  return /FBAN|FBAV|FB_IAB|FBIOS|Instagram|WhatsApp|; wv\)/i.test(ua || '');
}
