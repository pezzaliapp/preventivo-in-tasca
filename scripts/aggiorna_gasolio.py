"""Aggiorna data/trasporti/gasolio.json con il prezzo medio nazionale del gasolio.
Eseguito in automatico da GitHub Actions (gratis).

Catena di fonti, dalla più affidabile (dal 17/10/2026 il sito MIMIT non risponde ai server di GitHub):
1. MIMIT, media nazionale self, rete stradale, ogni giorno (20 s di attesa, 2 tentativi);
2. MASE (statistiche DGSAIE), media nazionale settimanale del lunedì: è il dato che l'Italia manda all'UE;
3. Bollettino petrolifero settimanale della Commissione europea (Weekly Oil Bulletin), Italia, gasolio.

- Il dato salvato dice prezzo, data e fonte: {"prezzo", "data", "fonte"}.
- Non sostituisce mai un dato con uno più vecchio (a pari data vince la fonte più affidabile).
- La base "media gennaio 2026" (MIMIT) non si tocca.
- Con --verifica termina con errore solo se il dato è più vecchio di 5 giorni lavorativi:
  GitHub avvisa via e-mail.
"""
import csv, io, json, re, sys, time, urllib.parse, urllib.request, zipfile
from datetime import date, datetime, timezone, timedelta
from pathlib import Path

FILE = Path(__file__).resolve().parent.parent / "data" / "trasporti" / "gasolio.json"
URL_MIMIT = "https://www.mimit.gov.it/it/prezzi-carburanti-media-nazionale"
URL_MASE = "https://sisen.mase.gov.it/dgsaie/api/v1/weekly-prices/report/export?format=CSV&lang=it"
URL_UE = "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en"
# indirizzo del file storico al 20/10/2026; di norma lo si ricava dalla pagina URL_UE
URL_UE_STORICO = ("https://energy.ec.europa.eu/document/download/906e60ca-8b6a-44e7-8589-652854d2fd3f_en"
                  "?filename=Weekly_Oil_Bulletin_Prices_History_maticni_4web.xlsx")
TIMEOUT = 20
TENTATIVI_MIMIT = 2
GIORNI_LAVORATIVI_MAX = 5
# fonti in ordine di affidabilità: il nome è quello che l'app mostra accanto al prezzo
MIMIT, MASE, UE = "MIMIT", "MASE settimanale", "Bollettino UE"
ORDINE = [MIMIT, MASE, UE]


def oggi_italia():
    # ora italiana (legale da fine marzo a fine ottobre), sufficiente per il confronto della data
    now = datetime.now(timezone.utc)
    y = now.year
    fine_marzo = max(datetime(y, 3, d, 1, tzinfo=timezone.utc) for d in range(25, 32) if datetime(y, 3, d).weekday() == 6)
    fine_ott = max(datetime(y, 10, d, 1, tzinfo=timezone.utc) for d in range(25, 32) if datetime(y, 10, d).weekday() == 6)
    ore = 2 if fine_marzo <= now < fine_ott else 1
    return (now + timedelta(hours=ore)).date().isoformat()


def giorni_lavorativi_dopo(data: str, oggi: str) -> int:
    """Giorni dal lunedì al venerdì passati dopo `data`, fino a `oggi` compreso."""
    d, fine, n = date.fromisoformat(data), date.fromisoformat(oggi), 0
    while d < fine:
        d += timedelta(days=1)
        n += d.weekday() < 5
    return n


def controlla_prezzo(prezzo: float) -> float:
    if not 0.8 <= prezzo <= 4.0:
        raise ValueError(f"prezzo fuori scala: {prezzo}")
    return prezzo


def scarica(url: str, tentativi: int = 1) -> bytes:
    ultimo = None
    for n in range(1, tentativi + 1):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0 (compatible; preventivo-in-tasca/1.0)",
                "Accept-Language": "it-IT,it;q=0.9",
                "Cache-Control": "no-cache",
            })
            return urllib.request.urlopen(req, timeout=TIMEOUT).read()
        except Exception as e:
            ultimo = e
            print(f"  tentativo {n} non riuscito: {e}")
            if n < tentativi:
                time.sleep(10)
    raise RuntimeError(f"non risponde: {ultimo}")


# ---------------- 1. MIMIT: pagina della media nazionale giornaliera ----------------
def estrai_mimit(html: str):
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
    return controlla_prezzo(float(p.group(1).replace(",", "."))), f"{d.group(3)}-{d.group(2)}-{d.group(1)}"


# ---------------- 2. MASE: CSV dei prezzi medi settimanali (euro per 1000 litri) ----------------
def estrai_mase(dati: bytes):
    righe = csv.DictReader(io.StringIO(dati.decode("latin-1")))
    validi = []
    for r in righe:
        data, valore = (r.get("DATA_RILEVAZIONE") or "").strip(), (r.get("GASOLIO_AUTO") or "").strip()
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", data) and valore:
            validi.append((data, float(valore.replace(".", "").replace(",", ".")) / 1000))
    if not validi:
        raise ValueError("colonna GASOLIO_AUTO vuota o non trovata")
    data, prezzo = max(validi)
    return controlla_prezzo(round(prezzo, 3)), data


# ---------------- 3. Bollettino UE: file Excel storico, foglio "Prices with taxes" ----------------
def link_storico_ue(html: str) -> str:
    m = re.search(r'href="([^"]*Prices_History[^"]*\.xlsx[^"]*)"', html)
    if not m:
        raise ValueError("link al file storico non trovato nella pagina")
    return urllib.parse.urljoin(URL_UE, m.group(1).replace("&amp;", "&"))


