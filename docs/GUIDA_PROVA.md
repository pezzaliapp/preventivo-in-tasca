# Guida alla prova sul telefono

Questa guida serve a provare **Preventivo in tasca** accanto alle app di oggi e a confrontare i risultati.
Le app attuali (Listino in tasca, Calcolo trasporti, Calcolo noleggio) **non vengono toccate**: restano installate
e si usano come sempre. Sul loro futuro decide Alessandro dopo la prova.

**Indirizzo della prova:** https://pezzaliapp.github.io/preventivo-in-tasca/

Per ogni prova segna ✅ (uguale o giusto), ⚠️ (diverso ma spiegato qui sotto) o ❌ (sbagliato), con una schermata
quando qualcosa non torna.

---

## 0. Prima di cominciare

- Usa lo **stesso telefono** e lo **stesso browser** dove usi già le app attuali (Safari su iPhone, Chrome su Android).
- Tieni a portata il **listino PDF** che usi oggi.
- Non disinstallare e non svuotare le app attuali.

## 1. Installazione e prima apertura

| # | Cosa fare | Cosa deve succedere |
|---|---|---|
| 1.1 | Apri l'indirizzo con la rete e installa l'app (vedi [README](../README.md)) | L'icona "Preventivo" compare nella schermata Home |
| 1.2 | Apri l'app dall'icona | Home "Cosa vuoi fare?" con tre scelte: Preventivo completo, Solo trasporto, Solo rata noleggio |
| 1.3 | Chiudi e riapri | Nessuna ricarica strana, nessun messaggio di errore |

## 2. Importazione dei dati dalle app attuali

All'apertura, se sul dispositivo ci sono dati delle app attuali, la Home mostra **"Importa i tuoi dati dalle app
precedenti"** con l'elenco di cosa ha trovato.

| # | Cosa fare | Cosa deve succedere |
|---|---|---|
| 2.1 | Leggi l'elenco nel riquadro | Corrisponde a quello che hai: listino (numero di articoli), book, preventivi salvati, impostazioni, carico del trasporto, tema |
| 2.2 | Tocca **Importa i dati** | Un messaggio dice cosa è stato importato |
| 2.3 | **Archivio** | Ci sono gli stessi preventivi salvati di Listino in tasca, con gli stessi numeri e importi |
| 2.4 | **Opzioni › Intestazione** | Azienda, firma, IVA, sconto predefinito, validità e note come in Listino in tasca |
| 2.5 | **Preventivo › Prodotti** | Il listino c'è già, senza ricaricare il PDF; se avevi il book, ci sono le postazioni pronte |
| 2.6 | **Solo trasporto** | Lo stesso carico, la stessa regione e provincia e gli stessi adeguamenti di Calcolo trasporti |
| 2.7 | Nuovo preventivo e **Salva** | Il numero continua dopo l'ultimo di Listino in tasca (nessun numero doppio) |
| 2.8 | **Apri le app attuali** | Tutto è ancora lì, identico: l'importazione legge soltanto |
| 2.9 | **Opzioni › Dati e uso offline › Importa dalle app precedenti** una seconda volta | "Niente da importare: i dati sono già qui." Nessun doppione |

**Da verificare in particolare su iPhone.** Su iPhone ogni app aggiunta alla schermata Home può avere un archivio
tutto suo, separato da Safari e dalle altre app. Se il riquadro non compare o dice "Niente da importare" ma le app
attuali hanno dei dati:

1. prova ad aprire l'indirizzo della prova **in Safari** (non dall'icona) e a importare da lì;
2. annota cosa succede (✅ o ❌, con una schermata): è un'informazione importante per decidere.

In ogni caso il listino si può ricaricare dal PDF (**Opzioni › Listino**) in pochi secondi, e il book si risblocca
da solo. Su Android e sul computer (Chrome o Edge) l'archivio è condiviso e l'importazione funziona anche
dall'app installata.

## 3. Confronto con le app attuali

Fai **la stessa cosa** nelle due app e confronta i numeri. Le differenze attese sono elencate sotto ogni tabella:
tutto il resto deve coincidere al centesimo.

### 3.1 Listino (con Listino in tasca)
| # | Prova | Confronta |
|---|---|---|
| a | Cerca 3–4 prodotti per codice e per nome | Stessi risultati, stessi prezzi di listino |
| b | Configuratore: veicolo › categoria › prodotto | Stesse proposte nello stesso ordine |
| c | Preventivo con 3 righe, uno sconto per riga e uno sconto generale (per esempio `30+5`) | Stesso netto di riga e stesso totale |
| d | Con il book: una postazione pronta e i controlli prima di inviare | Stesse voci e stessi avvisi |
| e | Stampa o PDF del preventivo | Stessi importi; **niente** contenuto del book; in fondo "Preventivo in tasca · Alessandro Pezzali" |

Differenza attesa: gli importi sono scritti sempre con il punto delle migliaia (1.234,56 €).

### 3.2 Trasporto (con Calcolo trasporti)
| # | Prova | Confronta |
|---|---|---|
| a | Stessi articoli, stessa regione e provincia, stesse opzioni (assicurazione, preavviso, sponda) | Stesso totale pallet e stesso totale groupage |
| b | Adeguamento in % e gasolio | Stesso prezzo del gasolio del giorno e stesso totale |
| c | Una macchina lunga (per esempio un sollevatore) e una piccola | Stesso numero di pallet e stessi metri lineari |
| d | Testo condiviso | Stessi importi |

