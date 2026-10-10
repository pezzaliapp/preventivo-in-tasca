/* Documenti BCC: il kit del noleggio operativo, disponibile anche offline. */
import { caricaJSON, piede } from '../ui.js';
import { esc } from '../core/formato.js';

const CARTELLA = 'data/noleggio/documenti/';

const voce = d => `
  <li class="documento">
    <span class="doc-icona" aria-hidden="true">${d.icona || '📄'}</span>
    <span class="doc-titolo">${esc(d.titolo)}</span>
    <span class="doc-nota">${d.nota ? esc(d.nota) + ' · ' : ''}PDF</span>
    <span class="doc-azioni">
      <a class="btn btn-secondario" href="${CARTELLA + encodeURIComponent(d.file)}" target="_blank" rel="noopener">Apri</a>
      <a class="btn btn-secondario" href="${CARTELLA + encodeURIComponent(d.file)}" download="${esc(d.file)}">Scarica</a>
    </span>
  </li>`;

export async function mostra(vista, app) {
  let k;
  try { k = await caricaJSON('data/noleggio/documenti.json'); }
  catch (e) {
    vista.innerHTML = `<h1 class="titolo" tabindex="-1">Documenti BCC</h1><p class="avviso avviso-errore sezione" role="alert">Elenco dei documenti non disponibile. Riapri l'app con la connessione.</p>`;
    return;
  }
  vista.innerHTML = `
    <h1 class="titolo" tabindex="-1">${esc(k.titolo)}</h1>
    <p class="sottotitolo">${esc(k.nota)}</p>
    <ul class="documenti sezione">${k.documenti.map(voce).join('')}</ul>
    <section class="sezione" aria-labelledby="doc-50">
      <h2 id="doc-50" class="sezione-titolo">${esc(k.oltre50mila.titolo)}</h2>
      <ul class="documenti">${k.oltre50mila.documenti.map(voce).join('')}</ul>
    </section>
    <p class="nota sezione">Documenti pubblici BCC, salvati nell'app: si aprono anche senza connessione.</p>
    ${piede(app.versione)}`;
}
