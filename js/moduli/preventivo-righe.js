/*
 * Righe del preventivo (scheda "Il preventivo" di Prodotti): cliente, sconti in cascata,
 * quantità, voci libere, controlli dell'agente, totali, IVA e note.
 * Porting di Listino in tasca; i calcoli sono in js/core/preventivo.js.
 */
import { parseDisc, lineDisc, lineNet, totals, scontoProprio } from '../core/preventivo.js';
import { euro, percento, esc } from '../core/formato.js';
import { stato, preventivoCambiato } from '../stato.js';
import { nuovoId } from '../catalogo.js';
import { apriFoglio, chiudiFoglio, toast } from '../ui.js';
import { imgMiniatura, ritaglioRiga } from '../figure.js';
import { controlliHTML } from './agente-viste.js';

const SCONTI_RAPIDI = [0, 10, 15, 20, 25, 30, 35, 40];
const q = () => stato.preventivo;
const iva = () => stato.impostazioni.vat;

function lordoTesto(it) {
  const d = lineDisc(it, q().globalDisc);
  return `${euro(it.price)} × ${it.qty}${d.pct ? `, sconto ${percento(d.pct)}%${scontoProprio(it) ? '' : ' (generale)'}` : ''}`;
}

function rigaHTML(it) {
  const d = lineDisc(it, q().globalDisc);
  const gd = parseDisc(q().globalDisc);
  const c = ritaglioRiga(it);
  const nome = it.code || it.name;
  return `
    <li class="riga-prev" data-id="${esc(it.id)}">
      <div class="rp-testa">
        <span class="codice">${esc(it.code || 'Voce libera')}</span>
        <button type="button" class="togli" data-riga="togli" data-id="${esc(it.id)}" aria-label="Togli ${esc(nome)} dal preventivo">✕</button>
      </div>
      <div class="rp-corpo">
        ${c ? `<button type="button" class="miniatura rp-miniatura" data-azione="scheda" data-key="${esc(it.key)}" aria-label="Vedi la figura di ${esc(it.code)}">${imgMiniatura(c, 84)}</button>` : ''}
        <p class="rp-nome">${esc(it.name)}${it.power ? ` <span class="nota">${esc(it.power)}</span>` : ''}</p>
      </div>
      <div class="rp-comandi">
        <div class="campo"><span class="campo-etichetta" id="qta-${esc(it.id)}">Quantità</span>
          <div class="regolatore" role="group" aria-labelledby="qta-${esc(it.id)}">
            <button type="button" data-riga="qta" data-id="${esc(it.id)}" data-d="-1" aria-label="Uno in meno">−</button>
            <input data-riga-campo="qty" data-id="${esc(it.id)}" inputmode="numeric" value="${it.qty}" aria-labelledby="qta-${esc(it.id)}">
            <button type="button" data-riga="qta" data-id="${esc(it.id)}" data-d="1" aria-label="Uno in più">+</button>
          </div></div>
        ${it.custom ? `<div class="campo"><label class="campo-etichetta" for="pr-${esc(it.id)}">Prezzo €</label>
          <input id="pr-${esc(it.id)}" class="input" data-riga-campo="price" data-id="${esc(it.id)}" inputmode="decimal" value="${it.price ? String(it.price).replace('.', ',') : ''}" placeholder="0,00" ${it.manual && !(it.price > 0) ? 'aria-invalid="true"' : ''}></div>` : ''}
        <div class="campo"><label class="campo-etichetta" for="sc-${esc(it.id)}">Sconto riga %</label>
          <input id="sc-${esc(it.id)}" class="input" data-riga-campo="disc" data-id="${esc(it.id)}" inputmode="decimal" value="${esc(it.disc)}" placeholder="${gd.valid ? percento(gd.pct) : '0'}" ${d.valid ? '' : 'aria-invalid="true"'}></div>
      </div>
      <div class="rp-importi">
        <span class="nota" data-uscita="lordo-${esc(it.id)}">${lordoTesto(it)}</span>
        <span class="rp-netto" data-uscita="netto-${esc(it.id)}">${euro(lineNet(it, q().globalDisc))}</span>
      </div>
    </li>`;
}

