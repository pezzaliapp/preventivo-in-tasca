/*
 * Verifica del percorso completo (Fase 4):  node tests/e2e/percorso.mjs
 * Prodotti → Consegna (groupage e pallet affiancati) → Pagamento (noleggio) → Invia (stampa).
 * Listino e book SINTETICI. I numeri sullo schermo si confrontano con il core in Node.
 */
import fs from 'node:fs';
import path from 'node:path';
import { avvia, RADICE, CARTELLA } from './aiuti.mjs';
import { creaPdfDiProva } from './listino-pdf.mjs';
import * as T from '../../js/core/trasporti.js';
import * as N from '../../js/core/noleggio.js';

const leggi = rel => JSON.parse(fs.readFileSync(path.join(RADICE, rel), 'utf8'));
const D = Object.fromEntries(['listini', 'pallet', 'groupage', 'articoli', 'geo', 'gasolio'].map(k => [k, leggi(`data/trasporti/${k}.json`)]));
const calc = T.creaTrasporti(D);
const datiNol = N.preparaDati(leggi('data/noleggio/coefficienti.json'));
const nb = s => String(s).replace(/ /g, ' ');
const numeroIT = s => Number(nb(s).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));

const v = await avvia('Percorso completo nel browser');
const PDF = await creaPdfDiProva(v.browser);

async function preparaPreventivo(page) {
  await v.vai(page, 'prodotti');
  await page.setInputFiles('#vista input[type=file]', PDF);
  await page.waitForSelector('.cfg-passo', { timeout: 30000 });
  await page.goto(v.url + '#/prodotti/cerca'); await page.waitForSelector('#cerca-q');
  for (const [q, codice] of [['pfa40', '03100040'], ['f536', '02100101'], ['mec 1000', '01100313'], ['flangia', '25100040']]) {
    await page.fill('#cerca-q', q);
    await page.waitForSelector(`[data-azione="aggiungi"][data-key^="${codice}"]`);
    await page.click(`[data-azione="aggiungi"][data-key^="${codice}"]`);
  }
  await page.goto(v.url + '#/prodotti/preventivo'); await page.waitForSelector('#rp-sg');
  await page.fill('#rp-c', 'Officina di prova'); await page.fill('#rp-sg', '25');
}

const { ctx, page } = await v.pagina({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { try { delete Navigator.prototype.share; } catch (e) { /* */ } window.print = () => { window.__stampato = (window.__stampato || 0) + 1; }; });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
await preparaPreventivo(page);

// 1. Consegna: abbinamenti
await page.goto(v.url + '#/consegna'); await page.waitForSelector('.cons-voce');
const stati = await page.locator('.cons-voce').evaluateAll(li => li.map(l => l.innerText.replace(/\s+/g, ' ')));
const trova = c => stati.find(s => s.includes(c)) || '';
/Abbinato Pesi e misure: PFA 40/.test(trova('03100040')) ? v.ok('PFA 40 abbinato da solo al catalogo pesi e misure') : v.ko('PFA 40: ' + trova('03100040'));
// "F 536S GT racing": nel catalogo ci sono "F 536S GT" e "F 536S GT RACING + BRACCIO": nel dubbio si sceglie a mano
/Da scegliere/.test(trova('02100101')) && /F 536S GT RACING \+ BRACCIO/.test(trova('02100101')) ? v.ok('F 536S GT racing: due modelli possibili, resta "da scegliere"') : v.ko('F 536S: ' + trova('02100101'));
/Da scegliere/.test(trova('01100313')) ? v.ok('MEC 1000: abbinamento incerto, proposte da scegliere') : v.ko('MEC 1000: ' + trova('01100313'));
/Escluso Accessorio/.test(trova('25100040')) ? v.ok('accessorio senza abbinamento: escluso, viaggia con la macchina') : v.ko('accessorio: ' + trova('25100040'));
await page.locator('.cons-voce', { hasText: '01100313' }).locator('[data-cons="scegli"]').first().click();
const scelto = await page.locator('.cons-voce', { hasText: '01100313' }).innerText();
/Scelto/.test(scelto) ? v.ok('proposta scelta con un tocco: ' + scelto.match(/Pesi e misure: ([^·]+)/)[1].trim()) : v.ko('scelta MEC');

// 2. Destinazione: con una macchina ancora da scegliere niente totali né "Usa questa"
await page.selectOption('#cons-regione', 'LOMBARDIA');
await page.selectOption('#cons-provincia', 'MI');
const bloccato = nb(await page.locator('.avviso-grande').innerText().catch(() => ''));
(await page.locator('.soluzione').count()) === 0 && (await page.locator('[data-cons="usa"]').count()) === 0 && /Manca il peso di: F 536S GT racing con premitallone/.test(bloccato)
  ? v.ok('macchina non abbinata: nessun totale, avviso "Manca il peso di: F 536S GT racing con premitallone"') : v.ko('totali mostrati con una macchina non abbinata: ' + bloccato);
await page.click('[data-cons="vai"][data-code="02100101"]');
await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'voce-02100101');
v.ok('"sceglilo qui" porta alla riga da sistemare');
await page.locator('.cons-voce', { hasText: '02100101' }).locator('[data-cons="scegli"]', { hasText: /^F 536S GT$/ }).click();
// servizi
await page.click('label.interruttore:has([data-opz="ass"])');
await page.waitForSelector('.soluzione');
const titoli = await page.locator('.soluzione h3').allTextContents();
titoli.slice(0, 2).join(' | ') === 'Tutto in groupage | Tutto su pallet' ? v.ok('due soluzioni affiancate: ' + titoli.join(' | ')) : v.ko('soluzioni: ' + titoli.join(' | '));

