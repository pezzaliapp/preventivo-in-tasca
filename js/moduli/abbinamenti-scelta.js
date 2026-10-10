/*
 * Abbinamenti listino ↔ catalogo trasporti: stato di un articolo, scelte ricordate sul
 * dispositivo (pit_abbinamenti, per codice del listino) e finestre per cambiarle.
 * Usato dal passo Consegna e dalla pagina "Verifica abbinamenti trasporto".
 */
import * as T from '../core/trasporti.js';
import { abbina } from '../core/abbinamento.js';
import { esc } from '../core/formato.js';
import { Pref } from '../store.js';
import { apriFoglio, chiudiFoglio, toast } from '../ui.js';

export const ricordati = () => Pref.get('abbinamenti', {}) || {};
export function ricorda(code, scelta) {
  const r = ricordati();
  if (scelta) r[code] = scelta; else delete r[code];
  Pref.set('abbinamenti', r);
}

/**
 * Come viaggia un articolo del listino.
 * stato: 'art' (origine 'sicuro' o 'scelto') | 'manuale' | 'escluso' | 'da-scegliere' (proposte, anche vuote).
 */
export function statoAbbinamento(item, famiglia, articoli, accessorio, r = ricordati()) {
  const scelta = r[item.code];
  if (scelta && scelta.artId && articoli.some(a => a.id === scelta.artId)) return { stato: 'art', artId: scelta.artId, origine: 'scelto' };
  if (scelta && scelta.manual) return { stato: 'manuale', manual: scelta.manual };
  if (scelta && scelta.escluso) return { stato: 'escluso' };
  const a = abbina(item, famiglia, articoli);
  if (a.esito === 'sicuro') return { stato: 'art', artId: a.articolo.id, origine: 'sicuro', proposte: a.proposte };
  // un accessorio senza abbinamento sicuro di solito viaggia con la macchina
  if (accessorio) return { stato: 'escluso', accessorio: true, proposte: a.proposte };
  return { stato: 'da-scegliere', proposte: a.proposte };
}

/** Peso e imballo di un articolo del catalogo trasporti, in parole. */
export function pesoImballo(a) {
  const kg = T.totKg(a);
  const imballi = a.colli ? [...new Set(a.colli.map(c => c.imballo).filter(Boolean))] : [];
  const pezzi = a.colli ? T.pieces(a) : [];
  const misure = pezzi.length === 1 ? `${pezzi[0].l}×${pezzi[0].p}×${pezzi[0].h} cm` : pezzi.length > 1 ? `${pezzi.length} colli` : (a.misure && a.misure.every(x => x > 0) ? a.misure.join('×') + ' cm' : '');
  return [kg ? `${Math.round(kg).toLocaleString('it-IT')} kg` : 'peso non indicato', imballi.length ? `imballo ${imballi.join(', ')}` : a.pallet ? `pallet ${a.pallet}` : '', misure].filter(Boolean).join(' · ');
}

