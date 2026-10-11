/* Home: tre grandi scelte. Ogni strumento funziona anche da solo. */
import { icona, piede } from '../ui.js';
import { stato, totaleCorrente } from '../stato.js';
import { euro, esc } from '../core/formato.js';
import { Pref } from '../store.js';
import { toast } from '../ui.js';

export const titolo = 'Home';

export function mostra(vista, app) {
  const t = totaleCorrente();
  const p = stato.preventivo;
  // in corso: ha righe, oppure è già iniziato con cliente o riferimento
  const inCorso = !!p && (p.items.length > 0 || !!`${p.customer || ''}${p.reference || ''}`.trim());
  vista.innerHTML = `
    <h1 class="titolo" tabindex="-1">Cosa vuoi fare?</h1>
    <p class="sottotitolo">Prodotti, trasporto e rata di noleggio in un unico preventivo. Ogni strumento si usa anche da solo.</p>

    <div id="home-import"></div>
    <div class="scelte ${inCorso ? 'scelte-4' : ''}">
      <a class="scelta scelta-principale" href="#/prodotti">
        <span class="scelta-icona">${icona('preventivo', 32)}</span>
        <span>
          <span class="scelta-titolo">${inCorso ? 'Continua il preventivo' : 'Preventivo completo'}</span>
          <span class="scelta-testo">${inCorso
            ? (t.lines ? `${t.lines} ${t.lines === 1 ? 'articolo' : 'articoli'}, ${euro(t.net)} netti.` : `${p.customer ? esc(p.customer) + ': ' : ''}ancora nessun articolo.`)
            : 'Scegli le macchine dal listino, aggiungi trasporto e rata, poi invia.'}</span>
        </span>
        <span class="scelta-freccia">${icona('freccia')}</span>
      </a>
      ${inCorso ? `<button type="button" class="scelta scelta-nuovo" id="home-nuovo">
        <span class="scelta-icona">${icona('piu', 32)}</span>
        <span>
          <span class="scelta-titolo">Nuovo preventivo</span>
          <span class="scelta-testo">Salva o elimina quello in corso e ricomincia da zero.</span>
        </span>
        <span class="scelta-freccia">${icona('freccia')}</span>
      </button>` : ''}
      <a class="scelta" href="#/trasporto">
        <span class="scelta-icona">${icona('camion', 32)}</span>
        <span>
          <span class="scelta-titolo">Solo trasporto</span>
          <span class="scelta-testo">Quanto costa spedire? Scegli i prodotti e dove vanno consegnati.</span>
        </span>
        <span class="scelta-freccia">${icona('freccia')}</span>
      </a>
      <a class="scelta" href="#/noleggio">
        <span class="scelta-icona">${icona('rata', 32)}</span>
        <span>
          <span class="scelta-titolo">Solo rata noleggio</span>
          <span class="scelta-testo">Rata del noleggio operativo BCC, mensile o trimestrale.</span>
        </span>
        <span class="scelta-freccia">${icona('freccia')}</span>
      </a>
    </div>

    ${stato.archivioDisponibile ? '' : '<p class="avviso sezione" role="alert">Archivio locale non disponibile in questa modalità del browser: i dati non verranno salvati.</p>'}
    ${piede(app.versione)}`;
  vista.querySelector('#home-nuovo')?.addEventListener('click', async () => {
    const { nuovo } = await import('./nuovo-preventivo.js');
    if (await nuovo()) app.vai('prodotti');
  });
  proponiImportazione(vista);
}

/** Se su questo dispositivo ci sono dati delle app precedenti non ancora importati, lo propone. */
async function proponiImportazione(vista) {
  if (Pref.get('importazione') || Pref.get('importazione_no')) return;
  const { rilevaVecchieApp, importaDaVecchieApp } = await import('../migrazione.js');
  const t = await rilevaVecchieApp().catch(() => ({}));
  const box = vista.querySelector('#home-import');
  if (!t.qualcosa || !box) return;
  const cosa = [t.listino && `il listino (${t.listino} articoli)`, t.preventivi && `${t.preventivi} preventivi salvati`, t.bozza && 'un preventivo in corso',
    t.impostazioni && 'le impostazioni', t.trasporto && 'il carico del trasporto', t.tema && 'il tema scuro'].filter(Boolean);
  box.innerHTML = `
    <section class="riquadro sezione importa" aria-labelledby="imp-titolo">
      <h2 id="imp-titolo" class="sezione-titolo">Importa i tuoi dati dalle app precedenti</h2>
      <p>Su questo dispositivo ci sono dati di Listino in tasca, Calcolo trasporti o Calcolo noleggio${cosa.length ? `: ${esc(cosa.join(', '))}` : ''}.</p>
      <p class="nota sezione-stretta">Si copiano qui con un tocco. Le app precedenti non vengono toccate e continuano a funzionare.</p>
      <div class="azioni"><button type="button" class="btn btn-primario" id="imp-si">Importa i dati</button><button type="button" class="btn btn-secondario" id="imp-no">Non ora</button></div>
    </section>`;
  box.querySelector('#imp-no').addEventListener('click', () => { Pref.set('importazione_no', true); box.innerHTML = ''; toast('Puoi importarli quando vuoi da Opzioni'); });
  box.querySelector('#imp-si').addEventListener('click', async e => {
    e.target.disabled = true; e.target.textContent = 'Importo…';
    try {
      const { testo } = await importaDaVecchieApp();
      box.innerHTML = `<p class="avviso avviso-ok sezione" role="status">${esc(testo)} Le app precedenti non sono state toccate.</p>`;
    } catch (err) {
      console.error(err);
      box.innerHTML = '<p class="avviso avviso-errore sezione" role="alert">Importazione non riuscita. Riprova da Opzioni; i dati delle app precedenti restano dove sono.</p>';
    }
  });
}
