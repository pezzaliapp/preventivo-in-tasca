/*
 * Verifica nel browser di listino e preventivo:  node tests/e2e/preventivo.mjs
 * Usa un PDF di prova creato dal listino SINTETICO e il book SINTETICO (mai i file veri).
 * Controlla anche che nulla del book finisca nella stampa o nel testo condiviso.
 */
import fs from 'node:fs';
import { avvia, FORMATI } from './aiuti.mjs';
import { creaPdfDiProva } from './listino-pdf.mjs';
import { BOOK } from '../fixtures/book-sintetico.js';

const v = await avvia('Listino e preventivo nel browser');
const PDF = await creaPdfDiProva(v.browser);
const nb = s => String(s).replace(/ /g, ' ');
const { ctx, page } = await v.pagina({ viewport: { width: 412, height: 915 } });
// condivisione di sistema assente (come su molti computer) e stampa intercettata
await ctx.addInitScript(() => { try { delete Navigator.prototype.share; } catch (e) { /* */ } window.print = () => { window.__stampato = (window.__stampato || 0) + 1; }; });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
const testoVisibile = sel => page.locator(sel).first().textContent().then(nb);

// 1. Senza listino
await v.vai(page, 'prodotti');
(await page.locator('h2', { hasText: 'Carica il listino per iniziare' }).count()) ? v.ok('senza listino: "Carica il listino per iniziare"') : v.ko('stato vuoto mancante');

// 2. Caricamento del PDF di prova
await page.setInputFiles('#vista input[type=file]', PDF);
await page.waitForFunction(() => /26 articoli/.test(document.querySelector('.sottotitolo')?.textContent || ''), null, { timeout: 30000 });
v.ok('PDF letto sul dispositivo: 26 articoli');

// 3. Configuratore: Auto → Equilibratura → MEC 1000
await page.click('button.tessera:has-text("Auto")');
await page.click('button.tessera:has-text("Equilibratura")');
const famiglie = await page.locator('.famiglia-titolo').allTextContents();
famiglie.includes('MEC 1000') ? v.ok('configuratore Auto + Equilibratura: ' + famiglie.join(', ')) : v.ko('famiglie: ' + famiglie.join(', '));
// filtro caratteristica
const prima = await page.locator('.famiglia .articolo').count();
const chip = page.locator('[data-azione="cfg-chip"][data-g="feat"]').first();
if (await chip.count()) { await chip.click(); const dopo = await page.locator('.famiglia .articolo').count(); dopo <= prima ? v.ok(`filtro "${nb(await chip.textContent()).trim()}": ${prima} → ${dopo} articoli`) : v.ko('filtro'); await page.click('[data-azione="cfg-togli"]'); }
await page.click('[data-azione="aggiungi"][data-key^="01100313"]');
(await testoVisibile('.schede')).includes('Il preventivo (1)') ? v.ok('aggiunto 01100313: "Il preventivo (1)"') : v.ko('scheda preventivo non aggiornata');

// 4. Scheda prodotto con la pagina del PDF disegnata
await page.click('[data-azione="scheda"][data-key^="01100313"]');
await page.waitForFunction(() => { const c = document.querySelector('#fig-canvas'); return c && c.width > 100; }, null, { timeout: 15000 });
v.ok('scheda prodotto: pagina del listino disegnata dal PDF');
await page.keyboard.press('Escape');
(await page.locator('.foglio').count()) === 0 ? v.ok('scheda chiusa con Esc') : v.ko('scheda non chiusa');

// 5. Ricerca
await v.vai(page, 'prodotti/cerca'.split('/')[0]);
await page.goto(v.url + '#/prodotti/cerca'); await page.waitForSelector('#cerca-q');
await page.fill('#cerca-q', 'f536');
await page.waitForFunction(() => /risultat/.test(document.querySelector('#cerca-risultati')?.textContent || ''));
const codici = await page.locator('#cerca-risultati .codice').allTextContents();
codici.some(c => c.startsWith('02100100')) ? v.ok('ricerca "f536" (sigla attaccata): ' + codici.map(c => c.slice(0, 8)).join(', ')) : v.ko('ricerca: ' + codici.join(','));
await page.click('[data-azione="aggiungi"][data-key^="02100100"]');

