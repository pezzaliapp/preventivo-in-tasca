/*
 * Crea un PDF di prova dal listino SINTETICO (tests/fixtures/listino-sintetico.js), con Chromium.
 * Testo inventato: serve solo a provare l'app nel browser. Il file non entra nella repo
 * (*.pdf è escluso da .gitignore) e viene cancellato dagli script che lo usano.
 */
import path from 'node:path';
import { PAGINE } from '../fixtures/listino-sintetico.js';
import { RADICE } from './server.mjs';

const H = 842;
export const FILE_PDF = path.join(RADICE, 'tests', 'e2e', '.prova-listino.pdf');

export async function creaPdfDiProva(browser) {
  // una vera immagine (pixel PNG ingrandito) nella zona della figura della pagina 3 (MEC 1000):
  // serve a provare che in stampa entrano solo i ritagli con una figura
  const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const figura = n => n === 2 ? `<img src="data:image/png;base64,${PIXEL}" style="position:absolute;left:40pt;top:140pt;width:200pt;height:240pt">` : '';
  const pagine = PAGINE.map((items, n) => `<section class="p">${figura(n)}${items.map(it => {
    const [size, rot, , , x, f] = it.transform;
    const y = H - f; // linea di base, misurata dall'alto
    return `<span style="left:${x}pt;top:${(y - size * 0.8).toFixed(2)}pt;font-size:${size}pt${rot ? ';transform:rotate(90deg);transform-origin:0 0' : ''}">${it.str.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`;
  }).join('')}</section>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: 595pt 842pt; margin: 0 }
    body { margin: 0; font-family: Helvetica, Arial, sans-serif }
    .p { position: relative; width: 595pt; height: 842pt; overflow: hidden; break-after: page }
    span { position: absolute; white-space: pre; line-height: 1 }
  </style></head><body>${pagine}</body></html>`;
  const page = await browser.newPage();
  await page.setContent(html);
  await page.pdf({ path: FILE_PDF, preferCSSPageSize: true, printBackground: false });
  await page.close();
  return FILE_PDF;
}