Differenze attese:
- **Colli sovrapponibili** (passo Consegna): l'interruttore è spento di base e così i numeri sono quelli di oggi.
  Acceso, alcuni articoli si impilano (al massimo 2 livelli, 240 cm): i metri possono scendere. Se non scendono,
  la scheda lo dice ("Impilamento senza effetto…").
- La data nel riepilogo è sempre quella italiana (prima, tra mezzanotte e le 2, usciva il giorno prima).

### 3.3 Noleggio (con Calcolo noleggio)
Usa **Solo rata noleggio** con gli stessi importi e la stessa durata.

| # | Importo | Confronta |
|---|---|---|
| a | 3.000 € · 36 mesi | Stessa rata mensile, stesse spese, stesso VR |
| b | 18.381 € · 12, 24, 36, 48, 60 mesi | Stesse rate per tutte le durate |
| c | 60.000 € · 48 mesi | Stessa rata; in più l'avviso del fascicolo antiriciclaggio sopra 50.000 € |
| d | 2.000 € · 36 mesi | La nuova app usa il **trimestrale** (vedi sotto): confronta con Calcolo noleggio impostato su trimestrale |
| e | 1.200 € | Vedi sotto: la nuova app dice che è sotto il minimo |

Differenze attese (decise da Alessandro o dai simulatori BCC):
- **Mensile o trimestrale lo decide l'importo:** da 2.700 € solo mensile; da 1.500 € a meno di 2.700 € trimestrale,
  con la nota "Sotto i 2.700 € BCC prevede il canone trimestrale"; sotto 1.500 € niente noleggio
  ("Importo sotto il minimo finanziabile da BCC (1.500 €)."). La scelta manuale del canone non c'è più.
- **Spese di contratto da Ottobre 2026** (dal 15/10/2026): 150 € tra 5.000 e 10.000 € e, in trimestrale, 450 € oltre
  100.000 €, come i simulatori BCC. Calcolo noleggio scrive 100 € e 300 €. **Da confermare con BCC.**
- **Costo giornaliero in trimestrale:** rata ÷ 3 ÷ 22 (Calcolo noleggio divideva la rata trimestrale per 22).
- **Cambio listino:** fino al 14/10/2026 valgono i coefficienti di Aprile 2026, dal 15/10/2026 quelli di Ottobre 2026,
  in entrambe le app. Prima del 15/10 la nuova app scrive "Rate valide fino al 14/10/2026".

### 3.4 Preventivo completo (solo nella nuova app)
| # | Prova | Cosa deve succedere |
|---|---|---|
| a | Prodotti › Consegna: provincia, poi **Usa questa** su groupage o pallet | La riga del trasporto entra nel preventivo con il totale della soluzione |
| b | Una macchina che il catalogo trasporti non riconosce | "Da scegliere" o "Non trovato", l'avviso "Manca il peso di una macchina" e **nessun totale** finché non la scegli |
| c | Pagamento: durate da mostrare, trasporto incluso sì/no, contributo del fornitore | La rata cambia; il **contributo e la base della rata non compaiono mai** nella stampa né nel testo condiviso |
| d | Invia: stampa, PDF, condividi | Prodotti, trasporto, noleggio come opzione in fondo, "Rate valide fino al …" se c'è un listino BCC futuro |
| e | **Opzioni › Verifica abbinamenti trasporto** | Controlla con il listino vero che ogni macchina sia abbinata al prodotto giusto (questo con i dati veri lo può dire solo Alessandro) |

## 4. Senza connessione

| # | Cosa fare | Cosa deve succedere |
|---|---|---|
| 4.1 | Apri l'app una volta con la rete, poi attiva la **modalità aereo** | L'app si apre lo stesso |
| 4.2 | Cerca prodotti, fai un preventivo, calcola trasporto e noleggio | Tutto funziona |
| 4.3 | Apri un documento BCC e un disegno del book | Si aprono |
| 4.4 | Salva e stampa o crea il PDF | Funziona; alla riaccensione della rete non si perde niente |

## 5. Aggiornamento e copia di sicurezza

| # | Cosa fare | Cosa deve succedere |
|---|---|---|
| 5.1 | Quando compare **"È disponibile una nuova versione"**, tocca **Aggiorna** | L'app si ricarica una volta; il preventivo in corso c'è ancora |
| 5.2 | **Opzioni › Dati e uso offline › Salva i dati in un file** | Si scarica `preventivo-in-tasca-dati-AAAA-MM-GG.json` |
| 5.3 | Su un altro dispositivo: **Opzioni › Dati e uso offline › Carica i dati da un file** | Arrivano preventivi e impostazioni; il listino si ricarica dal PDF |

## 6. Cosa mandare ad Alessandro

- La tabella con ✅ ⚠️ ❌.
- Per ogni ❌: cosa hai fatto, il risultato delle due app e una schermata.
- Il risultato dell'importazione su iPhone (sezione 2).
- Qualsiasi frase poco chiara o pulsante difficile da toccare.
