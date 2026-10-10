/*
 * Date in fuso italiano, indipendenti dal fuso del dispositivo. Funzioni pure:
 * l'istante "adesso" entra come parametro, così i test provano qualsiasi giorno.
 */

export const FUSO = 'Europe/Rome';
const RE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** Valore di ?data=AAAA-MM-GG nell'indirizzo, se valido (anteprima di una data). */
export function dataDaIndirizzo(search) {
  try {
    const v = new URLSearchParams(search || '').get('data');
    return v && RE_ISO.test(v) ? v : null;
  } catch (e) { return null; }
}

/** Oggi come "AAAA-MM-GG" nel fuso italiano. `anteprima` (da ?data=) ha la precedenza. */
export function oggiISO(adesso = new Date(), anteprima = null, fuso = FUSO) {
  if (anteprima && RE_ISO.test(anteprima)) return anteprima;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(adesso);
    const get = t => parts.find(p => p.type === t).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch (e) {
    const pad = n => String(n).padStart(2, '0');
    return `${adesso.getFullYear()}-${pad(adesso.getMonth() + 1)}-${pad(adesso.getDate())}`;
  }
}

/** "2026-10-15" → "15/10/2026" (noleggio). */
export function isoToIT(iso) {
  const p = String(iso).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
}

/** "2026-10" → "ottobre 2026"; "2026-10-15" → "15/10/2026" o, lungo, "15 ottobre 2026" (trasporti). */
export function dataIt(iso, lungo = false) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(iso || '');
  if (!m) return iso || '';
  if (!m[3]) return `${MESI[+m[2] - 1]} ${m[1]}`;
  return lungo ? `${+m[3]} ${MESI[+m[2] - 1]} ${m[1]}` : `${m[3]}/${m[2]}/${m[1]}`;
}

/** Data di un istante (stringa ISO o Date) scritta all'italiana, nel fuso italiano: "10/10/2026". */
export function dataBreve(istante, fuso = FUSO) {
  return new Date(istante).toLocaleDateString('it-IT', { timeZone: fuso });
}