def estrai_ue(dati: bytes):
    z = zipfile.ZipFile(io.BytesIO(dati))
    leggi = lambda nome: z.read(nome).decode("utf-8")
    # trova il file del foglio "Prices with taxes"
    rid = re.search(r'<sheet [^>]*name="Prices with taxes"[^>]*r:id="([^"]+)"', leggi("xl/workbook.xml"))
    if not rid:
        raise ValueError("foglio 'Prices with taxes' non trovato")
    rel = re.search(rf'<Relationship [^>]*Id="{rid.group(1)}"[^>]*Target="([^"]+)"', leggi("xl/_rels/workbook.xml.rels")) \
        or re.search(rf'<Relationship [^>]*Target="([^"]+)"[^>]*Id="{rid.group(1)}"', leggi("xl/_rels/workbook.xml.rels"))
    foglio = "xl/" + rel.group(1).lstrip("/").removeprefix("xl/")
    testi = [re.sub(r"<[^>]+>", "", s) for s in re.findall(r"<si>(.*?)</si>", leggi("xl/sharedStrings.xml"), re.S)]
    colonna, validi = None, []
    for riga in re.finditer(r"<row [^>]*>(.*?)</row>", leggi(foglio), re.S):
        celle = {c: (testi[int(v)] if 't="s"' in a else v)
                 for c, a, v in re.findall(r'<c r="([A-Z]+)\d+"([^>]*)>(?:<f>.*?</f>)?<v>([^<]*)</v>', riga.group(1))}
        if colonna is None:
            colonna = next((c for c, v in celle.items() if v == "IT_price_with_tax_diesel"), None)
            continue
        try:
            giorno = (date(1899, 12, 30) + timedelta(days=int(float(celle["A"])))).isoformat()
            validi.append((giorno, float(celle[colonna]) / 1000))
        except (KeyError, ValueError):
            pass                                    # righe di intestazione o senza dato
    if colonna is None:
        raise ValueError("colonna IT_price_with_tax_diesel non trovata")
    if not validi:
        raise ValueError("nessun prezzo del gasolio per l'Italia")
    data, prezzo = max(validi)
    return controlla_prezzo(round(prezzo, 3)), data


def leggi_ue(scarica):
    try:
        url = link_storico_ue(scarica(URL_UE).decode("utf-8", "replace"))
    except Exception as e:
        print(f"  pagina del bollettino non letta ({e}): uso l'indirizzo noto del file")
        url = URL_UE_STORICO
    return estrai_ue(scarica(url))


def leggi_fonti(scarica=scarica):
    """Prova le fonti in ordine e restituisce (prezzo, data, fonte) della prima che risponde."""
    prove = [
        (MIMIT, lambda: estrai_mimit(scarica(URL_MIMIT, TENTATIVI_MIMIT).decode("utf-8", "replace"))),
        (MASE, lambda: estrai_mase(scarica(URL_MASE))),
        (UE, lambda: leggi_ue(scarica)),
    ]
    for fonte, leggi in prove:
        print(f"Fonte {fonte}:")
        try:
            prezzo, data = leggi()
            print(f"  {prezzo} €/l del {data}")
            return prezzo, data, fonte
        except Exception as e:
            print(f"  non disponibile: {e}")
    raise RuntimeError("nessuna fonte disponibile")


def piu_recente(nuovo: dict, attuale: dict) -> bool:
    """True se `nuovo` va salvato al posto di `attuale`: data più recente, o stessa data e fonte almeno
    altrettanto affidabile (così il MIMIT corregge un dato settimanale dello stesso giorno)."""
    if nuovo["data"] != attuale.get("data", ""):
        return nuovo["data"] > attuale.get("data", "")
    rango = lambda f: ORDINE.index(f) if f in ORDINE else 0      # senza fonte = vecchio dato MIMIT
    return rango(nuovo["fonte"]) <= rango(attuale.get("fonte")) and nuovo != attuale


def main(argv=None, file=FILE, scarica=scarica, oggi=None):
    argv = sys.argv[1:] if argv is None else argv
    verifica = "--verifica" in argv
    dati = json.loads(file.read_text(encoding="utf-8"))
    attuale = dati.get("attuale", {})
    try:
        prezzo, data, fonte = leggi_fonti(scarica)
    except Exception as e:
        print(f"ERRORE: {e}")
        if not verifica:
            return 1                               # esecuzione rossa: GitHub invia un'e-mail
    else:
        nuovo = {"prezzo": prezzo, "data": data, "fonte": fonte}
        if piu_recente(nuovo, attuale):
            dati["attuale"] = nuovo
            file.write_text(json.dumps(dati, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"Aggiornato: {prezzo} €/l del {data} ({fonte}).")
        elif nuovo == attuale:
            print(f"Già aggiornato: {prezzo} €/l del {data} ({fonte}).")
        else:
            print(f"{fonte} riporta {data}: non più recente del dato salvato "
                  f"({attuale.get('data')}, {attuale.get('fonte', MIMIT)}), nessuna modifica.")

    if verifica:
        oggi = oggi or oggi_italia()
        salvato = json.loads(file.read_text(encoding="utf-8"))["attuale"]["data"]
        ritardo = giorni_lavorativi_dopo(salvato, oggi)
        if ritardo > GIORNI_LAVORATIVI_MAX:
            print(f"CONTROLLO NON SUPERATO: il dato più recente è del {salvato}, "
                  f"{ritardo} giorni lavorativi fa (massimo {GIORNI_LAVORATIVI_MAX}).")
            return 1
        print(f"Controllo superato: dato del {salvato}, {ritardo} giorni lavorativi fa.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
