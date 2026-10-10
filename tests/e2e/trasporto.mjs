/*
 * Verifica del modulo trasporti nel browser:  node tests/e2e/trasporto.mjs
 * Il totale sullo schermo deve coincidere con i risultati di riferimento dell'app originale.
 */
import fs from 'node:fs';
import path from 'node:path';
import { avvia, RADICE, FORMATI } from './aiuti.mjs';

const v = await avvia('Trasporti nel browser');
const G = JSON.parse(fs.readFileSync(path.join(RADICE, 'tests/golden/trasporti.json'), 'utf8'));
const numeroIT = s => Number(String(s).replace(/[€\s ]/g, '').replace(/\./g, '').replace(',', '.'));

// 1. Casi di riferimento (gasolio spento: il prezzo del giorno cambia), caricati come stato salvato
{
  const { ctx, page } = await v.pagina();
  await v.vai(page, 'home');
  const casi = G.casi.filter((c, i) => !c.fuel.on && i % 13 === 0);
  let giusti = 0;
  for (const c of casi) {
    await page.evaluate(c => {
      localStorage.setItem('pit_trasporto', JSON.stringify({ cart: c.cart.map((l, i) => ({ uid: i + 1, ...l })), reg: c.reg, prov: c.prov, opts: c.opts }));
      if (c.adj) localStorage.setItem('pit_trasporto_adj', JSON.stringify(c.adj)); else localStorage.removeItem('pit_trasporto_adj');
      localStorage.setItem('pit_trasporto_fuel', JSON.stringify(c.fuel));
    }, c);
    await page.goto(v.url + '#/home'); await v.vai(page, 'trasporto');
    await page.waitForSelector('#tr-totale');
    const tot = (await page.locator('#tr-totale').textContent()).trim();
    const righe = await page.locator('#tr-righe .bolla-riga').count();
    const atteso = c.R.ready ? c.R.total : null;
    const visto = tot === '—' ? null : numeroIT(tot);
    if (visto !== atteso || righe !== c.R.lines.length) v.ko(`${c.nome} ${c.reg} ${c.prov}: totale ${tot} (${righe} righe) invece di ${atteso} (${c.R.lines.length})`);
    else giusti++;
  }
  giusti === casi.length ? v.ok(`${giusti} casi di riferimento: totale e righe uguali all'app originale`) : 0;
  await page.evaluate(() => localStorage.clear());
  await ctx.close();
}

