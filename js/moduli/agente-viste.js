/*
 * Viste del book dell'agente (contenuto cifrato, sbloccato dal listino).
 * RISERVATO: niente di questo file finisce in stampa o nel testo condiviso con il cliente.
 * Le finestre usano apriFoglio; la stampa del preventivo non le include mai.
 */
import * as A from '../core/agente.js';
import { setLineNet, contraddizioni } from '../core/preventivo.js';
import { euro, esc } from '../core/formato.js';
import { listino, aggiungiArticolo, nuovoId } from '../catalogo.js';
import { stato, preventivoCambiato } from '../stato.js';
import { apriFoglio, chiudiFoglio, foglioCorpo, toast } from '../ui.js';
import { imgMiniatura, ritaglioArticolo, idrataMiniature } from '../figure.js';

const W = window;
const ETICHETTA = '<p class="solo-agente-tag">Solo per te, non va nel preventivo</p>';

export function vehChips(tags) {
  if (!tags || !tags.length) return '';
  return `<p class="veicoli"><span class="muted">Lavora su</span> ${tags.map(t => {
    const opt = /^\(.*\)$/.test(t);
    const k = t.replace(/[()]/g, '');
    return `<span class="veicolo ${opt ? 'veicolo-opz' : ''}" title="${opt ? 'solo con l\'accessorio dedicato' : ''}">${esc(A.VEH_LABEL[k] || k)}${opt ? '*' : ''}</span>`;
  }).join('')}</p>${tags.some(t => /^\(/.test(t)) ? '<p class="nota">* solo con l\'accessorio dedicato</p>' : ''}`;
}

const etichettaTotale = post => {
  const t = A.postTotal(listino.pack, listino.catalog, post);
  return `${euro(t.sum)} di listino${t.missing ? `, più ${t.missing} ${t.missing === 1 ? 'voce' : 'voci'} senza prezzo` : ''}`;
};
const bottonePostazione = (p, power = '') => `
  <button type="button" class="postazione" data-agente="postazione" data-id="${esc(p.id)}" data-power="${esc(power)}">
    <span class="post-fascia">${esc(p.fascia)}</span>
    <span class="post-titolo">${esc(p.title)}</span>
    <span class="post-sotto">${esc(p.subtitle)}</span>
    <span class="post-prezzo">${etichettaTotale(p)}</span>
  </button>`;

/** Blocco "Postazioni pronte" nel configuratore, dopo la scelta del veicolo. */
export function postazioniHTML(vehicle) {
  const pack = listino.pack;
  const list = A.postazioniPer(pack, vehicle);
  if (!list.length) return '';
  const wiz = pack.wizard && pack.wizard[vehicle];
  return `
    <section class="blocco-agente sezione" aria-labelledby="ag-post">
      <div class="blocco-testa"><h2 id="ag-post" class="sezione-titolo">Postazioni pronte</h2>
        <button type="button" class="link" data-agente="guida">Guida agente</button></div>
      <p class="nota">Dal book dell'agente: si vende la postazione, non il pezzo.</p>
      ${wiz ? `<button type="button" class="btn btn-primario btn-largo sezione" data-agente="consiglio">${esc(wiz.title)}</button>` : ''}
      <ul class="elenco-postazioni">${list.map(p => `<li>${bottonePostazione(p)}</li>`).join('')}</ul>
    </section>`;
}

