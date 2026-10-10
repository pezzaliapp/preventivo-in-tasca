# Preventivo in tasca — regole del progetto

Autore unico: **Alessandro Pezzali**. Lingua del progetto: italiano (codice, commenti, commit, interfaccia).

## Cos'è
Una PWA che unisce Listino in tasca, Calcolo trasporti e Calcolo noleggio (Rel01) in un unico
percorso: Prodotti → Consegna → Pagamento → Invia. Ogni strumento funziona anche da solo.
Sorgenti originali in `_sorgenti/` (solo lettura, mai pubblicati).
Note interne solo in locale, mai pubblicate: `_sorgenti/note/MAPPA_FUNZIONI.md` (funzioni delle tre app e dove
vivono) e `_sorgenti/note/DECISIONI.md` (decisioni D-xx e segnalazioni S-xx citate nei commenti del codice).
Guide nella repo: `README.md`, `docs/AGGIORNARE_I_DATI.md`, `docs/GUIDA_PROVA.md`.

## Vincoli permanenti
- Le tre app attuali (listino-in-tasca, calcolo-trasporti, Rel01_noleggio) NON si toccano: né repo,
  né banner, né dati sul telefono. La nuova app è una prova parallela; la decisione è di Alessandro.
- Costo zero: GitHub Pages + GitHub Actions. Nessun server, account, API a pagamento, CDN.
- JavaScript nativo (moduli ES), nessun framework, nessun bundler. Dipendenze a runtime solo in `lib/`.
- Offline-first: ogni modifica ai file dell'app → aggiorna `VERSION` in `sw.js` e `versione.json`.
- Il listino PDF non entra mai nella repo né in rete. `*.pdf` ignorati, tranne `data/noleggio/documenti/`.
- `js/listino/parser.js`: output byte-identico, altrimenti il book agente cifrato non si sblocca.
  `agente.pack.json` e `data/d/*.bin` non si modificano mai a mano.
- Il contenuto del book agente non va mai in stampa o condivisione verso il cliente.
- Dati (coefficienti, tariffe, catalogo) in JSON dentro `data/`, mai cablati nel codice.
- Calcoli in `js/core/` come funzioni pure; ogni modifica ai calcoli richiede test in `tests/`.
- Numeri e coefficienti non si "correggono" senza chiedere ad Alessandro.

## Comandi
- Test: `npm test` (oppure `node --test tests/`: su Node 24 la cartella passa da `tests/index.js`,
  che carica tutti i `tests/*.test.js`; funziona anche `node --test` senza argomenti).
- Rigenerare i golden (solo con `_sorgenti/` presente): `node tests/golden/genera.js`
- Server locale: `python3 -m http.server 8080` oppure `node tests/e2e/server.mjs 8080`, poi http://localhost:8080
- Verifica nel browser: `node tests/e2e/guscio.mjs` (e gli altri script in `tests/e2e/`; accessibilità: `node tests/e2e/accessibilita.mjs`). Usano
  `playwright-core` 1.62.0 (dev) con il Chromium 1234 già installato: niente `playwright install`.
- Icone PNG da `icons/icon.svg`: `node tests/e2e/icone.mjs`

## Stile
- Testi interfaccia: frasi brevi, italiano semplice, nessun gergo. Formati it-IT (1.234,56 €).
- Tocco minimo 48 px, testo base 17 px, contrasto AA, focus visibile.
- Commit piccoli, messaggio in italiano che dice il perché.
- Niente push o pubblicazione senza richiesta esplicita di Alessandro.
