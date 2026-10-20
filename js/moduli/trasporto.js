/*
 * Costo di trasporto (porting di calcolo-trasporti). Si usa da solo (#/trasporto).
 * I calcoli sono in js/core/trasporti.js; qui la schermata: prodotti, destinazione,
 * servizi, adeguamenti e riepilogo da condividere.
 */
import * as T from '../core/trasporti.js';
import { euroOTrattino, esc, it1, itN } from '../core/formato.js';
import { oggiISO, dataIt } from '../core/date.js';
import { caricaJSON, ricaricaJSON, apriFoglio, toast, copia, piede } from '../ui.js';
import { Pref } from '../store.js';

const FILE = ['listini', 'pallet', 'groupage', 'articoli', 'geo'];

/** Dati del trasporto: tariffe e catalogo (obbligatori) e gasolio (facoltativo, offline può mancare). */
export async function datiTrasporti() {
  const parti = await Promise.all(FILE.map(n => caricaJSON(`data/trasporti/${n}.json`)));
  const D = Object.fromEntries(FILE.map((n, i) => [n, parti[i]]));
  try { D.gasolio = await caricaJSON('data/trasporti/gasolio.json'); } catch (e) { D.gasolio = null; }
  try { D.sovrapposizione = await caricaJSON('data/trasporti/sovrapposizione.json'); } catch (e) { D.sovrapposizione = null; }
  return D;
}

/* ---------- Stato salvato sul dispositivo ---------- */
export function caricaStato(D) {
  const s = Pref.get('trasporto') || {};
  const regOk = D.geo.some(r => r.id === s.reg);
  let uid = 1;
  return {
    reg: regOk ? s.reg : '',
    prov: regOk ? (s.prov || '') : '',
    opts: { ass: !!s.opts?.ass, pre: !!s.opts?.pre, dis: !!s.opts?.dis, disEur: T.num(s.opts?.disEur) },
    // gli articoli non più a catalogo si scartano, come nell'app originale
    cart: (s.cart || []).filter(l => l.kind === 'manual' || D.articoli.some(a => a.id === l.artId)).map(l => ({ ...l, uid: uid++ }))
  };
}
export function caricaAdeguamenti() {
  const adj = T.num(Pref.get('trasporto_adj'), 0);
  const f = Pref.get('trasporto_fuel');
  const fuel = f ? { on: !!f.on, share: T.num(f.share, T.FUEL_DEFAULTS.share), shareIs: T.num(f.shareIs, T.FUEL_DEFAULTS.shareIs) } : { ...T.FUEL_DEFAULTS };
  return { adj, fuel };
}