/** Finestra: scegli l'articolo del catalogo per un codice del listino. `dopo` ridisegna. */
export function foglioCatalogo(code, D, dopo, titolo = '') {
  const corpo = apriFoglio('Scegli dal catalogo pesi e misure', `
    ${titolo ? `<p class="sottotitolo">${esc(titolo)}</p>` : ''}
    <div class="campo"><label class="campo-etichetta" for="cat-q">Cerca</label><input id="cat-q" class="input" autocomplete="off" placeholder="Es. MEC 1000 o F 535"></div>
    <ul class="articoli articoli-piatti" id="cat-lista"></ul>
    <div class="azioni sezione"><button type="button" class="btn btn-secondario" data-scelta="manuale">Collo manuale</button><button type="button" class="btn btn-secondario" data-scelta="escludi">Escludi dal trasporto</button><button type="button" class="btn btn-secondario" data-scelta="auto">Abbinamento automatico</button></div>`);
  const lista = corpo.querySelector('#cat-lista');
  const riempi = () => {
    const voci = T.filtraArticoli(D.articoli, '', corpo.querySelector('#cat-q').value).slice(0, 60);
    lista.innerHTML = voci.map(a => `<li class="articolo"><button type="button" class="articolo-apri" data-scelta="art" data-art="${esc(a.id)}"><span class="articolo-nome">${esc(a.nome)}</span><span class="nota">${esc(a.categoria)} · ${esc(pesoImballo(a))}</span></button></li>`).join('') || '<li class="vuoto-breve">Nessun articolo trovato.</li>';
  };
  corpo.querySelector('#cat-q').addEventListener('input', riempi);
  riempi();
  corpo.addEventListener('click', async e => {
    const b = e.target.closest('[data-scelta]');
    if (!b) return;
    const azione = b.dataset.scelta;
    if (azione === 'art') { ricorda(code, { artId: b.dataset.art }); await chiudiFoglio(); dopo(); toast('Abbinamento salvato'); }
    if (azione === 'escludi') { ricorda(code, { escluso: true }); await chiudiFoglio(); dopo(); }
    if (azione === 'auto') { ricorda(code, null); await chiudiFoglio(); dopo(); }
    if (azione === 'manuale') { await chiudiFoglio(); foglioManuale(code, D, dopo); }
  });
}

/** Finestra: collo non a catalogo (pallet o groupage) per un codice del listino. */
export function foglioManuale(code, D, dopo) {
  const calc = T.creaTrasporti(D);
  const corpo = apriFoglio('Collo manuale', `
    <fieldset class="gruppo" style="margin-top:0"><legend>Tipo di collo</legend><div class="segmenti">
      <label class="seg-voce"><input type="radio" name="cm-tipo" value="pallet" checked><span>Pallet</span></label>
      <label class="seg-voce"><input type="radio" name="cm-tipo" value="groupage"><span>Groupage</span></label></div></fieldset>
    <div class="campo" id="cm-pallet"><label class="campo-etichetta" for="cm-pt">Tipo di pallet</label>
      <select id="cm-pt" class="select">${D.pallet.tipi.map(t => `<option value="${esc(t.id)}" ${t.id === 'MEDIUM' ? 'selected' : ''}>${esc(t.id)} — ${esc(calc.palletDesc(t.id))}</option>`).join('')}</select></div>
    <div class="due" id="cm-gr" hidden>
      <div class="campo"><label class="campo-etichetta" for="cm-ml">Metri lineari</label><input id="cm-ml" class="input" inputmode="decimal" value="3"></div>
      <div class="campo"><label class="campo-etichetta" for="cm-q">Peso (quintali)</label><input id="cm-q" class="input" inputmode="decimal" value="5"></div>
      <div class="campo"><label class="campo-etichetta" for="cm-b">Bancali 80×120</label><input id="cm-b" class="input" inputmode="numeric" value="1"></div>
    </div>
    <p class="campo-errore" id="cm-err" role="alert"></p>
    <button type="button" class="btn btn-primario btn-largo sezione" id="cm-ok">Usa questo collo</button>`);
  corpo.addEventListener('change', e => { if (e.target.name === 'cm-tipo') { corpo.querySelector('#cm-pallet').hidden = e.target.value !== 'pallet'; corpo.querySelector('#cm-gr').hidden = e.target.value !== 'groupage'; } });
  corpo.querySelector('#cm-ok').addEventListener('click', async () => {
    const tipo = corpo.querySelector('input[name="cm-tipo"]:checked').value;
    const manual = tipo === 'pallet' ? { type: 'pallet', pallet: corpo.querySelector('#cm-pt').value }
      : { type: 'groupage', ml: Math.max(0, T.num(corpo.querySelector('#cm-ml').value)), q: Math.max(0, T.num(corpo.querySelector('#cm-q').value)), b: Math.max(0, Math.round(T.num(corpo.querySelector('#cm-b').value))) };
    if (manual.type === 'groupage' && !(manual.ml || manual.q || manual.b)) { corpo.querySelector('#cm-err').textContent = 'Indica almeno metri, peso o bancali'; return; }
    ricorda(code, { manual });
    await chiudiFoglio(); dopo(); toast('Collo salvato');
  });
}
