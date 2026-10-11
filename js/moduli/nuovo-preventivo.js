/*
 * Salvataggio in archivio e "Nuovo preventivo" (Home, Prodotti › Il preventivo, Invia).
 * Il nuovo preventivo riparte pulito: righe, cliente, sconti, consegna e scelte del noleggio
 * stanno nel preventivo e ripartono da zero. Impostazioni (azienda, IVA, numerazione) e
 * adeguamenti del trasporto stanno fuori dal preventivo e restano.
 */
import { nextNumber, totals } from '../core/preventivo.js';
import { esc } from '../core/formato.js';
import { stato, nuovoPreventivo, preventivoCambiato, impostazioniCambiate, salvaImpostazioniOra } from '../stato.js';
import { Store } from '../store.js';
import { nuovoId } from '../catalogo.js';
import { apriFoglio, chiudiFoglio, toast } from '../ui.js';

/** Salva il preventivo in corso nell'archivio (al primo salvataggio prende il numero). */
export async function salva() {
  const p = stato.preventivo;
  if (!p.items.length) return false;
  if (!p.id) {
    p.id = nuovoId(); p.number = nextNumber(stato.impostazioni, new Date().getFullYear());
    impostazioniCambiate();
    await salvaImpostazioniOra(); // il contatore va scritto subito: se l'app si chiude ora, il numero non si ripete
  }
  p.savedAt = new Date().toISOString();
  p.totals = totals(p, stato.impostazioni.vat);
  await Store.set('quotes', null, JSON.parse(JSON.stringify(p)));
  preventivoCambiato();
  toast(`Preventivo ${p.number} salvato`);
  return true;
}

function riparti() {
  stato.preventivo = nuovoPreventivo();
  preventivoCambiato();
}

/** Finestra con tre scelte: salva / elimina / annulla. Restituisce 'salva', 'elimina' o null. */
function chiedi(p) {
  return new Promise(resolve => {
    let scelta = null;
    const corpo = apriFoglio('Nuovo preventivo', `
      <p class="sottotitolo">Cosa faccio con il preventivo in corso${p.number ? ` (${esc(p.number)})` : ''}${p.customer ? ` per ${esc(p.customer)}` : ''}?</p>
      <div class="azioni azioni-colonna">
        <button type="button" class="btn btn-primario" data-np="salva">Salva in archivio e inizia nuovo</button>
        <button type="button" class="btn btn-pericolo" data-np="elimina">Elimina e inizia nuovo</button>
        <button type="button" class="btn btn-secondario" data-np="annulla">Annulla</button>
      </div>
      ${p.id ? '<p class="nota sezione-stretta">Con «Elimina» la copia già salvata in archivio resta: si perdono solo le modifiche non salvate.</p>' : ''}`,
    { quandoChiude: () => resolve(scelta) });
    corpo.addEventListener('click', e => {
      const b = e.target.closest('[data-np]');
      if (!b) return;
      scelta = b.dataset.np === 'annulla' ? null : b.dataset.np;
      chiudiFoglio();
    });
    corpo.querySelector('[data-np="salva"]').focus();
  });
}

/**
 * Inizia un nuovo preventivo. Se quello in corso ha righe chiede prima cosa farne;
 * se è vuoto riparte subito. `dopo()` ridisegna chi chiama (anche dopo "Annulla").
 * Restituisce true se il nuovo preventivo è iniziato.
 */
export async function nuovo({ dopo = () => {} } = {}) {
  const p = stato.preventivo;
  if (!p.items.length) { riparti(); dopo(); toast('Nuovo preventivo'); return true; }
  const scelta = await chiedi(p);
  if (scelta === 'salva') {
    try { await salva(); } catch (e) { console.error(e); toast('Non riesco a salvare in archivio: il preventivo resta aperto'); return false; }
    riparti(); dopo();
    toast(`Preventivo ${p.number} in archivio. Nuovo preventivo iniziato`);
    return true;
  }
  if (scelta === 'elimina') {
    riparti(); dopo();
    toast('Preventivo eliminato', { azione: 'Annulla', durata: 10000, quandoAzione: () => { stato.preventivo = p; preventivoCambiato(); dopo(); } });
    return true;
  }
  return false;
}
