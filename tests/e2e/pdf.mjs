/*
 * Verifica nel browser di "Invia PDF":  node tests/e2e/pdf.mjs
 * Listino e book SINTETICI. navigator.share è finto: registra il PDF ricevuto, di cui si legge
 * il testo con pdf.js. Controlla che il PDF abbia gli stessi contenuti della stampa (righe,
 * totale netto, riquadro noleggio) e NON i testi del book né il contributo del fornitore.
 */
import fs from 'node:fs';
import path from 'node:path';
import { avvia, CARTELLA } from './aiuti.mjs';
import { creaPdfDiProva } from './listino-pdf.mjs';
import { BOOK } from '../fixtures/book-sintetico.js';

const v = await avvia('Invia PDF nel browser');
const PDF = await creaPdfDiProva(v.browser);
const nb = s => String(s).replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
const FINTO = () => {
  window.__condivisi = [];
  window.__rifiuta = 0;
  window.print = () => { window.__stampato = (window.__stampato || 0) + 1; };
  Navigator.prototype.canShare = () => true;
  Navigator.prototype.share = async function (dati) {
    // come Safari: senza un tocco in corso (o se il test lo chiede) share rifiuta
    const attivo = navigator.userActivation ? navigator.userActivation.isActive : true;
    if (window.__rifiuta > 0 || !attivo) { window.__rifiuta = Math.max(0, window.__rifiuta - 1); throw new DOMException('rifiutato', 'NotAllowedError'); }
    const f = (dati.files || [])[0];
    window.__condivisi.push(f ? { nome: f.name, tipo: f.type, byte: Array.from(new Uint8Array(await f.arrayBuffer())) } : { testo: dati.text });
  };
};
const { ctx, page } = await v.pagina({ viewport: { width: 375, height: 812 }, acceptDownloads: true });
await ctx.addInitScript(FINTO);

/** Testo del PDF condiviso per ultimo, letto con pdf.js (quello dell'app). */
const testoPdf = () => page.evaluate(async () => {
  const c = window.__condivisi.at(-1);
  const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(c.byte), isEvalSupported: false }).promise;
  const pagine = [];
  for (let i = 1; i <= doc.numPages; i++) pagine.push((await (await doc.getPage(i)).getTextContent()).items.map(t => t.str).join(' '));
  return { nome: c.nome, tipo: c.tipo, pagine: doc.numPages, testo: pagine.join('\n') };
});
async function tocca(sel) {
  const n = await page.evaluate(() => window.__condivisi.length);
  await page.click(sel);
  return page.waitForFunction(n => window.__condivisi.length > n, n, { timeout: 8000 }).then(() => true).catch(() => false);
}

// Preventivo di prova: listino, book, una macchina con figura, una voce libera, cliente, noleggio con contributo
await v.vai(page, 'prodotti');
await page.setInputFiles('#vista input[type=file]', PDF);
await page.waitForFunction(() => /26 articoli/.test(document.querySelector('.sottotitolo')?.textContent || ''), null, { timeout: 30000 });
await page.evaluate(async b => { const { Store } = await import('./js/store.js'); await Store.set('kv', 'agentPack', { pack: b, packId: 'prova' }); }, BOOK);
await page.reload(); await page.waitForSelector('.cfg-passo');
await page.click('button.tessera:has-text("Auto")');
await page.click('[data-agente="postazione"][data-id="auto-media-a"]');
await page.click('[data-agente="post-aggiungi"]');
await page.waitForFunction(() => location.hash === '#/prodotti/preventivo');
await page.waitForSelector('.controlli'); // il book è attivo: i controlli "Solo per te" ci sono
await page.fill('#rp-c', 'Officina di prova');
await page.fill('#rp-r', 'Richiesta del 10/10');
await page.fill('#rp-sg', '20');
await page.goto(v.url + '#/impostazioni'); await page.waitForSelector('#imp-azienda');
await page.fill('#imp-azienda', 'Rivenditore di prova Srl\nVia Roma 1');
await page.evaluate(async () => {
  const { stato, preventivoCambiato } = await import('./js/stato.js');
  stato.preventivo.vatOn = true;
  stato.preventivo.noleggio = Object.assign({}, stato.preventivo.noleggio, { contributo: '7' }); // contributo del fornitore: mai nel PDF
  preventivoCambiato();
});

