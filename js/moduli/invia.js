/*
 * Invia (passo 4): stampa o PDF, condivisione, salvataggio e nuovo preventivo.
 * La stampa e il testo condiviso contengono SOLO dati per il cliente: niente del book dell'agente.
 */
import { totals, lineDisc, lineNet, shareText, validoFino, contraddizioni } from '../core/preventivo.js';
import { euro, percento, esc } from '../core/formato.js';
import { stato, ascolta } from '../stato.js';
import { salva, nuovo } from './nuovo-preventivo.js';
import { passiHTML, piede, toast, apriFoglio, copia, caricaJSON } from '../ui.js';
import { immaginiStampa, ritaglioRiga } from '../figure.js';
import * as N from '../core/noleggio.js';
import { oggiISO } from '../core/date.js';
import { datiNoleggio } from './noleggio.js';
import { riquadroNoleggioHTML } from './pagamento.js';
import { riepilogoHTML } from './riepilogo.js';

/** Opzione noleggio del preventivo (null se i dati non si leggono). */
async function opzioneNoleggio() {
  try {
    const [dati, testi] = await Promise.all([datiNoleggio(), caricaJSON('data/noleggio/testi.json')]);
    const listino = N.listinoAttivo(dati, oggiISO(new Date(), window.__pit && window.__pit.anteprimaData));
    const oggi = oggiISO(new Date(), window.__pit && window.__pit.anteprimaData);
    return { op: N.opzionePreventivo(stato.preventivo, dati, listino), testi, listino, fino: N.validoFinoAl(dati, oggi) };
  } catch (e) { return null; }
}

const q = () => stato.preventivo;
const st = () => stato.impostazioni;

/** HTML della stampa A4 (solo dati per il cliente). */
export function stampaHTML(imgs = {}, nol = null) {
  const p = q(), s = st();
  const t = totals(p, s.vat);
  const conImg = Object.keys(imgs).length > 0;
  const valido = validoFino(p.date, s.validity);
  return `
    <div class="pr">
      <header class="pr-testa">
        <div class="pr-azienda">${esc(s.company || '').replace(/\n/g, '<br>')}</div>
        <div class="pr-meta">
          <h1>Preventivo${p.number ? ' ' + esc(p.number) : ''}</h1>
          <p>Data ${new Date(p.date).toLocaleDateString('it-IT')}<br>Valido fino al ${valido.toLocaleDateString('it-IT')}</p>
        </div>
      </header>
      ${p.customer || p.reference ? `<section class="pr-cliente"><p class="pr-etichetta">Cliente</p><p><b>${esc(p.customer)}</b>${p.reference ? '<br>' + esc(p.reference) : ''}</p></section>` : ''}
      <table class="pr-tabella">
        <thead><tr>${conImg ? '<th class="pr-img"></th>' : ''}<th>Codice</th><th>Descrizione</th><th class="r">Q.tà</th><th class="r">Listino</th><th class="r">Sconto</th><th class="r">Netto</th></tr></thead>
        <tbody>${p.items.map(it => { const d = lineDisc(it, p.globalDisc); return `<tr>${conImg ? `<td class="pr-img">${imgs[it.id] ? `<img src="${imgs[it.id]}" alt="">` : ''}</td>` : ''}<td>${esc(it.code)}</td><td>${esc(it.name)}${it.power ? `<br><small>${esc(it.power)}</small>` : ''}${it.dettaglio ? `<br><small>${esc(it.dettaglio)}</small>` : ''}</td><td class="r">${it.qty}</td><td class="r">${euro(it.price)}</td><td class="r">${d.pct ? percento(d.pct) + '%' : ''}</td><td class="r">${euro(lineNet(it, p.globalDisc))}</td></tr>`; }).join('')}</tbody>
      </table>
      <section class="pr-totali">
        <div><span>Totale di listino</span><span>${euro(t.gross)}</span></div>
        ${t.disc ? `<div><span>Sconto</span><span>− ${euro(t.disc)}</span></div>` : ''}
        <div class="pr-forte"><span>Totale netto${p.vatOn ? ' imponibile' : ' (IVA esclusa)'}</span><span>${euro(t.net)}</span></div>
        ${p.vatOn ? `<div><span>IVA ${esc(s.vat)}%</span><span>${euro(t.vat)}</span></div><div class="pr-forte"><span>Totale IVA inclusa</span><span>${euro(t.total)}</span></div>` : ''}
      </section>
      ${nol && nol.op.visibile ? riquadroNoleggioHTML(nol.op, nol.testi, nol.listino, nol.op.opzioni.benefici, nol.fino) : ''}
      ${p.notes ? `<section class="pr-note">${esc(p.notes).replace(/\n/g, '<br>')}</section>` : ''}
      ${s.seller ? `<footer class="pr-firma">${esc(s.seller).replace(/\n/g, '<br>')}</footer>` : ''}
      <p class="pr-piede">Preventivo in tasca · Alessandro Pezzali</p>
    </div>`;
}

let inStampa = false;
export async function stampa() {
  if (inStampa) return;
  inStampa = true;
  const p = q();
  let imgs = {};
  if (p.showImages !== false && p.items.some(it => ritaglioRiga(it))) { toast('Preparo le immagini…'); imgs = await immaginiStampa(p.items); }
  const area = document.getElementById('area-stampa');
  area.innerHTML = stampaHTML(imgs, await opzioneNoleggio());
  const titolo = document.title;
  document.title = `Preventivo ${p.number ? p.number.replace('/', '-') : ''} ${p.customer || ''}`.trim();
  await Promise.all([...area.querySelectorAll('img')].map(img => (img.decode ? img.decode() : Promise.resolve()).catch(() => {})));
  setTimeout(() => { window.print(); document.title = titolo; inStampa = false; }, 60);
}

