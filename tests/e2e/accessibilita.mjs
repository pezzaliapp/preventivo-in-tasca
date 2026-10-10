/*
 * Fase 6 — accessibilità:  node tests/e2e/accessibilita.mjs
 * axe-core (solo strumento di sviluppo, in node_modules: mai nell'app) su ogni schermata e sulle
 * finestre principali, tema chiaro e scuro, regole WCAG 2.0/2.1/2.2 A e AA. Poi: zoom al 200%
 * (320 px) senza scorrimento orizzontale e focus visibile da tastiera su ogni elemento.
 * Listino e book SINTETICI.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { avvia } from './aiuti.mjs';
import { creaPdfDiProva } from './listino-pdf.mjs';
import { BOOK } from '../fixtures/book-sintetico.js';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
const v = await avvia('Accessibilità (axe-core, WCAG 2.2 AA)');
const PDF = await creaPdfDiProva(v.browser);
const REGOLE = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function axe(page, dove) {
  await page.addScriptTag({ path: AXE });
  const r = await page.evaluate(async regole => {
    const res = await window.axe.run(document, { runOnly: { type: 'tag', values: regole }, resultTypes: ['violations'] });
    return res.violations.map(x => ({ id: x.id, impatto: x.impact, aiuto: x.help, nodi: x.nodes.slice(0, 3).map(n => n.target.join(' ') + ' → ' + (n.failureSummary || '').split('\n').slice(1, 2).join(' ').trim()) }));
  }, REGOLE);
  if (r.length) for (const x of r) v.ko(`${dove}: [${x.impatto}] ${x.id} — ${x.aiuto}\n      ${x.nodi.join('\n      ')}`);
  else v.ok(`${dove}: nessuna violazione`);
  return r.length;
}

/** Prepara un preventivo completo: listino, book, righe, trasporto, noleggio, un preventivo salvato. */
async function prepara(page) {
  await v.vai(page, 'prodotti');
  await page.setInputFiles('#vista input[type=file]', PDF);
  await page.waitForSelector('.cfg-passo', { timeout: 30000 });
  await page.evaluate(async b => { const { Store } = await import('./js/store.js'); await Store.set('kv', 'agentPack', { pack: b, packId: 'prova' }); }, BOOK);
  await page.reload(); await page.waitForSelector('.cfg-passo');
  await page.goto(v.url + '#/prodotti/cerca'); await page.waitForSelector('#cerca-q');
  for (const [q, c] of [['pfa40', '03100040'], ['mec 1000', '01100313']]) {
    await page.fill('#cerca-q', q); await page.waitForSelector(`[data-azione="aggiungi"][data-key^="${c}"]`); await page.click(`[data-azione="aggiungi"][data-key^="${c}"]`);
  }
  await page.goto(v.url + '#/consegna'); await page.waitForSelector('.cons-voce');
  while (await page.locator('[data-cons="scegli"]').count()) await page.locator('[data-cons="scegli"]').first().click();
  await page.selectOption('#cons-regione', 'LOMBARDIA'); await page.selectOption('#cons-provincia', 'MI');
  await page.waitForSelector('.soluzione');
  await page.locator('[data-cons="usa"]').first().click();
  await page.goto(v.url + '#/invia'); await page.waitForSelector('[data-inv="salva"]');
  await page.click('[data-inv="salva"]');
  await page.evaluate(() => { localStorage.setItem('pit_trasporto', JSON.stringify({ cart: [{ uid: 1, qty: 1, kind: 'art', artId: 'touch-mec-2000s' }], reg: 'SICILIA', prov: 'PA', opts: { ass: true } })); localStorage.setItem('pit_noleggio', JSON.stringify({ importo: '18.381,00', durata: 36 })); });
}

