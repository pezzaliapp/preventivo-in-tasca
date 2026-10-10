/* Figure disegnate dal PDF del listino salvato sul dispositivo (PdfView di Listino in tasca). */
import { productCrop, famCrop } from './core/listino.js';
import { listino } from './catalogo.js';

const W = window;
export const PRINT_W = 220;

export function imgMiniatura(crop, w) {
  return `<img alt="" data-thumb-page="${crop.page}" data-crop="${crop.x0},${crop.x1},${crop.y0},${crop.y1}" data-w="${w}">`;
}
export function ritaglioFamiglia(f) { const c = famCrop(f); return c ? Object.assign({ page: f.page }, c) : null; }
export function ritaglioRiga(it) { return it && !it.custom && it.key ? productCrop(listino.catalog, listino.byKey.get(it.key)) : null; }
export function ritaglioArticolo(p) { return productCrop(listino.catalog, p); }

let osservatore = null;
/** Disegna le miniature quando entrano nello schermo. */
export function idrataMiniature(radice) {
  const imgs = [...radice.querySelectorAll('img[data-thumb-page]:not([data-pronta])')];
  if (!imgs.length || !W.PdfView) return;
  if (!osservatore) {
    osservatore = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const img = e.target;
        osservatore.unobserve(img);
        img.dataset.pronta = '1';
        const [x0, x1, y0, y1] = img.dataset.crop.split(',').map(Number);
        W.PdfView.thumb(Number(img.dataset.thumbPage), { x0, x1, y0, y1 }, Number(img.dataset.w) || 120)
          .then(url => { img.src = url; img.classList.add('pronta'); })
          .catch(() => { const t = img.closest('.miniatura'); if (t) t.classList.add('miniatura-assente'); });
      }
    }, { rootMargin: '200px' });
  }
  imgs.forEach(i => osservatore.observe(i));
}

/** Pagina intera in un canvas, con zoom. Restituisce le funzioni per ingrandire. */
export async function disegnaPagina(canvas, contenitore, pagina, evidenzia) {
  let zoom = 1;
  const interno = canvas.parentElement;
  async function disegna() {
    const w = contenitore.clientWidth || 340;
    interno.style.width = (zoom * 100) + '%';
    await W.PdfView.page(pagina, w * zoom, canvas);
  }
  await disegna();
  if (evidenzia && evidenzia.band) contenitore.scrollTop = Math.max(0, evidenzia.band.y0 * canvas.clientHeight - 24);
  return {
    async cambiaZoom() {
      const ratio = contenitore.scrollTop / (contenitore.scrollHeight || 1);
      zoom = zoom === 1 ? 2.2 : 1;
      await disegna();
      contenitore.scrollTop = ratio * contenitore.scrollHeight;
      return zoom;
    }
  };
}

/*
 * Dove sono disegnate le immagini in una pagina del PDF (in frazioni 0..1 della pagina).
 * Si segue la matrice di trasformazione delle istruzioni di disegno di pdf.js: ogni immagine
 * occupa il quadrato unitario trasformato dalla matrice corrente.
 */
const immaginiPagina = new Map();
function moltiplica(m, n) {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}
async function riquadriImmagini(pagina) {
  if (immaginiPagina.has(pagina)) return immaginiPagina.get(pagina);
  const lavoro = (async () => {
    const OPS = W.pdfjsLib.OPS;
    const disegni = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintJpegXObject, OPS.paintImageXObjectRepeat, OPS.paintInlineImageXObjectGroup].filter(x => x !== undefined));
    const doc = await W.PdfView.doc();
    const page = await doc.getPage(pagina);
    const vp = page.getViewport({ scale: 1 });
    const ops = await page.getOperatorList();
    let ctm = [1, 0, 0, 1, 0, 0];
    const pila = [];
    const riquadri = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], args = ops.argsArray[i];
      if (fn === OPS.save) pila.push(ctm);
      else if (fn === OPS.restore) ctm = pila.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = moltiplica(ctm, args);
      else if (fn === OPS.paintFormXObjectBegin && args && args[0]) { pila.push(ctm); ctm = moltiplica(ctm, args[0]); }
      else if (fn === OPS.paintFormXObjectEnd) ctm = pila.pop() || ctm;
      else if (disegni.has(fn)) {
        const m = moltiplica(vp.transform, ctm);
        const punti = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
        const xs = punti.map(p => p[0] / vp.width), ys = punti.map(p => p[1] / vp.height);
        riquadri.push({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
      }
    }
    return riquadri;
  })();
  immaginiPagina.set(pagina, lavoro);
  lavoro.catch(() => immaginiPagina.delete(pagina));
  return lavoro;
}
/** Il ritaglio contiene almeno un pezzo di immagine (non solo testo)? Nel dubbio sì. */
export async function ritaglioConFigura(crop) {
  try {
    const r = await riquadriImmagini(crop.page);
    const minimo = 0.02; // almeno una piccola parte del ritaglio, non un filo ai bordi
    return r.some(b => Math.min(b.x1, crop.x1) - Math.max(b.x0, crop.x0) > minimo && Math.min(b.y1, crop.y1) - Math.max(b.y0, crop.y0) > minimo);
  } catch (e) { return true; }
}
export const svuotaImmaginiPagine = () => immaginiPagina.clear();

/** Prepara le immagini per la stampa del preventivo: solo i ritagli che contengono una figura (D-51). */
export async function immaginiStampa(items) {
  const imgs = {};
  await Promise.all(items.map(async it => {
    const c = ritaglioRiga(it);
    if (!c || !(await ritaglioConFigura(c))) return;
    try { imgs[it.id] = await W.PdfView.thumb(c.page, c, PRINT_W); } catch (e) { /* figura non disponibile */ }
  }));
  return imgs;
}
