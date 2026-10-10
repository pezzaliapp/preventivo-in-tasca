/*
 * Verifica del modulo noleggio nel browser:  node tests/e2e/noleggio.mjs
 * La rata mostrata sullo schermo deve coincidere con i risultati di riferimento di Rel01
 * (con l'eccezione dichiarata sulle spese di Ottobre 2026), e il TXT scaricato con il core.
 */
import fs from 'node:fs';
import path from 'node:path';
import { avvia, RADICE, FORMATI } from './aiuti.mjs';
import * as N from '../../js/core/noleggio.js';
import { leggiImporto, numero2 } from '../../js/core/formato.js';

const v = await avvia('Noleggio nel browser');
const dati = N.preparaDati(JSON.parse(fs.readFileSync(path.join(RADICE, 'data/noleggio/coefficienti.json'), 'utf8')));
const G = JSON.parse(fs.readFileSync(path.join(RADICE, 'tests/golden/noleggio.json'), 'utf8'));
const numeroIT = s => Number(String(s).replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.'));

const { ctx, page } = await v.pagina();
async function compila(importo, durata, modalita, p = page) {
  await p.fill('#nol-importo', importo);
  await p.click(`label.seg-voce:has(input[name="nol-durata"][value="${durata}"])`);
}

// 1. Un campione di casi di riferimento, su date diverse (cambio listino compreso)
// importi sotto il minimo finanziabile (eccezione dichiarata, Fase 4): la rata non c'è, c'è il messaggio
// la modalità la decide l'importo (D-40): si confrontano i casi in cui Rel01 usava la stessa
const campione = G.casi.filter((c, i) => !c.avviso && i % 7 === 0 && N.modalitaPerImporto(leggiImporto(c.importo), dati) === c.modalita);
let giusti = 0;
for (const data of [...new Set(campione.map(c => c.data))]) {
  await v.vai(page, 'noleggio', `?data=${data}`);
  for (const c of campione.filter(x => x.data === data)) {
    await compila(c.importo, c.durata, c.modalita);
    const rata = await page.locator('#nol-risultato .grande').textContent();
    const spese = await page.locator('#nol-risultato .riga dd').first().textContent();
    if (numeroIT(rata) !== numeroIT(c.rata)) v.ko(`${data} ${c.importo} ${c.durata} ${c.modalita}: rata ${rata} invece di ${c.rata}`);
    else giusti++;
    const atteseSpese = N.speseContratto(leggiImporto(c.importo), N.listinoAttivo(dati, data), c.modalita);
    if (numeroIT(spese) !== atteseSpese) v.ko(`${data} ${c.importo}: spese ${spese} invece di ${atteseSpese}`);
  }
}
giusti === campione.length ? v.ok(`${giusti} rate sullo schermo uguali a Rel01 (date ${[...new Set(campione.map(c => c.data))].join(', ')})`) : 0;

// 1b. Sotto il minimo: messaggio chiaro, nessuna rata
await v.vai(page, 'noleggio', '?data=2026-10-15');
await compila('1.499', 24, 'mensile');
const msgMin = await page.locator('#nol-importo-msg').textContent();
msgMin === 'Importo sotto il minimo finanziabile da BCC (1.500 €).' ? v.ok('1.499 €: "' + msgMin + '"') : v.ko('minimo: ' + msgMin);
await compila('2.500', 24, 'mensile');
const sotto = await page.locator('#nol-risultato').innerText();
sotto.includes('Rata trimestrale') && sotto.includes('Sotto i 2.700 € BCC prevede il canone trimestrale') ? v.ok('2.500 €: canone trimestrale con la nota BCC') : v.ko('2.500: ' + sotto.slice(0, 120));
await compila('2.700', 24, 'trimestrale');
(await page.locator('#nol-risultato').innerText()).includes('Rata mensile') ? v.ok('2.700 €: solo canone mensile') : v.ko('2.700 non mensile');

// 2. Badge del listino il 14 e il 15 ottobre 2026
for (const [data, nome] of [['2026-10-14', 'Aprile 2026'], ['2026-10-15', 'Ottobre 2026']]) {
  await v.vai(page, 'noleggio', `?data=${data}`);
  const badge = await page.locator('#nol-listino').textContent();
  badge.includes(nome) ? v.ok(`${data}: listino ${nome}${badge.includes('Dal 15/10/2026') ? ' + avviso del prossimo' : ''}`) : v.ko(`${data}: badge "${badge.trim()}"`);
}

// 3. Trimestrale: durata e numero di canoni
await compila('2.000', 12, 'trimestrale');
const desc = await page.locator('#nol-risultato .sottotitolo').first().textContent();
/^12 mesi – 4 canoni trimestrali da [\d.]+,\d{2} €$/.test(desc.trim()) ? v.ok(`trimestrale: "${desc.trim()}"`) : v.ko('trimestrale: ' + desc);

// 4. TXT scaricato identico al core
await compila('18.381,00', 36, 'mensile');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#nol-txt')]);
const testo = fs.readFileSync(await dl.path(), 'utf8');
const atteso = N.testoTXT(18381, 36, 'mensile', '2026-10-15', dati);
testo === atteso.testo && dl.suggestedFilename() === atteso.nomeFile ? v.ok(`TXT scaricato (${dl.suggestedFilename()}) identico al calcolo`) : v.ko('TXT diverso');

// 5. Importo non valido: messaggio sotto il campo, niente risultati
await page.fill('#nol-importo', 'abc');
const msg = await page.locator('#nol-importo-msg').textContent();
const vuoto = (await page.locator('#nol-risultato').innerHTML()).trim() === '';
msg === 'Per favore, inserisci un importo valido.' && vuoto ? v.ok('importo non valido: messaggio chiaro, nessun risultato') : v.ko('importo non valido: ' + msg);

// 6. Le scelte restano dopo la riapertura
await compila('25.000', 48, 'trimestrale');
await page.reload();
await page.waitForSelector('#nol-risultato .grande');
const ripreso = await page.inputValue('#nol-importo');
const dur = await page.locator('input[name="nol-durata"]:checked').getAttribute('value');
ripreso === '25.000' && dur === '48' ? v.ok('importo e durata ricordati alla riapertura') : v.ko(`riapertura: ${ripreso} ${dur}`);
await ctx.close();

// 7. Documenti BCC: 7 PDF raggiungibili
{
  const { ctx, page } = await v.pagina();
  await v.vai(page, 'documenti');
  const link = await page.locator('a[download]').evaluateAll(as => as.map(a => a.href));
  const stati = await Promise.all(link.map(h => page.request.get(h).then(r => r.status() + ' ' + r.headers()['content-type'])));
  link.length === 7 && stati.every(s => s.startsWith('200 application/pdf')) ? v.ok('7 documenti BCC scaricabili') : v.ko('documenti: ' + stati.join(', '));
  await ctx.close();
}

// 7b. Aree di tocco di almeno 48 px anche nella schermata del noleggio
{
  const { ctx, page } = await v.pagina({ viewport: { width: 375, height: 812 } });
  await v.vai(page, 'noleggio', '?data=2026-10-15');
  await compila('18.381,00', 36, 'mensile', page);
  const piccoli = await page.evaluate(() => [...document.querySelectorAll('#vista a[href], #vista button, #vista label.seg-voce, #vista input, #vista select')]
    .filter(e => e.offsetParent !== null).map(e => ({ t: (e.textContent || e.id || '').trim().slice(0, 25), r: e.getBoundingClientRect() }))
    .filter(x => x.r.height < 48 || x.r.width < 48).map(x => `${x.t} ${Math.round(x.r.width)}×${Math.round(x.r.height)}`));
  piccoli.length ? v.ko('aree di tocco sotto 48 px: ' + piccoli.join('; ')) : v.ok('aree di tocco ≥ 48 px nel noleggio');
  await ctx.close();
}

// 8. Schermate
for (const [nome, w, h] of FORMATI) for (const tema of ['light', 'dark']) {
  const { ctx, page } = await v.pagina({ viewport: { width: w, height: h }, colorScheme: tema });
  await v.vai(page, 'noleggio', '?data=2026-10-15');
  await compila('2.000', 36, 'trimestrale', page);
  await page.evaluate(() => document.fonts.ready);
  await v.foto(page, `fase3-noleggio-${nome}-${tema === 'light' ? 'chiaro' : 'scuro'}`);
  if (nome === 'iphone' && tema === 'light') { await v.vai(page, 'documenti'); await v.foto(page, 'fase3-documenti-iphone-chiaro'); }
  await ctx.close();
}
await v.fine();
