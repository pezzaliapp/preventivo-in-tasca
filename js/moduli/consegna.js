/*
 * Consegna (passo 2): gli articoli del preventivo si abbinano al catalogo trasporti, si sceglie
 * dove consegnare e si vedono SEMPRE affiancate le due soluzioni, tutto in groupage e tutto
 * su pallet, con il loro dettaglio. "Usa questa" mette nel preventivo la riga del trasporto
 * (sconto 0). I conti sono quelli dell'app trasporti (js/core/trasporti.js): qui solo la vista.
 */
import * as T from '../core/trasporti.js';
import { euro, euroOTrattino, esc, it1, itN } from '../core/formato.js';
import { oggiISO, dataIt } from '../core/date.js';
import { stato, preventivoCambiato } from '../stato.js';
import { eRigaTrasporto } from '../core/preventivo.js';
import { listino, nuovoId } from '../catalogo.js';
import { passiHTML, piede, toast, apriFoglio, icona } from '../ui.js';
import { datiTrasporti, caricaAdeguamenti, listiniHTML } from './trasporto.js';
import { ricorda, statoAbbinamento, foglioCatalogo, foglioManuale } from './abbinamenti-scelta.js';
import { controlloCarico } from '../core/abbinamento.js';
import { riepilogoHTML, collegaRiepilogo } from './riepilogo.js';

/** Per ogni articolo del listino nel preventivo: come viaggia. */
function risolvi(D) {
  return stato.preventivo.items.filter(it => !it.custom && it.key).map(it => {
    const p = listino.byKey.get(it.key);
    const fam = p && listino.catalog ? listino.catalog.families[p.family] || {} : { title: it.family || '' };
    return Object.assign({ it, p }, statoAbbinamento(it, fam, D.articoli, !!(p && p.accessory)));
  });
}

/** Stato per il calcolo: carico, destinazione e servizi del preventivo. */
function statoCalcolo(voci) {
  const c = stato.preventivo.consegna || {};
  let uid = 1;
  const cart = [];
  for (const v of voci) {
    if (v.stato === 'art') cart.push({ uid: uid++, qty: v.it.qty, kind: 'art', artId: v.artId, voce: v });
    if (v.stato === 'manuale') cart.push({ uid: uid++, qty: v.it.qty, kind: 'manual', manual: v.manual, voce: v });
  }
  return { cart, reg: c.reg || '', prov: c.prov || '', opts: Object.assign({ ass: false, pre: false, dis: false, disEur: 0 }, c.opts) };
}

const NOMI = { groupage: 'Tutto in groupage', pallet: 'Tutto su pallet', auto: 'Pallet e groupage separati' };

