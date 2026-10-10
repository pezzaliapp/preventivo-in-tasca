/*
 * Riepilogo del preventivo sempre visibile a destra, nel percorso, sugli schermi larghi
 * (ritocco G-03): righe, trasporto, totali e rata di noleggio più bassa.
 * Sugli schermi stretti resta la barra del totale in basso.
 */
import { totals, lineNet } from '../core/preventivo.js';
import * as N from '../core/noleggio.js';
import { oggiISO } from '../core/date.js';
import { euro, esc, numero2 } from '../core/formato.js';
import { stato, ascolta, aggiornaViste } from '../stato.js';
import { datiNoleggio } from './noleggio.js';

let datiNol = null;
datiNoleggio().then(d => { datiNol = d; aggiornaViste(); }).catch(() => {});

/**
 * Anteprima del noleggio (D-47): le durate scelte al passo Pagamento con la loro rata, se sono
 * al massimo tre ("Noleggio al mese: 24 mesi 334,12 € · 36 mesi 240,05 €"); se sono di più,
 * la rata più bassa con l'invito a scegliere le durate. `link`: collegamento al passo Pagamento.
 * Restituisce '' se il noleggio non c'è.
 */
export function anteprimaNoleggio(link = false) {
  if (!datiNol || !stato.preventivo) return '';
  const l = N.listinoAttivo(datiNol, oggiISO(new Date(), window.__pit && window.__pit.anteprimaData));
  const op = N.opzionePreventivo(stato.preventivo, datiNol, l);
  if (!op.visibile) return '';
  const periodo = op.modalita === 'trimestrale' ? 'al trimestre' : 'al mese';
  if (op.rate.length <= 3) return `Noleggio ${periodo}: ${op.rate.map(r => `${r.durata} mesi ${numero2(r.rata)} €`).join(' · ')}`;
  const min = op.rate.reduce((a, r) => (r.rata < a.rata ? r : a), op.rate[0]);
  return `Noleggio da ${numero2(min.rata)} € ${periodo} — ${link ? '<a href="#/pagamento">scegli le durate in Pagamento</a>' : 'scegli le durate in Pagamento'}`;
}
export const rataMinimaTesto = () => anteprimaNoleggio(false);

function contenuto() {
  const p = stato.preventivo;
  const t = totals(p, stato.impostazioni.vat);
  const nol = anteprimaNoleggio(true);
  const rata = nol ? `<p class="riep-rata">${nol}</p>` : '';
  return `
    <h2 class="sezione-titolo">Il preventivo</h2>
    ${p.customer ? `<p class="nota">${esc(p.customer)}</p>` : ''}
    ${p.items.length ? `<ul class="riep-righe">${p.items.map(it => `
      <li><span>${it.qty > 1 ? it.qty + ' × ' : ''}${esc(it.code ? it.code + ' ' : '')}${esc(it.name)}</span><span class="v">${euro(lineNet(it, p.globalDisc))}</span></li>`).join('')}</ul>`
      : '<p class="nota">Ancora nessuna riga.</p>'}
    <dl class="righe">
      ${t.disc ? `<div class="riga"><dt>Sconto</dt><dd>− ${euro(t.disc)}</dd></div>` : ''}
      <div class="riga riga-forte"><dt>Totale netto</dt><dd>${euro(t.net)}</dd></div>
      ${p.vatOn ? `<div class="riga"><dt>Con IVA ${esc(stato.impostazioni.vat)}%</dt><dd>${euro(t.total)}</dd></div>` : '<p class="nota">IVA esclusa</p>'}
    </dl>
    ${rata}`;
}

export function riepilogoHTML() {
  return `<aside class="percorso-riepilogo" aria-label="Riepilogo del preventivo"><div class="riep-dentro">${contenuto()}</div></aside>`;
}

/** Tiene aggiornato il riepilogo della schermata; restituisce la funzione per smettere. */
export function collegaRiepilogo(vista) {
  return ascolta(() => { const el = vista.querySelector('.riep-dentro'); if (el) el.innerHTML = contenuto(); });
}