const SCHERMATE = [
  ['home', 'h1'], ['prodotti', '.cfg-passo'], ['prodotti/cerca', '#cerca-q'], ['prodotti/preventivo', '.riga-prev'],
  ['consegna', '.soluzione'], ['pagamento', '[data-durata]'], ['invia', '[data-inv="stampa"]'], ['archivio', '.arch'],
  ['documenti', '.documento'], ['impostazioni', '[data-imp="carica"]'], ['abbinamenti', '.conteggi'],
  ['trasporto', '.collo'], ['noleggio', '#nol-risultato .grande']
];
let violazioni = 0;
for (const tema of ['light', 'dark']) {
  const { ctx, page } = await v.pagina({ viewport: { width: 412, height: 915 }, colorScheme: tema });
  await ctx.addInitScript(() => { try { delete Navigator.prototype.share; } catch (e) { /* */ } });
  await prepara(page);
  for (const [rotta, attesa] of SCHERMATE) {
    await page.goto(v.url + '#/' + rotta); await page.waitForSelector(attesa, { timeout: 15000 });
    if (rotta === 'prodotti') { await page.click('button.tessera:has-text("Auto")'); await page.click('button.tessera:has-text("Equilibratura")'); }
    if (rotta === 'prodotti/cerca') { await page.fill('#cerca-q', 'f536'); await page.waitForTimeout(300); }
    await page.waitForTimeout(300);
    violazioni += await axe(page, `${tema === 'light' ? 'chiaro' : 'scuro'} #/${rotta}`);
  }
  // finestre
  const finestre = [
    ['scheda prodotto', async () => { await page.goto(v.url + '#/prodotti/cerca'); await page.waitForSelector('#cerca-q'); await page.fill('#cerca-q', 'mec 1000'); await page.click('[data-azione="scheda"][data-key^="01100313"]'); await page.waitForSelector('#fig-canvas'); }],
    ['postazione del book', async () => { await page.goto(v.url + '#/prodotti'); await page.reload(); await page.waitForSelector('.cfg-passo'); await page.click('button.tessera:has-text("Auto")'); await page.click('[data-agente="postazione"][data-id="auto-media-a"]'); await page.waitForSelector('[data-agente="post-aggiungi"]'); }],
    ['listini e aggiornamenti', async () => { await page.goto(v.url + '#/trasporto'); await page.waitForSelector('#tr-listini'); await page.click('#tr-listini'); await page.waitForSelector('.cronologia'); }],
    ['voce libera', async () => { await page.goto(v.url + '#/prodotti/preventivo'); await page.waitForSelector('[data-riga="voce"]'); await page.click('[data-riga="voce"]'); await page.waitForSelector('#vl-nome'); }],
    ['condividi', async () => { await page.goto(v.url + '#/invia'); await page.waitForSelector('[data-inv="condividi"]'); await page.click('[data-inv="condividi"]'); await page.waitForSelector('#cond-testo'); }],
    ['conferma', async () => { await page.goto(v.url + '#/archivio'); await page.waitForSelector('[data-arch="elimina"]'); await page.click('[data-arch="elimina"]'); await page.waitForSelector('[data-r="si"]'); }],
    ['catalogo pesi e misure', async () => { await page.goto(v.url + '#/abbinamenti'); await page.waitForSelector('[data-ver="cambia"]'); await page.locator('[data-ver="cambia"]').first().click(); await page.waitForSelector('#cat-q'); }]
  ];
  for (const [nome, apri] of finestre) {
    await apri();
    violazioni += await axe(page, `${tema === 'light' ? 'chiaro' : 'scuro'} finestra "${nome}"`);
    await page.keyboard.press('Escape');
  }
  if (tema === 'light') {
    await page.goto(v.url + 'strumenti/analisi.html'); await page.waitForSelector('#drop');
    violazioni += await axe(page, 'chiaro strumenti/analisi.html');

    // Focus visibile da tastiera: ogni elemento raggiungibile con Tab ha un contorno di focus
    for (const rotta of ['home', 'prodotti/preventivo', 'consegna', 'pagamento', 'invia']) {
      await page.goto(v.url + '#/' + rotta); await page.reload(); await page.waitForSelector('h1');
      const senza = [];
      for (let i = 0; i < 60; i++) {
        await page.keyboard.press('Tab');
        const f = await page.evaluate(() => {
          const e = document.activeElement; if (!e || e === document.body) return null;
          const cs = getComputedStyle(e);
          const contorno = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2;
          // interruttori e scelte: il focus si vede sul controllo disegnato accanto
          const vicino = e.matches('input[type=checkbox], input[type=radio]') && e.nextElementSibling && getComputedStyle(e.nextElementSibling).outlineStyle !== 'none';
          return { t: (e.textContent || e.id || e.name || e.tagName).trim().slice(0, 30), ok: contorno || vicino };
        });
        if (!f) break;
        if (!f.ok) senza.push(f.t);
      }
      senza.length ? v.ko(`#/${rotta}: focus non visibile su ${[...new Set(senza)].join('; ')}`) : v.ok(`#/${rotta}: focus visibile su ogni elemento raggiungibile con Tab`);
    }
    // Tocco minimo 48 px (regola del progetto) per ogni comando visibile
    await page.setViewportSize({ width: 412, height: 915 });
    const piccoli = [];
    for (const [rotta, attesa] of SCHERMATE) {
      await page.goto(v.url + '#/' + rotta); await page.waitForSelector(attesa, { timeout: 15000 }); await page.waitForTimeout(200);
      const p = await page.evaluate(() => [...document.querySelectorAll('button, a[href], select, input:not([type=hidden]), textarea, [role=button]')]
        .filter(e => e.offsetParent !== null && !e.closest('[hidden], .solo-stampa'))
        .map(e => { const r = (e.matches('input[type=checkbox], input[type=radio]') && e.closest('label') ? e.closest('label') : e).getBoundingClientRect(); return { t: (e.getAttribute('aria-label') || e.textContent || e.id || e.tagName).trim().slice(0, 25), h: Math.round(r.height), w: Math.round(r.width) }; })
        .filter(x => x.h > 0 && (x.h < 48 || x.w < 48)));
      for (const x of p) piccoli.push(`${rotta}: "${x.t}" ${x.w}×${x.h}`);
    }
    piccoli.length ? v.ko('comandi sotto 48 px:\n      ' + piccoli.join('\n      ')) : v.ok(`tocco minimo 48 px su ogni comando di ${SCHERMATE.length} schermate`);
    // Zoom al 200%: 320 px utili, nessuno scorrimento orizzontale in nessuna schermata
    await page.setViewportSize({ width: 320, height: 640 });
    const larghe = [];
    for (const [rotta, attesa] of SCHERMATE) {
      await page.goto(v.url + '#/' + rotta); await page.waitForSelector(attesa, { timeout: 15000 }); await page.waitForTimeout(200);
      const l = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (l > 0) larghe.push(`${rotta} (${l}px)`);
    }
    larghe.length ? v.ko('zoom 200%: scorrimento orizzontale in ' + larghe.join(', ')) : v.ok(`zoom 200%: nessuno scorrimento orizzontale in ${SCHERMATE.length} schermate`);
  }
  await ctx.close();
}
fs.unlinkSync(PDF);
console.log(`\nViolazioni axe: ${violazioni}`);
await v.fine();
