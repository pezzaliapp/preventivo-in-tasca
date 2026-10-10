/*
 * Verifica abbinamenti trasporto (da Opzioni): con il listino caricato, tutte le macchine
 * (non gli accessori) con lo stato dell'abbinamento al catalogo pesi e misure, l'articolo
 * collegato con peso e imballo, il filtro "solo da controllare" e "Cambia" su ogni riga.
 */
import * as T from '../core/trasporti.js';
import { esc } from '../core/formato.js';
import { listino } from '../catalogo.js';
import { Pref } from '../store.js';
import { piede } from '../ui.js';
import { datiTrasporti } from './trasporto.js';
import { ricordati, ricorda, statoAbbinamento, pesoImballo, foglioCatalogo } from './abbinamenti-scelta.js';

const ETICHETTE = {
  sicuro: ['etichetta-ok', 'Abbinato'], scelto: ['', 'Scelto a mano'], manuale: ['', 'Collo manuale'],
  escluso: ['etichetta-info', 'Escluso'], 'da-scegliere': ['etichetta-warn', 'Da scegliere'], 'non-trovato': ['etichetta-warn', 'Non trovato']
};
const tipo = s => s.stato === 'art' ? s.origine : s.stato === 'da-scegliere' ? (s.proposte.length ? 'da-scegliere' : 'non-trovato') : s.stato;

export async function mostra(vista, app) {
  vista.innerHTML = `<h1 class="titolo" tabindex="-1">Verifica abbinamenti trasporto</h1><p class="sottotitolo">Carico il catalogo pesi e misure…</p>`;
  if (!listino.catalog) {
    vista.innerHTML = `<h1 class="titolo" tabindex="-1">Verifica abbinamenti trasporto</h1>
      <section class="riquadro vuoto sezione"><h2 class="titolo">Serve il listino</h2><p class="sottotitolo">Carica il listino PDF: qui compariranno tutte le macchine con il loro abbinamento ai pesi e misure.</p>
      <a class="btn btn-primario" href="#/impostazioni">Vai a Opzioni</a></section>${piede(app.versione)}`;
    return;
  }
  let D;
  try { D = await datiTrasporti(); }
  catch (e) { vista.innerHTML = `<h1 class="titolo" tabindex="-1">Verifica abbinamenti trasporto</h1><p class="avviso avviso-errore sezione" role="alert">Catalogo pesi e misure non disponibile. Riapri l'app con la connessione.</p>`; return; }
  const artById = id => D.articoli.find(a => a.id === id);
  let soloDaControllare = !!Pref.get('verifica_solo', false);

  function disegna() {
    const r = ricordati();
    const cat = listino.catalog;
    // una riga per codice (lo stesso codice con alimentazioni diverse viaggia uguale)
    const visti = new Set();
    const macchine = cat.products.filter(p => !p.accessory && !visti.has(p.code) && visti.add(p.code));
    const righe = macchine.map(p => { const s = statoAbbinamento(p, cat.families[p.family] || {}, D.articoli, false, r); return { p, s, t: tipo(s) }; });
    const conta = k => righe.filter(x => x.t === k).length;
    const daControllare = conta('da-scegliere') + conta('non-trovato');
    const mostrate = soloDaControllare ? righe.filter(x => x.t === 'da-scegliere' || x.t === 'non-trovato') : righe;
    vista.innerHTML = `
      <h1 class="titolo" tabindex="-1">Verifica abbinamenti trasporto</h1>
      <p class="sottotitolo">Ogni macchina del listino e l'articolo del catalogo pesi e misure usato per il trasporto. Le scelte si ricordano su questo dispositivo.</p>
      <section class="riquadro sezione" aria-live="polite">
        <div class="conteggi">
          <p><b class="grande-medio">${righe.length}</b><br>macchine</p>
          <p><b class="grande-medio">${conta('sicuro')}</b><br>abbinate da sole</p>
          <p><b class="grande-medio">${conta('scelto') + conta('manuale') + conta('escluso')}</b><br>scelte a mano</p>
          <p class="${daControllare ? 'conteggio-warn' : ''}"><b class="grande-medio">${daControllare}</b><br>da controllare</p>
        </div>
        <p class="nota sezione-stretta">Da controllare: ${conta('da-scegliere')} con proposte da scegliere, ${conta('non-trovato')} non trovate nel catalogo.</p>
        <label class="interruttore"><input type="checkbox" id="ver-solo" ${soloDaControllare ? 'checked' : ''}><span class="int-ui" aria-hidden="true"></span><span class="int-testo"><strong>Solo da controllare</strong></span></label>
      </section>
      ${mostrate.length ? `<ul class="carico">${mostrate.map(({ p, s, t }) => {
        const a = s.artId ? artById(s.artId) : null;
        const [cls, et] = ETICHETTE[t];
        const fam = cat.families[p.family] || {};
        const collegato = a ? `<b>${esc(a.nome)}</b> · ${esc(pesoImballo(a))}`
          : s.stato === 'manuale' ? (s.manual.type === 'pallet' ? `Pallet ${esc(s.manual.pallet)}` : `Groupage ${T.num(s.manual.ml)} m, ${T.num(s.manual.q)} q, ${s.manual.b} bancali`)
          : s.stato === 'escluso' ? 'Non conta nel trasporto.'
          : s.proposte.length ? `Proposte: ${s.proposte.map(c => esc(c.art.nome)).join(' · ')}` : 'Non è nel catalogo pesi e misure.';
        return `<li class="collo cons-voce" data-svc="${t === 'da-scegliere' || t === 'non-trovato' ? 'quote' : ''}">
          <div class="collo-info"><div class="collo-nome">${esc(p.code)} ${esc(p.name)}</div>
            <div class="nota">${esc(fam.title || '')}${fam.page ? `, pag. ${fam.page}` : ''}</div>
            <div class="collo-meta"><span class="etichetta ${cls}">${et}</span> ${collegato}</div></div>
          <div class="cons-azioni">
            ${t === 'da-scegliere' ? s.proposte.map(c => `<button type="button" class="btn btn-secondario btn-piccolo" data-ver="scegli" data-code="${esc(p.code)}" data-art="${esc(c.art.id)}">${esc(c.art.nome)}</button>`).join('') : ''}
            <button type="button" class="btn btn-secondario btn-piccolo" data-ver="cambia" data-code="${esc(p.code)}" data-nome="${esc(p.code + ' ' + p.name)}">Cambia</button>
          </div></li>`;
      }).join('')}</ul>` : '<p class="vuoto-breve">Niente da controllare: tutte le macchine sono abbinate.</p>'}
      ${piede(app.versione)}`;
  }

  vista.addEventListener('change', e => { if (e.target.id === 'ver-solo') { soloDaControllare = e.target.checked; Pref.set('verifica_solo', soloDaControllare); disegna(); } });
  vista.addEventListener('click', e => {
    const b = e.target.closest('[data-ver]');
    if (!b) return;
    if (b.dataset.ver === 'scegli') { ricorda(b.dataset.code, { artId: b.dataset.art }); disegna(); }
    if (b.dataset.ver === 'cambia') foglioCatalogo(b.dataset.code, D, disegna, b.dataset.nome);
  });
  disegna();
}
