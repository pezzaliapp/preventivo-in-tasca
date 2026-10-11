/*
 * Verifica nel browser dei disegni incasso del book:  node tests/e2e/disegni.mjs
 * Listino e book SINTETICI (mai i file veri). La decifratura è sostituita: il "disegno"
 * è il PDF di prova. navigator.share è finto e registra i file ricevuti.
 *   A) i pulsanti dei disegni funzionano dalla guida aperta da Opzioni, da Prodotti e dai controlli;
 *      "Invia" chiama share subito nel tocco; se share rifiuta (NotAllowedError) il disegno resta a schermo.
 *   B) "Disegni per l'incasso" subito sotto l'articolo selezionato e segno "Disegno incasso"
 *      in Configura, Cerca e righe del preventivo, mai nella stampa.
 */
import fs from 'node:fs';
import { avvia } from './aiuti.mjs';
import { creaPdfDiProva } from './listino-pdf.mjs';
import { BOOK } from '../fixtures/book-sintetico.js';

const v = await avvia('Disegni incasso nel browser');
const PDF = await creaPdfDiProva(v.browser);
const DISEGNO = fs.readFileSync(PDF).toString('base64');
const { ctx, page } = await v.pagina({ viewport: { width: 375, height: 812 } });
await ctx.addInitScript(() => {
  window.__condivisi = [];
  window.__rifiuta = 0;
  window.print = () => { window.__stampato = (window.__stampato || 0) + 1; };
  Navigator.prototype.canShare = () => true;
  Navigator.prototype.share = function (dati) {
    // come Safari: senza un tocco in corso, o se richiesto dal test, share rifiuta
    const attivo = navigator.userActivation ? navigator.userActivation.isActive : true;
    if (window.__rifiuta > 0 || !attivo) { window.__rifiuta = Math.max(0, window.__rifiuta - 1); return Promise.reject(new DOMException('rifiutato', 'NotAllowedError')); }
    window.__condivisi.push({ file: (dati.files || []).map(f => ({ nome: f.name, tipo: f.type, byte: f.size })), testo: dati.text || '' });
    return Promise.resolve();
  };
});

await v.vai(page, 'prodotti');
await page.setInputFiles('#vista input[type=file]', PDF);
await page.waitForFunction(() => /26 articoli/.test(document.querySelector('.sottotitolo')?.textContent || ''), null, { timeout: 30000 });
await page.evaluate(async b => { const { Store } = await import('./js/store.js'); await Store.set('kv', 'agentPack', { pack: b, packId: 'prova' }); }, BOOK);
// decifratura finta: il disegno è il PDF di prova
const finta = d => { window.__decifrati = 0; window.Agente.decryptFile = async () => { window.__decifrati++; return Uint8Array.from(atob(d), c => c.charCodeAt(0)); }; };
async function ricarica(rotta) {
  await page.goto(v.url + '#/' + rotta); await page.reload();
  await page.waitForFunction(r => window.__pit && window.__pit.rotta === r.split('/')[0] && window.Agente, rotta);
  await page.evaluate(finta, DISEGNO);
}

/** Apri mostra il disegno; Invia chiama share con un PDF. */
async function provaApriInvia(dove) {
  await page.locator('.foglio [data-agente="disegno"]').first().click();
  const aperto = await page.waitForFunction(() => { const c = document.querySelector('#dw-vista canvas'); return c && c.width > 100; }, null, { timeout: 15000 }).then(() => true).catch(() => false);
  aperto ? v.ok(`${dove}: "Apri" mostra il disegno`) : v.ko(`${dove}: "Apri" non mostra il disegno`);
  await page.waitForFunction(() => window.__decifrati > 0);
  await page.waitForTimeout(100); // il PDF è pronto prima del tocco
  const prima = await page.evaluate(() => window.__condivisi.length);
  await page.click('.foglio [data-agente="disegno-invia"]');
  await page.waitForFunction(n => window.__condivisi.length > n, prima, { timeout: 5000 }).catch(() => {});
  const ultimo = await page.evaluate(() => window.__condivisi.at(-1));
  (await page.evaluate(() => window.__condivisi.length)) > prima && ultimo.file[0]?.tipo === 'application/pdf' && ultimo.file[0].nome === 'Incasso_PFA40.pdf' && ultimo.file[0].byte > 1000
    ? v.ok(`${dove}: "Invia" chiama navigator.share con il PDF`) : v.ko(`${dove}: "Invia" non ha condiviso il PDF`);
  await page.keyboard.press('Escape');
}