// 1. Invia: "Invia PDF" accanto a "Stampa"; PDF pronto prima del tocco → share subito
await page.goto(v.url + '#/invia'); await page.waitForSelector('[data-inv="pdf"]');
await page.click('[data-inv="salva"]');
await page.waitForFunction(() => /Preventivo \d{4}\/001/.test(document.querySelector('.sottotitolo')?.textContent || ''));
const pulsanti = await page.locator('.azioni:has([data-inv="stampa"]) button').allTextContents();
pulsanti[0] === 'Stampa' && pulsanti[1] === 'Invia PDF' ? v.ok('"Invia PDF" accanto a "Stampa"') : v.ko('pulsanti: ' + pulsanti.join(' | '));
await page.waitForTimeout(2500);
(await page.evaluate(() => !!window.jspdf)) ? v.ok('jsPDF caricato aprendo Invia (per avere il PDF pronto)') : v.ko('jsPDF non caricato');
(await tocca('[data-inv="pdf"]')) ? v.ok('"Invia PDF": navigator.share parte subito nel tocco') : v.ko('"Invia PDF": share non chiamato');
const anno = new Date().getFullYear();
let pdf = await testoPdf();
pdf.tipo === 'application/pdf' && pdf.nome === `Preventivo_${anno}-001_Officina-di-prova.pdf` ? v.ok('file ' + pdf.nome) : v.ko('file: ' + pdf.nome + ' ' + pdf.tipo);
const T = nb(pdf.testo);
fs.writeFileSync(path.join(CARTELLA, '..', '..', 'tests', 'e2e', '.prova-preventivo.pdf'), Buffer.from(await page.evaluate(() => window.__condivisi.at(-1).byte)));

// stessi contenuti della stampa
await page.click('[data-inv="stampa"]');
await page.waitForFunction(() => window.__stampato > 0, null, { timeout: 15000 });
const stampa = await page.evaluate(() => {
  const a = document.getElementById('area-stampa');
  // la stampa è nascosta a schermo: gli a capo (<br>) si leggono a mano
  const t = s => [...a.querySelectorAll(s)].map(e => { const c = e.cloneNode(true); c.querySelectorAll('br').forEach(b => b.replaceWith('\n')); return c.textContent; });
  return { celle: t('td, th'), totali: t('.pr-totali div span'), noleggio: t('.pr-noleggio h2, .pr-noleggio p, .pr-noleggio li, .pr-noleggio h3'), testa: t('.pr-azienda, .pr-meta h1, .pr-meta p, .pr-cliente p, .pr-note, .pr-firma, .pr-piede') };
});
const mancano = [...stampa.celle, ...stampa.totali, ...stampa.noleggio, ...stampa.testa].flatMap(t => t.split('\n')).map(nb).filter(Boolean)
  .filter(t => !T.includes(t.replace(/−/g, '-')));
mancano.length ? v.ko('nel PDF mancano testi della stampa: ' + mancano.slice(0, 6).join(' | ')) : v.ok(`PDF identico alla stampa: ${stampa.celle.length} celle, totali, riquadro noleggio, testata e note`);
const netto = nb(await page.locator('#bt-importo').textContent());
T.includes('Totale netto imponibile') && T.includes(netto) ? v.ok('PDF: totale netto ' + netto) : v.ko('PDF: totale netto assente');
T.includes('Oppure a noleggio operativo') && /Canone mensile/.test(T) ? v.ok('PDF: riquadro "Oppure a noleggio operativo"') : v.ko('PDF: riquadro noleggio assente');
T.includes('Preventivo in tasca · Alessandro Pezzali') ? v.ok('PDF: piè di pagina') : v.ko('PDF: piè di pagina assente');
const righe = await page.evaluate(async () => (await import('./js/stato.js')).stato.preventivo.items.filter(i => i.code).map(i => i.code));
righe.every(c => T.includes(c)) ? v.ok(`PDF: tutte le righe (${righe.join(', ')})`) : v.ko('PDF: righe mancanti');
const riservati = ['Solo per te', 'Controlli prima di inviare', 'Si ripaga in un anno', 'Pacchetto completo.', 'Serve trifase.', 'Officina media.',
  BOOK.transport.warranty, BOOK.transport.tipInstall, ...BOOK.rules.map(r => r.msg), ...BOOK.postazioni.flatMap(p => [p.when, p.say, p.watch])].filter(Boolean);
const fughe = riservati.filter(t => T.includes(nb(t)));
fughe.length ? v.ko('testi del book nel PDF: ' + fughe.join(' | ')) : v.ok(`PDF: nessun testo del book (${riservati.length} frasi controllate)`);
/contribut|fornitore/i.test(T) ? v.ko('PDF: compare il contributo del fornitore') : v.ok('PDF: nessun contributo del fornitore');
/€/.test(T) && /\d\.\d{3},\d{2} €/.test(T) ? v.ok('PDF: importi all\'italiana (1.234,56 €)') : v.ko('PDF: importi');
const imgs = await page.evaluate(async () => {
  const c = window.__condivisi.at(-1);
  const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(c.byte), isEvalSupported: false }).promise;
  const ops = await (await doc.getPage(1)).getOperatorList();
  return ops.fnArray.filter(f => f === window.pdfjsLib.OPS.paintImageXObject || f === window.pdfjsLib.OPS.paintInlineImageXObject).length;
});
imgs > 0 ? v.ok(`PDF: immagini dei prodotti (${imgs})`) : v.ko('PDF: nessuna immagine con l\'interruttore acceso');