function totaliHTML(t) {
  return `
    <dl class="righe">
      <div class="riga"><dt>Totale di listino</dt><dd>${euro(t.gross)}</dd></div>
      <div class="riga"><dt>Sconto${t.discPct ? ` (${percento(t.discPct)}%)` : ''}</dt><dd>${t.disc ? '− ' + euro(t.disc) : euro(0)}</dd></div>
      <div class="riga riga-forte"><dt>Totale netto${q().vatOn ? ' imponibile' : ''}</dt><dd>${euro(t.net)}</dd></div>
      ${q().vatOn ? `<div class="riga"><dt>IVA ${esc(iva())}%</dt><dd>${euro(t.vat)}</dd></div>
        <div class="riga riga-forte"><dt>Totale IVA inclusa</dt><dd>${euro(t.total)}</dd></div>` : ''}
    </dl>
    ${q().vatOn ? '' : '<p class="nota">IVA esclusa</p>'}`;
}

export function righeHTML() {
  const p = q();
  const t = totals(p, iva());
  const gd = parseDisc(p.globalDisc);
  return `
    <section class="riquadro sezione" aria-labelledby="rp-cliente">
      <h2 id="rp-cliente" class="sezione-titolo">${p.number ? `Preventivo ${esc(p.number)}` : 'Nuovo preventivo'} <span class="nota">${new Date(p.date).toLocaleDateString('it-IT')}</span></h2>
      <div class="due">
        <div class="campo"><label class="campo-etichetta" for="rp-c">Cliente</label><input id="rp-c" class="input" data-prev="customer" value="${esc(p.customer)}" placeholder="Ragione sociale o nome" autocomplete="organization"></div>
        <div class="campo"><label class="campo-etichetta" for="rp-r">Riferimento</label><input id="rp-r" class="input" data-prev="reference" value="${esc(p.reference)}" placeholder="Es. officina di Mario, richiesta del 7/10"></div>
      </div>
    </section>
    ${p.items.length ? `
      <section class="riquadro sezione" aria-labelledby="rp-sconto">
        <div class="campo"><label class="campo-etichetta" id="rp-sconto" for="rp-sg">Sconto generale %</label>
          <input id="rp-sg" class="input" data-prev="globalDisc" inputmode="decimal" value="${esc(p.globalDisc)}" placeholder="0" ${gd.valid ? '' : 'aria-invalid="true"'} aria-describedby="rp-sg-aiuto"></div>
        <div class="chips sezione-stretta" role="group" aria-label="Sconti rapidi">${SCONTI_RAPIDI.map(v => { const on = String(p.globalDisc) === String(v) || (!p.globalDisc && v === 0); return `<button type="button" class="scelta-chip ${on ? 'on' : ''}" aria-pressed="${on}" data-riga="sconto-rapido" data-v="${v}">${v}%</button>`; }).join('')}</div>
        <p class="nota" id="rp-sg-aiuto">Per gli sconti in cascata scrivi per esempio 30+5. Ogni riga può avere uno sconto diverso.</p>
      </section>
      <ul class="righe-prev">${p.items.map(rigaHTML).join('')}</ul>` : `
      <section class="riquadro vuoto sezione">
        <h2 class="titolo">Il preventivo è vuoto</h2>
        <p class="sottotitolo">Scegli le macchine con il configuratore o cercale per codice.</p>
        <div class="azioni"><a class="btn btn-primario" href="#/prodotti">Configura</a><a class="btn btn-secondario" href="#/prodotti/cerca">Cerca per codice</a></div>
      </section>`}
    <button type="button" class="btn btn-secondario btn-largo sezione" data-riga="voce">Aggiungi voce libera</button>
    ${p.items.length ? `<div id="rp-controlli">${controlliHTML()}</div>
      <section class="riquadro sezione" aria-labelledby="rp-tot"><h2 id="rp-tot" class="sr">Totali</h2><div id="rp-totali" aria-live="polite">${totaliHTML(t)}</div>
        <label class="interruttore sezione"><input type="checkbox" data-riga-opz="vatOn" ${p.vatOn ? 'checked' : ''}><span class="int-ui" aria-hidden="true"></span><span class="int-testo"><strong>Mostra IVA ${esc(iva())}% e totale ivato</strong></span></label>
        <label class="interruttore"><input type="checkbox" data-riga-opz="showImages" ${p.showImages !== false ? 'checked' : ''}><span class="int-ui" aria-hidden="true"></span><span class="int-testo"><strong>Immagini nel preventivo stampato</strong></span></label>
        <div class="campo"><label class="campo-etichetta" for="rp-note">Note per il cliente</label><textarea id="rp-note" class="area" data-prev="notes" rows="3">${esc(p.notes)}</textarea></div>
      </section>` : ''}`;
}

