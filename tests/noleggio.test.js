/* Noleggio: le funzioni nuove danno gli stessi risultati di Rel01, al centesimo. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { leggiJSON, numeroIT, senzaMigliaia } from './aiuti.js';
import * as N from '../js/core/noleggio.js';
import { leggiImporto, numero2 } from '../js/core/formato.js';

const dati = N.preparaDati(leggiJSON('data/noleggio/coefficienti.json'));
const G = leggiJSON('tests/golden/noleggio.json');

/*
 * ECCEZIONE VOLUTA al confronto con Rel01 (decisione S-01, 10/10/2026).
 * Dal listino Ottobre 2026 le spese di contratto seguono i simulatori BCC, con tabelle
 * separate per mensile e trimestrale. Rel01 (che non si tocca) usa ancora:
 *   5.000,01–10.000 €         → 100 €  (nuova app 150 €)
 *   trimestrale oltre 100.000 → 300 €  (nuova app 450 €)
 * Entrambi i valori nuovi sono "da confermare con BCC". Tutto il resto deve coincidere.
 */
function speseAttese(c, speseRel01) {
  if (c.data < '2026-10-15') return speseRel01;
  const imp = leggiImporto(c.importo);
  if (imp > 5000 && imp <= 10000) { assert.equal(speseRel01, 100); return 150; }
  if (c.modalita === 'trimestrale' && imp > 100000) { assert.equal(speseRel01, 300); return 450; }
  return speseRel01;
}
let eccezioni = 0;
/*
 * ALTRE ECCEZIONI VOLUTE (Fase 4, richieste da Alessandro, D-32 e D-33 in _sorgenti/note/DECISIONI.md):
 *  - importo minimo finanziabile (simulatori BCC, D-40): sotto 1.500 € la nuova app non
 *    calcola e dà il messaggio del minimo; Rel01 calcolava. (La scelta mensile/trimestrale per
 *    importo vale nelle schermate: il calcolo con una modalità data resta quello di Rel01.)
 *  - costo giornaliero in trimestrale "su base mensile": rata / 3 / 22 (Rel01: rata / 22),
 *    e di conseguenza il costo orario.
 */
const r2 = x => Math.round(Number(x) * 100) / 100;
let sottoMinimo = 0, giornalieriTrimestrali = 0;

