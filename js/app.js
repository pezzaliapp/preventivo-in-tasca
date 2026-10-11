/*
 * Preventivo in tasca — avvio, router a hash, navigazione, totale sempre visibile,
 * tema e avviso di nuova versione.
 */
import { stato, caricaStato, ascolta, totaleCorrente, salvaTutto, seSalvataggioFallisce } from './stato.js';
import { Pref } from './store.js';
import { icona, toast } from './ui.js';
import { euro } from './core/formato.js';
import { dataDaIndirizzo } from './core/date.js';
import { caricaListinoSalvato, ascoltaListino, listino } from './catalogo.js';
import { rataMinimaTesto } from './moduli/riepilogo.js';
import { collegaAgente } from './moduli/agente-viste.js';

export const VERSIONE = '0.7.4';

/* Rotte: modulo da caricare e posizione nel percorso del preventivo. */
const ROTTE = {
  home: { titolo: 'Home', modulo: './moduli/home.js', nav: 'home' },
  prodotti: { titolo: 'Prodotti', modulo: './moduli/prodotti.js', passo: 'prodotti', nav: 'preventivo', descrizione: 'Scegli le macchine dal listino con il configuratore o la ricerca.' },
  consegna: { titolo: 'Consegna', modulo: './moduli/consegna.js', passo: 'consegna', nav: 'preventivo', descrizione: 'Dove va consegnato? Il costo del trasporto si calcola da solo.' },
  pagamento: { titolo: 'Pagamento', modulo: './moduli/pagamento.js', passo: 'pagamento', nav: 'preventivo', descrizione: 'La rata di noleggio operativo per ogni durata, accanto al totale.' },
  invia: { titolo: 'Invia', modulo: './moduli/invia.js', passo: 'invia', nav: 'preventivo', descrizione: 'Stampa o condividi il preventivo unico.' },
  trasporto: { titolo: 'Solo trasporto', modulo: './moduli/trasporto.js', nav: 'home', descrizione: 'Quanto costa spedire? Scegli i prodotti e dove vanno consegnati.' },
  noleggio: { titolo: 'Solo rata noleggio', modulo: './moduli/noleggio.js', nav: 'home', descrizione: 'Rata del noleggio operativo BCC per un importo.' },
  archivio: { titolo: 'Archivio', modulo: './moduli/archivio.js', nav: 'archivio', descrizione: 'I preventivi salvati su questo dispositivo.' },
  documenti: { titolo: 'Documenti BCC', modulo: './moduli/documenti.js', nav: 'documenti', descrizione: 'Kit Noleggio Operativo: moduli per la pratica.' },
  abbinamenti: { titolo: 'Verifica abbinamenti trasporto', modulo: './moduli/verifica-abbinamenti.js', nav: 'impostazioni', descrizione: 'Macchine del listino e pesi e misure per il trasporto.' },
  impostazioni: { titolo: 'Impostazioni', modulo: './moduli/impostazioni.js', nav: 'impostazioni', descrizione: 'Listino, intestazione del preventivo, tema e dati.' }
};
const NAV = [
  { id: 'home', rotta: 'home', nome: 'Home', icona: 'casa' },
  { id: 'preventivo', rotta: 'prodotti', nome: 'Preventivo', icona: 'preventivo' },
  { id: 'archivio', rotta: 'archivio', nome: 'Archivio', icona: 'archivio' },
  { id: 'documenti', rotta: 'documenti', nome: 'Documenti', icona: 'documenti' },
  { id: 'impostazioni', rotta: 'impostazioni', nome: 'Opzioni', icona: 'impostazioni' }
];

export const app = {
  versione: VERSIONE,
  rotta: null,
  barraModulo: null,
  /** Un modulo mostra il proprio totale nella barra in basso: { etichetta, importo, vai, href, azione, soloStretto } o null.
   soloStretto: nascosta sugli schermi larghi, dove il riepilogo è già sempre visibile. */
  barra(b, schermata) {
    if (schermata && !schermata.isConnected) return; // la schermata non c'è più (l'utente è andato altrove)
    this.barraModulo = b; aggiornaBarraTotale();
  },
  copiaOffline: null,
  /** Data di anteprima da ?data=AAAA-MM-GG (listini a decorrenza), oppure null. */
  anteprimaData: dataDaIndirizzo(location.search),
  vai(rotta) { location.hash = '#/' + rotta; }
};
window.__pit = app; // per le verifiche automatiche

const $ = s => document.querySelector(s);