/* ---------- Postazione ---------- */
let postStato = null;
function apriPostazione(id, preset) {
  const pack = listino.pack;
  const post = pack.postazioni.find(p => p.id === id);
  if (!post) return;
  if (!postStato || postStato.id !== id || preset) postStato = { id, power: (preset && preset.power) || A.alimentazioneIniziale(post), optional: {} };
  disegnaPostazione();
}
function disegnaPostazione() {
  const pack = listino.pack;
  const post = pack.postazioni.find(p => p.id === postStato.id);
  const rows = A.postItems(pack, listino.catalog, post, postStato);
  const t = A.postTotal(pack, listino.catalog, post, postStato);
  const TL = pack.transport.labels;
  const trasporto = TL[post.transport] || TL.quote;
  const riga = r => {
    const crop = r.product ? ritaglioArticolo(r.product) : null;
    return `
      <li class="post-riga ${!r.required && !r.on ? 'spenta' : ''}">
        ${r.required ? '<span class="spunta fissa" aria-hidden="true"></span>'
          : `<button type="button" class="spunta ${r.on ? 'on' : ''}" data-agente="post-opz" data-code="${esc(r.code)}" aria-pressed="${r.on}" aria-label="Includi ${esc(r.label)}"></button>`}
        <span class="miniatura">${crop ? imgMiniatura(crop, 64) : ''}</span>
        <span class="post-testo"><span class="codice">${esc(r.code)}</span><span>${esc(r.label)}</span>${r.manual ? `<span class="avviso-riga">${esc(r.manual.note)}</span>` : ''}</span>
        <span class="prezzo">${r.price != null ? euro(r.price) : '—'}</span>
      </li>`;
  };
  const scroll = foglioCorpo() ? foglioCorpo().parentElement.scrollTop : 0;
  const corpo = apriFoglio(post.title, `
    <p class="nota">Postazione · ${esc(post.fascia)}${post.subtitle ? ' · ' + esc(post.subtitle) : ''}</p>
    ${post.power === 'choose' || post.items.some(i => i.alt) ? `
      <fieldset class="gruppo"><legend>Alimentazione</legend><div class="segmenti">
        <label class="seg-voce"><input type="radio" name="ag-power" value="tri" ${postStato.power === 'tri' ? 'checked' : ''}><span>Trifase 400V</span></label>
        <label class="seg-voce"><input type="radio" name="ag-power" value="mono" ${postStato.power === 'mono' ? 'checked' : ''}><span>Monofase 230V</span></label>
      </div></fieldset>` : ''}
    <h3 class="sezione-titolo sezione">Nella postazione</h3>
    <ul class="post-righe">${rows.filter(r => r.required).map(riga).join('')}</ul>
    ${rows.some(r => !r.required) ? `<h3 class="sezione-titolo sezione">Da proporre insieme</h3><ul class="post-righe">${rows.filter(r => !r.required).map(riga).join('')}</ul>` : ''}
    <dl class="riga sezione"><dt>Totale di listino${t.missing ? `<br><span class="nota">più ${t.missing} ${t.missing === 1 ? 'voce' : 'voci'} senza prezzo nel listino</span>` : ''}</dt><dd class="grande-medio">${euro(t.sum)}</dd></dl>
    <p class="avviso ${post.transport === 'quote' ? '' : 'avviso-ok'}">${esc(trasporto)}. ${esc(TL.install)}</p>
    ${post.netNote ? `<p class="avviso avviso-ok" style="margin-top:8px">${esc(post.netNote)}</p>` : ''}
    <button type="button" class="btn btn-primario btn-largo sezione" data-agente="post-aggiungi">Aggiungi la postazione al preventivo</button>
    <div class="note-agente sezione">
      ${ETICHETTA}
      <p><b>Quando:</b> ${esc(post.when)}</p>
      <p><b>Da dire:</b> ${esc(post.say)}</p>
      <p><b>Attenzione:</b> ${esc(post.watch)}</p>
    </div>`);
  corpo.parentElement.scrollTop = scroll;
  idrataMiniature(corpo);
}
async function aggiungiPostazione(app) {
  const pack = listino.pack;
  const post = pack.postazioni.find(p => p.id === postStato.id);
  const righe = A.righePostazione(pack, listino.catalog, post, postStato, nuovoId);
  for (const r of righe) { if (r.product) aggiungiArticolo(r.product); else stato.preventivo.items.push(r.item); }
  if (post.applyPricing) A.applyPackPricing(pack, stato.preventivo, nuovoId);
  preventivoCambiato();
  await chiudiFoglio();
  toast(`Postazione aggiunta: ${righe.length} ${righe.length === 1 ? 'riga' : 'righe'}`);
  app.vai('prodotti/preventivo');
}

