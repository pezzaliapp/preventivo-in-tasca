/*
 * Verifica dell'analisi mensile (strumenti/analisi.html):  node tests/e2e/analisi.mjs
 * Usa un file Excel INVENTATO, creato al momento con SheetJS: nessun dato vero.
 */
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { avvia, RADICE, CARTELLA } from './aiuti.mjs';

const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(RADICE, 'lib/xlsx.mini.min.js'), 'utf8'), ctx);
const X = ctx.XLSX;
const righe = [
  ['VETTORE', 'DOCUMENTO', 'DATA', 'DESTINATARIO', 'LOCALITÀ', 'PESO', 'SERVIZI', 'CLIENTE', 'COSTO', 'NOTE', 'TIPO PALLET', 'N. PALLET'],
  ['Pallex', 'DDT 1', '05/09/2026', 'Officina Rossi', 'Milano (MI)', 165, '', 120, 86, '', 'MEDIUM', 1],
  ['Pallex', 'DDT 2', '12/09/2026', 'Gomme Bianchi', 'Cosenza (CS)', 300, '', 0, 140, '', 'LIGHT', 1],
  ['Transcoop', 'DDT 3', '20/09/2026', 'Autofficina Verdi', 'Palermo (PA)', 1200, '', 1500, 1600, 'giacenza', '', ''],
  ['Pallex', 'DDT 4', '03/10/2026', 'Officina Neri', 'Torino (TO)', 200, '', 95, 90, '', 'MEDIUM', 1],
  ['Pallex', 'DDT 5', '07/10/2026', 'da fornitore', 'Bologna (BO)', 500, '', '', 70, 'F', '', '']
];
const wb = X.utils.book_new();
X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(righe), 'Spedizioni');
const file = path.join(RADICE, 'tests', 'e2e', '.prova-analisi.xlsx');
fs.writeFileSync(file, Buffer.from(X.write(wb, { type: 'binary', bookType: 'xlsx' }), 'binary'));

const v = await avvia('Analisi mensile nel browser');
const { page } = await v.pagina({ viewport: { width: 1280, height: 900 } });
await page.goto(v.url + 'strumenti/analisi.html');
await page.setInputFiles('#file', file);
await page.waitForSelector('#out:not([hidden])');
const mesi = await page.locator('#month option').allTextContents();
mesi.join('|') === 'Ottobre 2026|Settembre 2026|Tutto il periodo' ? v.ok('mesi letti: ' + mesi.join(', ')) : v.ko('mesi: ' + mesi.join(', '));
await page.selectOption('#month', '2026-09');
const kpi = await page.locator('.kpi b').allTextContents();
/1826/.test(kpi[0].replace(/\D/g, '')) ? v.ok('settembre: costo trasporti ' + kpi[0].replace(/ /g, ' ')) : v.ko('costo settembre: ' + kpi[0]);
const controlli = await page.locator('details.chk summary').allTextContents();
const tipi = controlli.map(c => c.replace(/\s+/g, ' ').trim());
tipi.some(t => t.startsWith('Addebitato meno del costo')) && tipi.some(t => t.startsWith('Spedizione a cliente senza addebito')) && tipi.some(t => t.startsWith('Giacenze'))
  ? v.ok('controlli: ' + tipi.map(t => t.split(' ').slice(0, 4).join(' ')).join(' · ')) : v.ko('controlli: ' + tipi.join(' / '));
const conf = await page.locator('#listino').textContent();
/fatture confrontate con le tariffe pallet/.test(conf) ? v.ok('confronto fatture pallet con le tariffe attivo') : v.ko('confronto pallet: ' + conf.slice(0, 100));
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnCsv')]);
const csv = fs.readFileSync(await dl.path(), 'utf8');
csv.startsWith('﻿"Controllo";"Vettore"') && dl.suggestedFilename() === 'controlli-trasporti-2026-09.csv' ? v.ok('CSV dei controlli: ' + dl.suggestedFilename()) : v.ko('CSV: ' + dl.suggestedFilename());
await page.fill('#divisore', '1,3').catch(() => {});
await page.screenshot({ path: path.join(CARTELLA, 'fase3-analisi-laptop.png'), fullPage: true });
fs.unlinkSync(file);
await v.fine();
