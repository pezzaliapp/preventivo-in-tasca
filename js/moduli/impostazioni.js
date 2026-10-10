/* Impostazioni: listino, book dell'agente, intestazione, valori predefiniti, tema, dati e strumenti. */
import { stato, impostazioniCambiate } from '../stato.js';
import { Pref } from '../store.js';
import { listino, ascoltaListino, caricaFile, rimuoviListino } from '../catalogo.js';
import { esc } from '../core/formato.js';
import { piede, toast, conferma, apriFoglio, scaricaTesto } from '../ui.js';
import { apriGuida, svuotaDisegni } from './agente-viste.js';
import { datiTrasporti, listiniHTML } from './trasporto.js';
import { applicaTema, statoCopiaOffline } from '../app.js';

export function mostra(vista, app) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'application/pdf,.pdf'; input.hidden = true;
  const inputDati = document.createElement('input');
  inputDati.type = 'file'; inputDati.accept = 'application/json,.json'; inputDati.hidden = true; inputDati.id = 'imp-file-dati';

  function disegna() {
    const s = stato.impostazioni;
    const c = listino.catalog;
    const tema = Pref.get('tema', 'auto');
    const copiaTesto = !app.copiaOffline ? 'Controllo non ancora fatto.'
      : app.copiaOffline.completa ? 'Pronta: l\'app funziona anche senza connessione.'
      : 'Incompleta: riapri l\'app con la connessione per ricostruirla.';
    vista.innerHTML = `
      <h1 class="titolo" tabindex="-1">Impostazioni</h1>

      <section class="riquadro sezione" aria-labelledby="imp-listino">
        <h2 id="imp-listino" class="sezione-titolo">Listino</h2>
        ${listino.lettura ? `<p class="avviso avviso-info" aria-live="polite">Sto leggendo il listino: ${esc(listino.lettura.fase)}${listino.lettura.totale ? ` ${listino.lettura.fatto} di ${listino.lettura.totale}` : ''}.</p>`
          : c ? `<p><b>${esc(c.title)}</b><br><span class="nota">${esc(c.fileName || '')}, ${c.pages} pagine, ${c.products.length} articoli, caricato il ${new Date(c.parsedAt).toLocaleDateString('it-IT')}</span></p>`
          : '<p class="nota">Nessun listino caricato.</p>'}
        <p class="nota sezione-stretta">Il listino resta solo su questo dispositivo. L'app lo legge in locale e non lo invia a nessun server.</p>
        <div class="azioni">
          <button type="button" class="btn btn-primario" data-imp="carica" ${listino.lettura ? 'disabled' : ''}>${c ? 'Sostituisci listino' : 'Carica listino PDF'}</button>
          ${c ? '<button type="button" class="btn btn-pericolo" data-imp="rimuovi">Rimuovi dal dispositivo</button>' : ''}
        </div>
      </section>

      ${c ? `<section class="riquadro sezione" aria-labelledby="imp-book">
        <h2 id="imp-book" class="sezione-titolo">Book dell'agente</h2>
        ${listino.pack ? `<p>Sbloccato con questo listino. Postazioni pronte, consiglio a domande, controlli sul preventivo e note per l'agente sono attivi.</p>
          <div class="azioni"><button type="button" class="btn btn-secondario" data-imp="guida">Apri la guida agente</button>${listino.pack.disegni && listino.pack.disegni.length ? '<button type="button" class="btn btn-secondario" data-imp="disegni">Disegni incasso</button>' : ''}</div>`
          : `<p class="nota">${listino.packState === 'nomatch' ? 'Il book disponibile non corrisponde a questo listino.' : listino.packState === 'nofile' ? 'Book non disponibile (serve una connessione la prima volta).' : 'Non disponibile.'}</p>`}
        <p class="nota sezione-stretta">Le informazioni del book sono cifrate: si aprono solo con il listino caricato e restano su questo dispositivo. Non vanno mai nel preventivo per il cliente.</p>
      </section>` : ''}

      <section class="riquadro sezione" aria-labelledby="imp-intestazione">
        <h2 id="imp-intestazione" class="sezione-titolo">Intestazione del preventivo</h2>
        <div class="campo"><label class="campo-etichetta" for="imp-azienda">Azienda e contatti</label><textarea id="imp-azienda" class="area" data-imp-campo="company" rows="4" placeholder="Ragione sociale&#10;Indirizzo&#10;P.IVA, telefono, email">${esc(s.company)}</textarea></div>
        <div class="campo"><label class="campo-etichetta" for="imp-firma">Firma del venditore</label><textarea id="imp-firma" class="area" data-imp-campo="seller" rows="2" placeholder="Nome, cellulare">${esc(s.seller)}</textarea></div>
      </section>

      <section class="riquadro sezione" aria-labelledby="imp-predefiniti">
        <h2 id="imp-predefiniti" class="sezione-titolo">Valori predefiniti</h2>
        <div class="due">
          <div class="campo"><label class="campo-etichetta" for="imp-iva">IVA %</label><input id="imp-iva" class="input" data-imp-campo="vat" inputmode="decimal" value="${esc(s.vat)}"></div>
          <div class="campo"><label class="campo-etichetta" for="imp-validita">Validità del preventivo (giorni)</label><input id="imp-validita" class="input" data-imp-campo="validity" inputmode="numeric" value="${esc(s.validity)}"></div>
        </div>
        <div class="campo"><label class="campo-etichetta" for="imp-sconto">Sconto predefinito %</label><input id="imp-sconto" class="input" data-imp-campo="defaultDisc" inputmode="decimal" value="${esc(s.defaultDisc)}" placeholder="Es. 20 o 30+5"></div>
        <div class="campo"><label class="campo-etichetta" for="imp-note">Note standard</label><textarea id="imp-note" class="area" data-imp-campo="notes" rows="3">${esc(s.notes)}</textarea></div>
        <p class="nota sezione-stretta">Sconto e note predefiniti valgono per i nuovi preventivi.</p>
      </section>

      <section class="riquadro sezione" aria-labelledby="imp-aspetto">
        <h2 id="imp-aspetto" class="sezione-titolo">Aspetto</h2>
        <fieldset class="gruppo"><legend>Tema</legend><div class="segmenti">
          ${[['auto', 'Automatico'], ['chiaro', 'Chiaro'], ['scuro', 'Scuro']].map(([v, t]) => `<label class="seg-voce"><input type="radio" name="imp-tema" value="${v}" ${tema === v ? 'checked' : ''}><span>${t}</span></label>`).join('')}
        </div></fieldset>
        <p class="nota sezione-stretta">Automatico segue l'impostazione del dispositivo.</p>
      </section>

      <section class="riquadro sezione" aria-labelledby="imp-trasporti">
        <h2 id="imp-trasporti" class="sezione-titolo">Trasporti</h2>
        <div class="azioni">
          <a class="btn btn-secondario" href="#/abbinamenti">Verifica abbinamenti trasporto</a>
          <button type="button" class="btn btn-secondario" data-imp="listini">Listini e aggiornamenti</button>
          <a class="btn btn-secondario" href="strumenti/analisi.html">Analisi mensile dei costi</a>
        </div>
        <p class="nota sezione-stretta">L'analisi mensile legge il file Excel delle spese solo in questo browser. Gli adeguamenti dei costi si impostano nella schermata del trasporto.</p>
      </section>

      <section class="riquadro sezione" aria-labelledby="imp-dati">
        <h2 id="imp-dati" class="sezione-titolo">Dati e uso offline</h2>
        <h3 class="sol-sotto">Dalle app precedenti</h3>
        <p id="imp-vecchie" class="nota">${Pref.get('importazione') ? `Ultima importazione: ${new Date(Pref.get('importazione').data).toLocaleDateString('it-IT')}. ${esc(Pref.get('importazione').testo)}` : 'Listino in tasca, Calcolo trasporti e Calcolo noleggio: si leggono soltanto, non vengono toccate.'}</p>
        <div class="azioni"><button type="button" class="btn btn-secondario" data-imp="vecchie">Importa dalle app precedenti</button></div>
        <h3 class="sol-sotto">File di trasferimento</h3>
        <p class="nota">Preventivi salvati, preventivo in corso, impostazioni, abbinamenti e trasporto in un file .json, per una copia di sicurezza o per un altro indirizzo dell'app. Il listino PDF e il book non entrano nel file: il listino si ricarica dal dispositivo.</p>
        <div class="azioni"><button type="button" class="btn btn-secondario" data-imp="esporta">Salva i dati in un file</button><button type="button" class="btn btn-secondario" data-imp="importa-file">Carica i dati da un file</button></div>
        <h3 class="sol-sotto">Uso offline</h3>
        <p>Copia per l'uso offline: <b id="imp-copia">${copiaTesto}</b></p>
        <div class="azioni"><button type="button" class="btn btn-secondario" data-imp="copia">Controlla adesso</button></div>
        <p class="nota sezione-stretta">Listino, preventivi e impostazioni sono salvati solo in questo browser. Cancellando i dati del sito si cancellano anche loro.</p>
      </section>
      ${piede(app.versione)}`;
    vista.appendChild(input);
    vista.appendChild(inputDati);
  }

  inputDati.addEventListener('change', async () => {
    const f = inputDati.files && inputDati.files[0]; inputDati.value = '';
    if (!f) return;
    if (!(await conferma('Caricare i dati dal file?', { si: 'Carica', dettaglio: 'Si aggiungono i preventivi che mancano e si completano le impostazioni vuote. Niente di quello che c\'è qui viene cancellato.' }))) return;
    const M = await import('../migrazione.js');
    const r = await M.importaFile(await f.text());
    toast(r.testo, { durata: 8000 });
    if (r.ok) disegna();
  });
  input.addEventListener('change', async () => {
    const f = input.files && input.files[0]; input.value = '';
    const r = await caricaFile(f);
    if (r.messaggio) toast(r.messaggio);
  });
  vista.addEventListener('input', e => {
    const k = e.target.dataset.impCampo;
    if (!k) return;
    stato.impostazioni[k] = e.target.value;
    impostazioniCambiate();
  });
  vista.addEventListener('change', e => {
    if (e.target.name === 'imp-tema') { Pref.set('tema', e.target.value); applicaTema(e.target.value); }
  });
  vista.addEventListener('click', async e => {
    const b = e.target.closest('[data-imp]');
    if (!b) return;
    switch (b.dataset.imp) {
      case 'carica': input.click(); break;
      case 'rimuovi':
        if (!(await conferma('Rimuovere il listino da questo dispositivo?', { si: 'Rimuovi', pericolo: true, dettaglio: 'I preventivi salvati restano. Per usarlo di nuovo dovrai ricaricare il PDF.' }))) return;
        await rimuoviListino(); svuotaDisegni(); toast('Listino rimosso');
        break;
      case 'guida': apriGuida(); break;
      case 'disegni': apriGuida('disegni'); break;
      case 'listini':
        try { apriFoglio('Listini e aggiornamenti', listiniHTML(await datiTrasporti())); }
        catch (x) { toast('Listini non disponibili senza connessione'); }
        break;
      case 'vecchie': {
        const M = await import('../migrazione.js');
        const t = await M.rilevaVecchieApp();
        if (!t.qualcosa) { toast('Su questo dispositivo non ci sono dati delle app precedenti'); break; }
        if (!(await conferma('Importare i dati dalle app precedenti?', { si: 'Importa', dettaglio: 'Si copiano qui solo i dati che mancano. Le app precedenti non vengono toccate.' }))) break;
        try { const { testo } = await M.importaDaVecchieApp(); toast(testo, { durata: 8000 }); disegna(); }
        catch (x) { console.error(x); toast('Importazione non riuscita: i dati delle app precedenti restano dove sono'); }
        break;
      }
      case 'esporta': {
        const M = await import('../migrazione.js');
        const dati = await M.fileDati(app.versione);
        const oggi = new Date().toISOString().slice(0, 10);
        scaricaTesto(`preventivo-in-tasca-dati-${oggi}.json`, JSON.stringify(dati, null, 1), 'application/json');
        toast(`File salvato: ${dati.preventivi.length} preventivi`);
        break;
      }
      case 'importa-file': inputDati.click(); break;
      case 'copia': {
        const el = vista.querySelector('#imp-copia');
        el.textContent = 'Controllo…';
        const st = await statoCopiaOffline();
        app.copiaOffline = st;
        el.textContent = st.senzaServiceWorker ? 'Non attiva in questo browser.' : st.completa ? 'Pronta: l\'app funziona anche senza connessione.' : 'Incompleta: riapri l\'app con la connessione per ricostruirla.';
        break;
      }
    }
  });
  disegna();
  // ridisegna quando cambia il listino, ma non mentre si scrive in un campo
  return ascoltaListino(() => { if (!vista.contains(document.activeElement) || !document.activeElement.matches('input, textarea')) disegna(); });
}