/* ---------- Consiglio a domande ---------- */
let risposte = {};
function apriConsiglio(vehicle) {
  const pack = listino.pack;
  const wiz = pack.wizard[vehicle || 'auto'];
  const res = A.wizardResult(pack, risposte);
  const qs = wiz.questions.filter(q => q.showIf !== 'alta' || (res && res.alta));
  const baseMono = res && res.ids[0] === 'auto-base' && risposte.corrente === 'mono';
  const scroll = foglioCorpo() ? foglioCorpo().parentElement.scrollTop : 0;
  const corpo = apriFoglio(wiz.title, `
    <p class="nota">Book dell'agente. Chiedi in quest'ordine: puoi saltare quelle che non servono.</p>
    ${qs.map((q, i) => `
      <fieldset class="gruppo"><legend>${i + 1}. ${esc(q.q)}</legend>
        ${q.hint ? `<p class="nota">${esc(q.hint)}</p>` : ''}
        <div class="segmenti">${q.options.map(o => `<button type="button" class="scelta-chip ${risposte[q.id] === o.v ? 'on' : ''}" aria-pressed="${risposte[q.id] === o.v}" data-agente="risposta" data-q="${esc(q.id)}" data-v="${esc(o.v)}">${esc(o.label)}</button>`).join('')}</div>
      </fieldset>`).join('')}
    <p class="nota sezione">${esc(wiz.fifth)}</p>
    ${res ? `<section class="sezione" aria-live="polite">
        <p class="avviso avviso-info">${esc(res.why)}</p>
        ${baseMono ? `<p class="avviso" style="margin-top:8px">${esc(wiz.results.baseMono)}</p>` : ''}
        <ul class="elenco-postazioni">${res.ids.map(id => { const p = pack.postazioni.find(x => x.id === id); return p ? `<li>${bottonePostazione(p, risposte.corrente || 'tri')}</li>` : ''; }).join('')}</ul>
      </section>` : '<p class="nota sezione">Rispondi alle domande: la postazione consigliata compare qui.</p>'}
    ${Object.keys(risposte).length ? '<button type="button" class="link" data-agente="ricomincia">Ricomincia</button>' : ''}`);
  corpo.parentElement.scrollTop = scroll;
}