export async function mostra(vista, app) {
  vista.closest('.contenuto').classList.add('contenuto-largo');
  vista.innerHTML = `${passiHTML('consegna')}<h1 class="titolo" tabindex="-1">Consegna</h1><p class="sottotitolo">Carico tariffe e catalogo…</p>`;
  let D;
  try { D = await datiTrasporti(); }
  catch (e) { vista.innerHTML = `${passiHTML('consegna')}<h1 class="titolo" tabindex="-1">Consegna</h1><p class="avviso avviso-errore sezione" role="alert">Impossibile caricare i listini dei trasporti. Controlla la connessione e riapri l'app.</p>`; return; }
  if (!T.versioneDatiOk(D)) { vista.innerHTML = `${passiHTML('consegna')}<h1 class="titolo" tabindex="-1">Consegna</h1><p class="avviso sezione" role="alert">È in corso un aggiornamento delle tariffe. Riprova tra qualche minuto.</p>`; return; }
  const calc = T.creaTrasporti(D);
  const q = () => stato.preventivo;
  if (!q().consegna) q().consegna = { reg: '', prov: '', opts: {} };
  const oggi = () => oggiISO(new Date(), app.anteprimaData);

  function vociHTML(voci) {
    if (!voci.length) return `<p class="vuoto-breve">Nel preventivo non ci sono articoli del listino da spedire. <a class="btn btn-secondario" href="#/prodotti">Vai ai prodotti</a></p>`;
    return `<ul class="carico">${voci.map(v => {
      const art = v.artId ? calc.artById(v.artId) : null;
      let stato = '', azioni = '';
      if (v.stato === 'art') {
        stato = `<span class="etichetta">${v.origine === 'sicuro' ? 'Abbinato' : 'Scelto'}</span> Pesi e misure: <b>${esc(art.nome)}</b> · ${esc(T.artMeta(art))}`;
        azioni = `<button type="button" class="btn btn-secondario btn-piccolo" data-cons="catalogo" data-code="${esc(v.it.code)}">Cambia</button>`;
      } else if (v.stato === 'manuale') {
        stato = `<span class="etichetta">Collo manuale</span> ${v.manual.type === 'pallet' ? `Pallet ${esc(v.manual.pallet)}` : `Groupage ${itN(v.manual.ml)} m, ${itN(v.manual.q)} q, ${v.manual.b} bancali`}`;
        azioni = `<button type="button" class="btn btn-secondario btn-piccolo" data-cons="catalogo" data-code="${esc(v.it.code)}">Cambia</button>`;
      } else if (v.stato === 'escluso') {
        stato = `<span class="etichetta etichetta-info">Escluso</span> ${v.accessorio ? 'Accessorio: di solito viaggia con la macchina.' : 'Non conta nel trasporto.'}`;
        azioni = `<button type="button" class="btn btn-secondario btn-piccolo" data-cons="catalogo" data-code="${esc(v.it.code)}">Includi</button>`;
      } else {
        stato = v.proposte.length ? '<span class="etichetta etichetta-warn">Da scegliere</span> Quale di questi è?' : '<span class="etichetta etichetta-warn">Non trovato</span> Non è nel catalogo pesi e misure.';
        azioni = v.proposte.map(c => `<button type="button" class="btn btn-secondario btn-piccolo" data-cons="scegli" data-code="${esc(v.it.code)}" data-art="${esc(c.art.id)}">${esc(c.art.nome)}</button>`).join('')
          + `<button type="button" class="btn btn-secondario btn-piccolo" data-cons="catalogo" data-code="${esc(v.it.code)}">${v.proposte.length ? 'Altro…' : 'Scegli dal catalogo'}</button>`
          + `<button type="button" class="btn btn-secondario btn-piccolo" data-cons="manuale" data-code="${esc(v.it.code)}">Collo manuale</button>`
          + `<button type="button" class="btn btn-secondario btn-piccolo" data-cons="escludi" data-code="${esc(v.it.code)}">Escludi</button>`;
      }
      return `<li class="collo cons-voce" id="voce-${esc(v.it.code)}" tabindex="-1" data-svc="${v.stato === 'da-scegliere' ? 'quote' : ''}">
        <div class="collo-info"><div class="collo-nome">${v.it.qty > 1 ? v.it.qty + ' × ' : ''}${esc(v.it.code)} ${esc(v.it.name)}</div><div class="collo-meta">${stato}</div></div>
        <div class="cons-azioni">${azioni}</div></li>`;
    }).join('')}</ul>`;
  }

  function righeServizi(R) {
    return R.lines.filter(l => l.minor).map(l => `<div class="bolla-riga minore"><div><strong>${esc(l.t)}</strong>${l.s ? `<small>${esc(l.s)}</small>` : ''}</div><div class="v">${euroOTrattino(l.v)}</div></div>`).join('');
  }
  function schedaSoluzione(sol, migliore, inUso, incluse) {
    const R = sol.R;
    const pallets = sol.pallet.length ? `
      <h4 class="sol-sotto">${sol.mode === 'groupage' ? 'Su pallet comunque' : 'Pallet'}</h4>
      <ul class="sol-pallet">${sol.pallet.map(a => a.pallets.map(pl => `
        <li><span><b>${esc(a.titolo)}</b>${a.qty > 1 ? ` <span class="nota">(× ${a.qty})</span>` : ''}<br>
          <span class="etichetta">${esc(pl.tipo)}${pl.maggiorazione ? ` +${pl.maggiorazione}%` : ''}</span>${pl.maggiorazione ? `<span class="nota">fuori misura${pl.nota ? ` (${esc(pl.nota)})` : ''}</span>` : ''}</span>
          <span class="v">${pl.costo != null ? euro(pl.costo) : '—'}${a.qty > 1 ? `<small>× ${a.qty}</small>` : ''}</span></li>`).join('')).join('')}</ul>` : '';
    const g = sol.groupage;
    const gruppo = g ? `
      <h4 class="sol-sotto">${sol.mode === 'pallet' ? 'In groupage comunque' : 'Groupage'}</h4>
      <p class="sol-articoli">${g.articoli.map(a => `${a.qty > 1 ? a.qty + ' × ' : ''}${esc(a.titolo)}`).join(', ')}</p>
      <dl class="righe righe-strette">
        <div class="riga"><dt>Carico</dt><dd>${itN(g.carico.ml)} m · ${g.carico.b} ${g.carico.b === 1 ? 'bancale' : 'bancali'} · ${itN(g.carico.q)} q</dd></div>
      </dl>
      <p class="sol-fascia">${esc(g.frase)}</p>
      ${g.impilati.length ? `<p class="sol-fascia">Colli impilati: ${g.impilati.map(esc).join(' · ')}</p>` : ''}
      ${g.impilamentoSenzaEffetto ? `<p class="sol-fascia">${esc(g.impilamentoSenzaEffetto)}</p>` : ''}
      <dl class="righe righe-strette">
        <div class="riga"><dt>Tariffa ${esc(g.zona.toLowerCase())}</dt><dd>${euro(g.prezzo)}</dd></div>
      </dl>` : '';
    const note = [...sol.motivi.map(m => `<li>${esc(m)}</li>`), ...R.notes.filter(n => !/^Imballo non disponibile/.test(n)).map(n => `<li>${esc(n)}</li>`)].join('');
    const nonUsabile = !sol.valida;
    return `
      <article class="soluzione ${migliore ? 'soluzione-migliore' : ''}" aria-labelledby="sol-${sol.mode}">
        <header class="sol-testa">
          <h3 id="sol-${sol.mode}">${NOMI[sol.mode]}</h3>
          ${migliore ? '<span class="etichetta etichetta-ok">Più conveniente</span>' : ''}
          ${inUso ? '<span class="etichetta">Nel preventivo</span>' : ''}
        </header>
        <p class="sol-totale">${R.ready ? euroOTrattino(R.total) : '—'} <small>IVA esclusa</small></p>
        <p class="sol-calcolato">Calcolato su: ${incluse.map(esc).join(', ')}</p>
        ${!sol.pura && sol.mode !== 'auto' ? `<p class="avviso sol-avviso">${sol.mode === 'groupage' ? 'Non tutto può viaggiare in groupage:' : 'Non tutto può viaggiare su pallet:'}</p>` : ''}
        ${note ? `<ul class="note">${note}</ul>` : ''}
        ${gruppo}${pallets}
        ${R.ready ? `<div class="bolla-righe">${righeServizi(R)}</div>` : ''}
        <button type="button" class="btn ${migliore ? 'btn-primario' : 'btn-secondario'} btn-largo sezione" data-cons="usa" data-modo="${sol.mode}" ${nonUsabile ? 'disabled' : ''}>${nonUsabile ? 'Non utilizzabile' : inUso ? 'Aggiorna nel preventivo' : 'Usa questa'}</button>
      </article>`;
  }

  function disegna() {
    const voci = risolvi(D);
    const S = statoCalcolo(voci);
    const { adj, fuel } = caricaAdeguamenti();
    const sol = { groupage: calc.soluzione(S, adj, fuel, 'groupage'), pallet: calc.soluzione(S, adj, fuel, 'pallet'), auto: calc.soluzione(S, adj, fuel, 'auto') };
    const valide = ['groupage', 'pallet', 'auto'].filter(m => sol[m].valida);
    const minimo = valide.length ? Math.min(...valide.map(m => sol[m].R.total)) : null;
    // la soluzione mista si mostra solo se è diversa dalle due "pure"
    const mostraMista = sol.auto.valida && ['groupage', 'pallet'].every(m => !sol[m].valida || Math.abs(sol[m].R.total - sol.auto.R.total) >= 0.5);
    const migliore = m => minimo != null && sol[m].valida && sol[m].R.total === minimo && (m !== 'auto' || mostraMista);
    const riga = q().items.find(eRigaTrasporto);
    const inUso = m => !!(riga && riga.trasporto && riga.trasporto.modo === m);
    const carico = controlloCarico(voci);
    const c = q().consegna;
    const reg = calc.regById(c.reg);
    const aggiornare = carico.completo && riga && riga.trasporto && sol[riga.trasporto.modo] && sol[riga.trasporto.modo].valida && Math.abs(sol[riga.trasporto.modo].R.total - riga.price) >= 0.5;
    const infos = [...new Set([...sol.groupage.R.infos, ...sol.pallet.R.infos])];

    vista.innerHTML = `
      ${passiHTML('consegna')}
      <div class="percorso"><div class="percorso-principale">
      <h1 class="titolo" tabindex="-1">Consegna</h1>
      <p class="sottotitolo">Dove va consegnato? Il costo del trasporto si calcola da solo, in groupage e su pallet.</p>

      <section class="riquadro sezione" aria-labelledby="cons-h1">
        <div class="passo-titolo"><span class="passo-num" aria-hidden="true">1</span><h2 id="cons-h1">Cosa spediamo</h2></div>
        ${vociHTML(voci)}
        ${carico.completo ? '' : `<p class="avviso sezione">Manca il peso di ${carico.mancanti.length === 1 ? 'una macchina' : carico.mancanti.length + ' macchine'}: scegli l'articolo giusto qui sopra, poi il costo del trasporto compare da solo.</p>`}
        <p class="nota sezione-stretta">Le scelte fatte qui si ricordano su questo dispositivo per i prossimi preventivi.</p>
      </section>

      <section class="riquadro sezione" aria-labelledby="cons-h2">
        <div class="passo-titolo"><span class="passo-num" aria-hidden="true">2</span><h2 id="cons-h2">Dove va consegnato?</h2></div>
        <div class="due">
          <div class="campo"><label class="campo-etichetta" for="cons-regione">Regione</label>
            <select id="cons-regione" class="select"><option value="">Scegli la regione</option>${D.geo.map(r => `<option value="${esc(r.id)}" ${r.id === c.reg ? 'selected' : ''}>${esc(r.nome)}</option>`).join('')}</select></div>
          <div class="campo"><label class="campo-etichetta" for="cons-provincia">Provincia</label>
            <select id="cons-provincia" class="select" ${reg ? '' : 'disabled'}>${reg ? `<option value="">Scegli la provincia</option>${reg.province.map(p => `<option value="${p.sigla}" ${p.sigla === c.prov ? 'selected' : ''}>${esc(p.nome)} (${p.sigla})</option>`).join('')}` : '<option value="">Prima scegli la regione</option>'}</select></div>
        </div>
      </section>

      <section class="riquadro sezione" aria-labelledby="cons-h3">
        <div class="passo-titolo"><span class="passo-num" aria-hidden="true">3</span><h2 id="cons-h3">Servizi</h2></div>
        <label class="interruttore"><input type="checkbox" data-opz="ass" ${S.opts.ass ? 'checked' : ''}><span class="int-ui" aria-hidden="true"></span><span class="int-testo"><strong>Assicurazione all risk</strong><small>3% sul costo del trasporto</small></span></label>
        <label class="interruttore"><input type="checkbox" data-opz="pre" ${S.opts.pre ? 'checked' : ''}><span class="int-ui" aria-hidden="true"></span><span class="int-testo"><strong>Preavviso telefonico</strong><small>Solo spedizioni su pallet</small></span></label>
        <label class="interruttore"><input type="checkbox" data-opz="dis" ${S.opts.dis ? 'checked' : ''}><span class="int-ui" aria-hidden="true"></span><span class="int-testo"><strong>Località disagiata o oltre 30 km dal capoluogo</strong><small>Inserisci il supplemento, se lo conosci</small></span></label>
        ${calc.sovrapponibili(S.cart) ? `<label class="interruttore"><input type="checkbox" data-opz="impila" ${S.opts.impila ? 'checked' : ''}><span class="int-ui" aria-hidden="true"></span><span class="int-testo"><strong>Colli sovrapponibili (impilati sul camion)</strong><small>Solo per il groupage: al massimo ${D.sovrapposizione ? D.sovrapposizione.livelliMassimi : 2} livelli e ${D.sovrapposizione ? D.sovrapposizione.altezzaMassimaCm : 240} cm di altezza. Spento: i numeri dell'app trasporti.</small></span></label>` : ''}
        ${S.opts.dis ? `<div class="campo"><label class="campo-etichetta" for="cons-dis">Supplemento località disagiata / oltre 30 km (€)</label><input id="cons-dis" class="input" inputmode="decimal" placeholder="0" value="${T.num(S.opts.disEur) > 0 ? String(S.opts.disEur).replace('.', ',') : ''}"></div>` : ''}
        <p class="nota sezione">Adeguamenti di questo dispositivo: ${adj ? `${adj > 0 ? '+' : '−'}${it1(Math.abs(adj))}%` : 'nessuno'}${fuel.on ? `, gasolio ${D.gasolio ? `${T.fuelPctFor(D.gasolio, fuel, c.reg) >= 0 ? '+' : '−'}${it1(Math.abs(T.fuelPctFor(D.gasolio, fuel, c.reg)))}%` : 'non disponibile'}` : ''}.</p>
        <div class="azioni"><a class="btn btn-secondario" href="#/trasporto">Cambia gli adeguamenti</a><button type="button" class="btn btn-secondario" data-cons="listini">Listini e aggiornamenti</button></div>
      </section>

      <section class="sezione" aria-labelledby="cons-h4">
        <div class="passo-titolo"><span class="passo-num" aria-hidden="true">4</span><h2 id="cons-h4">Scegli la spedizione</h2></div>
        <p class="sottotitolo">${esc(calc.destLabel(S))} · ${dataIt(oggi())}</p>
        ${!carico.completo ? `
          <div class="avviso avviso-errore avviso-grande sezione" role="alert">
            ${carico.mancanti.map(m => `<p>Manca il peso di: <b>${esc(m.nome)}</b> — <button type="button" class="btn btn-secondario btn-piccolo" data-cons="vai" data-code="${esc(m.code)}">sceglilo qui</button></p>`).join('')}
            <p class="sezione-stretta">Finché una macchina non ha peso e misure il costo del trasporto non si calcola: sarebbe incompleto.</p>
            ${riga ? `<p class="sezione-stretta"><b>Attenzione:</b> la riga "${esc(riga.name)}" (${euro(riga.price)}) già nel preventivo potrebbe non comprendere queste macchine.</p>` : ''}
          </div>`
        : !S.cart.length ? '<p class="vuoto-breve">Abbina almeno un articolo per vedere il costo.</p>' : !S.reg ? '<p class="vuoto-breve">Scegli la regione per vedere il costo.</p>' : `
          ${aggiornare ? `<p class="avviso sezione">Il trasporto nel preventivo (${euro(riga.price)}) non corrisponde più al calcolo: tocca "Aggiorna nel preventivo".</p>` : ''}
          <div class="soluzioni" aria-live="polite">${schedaSoluzione(sol.groupage, migliore('groupage'), inUso('groupage'), carico.incluse)}${schedaSoluzione(sol.pallet, migliore('pallet'), inUso('pallet'), carico.incluse)}</div>
          ${mostraMista ? `<div class="sezione">${schedaSoluzione(sol.auto, migliore('auto'), inUso('auto'), carico.incluse)}</div>` : ''}
          ${infos.length ? `<ul class="note sezione">${infos.map(n => `<li class="info">${esc(n)}</li>`).join('')}</ul>` : ''}
          <p class="nota sezione">${calc.riferimenti(new Set([...sol.groupage.R.used, ...sol.pallet.R.used])).map(r => calc.riferimentoTesto(r)).join(' · ')}</p>`}
        ${riga ? `<p class="avviso avviso-ok sezione">Nel preventivo: ${esc(riga.name)} — ${euro(riga.price)}${riga.trasporto && riga.trasporto.tecnico ? `<br><span class="nota">Solo per te: ${esc(riga.trasporto.tecnico)}</span>` : ''} <button type="button" class="link" data-cons="togli-riga">Togli</button></p>` : ''}
      </section>
      <div class="azioni sezione"><a class="btn btn-secondario" href="#/prodotti/preventivo">${icona('indietro', 20)} Prodotti</a><a class="btn btn-primario" href="#/pagamento">Avanti: pagamento ${icona('freccia', 20)}</a></div>
      </div>${riepilogoHTML()}</div>
      ${piede(app.versione)}`;
    vista._sol = carico.completo ? sol : {}; vista._S = S; // senza tutte le macchine, niente "Usa questa"
  }

  /**
   * "Usa questa": la riga del trasporto nel preventivo (sconto 0). Per il cliente solo il tipo di
   * spedizione, la città e i servizi inclusi (D-50); il dettaglio tecnico resta sullo schermo.
   */
  function usa(modo) {
    const sol = vista._sol[modo], S = vista._S;
    if (!sol || !sol.valida) return;
    const tipo = sol.groupage && sol.pallet.length ? 'su pallet e in groupage' : sol.groupage ? 'in groupage' : 'su pallet';
    const reg = calc.regById(S.reg);
    const prov = reg && reg.province.find(p => p.sigla === S.prov);
    const dove = prov ? `${prov.nome} (${prov.sigla})` : reg ? reg.nome : '';
    const servizi = [S.opts.ass && 'assicurazione all risk inclusa', S.opts.pre && sol.pallet.length && 'preavviso telefonico incluso', S.opts.dis && T.num(S.opts.disEur) > 0 && 'supplemento località disagiata incluso'].filter(Boolean);
    const tecnico = [];
    if (sol.groupage) tecnico.push(`groupage ${itN(sol.groupage.carico.ml)} m, ${sol.groupage.carico.b} bancali, ${itN(sol.groupage.carico.q)} q${sol.groupage.impilati.length ? ', colli impilati' : ''}`);
    if (sol.pallet.length) {
      const conta = {};
      sol.pallet.forEach(a => a.pallets.forEach(pl => { const k = pl.tipo + (pl.maggiorazione ? ` +${pl.maggiorazione}%` : ''); conta[k] = (conta[k] || 0) + a.qty; }));
      tecnico.push('pallet ' + Object.entries(conta).map(([k, n]) => `${n} × ${k}`).join(', '));
    }
    const p = q();
    const esistente = p.items.find(i => i.trasporto);
    const riga = { id: esistente ? esistente.id : nuovoId(), key: null, custom: true, code: '', name: `Trasporto ${tipo} a ${dove}`, power: '', price: sol.R.total, qty: 1, disc: '0',
      dettaglio: servizi.length ? servizi.join(', ').replace(/^./, c => c.toUpperCase()) + '.' : '',
      trasporto: { modo, dest: calc.destLabel(S), totale: sol.R.total, data: oggi(), tecnico: tecnico.join('; ') } };
    if (esistente) Object.assign(esistente, riga); else p.items.push(riga);
    preventivoCambiato();
    disegna();
    toast(`${esistente ? 'Trasporto aggiornato' : 'Trasporto aggiunto'}: ${euro(sol.R.total)}`);
  }

  vista.addEventListener('change', e => {
    const c = q().consegna;
    if (e.target.id === 'cons-regione') { c.reg = e.target.value; c.prov = ''; const r = calc.regById(c.reg); if (r && r.province.length === 1) c.prov = r.province[0].sigla; preventivoCambiato(); disegna(); }
    if (e.target.id === 'cons-provincia') { c.prov = e.target.value; preventivoCambiato(); disegna(); }
    if (e.target.dataset.opz) { c.opts = Object.assign({}, c.opts, { [e.target.dataset.opz]: e.target.checked }); preventivoCambiato(); disegna(); }
  });
  vista.addEventListener('input', e => {
    if (e.target.id === 'cons-dis') { q().consegna.opts = Object.assign({}, q().consegna.opts, { disEur: Math.max(0, T.num(e.target.value)) }); preventivoCambiato(); }
  });
  vista.addEventListener('focusout', e => { if (e.target.id === 'cons-dis') disegna(); });
  vista.addEventListener('click', e => {
    const b = e.target.closest('[data-cons]');
    if (!b) return;
    const d = b.dataset;
    if (d.cons === 'scegli') { ricorda(d.code, { artId: d.art }); disegna(); toast('Abbinamento salvato'); }
    if (d.cons === 'catalogo') foglioCatalogo(d.code, D, disegna);
    if (d.cons === 'manuale') foglioManuale(d.code, D, disegna);
    if (d.cons === 'escludi') { ricorda(d.code, { escluso: true }); disegna(); }
    if (d.cons === 'usa') usa(d.modo);
    if (d.cons === 'vai') {
      const li = vista.querySelector(`#voce-${CSS.escape(d.code)}`);
      if (li) { li.scrollIntoView({ behavior: 'smooth', block: 'center' }); li.focus({ preventScroll: true }); li.classList.add('da-sistemare'); }
    }
    if (d.cons === 'listini') apriFoglio('Listini e aggiornamenti', listiniHTML(D));
    if (d.cons === 'togli-riga') {
      const p = q(); const i = p.items.findIndex(eRigaTrasporto); if (i < 0) return;
      const [tolta] = p.items.splice(i, 1); preventivoCambiato(); disegna();
      toast('Trasporto tolto dal preventivo', { azione: 'Annulla', quandoAzione: () => { p.items.splice(i, 0, tolta); preventivoCambiato(); disegna(); } });
    }
  });
  disegna();
  return collegaRiepilogo(vista);
}
