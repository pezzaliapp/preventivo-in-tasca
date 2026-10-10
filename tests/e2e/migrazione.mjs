/*
 * Verifica della migrazione dalle app precedenti e del file di trasferimento:
 *   node tests/e2e/migrazione.mjs
 * Le app precedenti sono simulate sulla stessa origine con lo STESSO schema degli originali
 * (IndexedDB "listino-in-tasca" v1: kv, files, quotes; localStorage ct_*, darkMode, an_divisore),
 * con listino e book SINTETICI.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { avvia, RADICE, CARTELLA } from './aiuti.mjs';
import { creaPdfDiProva } from './listino-pdf.mjs';
import { pdfSintetico } from '../fixtures/listino-sintetico.js';
import { BOOK } from '../fixtures/book-sintetico.js';

const v = await avvia('Migrazione dalle app precedenti');
const PDF = await creaPdfDiProva(v.browser);
const ctxP = vm.createContext({ console }); ctxP.self = ctxP;
vm.runInContext(fs.readFileSync(path.join(RADICE, 'js/listino/parser.js'), 'utf8'), ctxP);
const catalogo = JSON.parse(JSON.stringify(await ctxP.ListinoParser.parseListino(pdfSintetico())));
const pdfBytes = [...fs.readFileSync(PDF)];

const VECCHIO = {
  catalog: Object.assign(catalogo, { fileName: 'listino-vecchio.pdf', fileSize: pdfBytes.length }),
  settings: { company: 'Vecchia Officina Srl\nVia Roma 1', seller: 'Agente di prova', vat: 22, defaultDisc: '20', validity: 45, notes: 'Note della vecchia app.', counterYear: new Date().getFullYear(), counter: 12 },
  draft: { id: null, number: null, date: '2026-10-09T10:00:00.000Z', customer: 'Cliente in corso', reference: '', globalDisc: '20', vatOn: false, notes: 'Note della vecchia app.', savedAt: null,
    items: [{ id: 'd1', key: '01100313|1ph 230V 50Hz', code: '01100313', name: 'MEC 1000 versione base', power: '1ph 230V 50Hz', price: 9500, qty: 1, disc: '', page: 3, family: 'MEC 1000' }] },
  quotes: [
    { id: 'q1', number: `${new Date().getFullYear()}/011`, date: '2026-10-01T09:00:00.000Z', customer: 'Officina Rossi', items: [{ id: 'a', code: '02100100', name: 'F 536S', price: 7800, qty: 1, disc: '' }], savedAt: '2026-10-01T09:00:00.000Z', totals: { net: 7800 } },
    { id: 'q2', number: `${new Date().getFullYear()}/012`, date: '2026-10-02T09:00:00.000Z', customer: 'Gomme Bianchi', items: [{ id: 'b', code: '03100040', name: 'PFA 40', price: 6000, qty: 1, disc: '10' }], savedAt: '2026-10-02T09:00:00.000Z', totals: { net: 5400 } }
  ],
  ls: { ct_state: JSON.stringify({ cart: [{ uid: 1, qty: 2, kind: 'art', artId: 'touch-mec-2000s' }], reg: 'LOMBARDIA', prov: 'MI', opts: { ass: true, pre: false, dis: false, disEur: 0 } }), ct_adj: '5', ct_fuel: JSON.stringify({ on: true, share: 30, shareIs: 15 }), darkMode: 'true', an_divisore: '1.3' }
};

/** Crea i dati delle app precedenti come li creerebbero gli originali (schema di listino-in-tasca/js/store.js). */
async function creaVecchieApp(page) {
  await page.evaluate(async ({ V, pdf, book }) => {
    await new Promise((res, rej) => {
      const req = indexedDB.open('listino-in-tasca', 1);
      req.onupgradeneeded = () => { const db = req.result; db.createObjectStore('kv'); db.createObjectStore('files'); db.createObjectStore('quotes', { keyPath: 'id' }); };
      req.onsuccess = () => {
        const db = req.result; const t = db.transaction(['kv', 'files', 'quotes'], 'readwrite');
        t.objectStore('kv').put(V.catalog, 'catalog'); t.objectStore('kv').put(V.settings, 'settings'); t.objectStore('kv').put(V.draft, 'draft');
        t.objectStore('kv').put({ pack: book, packId: 'vecchio', at: '2026-10-01' }, 'agentPack');
        t.objectStore('files').put(new Uint8Array(pdf).buffer, 'listino');
        V.quotes.forEach(q => t.objectStore('quotes').put(q));
        t.oncomplete = () => { db.close(); res(); }; t.onerror = () => rej(t.error);
      };
      req.onerror = () => rej(req.error);
    });
    for (const [k, x] of Object.entries(V.ls)) localStorage.setItem(k, x);
  }, { V: VECCHIO, pdf: pdfBytes, book: BOOK });
}
const leggiVecchio = page => page.evaluate(() => new Promise(res => {
  const req = indexedDB.open('listino-in-tasca');
  req.onsuccess = () => {
    const db = req.result; const t = db.transaction(['kv', 'files', 'quotes'], 'readonly'); const o = {};
    t.objectStore('kv').get('catalog').onsuccess = e => { o.articoli = e.target.result.products.length; };
    t.objectStore('kv').get('draft').onsuccess = e => { o.bozza = e.target.result.items.length; };
    t.objectStore('kv').get('settings').onsuccess = e => { o.azienda = e.target.result.company; };
    t.objectStore('files').get('listino').onsuccess = e => { o.pdf = e.target.result.byteLength; };
    t.objectStore('quotes').getAll().onsuccess = e => { o.preventivi = e.target.result.length; };
    t.oncomplete = () => { db.close(); res(Object.assign(o, { ls: ['ct_state', 'ct_adj', 'ct_fuel', 'darkMode', 'an_divisore'].filter(k => localStorage.getItem(k) !== null).length })); };
  };
}));