/* ---------- Disegni riservati ---------- */
const kb = n => n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.round(n / 1024) + ' KB';
const fileCache = new Map();
function byteDisegno(id) {
  if (fileCache.has(id)) return fileCache.get(id);
  const p = W.Agente.decryptFile(listino.catalog, id);
  fileCache.set(id, p);
  p.catch(() => fileCache.delete(id));
  return p;
}
export const svuotaDisegni = () => fileCache.clear();
const metaDisegno = id => listino.pack.disegni.find(d => d.id === id);
export function disegniHTML(list) {
  return `<ul class="documenti">${list.map(d => `
    <li class="documento">
      <span class="doc-icona" aria-hidden="true">📐</span>
      <span class="doc-titolo">${esc(d.title)}</span>
      <span class="doc-nota">${esc(d.model)} · ${kb(d.size)}</span>
      <span class="doc-azioni">
        <button type="button" class="btn btn-secondario" data-agente="disegno" data-id="${esc(d.id)}">Apri</button>
        <button type="button" class="btn btn-secondario" data-agente="disegno-invia" data-id="${esc(d.id)}">${navigator.share ? 'Invia' : 'Scarica'}</button>
      </span>
    </li>`).join('')}</ul>`;
}
let disegnoStato = null;
async function apriDisegno(id) {
  const d = metaDisegno(id);
  if (!d) return;
  apriFoglio(d.title, `
    <p class="nota">Disegno riservato · ${esc(d.model)}</p>
    <div class="figura"><div class="figura-scorri" id="dw-vista"><p class="nota" style="padding:12px">Apro il disegno…</p></div></div>
    <div class="azioni">
      <button type="button" class="btn btn-secondario" data-agente="disegno-zoom">Ingrandisci</button>
      <button type="button" class="btn btn-secondario" data-agente="disegno-scarica" data-id="${esc(d.id)}">Scarica</button>
      ${navigator.share ? `<button type="button" class="btn btn-primario" data-agente="disegno-invia" data-id="${esc(d.id)}">Invia</button>` : ''}
    </div>
    <p class="nota sezione">Si apre solo con il listino caricato. Inviandolo, il cliente riceve il PDF del disegno.</p>`);
  disegnoStato = { id, zoom: 1 };
  disegnaDisegno();
}
async function disegnaDisegno() {
  const box = document.getElementById('dw-vista');
  if (!box || !disegnoStato) return;
  try {
    const bytes = await byteDisegno(disegnoStato.id);
    const doc = await W.pdfjsLib.getDocument({ data: bytes.slice(0), isEvalSupported: false, verbosity: 0 }).promise;
    const w = (box.clientWidth || 340) * disegnoStato.zoom;
    box.innerHTML = '';
    const inner = document.createElement('div');
    inner.style.width = (disegnoStato.zoom * 100) + '%';
    box.appendChild(inner);
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const vp = page.getViewport({ scale: (w * dpr) / base.width });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      c.style.width = '100%'; c.style.display = 'block'; c.style.background = '#fff';
      inner.appendChild(c);
      const ctx = c.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
    }
    doc.destroy();
  } catch (e) {
    box.innerHTML = `<p class="avviso avviso-errore" style="margin:12px">${esc(e.message || 'Disegno non disponibile')}</p>`;
  }
}
async function fileDisegno(id) {
  const d = metaDisegno(id);
  return new File([await byteDisegno(id)], d.name, { type: 'application/pdf' });
}
async function scaricaDisegno(id) {
  try {
    const f = await fileDisegno(id);
    const url = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast('Disegno scaricato');
  } catch (e) { toast(e.message || 'Disegno non disponibile'); }
}
async function inviaDisegno(id) {
  try {
    const f = await fileDisegno(id);
    if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: metaDisegno(id).title });
    else scaricaDisegno(id);
  } catch (e) { if (e && e.name !== 'AbortError') toast(e.message || 'Invio non riuscito'); }
}

/* ---------- Guida agente ---------- */
export function apriGuida(sez) {
  const g = listino.pack.guide;
  apriFoglio('Guida agente', `
    <p class="nota">Book dell'agente. Uso interno: non va mostrata né stampata per il cliente.</p>
    <details class="apri" ${!sez ? 'open' : ''}><summary>Domande da fare</summary><ol class="elenco">${g.domande.map(d => `<li><b>${esc(d.q)}</b><br>${esc(d.a)}</li>`).join('')}</ol></details>
    <details class="apri"><summary>Regole</summary><ul class="elenco">${g.regole.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>
    <details class="apri"><summary>Argomenti verificabili</summary><ul class="elenco">${g.leve.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>
    <details class="apri"><summary>Obiezioni</summary><ul class="elenco">${g.obiezioni.map(d => `<li><b>${esc(d.q)}</b><br>${esc(d.a)}</li>`).join('')}</ul></details>
    <details class="apri" id="g-checklist" ${sez === 'checklist' ? 'open' : ''}><summary>Checklist prima di firmare</summary>
      <ul class="elenco elenco-spunte">${g.checklist.map((t, i) => `<li><label class="spunta-riga"><input type="checkbox" id="gc${i}"> <span>${esc(t)}</span></label></li>`).join('')}</ul></details>
    ${listino.pack.disegni && listino.pack.disegni.length ? `<details class="apri" id="g-disegni" ${sez === 'disegni' ? 'open' : ''}><summary>Disegni incasso (${listino.pack.disegni.length})</summary>${disegniHTML(listino.pack.disegni)}</details>` : ''}
    <p class="nota sezione">${esc(g.contatti)}</p>
    <p class="nota">Fonte: ${esc(listino.pack.source)}.</p>`);
  if (sez) setTimeout(() => { const d = document.getElementById('g-' + sez); if (d) d.scrollIntoView({ block: 'start' }); }, 60);
}

