# Prompt di avvio per Claude Code — "Preventivo in tasca"

> Incolla tutto il testo qui sotto (dalla riga "RUOLO" in giù) come primo messaggio a Claude Code,
> lanciato dentro la cartella della nuova repository. Il file `CLAUDE.md` nella stessa cartella
> contiene le regole permanenti del progetto e viene letto da Claude Code a ogni sessione.

---

## RUOLO

Lavori come un ingegnere software di livello eccezionale: il tipo di programmatore che scrive poco
codice, chiarissimo, che funziona alla prima e che chiunque può mantenere. Preferisci la soluzione
più semplice che risolve davvero il problema. Non aggiungi dipendenze, framework o passaggi di build
se non servono. Misuri prima di cambiare, verifichi dopo aver cambiato, e non dichiari mai finito
qualcosa che non hai provato.

## OBIETTIVO

Unire tre web app esistenti, tutte di Alessandro Pezzali, in **una sola app** chiamata
**"Preventivo in tasca"**, professionale, semplice da usare per chiunque (anche senza esperienza),
che funzioni su smartphone recenti (iPhone, Android) e su computer (Windows, macOS, Linux), anche
offline, a **costo zero** (GitHub Pages + GitHub Actions, nessun server, nessun servizio a pagamento).

Le tre app di partenza sono nella cartella `_sorgenti/` (non va pubblicata, è in `.gitignore`):

| Cartella | App | Cosa fa |
|---|---|---|
| `_sorgenti/listino-in-tasca-main/` | Listino in tasca | Legge il listino PDF in locale (pdf.js), configuratore guidato veicolo → lavoro → esigenze, ricerca, scheda prodotto con pagina PDF, preventivo con sconti in cascata e voci libere, IVA, stampa/PDF/condivisione, archivio in IndexedDB, book agente cifrato AES-GCM con chiave derivata dal listino, disegni cifrati in `data/d/`. |
| `_sorgenti/calcolo-trasporti-main/` | Calcolo trasporti | Catalogo pesi/misure (`articoli.json`), scelta automatica pallet o groupage, destinazione regione/provincia, assicurazione, preavviso, località disagiate, maggiorazioni personali, adeguamento gasolio MIMIT aggiornato da GitHub Action, riepilogo condivisibile, avviso nuova versione. Pagina separata `analisi.html` per l'analisi mensile da Excel (back office). |
| `_sorgenti/Rel01_noleggio-main/` | Calcolo noleggio | Rata noleggio operativo BCC (mensile/trimestrale, 12–60 mesi), fasce di importo, valore di riacquisto, spese contratto, costo giornaliero/orario, listini coefficienti con data di decorrenza automatica (Aprile 2026 → Ottobre 2026 dal 15/10/2026), export TXT, kit documenti BCC in PDF, dark mode. |

### Il flusso che deve nascere dall'unione

Il valore dell'unione è un unico percorso di vendita:

1. **Prodotti** — scelgo le macchine dal listino (configuratore o ricerca) e applico gli sconti.
2. **Consegna** — l'app riconosce le macchine nel catalogo trasporti, mi chiede solo la provincia
   di destinazione e propone il costo di trasporto, che posso aggiungere al preventivo con un tocco.
3. **Pagamento** — accanto al totale vedo subito la rata di noleggio operativo per ogni durata,
   e posso inserirla nel preventivo come alternativa di pagamento.
4. **Invia** — stampo/condivido un unico preventivo (prodotti + trasporto + opzione noleggio) e,
   se serve, apro il kit documenti BCC.

Ogni strumento deve funzionare **anche da solo**: chi non ha caricato il listino deve poter usare
il calcolo trasporti e il calcolo rata esattamente come oggi (in Home: tre grandi pulsanti
"Preventivo completo", "Solo trasporto", "Solo rata noleggio").

## REGOLE NON NEGOZIABILI

0. **Le tre app attuali non si toccano.** Restano online e invariate, indipendentemente da come
   funziona la nuova app. Nessuna modifica alle loro repository, nessun banner, nessun avviso,
   nessun reindirizzamento, nessuna scrittura o cancellazione dei loro dati sul telefono.
   La nuova app è una prova parallela: Alessandro la vede, la prova e poi decide.

1. **Nessuna funzione persa.** Prima di scrivere codice crei `docs/MAPPA_FUNZIONI.md`: l'elenco
   completo di ogni funzione, opzione, testo legale, avviso e dato delle tre app, ciascuna con una
   casella. Alla fine ogni casella deve essere spuntata con il punto in cui vive nella nuova app.
2. **Numeri identici.** I calcoli (rata, spese, VR, fasce, trasporto pallet/groupage, gasolio,
   maggiorazioni, sconti in cascata, IVA, arrotondamenti) devono dare gli stessi risultati delle app
   originali al centesimo. Prima di toccare la logica, la estrai in funzioni pure e scrivi **test di
   riferimento ("golden test")** che registrano i risultati attuali. Il refactoring è finito solo
   quando i test passano.
