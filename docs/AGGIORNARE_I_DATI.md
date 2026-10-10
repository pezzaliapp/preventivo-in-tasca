# Aggiornare i dati

Tutti i numeri dell'app stanno in file JSON dentro `data/`: per aggiornarli non si tocca il codice.
Si possono modificare anche dal sito di GitHub (apri il file › matita › **Commit changes**).

> **Regola:** i numeri e i coefficienti si copiano dalla fonte così come sono. Se un valore sembra sbagliato,
> non si "corregge": si annota e si chiede ad Alessandro.

## Dopo ogni modifica: tre passi fissi

1. **Versione.** Alza di uno lo stesso numero in tre punti (per esempio da `0.7.3` a `0.7.4`):
   - `sw.js` › `const VERSION = 'pit-0.7.4';`
   - `versione.json` › `{"app": "0.7.4"}`
   - `js/app.js` › `export const VERSIONE = '0.7.4';`

   Senza questo passo i telefoni continuano a usare la copia offline vecchia.
2. **Test.** Sul computer: `npm test`. Devono passare tutti.
   Su GitHub i test girano da soli prima di ogni pubblicazione: se uno fallisce il sito non cambia e arriva un'e-mail.
3. **Pubblicazione.** Commit su `main`: GitHub Pages pubblica in un paio di minuti
   (workflow `.github/workflows/pagine.yml`). Sui telefoni compare l'avviso **"È disponibile una nuova versione"**.

Se aggiungi un **file nuovo** (non se ne modifichi uno esistente), mettilo anche nella lista `SHELL` di `sw.js`,
altrimenti non è disponibile offline. Il test `nella lista offline ci sono tutti i file dell'app` lo segnala.

---

## Noleggio BCC

### Nuovi coefficienti — `data/noleggio/coefficienti.json`
I coefficienti stanno in `listini`, uno per ogni release BCC. **Non si cancella il listino in vigore:** se ne aggiunge
uno nuovo in fondo, con la data da cui vale. Fino a quella data l'app usa il precedente, poi passa da sola al nuovo
(e lo dice: "Rate valide fino al …").

```json
{
  "id": "2027-04",
  "nome": "Aprile 2027",
  "validoDal": "2027-04-15",
  "fonte": "Simulatori BCC Aprile 2027",
  "mensile":     { "5000": { "12": 0.082439, "18": 0.059311, "24": 0.046504, "36": 0.033168, "48": 0.02619, "60": 0.022041 }, "15000": { … }, … },
  "trimestrale": { "5000": { "12": 0.249396, … }, … },
  "speseContratto": {
    "mensile":     [ { "fino": 5000, "euro": 112.5 }, { "fino": 10000, "euro": 150 }, …, { "fino": null, "euro": 300 } ],
    "trimestrale": [ { "fino": 5000, "euro": 112.5 }, …, { "fino": null, "euro": 450 } ]
  }
}
```

- **Fasce** (`"5000"`, `"15000"`, …): importo massimo della fascia in euro. Devono essere le stesse del listino
  precedente, con tutte le durate (`12`, `18`, `24`, `36`, `48`, `60`).
- **Coefficienti**: con tutte le cifre decimali del simulatore, il punto come separatore.
- **Spese di contratto**: `fino` è l'importo massimo incluso, `null` vuol dire "oltre". Si può usare un elenco unico
  oppure due elenchi separati (`mensile` e `trimestrale`), come per Ottobre 2026.
- Altri valori in testa al file: `canone` (minimo finanziabile 1.500 €, soglia del canone mensile 2.700 €),
  `speseIncassoRidMese`, `valoreRiacquistoPercento`, `durate`.

Prima di pubblicare, confronta 3–4 rate con il simulatore BCC (un importo per fascia, mensile e trimestrale).
`npm test` controlla che ogni listino abbia tutte le fasce e tutte le durate, le spese con la fascia "oltre" e le
date in ordine: se manca un coefficiente il test lo dice (listino, fascia e durata) e su GitHub il sito non cambia.

### Testi del riquadro noleggio — `data/noleggio/testi.json`
Frasi che vanno al cliente: canoni, primo canone, spese, RID, simulazione, benefici, documenti da preparare.

### Documenti BCC — `data/noleggio/documenti.json` e `data/noleggio/documenti/`
1. Sostituisci i PDF in `data/noleggio/documenti/` (sono gli **unici** PDF ammessi nella repository).
2. Aggiorna l'elenco e la data `aggiornato` in `documenti.json`.
3. Se cambia il nome di un file, aggiorna anche la lista `SHELL` di `sw.js`.

---

## Trasporti — `data/trasporti/`

| File | Cosa contiene |
|---|---|
| `pallet.json` | Tipi di pallet (misure, peso massimo) e tariffe per regione |
| `groupage.json` | Zone, fasce (metri lineari, bancali, quintali) e prezzi del groupage |
| `articoli.json` | Catalogo pesi e misure: colli di ogni macchina, `corriere`, `soloPallet`, `sovrapponibile` |
| `sovrapposizione.json` | Regole dei colli sovrapponibili: al massimo 2 livelli, 240 cm di altezza |
| `geo.json` | Regioni e province |
| `listini.json` | Nomi dei listini, condizioni, cronologia degli aggiornamenti e data `aggiornato` |
| `gasolio.json` | Prezzo del gasolio: **si aggiorna da solo**, non va modificato a mano |

- **Tariffe nuove:** cambia i prezzi in `pallet.json` o `groupage.json`, poi in `listini.json` aggiorna
  `aggiornato`, `riferimento` e aggiungi una riga nella `storico` del servizio (data e cosa è cambiato).
  Il campo `versione` (oggi `2`) non si tocca: indica il formato del file, non la data delle tariffe.
- **Macchina nuova nel catalogo:** aggiungi un oggetto in `articoli.json` con un `id` mai usato, il nome e i
  colli (`kg`, `l`, `p`, `h` in centimetri). Se va impilata nel groupage, aggiungi `"sovrapponibile": true`.
  Poi apri in app **Opzioni › Verifica abbinamenti trasporto** e controlla che si abbini alla macchina giusta
  del listino.
- **Gasolio:** lo aggiorna il workflow `.github/workflows/gasolio.yml` (copia di quello di Calcolo trasporti,
  che resta dov'è). Legge il prezzo MIMIT più volte al giorno; se alla sera il dato non è di oggi, GitHub
  manda un'e-mail. Si può lanciare a mano da **Actions › Aggiorna prezzo gasolio › Run workflow**.

---

## Listino e book dell'agente

- **Listino PDF:** non si pubblica mai. Ognuno lo carica dal proprio dispositivo (**Opzioni › Listino**).
  Quando esce un listino nuovo basta caricarlo: l'app rilegge prezzi e articoli.
- **Book dell'agente:** `data/agente.pack.json` e i disegni `data/d/*.bin` sono cifrati e si sbloccano solo con
  il listino giusto. Si rigenerano con lo strumento privato di Alessandro (fuori dalla repository) e si
  sostituiscono **interi**: non si modificano mai a mano.
  Dopo la sostituzione: versione nuova (passo 1). I disegni nuovi si scaricano da soli sui dispositivi dove il
  book è sbloccato.
- `js/listino/parser.js` non si modifica: se il risultato della lettura cambia anche di un byte, il book non si
  sblocca più.