/* ---------- Tema: automatico, chiaro o scuro ---------- */
export function applicaTema(scelta = Pref.get('tema', 'auto')) {
  const root = document.documentElement;
  if (scelta === 'chiaro') root.dataset.theme = 'light';
  else if (scelta === 'scuro') root.dataset.theme = 'dark';
  else delete root.dataset.theme;
  const scuro = scelta === 'scuro' || (scelta !== 'chiaro' && matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', scuro ? '#0E1418' : '#18222B');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applicaTema());

/* ---------- Navigazione ---------- */
function disegnaNav() {
  $('#navigazione').innerHTML = NAV.map(v => `
    <a class="nav-voce" href="#/${v.rotta}" data-nav="${v.id}">${icona(v.icona, 26)}<span>${v.nome}</span></a>`).join('');
}
function evidenziaNav(id) {
  document.querySelectorAll('.nav-voce').forEach(a => {
    if (a.dataset.nav === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

/* ---------- Totale del preventivo sempre visibile ---------- */
function aggiornaBarraTotale() {
  const barra = $('#barra-totale');
  const r = ROTTE[app.rotta] || {};
  // Gli strumenti "solo" (trasporto, noleggio) mostrano qui il proprio totale
  barra.classList.toggle('solo-stretto', !!(app.barraModulo && app.barraModulo.soloStretto));
  if (app.barraModulo) {
    const b = app.barraModulo;
    if ($('#bt-rata')) $('#bt-rata').hidden = true;
    barra.hidden = !b.importo;
    if (!b.importo) return;
    barra.setAttribute('href', b.href || '#');
    $('#bt-etichetta').textContent = b.etichetta;
    $('#bt-importo').textContent = b.importo;
    $('#barra-totale .bt-vai').hidden = !b.vai;
    $('#barra-totale .bt-vai').textContent = b.vai || '';
    return;
  }
  barra.setAttribute('href', '#/invia');
  $('#barra-totale .bt-vai').textContent = 'Vedi';
  // nel percorso, sugli schermi larghi, il riepilogo è già sempre visibile a destra
  barra.classList.toggle('solo-stretto', !!r.passo);
  const t = totaleCorrente();
  const mostra = !!stato.preventivo && (t.lines > 0 || !!r.passo);
  barra.hidden = !mostra;
  document.body.classList.toggle('con-totale', mostra);
  if (!mostra) return;
  $('#bt-etichetta').textContent = t.lines
    ? `Preventivo, ${t.lines} ${t.lines === 1 ? 'articolo' : 'articoli'} (netto${stato.preventivo.vatOn ? ' imponibile' : ', IVA esclusa'})`
    : 'Preventivo vuoto';
  const rata = t.lines ? rataMinimaTesto() : '';
  $('#bt-importo').textContent = euro(t.net);
  let r2 = $('#bt-rata');
  if (!r2) { r2 = document.createElement('span'); r2.id = 'bt-rata'; r2.className = 'bt-rata'; r2.setAttribute('aria-live', 'polite'); $('#barra-totale .bt-testo').appendChild(r2); }
  r2.textContent = rata;
  r2.hidden = !rata;
  $('#barra-totale .bt-vai').hidden = !t.lines;
}

/* ---------- Router ---------- */
let generazione = 0;
let primoGiro = true;
async function mostraRotta() {
  const parti = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
  const nome = parti[0] || 'home';
  app.sotto = parti[1] || '';
  const rotta = ROTTE[nome] ? nome : 'home';
  if (!ROTTE[nome] && location.hash) { history.replaceState(null, '', '#/home'); }
  const r = ROTTE[rotta];
  const mia = ++generazione;
  app.rotta = rotta;
  evidenziaNav(r.nav);
  aggiornaBarraTotale();
  document.title = rotta === 'home' ? 'Preventivo in tasca' : `${r.titolo} · Preventivo in tasca`;
  const vista = $('#vista');
  try {
    const mod = await import(r.modulo || './moduli/in-arrivo.js');
    if (mia !== generazione) return; // nel frattempo l'utente è andato altrove
    if (app.smonta) { try { app.smonta(); } catch (e) { console.error(e); } app.smonta = null; }
    app.barraModulo = null;
    vista.className = 'contenuto';
    aggiornaBarraTotale();
    // contenitore nuovo per ogni schermata: gli ascoltatori dei moduli spariscono con lei
    const box = document.createElement('div');
    box.className = 'schermata';
    vista.replaceChildren(box);
    app.smonta = (await mod.mostra(box, app, r)) || null;
  } catch (e) {
    console.error(e);
    vista.innerHTML = `<h1 class="titolo" tabindex="-1">Questa parte non si è caricata</h1>
      <p class="sottotitolo">Se sei senza connessione, la copia dell'app per l'uso offline è incompleta (succede quando si aggiornano altre app dello stesso sito). Riapri l'app quando c'è connessione: la copia si ricostruisce da sola.</p>
      <p class="sottotitolo"><b>I tuoi dati non sono persi:</b> restano salvati su questo dispositivo.</p>
      <p class="sezione"><button type="button" class="btn btn-primario" onclick="location.reload()">Riprova</button></p>`;
  }
  window.scrollTo(0, 0);
  // cambiando schermata il focus va sul titolo, così il lettore di schermo la annuncia
  const h1 = vista.querySelector('h1');
  if (h1 && !primoGiro) h1.focus({ preventScroll: true });
  primoGiro = false;
}

/* ---------- Nuova versione: avviso unico "Aggiorna" ---------- */
function avvisoAggiornamento(reg) {
  const bar = $('#aggiorna');
  bar.hidden = false;
  $('#aggiorna-ora').onclick = () => {
    salvaTutto();
    const w = reg.waiting;
    if (w) w.postMessage({ type: 'SKIP_WAITING' }); else location.reload();
  };
  $('#aggiorna-dopo').onclick = () => { bar.hidden = true; };
}
/* ---------- Copia offline: stato e autoriparazione ---------- */
// Chiede al service worker se la copia offline è completa e prova a ripararla (serve la rete).
export function statoCopiaOffline(ripara = true) {
  const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
  if (!sw) return Promise.resolve({ completa: false, mancanti: -1, senzaServiceWorker: true });
  return new Promise(resolve => {
    const canale = new MessageChannel();
    const timer = setTimeout(() => resolve({ completa: false, mancanti: -1 }), 20000);
    canale.port1.onmessage = e => { clearTimeout(timer); resolve(e.data); };
    sw.postMessage({ type: 'COPIA_OFFLINE', ripara }, [canale.port2]);
  });
}
async function controllaCopiaOffline() {
  const st = await statoCopiaOffline();
  app.copiaOffline = st;
  if (st.riparati > 0 && st.completa) toast('Copia offline ripristinata');
  // se dopo il tentativo di riparazione mancano ancora file, la rete non c'è
  if (!st.completa && st.mancanti > 0) {
    toast('Copia offline incompleta: alcune parti potrebbero non aprirsi. Riapri l\'app con la connessione.', { durata: 8000 });
  }
}

function registraServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  // Si ricarica solo quando una versione nuova sostituisce quella attiva (dopo "Aggiorna"),
  // non alla prima installazione: chi sta già scrivendo non perde nulla.
  const avevaVersione = !!navigator.serviceWorker.controller;
  let ricaricato = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!avevaVersione || ricaricato) return;
    ricaricato = true;
    salvaTutto();
    setTimeout(() => location.reload(), 150);
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    const controlla = () => { if (reg.waiting && navigator.serviceWorker.controller) avvisoAggiornamento(reg); };
    controlla();
    navigator.serviceWorker.ready.then(() => { if (navigator.serviceWorker.controller) controllaCopiaOffline(); });
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') controlla(); });
    });
    // controlla aggiornamenti quando l'app torna in primo piano e ogni 5 minuti mentre è aperta (come i trasporti);
    // se c'è una versione nuova compare l'avviso "Aggiorna": nessuna ricarica automatica (D-08)
    const cercaVersione = () => { if (document.visibilityState === 'visible' && navigator.onLine !== false) reg.update().catch(() => {}); };
    document.addEventListener('visibilitychange', cercaVersione);
    setInterval(cercaVersione, 5 * 60 * 1000);
  }).catch(() => {});
}

/* ---------- Avvio ---------- */
async function avvia() {
  applicaTema();
  disegnaNav();
  ascolta(aggiornaBarraTotale);
  $('#barra-totale').addEventListener('click', e => {
    const azione = app.barraModulo && app.barraModulo.azione;
    if (azione) { e.preventDefault(); azione(); }
  });
  window.addEventListener('hashchange', mostraRotta);
  collegaAgente(app); // un solo ascoltatore per i pulsanti del book, su ogni schermata e finestra
  await Promise.all([caricaStato(), caricaListinoSalvato()]);
  ascoltaListino(() => { if (listino.appenaSbloccato) { listino.appenaSbloccato = false; toast('Book dell\'agente sbloccato'); } });
  if (!stato.archivioDisponibile) toast('Archivio locale non disponibile in questa modalità del browser');
  seSalvataggioFallisce(() => toast('Non riesco a salvare sul dispositivo: lo spazio potrebbe essere pieno. I dati restano finché l\'app è aperta.', { durata: 9000 }));
  await mostraRotta();
  registraServiceWorker();
  document.documentElement.classList.add('pronta');
}
avvia();
