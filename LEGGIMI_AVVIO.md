# Come partire (10 minuti)

1. **Crea la repository su GitHub**
   - Nome: `preventivo-in-tasca` · Owner: `pezzaliapp` · **Public** (GitHub Pages è gratis solo
     sulle repo pubbliche) · senza README (lo crea Claude Code).

2. **Clona e prepara la cartella sul computer**
   ```bash
   git clone https://github.com/pezzaliapp/preventivo-in-tasca.git
   cd preventivo-in-tasca
   mkdir _sorgenti
   ```
   Scompatta dentro `_sorgenti/` i tre zip, così da avere:
   ```
   _sorgenti/listino-in-tasca-main/
   _sorgenti/calcolo-trasporti-main/
   _sorgenti/Rel01_noleggio-main/
   ```
   Elimina le eventuali cartelle `__MACOSX`.

3. **Copia nella cartella** i file `CLAUDE.md` e `PROMPT_CLAUDE_CODE.md` di questo kit, e crea
   `.gitignore` con almeno:
   ```
   _sorgenti/
   *.pdf
   *.PDF
   !data/noleggio/documenti/*.pdf
   *.source.json
   build-pack.js
   privato/
   disegni.map.json
   LEGGIMI-PRIVATO.txt
   .DS_Store
   node_modules/
   ```

4. **Avvia Claude Code** nella cartella (`claude`) e incolla come primo messaggio il contenuto di
   `PROMPT_CLAUDE_CODE.md` dalla riga "RUOLO" in giù.
   Consiglio: fallo partire in **modalità piano** (Shift+Tab) per la Fase 0, così vedi la mappa delle
   funzioni e rispondi alle 4 domande prima che scriva codice.

5. **Le tre app attuali restano come sono**, qualunque cosa succeda con la nuova: Claude Code ha
   l'ordine di non toccarle. La nuova app vivrà a un indirizzo separato
   (`pezzaliapp.github.io/preventivo-in-tasca/`): la provi accanto alle vecchie, confronti i
   risultati con `docs/GUIDA_PROVA.md`, e poi decidi tu.