/* ---------- Note nella scheda prodotto ---------- */
export function noteFamigliaHTML(items) {
  const n = A.noteFamiglia(listino.pack, items);
  if (!n) return '';
  return `
    ${n.dws.length ? `<h3 class="sezione-titolo sezione">Disegni per l'incasso</h3>${disegniHTML(n.dws)}` : ''}
    <div class="note-agente sezione">
      <p class="solo-agente-tag">Per l'agente, non va nel preventivo</p>
      ${vehChips(n.tags)}
      ${n.notes.map(x => `
        ${n.notes.length > 1 ? `<p class="note-titolo">${esc(x.title)}</p>` : ''}
        ${x.fa ? `<p><b>Cosa fa:</b> ${esc(x.fa)}</p>` : ''}
        ${x.nonFa ? `<p><b>Cosa non fa, dillo tu:</b> ${esc(x.nonFa)}</p>` : ''}
        ${x.aChi ? `<p><b>A chi:</b> ${esc(x.aChi)}</p>` : ''}
        ${x.frase ? `<p class="citazione">${esc(x.frase)}</p>` : ''}`).join('')}
      ${n.infos.map(r => `<p class="avviso avviso-info">${esc(r.msg)}</p>`).join('')}
    </div>`;
}

/* ---------- Controlli prima di inviare ---------- */
export function controlliHTML() {
  const base = contraddizioni(stato.preventivo).map(msg => ({ kind: 'must', msg }));
  const libro = listino.pack ? A.quoteChecks({ pack: listino.pack, cat: listino.catalog, byKey: listino.byKey, quote: stato.preventivo, fmt: euro }) : [];
  const list = A.ordinaControlli([...base, ...libro]);
  if (!list.length) return '';
  const notes = stato.preventivo.notes || '';
  const b = (azione, testo, attr = '') => `<button type="button" class="btn btn-secondario btn-piccolo" data-agente="${azione}" ${attr}>${esc(testo)}</button>`;
  return `
    <section class="controlli sezione" aria-labelledby="ck-titolo">
      <div class="blocco-testa"><h2 id="ck-titolo" class="sezione-titolo">Controlli prima di inviare</h2>
        ${listino.pack ? '<button type="button" class="link" data-agente="guida" data-sez="checklist">Checklist</button>' : ''}</div>
      ${ETICHETTA}
      <ul class="elenco-controlli">${list.map(c => `
        <li class="controllo controllo-${c.kind}">
          <p>${esc(c.msg)}</p>
          <div class="azioni-controllo">
            ${c.removeNote ? b('nota-togli', 'Togli dalle note', `data-nota="${esc(c.removeNote)}"`) : ''}
            ${(c.drawings || []).map(d => b('disegno', 'Apri ' + d.model, `data-id="${esc(d.id)}"`)).join('')}
            ${c.addTransport ? b('trasporto', c.addTransport.text, `data-nome="${esc(c.addTransport.label)}" data-prezzo="${c.addTransport.price}"`) : ''}
            ${c.packNet ? b('netto-pacchetto', c.packNet.label, `data-codes="${esc(c.packNet.codes)}" data-netto="${c.packNet.net}"`) : ''}
            ${c.setNet ? b('netto', c.setNet.label, `data-id="${esc(c.setNet.id)}" data-netto="${c.setNet.net}"`) : ''}
            ${(c.add || []).map(code => { const p = A.byCode(listino.catalog, code); return b('aggiungi', `Aggiungi ${code} · ${euro(p.price)}`, `data-key="${esc(p.key)}"`); }).join('')}
            ${c.custom ? b('voce', 'Aggiungi voce ' + c.custom.toLowerCase(), `data-nome="${esc(c.custom)}"`) : ''}
            ${c.note && !notes.includes(c.note) ? b('nota-aggiungi', 'Scrivilo nelle note', `data-nota="${esc(c.note)}"`) : ''}
          </div>
        </li>`).join('')}</ul>
    </section>`;
}

/**
 * Gestisce i clic sui pulsanti del book (data-agente). `ridisegna` aggiorna la schermata,
 * `voceLibera(nome)` apre la finestra della voce libera.
 */
export function gestisciClic(e, { app, vehicle, ridisegna, voceLibera }) {
  const el = e.target.closest('[data-agente]');
  if (!el) return false;
  const q = stato.preventivo;
  const d = el.dataset;
  switch (d.agente) {
    case 'guida': apriGuida(d.sez); break;
    case 'consiglio': apriConsiglio(vehicle); break;
    case 'risposta': if (risposte[d.q] === d.v) delete risposte[d.q]; else risposte[d.q] = d.v; apriConsiglio(vehicle); break;
    case 'ricomincia': risposte = {}; apriConsiglio(vehicle); break;
    case 'postazione': apriPostazione(d.id, d.power ? { power: d.power } : null); break;
    case 'post-opz': postStato.optional[d.code] = !postStato.optional[d.code]; disegnaPostazione(); break;
    case 'post-aggiungi': aggiungiPostazione(app); break;
    case 'disegno': apriDisegno(d.id); break;
    case 'disegno-scarica': scaricaDisegno(d.id); break;
    case 'disegno-invia': inviaDisegno(d.id); break;
    case 'disegno-zoom': if (disegnoStato) { disegnoStato.zoom = disegnoStato.zoom === 1 ? 2.5 : 1; el.textContent = disegnoStato.zoom === 1 ? 'Ingrandisci' : 'Riduci'; disegnaDisegno(); } break;
    case 'netto': {
      const it = q.items.find(i => i.id === d.id);
      const target = Number(d.netto);
      if (!it || !(target > 0)) break;
      setLineNet(it, target); // sconto di riga che porta il netto unitario al valore concordato
      preventivoCambiato(); ridisegna(); toast(`Netto impostato: ${euro(target)}`);
      break;
    }
    case 'netto-pacchetto':
      if (A.nettoPacchetto(q, d.codes.split(','), Number(d.netto))) { preventivoCambiato(); ridisegna(); toast(`Netto pacchetto: ${euro(Number(d.netto))}`); }
      break;
    case 'trasporto': A.addTransportLine(q, d.nome, Number(d.prezzo), nuovoId); preventivoCambiato(); ridisegna(); toast(`Aggiunto: ${d.nome}`); break;
    case 'nota-togli': q.notes = A.togliNota(q.notes, d.nota); preventivoCambiato(); ridisegna(); toast('Tolto dalle note'); break;
    case 'nota-aggiungi': q.notes = A.aggiungiNota(q.notes, d.nota); preventivoCambiato(); ridisegna(); toast('Aggiunto alle note per il cliente'); break;
    case 'aggiungi': { const p = listino.byKey.get(d.key); if (p) { aggiungiArticolo(p); ridisegna(); toast(`Aggiunto: ${p.code}`); } break; }
    case 'voce': voceLibera(d.nome); break;
    default: return false;
  }
  return true;
}
// Le spunte dell'alimentazione nella postazione sono radio: si gestiscono con "change"
document.addEventListener('change', e => {
  if (e.target.name === 'ag-power' && postStato) { postStato.power = e.target.value; disegnaPostazione(); }
});