// 3. Numeri uguali al core sugli stessi dati
const S = await page.evaluate(async () => {
  const { stato } = await import('./js/stato.js');
  const { Pref } = await import('./js/store.js');
  return { consegna: stato.preventivo.consegna, items: stato.preventivo.items.filter(i => !i.custom).map(i => ({ code: i.code, qty: i.qty })), abb: Pref.get('abbinamenti', {}) };
});
const artPer = { '03100040': 'pfa-40', '02100101': 'f-536s-gt' };
const sceltaMec = S.abb['01100313'] && S.abb['01100313'].artId;
const cart = S.items.filter(i => i.code !== '25100040').map((i, k) => ({ uid: k + 1, qty: i.qty, kind: 'art', artId: i.code === '01100313' ? sceltaMec : artPer[i.code] }));
if (cart.some(c => !D.articoli.some(a => a.id === c.artId))) v.ko('id del catalogo non trovati: ' + JSON.stringify(cart));
const Sc = { cart, reg: 'LOMBARDIA', prov: 'MI', opts: Object.assign({ ass: false, pre: false, dis: false, disEur: 0 }, S.consegna.opts) };
const atteso = { groupage: calc.soluzione(Sc, 0, T.FUEL_DEFAULTS, 'groupage'), pallet: calc.soluzione(Sc, 0, T.FUEL_DEFAULTS, 'pallet') };
for (const [i, m] of [[0, 'groupage'], [1, 'pallet']]) {
  const tot = numeroIT(await page.locator('.soluzione .sol-totale').nth(i).innerText());
  tot === atteso[m].R.total ? v.ok(`${m}: ${tot} € come il calcolo dell'app trasporti`) : v.ko(`${m}: ${tot} invece di ${atteso[m].R.total}`);
}
const testoG = nb(await page.locator('.soluzione').nth(0).innerText());
/Calcolato su: PFA 40 elettroidraulico, F 536S GT racing con premitallone, MEC 1000 versione base/.test(testoG) && !/Calcolato su:[^\n]*Flangia/.test(testoG)
  ? v.ok('"Calcolato su": le macchine incluse, senza l\'accessorio escluso') : v.ko('calcolato su: ' + (testoG.match(/Calcolato su:[^\n]*/) || [''])[0]);
/Carico\s+.* m · \d+ bancal.* · .* q/.test(testoG) && /(Tariffa minima \(carico sotto la prima fascia: 3 m · 7 bancali · 40 q\)|Fascia fino a .* decisa da)/.test(testoG) ? v.ok('groupage: carico e frase della fascia ("' + testoG.match(/(Tariffa minima[^\n]*|Fascia fino a[^\n]*)/)[0] + '")') : v.ko('groupage senza carico/fascia');
const testoP = nb(await page.locator('.soluzione').nth(1).innerText());
/PFA 40: per misure o peso non può viaggiare su pallet/.test(testoP) ? v.ok('pallet: frase chiara per ciò che non può andare su pallet') : v.ko('pallet senza frase: ' + testoP.slice(0, 200));
/(MINI|QUARTER|HALF|MEDIUM|LIGHT|LARGE|FULL|BIG|MEGA)/.test(testoP) ? v.ok('pallet: tipo di ogni pallet con il suo costo') : v.ko('pallet senza tipi');
/Assicurazione all risk/.test(testoG) && /Assicurazione all risk/.test(testoP) ? v.ok('assicurazione applicata a entrambe') : v.ko('servizi non su entrambe');
const migliore = await page.locator('.soluzione-migliore h3').first().textContent();
const piuBassa = atteso.groupage.R.total <= atteso.pallet.R.total ? 'Tutto in groupage' : 'Tutto su pallet';
migliore === piuBassa ? v.ok('evidenziata la più conveniente: ' + migliore) : v.ko(`evidenziata ${migliore}, attesa ${piuBassa}`);
await v.foto(page, 'fase4-consegna-laptop-chiaro');