// 2. Il preventivo cambia → il PDF si rifà da solo
await page.evaluate(async () => { const { stato, preventivoCambiato } = await import('./js/stato.js'); stato.preventivo.items[0].qty = 2; stato.preventivo.showImages = false; preventivoCambiato(); });
await page.waitForTimeout(2500);
(await tocca('[data-inv="pdf"]')) ? v.ok('preventivo cambiato: PDF rifatto e condiviso subito') : v.ko('dopo una modifica share non parte subito');
pdf = await testoPdf();
const netto2 = nb(await page.locator('#bt-importo').textContent());
nb(pdf.testo).includes(netto2) && netto2 !== netto ? v.ok('PDF aggiornato: nuovo totale ' + netto2) : v.ko('PDF non aggiornato');

// 3. share rifiutato → il file si scarica con l'avviso; senza share idem
await page.evaluate(() => { window.__rifiuta = 1; });
let scaricato = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
await page.click('[data-inv="pdf"]');
let dl = await scaricato;
dl && dl.suggestedFilename().endsWith('.pdf') && /PDF salvato: aprilo da File o Download/.test(await page.locator('#toast').innerText())
  ? v.ok('share rifiutato: PDF scaricato e avviso "PDF salvato"') : v.ko('share rifiutato: nessun file');
await page.evaluate(() => { delete Navigator.prototype.share; });
scaricato = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
await page.click('[data-inv="pdf"]');
dl = await scaricato;
dl ? v.ok('senza condivisione di sistema: PDF scaricato') : v.ko('senza share: nessun file');
await page.evaluate(() => { location.reload(); });
await page.waitForSelector('[data-inv="pdf"]');

// 4. Più pagine se serve
await page.evaluate(async () => {
  const { stato, preventivoCambiato } = await import('./js/stato.js');
  for (let i = 1; i <= 40; i++) stato.preventivo.items.push({ id: 'x' + i, custom: true, name: `Voce di prova numero ${i} con una descrizione abbastanza lunga da andare a capo nella colonna`, price: 100 + i, qty: 1, disc: '' });
  preventivoCambiato();
});
await page.waitForTimeout(3500);
(await tocca('[data-inv="pdf"]')) ? v.ok('preventivo lungo: condiviso') : v.ko('preventivo lungo: share non parte');
pdf = await testoPdf();
fs.writeFileSync(path.join(CARTELLA, '..', '..', 'tests', 'e2e', '.prova-lungo.pdf'), Buffer.from(await page.evaluate(() => window.__condivisi.at(-1).byte)));
pdf.pagine > 1 && /Pagina 1 di \d/.test(pdf.testo) && pdf.testo.includes('Voce di prova numero 40') && nb(pdf.testo).includes(nb(await page.locator('#bt-importo').textContent()))
  ? v.ok(`PDF di ${pdf.pagine} pagine A4, con tutte le righe e il totale`) : v.ko(`più pagine: ${pdf.pagine}`);
await page.evaluate(async () => { const { stato, preventivoCambiato } = await import('./js/stato.js'); stato.preventivo.items = stato.preventivo.items.filter(i => !/^x/.test(i.id)); preventivoCambiato(); });

// 5. Archivio: PDF di un preventivo salvato
await page.goto(v.url + '#/archivio'); await page.waitForSelector('[data-arch="pdf"]');
await page.click('[data-arch="pdf"]');
await page.waitForSelector('.foglio [data-pdf="invia"]', { timeout: 15000 });
(await tocca('.foglio [data-pdf="invia"]')) ? v.ok('Archivio: "PDF" → "Invia PDF" condivide subito') : v.ko('Archivio: share non chiamato');
pdf = await testoPdf();
pdf.nome === `Preventivo_${anno}-001_Officina-di-prova.pdf` && pdf.testo.includes('Officina di prova') ? v.ok('Archivio: PDF del preventivo salvato (' + pdf.nome + ')') : v.ko('Archivio: ' + pdf.nome);
await page.keyboard.press('Escape');
await ctx.close();

// 6. Browser interno di Instagram/WhatsApp: avviso in alto nel passo Invia
for (const [nome, ua] of [['Instagram', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0'], ['Safari', null]]) {
  const { ctx: c2, page: p2 } = await v.pagina(Object.assign({ viewport: { width: 375, height: 812 } }, ua ? { userAgent: ua } : {}));
  await v.vai(p2, 'invia');
  const avviso = await p2.locator('.avviso', { hasText: 'Per stampare apri l\'app in Safari o Chrome. Puoi comunque usare Invia PDF' }).count();
  if (ua) avviso ? v.ok(`${nome}: avviso "Per stampare apri l'app in Safari o Chrome"`) : v.ko(`${nome}: avviso assente`);
  else avviso ? v.ko('Safari: avviso del browser interno mostrato per sbaglio') : v.ok('Safari: nessun avviso');
  await c2.close();
}
fs.unlinkSync(PDF);
for (const f of ['.prova-preventivo.pdf', '.prova-lungo.pdf']) fs.rmSync(path.join(CARTELLA, '..', '..', 'tests', 'e2e', f), { force: true });
await v.fine();