/** Aggiorna importi e stati senza ridisegnare (così chi scrive non perde il punto). */
function aggiornaNumeri(vista) {
  const p = q();
  for (const it of p.items) {
    const d = lineDisc(it, p.globalDisc);
    const l = vista.querySelector(`[data-uscita="lordo-${CSS.escape(it.id)}"]`);
    const n = vista.querySelector(`[data-uscita="netto-${CSS.escape(it.id)}"]`);
    if (l) l.textContent = lordoTesto(it);
    if (n) n.textContent = euro(lineNet(it, p.globalDisc));
    const inp = vista.querySelector(`input[data-riga-campo="disc"][data-id="${CSS.escape(it.id)}"]`);
    if (inp) {
      const gd = parseDisc(p.globalDisc);
      inp.placeholder = gd.valid ? percento(gd.pct) : '0';
      if (d.valid) inp.removeAttribute('aria-invalid'); else inp.setAttribute('aria-invalid', 'true');
    }
  }
  const tot = vista.querySelector('#rp-totali');
  if (tot) tot.innerHTML = totaliHTML(totals(p, iva()));
  const ck = vista.querySelector('#rp-controlli');
  if (ck) ck.innerHTML = controlliHTML();
  const sg = vista.querySelector('#rp-sg');
  if (sg) { if (parseDisc(p.globalDisc).valid) sg.removeAttribute('aria-invalid'); else sg.setAttribute('aria-invalid', 'true'); }
  vista.querySelectorAll('[data-riga="sconto-rapido"]').forEach(b => {
    const on = String(p.globalDisc) === b.dataset.v || (!p.globalDisc && b.dataset.v === '0');
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
  });
}

/** Finestra "Voce libera" (trasporto, installazione, formazione, fuori listino). */
export function voceLiberaFoglio(precompila, dopo) {
  const corpo = apriFoglio('Voce libera', `
    <p class="sottotitolo">Per trasporto, installazione, formazione o articoli fuori listino.</p>
    <div class="campo"><label class="campo-etichetta" for="vl-nome">Descrizione</label><input id="vl-nome" class="input" placeholder="Es. Trasporto e installazione" value="${esc(precompila || '')}"></div>
    <div class="campo"><label class="campo-etichetta" for="vl-codice">Codice (facoltativo)</label><input id="vl-codice" class="input"></div>
    <div class="due">
      <div class="campo"><label class="campo-etichetta" for="vl-prezzo">Prezzo di listino €</label><input id="vl-prezzo" class="input" inputmode="decimal" placeholder="0,00"></div>
      <div class="campo"><label class="campo-etichetta" for="vl-qta">Quantità</label><input id="vl-qta" class="input" inputmode="numeric" value="1"></div>
    </div>
    <p class="campo-errore" id="vl-errore" role="alert"></p>
    <button type="button" class="btn btn-primario btn-largo sezione" id="vl-salva">Aggiungi al preventivo</button>`);
  setTimeout(() => corpo.querySelector(precompila ? '#vl-prezzo' : '#vl-nome').focus(), 50);
  corpo.querySelector('#vl-salva').addEventListener('click', () => {
    const name = corpo.querySelector('#vl-nome').value.trim();
    const grezzo = corpo.querySelector('#vl-prezzo').value;
    const price = Number(String(grezzo).replace(/\./g, '').replace(',', '.'));
    const qty = Math.max(1, parseInt(corpo.querySelector('#vl-qta').value, 10) || 1);
    const err = corpo.querySelector('#vl-errore');
    if (!name) { err.textContent = 'Scrivi una descrizione'; return; }
    if (!isFinite(price) || price < 0) { err.textContent = 'Prezzo non valido'; return; }
    q().items.push({ id: nuovoId(), key: null, custom: true, code: corpo.querySelector('#vl-codice').value.trim(), name, power: '', price, qty, disc: '0' });
    preventivoCambiato();
    chiudiFoglio();
    toast(`Aggiunto: ${name}`);
    dopo();
  });
}