test('golden: ogni importo, durata, modalità e data dà gli stessi valori di Rel01', () => {
  let provati = 0;
  for (const c of G.casi) {
    const imponibile = leggiImporto(c.importo);
    const errore = N.controllaDati(imponibile, c.durata, dati);
    if (c.avviso) { assert.equal(errore, c.avviso, `${c.importo}`); continue; }
    if (imponibile < dati.canone.minimo) { assert.equal(errore, 'Importo sotto il minimo finanziabile da BCC (1.500 €).'); sottoMinimo++; continue; }
    assert.equal(errore, null);
    const listino = N.listinoAttivo(dati, c.data);
    const r = N.calcola(imponibile, c.durata, c.modalita, listino, dati);
    const ctx = `${c.data} ${c.importo} ${c.durata} ${c.modalita}`;
    assert.equal(r.rata, numeroIT(c.rata), 'rata ' + ctx);
    const attese = speseAttese(c, numeroIT(c.spese));
    if (attese !== numeroIT(c.spese)) eccezioni++;
    assert.equal(r.speseContratto, attese, 'spese ' + ctx);
    if (c.modalita === 'trimestrale') {
      // Rel01: rata / 22. Nuova app: rata / 3 / 22 (base mensile).
      assert.equal(numeroIT(c.giornaliero), r2(numeroIT(c.rata) / 22), 'giornaliero Rel01 ' + ctx);
      assert.equal(r.costoGiornaliero, r2(r.rata / 3 / 22), 'giornaliero ' + ctx);
      assert.equal(r.costoOrario, r2(r.costoGiornaliero / 8), 'orario ' + ctx);
      giornalieriTrimestrali++;
    } else {
      assert.equal(r.costoGiornaliero, numeroIT(c.giornaliero), 'giornaliero ' + ctx);
      assert.equal(r.costoOrario, numeroIT(c.orario), 'orario ' + ctx);
    }
    assert.equal(r.fascia, numeroIT(c.fascia), 'fascia ' + ctx);
    assert.equal(r.vrPerc, numeroIT(c.vrPerc), 'vr% ' + ctx);
    assert.equal(r.vrEuro, numeroIT(c.vrEuro), 'vr€ ' + ctx);
    assert.equal(r.importoFinanziato, numeroIT(c.finanziato), 'finanziato ' + ctx);
    // anche la scrittura, a parte il punto delle migliaia
    assert.equal(senzaMigliaia(numero2(r.rata) + ' €'), senzaMigliaia(c.rata), 'testo rata ' + ctx);
    assert.equal(c.etichetta, c.modalita === 'trimestrale' ? 'Rata trimestrale:' : 'Rata mensile:');
    provati++;
  }
  assert.ok(provati > 1500, `casi provati: ${provati}`);
  // le eccezioni sono solo quelle dichiarate sopra, per le 2 date dal 15/10/2026:
  //  5.000–10.000 (5.000,01 · 7500 · 9.999,99 · 10000): 4 importi × 6 durate × 2 modalità
  //  trimestrale oltre 100.000 (100.000,01 · 250.000 · 999.999 · 999.999,01 · 1.234.567,89): 5 × 6
  assert.equal(eccezioni, (4 * 6 * 2 + 5 * 6) * 2);
  // sotto il minimo: 1000 e 0,01 in entrambe le modalità (6 durate × 5 date)
  assert.equal(sottoMinimo, 2 * 2 * 6 * 5);
  assert.ok(giornalieriTrimestrali > 700);
});

test('golden: badge del listino e avviso del prossimo listino', () => {
  for (const [data, atteso] of Object.entries(G.date)) {
    const attivo = N.listinoAttivo(dati, data);
    assert.equal('✅ ' + N.notaSimulazione(dati, attivo), atteso.badge, data);
    const avviso = N.avvisoProssimo(N.prossimoListino(dati, data));
    assert.equal(avviso ? 'ℹ️ ' + avviso : '', atteso.prossimo, data);
  }
});

test('golden: testo TXT identico (a parte il punto delle migliaia) e nome file', () => {
  for (const c of G.txt) {
    const imponibile = leggiImporto(c.importo);
    if (c.avviso) { assert.ok(!imponibile, c.importo); assert.equal(N.ERRORE_TXT, c.avviso); continue; }
    const { testo, nomeFile } = N.testoTXT(imponibile, c.durata, c.modalita, c.data, dati);
    const rel01 = numeroIT(/^Spese di contratto: (.*) €$/m.exec(c.testo)[1]);
    let atteso = c.testo.replace(/^Spese di contratto: .* €$/m, `Spese di contratto: ${numero2(speseAttese(c, rel01))} €`);
    if (c.modalita === 'trimestrale') { // eccezione dichiarata: giornaliero su base mensile
      const rata = numeroIT(/^Rata trimestrale: (.*) €$/m.exec(c.testo)[1]);
      const g = r2(rata / 3 / 22);
      atteso = atteso.replace(/^Costo giornaliero \(su base mensile\): .* €$/m, `Costo giornaliero (su base mensile): ${numero2(g)} €`)
        .replace(/^Costo orario: .* €$/m, `Costo orario: ${numero2(r2(g / 8))} €`);
    }
    assert.equal(senzaMigliaia(testo), senzaMigliaia(atteso), `${c.data} ${c.importo} ${c.durata} ${c.modalita}`);
    assert.match(nomeFile, /^preventivo_noleggio_\d+\.txt$/);
  }
});

