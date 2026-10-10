/*
 * Service worker di Preventivo in tasca: copia dei file dell'app per l'uso offline.
 *
 * - Il listino PDF non passa mai di qui: si legge dal file scelto sul telefono e si
 *   salva in IndexedDB. Gli unici PDF in cache sono i documenti pubblici BCC.
 * - File dell'app e dati: prima la rete (tariffe e gasolio nuovi arrivano subito),
 *   la copia salvata se la rete non risponde entro pochi secondi o si è offline.
 * - Font, icone, librerie, documenti e disegni cifrati: prima la copia salvata.
 * - Una versione nuova resta in attesa finché l'utente non tocca "Aggiorna".
 * - Le app precedenti sulla stessa origine, quando si aggiornano, cancellano le cache
 *   altrui: qui si cancellano solo le cache "pit-" vecchie, a ogni apertura si
 *   ricaricano i file mancanti e, offline senza copia, si mostra un messaggio chiaro.
 *
 * A ogni modifica dei file dell'app: aggiornare VERSION qui e in versione.json.
 */
const VERSION = 'pit-0.7.3';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'versione.json',
  'css/tokens.css',
  'css/app.css',
  'js/app.js',
  'js/catalogo.js',
  'js/figure.js',
  'js/migrazione.js',
  'js/stato.js',
  'js/store.js',
  'js/ui.js',
  'js/core/abbinamento.js',
  'js/core/agente.js',
  'js/core/date.js',
  'js/core/formato.js',
  'js/core/listino.js',
  'js/core/migrazione.js',
  'js/core/noleggio.js',
  'js/core/preventivo.js',
  'js/core/trasporti.js',
  'js/moduli/home.js',
  'js/moduli/in-arrivo.js',
  'js/moduli/noleggio.js',
  'js/moduli/documenti.js',
  'js/moduli/trasporto.js',
  'js/moduli/prodotti.js',
  'js/moduli/preventivo-righe.js',
  'js/moduli/agente-viste.js',
  'js/moduli/invia.js',
  'js/moduli/consegna.js',
  'js/moduli/pagamento.js',
  'js/moduli/riepilogo.js',
  'js/moduli/abbinamenti-scelta.js',
  'js/moduli/verifica-abbinamenti.js',
  'js/moduli/archivio.js',
  'js/moduli/impostazioni.js',
  'js/listino/parser.js',
  'js/listino/regole.js',
  'js/listino/cerca.js',
  'js/listino/agente.js',
  'js/listino/pdfview.js',
  'lib/pdf.min.js',
  'lib/pdf.worker.min.js',
  'lib/xlsx.mini.min.js',
  'strumenti/analisi.html',
  'strumenti/analisi.css',
  'strumenti/analisi.js',
  'data/agente.pack.json',
  'data/noleggio/coefficienti.json',
  'data/noleggio/documenti.json',
  'data/noleggio/testi.json',
  'data/trasporti/listini.json',
  'data/trasporti/pallet.json',
  'data/trasporti/groupage.json',
  'data/trasporti/articoli.json',
  'data/trasporti/geo.json',
  'data/trasporti/gasolio.json',
  'data/trasporti/sovrapposizione.json',
  'data/noleggio/documenti/Domanda_NOLEGGIO.pdf',
  'data/noleggio/documenti/Modulo_firma_digitale.pdf',
  'data/noleggio/documenti/Privacy_-_Attestazione_avvenuta_consegna.pdf',
  'data/noleggio/documenti/Scheda_prodotto_NOLEGGIO.pdf',
  'data/noleggio/documenti/Estratto_Lettera_di_Assicurazione.pdf',
  'data/noleggio/documenti/Kit_di_benvenuto_Locazione_Operativa.pdf',
  'data/noleggio/documenti/Fascicolo_antiriciclaggio_oltre_50K.pdf',
  'fonts/barlow-latin-400-normal.woff2',
  'fonts/barlow-latin-500-normal.woff2',
  'fonts/barlow-latin-600-normal.woff2',
  'fonts/barlow-latin-700-normal.woff2',
  'fonts/barlow-condensed-latin-600-normal.woff2',
  'fonts/barlow-condensed-latin-700-normal.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];
const NET_TIMEOUT = 3500;
const APP_FILE = /\.(html|js|mjs|css|json|webmanifest)$/i;

function riempi() {
  return caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))));
}

self.addEventListener('install', e => { e.waitUntil(riempi()); });

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('pit-') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });

