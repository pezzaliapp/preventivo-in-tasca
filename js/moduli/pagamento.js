/*
 * Pagamento (passo 3): accanto al totale, la rata di noleggio operativo BCC per ogni durata,
 * da mettere nel preventivo come "Oppure a noleggio operativo". Calcolo in js/core/noleggio.js.
 */
import * as N from '../core/noleggio.js';
import { NOLEGGIO_INIZIALE } from '../core/preventivo.js';
import { numero2, euro, esc } from '../core/formato.js';
import { oggiISO, isoToIT } from '../core/date.js';
import { stato, preventivoCambiato } from '../stato.js';
import { passiHTML, piede, toast, caricaJSON, scaricaTesto, icona } from '../ui.js';
import { datiNoleggio } from './noleggio.js';
import { riepilogoHTML, collegaRiepilogo } from './riepilogo.js';

export async function mostra(vista, app) {
  vista.closest('.contenuto').classList.add('contenuto-largo');
  let dati, testi;
  try { [dati, testi] = await Promise.all([datiNoleggio(), caricaJSON('data/noleggio/testi.json')]); }
  catch (e) { vista.innerHTML = `${passiHTML('pagamento')}<h1 class="titolo" tabindex="-1">Pagamento</h1><p class="avviso avviso-errore sezione" role="alert">Impossibile leggere i coefficienti BCC. Riapri l'app con la connessione.</p>`; return; }
  const q = () => stato.preventivo;
  const opz = () => (q().noleggio = Object.assign(NOLEGGIO_INIZIALE(dati.durate), q().noleggio || {}));
  let durataTXT = null;

  function disegna() {
    const oggi = oggiISO(new Date(), app.anteprimaData);
    const listino = N.listinoAttivo(dati, oggi);
    const prossimo = N.prossimoListino(dati, oggi);
    const o = opz();
    const op = N.opzionePreventivo(q(), dati, listino);
    const m = op.modalita || 'mensile';
    const fino = N.validoFinoAl(dati, oggi);
    const fasce = op.errore ? [] : N.documentiPerImporto(testi, op.base);
    if (!durataTXT || !op.durate.includes(durataTXT)) durataTXT = op.durate.includes(36) ? 36 : op.durate[0];
    vista.innerHTML = `
      ${passiHTML('pagamento')}
      <div class="percorso"><div class="percorso-principale">
      <h1 class="titolo" tabindex="-1">Pagamento</h1>
      <p class="sottotitolo">Oltre al prezzo, proponi il noleggio operativo BCC: la rata per ogni durata, calcolata sul totale del preventivo.</p>
      <p class="avviso avviso-ok sezione">✅ ${esc(N.notaSimulazione(dati, listino))}</p>
      ${prossimo ? `<p class="avviso avviso-info sezione-stretta">ℹ️ ${esc(N.avvisoProssimo(prossimo))}</p>` : ''}
      ${app.anteprimaData ? `<p class="avviso sezione-stretta">Anteprima: stai simulando il giorno ${isoToIT(app.anteprimaData)}.</p>` : ''}

      ${!q().items.length ? `<section class="riquadro vuoto sezione"><h2 class="titolo">Il preventivo è vuoto</h2><p class="sottotitolo">Aggiungi i prodotti: la rata si calcola sul totale.</p><a class="btn btn-primario" href="#/prodotti">Vai ai prodotti</a></section>` : `
      <section class="riquadro sezione" aria-labelledby="pag-base">
        <h2 id="pag-base" class="sezione-titolo">Su quale importo</h2>
        <dl class="righe">
          <div class="riga"><dt>Totale netto del preventivo (IVA esclusa)</dt><dd>${euro(op.netto)}</dd></div>
          ${op.trasporto ? `<div class="riga"><dt>di cui trasporto</dt><dd>${euro(op.trasporto)}</dd></div>` : ''}
        </dl>
        ${op.trasporto ? `<label class="interruttore"><input type="checkbox" data-pag="includiTrasporto" ${o.includiTrasporto ? 'checked' : ''}><span class="int-ui" aria-hidden="true"></span><span class="int-testo"><strong>Includi il trasporto nella rata</strong><small>${o.includiTrasporto ? 'Il trasporto è finanziato con il noleggio.' : 'Il trasporto si paga a parte.'}</small></span></label>` : ''}
        <div class="campo"><label class="campo-etichetta" for="pag-contributo">Contributo fornitore % (facoltativo)</label>
          <input id="pag-contributo" class="input" inputmode="decimal" placeholder="0" value="${esc(o.contributo)}" aria-describedby="pag-contr-aiuto">
          <p id="pag-contr-aiuto" class="campo-aiuto">Riduce l'importo su cui si calcola la rata; la fascia BCC resta quella dell'importo pieno.</p></div>
        <dl class="righe sezione-stretta">
          <div class="riga riga-forte"><dt>Importo del noleggio (fascia e spese BCC)</dt><dd>${euro(op.base)}</dd></div>
          ${op.contributo ? `<div class="riga"><dt>Contributo fornitore</dt><dd>${numero2(op.contributo)}% = − ${euro(op.base - op.baseRata)}</dd></div>
          <div class="riga riga-forte"><dt>Base usata per la rata</dt><dd>${euro(op.baseRata)}</dd></div>` : ''}
        </dl>
        <p class="nota">Solo per te: base e contributo non compaiono nel preventivo per il cliente.</p>
      </section>

      <section class="riquadro sezione" aria-labelledby="pag-rate">
        <h2 id="pag-rate" class="sezione-titolo">Rate per durata</h2>
        ${op.errore ? `<p class="avviso avviso-errore sezione" role="alert">${esc(op.errore)}</p>` : `
          <p><b>Canone ${m}</b> <span class="nota">(BCC: mensile da 2.700 €, trimestrale da 1.500 € a meno di 2.700 €)</span></p>
          ${op.nota ? `<p class="avviso avviso-info sezione-stretta">${esc(op.nota)}.</p>` : ''}
          ${fino ? `<p class="avviso sezione-stretta">Rate valide fino al ${isoToIT(fino)}: dal giorno dopo valgono i nuovi coefficienti BCC. Il preventivo lo scrive in evidenza.</p>` : ''}`}
        ${op.oltreUltimaFascia ? '<p class="avviso sezione">Importo oltre l\'ultima fascia BCC (999.999 €): si applica l\'ultima fascia. Verifica con BCC.</p>' : ''}
        ${!op.errore ? `
          <div class="scorri sezione"><table class="tabella">
            <caption class="sr">Rate del noleggio operativo; la casella dice se la durata va nel preventivo</caption>
            <thead><tr><th scope="col">Nel preventivo</th><th scope="col">Durata</th><th scope="col" class="num">Rata ${m === 'trimestrale' ? 'trimestrale' : 'mensile'}</th><th scope="col" class="num">Al giorno</th></tr></thead>
            <tbody>${dati.durate.map(d => { const r = N.calcola(op.base, d, m, listino, dati, op.contributo); const on = o.durate.includes(d); return `
              <tr class="${on ? '' : 'riga-spenta'}">
                <td><label class="spunta-riga"><input type="checkbox" data-durata="${d}" ${on ? 'checked' : ''}><span class="sr">Mostra ${d} mesi al cliente</span></label></td>
                <td>${esc(N.descriviDurata(d, m))}</td><td class="num"><b>${numero2(r.rata)} €</b></td><td class="num">${numero2(r.costoGiornaliero)} €</td></tr>`; }).join('')}</tbody>
          </table></div>
          ${!op.durate.length ? '<p class="avviso sezione">Scegli almeno una durata da mostrare al cliente.</p>' : ''}
          <dl class="righe sezione">
            <div class="riga"><dt>Spese di contratto (con il primo canone)</dt><dd>${numero2(op.speseContratto)} €</dd></div>
            <div class="riga"><dt>Spese incasso RID</dt><dd>${numero2(op.rid)} € al mese</dd></div>
          </dl>
          <p class="nota">"Al giorno" è il costo su base mensile diviso per 22 giorni lavorativi${m === 'trimestrale' ? ' (la rata trimestrale si divide prima per 3)' : ''}. Resta solo qui: nel preventivo vanno le rate.</p>` : ''}
      </section>

      <section class="riquadro sezione" aria-labelledby="pag-prev">
        <h2 id="pag-prev" class="sezione-titolo">Nel preventivo per il cliente</h2>
        <label class="interruttore"><input type="checkbox" data-pag="attivo" ${o.attivo ? 'checked' : ''}><span class="int-ui" aria-hidden="true"></span><span class="int-testo"><strong>Aggiungi "${esc(testi.titolo)}"</strong><small>Dopo il totale, nella stampa e nel testo da condividere.</small></span></label>
        <label class="interruttore"><input type="checkbox" data-pag="benefici" ${o.benefici ? 'checked' : ''} ${o.attivo ? '' : 'disabled'}><span class="int-ui" aria-hidden="true"></span><span class="int-testo"><strong>Con i benefici fiscali e finanziari</strong></span></label>
        ${o.attivo && op.visibile ? `
          <div class="anteprima-noleggio sezione" aria-label="Anteprima del riquadro">${riquadroNoleggioHTML(op, testi, listino, o.benefici, fino)}</div>` : `<p class="nota sezione">${o.attivo ? (op.errore ? `Nessun riquadro: ${esc(op.errore.replace(/\.$/, '').toLowerCase())}.` : 'Il riquadro comparirà quando ci sarà almeno una durata.') : 'Il riquadro non sarà nel preventivo.'}</p>`}
      </section>

      ${fasce.length ? `<section class="riquadro sezione" aria-labelledby="pag-doc">
        <h2 id="pag-doc" class="sezione-titolo">Documenti da chiedere al cliente</h2>
        ${fasce.map(f => `<h3 class="sol-sotto">${esc(f.nome)}</h3><p class="nota">${esc(f.descrizione)}${f.inAggiunta ? ', in aggiunta alla fascia A' : ''}</p><ul class="elenco">${f.documenti.map(d => `<li>${esc(d)}</li>`).join('')}</ul>`).join('')}
        <div class="azioni"><a class="btn btn-secondario" href="#/documenti">Moduli BCC per la pratica</a></div>
      </section>` : ''}

      ${!op.errore && op.durate.length ? `<section class="riquadro sezione" aria-labelledby="pag-txt">
        <h2 id="pag-txt" class="sezione-titolo">Preventivo TXT del noleggio</h2>
        <div class="due"><div class="campo"><label class="campo-etichetta" for="pag-txt-durata">Durata in evidenza</label>
          <select id="pag-txt-durata" class="select">${op.durate.map(d => `<option value="${d}" ${d === durataTXT ? 'selected' : ''}>${d} mesi</option>`).join('')}</select></div></div>
        <div class="azioni"><button type="button" class="btn btn-secondario" data-pag-azione="txt">Scarica preventivo TXT</button></div>
      </section>` : ''}`}

      <div class="azioni sezione"><a class="btn btn-secondario" href="#/consegna">${icona('indietro', 20)} Consegna</a><a class="btn btn-primario" href="#/invia">Avanti: invia ${icona('freccia', 20)}</a></div>
      </div>${riepilogoHTML()}</div>
      ${piede(app.versione)}`;
  }

  vista.addEventListener('change', e => {
    const o = opz();
    const k = e.target.dataset.pag;
    if (k) { o[k] = e.target.checked; preventivoCambiato(); disegna(); return; }
    if (e.target.dataset.durata) {
      const d = Number(e.target.dataset.durata);
      o.durate = e.target.checked ? dati.durate.filter(x => x === d || o.durate.includes(x)) : o.durate.filter(x => x !== d);
      preventivoCambiato(); disegna(); vista.querySelector(`[data-durata="${d}"]`)?.focus(); return;
    }
    if (e.target.id === 'pag-txt-durata') durataTXT = Number(e.target.value);
  });
  vista.addEventListener('input', e => { if (e.target.id === 'pag-contributo') { opz().contributo = e.target.value; preventivoCambiato(); } });
  vista.addEventListener('focusout', e => { if (e.target.id === 'pag-contributo') disegna(); });
  vista.addEventListener('keydown', e => { if (e.target.id === 'pag-contributo' && e.key === 'Enter') disegna(); });
  vista.addEventListener('click', e => {
    if (!e.target.closest('[data-pag-azione="txt"]')) return;
    const oggi = oggiISO(new Date(), app.anteprimaData);
    const op = N.opzionePreventivo(q(), dati, N.listinoAttivo(dati, oggi));
    if (op.errore) { toast(op.errore); return; }
    const { nomeFile, testo } = N.testoTXT(op.base, durataTXT, op.modalita, oggi, dati, op.contributo);
    scaricaTesto(nomeFile, testo);
    toast('Preventivo TXT scaricato');
  });
  disegna();
  return collegaRiepilogo(vista);
}