test('cambio listino: 14/10/2026 Aprile, 15/10/2026 Ottobre', () => {
  assert.equal(N.listinoAttivo(dati, '2026-10-14').id, '2026-04');
  assert.equal(N.listinoAttivo(dati, '2026-10-15').id, '2026-10');
  assert.equal(N.prossimoListino(dati, '2026-10-14').id, '2026-10');
  assert.equal(N.prossimoListino(dati, '2026-10-15'), null);
  // stesso importo, rata diversa tra i due giorni
  const a = N.calcola(18381, 36, 'mensile', N.listinoAttivo(dati, '2026-10-14'), dati);
  const b = N.calcola(18381, 36, 'mensile', N.listinoAttivo(dati, '2026-10-15'), dati);
  assert.equal(a.rata, 606.35);
  assert.notEqual(a.rata, b.rata);
});

test('spese di contratto Ottobre 2026 come i simulatori BCC, separate per mensile e trimestrale', () => {
  const ott = N.listinoAttivo(dati, '2026-10-15');
  const atteso = {
    mensile: [[5000, 112.5], [5000.01, 150], [10000, 150], [10000.01, 150], [25000, 150], [25000.01, 225], [50000, 225], [50000.01, 300], [100000, 300], [100000.01, 300], [10_000_000, 300]],
    trimestrale: [[5000, 112.5], [5000.01, 150], [10000, 150], [25000.01, 225], [100000, 300], [100000.01, 450], [10_000_000, 450]]
  };
  for (const [m, casi] of Object.entries(atteso)) for (const [imp, e] of casi) assert.equal(N.speseContratto(imp, ott, m), e, `${m} ${imp}`);
  // Aprile 2026 resta la tabella unica di Rel01
  const apr = N.listinoAttivo(dati, '2026-10-14');
  for (const m of ['mensile', 'trimestrale']) {
    assert.equal(N.speseContratto(5000, apr, m), 75);
    assert.equal(N.speseContratto(7000, apr, m), 100);
    assert.equal(N.speseContratto(500000, apr, m), 300);
  }
});

test('trimestrale: durata e numero di canoni', () => {
  assert.equal(N.descriviDurata(12, 'trimestrale'), '12 mesi – 4 canoni trimestrali');
  assert.equal(N.descriviDurata(60, 'trimestrale'), '60 mesi – 20 canoni trimestrali');
  assert.equal(N.descriviDurata(18, 'mensile'), '18 mesi – 18 canoni mensili');
});

test('canoni per tutte le durate: sempre coefficienti mensili, anche in trimestrale', () => {
  const l = N.listinoAttivo(dati, '2026-10-15');
  const { canoni, fascia } = N.canoniPerDurate(20000, l, dati);
  assert.equal(fascia, 25000);
  for (const d of dati.durate) assert.equal(canoni[d], N.calcola(20000, d, 'mensile', l, dati).rata);
});

test('oltre 999.999 € si usa l\'ultima fascia, e lo si può segnalare', () => {
  const l = N.listinoAttivo(dati, '2026-10-15');
  assert.equal(N.fascia(1_500_000, l), 999999);
  assert.equal(N.oltreUltimaFascia(1_500_000, l), true);
  assert.equal(N.oltreUltimaFascia(999_999, l), false);
});

test('canone secondo l\'importo: da 2.700 € mensile, da 1.500 € trimestrale, sotto nessun noleggio', () => {
  const casi = [[1499.99, null], [1500, 'trimestrale'], [2000, 'trimestrale'], [2699.99, 'trimestrale'], [2700, 'mensile'], [18381, 'mensile'], [1_500_000, 'mensile']];
  for (const [imp, m] of casi) assert.equal(N.modalitaPerImporto(imp, dati), m, String(imp));
  assert.equal(N.controllaDati(1499.99, 24, dati), 'Importo sotto il minimo finanziabile da BCC (1.500 €).');
  assert.equal(N.controllaDati(1500, 24, dati), null);
  assert.equal(N.controllaDati(1999, 24, dati), null);   // niente più minimo di 2.000 € in mensile
  assert.equal(N.notaCanone('trimestrale', dati), 'Sotto i 2.700 € BCC prevede il canone trimestrale');
  assert.equal(N.notaCanone('mensile', dati), null);
});