// 6. Il preventivo: sconto in cascata, voce libera, IVA, togli e annulla
await page.goto(v.url + '#/prodotti/preventivo'); await page.waitForSelector('#rp-sg');
await page.fill('#rp-sg', '30+5');
const netto1 = nb(await page.locator('[data-uscita^="netto-"]').first().textContent());
netto1 === '6.317,50 €' ? v.ok('sconto 30+5 su 9.500 €: netto 6.317,50 €') : v.ko('netto 30+5: ' + netto1);
await page.click('[data-riga="voce"]');
await page.fill('#vl-nome', 'Trasporto'); await page.fill('#vl-prezzo', '120');
await page.click('#vl-salva');
const tot = nb(await page.locator('#rp-totali .riga-forte dd').first().textContent());
// 9.500 + 7.800 con 30+5, più 120 € senza sconto (riga "0")
const atteso = (9500 + 7800) * 0.7 * 0.95 + 120;
tot === atteso.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' }).replace(/ /g, ' ') ? v.ok(`totale netto ${tot} (voce libera senza sconto generale)`) : v.ko(`totale ${tot} invece di ${atteso}`);
await page.click('label.interruttore:has([data-riga-opz="vatOn"])');
(await testoVisibile('#rp-totali')).includes('Totale IVA inclusa') ? v.ok('IVA 22% e totale ivato') : v.ko('IVA non mostrata');
const righe0 = await page.locator('.riga-prev').count();
await page.locator('.riga-prev').last().locator('[data-riga="togli"]').click();
await page.click('.toast-azione');
(await page.locator('.riga-prev').count()) === righe0 ? v.ok('riga tolta e rimessa con "Annulla"') : v.ko('annulla riga');
await page.fill('#rp-c', 'Officina di prova');
// scrivo e ricarico SUBITO: il preventivo in corso non si deve perdere
await page.reload(); await page.waitForSelector('#rp-c');
(await page.inputValue('#rp-c')) === 'Officina di prova' && (await page.locator('.riga-prev').count()) === righe0 ? v.ok('scritto e ricaricato subito: il preventivo in corso resta') : v.ko('preventivo perso dopo una ricarica immediata');
const barra = nb(await page.locator('#bt-importo').textContent());
/^[\d.]+,\d{2} €/.test(barra) ? v.ok('totale sempre visibile nella barra: ' + barra) : v.ko('barra del totale vuota: ' + barra);

// 7. Invia: salva, condividi, stampa
await page.goto(v.url + '#/invia'); await page.waitForSelector('[data-inv="salva"]');
await page.click('[data-inv="salva"]');
await page.waitForFunction(() => /Preventivo \d{4}\/001/.test(document.querySelector('.sottotitolo')?.textContent || ''));
v.ok('salvato con numero ' + (await testoVisibile('.sottotitolo')).match(/\d{4}\/\d{3}/)[0]);
await page.click('[data-inv="condividi"]');
await page.click('#cond-copia');
const condiviso = await page.evaluate(() => navigator.clipboard.readText());
/^Preventivo \d{4}\/001 per Officina di prova\n/.test(condiviso) && condiviso.includes('• 01100313') ? v.ok('testo da condividere copiato') : v.ko('testo condiviso: ' + condiviso.slice(0, 80));
await page.keyboard.press('Escape');
await page.click('[data-inv="stampa"]');
await page.waitForFunction(() => window.__stampato > 0, null, { timeout: 15000 });
const stampa = nb(await page.locator('#area-stampa').innerText());
/Preventivo \d{4}\/001/.test(stampa) && stampa.includes('Officina di prova') && stampa.includes('Totale IVA inclusa') ? v.ok('stampa A4 preparata (numero, cliente, totali)') : v.ko('stampa: ' + stampa.slice(0, 120));

