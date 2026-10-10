/*
 * Rata di noleggio operativo BCC (porting di Rel01). Si usa da solo (#/noleggio).
 * I calcoli sono in js/core/noleggio.js; qui solo la schermata.
 */
import * as N from '../core/noleggio.js';
import { leggiImporto, numero2, euro, esc } from '../core/formato.js';
import { oggiISO, isoToIT } from '../core/date.js';
import { caricaJSON, scaricaTesto, piede, toast } from '../ui.js';
import { Pref } from '../store.js';

export const PERCORSO_DATI = 'data/noleggio/coefficienti.json';
let datiPronti = null;
export function datiNoleggio() {
  if (!datiPronti) datiPronti = caricaJSON(PERCORSO_DATI).then(N.preparaDati);
  return datiPronti;
}

const scelte = (nome, legenda, opzioni, valore) => `
  <fieldset class="gruppo">
    <legend>${legenda}</legend>
    <div class="segmenti">${opzioni.map(([v, t]) => `<label class="seg-voce"><input type="radio" name="${nome}" value="${v}" ${String(v) === String(valore) ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>
  </fieldset>`;

export async function mostra(vista, app) {
  vista.innerHTML = `<h1 class="titolo" tabindex="-1">Rata noleggio</h1><p class="sottotitolo">Carico i coefficienti BCC…</p>`;
  let dati;
  try { dati = await datiNoleggio(); }
  catch (e) {
    vista.innerHTML = `<h1 class="titolo" tabindex="-1">Rata noleggio</h1><p class="avviso avviso-errore sezione" role="alert">Impossibile leggere i coefficienti BCC. Riapri l'app con la connessione.</p>`;
    return;
  }
  const salvato = Pref.get('noleggio', {}) || {};
  const st = {
    importo: salvato.importo || '',
    durata: dati.durate.includes(salvato.durata) ? salvato.durata : dati.durataPredefinita,
    modalita: salvato.modalita === 'trimestrale' ? 'trimestrale' : 'mensile',
    contributo: salvato.contributo || ''
  };

  vista.innerHTML = `
    <h1 class="titolo" tabindex="-1">Rata noleggio</h1>
    <p class="sottotitolo">Noleggio operativo BCC: rata, spese e valore di riacquisto per un importo.</p>
    <div id="nol-listino" class="sezione"></div>

    <section class="riquadro sezione" aria-labelledby="nol-dati">
      <h2 id="nol-dati" class="sr">Dati del noleggio</h2>
      <div class="campo">
        <label class="campo-etichetta" for="nol-importo">Importo della fornitura (IVA esclusa)</label>
        <input id="nol-importo" class="input input-grande" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off"
          placeholder="Es. 18.381,00" value="${esc(st.importo)}" aria-describedby="nol-importo-msg">
        <p id="nol-importo-msg" class="campo-aiuto">Scrivi l'importo in euro, per esempio 18.381,00.</p>
      </div>
      ${scelte('nol-durata', 'Durata', dati.durate.map(d => [d, `${d} mesi`]), st.durata)}
      <p class="nota sezione-stretta">Il canone lo decide l'importo, come prevede BCC: mensile da 2.700 €, trimestrale da 1.500 € a meno di 2.700 €.</p>
      <div class="campo">
        <label class="campo-etichetta" for="nol-contributo">Contributo fornitore % (facoltativo)</label>
        <input id="nol-contributo" class="input" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(st.contributo)}" aria-describedby="nol-contributo-aiuto">
        <p id="nol-contributo-aiuto" class="campo-aiuto">Riduce l'importo su cui si calcola la rata; la fascia BCC resta quella dell'importo pieno.</p>
      </div>
    </section>

    <div id="nol-risultato" aria-live="polite"></div>

    <section class="sezione">
      <p class="nota">I risultati sono una simulazione: condizioni finali, tassi e approvazione dipendono dall'ente finanziatore e dall'istruttoria. Non sostituiscono un'offerta ufficiale. Tutti gli importi sono IVA esclusa.</p>
    </section>
    ${piede(app.versione)}`;

  const $ = s => vista.querySelector(s);
  const inp = $('#nol-importo');

  function disegna() {
    // la data si rivaluta a ogni calcolo: a cavallo della mezzanotte del cambio listino vale subito il nuovo
    const oggi = oggiISO(new Date(), app.anteprimaData);
    const listino = N.listinoAttivo(dati, oggi);
    const prossimo = N.prossimoListino(dati, oggi);
    $('#nol-listino').innerHTML = `
      <p class="avviso avviso-ok">✅ ${esc(N.notaSimulazione(dati, listino))}</p>
      ${prossimo ? `<p class="avviso avviso-info" style="margin-top:8px">ℹ️ ${esc(N.avvisoProssimo(prossimo))}</p>` : ''}
      ${app.anteprimaData ? `<p class="avviso" style="margin-top:8px">Anteprima: stai simulando il giorno ${isoToIT(app.anteprimaData)}.</p>` : ''}`;

    Pref.set('noleggio', st);
    const imponibile = leggiImporto(st.importo);
    const msg = $('#nol-importo-msg');
    const out = $('#nol-risultato');
    if (!String(st.importo).trim()) {
      msg.className = 'campo-aiuto'; msg.textContent = 'Scrivi l\'importo in euro, per esempio 18.381,00.';
      inp.removeAttribute('aria-invalid');
      out.innerHTML = '';
      app.barra(null, vista);
      return;
    }
    const errore = N.controllaDati(imponibile, st.durata, dati);
    if (errore) {
      msg.className = 'campo-errore'; msg.textContent = errore;
      inp.setAttribute('aria-invalid', 'true');
      out.innerHTML = '';
      app.barra(null, vista);
      return;
    }
    msg.className = 'campo-aiuto'; msg.textContent = `Importo letto: ${euro(imponibile)}`;
    inp.removeAttribute('aria-invalid');

    st.modalita = N.modalitaPerImporto(imponibile, dati);
    const contributo = Math.max(0, Math.min(100, leggiImporto(st.contributo)));
    const r = N.calcola(imponibile, st.durata, st.modalita, listino, dati, contributo);
    const { canoni } = N.canoniPerDurate(imponibile, listino, dati, contributo);
    const nota = N.notaCanone(st.modalita, dati);
    const etichetta = st.modalita === 'trimestrale' ? 'Rata trimestrale' : 'Rata mensile';
    out.innerHTML = `
      <section class="riquadro sezione" aria-labelledby="nol-rata">
        <p id="nol-rata" class="etichetta-grande">${etichetta}</p>
        <p class="grande">${numero2(r.rata)} €</p>
        <p class="sottotitolo">${esc(N.descriviDurata(st.durata, st.modalita))} da ${numero2(r.rata)} €</p>
        <dl class="righe sezione">
          <div class="riga"><dt>Spese di contratto (con il primo canone)</dt><dd>${numero2(r.speseContratto)} €</dd></div>
          <div class="riga"><dt>Costo giornaliero (su base mensile)</dt><dd>${numero2(r.costoGiornaliero)} €</dd></div>
          <div class="riga"><dt>Costo orario</dt><dd>${numero2(r.costoOrario)} €</dd></div>
          <div class="riga"><dt>Spese incasso RID</dt><dd>${numero2(dati.speseIncassoRidMese)} € al mese</dd></div>
          ${r.contributoPct ? `<div class="riga"><dt>Rata calcolata su (contributo fornitore ${numero2(r.contributoPct)}%)</dt><dd>${numero2(r.base)} €</dd></div>` : ''}
        </dl>
        ${nota ? `<p class="avviso avviso-info sezione">${esc(nota)}.</p>` : ''}
        ${N.oltreUltimaFascia(imponibile, listino) ? '<p class="avviso sezione">Importo oltre l\'ultima fascia BCC (999.999 €): si applica l\'ultima fascia. Verifica con BCC.</p>' : ''}
      </section>

      <section class="riquadro sezione" aria-labelledby="nol-bcc">
        <h2 id="nol-bcc" class="sezione-titolo">Parametri BCC applicati</h2>
        <dl class="righe">
          <div class="riga"><dt>Fascia applicata (fino a)</dt><dd>${numero2(r.fascia)} €</dd></div>
          <div class="riga"><dt>Valore di riacquisto (VR)</dt><dd>${numero2(r.vrPerc)}% — ${numero2(r.vrEuro)} €</dd></div>
          <div class="riga"><dt>Importo finanziato (imponibile − VR)</dt><dd>${numero2(r.importoFinanziato)} €</dd></div>
        </dl>
      </section>

      <section class="riquadro sezione" aria-labelledby="nol-durate">
        <h2 id="nol-durate" class="sezione-titolo">Canoni mensili per ogni durata</h2>
        ${st.modalita === 'trimestrale' ? '<p class="nota">Come nel preventivo TXT, questa tabella riporta i canoni mensili anche quando il canone scelto è trimestrale.</p>' : ''}
        <div class="scorri"><table class="tabella">
          <thead><tr><th scope="col">Durata</th><th scope="col" class="num">Canone mensile</th></tr></thead>
          <tbody>${dati.durate.map(d => `
            <tr class="${d === st.durata ? 'scelta-riga' : ''}">
              <td><button type="button" class="link" data-durata="${d}" aria-label="Scegli ${d} mesi">${d} mesi</button></td>
              <td class="num">${numero2(canoni[d])} €</td></tr>`).join('')}</tbody>
        </table></div>
      </section>

      <div class="azioni">
        <button type="button" class="btn btn-primario" id="nol-txt">Scarica preventivo TXT</button>
        <a class="btn btn-secondario" href="#/documenti">Documenti BCC per la pratica</a>
      </div>
      ${imponibile > 50000 ? '<p class="avviso avviso-info sezione">Oltre 50.000 € serve anche il Fascicolo antiriciclaggio, da compilare e firmare da cliente e fornitore.</p>' : ''}`;

    app.barra({ etichetta: `${etichetta}, ${st.durata} mesi`, importo: euro(r.rata), href: '#/noleggio' }, vista);
  }

  inp.addEventListener('input', () => { st.importo = inp.value; disegna(); });
  vista.querySelector('#nol-contributo').addEventListener('input', e => { st.contributo = e.target.value; disegna(); });
  vista.addEventListener('change', e => {
    if (e.target.name === 'nol-durata') { st.durata = Number(e.target.value); disegna(); }
  });
  vista.addEventListener('click', e => {
    const d = e.target.closest('[data-durata]');
    if (d) {
      st.durata = Number(d.dataset.durata);
      const r = vista.querySelector(`input[name="nol-durata"][value="${st.durata}"]`);
      if (r) r.checked = true;
      disegna();
      toast(`Durata: ${st.durata} mesi`);
      return;
    }
    if (e.target.closest('#nol-txt')) {
      const imponibile = leggiImporto(st.importo);
      if (!imponibile || imponibile <= 0) { toast(N.ERRORE_TXT); return; }
      const errore = N.controllaDati(imponibile, st.durata, dati);
      if (errore) { toast(errore); return; }
      st.modalita = N.modalitaPerImporto(imponibile, dati);
      const contributo = Math.max(0, Math.min(100, leggiImporto(st.contributo)));
      const { nomeFile, testo } = N.testoTXT(imponibile, st.durata, st.modalita, oggiISO(new Date(), app.anteprimaData), dati, contributo);
      scaricaTesto(nomeFile, testo);
      toast('Preventivo TXT scaricato');
    }
  });
  // l'app lasciata aperta dal giorno prima: alla riapertura vale il listino del giorno
  const quandoTorna = () => { if (document.visibilityState === 'visible') disegna(); };
  document.addEventListener('visibilitychange', quandoTorna);
  disegna();
  return () => document.removeEventListener('visibilitychange', quandoTorna);
}
