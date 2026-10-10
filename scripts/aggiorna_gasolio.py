"""Aggiorna data/trasporti/gasolio.json con il prezzo medio nazionale del gasolio self (rete stradale)
pubblicato ogni giorno dal MIMIT. Eseguito in automatico da GitHub Actions (gratis).

- Prova più volte se il sito MIMIT non risponde.
- Non sostituisce mai un dato con uno più vecchio.
- Con --verifica termina con errore se il dato non è di oggi: GitHub avvisa via e-mail.
"""
import json, re, sys, time, urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

URL = "https://www.mimit.gov.it/it/prezzi-carburanti-media-nazionale"
FILE = Path(__file__).resolve().parent.parent / "data" / "trasporti" / "gasolio.json"
TENTATIVI = 3


def oggi_italia():
    # ora italiana (legale da fine marzo a fine ottobre), sufficiente per il confronto della data
    now = datetime.now(timezone.utc)
    y = now.year
    fine_marzo = max(datetime(y, 3, d, 1, tzinfo=timezone.utc) for d in range(25, 32) if datetime(y, 3, d).weekday() == 6)
    fine_ott = max(datetime(y, 10, d, 1, tzinfo=timezone.utc) for d in range(25, 32) if datetime(y, 10, d).weekday() == 6)
    ore = 2 if fine_marzo <= now < fine_ott else 1
    return (now + timedelta(hours=ore)).date().isoformat()


def estrai(html: str):
    testo = re.sub(r"<[^>]+>", " ", html)
    testo = re.sub(r"&nbsp;|\s+", " ", testo)
    i = testo.lower().find("prezzi rete stradale")
    if i < 0:
        raise ValueError("sezione 'rete stradale' non trovata")
    j = testo.lower().find("prezzi rete autostradale", i)
    sezione = testo[i: j if j > 0 else None]
    d = re.search(r"Aggiornamento\s+(\d{2})-(\d{2})-(\d{4})", sezione)
    p = re.search(r"Gasolio\s+(\d[.,]\d{3})", sezione)
    if not (d and p):
        raise ValueError("data o prezzo gasolio non trovati")
    prezzo = float(p.group(1).replace(",", "."))
    if not 0.8 <= prezzo <= 4.0:
        raise ValueError(f"prezzo fuori scala: {prezzo}")
    return prezzo, f"{d.group(3)}-{d.group(2)}-{d.group(1)}"


def leggi_mimit():
    ultimo = None
    for n in range(1, TENTATIVI + 1):
        try:
            req = urllib.request.Request(URL, headers={
                "User-Agent": "Mozilla/5.0 (compatible; preventivo-in-tasca/1.0)",
                "Accept-Language": "it-IT,it;q=0.9",
                "Cache-Control": "no-cache",
            })
            html = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")
            return estrai(html)
        except Exception as e:
            ultimo = e
            print(f"Tentativo {n} non riuscito: {e}")
            if n < TENTATIVI:
                time.sleep(30 * n)
    raise RuntimeError(f"sito MIMIT non leggibile dopo {TENTATIVI} tentativi: {ultimo}")


def main():
    verifica = "--verifica" in sys.argv
    dati = json.loads(FILE.read_text(encoding="utf-8"))
    attuale = dati.get("attuale", {})
    try:
        prezzo, data = leggi_mimit()
    except Exception as e:
        print(f"ERRORE: {e}")
        return 1                                   # esecuzione rossa: GitHub invia un'e-mail

    if data < attuale.get("data", ""):
        print(f"Il MIMIT riporta {data}, più vecchio del dato salvato {attuale.get('data')}: nessuna modifica.")
    elif attuale == {"prezzo": prezzo, "data": data}:
        print(f"Già aggiornato: {prezzo} €/l del {data}.")
    else:
        dati["attuale"] = {"prezzo": prezzo, "data": data}
        FILE.write_text(json.dumps(dati, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Aggiornato: {prezzo} €/l del {data}.")

    if verifica:
        oggi = oggi_italia()
        salvato = json.loads(FILE.read_text(encoding="utf-8"))["attuale"]["data"]
        if salvato != oggi:
            print(f"CONTROLLO NON SUPERATO: il dato più recente è del {salvato}, oggi è {oggi}.")
            return 1
        print(f"Controllo superato: dato di oggi ({oggi}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
