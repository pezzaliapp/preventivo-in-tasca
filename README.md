# Preventivo in tasca

Prodotti dal listino, trasporto e rata di noleggio in un unico preventivo, anche senza connessione.

Il percorso è in quattro passi: **Prodotti → Consegna → Pagamento → Invia**.
Ogni strumento funziona anche da solo: dalla Home scegli **Solo trasporto** o **Solo rata noleggio**.

**Indirizzo:** https://pezzaliapp.github.io/preventivo-in-tasca/

È una versione di prova. Listino in tasca, Calcolo trasporti e Calcolo noleggio restano come sono e continuano a
funzionare.

---

## Installarla

L'app si installa dal browser, senza store e senza account. Dopo la prima apertura funziona anche offline.

### iPhone e iPad (Safari)
1. Apri l'indirizzo con **Safari**.
2. Tocca il pulsante **Condividi** (il quadrato con la freccia in su).
3. Scorri e tocca **Aggiungi alla schermata Home**, poi **Aggiungi**.
4. Apri l'app dall'icona nella schermata Home.

### Android (Chrome)
1. Apri l'indirizzo con **Chrome**.
2. Tocca **Installa** nel messaggio in basso, oppure il menu **⋮** e poi **Installa app**
   (su alcuni telefoni: **Aggiungi a schermata Home**).
3. Conferma. L'icona compare tra le app.

### Windows (Chrome o Edge)
1. Apri l'indirizzo con **Chrome** o **Edge**.
2. Clicca l'icona di installazione nella barra dell'indirizzo (un monitor con la freccia), oppure:
   - Chrome: menu **⋮** › **Trasmetti, salva e condividi** › **Installa pagina come app**;
   - Edge: menu **…** › **App** › **Installa questo sito come app**.
3. L'app compare nel menu Start e si può fissare sulla barra delle applicazioni.

### macOS
- **Safari** (macOS Sonoma o successivo): menu **File** › **Aggiungi al Dock**.
- **Chrome** o **Edge**: icona di installazione nella barra dell'indirizzo, come su Windows.

### Linux (Chrome, Chromium o Edge)
1. Apri l'indirizzo con **Chrome**, **Chromium** o **Edge**.
2. Clicca l'icona di installazione nella barra dell'indirizzo, oppure il menu › **Installa**.
3. L'app compare tra le applicazioni del desktop.

Firefox non installa le app web: l'app funziona lo stesso in una scheda normale.

---

## Primi passi

1. **Opzioni › Listino:** carica il PDF del listino dal telefono o dal computer.
   - Il listino **resta solo sul dispositivo**: l'app lo legge in locale e non lo manda a nessuno.
   - Se hai il listino giusto, si sblocca da solo anche il **book dell'agente** (postazioni pronte, controlli e
     disegni). Il book serve solo a te: non finisce mai nel preventivo stampato o condiviso.
2. **Opzioni › Intestazione del preventivo:** scrivi i dati dell'azienda e la tua firma.
3. **Preventivo:** scegli i prodotti, poi Consegna, Pagamento e Invia.

Se sul dispositivo usi già Listino in tasca, Calcolo trasporti o Calcolo noleggio, la Home propone di
**importare i dati** (listino, preventivi salvati, impostazioni, trasporto). Le app precedenti si leggono soltanto:
niente viene cancellato o cambiato. Puoi farlo anche più tardi da **Opzioni › Dati e uso offline**.

## Senza connessione

Dopo la prima apertura con la rete, tutto funziona offline: listino, calcoli, noleggio, documenti BCC e book.
Quando c'è una versione nuova compare l'avviso **"È disponibile una nuova versione"**: tocca **Aggiorna** quando hai
finito (il preventivo in corso viene salvato prima).

Il prezzo del gasolio per i trasporti si aggiorna da solo ogni giorno, quando c'è la rete.

## I tuoi dati

- Preventivi, impostazioni e listino restano **solo su questo dispositivo**. Non ci sono account né server.
- **Opzioni › Dati e uso offline › Salva i dati in un file** crea una copia di sicurezza da portare su un altro
  dispositivo: contiene impostazioni, preventivi e scelte del trasporto, **non** il listino né il book.

## Per chi aggiorna i dati

Coefficienti BCC, tariffe dei trasporti, catalogo pesi e misure, documenti: vedi
[docs/AGGIORNARE_I_DATI.md](docs/AGGIORNARE_I_DATI.md).
Cosa provare prima di decidere: [docs/GUIDA_PROVA.md](docs/GUIDA_PROVA.md).

---

© 2026 Alessandro Pezzali. Tutti i diritti riservati (vedi [LICENSE](LICENSE)).
Font Barlow con licenza SIL Open Font License ([fonts/OFL.txt](fonts/OFL.txt));
pdf.js con licenza Apache 2.0 ([lib/PDFJS-LICENSE.txt](lib/PDFJS-LICENSE.txt));
SheetJS (`lib/xlsx.mini.min.js`, per l'analisi mensile) con licenza Apache 2.0;
jsPDF 4.2.1 (`lib/jspdf.umd.min.js`, per "Invia PDF") con licenza MIT ([lib/JSPDF-LICENSE.txt](lib/JSPDF-LICENSE.txt)).