// 8. Archivio: duplica ed elimina con annulla
await page.goto(v.url + '#/archivio'); await page.waitForSelector('.arch');
await page.click('[data-arch="duplica"]');
await page.waitForFunction(() => location.hash === '#/prodotti/preventivo');
v.ok('duplica: copia aperta nel preventivo');
await page.goto(v.url + '#/archivio'); await page.waitForSelector('.arch');
await page.click('[data-arch="elimina"]');
await page.click('[data-r="si"]');
await page.waitForSelector('.vuoto');
await page.click('.toast-azione');
await page.waitForSelector('.arch');
v.ok('elimina con conferma e "Annulla"');

// 9. Book (sintetico): postazioni, controlli, e niente in stampa o condivisione
await page.evaluate(async b => { const { Store } = await import('./js/store.js'); await Store.set('kv', 'agentPack', { pack: b, packId: 'prova' }); }, BOOK);
await page.goto(v.url + '#/prodotti'); await page.reload();
await page.waitForSelector('.cfg-passo');

// disegni del book scaricati in sottofondo per l'uso offline (P-02)
await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
await page.reload(); await page.waitForSelector('.cfg-passo');
const disegnoInCopia = await page.waitForFunction(async () => !!(await caches.match('data/d/03c89b2a1496afb3c082.bin', { ignoreSearch: true })), null, { timeout: 15000 }).then(() => true).catch(() => false);
disegnoInCopia ? v.ok('book: disegni salvati nella copia offline senza aprirli') : v.ko('disegni del book non salvati per l\'uso offline');

await page.click('button.tessera:has-text("Auto")');
(await page.locator('h2', { hasText: 'Postazioni pronte' }).count()) ? v.ok('book: "Postazioni pronte" dopo la scelta del veicolo') : v.ko('postazioni assenti');
await page.click('[data-agente="postazione"][data-id="auto-media-a"]');
await page.click('[data-agente="post-aggiungi"]');
await page.waitForFunction(() => location.hash === '#/prodotti/preventivo');
await page.waitForSelector('.controlli');
const controlli = nb(await page.locator('.controlli').innerText());
controlli.includes('Solo per te') && controlli.includes('Controlli prima di inviare') ? v.ok('controlli dell\'agente nel preventivo, segnati "Solo per te"') : v.ko('controlli');
await page.goto(v.url + '#/invia'); await page.waitForSelector('[data-inv="stampa"]');
await page.evaluate(() => { window.__stampato = 0; });
await page.click('[data-inv="stampa"]');
await page.waitForFunction(() => window.__stampato > 0, null, { timeout: 15000 });
const stampa2 = nb(await page.locator('#area-stampa').innerText());
await page.click('[data-inv="condividi"]'); await page.click('#cond-copia');
const condiviso2 = await page.evaluate(() => navigator.clipboard.readText());
await page.keyboard.press('Escape');
const riservati = ['Solo per te', 'Controlli prima di inviare', 'Si ripaga in un anno', 'Pacchetto completo.', 'Serve trifase.', 'Officina media.',
  BOOK.transport.warranty, BOOK.transport.tipInstall, ...BOOK.rules.map(r => r.msg)];
const fughe = riservati.filter(t => stampa2.includes(t) || condiviso2.includes(t));
fughe.length ? v.ko('contenuti del book nella stampa o nel testo: ' + fughe.join(' | ')) : v.ok('nessun contenuto del book nella stampa né nel testo condiviso');

// 9b. Nuova versione del lettore del PDF: il listino salvato si rilegge da solo
await page.evaluate(async () => { const { Store } = await import('./js/store.js'); const c = await Store.get('kv', 'catalog'); c.parserVersion = 3; c.products = c.products.slice(0, 2); await Store.set('kv', 'catalog', c); });
await page.goto(v.url + '#/prodotti'); await page.reload();
await page.waitForFunction(() => /26 articoli/.test(document.querySelector('#vista .sottotitolo')?.textContent || ''), null, { timeout: 30000 });
const ver = await page.evaluate(async () => { const { Store } = await import('./js/store.js'); return (await Store.get('kv', 'catalog')).parserVersion; });
ver === 4 ? v.ok('lettore del PDF cambiato: listino riletto da solo dal file salvato (26 articoli, versione 4)') : v.ko('rilettura: versione ' + ver);

