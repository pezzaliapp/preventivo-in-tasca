/*
 * Verifica del guscio (Fase 2) nel Chromium già installato:
 *   node tests/e2e/guscio.mjs
 * - installabilità (manifest e service worker, come la controlla Chrome)
 * - apertura offline dopo il primo caricamento
 * - quattro formati di schermo, tema chiaro e scuro, schermate in docs/screenshot/
 * - aree di tocco di almeno 48 px, niente scorrimento orizzontale a 320 px (zoom 200%)
 * - nessun errore in console
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { avviaServer, RADICE } from './server.mjs';

const CARTELLA = path.join(RADICE, 'docs', 'screenshot');
fs.mkdirSync(CARTELLA, { recursive: true });
const FORMATI = [['iphone', 375, 812], ['android', 412, 915], ['tablet', 768, 1024], ['laptop', 1440, 900]];
const problemi = [];
const ok = msg => console.log('  ✔ ' + msg);
const ko = msg => { problemi.push(msg); console.log('  ✖ ' + msg); };

const { server, url } = await avviaServer();
const browser = await chromium.launch();

let erroriAttesi = false; // durante le prove di copia offline rotta gli errori di rete sono voluti
function guardaConsole(page, dove) {
  page.on('console', m => { if (m.type() === 'error' && !erroriAttesi) ko(`errore in console (${dove}): ${m.text()}`); });
  page.on('pageerror', e => ko(`eccezione (${dove}): ${e.message}`));
}

// 1. Installabilità e offline
{
  console.log('Installabilità e offline');
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const page = await ctx.newPage();
  guardaConsole(page, 'offline');
  await page.goto(url + '#/home');
  await page.evaluate(() => { window.__primaPagina = true; });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller).catch(() => {});
  await page.waitForTimeout(600);
  (await page.evaluate(() => window.__primaPagina === true)) ? ok('prima apertura: nessun ricaricamento quando il service worker si attiva') : ko('la prima apertura ricarica la pagina (chi scrive perde i dati)');
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  ok('service worker attivo e in controllo della pagina');
  const cdp = await ctx.newCDPSession(page);
  const { installabilityErrors: errori } = await cdp.send('Page.getInstallabilityErrors');
  errori.length ? ko('non installabile: ' + errori.map(e => e.errorId).join(', ')) : ok('installabile secondo Chrome');
  const man = await cdp.send('Page.getAppManifest');
  man.url && !man.errors.length ? ok('manifest letto senza errori') : ko('manifest: ' + JSON.stringify(man.errors));

  await ctx.setOffline(true);
  for (const rotta of ['#/home', '#/prodotti', '#/noleggio']) {
    await page.goto(url + rotta);
    await page.waitForFunction(r => window.__pit && window.__pit.rotta === r && document.querySelector('h1'), rotta.slice(2), { timeout: 8000 }).catch(() => {});
    const h1 = await page.locator('h1').first().textContent({ timeout: 8000 }).catch(() => null);
    h1 ? ok(`offline ${rotta}: "${h1.trim()}"`) : ko(`offline ${rotta}: pagina vuota`);
  }
  const font = await page.evaluate(() => document.fonts.check('700 24px "Barlow Condensed"'));
  font ? ok('font Barlow disponibili offline') : ko('font non caricati offline');
  const pdfjs = await page.evaluate(() => typeof window.pdfjsLib === 'object' && typeof window.ListinoParser === 'object');
  pdfjs ? ok('lettore PDF e parser del listino caricati offline') : ko('pdf.js o parser mancanti offline');
  await ctx.close();
}

// 2. Formati e temi
console.log('Formati, temi e accessibilità');
for (const [nome, w, h] of FORMATI) {
  for (const tema of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: tema, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    guardaConsole(page, `${nome} ${tema}`);
    for (const rotta of ['home', 'prodotti']) {
      await page.goto(`${url}#/${rotta}`);
      await page.waitForFunction(r => window.__pit && window.__pit.rotta === r, rotta);
      await page.locator('h1').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(CARTELLA, `fase2-${rotta}-${nome}-${tema === 'light' ? 'chiaro' : 'scuro'}.png`) });
    }
    // Aree di tocco: tutto ciò che si clicca è alto e largo almeno 48 px
    await page.goto(`${url}#/home`);
    await page.locator('h1').first().waitFor();
    const piccoli = await page.evaluate(() => [...document.querySelectorAll('a[href], button')]
      .filter(e => e.offsetParent !== null && !e.classList.contains('salta'))
      .map(e => ({ t: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 30), r: e.getBoundingClientRect() }))
      .filter(x => x.r.height < 48 || x.r.width < 48).map(x => `${x.t} ${Math.round(x.r.width)}×${Math.round(x.r.height)}`));
    piccoli.length ? ko(`${nome} ${tema}: aree di tocco sotto 48 px: ${piccoli.join('; ')}`) : ok(`${nome} ${tema}: aree di tocco ≥ 48 px`);
    // Tasto Tab su pagina appena aperta: il primo elemento è "Vai al contenuto" ed è visibile
    await page.reload();
    await page.locator('h1').first().waitFor();
    await page.keyboard.press('Tab');
    const primo = await page.evaluate(() => { const e = document.activeElement; const r = e.getBoundingClientRect(); return { t: e.textContent.trim(), vis: r.top >= 0 && r.height > 0 }; });
    primo.t === 'Vai al contenuto' && primo.vis ? ok(`${nome} ${tema}: navigazione da tastiera, link "Vai al contenuto" visibile`) : ko(`${nome} ${tema}: primo Tab su "${primo.t}"`);
    await ctx.close();
  }
}

// 3. Zoom al 200%: 320 px di larghezza utile, niente scorrimento orizzontale
{
  const ctx = await browser.newContext({ viewport: { width: 320, height: 640 } });
  const page = await ctx.newPage();
  for (const rotta of ['home', 'prodotti']) {
    await page.goto(`${url}#/${rotta}`);
    await page.waitForFunction(r => window.__pit && window.__pit.rotta === r, rotta);
    const largo = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    largo > 0 ? ko(`zoom 200% ${rotta}: ${largo}px di scorrimento orizzontale`) : ok(`zoom 200% ${rotta}: nessuno scorrimento orizzontale`);
  }
  await page.screenshot({ path: path.join(CARTELLA, 'fase2-prodotti-zoom200.png') });
  await ctx.close();
}

// 4. Tema scelto a mano (impostazione salvata) vince su quello del sistema
{
  const ctx = await browser.newContext({ colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.evaluate(() => localStorage.setItem('pit_tema', '"scuro"'));
  await page.reload();
  await page.locator('h1').first().waitFor();
  const sfondo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  sfondo === 'rgb(17, 23, 28)' ? ok('tema scuro scelto a mano applicato con sistema chiaro') : ko('tema manuale non applicato: ' + sfondo);
  await ctx.close();
}

// 5. Le app vecchie sulla stessa origine svuotano le cache (e i trasporti tolgono i service worker)
{
  console.log('Cache svuotata da un\'altra app');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  guardaConsole(page, 'riparazione');
  const pronta = async () => { await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForFunction(() => !!navigator.serviceWorker.controller); };
  const svuota = () => page.evaluate(async () => { for (const k of await caches.keys()) await caches.delete(k); });
  const stato = () => page.evaluate(async () => (await import('./js/app.js')).statoCopiaOffline(true));
  await page.goto(url + '#/home'); await pronta(); await page.reload(); await pronta();

  // a) cache svuotata, apertura con rete: si ricostruisce da sola
  await svuota();
  await page.reload(); await pronta();
  const st = await stato();
  st.completa ? ok('con rete la copia offline si ricostruisce da sola') : ko('copia non ricostruita: ' + JSON.stringify(st));

  // b) cache svuotata e niente rete: messaggio chiaro, non pagina bianca
  erroriAttesi = true;
  await svuota();
  await ctx.setOffline(true);
  await page.reload().catch(() => {});
  const testo = await page.locator('h1').first().textContent().catch(() => '');
  /copia offline non è disponibile/i.test(testo) ? ok('offline senza copia: messaggio "' + testo.trim() + '"') : ko('offline senza copia: ' + JSON.stringify(testo));
  await page.screenshot({ path: path.join(CARTELLA, 'fase3-offline-senza-copia.png') });

  // c) copia parziale (manca una schermata): messaggio dentro l'app
  await ctx.setOffline(false);
  await page.reload(); await pronta();
  await page.locator('h1', { hasText: 'Cosa vuoi fare?' }).waitFor();
  await stato();
  await page.evaluate(async () => { const k = (await caches.keys()).find(n => n.startsWith('pit-')); const c = await caches.open(k); for (const r of await c.keys()) if (/moduli\/prodotti\.js/.test(r.url)) await c.delete(r); });
  await ctx.setOffline(true);
  await page.reload();
  await page.evaluate(() => { location.hash = '#/prodotti'; });
  await page.waitForFunction(() => /non si è caricata/.test(document.querySelector('h1')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  const t2 = await page.locator('h1').first().textContent();
  await page.screenshot({ path: path.join(CARTELLA, 'fase3-offline-copia-parziale.png') });
  /non si è caricata/.test(t2) ? ok('copia parziale offline: "' + t2.trim() + '"') : ko('copia parziale offline: ' + t2);
  await ctx.setOffline(false);
  erroriAttesi = false;

  // d) service worker tolto e cache svuotata (come fa l'aggiornamento dei trasporti): alla riapertura si rimette
  await page.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); });
  await page.goto(url + '#/home'); await page.reload(); await pronta();
  const st2 = await stato();
  st2.completa ? ok('service worker tolto da un\'altra app: rimesso e copia ricostruita') : ko('dopo la rimozione del service worker: ' + JSON.stringify(st2));
  await ctx.close();
}

await browser.close();
server.close();
console.log(problemi.length ? `\n${problemi.length} problemi` : '\nTutto a posto');
process.exit(problemi.length ? 1 : 0);
