"""Test di scripts/aggiorna_gasolio.py con pagine di esempio salvate il 20/10/2026: nessuna rete.
Si lancia da tests/gasolio.test.js (npm test) oppure da solo: python3 tests/gasolio_script.py
"""
import contextlib, io, json, sys, tempfile, unittest
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RADICE / "scripts"))
import aggiorna_gasolio as G  # noqa: E402

ESEMPI = RADICE / "tests" / "fixtures" / "gasolio"
PAGINE = {
    G.URL_MIMIT: (ESEMPI / "mimit.html").read_bytes(),
    G.URL_MASE: (ESEMPI / "mase.csv").read_bytes(),
    G.URL_UE: (ESEMPI / "ue.html").read_bytes(),
    G.URL_UE_STORICO: (ESEMPI / "ue_storico.xlsx").read_bytes(),
}


def rete(*spente):
    """Finta rete: risponde con le pagine di esempio, tranne gli indirizzi spenti (timeout)."""
    chiamate = []

    def scarica(url, tentativi=1):
        chiamate.append((url, tentativi))
        if url in spente:
            raise RuntimeError("non risponde: <urlopen error timed out>")
        return PAGINE[url]
    scarica.chiamate = chiamate
    return scarica


class Estrattori(unittest.TestCase):
    def test_mimit(self):
        self.assertEqual(G.estrai_mimit(PAGINE[G.URL_MIMIT].decode()), (2.258, "2026-10-20"))

    def test_mase_euro_per_mille_litri(self):
        self.assertEqual(G.estrai_mase(PAGINE[G.URL_MASE]), (2.244, "2026-10-19"))   # "2.244,44" €/1000 l

    def test_ue_link_e_excel(self):
        self.assertEqual(G.link_storico_ue(PAGINE[G.URL_UE].decode()), G.URL_UE_STORICO)
        self.assertEqual(G.estrai_ue(PAGINE[G.URL_UE_STORICO]), (2.241, "2026-10-12"))  # 2240,73 €/1000 l

    def test_pagine_sbagliate(self):
        with self.assertRaises(ValueError):
            G.estrai_mimit("<html>manutenzione</html>")
        with self.assertRaises(ValueError):
            G.estrai_mase(b"DATA_RILEVAZIONE,BENZINA\n2026-10-19,\"2.015,74\"\n")
        with self.assertRaises(ValueError):
            G.controlla_prezzo(22.44)


class Catena(unittest.TestCase):
    def leggi(self, scarica):
        with contextlib.redirect_stdout(io.StringIO()):
            return G.leggi_fonti(scarica)

    def test_prima_il_mimit_con_due_tentativi(self):
        s = rete()
        self.assertEqual(self.leggi(s), (2.258, "2026-10-20", "MIMIT"))
        self.assertEqual(s.chiamate, [(G.URL_MIMIT, 2)])

    def test_mimit_fermo_usa_mase(self):
        self.assertEqual(self.leggi(rete(G.URL_MIMIT)), (2.244, "2026-10-19", "MASE settimanale"))

    def test_mimit_e_mase_fermi_usa_bollettino_ue(self):
        self.assertEqual(self.leggi(rete(G.URL_MIMIT, G.URL_MASE)), (2.241, "2026-10-12", "Bollettino UE"))

    def test_pagina_ue_ferma_usa_indirizzo_noto(self):
        self.assertEqual(self.leggi(rete(G.URL_MIMIT, G.URL_MASE, G.URL_UE)), (2.241, "2026-10-12", "Bollettino UE"))

    def test_tutto_fermo(self):
        with self.assertRaises(RuntimeError):
            self.leggi(rete(*PAGINE))


class Salvataggio(unittest.TestCase):
    BASE = {"prezzo": 1.665, "data": "2026-01", "descrizione": "media gennaio 2026"}

    def esegui(self, attuale, scarica, *argv, oggi="2026-10-20"):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "gasolio.json"
            f.write_text(json.dumps({"fonte": "MIMIT", "base": self.BASE, "attuale": attuale}), encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()):
                esito = G.main(list(argv), file=f, scarica=scarica, oggi=oggi)
            dati = json.loads(f.read_text(encoding="utf-8"))
        self.assertEqual(dati["base"], self.BASE)                 # la base MIMIT non si tocca mai
        return esito, dati["attuale"]

    def test_salva_prezzo_data_e_fonte(self):
        self.assertEqual(self.esegui({"prezzo": 2.256, "data": "2026-10-16"}, rete(G.URL_MIMIT)),
                         (0, {"prezzo": 2.244, "data": "2026-10-19", "fonte": "MASE settimanale"}))

    def test_mai_un_dato_piu_vecchio(self):
        salvato = {"prezzo": 2.25, "data": "2026-10-20", "fonte": "MIMIT"}
        self.assertEqual(self.esegui(salvato, rete(G.URL_MIMIT)), (0, salvato))
        self.assertEqual(self.esegui(salvato, rete(G.URL_MIMIT, G.URL_MASE)), (0, salvato))

    def test_a_pari_data_vince_il_mimit(self):
        settimanale = {"prezzo": 2.2, "data": "2026-10-20", "fonte": "MASE settimanale"}
        self.assertEqual(self.esegui(settimanale, rete())[1], {"prezzo": 2.258, "data": "2026-10-20", "fonte": "MIMIT"})
        mimit = {"prezzo": 2.3, "data": "2026-10-19", "fonte": "MIMIT"}
        self.assertEqual(self.esegui(mimit, rete(G.URL_MIMIT))[1], mimit)

    def test_tutto_fermo_esecuzione_rossa(self):
        salvato = {"prezzo": 2.256, "data": "2026-10-16"}
        self.assertEqual(self.esegui(salvato, rete(*PAGINE)), (1, salvato))

    def test_verifica_serale_tre_giorni_lavorativi(self):
        fermo = rete(*PAGINE)
        dato = {"prezzo": 2.244, "data": "2026-10-19", "fonte": "MASE settimanale"}   # lunedì
        self.assertEqual(self.esegui(dato, fermo, "--verifica", oggi="2026-10-22")[0], 0)  # giovedì: 3 giorni
        self.assertEqual(self.esegui(dato, fermo, "--verifica", oggi="2026-10-23")[0], 1)  # venerdì: 4 giorni
        venerdi = {"prezzo": 2.256, "data": "2026-10-16", "fonte": "MIMIT"}
        self.assertEqual(self.esegui(venerdi, fermo, "--verifica", oggi="2026-10-21")[0], 0)  # sab e dom non contano
        self.assertEqual(self.esegui(venerdi, fermo, "--verifica", oggi="2026-10-22")[0], 1)

    def test_giorni_lavorativi(self):
        self.assertEqual(G.giorni_lavorativi_dopo("2026-10-20", "2026-10-20"), 0)
        self.assertEqual(G.giorni_lavorativi_dopo("2026-10-16", "2026-10-19"), 1)
        self.assertEqual(G.giorni_lavorativi_dopo("2026-10-16", "2026-10-25"), 5)


if __name__ == "__main__":
    unittest.main()