// Le app precedenti sulla stessa origine possono svuotare la nostra cache: controllo
// che ci siano tutti i file e ricarico solo quelli mancanti (serve la rete).
async function mancanti() {
  const c = await caches.open(VERSION);
  const presenti = await Promise.all(SHELL.map(u => c.match(u, { ignoreSearch: true })));
  return SHELL.filter((u, i) => !presenti[i]);
}
let riparazione = null;
function ripara() {
  if (riparazione) return riparazione;
  riparazione = (async () => {
    const lista = await mancanti();
    if (!lista.length) return { completa: true, mancanti: 0 };
    const c = await caches.open(VERSION);
    await Promise.all(lista.map(u => fetch(new Request(u, { cache: 'reload' }))
      .then(r => { if (r.ok) return c.put(u, r); }).catch(() => {})));
    const ancora = await mancanti();
    return { completa: !ancora.length, mancanti: ancora.length, riparati: lista.length - ancora.length };
  })().catch(() => ({ completa: false, mancanti: -1 })).finally(() => { riparazione = null; });
  return riparazione;
}

// La pagina chiede lo stato della copia offline (e la ripara se c'è rete).
self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'COPIA_OFFLINE' || !e.ports[0]) return;
  const porta = e.ports[0];
  e.waitUntil((e.data.ripara ? ripara() : mancanti().then(l => ({ completa: !l.length, mancanti: l.length })))
    .then(stato => porta.postMessage(Object.assign({ versione: VERSION }, stato))));
});

// Offline senza la copia della pagina: un messaggio chiaro al posto della pagina bianca.
const SENZA_COPIA = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Preventivo in tasca</title>
<style>body{margin:0;font:17px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#EDF0F2;color:#18222B}
main{max-width:560px;margin:0 auto;padding:48px 20px}h1{font-size:28px;line-height:1.15;margin:0 0 12px}
p{margin:0 0 14px}.b{display:inline-block;margin-top:8px;min-height:48px;padding:12px 20px;border-radius:8px;
background:#FFC20E;border:2px solid #E8AE00;color:#18222B;font-weight:700;font-size:17px}
@media (prefers-color-scheme:dark){body{background:#11171C;color:#E7ECEF}}</style></head>
<body><main><h1>La copia offline non è disponibile</h1>
<p>Su questo dispositivo la copia dell'app per l'uso senza connessione è stata cancellata (succede quando si aggiornano altre app dello stesso sito).</p>
<p><b>I tuoi dati non sono persi:</b> listino, preventivi e impostazioni sono salvati a parte.</p>
<p>Riapri l'app quando c'è connessione: la copia offline si ricostruisce da sola.</p>
<button class="b" onclick="location.reload()">Riprova</button></main></body></html>`;
const paginaSenzaCopia = () => new Response(SENZA_COPIA, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

function salva(req, res) {
  if (res && res.ok && res.type === 'basic') {
    const copia = res.clone();
    caches.open(VERSION).then(c => c.put(req, copia)).catch(() => {});
  }
  return res;
}

function primaLaRete(req, fallbackIndex) {
  return new Promise(resolve => {
    let fatto = false;
    const salvata = () => caches.match(req, { ignoreSearch: true })
      .then(hit => hit || (fallbackIndex ? caches.match('index.html') : null));
    const timer = setTimeout(() => {
      salvata().then(hit => { if (hit && !fatto) { fatto = true; resolve(hit); } });
    }, NET_TIMEOUT);
    fetch(req, { cache: 'no-cache' }).then(res => {
      clearTimeout(timer);
      salva(req, res);
      if (!fatto) { fatto = true; resolve(res); }
    }).catch(() => {
      clearTimeout(timer);
      salvata().then(hit => { if (!fatto) { fatto = true; resolve(hit || (fallbackIndex ? paginaSenzaCopia() : Response.error())); } });
    });
  });
}

function primaLaCopia(req) {
  return caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => salva(req, res)));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Nessun PDF in cache tranne i documenti BCC pubblici (il listino non è mai in rete).
  if (/\.pdf$/i.test(url.pathname) && !url.pathname.includes('/data/noleggio/documenti/')) return;

  if (req.mode === 'navigate') {
    e.respondWith(primaLaRete(req, true));
    e.waitUntil(ripara()); // autoriparazione a ogni apertura (se c'è rete)
    return;
  }
  if (APP_FILE.test(url.pathname)) { e.respondWith(primaLaRete(req, false)); return; }
  e.respondWith(primaLaCopia(req));
});
