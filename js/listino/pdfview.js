/*
 * Disegna le figure direttamente dal PDF salvato sul dispositivo.
 */
(function (root) {
  'use strict';
  const lib = root.pdfjsLib;
  if (lib) lib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

  let docPromise = null;
  let queue = Promise.resolve();
  const thumbCache = new Map();

  function load(bytes) {
    if (!lib) return Promise.reject(new Error('Lettore PDF non disponibile'));
    // pdf.js trasferisce il buffer al worker: passo sempre una copia
    const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes.slice(0)) : new Uint8Array(bytes);
    return lib.getDocument({ data, isEvalSupported: false, verbosity: 0 }).promise;
  }

  const PdfView = {
    load,
    setSource(getBytes) {
      docPromise = null;
      thumbCache.clear();
      PdfView._getBytes = getBytes;
    },
    doc() {
      if (!docPromise) {
        docPromise = Promise.resolve(PdfView._getBytes ? PdfView._getBytes() : null).then(b => {
          if (!b) throw new Error('Listino non presente sul dispositivo');
          return load(b);
        });
        docPromise.catch(() => { docPromise = null; });
      }
      return docPromise;
    },
    reset() {
      if (docPromise) docPromise.then(d => d.destroy()).catch(() => {});
      docPromise = null;
      thumbCache.clear();
    },

    /** Ritaglio di una pagina come immagine (crop in frazioni 0..1). */
    thumb(pageNo, crop, cssWidth) {
      const key = pageNo + ':' + [crop.x0, crop.x1, crop.y0, crop.y1].map(v => v.toFixed(3)).join(',') + ':' + cssWidth;
      if (thumbCache.has(key)) return thumbCache.get(key);
      const job = queue.then(async () => {
        const doc = await PdfView.doc();
        const page = await doc.getPage(pageNo);
        const base = page.getViewport({ scale: 1 });
        const dpr = Math.min(root.devicePixelRatio || 1, 2);
        const scale = (cssWidth * dpr) / (base.width * (crop.x1 - crop.x0));
        const vp = page.getViewport({ scale });
        const w = Math.round(vp.width * (crop.x1 - crop.x0));
        const h = Math.round(vp.height * (crop.y1 - crop.y0));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.translate(-vp.width * crop.x0, -vp.height * crop.y0);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const url = await new Promise(res => canvas.toBlob(b => res(URL.createObjectURL(b)), 'image/jpeg', 0.82));
        canvas.width = canvas.height = 0;
        return url;
      });
      queue = job.catch(() => {});
      thumbCache.set(key, job);
      job.catch(() => thumbCache.delete(key));
      return job;
    },

    /** Pagina intera in un canvas, larga cssWidth pixel CSS. */
    async page(pageNo, cssWidth, canvas) {
      const doc = await PdfView.doc();
      const page = await doc.getPage(pageNo);
      const base = page.getViewport({ scale: 1 });
      const dpr = Math.min(root.devicePixelRatio || 1, 2.5);
      const vp = page.getViewport({ scale: (cssWidth * dpr) / base.width });
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      return { width: base.width, height: base.height };
    }
  };

  root.PdfView = PdfView;
})(self);