3. **Privacy del listino invariata.** Il PDF del listino non entra mai nella repo né in rete:
   resta letto in locale e salvato in IndexedDB. `.gitignore` continua a escludere `*.pdf` tranne i
   documenti BCC pubblici (usa un'eccezione esplicita sul loro percorso).
4. **Book agente e disegni cifrati intatti.** La chiave è lo SHA-256 dei codici+prezzi estratti dal
   parser. Quindi l'output di `parser.js` deve restare **byte per byte identico** (stessa
   `PARSER_VERSION`), altrimenti il book non si sblocca più. Copia `agente.pack.json` e `data/d/*.bin`
   senza modificarli. Nulla del book va mai in stampa o in condivisione verso il cliente.
5. **Costo zero e nessuna dipendenza esterna a runtime.** HTML, CSS e JavaScript nativo (moduli ES),
   nessun framework, nessun bundler, nessun CDN. Font Barlow / Barlow Condensed self-hosted (i file
   woff2 sono già in `calcolo-trasporti`). pdf.js 3.11.174 e SheetJS restano in `lib/`.
   Rimuovi Google Fonts. Per Google Analytics (presente in Rel01) **chiedi ad Alessandro** prima
   di decidere: il default che proponi è toglierlo, coerente con "nessun dato esce dal telefono".
6. **Date dei listini.** Rispetta le decorrenze automatiche dei coefficienti BCC (fuso Europe/Rome,
   parametro di anteprima `?data=AAAA-MM-GG`). Le tariffe trasporti mantengono date e storico.
   Tutte le tabelle (coefficienti, tariffe, catalogo) vivono in file JSON in `data/`, così un
   aggiornamento futuro è una modifica a un file dati, non al codice.
7. **Autore unico:** Alessandro Pezzali, in footer, `README.md`, `LICENSE`, manifest e preventivi.

## UX: "A PROVA DI CHIUNQUE"

- Una cosa per schermata, un pulsante principale evidente, testi in italiano semplice
  (niente gergo tecnico: "Dove va consegnato?" invece di "Destinazione").
- Area di tocco minima 48×48 px, testo base 17 px, contrasto WCAG AA, funziona con lo zoom al 200%.
- Barra in basso su telefono (max 5 voci), barra laterale su schermi larghi. Rispetto delle
  safe-area di iPhone.
- Il totale del preventivo è sempre visibile; ogni azione distruttiva chiede conferma ed è
  annullabile.
- Stati vuoti che spiegano cosa fare ("Carica il listino per iniziare" con un pulsante).
- Tema chiaro/scuro automatico più scelta manuale. Un solo sistema di design: unisci i token delle
  due app (stessi font Barlow) in `css/tokens.css`; colore d'accento unico, coerente.
- Tastiera numerica sui campi importo (`inputmode="decimal"`), formati italiani (1.234,56 €).
- Accessibile: etichette vere, focus visibile, navigazione da tastiera, `aria-live` per i totali.

## ARCHITETTURA PROPOSTA (adattala se trovi di meglio, spiegando perché)

```
index.html                 guscio unico, router a hash (#/home, #/prodotti, ...)
manifest.webmanifest       nome, icone, scope ./
sw.js                      cache offline versionata + avviso "Aggiorna"
versione.json
css/tokens.css  css/app.css
js/app.js                  avvio, router, barra di navigazione
js/core/                   SOLO funzioni pure, nessun DOM: testabili in Node
   noleggio.js  trasporti.js  preventivo.js  formato.js  date.js
js/moduli/                 schermate: home, prodotti, trasporto, noleggio,
                           preventivo, archivio, documenti, impostazioni
js/listino/                parser.js, regole.js, cerca.js, agente.js, pdfview.js (portati 1:1)
js/store.js                IndexedDB unico (database nuovo, chiavi con prefisso)
lib/                       pdf.js, xlsx
data/trasporti/*.json  data/noleggio/coefficienti.json  data/noleggio/documenti/*.pdf
data/agente.pack.json  data/d/*.bin
strumenti/analisi.html     analisi mensile trasporti (back office, fuori dal menu principale)
scripts/aggiorna_gasolio.py   .github/workflows/gasolio.yml
tests/                     node --test (golden test + test di integrazione)
docs/                      MAPPA_FUNZIONI.md, DECISIONI.md, AGGIORNARE_I_DATI.md
```

### Abbinamento listino ↔ catalogo trasporti
Il listino usa codici a 8 cifre; il catalogo trasporti usa nomi modello ("TOUCH MEC 2000S").
L'abbinamento avviene **sul telefono**, al volo, con la logica di `cerca.js` (sigle attaccate,
confronto dall'inizio parola). Se l'abbinamento è sicuro lo usi; se è incerto mostri 2–3 proposte e
l'utente sceglie; se manca, l'utente sceglie dal catalogo o inserisce un collo manuale. Le scelte
manuali si ricordano in locale. Non mettere codici o prezzi del listino nella repo.