// A1. Guida aperta da Opzioni
await ricarica('impostazioni');
await page.click('[data-imp="disegni"]');
await page.waitForSelector('.foglio #g-disegni[open]');
// "Invia" direttamente dall'elenco della guida (il PDF si prepara all'apertura)
await page.waitForFunction(() => window.__decifrati > 0, null, { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(100);
await page.click('.foglio #g-disegni [data-agente="disegno-invia"]');
await page.waitForFunction(() => window.__condivisi.length === 1, null, { timeout: 5000 }).then(() => v.ok('Opzioni → guida: "Invia" dall\'elenco parte subito')).catch(() => v.ko('Opzioni → guida: "Invia" dall\'elenco non fa niente'));
await provaApriInvia('Opzioni → guida');
await page.click('[data-imp="guida"]');
(await page.locator('.foglio h2', { hasText: 'Guida agente' }).count()) ? v.ok('Opzioni → "Apri la guida agente"') : v.ko('guida da Opzioni');
await page.keyboard.press('Escape');

// A2. Guida aperta da Prodotti (Postazioni pronte)
await ricarica('prodotti');
await page.click('button.tessera:has-text("Auto")');
await page.click('.blocco-agente [data-agente="guida"]');
await page.click('.foglio #g-disegni summary');
await provaApriInvia('Prodotti → guida');

// A3. Controlli del preventivo: "Apri PFA 40" e Checklist → guida
await page.goto(v.url + '#/prodotti/cerca'); await page.waitForSelector('#cerca-q');
await page.fill('#cerca-q', '03100040');
await page.waitForSelector('#cerca-risultati [data-azione="aggiungi"][data-key^="03100040"]');
await page.click('#cerca-risultati [data-azione="aggiungi"][data-key^="03100040"]');
for (const rotta of ['prodotti/preventivo', 'pagamento', 'invia']) {
  await ricarica(rotta);
  const ck = page.locator('.controlli [data-agente="disegno"]');
  if (!(await ck.count())) { if (rotta === 'prodotti/preventivo') v.ko('controlli: manca "Apri PFA 40"'); continue; }
  await ck.first().click();
  await page.waitForSelector('.foglio #dw-vista');
  await page.keyboard.press('Escape');
  await page.click('.controlli [data-agente="guida"]');
  await page.click('.foglio #g-disegni summary');
  await provaApriInvia(`controlli (${rotta})`);
}

// A4. iPhone: share rifiutato (NotAllowedError) → disegno a schermo con "Invia" da ritoccare
await ricarica('impostazioni');
await page.click('[data-imp="disegni"]');
await page.waitForFunction(() => window.__decifrati > 0);
await page.waitForTimeout(100);
const n0 = await page.evaluate(() => { window.__rifiuta = 1; return window.__condivisi.length; });
await page.click('.foglio #g-disegni [data-agente="disegno-invia"]');
await page.waitForSelector('.foglio #dw-vista', { timeout: 5000 }).catch(() => {});
const ritocca = await page.locator('.foglio .avviso', { hasText: 'Tocca di nuovo' }).count();
ritocca ? v.ok('share rifiutato: il disegno resta a schermo con "Invia" da ritoccare') : v.ko('share rifiutato: nessuna risposta al tocco');
await page.click('.foglio [data-agente="disegno-invia"]');
await page.waitForFunction(n => window.__condivisi.length > n, n0, { timeout: 5000 }).then(() => v.ok('secondo tocco su "Invia": condiviso')).catch(() => v.ko('secondo tocco su "Invia": niente'));
await page.keyboard.press('Escape');

// B1. Scheda prodotto: "Disegni per l'incasso" subito sotto l'articolo selezionato
await ricarica('prodotti/cerca');
await page.fill('#cerca-q', '03100040');
await page.click('#cerca-risultati [data-azione="scheda"][data-key^="03100040"]');
await page.waitForSelector('.foglio h3');
const titoli = (await page.locator('.foglio h3').allTextContents()).map(t => t.trim());
const i = titoli.indexOf('Articolo selezionato');
titoli[i + 1] === 'Disegni per l\'incasso' ? v.ok('scheda PFA 40: "Disegni per l\'incasso" subito sotto l\'articolo selezionato') : v.ko('scheda: ordine ' + titoli.join(' | '));
await provaApriInvia('scheda prodotto');

// B2. Segno "Disegno incasso": Cerca, Configura, righe del preventivo; solo dove c'è un disegno
await ricarica('prodotti/cerca');
await page.fill('#cerca-q', 'PFA');
await page.waitForSelector('#cerca-risultati .articolo');
const segni = await page.locator('#cerca-risultati .articolo').evaluateAll(li => li.map(l => [l.querySelector('.codice').textContent.slice(0, 8), !!l.querySelector('.segno-disegno')]));
segni.some(([c, s]) => c === '03100040' && s) && segni.filter(([c]) => c !== '03100040').every(([, s]) => !s)
  ? v.ok('Cerca: segno "Disegno incasso" solo su 03100040') : v.ko('Cerca: segni ' + JSON.stringify(segni));
await page.click('#cerca-risultati .segno-disegno');
await page.waitForSelector('.foglio #dw-vista').then(() => v.ok('Cerca: il segno apre il disegno')).catch(() => v.ko('Cerca: il segno non apre il disegno'));
await page.keyboard.press('Escape');

await ricarica('prodotti');
await page.click('button.tessera:has-text("Auto")');
const sollev = page.locator('button.tessera:has-text("Sollevamento"):not([disabled])');
if (await sollev.count()) {
  await sollev.click();
  (await page.locator('.famiglia .segno-disegno').count()) ? v.ok('Configura: segno "Disegno incasso" nell\'elenco') : v.ko('Configura: segno assente');
} else v.ko('Configura: Auto → Sollevamento non disponibile nel listino di prova');

await ricarica('prodotti/preventivo');
const rigaSegno = page.locator('.riga-prev .segno-disegno');
(await rigaSegno.count()) === 1 ? v.ok('righe del preventivo: segno sulla riga PFA 40') : v.ko('righe del preventivo: segni ' + await rigaSegno.count());
await rigaSegno.first().click();
await page.waitForSelector('.foglio #dw-vista').then(() => v.ok('riga del preventivo: il segno apre il disegno')).catch(() => v.ko('riga: il segno non apre il disegno'));
await page.keyboard.press('Escape');

// Mai nella stampa né nel testo per il cliente
await ricarica('invia');
await page.click('[data-inv="stampa"]');
await page.waitForFunction(() => window.__stampato > 0, null, { timeout: 15000 });
const stampa = await page.locator('#area-stampa').innerText();
const n1 = await page.evaluate(() => window.__condivisi.length);
await page.click('[data-inv="condividi"]');
await page.waitForFunction(n => window.__condivisi.length > n, n1);
const testo = await page.evaluate(() => window.__condivisi.at(-1).testo);
if (!/PFA 40/.test(testo)) v.ko('testo condiviso senza la riga PFA 40');
/disegn/i.test(stampa) || /disegn/i.test(testo) ? v.ko('"Disegno" nella stampa o nel testo per il cliente') : v.ok('nessun disegno nella stampa né nel testo per il cliente');

await ctx.close();
fs.unlinkSync(PDF);
await v.fine();
