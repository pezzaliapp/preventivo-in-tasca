/* Componenti comuni dell'interfaccia: icone, messaggi a comparsa, piè di pagina. */
import { esc } from './core/formato.js';

const PERCORSI = {
  casa: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
  preventivo: '<path d="M6 3h9l4 4v14H6z"/><path d="M14.5 3v4.5H19"/><path d="M9 11h7M9 15h7M9 7h3"/>',
  archivio: '<path d="M3 5h18v4H3z"/><path d="M5 9v10h14V9"/><path d="M10 13h4"/>',
  documenti: '<path d="M8 3h8l3 3v12H8z"/><path d="M5 6v15h11"/><path d="M11 10h5M11 13h5"/>',
  impostazioni: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.4-2.3 1a7.4 7.4 0 0 0-2.6-1.5L14.2 2.6h-4l-.3 2.5a7.4 7.4 0 0 0-2.6 1.5L5 5.6 3 9l2 1.5a7.6 7.6 0 0 0 0 3L3 15l2 3.4 2.3-1a7.4 7.4 0 0 0 2.6 1.5l.3 2.5h4l.3-2.5a7.4 7.4 0 0 0 2.6-1.5l2.3 1 2-3.4z"/>',
  camion: '<path d="M2.5 16.5v-11h11v11M13.5 9h4l3 4v3.5h-1.4M8.2 16.5h7.2"/><circle cx="6" cy="17" r="2"/><circle cx="17.2" cy="17" r="2"/>',
  rata: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8 14.5h3M8 17h6"/>',
  freccia: '<path d="m9 5 7 7-7 7"/>',
  piu: '<path d="M12 5v14M5 12h14"/>',
  indietro: '<path d="m15 5-7 7 7 7"/>'
};

