/* Schermata provvisoria per le parti che arrivano nelle fasi successive. */
import { passiHTML, piede } from '../ui.js';
import { esc } from '../core/formato.js';

export function mostra(vista, app, rotta) {
  vista.innerHTML = `
    ${rotta.passo ? passiHTML(rotta.passo) : ''}
    <h1 class="titolo" tabindex="-1">${esc(rotta.titolo)}</h1>
    <section class="riquadro vuoto sezione">
      <p class="sottotitolo">${esc(rotta.descrizione)}</p>
      <p class="nota">Questa parte è in preparazione.</p>
      <p style="margin-top:16px"><a class="btn btn-secondario" href="#/home">Torna alla Home</a></p>
    </section>
    ${piede(app.versione)}`;
}
