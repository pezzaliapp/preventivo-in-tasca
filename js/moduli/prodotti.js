/*
 * Prodotti (passo 1 del preventivo): configuratore, ricerca e righe del preventivo.
 * Porting di Listino in tasca; la logica è in js/core/listino.js e js/core/agente.js.
 *   #/prodotti            configuratore
 *   #/prodotti/cerca      ricerca e sezioni del listino
 *   #/prodotti/preventivo righe, sconti, totali, note
 */
import * as L from '../core/listino.js';
import { euro, esc } from '../core/formato.js';
import { listino, ascoltaListino, caricaFile, aggiungiArticolo, nelPreventivo } from '../catalogo.js';
import { stato, ascolta } from '../stato.js';
import { passiHTML, piede, toast, apriFoglio, icona } from '../ui.js';
import { imgMiniatura, ritaglioFamiglia, idrataMiniature, disegnaPagina } from '../figure.js';
import { postazioniHTML, noteFamigliaHTML, gestisciClic } from './agente-viste.js';
import { righeHTML, collegaRighe, voceLiberaFoglio } from './preventivo-righe.js';
import { riepilogoHTML, collegaRiepilogo } from './riepilogo.js';

const ICONE = {
  auto: '<path d="M3 15.5v-3.2l2.1-4.6A2 2 0 0 1 6.9 6.5h8.5a2 2 0 0 1 1.6.8L20 11.4l1 .9v3.2h-1.6M6 15.5H4.6M10 15.5h4" /><circle cx="8" cy="15.8" r="2"/><circle cx="17" cy="15.8" r="2"/><path d="M5 11.4h15"/>',
  moto: '<circle cx="5.5" cy="15.5" r="3.3"/><circle cx="18.5" cy="15.5" r="3.3"/><path d="M5.5 15.5 9.5 10h4.5l4.5 5.5M12 10l-1.2-3H8.5M14 10l2-3h2.2"/>',
  truck: '<path d="M2.5 16.5v-11h11v11M13.5 9h4l3 4v3.5h-1.4M8.2 16.5h7.2"/><circle cx="6" cy="17" r="2"/><circle cx="17.2" cy="17" r="2"/>',
  equilibratura: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.2"/><rect x="10.6" y="1.8" width="2.8" height="3" rx=".6" fill="currentColor" stroke="none"/>',
  smontaggio: '<circle cx="12" cy="13" r="8"/><circle cx="12" cy="13" r="4.6"/><path d="M15.5 2.5 10.2 13"/>',
  sollevamento: '<path d="M3.5 20.5h17M7 20.5v-16M17 20.5v-16M7 12h10M12 9.5V4.5m-2.2 2.2L12 4.5l2.2 2.2"/>',
  assetto: '<path d="M8.5 4 6 20M15.5 4 18 20M3 12h3m3.5 0h5m3.5 0h3"/>',
  altro: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.8 17.2l3 3 5.5-5.5a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.6-.6-.6-2.6z"/>'
};
const ic = (id, s = 28) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONE[id] || ''}</svg>`;

// Scelte del configuratore e della ricerca: restano finché l'app è aperta
const cfg = L.CFG_INIZIALE();
const ricerca = { q: '', sezione: null };

/* ---------- pezzi comuni ---------- */
function pulsanteAggiungi(p) {
  const n = nelPreventivo(p.key);
  return `<button type="button" class="aggiungi ${n ? 'aggiunto' : ''}" data-azione="aggiungi" data-key="${esc(p.key)}" aria-label="Aggiungi ${esc(p.code)} al preventivo${n ? `, già ${n}` : ''}">${n ? `<span>${n}</span>` : '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'}</button>`;
}
export function rigaArticolo(p, conMeta = false) {
  const f = L.fam(listino.catalog, p.family);
  return `
    <li class="articolo">
      <button type="button" class="articolo-apri" data-azione="scheda" data-key="${esc(p.key)}">
        <span class="codice">${esc(p.code)}${p.shared ? ' <span class="etichetta" title="Stesso prezzo di altri codici">variante</span>' : ''}</span>
        <span class="articolo-nome">${esc(p.name)}</span>
        ${p.power ? `<span class="nota">${esc(p.power)}</span>` : ''}
        ${conMeta ? `<span class="nota">${esc(f.title)}, pag. ${p.page}</span>` : ''}
      </button>
      <span class="articolo-lato"><span class="prezzo">${euro(p.price)}</span>${pulsanteAggiungi(p)}</span>
    </li>`;
}
function schedaFamiglia(fid, items) {
  const f = L.fam(listino.catalog, fid);
  const min = Math.min(...items.map(p => p.price));
  const crop = ritaglioFamiglia(f);
  return `
    <article class="famiglia ${f.accessory ? 'famiglia-acc' : ''}">
      <button type="button" class="famiglia-testa" data-azione="famiglia" data-fam="${esc(fid)}">
        ${crop ? `<span class="miniatura">${imgMiniatura(crop, 120)}</span>` : `<span class="miniatura miniatura-icona">${ic(f.activity, 30)}</span>`}
        <span class="famiglia-testo">
          <span class="famiglia-titolo">${esc(f.title)}</span>
          ${f.subtitle ? `<span class="nota">${esc(f.subtitle)}</span>` : ''}
          <span class="famiglia-da">${items.length > 1 ? 'da ' : ''}${euro(min)} <span class="nota">pag. ${f.page}</span></span>
        </span>
      </button>
      <ul class="articoli">${items.map(p => rigaArticolo(p)).join('')}</ul>
    </article>`;
}
function schede(sotto) {
  const n = stato.preventivo ? stato.preventivo.items.length : 0;
  const t = [['', 'Configura'], ['cerca', 'Cerca'], ['preventivo', `Il preventivo${n ? ` (${n})` : ''}`]];
  return `<nav class="schede" aria-label="Prodotti">${t.map(([id, nome]) => `<a href="#/prodotti${id ? '/' + id : ''}" class="scheda" ${sotto === id ? 'aria-current="page"' : ''}>${nome}</a>`).join('')}</nav>`;
}

/* ---------- stati senza listino ---------- */
function benvenuto() {
  return `
    <section class="riquadro vuoto sezione">
      <div class="vuoto-icona">${ic('equilibratura', 56)}</div>
      <h2 class="titolo">Carica il listino per iniziare</h2>
      <p class="sottotitolo">Scegli il PDF del listino dal dispositivo. Viene letto qui e non viene mai caricato online.</p>
      <button type="button" class="btn btn-primario" data-azione="scegli-pdf">Carica listino PDF</button>
      <p class="nota sezione">Puoi sostituirlo in qualsiasi momento dalle Impostazioni, quando esce un listino nuovo. Intanto puoi aggiungere voci libere nella scheda “Il preventivo”.</p>
    </section>`;
}
function lettura() {
  const l = listino.lettura;
  const pct = l.totale ? Math.round((l.fatto / l.totale) * 100) : 4;
  return `
    <section class="riquadro vuoto sezione" aria-live="polite">
      <h2 class="titolo">Sto leggendo il listino</h2>
      <p class="sottotitolo">${esc(l.nome)}</p>
      <div class="avanzamento" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div style="width:${pct}%"></div></div>
      <p class="nota">${l.totale ? `${esc(l.fase)}: ${l.fatto} di ${l.totale}` : esc(l.fase)}</p>
      <p class="nota sezione">La lettura avviene sul dispositivo. Il file non viene inviato da nessuna parte.</p>
    </section>`;
}

/* ---------- configuratore ---------- */
function passo(n, id, domanda, risposta, corpo, bloccato) {
  const aperto = cfg.open === id;
  return `
    <section class="cfg-passo ${aperto ? 'aperto' : ''}">
      <button type="button" class="cfg-testa" data-azione="cfg-apri" data-passo="${id}" ${bloccato ? 'disabled' : ''} aria-expanded="${aperto}">
        <span class="passo-num" aria-hidden="true">${n}</span><span class="cfg-domanda">${domanda}</span>
        ${risposta ? `<span class="cfg-risposta">${esc(risposta)}</span>` : ''}
      </button>
      ${aperto ? `<div class="cfg-corpo">${corpo}</div>` : ''}
    </section>`;
}
function configuratore() {
  const cat = listino.catalog;
  const vLabel = cfg.vehicle ? L.VEHICLES.find(v => v.id === cfg.vehicle).label : 'Tutti i veicoli';
  const aLabel = cfg.activity ? L.ACTIVITIES.find(a => a.id === cfg.activity).label : '';
  let h = passo(1, 'vehicle', 'Per quale veicolo?', cfg.vehicle || cfg.open !== 'vehicle' ? vLabel : '', `
    <div class="tessere tessere-3">${L.VEHICLES.map(v => `
      <button type="button" class="tessera ${cfg.vehicle === v.id ? 'scelta-on' : ''}" aria-pressed="${cfg.vehicle === v.id}" data-azione="cfg-veicolo" data-id="${v.id}" ${L.contaVeicolo(cat, v.id) ? '' : 'disabled'}>
        ${ic(v.id, 34)}<span class="tessera-nome">${v.label}</span><span class="nota">${v.hint}</span></button>`).join('')}</div>
    <button type="button" class="link" data-azione="cfg-veicolo" data-id="">Mostra per tutti i veicoli</button>`);
  if (listino.pack && cfg.vehicle) h += postazioniHTML(cfg.vehicle);
  h += passo(2, 'activity', 'Che lavoro deve fare?', aLabel, `
    <div class="tessere tessere-2">${L.ACTIVITIES.map(a => { const n = L.contaAttivita(cat, cfg, a.id); return `
      <button type="button" class="tessera tessera-riga ${cfg.activity === a.id ? 'scelta-on' : ''}" aria-pressed="${cfg.activity === a.id}" data-azione="cfg-attivita" data-id="${a.id}" ${n ? '' : 'disabled'}>
        ${ic(a.id, 30)}<span class="tessera-nome">${a.label}</span><span class="tessera-n">${n}</span></button>`; }).join('')}</div>`, !cfg.vehicle && cfg.open === 'vehicle');

  if (cfg.activity) {
    const base = L.machineBase(cat, cfg, cfg.acc);
    const groups = L.filterGroups(cat, cfg, base);
    const nSel = Object.values(cfg.sel).reduce((a, v) => a + (v ? v.length : 0), 0);
    h += passo(3, 'needs', 'Esigenze del cliente', nSel ? `${nSel} ${nSel === 1 ? 'filtro' : 'filtri'}` : 'Facoltativo', `
      ${groups.length ? groups.map(g => `
        <fieldset class="gruppo"><legend>${g.label}${g.all ? ' <span class="nota">(tutte quelle scelte)</span>' : ''}</legend>
          <div class="chips">${g.opts.map(o => { const on = (cfg.sel[g.id] || []).includes(o.id); return `<button type="button" class="scelta-chip ${on ? 'on' : ''}" aria-pressed="${on}" data-azione="cfg-chip" data-g="${g.id}" data-id="${esc(o.id)}">${esc(o.label)} <span class="chip-n">${o.n}</span></button>`; }).join('')}</div>
        </fieldset>`).join('') : '<p class="nota">Nessun filtro utile per questa scelta: guarda direttamente i prodotti qui sotto.</p>'}
      ${nSel ? '<button type="button" class="link" data-azione="cfg-togli">Togli tutti i filtri</button>' : ''}`);
    h += risultati(L.applyFilters(cat, cfg, base));
  }
  return h;
}
function risultati(list) {
  const gruppi = L.raggruppaPerFamiglia(list, cfg.sort);
  const macchine = list.filter(p => !p.accessory).length;
  return `
    <section class="sezione" aria-labelledby="ris-titolo">
      <div class="barra-risultati">
        <p id="ris-titolo" class="ris-conta" aria-live="polite"><b>${macchine}</b> ${macchine === 1 ? 'prodotto' : 'prodotti'}${cfg.acc ? ` e ${list.length - macchine} accessori` : ''}</p>
        <label class="campo campo-in-linea"><span class="sr">Ordina</span>
          <select class="select" data-azione="cfg-ordina">
            <option value="listino" ${cfg.sort === 'listino' ? 'selected' : ''}>Ordine listino</option>
            <option value="asc" ${cfg.sort === 'asc' ? 'selected' : ''}>Prezzo crescente</option>
            <option value="desc" ${cfg.sort === 'desc' ? 'selected' : ''}>Prezzo decrescente</option>
          </select></label>
      </div>
      <label class="interruttore"><input type="checkbox" data-azione="cfg-accessori" ${cfg.acc ? 'checked' : ''}><span class="int-ui" aria-hidden="true"></span><span class="int-testo"><strong>Mostra anche gli accessori</strong></span></label>
      ${gruppi.size ? [...gruppi].map(([fid, items]) => schedaFamiglia(fid, items)).join('') : '<p class="vuoto-breve">Nessun prodotto con questi filtri. Prova a togliere qualche caratteristica.</p>'}
    </section>`;
}

/* ---------- ricerca ---------- */
function ricercaHTML() {
  return `
    <div class="campo sezione">
      <label class="campo-etichetta" for="cerca-q">Cerca per codice o nome</label>
      <input id="cerca-q" class="input" type="search" enterkeyhint="search" autocomplete="off" autocorrect="off" spellcheck="false"
        placeholder="Es. 01100313 o MEC 1000" value="${esc(ricerca.q)}">
    </div>
    <div id="cerca-risultati" aria-live="polite">${risultatiRicerca()}</div>`;
}
function risultatiRicerca() {
  const cat = listino.catalog;
  const q = L.norm(ricerca.q).trim();
  if (!q && !ricerca.sezione) {
    const blocchi = L.sezioni(cat).map(m => `
      <div class="sezione-listino">
        <button type="button" class="sezione-principale" data-azione="sezione" data-da="${m.da}" data-a="${m.a}" data-nome="${esc(m.nome)}"><span>${esc(L.cap(m.nome))}</span><span class="tessera-n">${m.n}</span></button>
        ${m.sotto.length ? `<div class="chips">${m.sotto.map(s => `<button type="button" class="scelta-chip" data-azione="sezione" data-da="${s.da}" data-a="${s.a}" data-nome="${esc(s.nome)}">${esc(s.nome)} <span class="chip-n">${s.n}</span></button>`).join('')}</div>` : ''}
      </div>`).join('');
    return `<p class="nota sezione">Oppure sfoglia per sezione del listino</p>${blocchi || '<p class="vuoto-breve">Indice non trovato nel PDF: usa la ricerca.</p>'}`;
  }
  let list, testa;
  if (ricerca.sezione && !q) {
    const s = ricerca.sezione;
    list = L.articoliSezione(cat, s.da, s.a);
    testa = `<div class="barra-risultati"><p class="ris-conta"><b>${esc(s.nome)}</b>, ${list.length} articoli</p><button type="button" class="link" data-azione="sezione-togli">Tutte le sezioni</button></div>`;
  } else {
    list = L.cerca(cat, ricerca.q, window.Cerca);
    testa = `<p class="ris-conta sezione"><b>${list.length}</b> ${list.length === 1 ? 'risultato' : 'risultati'}</p>`;
  }
  const mostrati = list.slice(0, 120);
  return testa + (mostrati.length
    ? `<ul class="articoli articoli-piatti">${mostrati.map(p => rigaArticolo(p, true)).join('')}</ul>${list.length > mostrati.length ? `<p class="nota">Mostro i primi ${mostrati.length}: scrivi qualcosa in più per restringere.</p>` : ''}`
    : '<p class="vuoto-breve">Nessun articolo trovato. Controlla il codice o prova con una parola sola.</p>');
}

/* ---------- scheda prodotto / famiglia ---------- */
async function apriScheda(fid, focusKey) {
  const cat = listino.catalog;
  const f = L.fam(cat, fid);
  const items = cat.products.filter(p => p.family === fid);
  const focus = focusKey ? listino.byKey.get(focusKey) : null;
  const accs = L.suggestedAccessories(cat, f);
  const corpo = apriFoglio(f.title, `
    <p class="nota">${esc(f.sub || L.cap(f.main || ''))}, pag. ${f.page}${f.subtitle ? ' · ' + esc(f.subtitle) : ''}</p>
    <div class="figura">
      <div class="figura-scorri" id="fig-scorri">
        <div class="figura-dentro"><canvas id="fig-canvas" aria-label="Pagina ${f.page} del listino"></canvas>
          ${focus && focus.band ? `<div class="figura-evidenza" style="top:${(focus.band.y0 * 100).toFixed(2)}%;height:${((focus.band.y1 - focus.band.y0) * 100).toFixed(2)}%"></div>` : ''}
        </div>
      </div>
      <div class="figura-strumenti"><span class="nota" id="fig-stato">Pagina ${f.page} del listino</span>
        <button type="button" class="btn btn-secondario btn-piccolo" id="fig-zoom">Ingrandisci</button></div>
    </div>
    ${focus ? `<h3 class="sezione-titolo sezione">Articolo selezionato</h3><ul class="articoli">${rigaArticolo(focus)}</ul>` : ''}
    <h3 class="sezione-titolo sezione">${f.accessory ? 'Articoli in questa pagina' : 'Versioni'}</h3>
    <ul class="articoli">${items.filter(p => !focus || p.key !== focus.key).map(p => rigaArticolo(p)).join('')}</ul>
    ${noteFamigliaHTML(items)}
    ${f.features && f.features.length ? `<details class="apri"><summary>Caratteristiche (${f.features.length})</summary><ul class="elenco">${f.features.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>` : ''}
    ${accs.length ? `<h3 class="sezione-titolo sezione">Accessori consigliati</h3><ul class="articoli">${accs.slice(0, 40).map(p => rigaArticolo(p)).join('')}</ul>
      ${accs.length > 40 ? `<p class="nota">Altri ${accs.length - 40} accessori nella sezione Cerca.</p>` : ''}` : ''}`);
  idrataMiniature(corpo);
  try {
    const fig = await disegnaPagina(corpo.querySelector('#fig-canvas'), corpo.querySelector('#fig-scorri'), f.page, focus);
    corpo.querySelector('#fig-zoom').addEventListener('click', async e => { const z = await fig.cambiaZoom(); e.target.textContent = z === 1 ? 'Ingrandisci' : 'Riduci'; });
  } catch (e) {
    const st = corpo.querySelector('#fig-stato');
    if (st) st.textContent = 'Figura non disponibile: ricarica il listino dalle impostazioni.';
    corpo.querySelector('#fig-canvas')?.remove();
    corpo.querySelector('#fig-zoom')?.remove();
  }
}
/** Aggiorna i pulsanti + di un articolo ovunque siano (anche nella finestra aperta). */
function aggiornaPulsanti(key) {
  const p = listino.byKey.get(key);
  document.querySelectorAll(`.aggiungi[data-key="${CSS.escape(key)}"]`).forEach(b => { b.outerHTML = pulsanteAggiungi(p); });
}

/* ---------- schermata ---------- */
export function mostra(vista, app) {
  const sotto = ['cerca', 'preventivo'].includes(app.sotto) ? app.sotto : '';
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'application/pdf,.pdf'; input.hidden = true;

  function disegna() {
    const cat = listino.catalog;
    let corpo;
    if (sotto === 'preventivo') corpo = righeHTML();
    else if (listino.lettura) corpo = lettura();
    else if (!cat) corpo = benvenuto();
    else corpo = sotto === 'cerca' ? ricercaHTML() : configuratore();
    vista.innerHTML = `
      ${passiHTML('prodotti')}
      <div class="percorso"><div class="percorso-principale">
      <h1 class="titolo" tabindex="-1">Prodotti</h1>
      <p class="sottotitolo">${cat ? `${esc(cat.title.replace(/\s+/g, ' '))}, ${cat.products.length} articoli` : 'Nessun listino caricato'}</p>
      ${schede(sotto)}
      <div id="prod-corpo">${corpo}</div>
      <div class="azioni sezione"><a class="btn btn-primario" href="#/consegna">Avanti: consegna ${icona('freccia', 20)}</a></div>
      </div>${riepilogoHTML()}</div>
      ${piede(app.versione)}`;
    vista.appendChild(input);
    idrataMiniature(vista);
  }

  async function scegliPdf(file) {
    const r = await caricaFile(file);
    if (r.messaggio) toast(r.messaggio);
    if (r.ok) Object.assign(cfg, L.CFG_INIZIALE());
  }
  input.addEventListener('change', () => { const f = input.files && input.files[0]; input.value = ''; scegliPdf(f); });

  // Un solo ascoltatore per la schermata e per le finestre aperte sopra (scheda prodotto, book)
  const clic = e => {
    if (!vista.contains(e.target) && !e.target.closest('.foglio')) return;
    if (gestisciClic(e, { app, vehicle: cfg.vehicle, ridisegna: disegna, voceLibera: nome => voceLiberaFoglio(nome, disegna) })) return;
    const el = e.target.closest('[data-azione]');
    if (!el || el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
    const d = el.dataset;
    switch (d.azione) {
      case 'scegli-pdf': input.click(); break;
      case 'cfg-apri': cfg.open = cfg.open === d.passo ? null : d.passo; disegna(); break;
      case 'cfg-veicolo':
        cfg.vehicle = d.id || null;
        cfg.open = 'activity';
        if (cfg.activity && !L.attivitaAncoraValida(listino.catalog, cfg)) cfg.activity = null;
        cfg.sel = {};
        disegna();
        break;
      case 'cfg-attivita': cfg.activity = d.id; cfg.open = 'needs'; cfg.sel = {}; disegna(); break;
      case 'cfg-chip': {
        const arr = cfg.sel[d.g] || (cfg.sel[d.g] = []);
        const i = arr.indexOf(d.id);
        if (i >= 0) arr.splice(i, 1); else arr.push(d.id);
        const y = window.scrollY; disegna(); window.scrollTo(0, y);
        vista.querySelector(`[data-azione="cfg-chip"][data-g="${CSS.escape(d.g)}"][data-id="${CSS.escape(d.id)}"]`)?.focus({ preventScroll: true });
        break;
      }
      case 'cfg-togli': cfg.sel = {}; disegna(); break;
      case 'famiglia': apriScheda(d.fam); break;
      case 'scheda': { const p = listino.byKey.get(d.key); if (p) apriScheda(p.family, p.key); break; }
      case 'sezione': ricerca.sezione = { da: Number(d.da), a: Number(d.a), nome: d.nome }; vista.querySelector('#cerca-risultati').innerHTML = risultatiRicerca(); window.scrollTo(0, 0); idrataMiniature(vista); break;
      case 'sezione-togli': ricerca.sezione = null; vista.querySelector('#cerca-risultati').innerHTML = risultatiRicerca(); break;
      case 'aggiungi': {
        const p = listino.byKey.get(d.key);
        if (!p) break;
        aggiungiArticolo(p);
        aggiornaPulsanti(p.key);
        toast(`Aggiunto: ${p.code}`);
        break;
      }
    }
  };
  document.addEventListener('click', clic);
  vista.addEventListener('change', e => {
    if (e.target.dataset.azione === 'cfg-accessori') { cfg.acc = e.target.checked; disegna(); }
    if (e.target.dataset.azione === 'cfg-ordina') { cfg.sort = e.target.value; disegna(); }
  });
  let timer = null;
  vista.addEventListener('input', e => {
    if (e.target.id !== 'cerca-q') return;
    ricerca.q = e.target.value;
    if (ricerca.q) ricerca.sezione = null;
    clearTimeout(timer);
    timer = setTimeout(() => { const box = vista.querySelector('#cerca-risultati'); if (box) { box.innerHTML = risultatiRicerca(); idrataMiniature(box); } }, 120);
  });

  vista.closest('.contenuto').classList.add('contenuto-largo');
  disegna();
  if (sotto === 'preventivo') collegaRighe(vista, disegna);
  const via3 = collegaRiepilogo(vista);
  const via1 = ascoltaListino(() => { if (sotto !== 'preventivo') disegna(); });
  const via2 = ascolta(() => { const s = vista.querySelector('.schede'); if (s) s.outerHTML = schede(sotto); });
  return () => { via1(); via2(); via3(); document.removeEventListener('click', clic); clearTimeout(timer); };
}