// 3b. Colli sovrapponibili (PFA 40): interruttore spento di base; acceso, i colli si impilano
const interr = page.locator('label.interruttore:has([data-opz="impila"])');
(await interr.count()) && !(await page.isChecked('[data-opz="impila"]')) ? v.ok('"Colli sovrapponibili" presente (c\'è la PFA 40) e spento di base') : v.ko('interruttore impila');
const mlSpento = (await page.locator('.soluzione').nth(0).innerText()).match(/Carico\s+([\d,]+) m/)[1];
await interr.click();
const testoImp = nb(await page.locator('.soluzione').nth(0).innerText());
const mlAcceso = testoImp.match(/Carico\s+([\d,]+) m/)[1];
// le colonne della PFA sono lunghe 4,8 m: oltre 2,4 m decide la lunghezza, e impilare non la accorcia
/Impilamento senza effetto: i metri li decide la lunghezza \(4,8 m\)/.test(testoImp) && !/Colli impilati/.test(testoImp) && numeroIT(mlAcceso) === numeroIT(mlSpento) ? v.ok(`acceso con la PFA: "Impilamento senza effetto: i metri li decide la lunghezza (4,8 m)", metri ${mlAcceso}`) : v.ko('impilamento: ' + JSON.stringify(testoImp.slice(0, 700)) + ' spento ' + mlSpento);
await interr.click();
(numeroIT(await page.locator('.soluzione .sol-totale').nth(0).innerText())) === atteso.groupage.R.total ? v.ok('rispento: di nuovo il totale dell\'app trasporti') : v.ko('rispento: totale diverso');

// 4. "Usa questa": riga trasporto con sconto 0
await page.locator('.soluzione-migliore [data-cons="usa"]').click();
const riga = await page.evaluate(async () => (await import('./js/stato.js')).stato.preventivo.items.find(i => i.trasporto));
riga && riga.disc === '0' && /^Trasporto (in groupage|su pallet) a Milano \(MI\)$/.test(riga.name) && riga.dettaglio === 'Assicurazione all risk inclusa.' && riga.price === (piuBassa === 'Tutto in groupage' ? atteso.groupage : atteso.pallet).R.total
  ? v.ok(`riga trasporto per il cliente: "${riga.name}" ${riga.price} €, sconto 0 — "${riga.dettaglio}"`) : v.ko('riga trasporto: ' + JSON.stringify(riga));
/\d+ m\b|bancal|\bq\b|Adeguamento|dispositivo/i.test(riga.name + ' ' + riga.dettaglio) ? v.ko('dati tecnici o interni nella riga per il cliente') : v.ok('riga per il cliente senza metri, bancali, quintali né adeguamenti');