### Migrazione dalle vecchie app
Le tre app stanno tutte su `pezzaliapp.github.io`: **stessa origine** del nuovo sito. Quindi al primo
avvio la nuova app può leggere i dati esistenti: IndexedDB `listino-in-tasca` (listino, impostazioni,
preventivi salvati, book sbloccato) e localStorage `ct_state`, `ct_adj`, `ct_fuel`, `darkMode`.
Offri "Importa i tuoi dati dalle app precedenti" come scelta dell'utente: l'importazione **legge e
copia soltanto**, non modifica né cancella mai i dati delle vecchie app, che devono continuare a
funzionare esattamente come prima. Usa nomi nuovi e prefissati per i tuoi archivi (es. `pit_*`) e un
service worker con scope limitato alla cartella della nuova app, così non interferisce con le altre.

## PROCEDURA DI LAVORO

Lavora per fasi. Alla fine di ogni fase: test verdi, commit con messaggio chiaro in italiano,
breve resoconto ad Alessandro (cosa è fatto, cosa resta, decisioni prese).

- **Fase 0 — Ricognizione.** Leggi i tre sorgenti per intero. Scrivi `docs/MAPPA_FUNZIONI.md`
  e `docs/DECISIONI.md`. Fai ad Alessandro **in un solo messaggio** le domande aperte:
  a) il trasporto va incluso nell'importo finanziato del noleggio? (proponi: sì, con interruttore);
  b) Google Analytics: togliere o tenere?;
  c) licenza: "Tutti i diritti riservati" (proposta) o MIT come Rel01 oggi?;
  d) colore d'accento preferito (rosso trasporti, giallo listino, blu noleggio).
  Poi aspetta le risposte prima della Fase 3.
- **Fase 1 — Golden test.** Estrai in `js/core/` la logica di calcolo delle tre app senza cambiarla.
  Scrivi test che coprono: tutte le fasce e durate del noleggio per entrambi i listini e il giorno
  di cambio (14/10 e 15/10/2026), mensile e trimestrale; trasporti pallet e groupage per regioni
  diverse incluse isole, multi-prodotto, colli manuali, assicurazione/preavviso/disagiate,
  gasolio on/off, maggiorazioni; sconti in cascata (`30+5`), sconti di riga, IVA, arrotondamenti.
  Per il parser usa testo sintetico come fixture (mai il PDF vero).
- **Fase 2 — Guscio.** index, router, navigazione, design system, service worker, manifest, icone,
  Home con i tre pulsanti. Deve già installarsi e aprirsi offline.
- **Fase 3 — Porting dei moduli** uno alla volta (noleggio → trasporti → listino/preventivo),
  ciascuno usabile da solo, con i test che restano verdi.
- **Fase 4 — Integrazione:** il flusso Prodotti → Consegna → Pagamento → Invia, il preventivo unico
  (stampa A4 pulita, PDF via stampa del browser, testo per WhatsApp/e-mail, export TXT del noleggio
  mantenuto), archivio unico.
- **Fase 5 — Migrazione dati** dalle vecchie app (vedi sopra).
- **Fase 6 — Verifica.** Playwright con il Chromium già installato (gratuito): percorsi completi su
  viewport 375×812 (iPhone), 412×915 (Android), 768×1024 (tablet), 1440×900 (laptop), tema chiaro e
  scuro, offline dopo il primo caricamento. Screenshot di ogni schermata in `docs/screenshot/`.
  Controllo accessibilità (axe-core solo come strumento di sviluppo, non nell'app). Lighthouse PWA.
  Ripassa `MAPPA_FUNZIONI.md` casella per casella.
- **Fase 7 — Versione di prova.** Solo quando Alessandro lo chiede: GitHub Pages dal branch `main`,
  cartella root, sul nuovo indirizzo `pezzaliapp.github.io/preventivo-in-tasca/`, da provare in
  parallelo alle app attuali. Workflow gasolio **copiato** (quello originale resta dov'è).
  `README.md` per l'utente (installazione su iPhone, Android, Windows, macOS, Linux) e
  `docs/AGGIORNARE_I_DATI.md` per Alessandro. Prepara anche `docs/GUIDA_PROVA.md`: cosa provare,
  passo passo, confrontando i risultati con le app attuali. Ogni decisione sul futuro delle vecchie
  app spetta ad Alessandro dopo la prova: non proporre né preparare dismissioni o banner.

## COSA NON FARE

- Non cancellare, rinominare o modificare le tre repository originali, né i loro dati sui dispositivi.
- Non pubblicare nulla (push, Pages, banner) senza che Alessandro lo abbia chiesto.
- Non cambiare numeri, coefficienti o tariffe "perché sembrano sbagliati": segnalali e chiedi.
- Non aggiungere servizi esterni, account, chiavi API o qualsiasi cosa che possa generare costi.
- Non dichiarare una fase conclusa senza aver eseguito i test e guardato le schermate.

Inizia dalla Fase 0.
