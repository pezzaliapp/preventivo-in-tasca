/* Archivio: preventivi salvati su questo dispositivo (apri, PDF, duplica, elimina con Annulla). */
import { Store } from '../store.js';
import { stato, preventivoCambiato } from '../stato.js';
import { nuovoId } from '../catalogo.js';
import { euro, esc } from '../core/formato.js';
import { piede, toast, conferma, apriFoglio } from '../ui.js';

export async function mostra(vista, app) {
  async function disegna() {
    let list = [];
    try { list = (await Store.all('quotes')).sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || '')); }
    catch (e) { /* archivio non disponibile */ }
    vista.innerHTML = `
      <h1 class="titolo" tabindex="-1">Preventivi salvati</h1>
      <p class="sottotitolo">Restano su questo dispositivo.</p>
      ${list.length ? `<ul class="archivio sezione">${list.map(q => `
        <li class="arch">
          <button type="button" class="arch-apri" data-arch="apri" data-id="${esc(q.id)}">
            <span class="arch-num">${esc(q.number)}</span>
            <span class="arch-cliente">${esc(q.customer || 'Senza cliente')}</span>
            <span class="nota">${new Date(q.date).toLocaleDateString('it-IT')}, ${q.items.length} ${q.items.length === 1 ? 'riga' : 'righe'}</span>
          </button>
          <span class="arch-lato">
            <span class="prezzo">${euro(q.totals ? q.totals.net : 0)}</span>
            <span class="arch-azioni">
              <button type="button" class="btn btn-secondario btn-piccolo" data-arch="pdf" data-id="${esc(q.id)}">PDF</button>
              <button type="button" class="btn btn-secondario btn-piccolo" data-arch="duplica" data-id="${esc(q.id)}">Duplica</button>
              <button type="button" class="btn btn-pericolo btn-piccolo" data-arch="elimina" data-id="${esc(q.id)}">Elimina</button>
            </span>
          </span>
        </li>`).join('')}</ul>`
      : `<section class="riquadro vuoto sezione"><h2 class="titolo">Nessun preventivo salvato</h2>
          <p class="sottotitolo">Quelli che salvi restano su questo dispositivo.</p>
          <a class="btn btn-primario" href="#/prodotti">Inizia un preventivo</a></section>`}
      ${piede(app.versione)}`;
  }

  async function apri(id, duplica) {
    const q = await Store.get('quotes', id);
    if (!q) return;
    if (duplica) {
      Object.assign(q, { id: null, number: null, date: new Date().toISOString(), savedAt: null });
      q.items = q.items.map(i => Object.assign({}, i, { id: nuovoId() }));
    }
    stato.preventivo = q;
    preventivoCambiato();
    app.vai('prodotti/preventivo');
    if (duplica) toast('Copia creata: modificala e salvala');
  }

  vista.addEventListener('click', async e => {
    const b = e.target.closest('[data-arch]');
    if (!b) return;
    const id = b.dataset.id;
    if (b.dataset.arch === 'apri') apri(id, false);
    if (b.dataset.arch === 'duplica') apri(id, true);
    if (b.dataset.arch === 'pdf') {
      // il PDF si rifà dal preventivo salvato; poi un tocco su "Invia PDF" lo condivide subito (iPhone)
      const q = await Store.get('quotes', id);
      if (!q) return;
      toast('Preparo il PDF…');
      try {
        const { pdfPreventivo, condividiPdf } = await import('./invia.js');
        const f = await pdfPreventivo(q);
        const corpo = apriFoglio(`PDF del preventivo ${q.number}`, `
          <p class="sottotitolo">${esc(f.name)}</p>
          <div class="azioni">
            <button type="button" class="btn btn-primario" data-pdf="invia">Invia PDF</button>
            <button type="button" class="btn btn-secondario" data-pdf="scarica">Scarica</button>
          </div>`);
        corpo.addEventListener('click', ev => {
          const a = ev.target.closest('[data-pdf]');
          if (!a) return;
          if (a.dataset.pdf === 'invia') condividiPdf(f);
          else { const u = URL.createObjectURL(f); const l = document.createElement('a'); l.href = u; l.download = f.name; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); toast('PDF salvato: aprilo da File o Download', { durata: 6000 }); }
        });
      } catch (err) { console.error(err); toast(err.message || 'PDF non riuscito'); }
    }
    if (b.dataset.arch === 'elimina') {
      const q = await Store.get('quotes', id);
      if (!q || !(await conferma(`Eliminare il preventivo ${q.number}?`, { si: 'Elimina', pericolo: true, dettaglio: 'Viene tolto da questo dispositivo. Subito dopo puoi ancora annullare.' }))) return;
      await Store.del('quotes', id);
      const eraAperto = stato.preventivo && stato.preventivo.id === id;
      if (eraAperto) { stato.preventivo.id = null; stato.preventivo.number = null; stato.preventivo.savedAt = null; preventivoCambiato(); }
      await disegna();
      toast(`Eliminato: ${q.number}`, { azione: 'Annulla', quandoAzione: async () => {
        await Store.set('quotes', null, q);
        if (eraAperto) { Object.assign(stato.preventivo, { id: q.id, number: q.number, savedAt: q.savedAt }); preventivoCambiato(); }
        disegna();
      } });
    }
  });
  await disegna();
}