/* ---------- Finestra "Listini e aggiornamenti" ---------- */
const timbro = (etichetta, valore) => `<span class="timbro"><small>${esc(etichetta)}</small><b>${esc(valore)}</b></span>`;
export function listiniHTML(D) {
  const L = D.listini, p = L.servizi.pallet, g = L.servizi.groupage, g0 = D.gasolio;
  const fornitore = s => `<p class="nota">${s.fornitore ? `Trasportatore: <b>${esc(s.fornitore)}</b> · ` : ''}${esc(s.listino)}</p>`;
  return `
    <section class="sezione">
      <h3 class="sezione-titolo">${esc(p.titolo)}</h3>
      ${fornitore(p)}
      <div>${timbro('Tariffe di riferimento', p.riferimento)}</div>
      <ul class="elenco">${p.condizioni.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
      <div class="scorri"><table class="tabella">
        <thead><tr><th scope="col">Pallet</th><th scope="col">Base</th><th scope="col">Altezza max</th><th scope="col">Peso max</th></tr></thead>
        <tbody>${D.pallet.tipi.filter(t => !t.extraPct).map(t => `<tr><td><b>${esc(t.id)}</b></td><td>100×120 cm</td><td>${t.altezzaCm} cm</td><td>${t.kgMax} kg</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="nota">Le varianti con “+%” si applicano ai prodotti con base più grande di 100×120 cm.</p>
    </section>
    <section class="sezione">
      <h3 class="sezione-titolo">${esc(g.titolo)}</h3>
      ${fornitore(g)}
      <div>${timbro('Tariffe di riferimento', g.riferimento)}${timbro('In vigore dal', dataIt(g.decorrenza))}</div>
      <h4 class="sr">Aggiornamenti</h4>
      <ol class="cronologia">${g.storico.slice().reverse().map(h => `<li><time>${esc(dataIt(h.data, true))}</time>${esc(h.testo)}</li>`).join('')}</ol>
      <ul class="elenco">${g.condizioni.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
    </section>
    ${L.catalogo ? `<section class="sezione"><h3 class="sezione-titolo">Pesi e misure dei prodotti</h3><p class="nota">${esc(L.catalogo.fonte)}. ${esc(L.catalogo.nota)}</p></section>` : ''}
    <section class="sezione">
      <h3 class="sezione-titolo">Prezzo del gasolio</h3>
      <p class="nota">${esc(L.gasolio.fonte)}. ${esc(L.gasolio.nota)}.</p>
      <div>${g0 ? timbro('Ultimo dato', `${T.fonteGasolio(g0)} del ${dataIt(g0.attuale.data)}`) + timbro('Prezzo', `${it1(g0.attuale.prezzo, 3)} €/l`) : '<p class="nota">Dato non disponibile senza connessione.</p>'}</div>
    </section>
    <p class="nota sezione">Dati dell'app aggiornati al ${esc(dataIt(L.aggiornato, true))}.</p>`;
}

/* ---------- Schermata ---------- */
export async function mostra(vista, app) {
  vista.innerHTML = `<h1 class="titolo" tabindex="-1">Costo di trasporto</h1><p class="sottotitolo">Carico tariffe e catalogo…</p>`;
  let D;
  try { D = await datiTrasporti(); }
  catch (e) {
    vista.innerHTML = `<h1 class="titolo" tabindex="-1">Costo di trasporto</h1><p class="avviso avviso-errore sezione" role="alert">Impossibile caricare i listini. Controlla la connessione e riapri l'app.</p>`;
    return;
  }
  if (!T.versioneDatiOk(D)) {
    vista.innerHTML = `<h1 class="titolo" tabindex="-1">Costo di trasporto</h1><p class="avviso sezione" role="alert">È in corso un aggiornamento delle tariffe. Riprova tra qualche minuto.</p>`;
    return;
  }
  vista.closest('.contenuto').classList.add('contenuto-largo');
  const calc = T.creaTrasporti(D);
  const S = caricaStato(D);
  let { adj: ADJ, fuel: FUEL } = caricaAdeguamenti();
  let uidSeq = S.cart.reduce((m, l) => Math.max(m, l.uid), 0) + 1;
  let ULTIMO = null;
  let tipoManuale = 'pallet';

  vista.innerHTML = `
    <h1 class="titolo" tabindex="-1">Quanto costa spedire?</h1>
    <p class="sottotitolo">Scegli i prodotti e dove vanno consegnati: il costo si aggiorna mentre compili.</p>
    <p><button type="button" class="link" id="tr-listini">Listini e aggiornamenti</button></p>
    <div class="colonne sezione">
      <div>
        <section class="riquadro" aria-labelledby="tr-h1">
          <div class="passo-titolo"><span class="passo-num" aria-hidden="true">1</span><h2 id="tr-h1">Cosa spedisci</h2></div>
          <div class="campo">
            <label class="campo-etichetta" for="tr-famiglia">Famiglia</label>
            <select id="tr-famiglia" class="select">
              <option value="">Tutte le famiglie (${D.articoli.length} prodotti)</option>
              ${T.categorie(D.articoli).map(([c, n]) => `<option value="${esc(c)}">${esc(c)} (${n})</option>`).join('')}
            </select>
          </div>
          <div class="campo">
            <label class="campo-etichetta" for="tr-cerca">Prodotto</label>
            <div class="combo" id="tr-combo">
              <input id="tr-cerca" class="input" type="text" autocomplete="off" spellcheck="false" placeholder="Cerca, es. F 535 o MEC 10"
                role="combobox" aria-expanded="false" aria-controls="tr-lista" aria-autocomplete="list">
              <ul id="tr-lista" class="combo-lista" role="listbox" aria-label="Prodotti" hidden></ul>
            </div>
          </div>
          <p><button type="button" class="link" id="tr-manuale-apri">+ Collo non a catalogo</button></p>
          <div id="tr-manuale" class="manuale" hidden>
            <fieldset class="gruppo" style="margin-top:0">
              <legend>Tipo di collo</legend>
              <div class="segmenti">
                <label class="seg-voce"><input type="radio" name="tr-tipo" value="pallet" checked><span>Pallet</span></label>
                <label class="seg-voce"><input type="radio" name="tr-tipo" value="groupage"><span>Groupage</span></label>
              </div>
            </fieldset>
            <div id="tr-man-pallet" class="campo">
              <label class="campo-etichetta" for="tr-man-tipo">Tipo di pallet</label>
              <select id="tr-man-tipo" class="select">${D.pallet.tipi.map(t => `<option value="${esc(t.id)}" ${t.id === 'MEDIUM' ? 'selected' : ''}>${esc(t.id)}</option>`).join('')}</select>
              <p class="campo-aiuto" id="tr-man-aiuto"></p>
            </div>
            <div id="tr-man-groupage" class="due" hidden>
              <div class="campo"><label class="campo-etichetta" for="tr-man-ml">Metri lineari</label><input id="tr-man-ml" class="input" type="text" inputmode="decimal" value="3"></div>
              <div class="campo"><label class="campo-etichetta" for="tr-man-q">Peso (quintali)</label><input id="tr-man-q" class="input" type="text" inputmode="decimal" value="5"></div>
              <div class="campo"><label class="campo-etichetta" for="tr-man-b">Bancali 80×120</label><input id="tr-man-b" class="input" type="text" inputmode="numeric" value="1"></div>
            </div>
            <div class="azioni">
              <button type="button" class="btn btn-secondario" id="tr-man-annulla">Annulla</button>
              <button type="button" class="btn btn-primario" id="tr-man-aggiungi">Aggiungi al carico</button>
            </div>
          </div>
          <ul class="carico" id="tr-carico" aria-label="Carico"></ul>
          <p class="nota sezione" id="tr-carico-vuoto">Nessun prodotto nel carico. Scegli una famiglia o cerca un prodotto.</p>
        </section>

        <section class="riquadro sezione" aria-labelledby="tr-h2">
          <div class="passo-titolo"><span class="passo-num" aria-hidden="true">2</span><h2 id="tr-h2">Dove va consegnato?</h2></div>
          <div class="due">
            <div class="campo"><label class="campo-etichetta" for="tr-regione">Regione</label>
              <select id="tr-regione" class="select"><option value="">Scegli la regione</option>${D.geo.map(r => `<option value="${esc(r.id)}">${esc(r.nome)}</option>`).join('')}</select></div>
            <div class="campo"><label class="campo-etichetta" for="tr-provincia">Provincia</label>
              <select id="tr-provincia" class="select" disabled></select></div>
          </div>
        </section>

        <section class="riquadro sezione" aria-labelledby="tr-h3">
          <div class="passo-titolo"><span class="passo-num" aria-hidden="true">3</span><h2 id="tr-h3">Servizi</h2></div>
          <label class="interruttore"><input type="checkbox" id="tr-ass"><span class="int-ui" aria-hidden="true"></span>
            <span class="int-testo"><strong>Assicurazione all risk</strong><small>3% sul costo del trasporto</small></span></label>
          <label class="interruttore"><input type="checkbox" id="tr-pre"><span class="int-ui" aria-hidden="true"></span>
            <span class="int-testo"><strong>Preavviso telefonico</strong><small>Solo spedizioni su pallet</small></span></label>
          <label class="interruttore"><input type="checkbox" id="tr-dis"><span class="int-ui" aria-hidden="true"></span>
            <span class="int-testo"><strong>Località disagiata o oltre 30 km dal capoluogo</strong><small>Inserisci il supplemento, se lo conosci</small></span></label>
          <div class="campo" id="tr-dis-riga" hidden>
            <label class="campo-etichetta" for="tr-dis-eur">Supplemento località disagiata / oltre 30 km (€)</label>
            <input id="tr-dis-eur" class="input" type="text" inputmode="decimal" placeholder="0">
          </div>

          <details class="apri" id="tr-adeguamenti">
            <summary><span>Adeguamenti costi</span><span id="tr-adj-etichette"></span></summary>
            <div class="campo">
              <span class="campo-etichetta" id="tr-adj-et">Aumenta o diminuisci (%)</span>
              <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
                <div class="regolatore" role="group" aria-labelledby="tr-adj-et">
                  <button type="button" id="tr-adj-meno" aria-label="Diminuisci dell'1%">−</button>
                  <input id="tr-adj" type="text" inputmode="decimal" aria-labelledby="tr-adj-et">
                  <button type="button" id="tr-adj-piu" aria-label="Aumenta dell'1%">+</button>
                </div>
                <button type="button" class="link" id="tr-adj-azzera">Azzera</button>
              </div>
            </div>
            <label class="interruttore sezione"><input type="checkbox" id="tr-fuel"><span class="int-ui" aria-hidden="true"></span>
              <span class="int-testo"><strong>Adegua al prezzo del gasolio di oggi</strong><small id="tr-fuel-info"></small></span></label>
            <div class="due">
              <div class="campo"><label class="campo-etichetta" for="tr-fuel-share">Incidenza gasolio, Italia continentale (%)</label><input id="tr-fuel-share" class="input" type="text" inputmode="decimal"></div>
              <div class="campo"><label class="campo-etichetta" for="tr-fuel-is">Incidenza gasolio, Sicilia e Sardegna (%)</label><input id="tr-fuel-is" class="input" type="text" inputmode="decimal"></div>
            </div>
            <p class="nota sezione">Gli adeguamenti restano salvati solo su questo dispositivo.</p>
          </details>
        </section>
      </div>

      <aside class="colonna-fissa" aria-label="Costo stimato">
        <article class="bolla" id="tr-bolla">
          <header class="bolla-testa"><span>Stima costo di trasporto</span><time id="tr-data"></time></header>
          <p class="bolla-dest" id="tr-dest"></p>
          <div class="bolla-righe" id="tr-righe"></div>
          <div class="bolla-totale"><span style="font-weight:700">Totale</span><output class="tot" id="tr-totale" aria-live="polite">—</output><span class="iva">IVA esclusa</span></div>
          <div class="confronto" id="tr-confronto" hidden></div>
          <ul class="note" id="tr-note"></ul>
          <footer class="riferimenti" id="tr-rif"></footer>
          <div class="azioni">
            <button type="button" class="btn btn-primario" id="tr-condividi" disabled>Condividi</button>
            <button type="button" class="btn btn-secondario" id="tr-copia" disabled>Copia</button>
            <button type="button" class="btn btn-secondario" id="tr-stampa" disabled>Stampa</button>
          </div>
        </article>
      </aside>
    </div>
    ${piede(app.versione)}`;

  const $ = s => vista.querySelector(s);
  const salva = () => Pref.set('trasporto', S);
  const oggi = () => oggiISO(new Date(), app.anteprimaData);

  /* --- carico --- */
  function disegnaCarico() {
    $('#tr-carico-vuoto').hidden = S.cart.length > 0;
    $('#tr-carico').innerHTML = S.cart.map(line => {
      const dec = calc.decideService(line, ULTIMO?.mode || 'auto', S.reg, S.prov);
      const svc = dec.svc;
      let et = '', meta = '';
      if (line.kind === 'manual') {
        if (svc === 'pallet') { et = `<span class="etichetta">Pallet ${esc(line.manual.pallet)}</span>`; meta = calc.palletDesc(line.manual.pallet); }
        else { et = '<span class="etichetta etichetta-info">Groupage</span>'; meta = `${itN(line.manual.ml)} m, ${itN(line.manual.q)} q, ${line.manual.b} bancali`; }
      } else {
        const a = calc.artById(line.artId);
        if (svc === 'pallet') {
          const pl = dec.pal || T.productPallets(a) || [];
          et = pl.length === 1 ? `<span class="etichetta">Pallet ${esc(pl[0].type)}${!pl[0].fixed && pl[0].pct ? ' +' + pl[0].pct + '%' : ''}</span>` : `<span class="etichetta">${pl.length} colli su pallet</span>`;
        } else if (svc === 'groupage') { const g = T.productGroupage(a); et = `<span class="etichetta etichetta-info">Groupage ${itN(g.ml)} m</span>`; }
        else et = '<span class="etichetta etichetta-warn">Da quotare</span>';
        const bits = [];
        const kg = T.totKg(a);
        if (kg) bits.push(`${itN(kg)} kg`);
        if (a?.colli) { const ps = T.pieces(a); if (ps.length === 1) bits.push(`${ps[0].l}×${ps[0].p}×${ps[0].h} cm`); else if (ps.length > 1) bits.push(`${ps.length} colli`); }
        else if (a?.misure?.length === 3 && a.misure.every(x => x > 0)) bits.push(`${a.misure.map(x => itN(x)).join('×')} cm`);
        if (a?.nota) bits.push(a.nota);
        meta = bits.join(', ');
      }
      const nome = calc.lineTitle(line);
      return `
        <li class="collo" data-svc="${svc}" data-uid="${line.uid}">
          <div class="collo-info"><div class="collo-nome">${esc(nome)}</div><div class="collo-meta">${et}${esc(meta)}</div></div>
          <div class="quantita" role="group" aria-label="Quantità di ${esc(nome)}">
            <button type="button" data-azione="meno" aria-label="Uno in meno">−</button>
            <output aria-live="polite">${line.qty}</output>
            <button type="button" data-azione="piu" aria-label="Uno in più">+</button>
          </div>
          <button type="button" class="togli" data-azione="togli" aria-label="Togli ${esc(nome)} dal carico">✕</button>
        </li>`;
    }).join('');
  }
  function aggiungi(line) {
    if (line.kind === 'art') {
      const ex = S.cart.find(l => l.kind === 'art' && l.artId === line.artId);
      if (ex) { ex.qty = Math.min(99, ex.qty + 1); salva(); aggiorna(); return; }
    }
    S.cart.push({ uid: uidSeq++, qty: 1, ...line });
    salva(); aggiorna();
  }
  $('#tr-carico').addEventListener('click', e => {
    const b = e.target.closest('button[data-azione]');
    if (!b) return;
    const uid = Number(b.closest('.collo').dataset.uid);
    const i = S.cart.findIndex(l => l.uid === uid);
    if (i < 0) return;
    const line = S.cart[i];
    if (b.dataset.azione === 'piu') line.qty = Math.min(99, line.qty + 1);
    if (b.dataset.azione === 'meno') line.qty--;
    if (b.dataset.azione === 'togli' || line.qty < 1) {
      S.cart.splice(i, 1);
      const nome = calc.lineTitle(line);
      if (line.qty < 1) line.qty = 1;
      toast(`Tolto: ${nome}`, { azione: 'Annulla', quandoAzione: () => { S.cart.splice(Math.min(i, S.cart.length), 0, line); salva(); aggiorna(); } });
    }
    salva(); aggiorna();
  });

  /* --- menu prodotti con ricerca --- */
  let voci = [], attiva = -1;
  const inp = $('#tr-cerca'), lista = $('#tr-lista');
  function apriMenu() {
    const cat = $('#tr-famiglia').value, q = inp.value;
    voci = T.filtraArticoli(D.articoli, cat, q);
    attiva = voci.length ? 0 : -1;
    if (!voci.length) lista.innerHTML = '<li class="combo-vuoto">Nessun prodotto trovato. Prova con parte del nome o usa “Collo non a catalogo”.</li>';
    else {
      const gruppi = !cat && !T.norm(q);
      let html = '', ultima = null;
      voci.forEach((a, i) => {
        if (gruppi && a.categoria !== ultima) { html += `<li class="combo-gruppo" role="presentation">${esc(a.categoria)}</li>`; ultima = a.categoria; }
        html += `<li class="combo-voce" role="option" id="tr-opz-${i}" data-i="${i}" aria-selected="${i === attiva}"><span class="combo-nome">${esc(a.nome)}</span><span class="combo-meta">${esc(gruppi || cat ? T.artMeta(a) : a.categoria)}</span></li>`;
      });
      lista.innerHTML = html;
    }
    lista.hidden = false;
    inp.setAttribute('aria-expanded', 'true');
    evidenzia();
  }
  function chiudiMenu() { lista.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); }
  function evidenzia() {
    lista.querySelectorAll('.combo-voce').forEach(li => li.setAttribute('aria-selected', String(Number(li.dataset.i) === attiva)));
    if (attiva >= 0) { inp.setAttribute('aria-activedescendant', `tr-opz-${attiva}`); lista.querySelector(`#tr-opz-${attiva}`)?.scrollIntoView({ block: 'nearest' }); }
  }
  function scegli(i) {
    const a = voci[i];
    if (!a) return;
    aggiungi({ kind: 'art', artId: a.id });
    inp.value = '';
    chiudiMenu();
    toast(`Aggiunto: ${a.nome}`);
  }
  inp.addEventListener('focus', apriMenu);
  inp.addEventListener('input', apriMenu);
  inp.addEventListener('keydown', e => {
    if (lista.hidden && (e.key === 'ArrowDown' || e.key === 'Enter')) { apriMenu(); e.preventDefault(); return; }
    if (e.key === 'ArrowDown') { attiva = Math.min(voci.length - 1, attiva + 1); evidenzia(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { attiva = Math.max(0, attiva - 1); evidenzia(); e.preventDefault(); }
    else if (e.key === 'Enter') { if (attiva >= 0) scegli(attiva); e.preventDefault(); }
    else if (e.key === 'Escape') chiudiMenu();
  });
  lista.addEventListener('mousedown', e => { const li = e.target.closest('.combo-voce'); if (li) { e.preventDefault(); scegli(Number(li.dataset.i)); } });
  const fuori = e => { if (!$('#tr-combo')?.contains(e.target)) chiudiMenu(); };
  document.addEventListener('click', fuori);
  $('#tr-famiglia').addEventListener('change', () => { inp.focus(); apriMenu(); });

  /* --- collo non a catalogo --- */
  const aiutoPallet = () => { $('#tr-man-aiuto').textContent = `Base 100×120 cm, ${calc.palletDesc($('#tr-man-tipo').value)}.`; };
  $('#tr-man-tipo').addEventListener('change', aiutoPallet); aiutoPallet();
  $('#tr-manuale-apri').addEventListener('click', () => { $('#tr-manuale').hidden = false; $('#tr-manuale-apri').hidden = true; $('#tr-man-tipo').focus(); });
  $('#tr-man-annulla').addEventListener('click', () => { $('#tr-manuale').hidden = true; $('#tr-manuale-apri').hidden = false; });
  vista.querySelectorAll('input[name="tr-tipo"]').forEach(r => r.addEventListener('change', () => {
    tipoManuale = vista.querySelector('input[name="tr-tipo"]:checked').value;
    $('#tr-man-pallet').hidden = tipoManuale !== 'pallet';
    $('#tr-man-groupage').hidden = tipoManuale !== 'groupage';
  }));
  $('#tr-man-aggiungi').addEventListener('click', () => {
    const manual = tipoManuale === 'pallet'
      ? { type: 'pallet', pallet: $('#tr-man-tipo').value }
      : { type: 'groupage', ml: Math.max(0, T.num($('#tr-man-ml').value)), q: Math.max(0, T.num($('#tr-man-q').value)), b: Math.max(0, Math.round(T.num($('#tr-man-b').value))) };
    if (manual.type === 'groupage' && !(manual.ml || manual.q || manual.b)) { toast('Indica almeno metri, peso o bancali'); return; }
    aggiungi({ kind: 'manual', manual });
    $('#tr-manuale').hidden = true; $('#tr-manuale-apri').hidden = false;
    toast('Collo aggiunto al carico');
  });

  /* --- destinazione e servizi --- */
  function riempiProvince() {
    const sel = $('#tr-provincia');
    const r = calc.regById(S.reg);
    if (!r) { sel.innerHTML = '<option value="">Prima scegli la regione</option>'; sel.disabled = true; return; }
    sel.disabled = false;
    sel.innerHTML = '<option value="">Scegli la provincia</option>' + r.province.map(p => `<option value="${p.sigla}">${esc(p.nome)} (${p.sigla})</option>`).join('');
    if (r.province.length === 1) S.prov = r.province[0].sigla;
    sel.value = S.prov || '';
  }
  $('#tr-regione').value = S.reg;
  riempiProvince();
  $('#tr-regione').addEventListener('change', e => { S.reg = e.target.value; S.prov = ''; riempiProvince(); salva(); aggiorna(); });
  $('#tr-provincia').addEventListener('change', e => { S.prov = e.target.value; salva(); aggiorna(); });
  for (const [id, k] of [['#tr-ass', 'ass'], ['#tr-pre', 'pre'], ['#tr-dis', 'dis']]) {
    $(id).checked = !!S.opts[k];
    $(id).addEventListener('change', e => { S.opts[k] = e.target.checked; $('#tr-dis-riga').hidden = !S.opts.dis; salva(); aggiorna(); });
  }
  $('#tr-dis-riga').hidden = !S.opts.dis;
  $('#tr-dis-eur').value = T.num(S.opts.disEur) > 0 ? String(S.opts.disEur).replace('.', ',') : '';
  $('#tr-dis-eur').addEventListener('input', e => { S.opts.disEur = Math.max(0, T.num(e.target.value)); salva(); aggiorna(); });

  /* --- adeguamenti e gasolio --- */
  const adjInp = $('#tr-adj');
  const scriviAdj = () => { adjInp.value = String(ADJ).replace('.', ','); };
  scriviAdj();
  const applicaAdj = v => { ADJ = Math.max(T.ADJ_MIN, Math.min(T.ADJ_MAX, T.round2(T.num(v)))); Pref.set('trasporto_adj', ADJ || null); aggiorna(); };
  adjInp.addEventListener('input', () => applicaAdj(adjInp.value));
  adjInp.addEventListener('blur', scriviAdj);
  $('#tr-adj-piu').addEventListener('click', () => { applicaAdj(T.round2(ADJ + 1)); scriviAdj(); });
  $('#tr-adj-meno').addEventListener('click', () => { applicaAdj(T.round2(ADJ - 1)); scriviAdj(); });
  $('#tr-adj-azzera').addEventListener('click', () => { applicaAdj(0); scriviAdj(); });
  $('#tr-fuel').checked = FUEL.on;
  $('#tr-fuel-share').value = FUEL.share;
  $('#tr-fuel-is').value = FUEL.shareIs;
  const salvaFuel = () => { Pref.set('trasporto_fuel', FUEL); aggiorna(); };
  $('#tr-fuel').addEventListener('change', e => { FUEL.on = e.target.checked; salvaFuel(); });
  $('#tr-fuel-share').addEventListener('input', e => { FUEL.share = Math.max(0, Math.min(100, T.num(e.target.value, 30))); salvaFuel(); });
  $('#tr-fuel-is').addEventListener('input', e => { FUEL.shareIs = Math.max(0, Math.min(100, T.num(e.target.value, 15))); salvaFuel(); });
  if (ADJ || FUEL.on) $('#tr-adeguamenti').open = true;

  /* --- riepilogo --- */
  function aggiorna() {
    const R = calc.compute(S, ADJ, FUEL);
    ULTIMO = R;
    disegnaCarico();
    $('#tr-data').textContent = dataIt(oggi());
    $('#tr-dest').textContent = calc.destLabel(S);
    $('#tr-righe').innerHTML = !S.cart.length ? '<p class="bolla-vuota">Aggiungi un prodotto per iniziare.</p>'
      : !R.lines.length ? '<p class="bolla-vuota">Completa i dati per vedere il dettaglio.</p>'
      : R.lines.map(l => `<div class="bolla-riga${l.minor ? ' minore' : ''}"><div><strong>${esc(l.t)}</strong>${l.s ? `<small>${esc(l.s)}</small>` : ''}</div><div class="v">${euroOTrattino(l.v)}</div></div>`).join('');
    $('#tr-totale').textContent = R.ready ? euroOTrattino(R.total) : '—';
    const conf = $('#tr-confronto');
    conf.hidden = !R.alt.length;
    conf.innerHTML = '<b>Confronto</b>' + R.alt.map(x => `<div class="confronto-riga"><span>${esc(x.label)}</span><b>${euroOTrattino(x.total)}</b></div>`).join('');
    $('#tr-note').innerHTML = R.notes.map(n => `<li>${esc(n)}</li>`).join('') + R.infos.map(n => `<li class="info">${esc(n)}</li>`).join('');
    const rif = calc.riferimenti(R.used);
    $('#tr-rif').innerHTML = rif.length ? '<span>Calcolato su:</span>' + rif.map(r => `<span>${esc(r.etichetta)}: <b>${esc(r.valore)}</b>${r.chi ? ' · ' + esc(r.chi) : ''}</span>`).join('') : '';
    ['#tr-condividi', '#tr-copia', '#tr-stampa'].forEach(id => { $(id).disabled = !R.ready; });
    // etichette degli adeguamenti attivi e info sul gasolio
    const et = [];
    if (ADJ) et.push(`<span class="etichetta etichetta-warn">${ADJ > 0 ? '+' : '−'}${it1(Math.abs(ADJ))}%</span>`);
    if (FUEL.on && D.gasolio) { const fp = T.fuelPctFor(D.gasolio, FUEL, S.reg); et.push(`<span class="etichetta etichetta-warn">Gasolio ${fp >= 0 ? '+' : '−'}${it1(Math.abs(fp))}%</span>`); }
    $('#tr-adj-etichette').innerHTML = et.join('');
    $('#tr-fuel-info').textContent = T.infoGasolio(D.gasolio, oggi());
    app.barra(R.ready ? { etichetta: 'Trasporto stimato, IVA esclusa', importo: euroOTrattino(R.total), vai: 'Dettaglio', soloStretto: true, azione: () => $('#tr-bolla').scrollIntoView({ behavior: 'smooth', block: 'start' }) } : null, vista);
  }

  /* --- condivisione e stampa --- */
  const testo = () => calc.summaryText(ULTIMO, S, oggi());
  $('#tr-copia').addEventListener('click', async () => toast(await copia(testo()) ? 'Riepilogo copiato' : 'Copia non riuscita'));
  $('#tr-condividi').addEventListener('click', async () => {
    const t = testo();
    if (navigator.share) { try { await navigator.share({ title: 'Stima costo di trasporto', text: t }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, '_blank', 'noopener');
  });
  $('#tr-stampa').addEventListener('click', () => {
    const area = document.getElementById('area-stampa');
    area.innerHTML = `<div class="stampa-bolla">${$('#tr-bolla').outerHTML.replace(/<div class="azioni">[\s\S]*?<\/div>\s*<\/article>/, '</article>')}
      <p class="stampa-piede">Preventivo in tasca · Alessandro Pezzali</p></div>`;
    window.print();
  });
  $('#tr-listini').addEventListener('click', () => apriFoglio('Listini e aggiornamenti', listiniHTML(D)));

  aggiorna();

  // gasolio aggiornato quando l'app torna in primo piano
  const quandoTorna = async () => {
    if (document.visibilityState !== 'visible') return;
    try { D.gasolio = await ricaricaJSON('data/trasporti/gasolio.json'); } catch (e) { /* offline: resta l'ultimo */ }
    aggiorna();
  };
  document.addEventListener('visibilitychange', quandoTorna);
  return () => { document.removeEventListener('visibilitychange', quandoTorna); document.removeEventListener('click', fuori); };
}