// 5. Pagamento (data fissa 10/10/2026: c'è già il listino futuro del 15/10)
await page.goto(v.url + '?data=2026-10-10#/pagamento'); await page.waitForSelector('[data-durata]');
const op = await page.evaluate(async () => { const { stato } = await import('./js/stato.js'); return stato.preventivo; });
const listino = N.listinoAttivo(datiNol, '2026-10-10');
const attesoOp = N.opzionePreventivo(op, datiNol, listino);
const rate = (await page.locator('.tabella tbody tr td.num b').allTextContents()).map(numeroIT);
JSON.stringify(rate) === JSON.stringify(attesoOp.rate.map(r => r.rata)) ? v.ok(`6 rate sul netto ${attesoOp.base} € (trasporto incluso): ${rate.join(' · ')}`) : v.ko(`rate ${rate} invece di ${attesoOp.rate.map(r => r.rata)}`);
(await page.locator('input[name="pag-modalita"]').count()) === 0 && /Canone mensile/.test(await page.locator('#vista').innerText()) ? v.ok('oltre 2.700 €: solo canone mensile, nessuna scelta') : v.ko('scelta del canone ancora presente');
const riep6 = nb(await page.locator('.riep-rata').innerText());
/^Noleggio da [\d.]+,\d{2} € al mese — scegli le durate in Pagamento$/.test(riep6) ? v.ok('riepilogo con 6 durate: "' + riep6 + '"') : v.ko('riepilogo 6 durate: ' + riep6);
await page.uncheck('[data-durata="12"]'); await page.uncheck('[data-durata="18"]'); await page.uncheck('[data-durata="48"]');
const riep3 = nb(await page.locator('.riep-rata').innerText());
/^Noleggio al mese: 24 mesi [\d.]+,\d{2} € · 36 mesi [\d.]+,\d{2} € · 60 mesi [\d.]+,\d{2} €$/.test(riep3) ? v.ok('riepilogo con 3 durate: "' + riep3 + '"') : v.ko('riepilogo 3 durate: ' + riep3);
await page.check('[data-durata="48"]');
await page.fill('#pag-contributo', '2'); await page.keyboard.press('Enter');
const agente = nb(await page.locator('#vista').innerText());
/Contributo fornitore\s+2,00% = −/.test(agente) && /Base usata per la rata/.test(agente) ? v.ok('schermo dell\'agente: base piena, contributo e base usata') : v.ko('base/contributo non mostrati');
const ante = nb(await page.locator('.anteprima-noleggio').innerText());
/^Canone mensile, IVA esclusa, trasporto incluso\.$/m.test(ante) && /Rate valide fino al 14\/10\/2026/.test(ante) && /24 mesi – 24 canoni mensili/.test(ante) && !/12 mesi –/.test(ante)
  ? v.ok('anteprima: "Canone mensile, IVA esclusa, trasporto incluso", "Rate valide fino al 14/10/2026", 4 durate') : v.ko('anteprima: ' + ante.slice(0, 260));
const conTr = numeroIT(await page.locator('.riga-forte dd').first().innerText());
await page.click('label.interruttore:has([data-pag="includiTrasporto"])');
const senzaTr = numeroIT(await page.locator('.riga-forte dd').first().innerText());
Math.abs(conTr - senzaTr - riga.price) < 0.01 ? v.ok(`interruttore trasporto: ${conTr} € → ${senzaTr} €`) : v.ko(`interruttore trasporto ${conTr} → ${senzaTr}`);
await page.click('label.interruttore:has([data-pag="includiTrasporto"])');
const fasce = await page.locator('section[aria-labelledby="pag-doc"] h3').allTextContents();
fasce.length >= 1 && fasce[0].startsWith('Fascia A') ? v.ok('documenti da chiedere: ' + fasce.map(f => f.slice(0, 8)).join(', ')) : v.ko('documenti per fascia');
await v.foto(page, 'fase4-pagamento-laptop-chiaro');

// 6. Invia: stampa e testo, senza dati interni
await page.goto(v.url + '?data=2026-10-10#/invia'); await page.waitForSelector('[data-inv="stampa"]');
await page.evaluate(() => { window.__stampato = 0; });
await page.click('[data-inv="stampa"]');
await page.waitForFunction(() => window.__stampato > 0, null, { timeout: 15000 });
const stampa = nb(await page.locator('#area-stampa').innerText());
const riquadro = nb(await page.locator('#area-stampa .pr-noleggio').innerText());
const rigaTr = nb(await page.locator('#area-stampa tr', { hasText: 'Trasporto' }).innerText());
/\d+,\d+ m|bancal|\d q\b/.test(rigaTr) ? v.ko('stampa: dati tecnici nella riga trasporto: ' + rigaTr) : v.ok('stampa: riga trasporto senza dati tecnici ("' + rigaTr.replace(/\s+/g, ' ').trim() + '")');
const immagini = await page.locator('#area-stampa img').count();
const conFigura = await page.locator('#area-stampa tr', { hasText: '01100313' }).locator('img').count();
immagini === 1 && conFigura === 1 ? v.ok('stampa: immagine solo per la MEC 1000 (unico ritaglio con una figura), nessuna per i ritagli di solo testo') : v.ko(`stampa: ${immagini} immagini (MEC: ${conFigura})`);
/Oppure a noleggio operativo/i.test(riquadro) && (riquadro.match(/canoni mensili/g) || []).length === 4 && /spese di contratto pari a/.test(riquadro) && /All-Risk/.test(riquadro) && /Trasporto (in groupage|su pallet) a Milano \(MI\)/.test(stampa)
  ? v.ok('stampa: trasporto con dettaglio e riquadro noleggio (4 durate, spese, All-Risk, primo canone)') : v.ko('stampa: ' + riquadro.slice(0, 300));
