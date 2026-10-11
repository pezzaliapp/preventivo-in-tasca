/* Contenuto del PDF del preventivo: stessi dati della stampa, niente dati interni. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { leggiJSON } from './aiuti.js';
import * as N from '../js/core/noleggio.js';
import { modelloPreventivo, nomeFilePdf, browserInterno, PIEDE } from '../js/core/documento.js';
import { euro } from '../js/core/formato.js';

const dati = N.preparaDati(leggiJSON('data/noleggio/coefficienti.json'));
const testi = leggiJSON('data/noleggio/testi.json');
const settings = { company: 'Rivenditore di prova Srl\nVia Roma 1, Milano', seller: 'Mario Bianchi', vat: 22, validity: 30 };
const quote = () => ({
  id: 'q1', number: '2026/007', date: '2026-10-11T09:00:00.000Z', customer: 'Officina Rossi & Figli', reference: 'Richiesta del 10/10',
  globalDisc: '30+5', vatOn: true, showImages: true,
  items: [
    { id: 'a', code: '01100313', name: 'MEC 1000 equilibratrice', power: '230V', price: 9500, qty: 1, disc: '' },
    { id: 'b', custom: true, name: 'Trasporto', price: 120, qty: 1, disc: '0', trasporto: true }
  ],
  notes: 'Prezzi IVA esclusa.\nConsegna in 30 giorni.',
  noleggio: { attivo: true, contributo: '7', benefici: true }
});
const nol = q => { const listino = N.listinoAttivo(dati, '2026-10-20'); return { op: N.opzionePreventivo(q, dati, listino), testi, listino, fino: '2026-10-31' }; };

test('PDF: testata, cliente, righe, totali con IVA, note, firma e piè di pagina', () => {
  const q = quote();
  const m = modelloPreventivo({ quote: q, settings, nol: nol(q), imgs: { a: 'data:image/jpeg;base64,AAA' } });
  assert.equal(m.titolo, 'Preventivo 2026/007');
  assert.deepEqual(m.azienda, ['Rivenditore di prova Srl', 'Via Roma 1, Milano']);
  assert.equal(m.data, 'Data 11/10/2026');
  assert.equal(m.valido, 'Valido fino al 10/11/2026');
  assert.deepEqual(m.cliente, { nome: 'Officina Rossi & Figli', riferimento: 'Richiesta del 10/10' });
  assert.equal(m.righe.length, 2);
  assert.deepEqual(m.righe[0], { img: 'data:image/jpeg;base64,AAA', codice: '01100313', descrizione: ['MEC 1000 equilibratrice', '230V'], qta: '1', listino: euro(9500), sconto: '33,5%', netto: euro(9500 * 0.7 * 0.95) });
  assert.equal(m.righe[1].sconto, ''); // voce con sconto "0"
  const netto = 9500 * 0.7 * 0.95 + 120;
  assert.deepEqual(m.totali.map(t => t.etichetta), ['Totale di listino', 'Sconto', 'Totale netto imponibile', 'IVA 22%', 'Totale IVA inclusa']);
  assert.equal(m.totali[2].valore, euro(netto));
  assert.equal(m.totali[4].valore, euro(netto * 1.22));
  assert.deepEqual(m.note, ['Prezzi IVA esclusa.', 'Consegna in 30 giorni.']);
  assert.deepEqual(m.firma, ['Mario Bianchi']);
  assert.equal(m.piede, PIEDE);
  assert.equal(PIEDE, 'Preventivo in tasca · Alessandro Pezzali');
});

test('PDF: riquadro "Oppure a noleggio operativo" con le regole della stampa, senza contributo né base', () => {
  const q = quote();
  const n = nol(q);
  const m = modelloPreventivo({ quote: q, settings, nol: n });
  assert.equal(m.noleggio.titolo, 'Oppure a noleggio operativo');
  assert.equal(m.noleggio.validita, 'Rate valide fino al 31/10/2026');
  assert.equal(m.noleggio.rate.length, n.op.rate.length);
  assert.ok(m.noleggio.rate.every(([d, r]) => /mesi|anni|canoni/i.test(d) && / €$/.test(r)));
  assert.equal(m.noleggio.benefici.length, 2);
  // il contributo del fornitore (7%) cambia la rata ma non compare mai, né la base della rata
  const testo = JSON.stringify(m);
  assert.doesNotMatch(testo, /contribut|fornitore|base della rata/i);
  assert.ok(!testo.includes(String(n.op.baseRata)) && !testo.includes(euro(n.op.baseRata)));
  // senza benefici, senza noleggio attivo
  q.noleggio.benefici = false;
  assert.equal(modelloPreventivo({ quote: q, settings, nol: nol(q) }).noleggio.benefici, null);
  q.noleggio.attivo = false;
  assert.equal(modelloPreventivo({ quote: q, settings, nol: nol(q) }).noleggio, null);
});

test('PDF: immagini solo con l\'interruttore acceso; IVA solo se attiva', () => {
  const q = quote(); q.showImages = false; q.vatOn = false;
  const m = modelloPreventivo({ quote: q, settings, imgs: { a: 'data:image/jpeg;base64,AAA' } });
  assert.equal(m.conImg, false);
  assert.equal(m.righe[0].img, null);
  assert.deepEqual(m.totali.map(t => t.etichetta), ['Totale di listino', 'Sconto', 'Totale netto (IVA esclusa)']);
  assert.equal(m.noleggio, null);
});

test('nome del file: Preventivo_AAAA-NNN_Cliente.pdf senza caratteri strani', () => {
  assert.equal(nomeFilePdf({ number: '2026/007', customer: 'Officina Rossi & Figli' }), 'Preventivo_2026-007_Officina-Rossi-Figli.pdf');
  assert.equal(nomeFilePdf({ number: '2026/012', customer: 'Àlfa Gommé s.n.c. / Forlì' }), 'Preventivo_2026-012_Alfa-Gomme-s-n-c-Forli.pdf');
  assert.equal(nomeFilePdf({ number: null, customer: '' }), 'Preventivo.pdf');
  assert.equal(nomeFilePdf({ number: null, customer: 'Bar "Sport"' }), 'Preventivo_Bar-Sport.pdf');
  assert.ok(nomeFilePdf({ number: '2026/001', customer: 'x'.repeat(80) }).length <= 'Preventivo_2026-001_'.length + 40 + 4);
});

test('browser interno di WhatsApp, Instagram, Facebook', () => {
  assert.ok(browserInterno('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 330.0.0'));
  assert.ok(browserInterno('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0]'));
  assert.ok(browserInterno('Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36 WhatsApp/2.24'));
  assert.ok(!browserInterno('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1'));
  assert.ok(!browserInterno('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36'));
});