// 10. Impostazioni: intestazione in stampa, tema, rimozione del listino
await page.goto(v.url + '#/impostazioni'); await page.waitForSelector('#imp-azienda');
await page.fill('#imp-azienda', 'Rivenditore di prova Srl');
await page.click('label.seg-voce:has(input[value="scuro"])');
(await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark' ? v.ok('tema scuro scelto a mano') : v.ko('tema');
await page.click('label.seg-voce:has(input[value="auto"])');
await page.goto(v.url + '#/invia'); await page.waitForSelector('[data-inv="stampa"]');
await page.evaluate(() => { window.__stampato = 0; });
await page.click('[data-inv="stampa"]');
await page.waitForFunction(() => window.__stampato > 0);
(await page.locator('#area-stampa').innerText()).includes('Rivenditore di prova Srl') ? v.ok('intestazione dell\'azienda nella stampa') : v.ko('intestazione');
await page.goto(v.url + '#/impostazioni'); await page.waitForSelector('[data-imp="rimuovi"]');
await page.click('[data-imp="rimuovi"]'); await page.click('[data-r="si"]');
await page.waitForFunction(() => /Nessun listino caricato/.test(document.querySelector('#vista')?.textContent || ''));
const resta = await page.evaluate(async () => { const { Store } = await import('./js/store.js'); return [await Store.get('files', 'listino'), (await Store.all('quotes')).length]; });
resta[0] === undefined && resta[1] === 1 ? v.ok('listino rimosso dal dispositivo, preventivi salvati rimasti') : v.ko('rimozione: ' + JSON.stringify(resta));
await ctx.close();

// 11. Schermate (listino di prova caricato)
for (const [nome, w, h] of FORMATI) for (const tema of ['light', 'dark']) {
  const { ctx, page } = await v.pagina({ viewport: { width: w, height: h }, colorScheme: tema });
  await v.vai(page, 'prodotti');
  await page.setInputFiles('#vista input[type=file]', PDF);
  await page.waitForSelector('.cfg-passo', { timeout: 30000 });
  await page.click('button.tessera:has-text("Auto")');
  await page.click('button.tessera:has-text("Equilibratura")');
  await page.waitForTimeout(400);
  const t = tema === 'light' ? 'chiaro' : 'scuro';
  await v.foto(page, `fase3-prodotti-${nome}-${t}`);
  await page.click('[data-azione="aggiungi"][data-key^="01100313"]');
  await page.goto(v.url + '#/prodotti/preventivo'); await page.waitForSelector('.riga-prev');
  await page.fill('#rp-sg', '30+5');
  await v.foto(page, `fase3-preventivo-${nome}-${t}`);
  if (nome === 'iphone' && tema === 'light') {
    for (const [rotta, foto] of [['prodotti', null], ['prodotti/preventivo', null], ['invia', 'fase3-invia-iphone-chiaro'], ['archivio', 'fase3-archivio-iphone-chiaro'], ['impostazioni', 'fase3-impostazioni-iphone-chiaro']]) {
      await page.goto(v.url + '#/' + rotta); await page.waitForTimeout(500);
      const piccoli = await page.evaluate(() => [...document.querySelectorAll('#vista a[href], #vista button, #vista label.seg-voce, #vista label.interruttore, #vista input:not([type=radio]):not([type=checkbox]):not([type=file]), #vista select, #vista textarea')]
        .filter(e => e.offsetParent !== null).map(e => ({ t: (e.textContent || e.id || e.getAttribute('aria-label') || '').trim().slice(0, 25), r: e.getBoundingClientRect() }))
        .filter(x => x.r.height < 47.5 || x.r.width < 47.5).map(x => `${x.t} ${Math.round(x.r.width)}×${Math.round(x.r.height)}`));
      piccoli.length ? v.ko(`${rotta}: aree di tocco sotto 48 px: ${piccoli.join('; ')}`) : v.ok(`${rotta}: aree di tocco ≥ 48 px`);
      const largo = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (largo > 0) v.ko(`${rotta}: scorrimento orizzontale ${largo}px`);
      if (foto) await v.foto(page, foto);
    }
  }
  await ctx.close();
}
fs.unlinkSync(PDF);
await v.fine();