test('rate valide fino al giorno prima del listino futuro', () => {
  assert.equal(N.validoFinoAl(dati, '2026-10-10'), '2026-10-14');
  assert.equal(N.validoFinoAl(dati, '2026-10-14'), '2026-10-14');
  assert.equal(N.validoFinoAl(dati, '2026-10-15'), null);
});

test('contributo fornitore: rata sull\'imponibile ridotto, fascia, spese e VR sull\'importo pieno', () => {
  const l = N.listinoAttivo(dati, '2026-10-15');
  const pieno = N.calcola(26000, 36, 'mensile', l, dati);
  const conC = N.calcola(26000, 36, 'mensile', l, dati, 5);
  assert.equal(conC.base, 24700);
  assert.equal(conC.fascia, 50000);           // fascia dell'importo pieno (26.000 → fino a 50.000)
  assert.equal(conC.coefficiente, pieno.coefficiente);
  assert.equal(conC.rata, Math.round(24700 * l.mensile[50000][36] * 100) / 100);
  assert.equal(conC.speseContratto, pieno.speseContratto);
  assert.equal(conC.vrEuro, pieno.vrEuro);
  // 24.700 sarebbe nella fascia fino a 25.000: il simulatore usa comunque quella dell'importo pieno
  assert.notEqual(conC.coefficiente, l.mensile[25000][36]);
  assert.match(N.testoTXT(26000, 36, 'mensile', '2026-10-15', dati, 5).testo, /^Contributo fornitore: 5,00% \(rata calcolata su 24\.700,00 €\)$/m);
});

test('rate per tutte le durate nella modalità scelta e numero di canoni', () => {
  const l = N.listinoAttivo(dati, '2026-10-15');
  const rate = N.rateTutteLeDurate(18381, 'trimestrale', l, dati);
  assert.deepEqual(rate.map(r => r.numeroCanoni), [4, 6, 8, 12, 16, 20]);
  for (const r of rate) assert.equal(r.rata, N.calcola(18381, r.durata, 'trimestrale', l, dati).rata);
});

test('documenti richiesti al cliente per fascia di importo', () => {
  const testi = leggiJSON('data/noleggio/testi.json');
  const nomi = imp => N.documentiPerImporto(testi, imp).map(f => f.nome[7]);
  assert.deepEqual(nomi(15000), ['A']);
  assert.deepEqual(nomi(15000.01), ['A', 'B']);
  assert.deepEqual(nomi(30000), ['A', 'B']);
  assert.deepEqual(nomi(30000.01), ['A', 'C']);
});