/** Collega gli eventi delle righe (una volta per schermata). `ridisegna` ridisegna tutto. */
export function collegaRighe(vista, ridisegna) {
  vista.addEventListener('input', e => {
    const el = e.target;
    const p = q();
    if (el.dataset.prev) {
      p[el.dataset.prev] = el.value;
      preventivoCambiato({ scriveNote: el.dataset.prev === 'notes' });
      if (el.dataset.prev === 'globalDisc') aggiornaNumeri(vista);
      return;
    }
    if (el.dataset.rigaCampo) {
      const it = p.items.find(i => i.id === el.dataset.id);
      if (!it) return;
      if (el.dataset.rigaCampo === 'disc') it.disc = el.value;
      if (el.dataset.rigaCampo === 'qty') { const v = parseInt(el.value, 10); if (v > 0) it.qty = v; }
      if (el.dataset.rigaCampo === 'price') {
        const v = Number(String(el.value).replace(/\./g, '').replace(',', '.'));
        it.price = isFinite(v) && v >= 0 ? v : 0;
        if (it.manual && !(it.price > 0)) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
      }
      preventivoCambiato();
      aggiornaNumeri(vista);
    }
  });
  vista.addEventListener('change', e => {
    const el = e.target;
    const p = q();
    if (el.dataset.rigaCampo === 'qty') {
      const it = p.items.find(i => i.id === el.dataset.id);
      if (it) { it.qty = Math.max(1, parseInt(el.value, 10) || 1); el.value = it.qty; preventivoCambiato(); aggiornaNumeri(vista); }
    }
    if (el.dataset.rigaOpz === 'vatOn') { p.vatOn = el.checked; preventivoCambiato(); aggiornaNumeri(vista); }
    if (el.dataset.rigaOpz === 'showImages') { p.showImages = el.checked; preventivoCambiato(); }
  });
  vista.addEventListener('click', e => {
    const el = e.target.closest('[data-riga]');
    if (!el) return;
    const p = q();
    const d = el.dataset;
    if (d.riga === 'sconto-rapido') {
      p.globalDisc = d.v === '0' ? '' : d.v;
      const gi = vista.querySelector('#rp-sg'); if (gi) gi.value = p.globalDisc;
      preventivoCambiato(); aggiornaNumeri(vista);
    }
    if (d.riga === 'qta') {
      const it = p.items.find(i => i.id === d.id);
      if (!it) return;
      it.qty = Math.max(1, it.qty + Number(d.d));
      const inp = vista.querySelector(`input[data-riga-campo="qty"][data-id="${CSS.escape(it.id)}"]`);
      if (inp) inp.value = it.qty;
      preventivoCambiato(); aggiornaNumeri(vista);
    }
    if (d.riga === 'togli') {
      const i = p.items.findIndex(x => x.id === d.id);
      if (i < 0) return;
      const [tolta] = p.items.splice(i, 1);
      preventivoCambiato(); ridisegna();
      toast(`Tolto: ${tolta.code || tolta.name}`, { azione: 'Annulla', quandoAzione: () => { p.items.splice(Math.min(i, p.items.length), 0, tolta); preventivoCambiato(); ridisegna(); } });
    }
    if (d.riga === 'voce') voceLiberaFoglio('', ridisegna);
  });
}