/Rate valide fino al 14\/10\/2026/.test(riquadro) ? v.ok('stampa: "Rate valide fino al 14/10/2026" in evidenza') : v.ko('validità assente');
const base = numeroIT(attesoOp.base.toFixed(2)).toLocaleString('it-IT', { minimumFractionDigits: 2, useGrouping: 'always' });
!/calcolato su|contributo|Al giorno|2,00%/i.test(riquadro) && !riquadro.includes(base) ? v.ok('stampa: nessuna base in cifre, nessun contributo, nessun costo al giorno') : v.ko('dati interni nel riquadro: ' + riquadro.slice(0, 200));
/Prezzi IVA esclusa\. Trasporto incluso come indicato\./.test(stampa) && !/trasporto esclusi/.test(stampa) ? v.ok('nota per il cliente: "Prezzi IVA esclusa. Trasporto incluso come indicato."') : v.ko('nota: ' + stampa.slice(-300));
await page.click('[data-inv="condividi"]'); await page.click('#cond-copia');
const testo = await page.evaluate(() => navigator.clipboard.readText());
/^Canone mensile, IVA esclusa, trasporto incluso\.$/m.test(testo) && /RATE VALIDE FINO AL 14\/10\/2026/.test(testo) && !/contributo|calcolato su/i.test(testo) ? v.ok('testo condiviso: rate, validità, nessun dato interno') : v.ko('testo: ' + testo.slice(-400));
await page.keyboard.press('Escape');
await page.emulateMedia({ media: 'print' });
await page.setViewportSize({ width: 794, height: 1123 });
const visibiliInStampa = await page.evaluate(() => ['.barra-totale', '.guscio', '.toast', '.foglio'].filter(s => { const e = document.querySelector(s); return e && getComputedStyle(e).display !== 'none'; }));
visibiliInStampa.length ? v.ko('in stampa compaiono anche: ' + visibiliInStampa.join(', ')) : v.ok('in stampa solo il preventivo');
await page.screenshot({ path: path.join(CARTELLA, 'fase4-preventivo-stampato.png'), fullPage: true });
await page.pdf({ path: path.join(RADICE, 'tests', 'e2e', '.prova-preventivo-stampato.pdf'), format: 'A4' });
await page.emulateMedia({ media: 'screen' });
await page.setViewportSize({ width: 1440, height: 900 });
// nota scritta a mano che contraddice il trasporto: non si tocca, ma si segnala
await page.goto(v.url + '#/prodotti/preventivo'); await page.waitForSelector('#rp-note');
await page.fill('#rp-note', 'Prezzi IVA esclusa, trasporto escluso.');
await page.goto(v.url + '#/invia'); await page.waitForSelector('[data-inv="stampa"]');
const avvisoNota = await page.locator('.avviso-errore').first().innerText().catch(() => '');
/trasporto è escluso, ma nel preventivo c'è la riga del trasporto/.test(avvisoNota) ? v.ok('nota scritta a mano lasciata com\'è, contraddizione segnalata') : v.ko('contraddizione non segnalata');
(await page.evaluate(async () => (await import('./js/stato.js')).stato.preventivo.notes)) === 'Prezzi IVA esclusa, trasporto escluso.' ? v.ok('la nota dell\'utente non è stata cambiata') : v.ko('nota dell\'utente cambiata');