// 1. Dispositivo senza app precedenti: nessuna proposta e NESSUN database "listino-in-tasca" creato
{
  const { ctx, page } = await v.pagina();
  await v.vai(page, 'home');
  await page.waitForTimeout(800);
  (await page.locator('#home-import section').count()) === 0 ? v.ok('senza app precedenti: nessuna proposta di importazione') : v.ko('proposta senza dati');
  const dbs = await page.evaluate(async () => (await indexedDB.databases()).map(d => d.name));
  !dbs.includes('listino-in-tasca') ? v.ok('il rilevamento non ha creato il database di Listino in tasca (' + dbs.join(', ') + ')') : v.ko('creato per errore il database "listino-in-tasca": romperebbe l\'app vecchia');
  await ctx.close();
}

// 2. Con le app precedenti: proposta in Home, importazione, originali intatti
const { ctx, page } = await v.pagina({ viewport: { width: 412, height: 915 }, acceptDownloads: true });
await page.goto(v.url + 'versione.json'); // stessa origine, prima che parta la nuova app
await creaVecchieApp(page);
const prima = await leggiVecchio(page);
await v.vai(page, 'home');
await page.waitForSelector('#home-import section', { timeout: 10000 });
const proposta = (await page.locator('#home-import').innerText()).replace(/\s+/g, ' ');
/il listino \(26 articoli\), 2 preventivi salvati, un preventivo in corso, le impostazioni, il carico del trasporto, il tema scuro/.test(proposta)
  ? v.ok('Home: proposta di importazione con quello che c\'è') : v.ko('proposta: ' + proposta);
await v.foto(page, 'fase5-home-importa');
await page.click('#imp-si');
await page.waitForSelector('#home-import .avviso-ok', { timeout: 30000 });
const fatto = await page.locator('#home-import').innerText();
v.ok('importazione: "' + fatto.trim() + '"');

const dopo = await leggiVecchio(page);
JSON.stringify(dopo) === JSON.stringify(prima) ? v.ok('app precedenti intatte: ' + JSON.stringify(dopo)) : v.ko(`app precedenti cambiate: ${JSON.stringify(prima)} → ${JSON.stringify(dopo)}`);