export function icona(nome, size = 24) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PERCORSI[nome] || ''}</svg>`;
}

/* ---------- Messaggio a comparsa, con azione facoltativa (es. Annulla) ---------- */
let timerToast = null;
export function toast(messaggio, { azione = null, quandoAzione = null, durata = azione ? 6000 : 2200 } = {}) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.innerHTML = `<span>${esc(messaggio)}</span>${azione ? `<button type="button" class="toast-azione">${esc(azione)}</button>` : ''}`;
  el.classList.add('mostra');
  const btn = el.querySelector('.toast-azione');
  if (btn) btn.addEventListener('click', () => { chiudi(); quandoAzione && quandoAzione(); }, { once: true });
  function chiudi() { el.classList.remove('mostra'); }
  clearTimeout(timerToast);
  timerToast = setTimeout(chiudi, durata);
}

export function piede(versione) {
  return `<footer class="piede">
    <p>Preventivo in tasca${versione ? ` · versione ${esc(versione)}` : ''}</p>
    <p>© 2026 Alessandro Pezzali. Tutti i diritti riservati. I dati restano su questo dispositivo.</p>
  </footer>`;
}

/** Passi del percorso Prodotti → Consegna → Pagamento → Invia. */
export const PASSI = [
  { rotta: 'prodotti', nome: 'Prodotti' },
  { rotta: 'consegna', nome: 'Consegna' },
  { rotta: 'pagamento', nome: 'Pagamento' },
  { rotta: 'invia', nome: 'Invia' }
];
export function passiHTML(corrente) {
  const i = PASSI.findIndex(p => p.rotta === corrente);
  return `<nav aria-label="Passi del preventivo"><ol class="passi">${PASSI.map((p, k) => `
    <li class="passo ${k < i ? 'fatto' : ''}"><a href="#/${p.rotta}" ${k === i ? 'aria-current="step"' : ''}>
      <span class="passo-n">${k + 1}</span><span>${p.nome}</span></a></li>`).join('')}</ol></nav>`;
}

/* ---------- Finestra a scomparsa (si chiude con ✕, Esc, tocco fuori o tasto Indietro) ---------- */
let foglioAperto = null;
export function apriFoglio(titolo, html, { quandoChiude = null } = {}) {
  chiudiFoglio(true);
  const prima = document.activeElement;
  const el = document.createElement('div');
  el.className = 'foglio';
  el.innerHTML = `
    <div class="foglio-sfondo" data-chiudi></div>
    <section class="foglio-pannello" role="dialog" aria-modal="true" aria-labelledby="foglio-titolo">
      <header class="foglio-testa"><h2 id="foglio-titolo" tabindex="-1">${esc(titolo)}</h2>
        <button type="button" class="chiudi" data-chiudi aria-label="Chiudi">✕</button></header>
      <div class="foglio-corpo">${html}</div>
    </section>`;
  document.body.appendChild(el);
  document.body.classList.add('senza-scorrimento');
  if (!(history.state && history.state.foglio)) history.pushState({ foglio: true }, ''); // una sola voce anche se una finestra ne sostituisce un'altra
  foglioAperto = { el, prima, quandoChiude };
  el.addEventListener('click', e => { if (e.target.closest('[data-chiudi]')) chiudiFoglio(); });
  el.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); chiudiFoglio(); }
    if (e.key === 'Tab') { // il focus resta dentro la finestra
      const f = [...el.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex="0"]')].filter(x => x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
    }
  });
  el.querySelector('#foglio-titolo').focus();
  return el.querySelector('.foglio-corpo');
}
/**
 * Chiude la finestra. Restituisce una promessa che si risolve quando anche la cronologia
 * è tornata indietro: chi poi cambia schermata deve aspettarla, altrimenti il ritorno
 * indietro annullerebbe il cambio.
 */
export function chiudiFoglio(senzaStoria = false) {
  if (!foglioAperto) return Promise.resolve();
  const { el, prima, quandoChiude } = foglioAperto;
  foglioAperto = null;
  el.remove();
  document.body.classList.remove('senza-scorrimento');
  let fatto = Promise.resolve();
  if (!senzaStoria && history.state && history.state.foglio) {
    fatto = new Promise(r => { window.addEventListener('popstate', () => r(), { once: true }); setTimeout(r, 400); });
    history.back();
  }
  if (quandoChiude) quandoChiude();
  if (prima && prima.isConnected) prima.focus({ preventScroll: true });
  return fatto;
}
export const foglioCorpo = () => foglioAperto ? foglioAperto.el.querySelector('.foglio-corpo') : null;
window.addEventListener('popstate', () => { if (foglioAperto) chiudiFoglio(true); });

/** Domanda di conferma con due pulsanti. Restituisce true se l'utente conferma. */
export function conferma(domanda, { si = 'Conferma', no = 'Annulla', pericolo = false, dettaglio = '' } = {}) {
  return new Promise(resolve => {
    let risposta = false;
    const corpo = apriFoglio(domanda, `
      ${dettaglio ? `<p class="sottotitolo">${esc(dettaglio)}</p>` : ''}
      <div class="azioni">
        <button type="button" class="btn btn-secondario" data-r="no">${esc(no)}</button>
        <button type="button" class="btn ${pericolo ? 'btn-pericolo' : 'btn-primario'}" data-r="si">${esc(si)}</button>
      </div>`, { quandoChiude: () => resolve(risposta) });
    corpo.addEventListener('click', e => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      risposta = b.dataset.r === 'si';
      chiudiFoglio();
    });
  });
}

/* ---------- Dati JSON dell'app (una volta sola per sessione) ---------- */
const datiCache = new Map();
export function caricaJSON(percorso) {
  if (!datiCache.has(percorso)) {
    const p = fetch(percorso, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(percorso + ': ' + r.status); return r.json(); });
    p.catch(() => datiCache.delete(percorso));
    datiCache.set(percorso, p);
  }
  return datiCache.get(percorso);
}
/** Rilegge un file dati (per esempio il gasolio quando l'app torna in primo piano). */
export function ricaricaJSON(percorso) { datiCache.delete(percorso); return caricaJSON(percorso); }

/** Scarica un testo come file. */
export function scaricaTesto(nomeFile, testo, tipo = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([testo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url; a.download = nomeFile; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Copia negli appunti (con ripiego per i browser vecchi). */
export async function copia(testo) {
  try { await navigator.clipboard.writeText(testo); return true; }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = testo; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (x) { /* */ } ta.remove(); return ok;
  }
}