// 6b. Verifica abbinamenti
await page.goto(v.url + '#/abbinamenti'); await page.waitForSelector('.conteggi');
const conteggi = (await page.locator('.conteggi p').allInnerTexts()).map(t => t.replace(/\s+/g, ' '));
const righeV = await page.locator('.cons-voce').count();
const nMacchine = await page.evaluate(async () => { const { listino } = await import('./js/catalogo.js'); return new Set(listino.catalog.products.filter(p => !p.accessory).map(p => p.code)).size; });
conteggi[0].startsWith(nMacchine + ' macchine') && righeV === nMacchine ? v.ok('verifica abbinamenti: ' + conteggi.join(' · ')) : v.ko(`verifica: ${conteggi.join(' · ')}, ${righeV} righe`);
await v.foto(page, 'fase4-verifica-abbinamenti-laptop');
await page.click('label.interruttore:has(#ver-solo)');
const daCtrl = await page.locator('.cons-voce').count();
const nCtrl = Number(conteggi[3].match(/\d+/)[0]);
daCtrl === nCtrl ? v.ok(`filtro "solo da controllare": ${daCtrl} righe`) : v.ko(`filtro: ${daCtrl} righe invece di ${nCtrl}`);
if (daCtrl) {
  await page.locator('.cons-voce').first().locator('[data-ver="cambia"]').click();
  await page.locator('#cat-lista [data-scelta="art"]').first().click();
  await page.waitForFunction(n => document.querySelectorAll('.cons-voce').length === n - 1, daCtrl);
  v.ok('"Cambia": scelta dal catalogo, la riga esce dai "da controllare"');
}
await page.click('label.interruttore:has(#ver-solo)');

// 7. Telefono: consegna, aree di tocco, nessuno scorrimento orizzontale
for (const tema of ['light', 'dark']) {
  const { ctx: c2, page: p2 } = await v.pagina({ viewport: { width: 375, height: 812 }, colorScheme: tema });
  await preparaPreventivo(p2);
  await p2.goto(v.url + '#/consegna'); await p2.waitForSelector('.cons-voce');
  await p2.selectOption('#cons-regione', 'SICILIA'); await p2.selectOption('#cons-provincia', 'PA');
  if (tema === 'light') await v.foto(p2, 'fase4-consegna-iphone-macchina-da-scegliere');
  // come farebbe una persona: per ogni macchina da scegliere tocca la prima proposta
  while (await p2.locator('[data-cons="scegli"]').count()) await p2.locator('[data-cons="scegli"]').first().click();
  await p2.waitForSelector('.soluzione');
  await v.foto(p2, `fase4-consegna-iphone-${tema === 'light' ? 'chiaro' : 'scuro'}`);
  if (tema === 'light') {
    for (const rotta of ['consegna', 'pagamento', 'invia']) {
      await p2.goto(v.url + '#/' + rotta); await p2.waitForTimeout(600);
      const piccoli = await p2.evaluate(() => [...document.querySelectorAll('#vista a[href], #vista button, #vista label.seg-voce, #vista label.interruttore, #vista label.spunta-riga, #vista input:not([type=radio]):not([type=checkbox]):not([type=file]), #vista select')]
        .filter(e => e.offsetParent !== null).map(e => ({ t: (e.textContent || e.id || '').trim().slice(0, 25), r: e.getBoundingClientRect() }))
        .filter(x => x.r.height < 47.5 || x.r.width < 47.5).map(x => `${x.t} ${Math.round(x.r.width)}×${Math.round(x.r.height)}`));
      piccoli.length ? v.ko(`${rotta}: aree di tocco sotto 48 px: ${piccoli.join('; ')}`) : v.ok(`${rotta} su telefono: aree di tocco ≥ 48 px`);
      const largo = await p2.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (largo > 0) v.ko(`${rotta}: scorrimento orizzontale ${largo}px`);
      if (rotta === 'pagamento') await v.foto(p2, 'fase4-pagamento-iphone-chiaro');
    }
    for (const rotta of ['abbinamenti']) {
      await p2.goto(v.url + '#/' + rotta); await p2.waitForSelector('.conteggi');
      const piccoli = await p2.evaluate(() => [...document.querySelectorAll('#vista a[href], #vista button, #vista label.interruttore')]
        .filter(e => e.offsetParent !== null).map(e => ({ t: (e.textContent || '').trim().slice(0, 25), r: e.getBoundingClientRect() }))
        .filter(x => x.r.height < 47.5 || x.r.width < 47.5).map(x => `${x.t} ${Math.round(x.r.width)}×${Math.round(x.r.height)}`));
      piccoli.length ? v.ko(`${rotta}: aree di tocco sotto 48 px: ${piccoli.join('; ')}`) : v.ok(`${rotta} su telefono: aree di tocco ≥ 48 px`);
      await v.foto(p2, 'fase4-verifica-abbinamenti-iphone');
    }
    const nav = await p2.locator('.nav-voce').last().boundingBox();
    nav.x + nav.width <= 375 ? v.ok('barra in basso: "Opzioni" sta nello schermo') : v.ko('barra in basso fuori schermo');
  }
  await c2.close();
}
fs.unlinkSync(PDF);
await v.fine();