// 2. Uso vero: ricerca, tastiera, destinazione, servizi, collo manuale, quantità, annulla
{
  const { ctx, page } = await v.pagina({ viewport: { width: 375, height: 812 } });
  await v.vai(page, 'trasporto');
  await page.fill('#tr-cerca', 'touch mec 2000s');
  await page.keyboard.press('Enter');
  const nome = await page.locator('.collo-nome').first().textContent();
  nome === 'TOUCH MEC 2000S' ? v.ok('ricerca + Invio: aggiunto "TOUCH MEC 2000S"') : v.ko('ricerca: ' + nome);
  await page.selectOption('#tr-regione', 'LOMBARDIA');
  await page.selectOption('#tr-provincia', 'MI');
  let tot = await page.locator('#tr-totale').textContent();
  numeroIT(tot) === 86 ? v.ok('Milano, 1 pallet MEDIUM: 86,00 €') : v.ko('Milano: ' + tot);
  await page.click('label.interruttore:has(#tr-ass)');
  tot = await page.locator('#tr-totale').textContent();
  numeroIT(tot) === 88 ? v.ok('con assicurazione: 88,00 €') : v.ko('assicurazione: ' + tot);
  // collo manuale in groupage
  await page.click('#tr-manuale-apri');
  await page.click('label.seg-voce:has(input[value="groupage"])');
  await page.fill('#tr-man-ml', '4'); await page.fill('#tr-man-q', '20'); await page.fill('#tr-man-b', '2');
  await page.click('#tr-man-aggiungi');
  (await page.locator('.collo').count()) === 2 ? v.ok('collo non a catalogo aggiunto') : v.ko('collo manuale non aggiunto');
  // quantità e annulla
  await page.locator('.collo').first().locator('[data-azione="piu"]').click();
  const q = await page.locator('.collo').first().locator('output').textContent();
  q === '2' ? v.ok('quantità +1') : v.ko('quantità: ' + q);
  await page.locator('.collo').first().locator('[data-azione="togli"]').click();
  await page.click('.toast-azione');
  (await page.locator('.collo').count()) === 2 ? v.ok('rimozione annullata con "Annulla"') : v.ko('annulla non ha rimesso il collo');
  // Sardegna: la provincia non serve al groupage
  await page.selectOption('#tr-regione', 'SARDEGNA');
  tot = await page.locator('#tr-totale').textContent();
  tot.trim() !== '—' ? v.ok('Sardegna senza provincia: totale ' + tot.trim()) : v.ko('Sardegna senza totale');
  // finestra dei listini e tasto Indietro
  await page.click('#tr-listini');
  const titolo = await page.locator('#foglio-titolo').textContent();
  await page.goBack();
  const chiusa = (await page.locator('.foglio').count()) === 0 && await page.evaluate(() => location.hash) === '#/trasporto';
  titolo === 'Listini e aggiornamenti' && chiusa ? v.ok('finestra dei listini aperta e chiusa con il tasto Indietro') : v.ko('finestra listini / Indietro');
  // testo copiato
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.click('#tr-copia');
  const testo = await page.evaluate(() => navigator.clipboard.readText());
  /^STIMA COSTO DI TRASPORTO\nData: \d{2}\/\d{2}\/\d{4}\nDestinazione: Sardegna/.test(testo) && /TOTALE: [\d.]+,\d{2}\s€ \+ IVA/.test(testo) ? v.ok('riepilogo copiato con data italiana e totale') : v.ko('testo copiato: ' + testo.slice(0, 120));
  // ricordato alla riapertura
  await page.reload(); await page.waitForSelector('.collo');
  (await page.locator('.collo').count()) === 2 && await page.inputValue('#tr-regione') === 'SARDEGNA' ? v.ok('carico e destinazione ricordati') : v.ko('stato non ricordato');
  await v.foto(page, 'fase3-trasporto-iphone-uso');
  await page.evaluate(() => localStorage.clear());
  await ctx.close();
}

// 3. Aree di tocco e schermate
for (const [nome, w, h] of FORMATI) for (const tema of ['light', 'dark']) {
  const { ctx, page } = await v.pagina({ viewport: { width: w, height: h }, colorScheme: tema });
  await v.vai(page, 'home');
  await page.evaluate(() => localStorage.setItem('pit_trasporto', JSON.stringify({ cart: [{ uid: 1, qty: 1, kind: 'art', artId: 'touch-mec-2000s' }, { uid: 2, qty: 2, kind: 'art', artId: 'l-45-l-45' }], reg: 'SICILIA', prov: 'PA', opts: { ass: true } })));
  await v.vai(page, 'trasporto');
  await page.waitForSelector('.collo');
  if (nome === 'iphone' && tema === 'light') {
    const piccoli = await page.evaluate(() => [...document.querySelectorAll('#vista a[href], #vista button, #vista label.seg-voce, #vista label.interruttore, #vista input:not([type=radio]):not([type=checkbox]), #vista select')]
      .filter(e => e.offsetParent !== null).map(e => ({ t: (e.textContent || e.id || '').trim().slice(0, 25), r: e.getBoundingClientRect() }))
      .filter(x => x.r.height < 48 || x.r.width < 48).map(x => `${x.t} ${Math.round(x.r.width)}×${Math.round(x.r.height)}`));
    piccoli.length ? v.ko('aree di tocco sotto 48 px: ' + piccoli.join('; ')) : v.ok('aree di tocco ≥ 48 px nei trasporti');
    const largo = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    largo > 0 ? v.ko(`scorrimento orizzontale ${largo}px`) : v.ok('nessuno scorrimento orizzontale');
  }
  await page.evaluate(() => document.fonts.ready);
  await v.foto(page, `fase3-trasporto-${nome}-${tema === 'light' ? 'chiaro' : 'scuro'}`);
  await page.evaluate(() => localStorage.clear());
  await ctx.close();
}
await v.fine();