export async function testoCondiviso() {
  const nol = await opzioneNoleggio();
  return shareText(q(), st(), nol ? N.testoOpzione(nol.op, nol.testi, nol.listino, nol.fino) : []);
}

export async function condividi() {
  const testo = await testoCondiviso();
  if (navigator.share) {
    try { await navigator.share({ title: 'Preventivo', text: testo }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const p = q();
  const corpo = apriFoglio('Condividi', `
    <label class="campo-etichetta" for="cond-testo">Testo del preventivo</label>
    <textarea id="cond-testo" class="area" rows="12" readonly>${esc(testo)}</textarea>
    <div class="azioni">
      <button type="button" class="btn btn-primario" id="cond-copia">Copia testo</button>
      <a class="btn btn-secondario" href="https://wa.me/?text=${encodeURIComponent(testo)}" target="_blank" rel="noopener">WhatsApp</a>
      <a class="btn btn-secondario" href="mailto:?subject=${encodeURIComponent('Preventivo' + (p.number ? ' ' + p.number : ''))}&body=${encodeURIComponent(testo)}">Email</a>
    </div>`);
  corpo.querySelector('#cond-copia').addEventListener('click', async () => toast(await copia(testo) ? 'Testo copiato' : 'Copia non riuscita'));
}

export { salva, nuovo };

export function mostra(vista, app) {
  function disegna() {
    const p = q();
    const t = totals(p, st().vat);
    vista.innerHTML = `
      ${passiHTML('invia')}
      <div class="percorso"><div class="percorso-principale">
      <h1 class="titolo" tabindex="-1">Invia il preventivo</h1>
      <p class="sottotitolo">${p.number ? `Preventivo ${esc(p.number)}` : 'Nuovo preventivo'}${p.customer ? ` per ${esc(p.customer)}` : ''}, ${new Date(p.date).toLocaleDateString('it-IT')}</p>
      ${p.items.length ? `
        <section class="riquadro sezione" aria-labelledby="inv-riep">
          <h2 id="inv-riep" class="sezione-titolo">Riepilogo</h2>
          <dl class="righe">
            <div class="riga"><dt>Righe</dt><dd>${t.lines}</dd></div>
            <div class="riga"><dt>Totale di listino</dt><dd>${euro(t.gross)}</dd></div>
            ${t.disc ? `<div class="riga"><dt>Sconto (${percento(t.discPct)}%)</dt><dd>− ${euro(t.disc)}</dd></div>` : ''}
            <div class="riga riga-forte"><dt>Totale netto${p.vatOn ? ' imponibile' : ' (IVA esclusa)'}</dt><dd>${euro(t.net)}</dd></div>
            ${p.vatOn ? `<div class="riga riga-forte"><dt>Totale IVA ${esc(st().vat)}% inclusa</dt><dd>${euro(t.total)}</dd></div>` : ''}
          </dl>
          <div class="azioni"><a class="btn btn-secondario" href="#/prodotti/preventivo">Modifica righe, sconti e note</a></div>
        </section>
        ${contraddizioni(p).map(m => `<p class="avviso avviso-errore sezione" role="alert">Da controllare: ${esc(m)} <a class="btn btn-secondario btn-piccolo" href="#/prodotti/preventivo">Correggi le note</a></p>`).join('')}
        <div class="azioni">
          <button type="button" class="btn btn-primario" data-inv="stampa">Stampa o PDF</button>
          <button type="button" class="btn btn-secondario" data-inv="condividi">Condividi</button>
        </div>
        <div class="azioni">
          <button type="button" class="btn btn-secondario" data-inv="salva">${p.id ? 'Salva modifiche' : 'Salva preventivo'}</button>
          <button type="button" class="btn btn-secondario" data-inv="nuovo">Nuovo preventivo</button>
        </div>
        ${!st().company ? '<div class="avviso avviso-info sezione"><p>Suggerimento: inserisci i dati della tua azienda, così compaiono in testa al preventivo stampato.</p><p class="sezione-stretta"><a class="btn btn-secondario" href="#/impostazioni">Apri Impostazioni</a></p></div>' : ''}`
      : `<section class="riquadro vuoto sezione"><h2 class="titolo">Il preventivo è vuoto</h2>
          <p class="sottotitolo">Aggiungi prodotti o voci libere prima di inviarlo.</p>
          <a class="btn btn-primario" href="#/prodotti">Vai ai prodotti</a></section>`}
      <section class="riquadro sezione" aria-labelledby="inv-bcc">
        <h2 id="inv-bcc" class="sezione-titolo">Se il cliente sceglie il noleggio</h2>
        <p class="nota">Moduli BCC per la pratica (domanda, firma digitale, privacy, kit di benvenuto) e documenti da chiedere al cliente.</p>
        <div class="azioni"><a class="btn btn-secondario" href="#/documenti">Apri il kit documenti BCC</a><a class="btn btn-secondario" href="#/pagamento">Documenti per fascia di importo</a></div>
      </section>
      </div>${riepilogoHTML()}</div>
      ${piede(app.versione)}`;
  }
  vista.addEventListener('click', async e => {
    const b = e.target.closest('[data-inv]');
    if (!b) return;
    if (b.dataset.inv === 'stampa') stampa();
    if (b.dataset.inv === 'condividi') condividi();
    if (b.dataset.inv === 'salva') await salva();
    if (b.dataset.inv === 'nuovo') await nuovo();
  });
  vista.closest('.contenuto').classList.add('contenuto-largo');
  disegna();
  return ascolta(disegna); // ridisegna a ogni cambiamento (anche "Annulla"), riepilogo compreso
}