test('opzione noleggio nel preventivo: base netta, trasporto incluso o no, durate scelte', () => {
  const l = N.listinoAttivo(dati, '2026-10-15');
  const testi = leggiJSON('data/noleggio/testi.json');
  const quote = { globalDisc: '30+5', vatOn: true, items: [
    { code: '01100313', price: 9500, qty: 2, disc: '' },
    { custom: true, code: '', name: 'Trasporto a Milano (MI), Lombardia', price: 120, qty: 1, disc: '0', trasporto: { modo: 'groupage' } }
  ] };
  const netto = 9500 * 2 * 0.7 * 0.95 + 120;
  let op = N.opzionePreventivo(quote, dati, l);
  assert.equal(op.base, Math.round(netto * 100) / 100);            // IVA esclusa anche con IVA attiva
  assert.equal(op.trasporto, 120);
  assert.equal(op.modalita, 'mensile');                           // oltre 2.700 €: solo mensile
  assert.deepEqual(op.rate.map(r => r.durata), [12, 18, 24, 36, 48, 60]);
  for (const r of op.rate) assert.equal(r.rata, N.calcola(op.base, r.durata, 'mensile', l, dati).rata);
  // una scelta "trimestrale" salvata non conta: decide l'importo
  quote.noleggio = { attivo: true, modalita: 'trimestrale', durate: [36, 60], includiTrasporto: false, contributo: '3' };
  op = N.opzionePreventivo(quote, dati, l);
  assert.equal(op.modalita, 'mensile');
  assert.equal(op.base, Math.round((netto - 120) * 100) / 100);
  assert.equal(op.baseRata, op.base - op.base * 0.03);
  assert.deepEqual(op.rate.map(r => [r.durata, r.numeroCanoni]), [[36, 36], [60, 60]]);
  assert.equal(op.rate[0].rata, N.calcola(op.base, 36, 'mensile', l, dati, 3).rata);
  // per il cliente: niente base in cifre, niente contributo
  const righe = N.testoOpzione(op, testi, l, '2026-10-14').join('\n');
  assert.match(righe, /^Canone mensile, IVA esclusa, trasporto escluso\.$/m);
  assert.match(righe, /^RATE VALIDE FINO AL 14\/10\/2026$/m);
  assert.doesNotMatch(righe, /contributo|calcolato su|\b18\.|17\.|3,00%/i);
  assert.match(righe, /^• 36 mesi – 36 canoni mensili da [\d.]+,\d{2} €$/m);
  // tra 1.500 e 2.700 €: trimestrale con la nota
  const medio = { globalDisc: '', items: [{ code: 'x', price: 2000, qty: 1, disc: '' }] };
  const t = N.opzionePreventivo(medio, dati, l);
  assert.equal(t.modalita, 'trimestrale');
  assert.equal(t.nota, 'Sotto i 2.700 € BCC prevede il canone trimestrale');
  assert.match(N.testoOpzione(t, testi, l).join('\n'), /^Canone trimestrale, IVA esclusa\. Sotto i 2\.700 € BCC prevede il canone trimestrale\.$/m);
  assert.match(N.testoOpzione(t, testi, l).join('\n'), /^• 12 mesi – 4 canoni trimestrali da/m);
  // spento dall'interruttore o sotto il minimo: niente riquadro
  quote.noleggio.attivo = false;
  assert.equal(N.opzionePreventivo(quote, dati, l).visibile, false);
  const piccolo = { globalDisc: '', items: [{ code: 'x', price: 1000, qty: 1, disc: '' }] };
  const p = N.opzionePreventivo(piccolo, dati, l);
  assert.equal(p.visibile, false);
  assert.equal(p.errore, 'Importo sotto il minimo finanziabile da BCC (1.500 €).');
  assert.deepEqual(N.testoOpzione(p, testi, l), []);
});

test('dati BCC completi: ogni listino ha tutte le fasce e tutte le durate, spese e date in ordine', () => {
  const grezzi = leggiJSON('data/noleggio/coefficienti.json');
  const fasce = Object.keys(grezzi.listini[0].mensile);
  let dataPrima = '';
  for (const l of grezzi.listini) {
    assert.match(l.validoDal, /^\d{4}-\d{2}-\d{2}$/, l.id);
    assert.ok(l.validoDal > dataPrima, `${l.id}: validoDal deve venire dopo il listino precedente`);
    dataPrima = l.validoDal;
    for (const modo of ['mensile', 'trimestrale']) {
      assert.deepEqual(Object.keys(l[modo]), fasce, `${l.id} ${modo}: fasce diverse dal primo listino`);
      for (const f of fasce) for (const d of grezzi.durate) {
        const c = l[modo][f][d];
        assert.ok(typeof c === 'number' && c > 0 && c < 1, `${l.id} ${modo} fascia ${f} durata ${d}: coefficiente mancante o strano (${c})`);
      }
      const spese = Array.isArray(l.speseContratto) ? l.speseContratto : l.speseContratto[modo];
      assert.ok(Array.isArray(spese) && spese.length && spese.at(-1).fino === null, `${l.id} ${modo}: spese di contratto senza l'ultima fascia "oltre"`);
      for (const s of spese) assert.ok(s.euro > 0, `${l.id}: spesa non valida`);
    }
  }
});