/**
 * Riquadro "Oppure a noleggio operativo" (anteprima qui e stampa in Invia): solo dati per il cliente.
 * Niente base in cifre né contributo del fornitore (D-41). `fino`: ultimo giorno di validità delle rate.
 */
export function riquadroNoleggioHTML(op, testi, listino, benefici, fino = null) {
  const m = op.modalita;
  const n2 = numero2;
  return `
    <section class="pr-sezione pr-noleggio">
      <h2>${esc(testi.titolo)}</h2>
      ${fino ? `<p class="pr-nol-validita">Rate valide fino al ${isoToIT(fino)}</p>` : ''}
      <p class="pr-nol-base">${esc(N.descrizioneCanone(op))}.${op.nota ? ` ${esc(op.nota)}.` : ''}</p>
      <table class="pr-tabella pr-tabella-nol">
        <thead><tr><th>Durata</th><th class="r">${m === 'trimestrale' ? 'Canone trimestrale' : 'Canone mensile'}</th></tr></thead>
        <tbody>${op.rate.map(r => `<tr><td>${esc(N.descriviDurata(r.durata, m))}</td><td class="r"><b>${n2(r.rata)} €</b></td></tr>`).join('')}</tbody>
      </table>
      <ul class="pr-nol-note">
        <li>${esc(testi.spese.replace('{spese}', n2(op.speseContratto) + ' €'))}</li>
        <li>${esc(testi.rid.replace('{rid}', n2(op.rid) + ' €'))}</li>
        <li>${esc(testi.canoni)}</li>
        <li>${esc(testi.primoCanone[m])}</li>
      </ul>
      ${benefici ? `<div class="pr-nol-benefici">${[testi.beneficiFiscali, testi.beneficiFinanziari].map(b => `<div><h3>${esc(b.titolo)}</h3>${b.testi.map(t => `<p>${esc(t)}</p>`).join('')}</div>`).join('')}</div>` : ''}
      <p class="pr-nol-simulazione">${esc(testi.simulazione)} Coefficienti BCC ${esc(listino.nome)}.</p>
    </section>`;
}
