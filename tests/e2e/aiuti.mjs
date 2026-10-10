/* Aiuti comuni degli script di verifica nel browser. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { avviaServer, RADICE } from './server.mjs';

export { RADICE };
export const CARTELLA = path.join(RADICE, 'docs', 'screenshot');
fs.mkdirSync(CARTELLA, { recursive: true });
export const FORMATI = [['iphone', 375, 812], ['android', 412, 915], ['tablet', 768, 1024], ['laptop', 1440, 900]];

export async function avvia(titolo) {
  console.log(titolo);
  const problemi = [];
  const { server, url } = await avviaServer();
  const browser = await chromium.launch();
  const v = {
    url, browser, problemi,
    ok: msg => console.log('  ✔ ' + msg),
    ko: msg => { problemi.push(msg); console.log('  ✖ ' + msg); },
    erroriAttesi: false,
    async pagina(opzioni = {}) {
      const ctx = await browser.newContext(Object.assign({ viewport: { width: 412, height: 915 } }, opzioni));
      const page = await ctx.newPage();
      page.on('console', m => { if (m.type() === 'error' && !v.erroriAttesi) v.ko(`errore in console: ${m.text()}`); });
      page.on('pageerror', e => v.ko(`eccezione: ${e.message}`));
      return { ctx, page };
    },
    async vai(page, rotta, query = '') {
      await page.goto(`${url}${query}#/${rotta}`);
      await page.waitForFunction(r => window.__pit && window.__pit.rotta === r && document.querySelector('h1'), rotta);
    },
    foto: (page, nome) => page.screenshot({ path: path.join(CARTELLA, nome + '.png'), fullPage: true }),
    async fine() {
      await browser.close(); server.close();
      console.log(problemi.length ? `\n${problemi.length} problemi` : '\nTutto a posto');
      process.exit(problemi.length ? 1 : 0);
    }
  };
  return v;
}