await v.vai(page, 'prodotti');
await page.waitForFunction(() => /26 articoli/.test(document.querySelector('#vista .sottotitolo')?.textContent || ''), null, { timeout: 30000 });
v.ok('listino importato e leggibile (26 articoli)');
await page.click('button.tessera:has-text("Auto")');
(await page.locator('h2', { hasText: 'Postazioni pronte' }).count()) ? v.ok('book dell\'agente importato (Postazioni pronte)') : v.ko('book non importato');
await v.vai(page, 'archivio'); await page.waitForSelector('.arch');
(await page.locator('.arch').count()) === 2 ? v.ok('2 preventivi salvati nell\'archivio') : v.ko('archivio: ' + await page.locator('.arch').count());
const st = await page.evaluate(async () => { const { stato } = await import('./js/stato.js'); return { az: stato.impostazioni.company, cnt: stato.impostazioni.counter, cliente: stato.preventivo.customer, righe: stato.preventivo.items.length }; });
st.az.startsWith('Vecchia Officina Srl') && st.cnt === 12 && st.cliente === 'Cliente in corso' && st.righe === 1 ? v.ok('impostazioni, numerazione (12) e preventivo in corso importati') : v.ko('stato: ' + JSON.stringify(st));
await v.vai(page, 'trasporto'); await page.waitForSelector('.collo');
(await page.locator('.collo').count()) === 1 && await page.inputValue('#tr-regione') === 'LOMBARDIA' && await page.inputValue('#tr-adj') === '5' ? v.ok('trasporto: carico, destinazione e adeguamento +5% importati') : v.ko('trasporto non importato');
(await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark' ? v.ok('tema scuro della vecchia app importato') : v.ko('tema');
(await page.evaluate(() => localStorage.getItem('pit_an_divisore'))) === '1.3' ? v.ok('divisore dell\'analisi importato') : v.ko('divisore');

// 3. Seconda importazione: niente doppioni
await v.vai(page, 'impostazioni'); await page.waitForSelector('[data-imp="vecchie"]');
await page.click('[data-imp="vecchie"]'); await page.click('[data-r="si"]');
await page.waitForFunction(() => /Niente da importare/.test(document.getElementById('toast').textContent), null, { timeout: 15000 });
const n2 = await page.evaluate(async () => (await (await import('./js/store.js')).Store.all('quotes')).length);
n2 === 2 ? v.ok('seconda importazione: "Niente da importare", nessun doppione') : v.ko('doppioni: ' + n2);

// 4. File di trasferimento
await page.click('[data-imp="esporta"]').catch(() => {});
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-imp="esporta"]')]);
const file = path.join(RADICE, 'tests', 'e2e', '.prova-dati.json');
fs.copyFileSync(await dl.path(), file);
const contenuto = fs.readFileSync(file, 'utf8');
const dati = JSON.parse(contenuto);
dati.formato === 'preventivo-in-tasca/dati' && dati.preventivi.length === 2 && !/"catalog"|"agentPack"|"postazioni"|"products"|"pack"/.test(contenuto)
  ? v.ok(`file ${dl.suggestedFilename()}: 2 preventivi, impostazioni, bozza; senza listino, catalogo né book`) : v.ko('file di trasferimento: ' + contenuto.slice(0, 200));
await ctx.close();
{
  const { ctx, page } = await v.pagina();
  await v.vai(page, 'impostazioni'); await page.waitForSelector('[data-imp="importa-file"]');
  await page.setInputFiles('#imp-file-dati', file);
  await page.click('[data-r="si"]');
  await page.waitForFunction(() => /Importati/.test(document.getElementById('toast').textContent), null, { timeout: 15000 });
  const t = await page.locator('#toast').innerText();
  const n = await page.evaluate(async () => ({ q: (await (await import('./js/store.js')).Store.all('quotes')).length, cat: !!(await (await import('./js/store.js')).Store.get('kv', 'catalog')), az: (await import('./js/stato.js')).stato.impostazioni.company }));
  n.q === 2 && !n.cat && n.az.startsWith('Vecchia Officina') ? v.ok('dispositivo nuovo: file caricato (' + t.trim() + '); il listino va ricaricato dal dispositivo') : v.ko('importa file: ' + JSON.stringify(n));
  await page.setInputFiles('#imp-file-dati', { name: 'altro.json', mimeType: 'application/json', buffer: Buffer.from('{"formato":"altro"}') });
  await page.click('[data-r="si"]');
  await page.waitForFunction(() => /non è un file di dati/.test(document.getElementById('toast').textContent));
  v.ok('file sbagliato: messaggio chiaro, niente importato');
  await v.foto(page, 'fase5-opzioni-dati');
  await ctx.close();
}
fs.unlinkSync(file); fs.unlinkSync(PDF);
await v.fine();
