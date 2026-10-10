# Preventivo in tasca — regole del progetto

Autore unico: **Alessandro Pezzali**. Lingua del progetto: italiano (codice, commenti, commit, interfaccia).

## Cos'è
Una PWA che unisce Listino in tasca, Calcolo trasporti e Calcolo noleggio (Rel01) in un unico
percorso: Prodotti → Consegna → Pagamento → Invia. Ogni strumento funziona anche da solo.
Sorgenti originali in `_sorgenti/` (solo lettura, mai pubblicati).

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
- Test: `node --test tests/`
- Server locale: `python3 -m http.server 8080` poi http://localhost:8080
- Verifica visiva: script Playwright in `tests/e2e/` (Chromium già installato, niente `playwright install`)

## Stile
- Testi interfaccia: frasi brevi, italiano semplice, nessun gergo. Formati it-IT (1.234,56 €).
- Tocco minimo 48 px, testo base 17 px, contrasto AA, focus visibile.
- Commit piccoli, messaggio in italiano che dice il perché.
- Niente push o pubblicazione senza richiesta esplicita di Alessandro.
