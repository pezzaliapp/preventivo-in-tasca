/*
 * Verifica nel browser di "Nuovo preventivo":  node tests/e2e/nuovo.mjs
 *   1) Home: "Nuovo preventivo" accanto a "Continua il preventivo" → "Salva in archivio e inizia nuovo"
 *   2) Prodotti › Il preventivo: "Elimina e inizia nuovo" → avviso con "Annulla" per 10 secondi
 *   3) preventivo senza righe: riparte subito, senza domande
 * Il nuovo preventivo riparte pulito ma tiene impostazioni, adeguamenti del trasporto e numerazione.
 */
import { avvia } from './aiuti.mjs';

const v = await avvia('Nuovo preventivo nel browser');
const { page } = await v.pagina({ viewport: { width: 375, height: 812 } });
const anno = new Date().getFullYear();
const leggi = () => page.evaluate(async () => {
  const { stato } = await import('./js/stato.js');
  const { Store, Pref } = await import('./js/store.js');
  const p = stato.preventivo;
  return { righe: p.items.length, cliente: p.customer, rif: p.reference, sconto: p.globalDisc, consegna: p.consegna || null, noleggio: p.noleggio || null,
    numero: p.number, azienda: stato.impostazioni.company, contatore: stato.impostazioni.counter, adj: Pref.get('trasporto_adj'),
    archivio: (await Store.all('quotes')).map(q => ({ numero: q.number, cliente: q.customer, righe: q.items.length })) };
});
async function riempi(cliente) {
  await page.goto(v.url + '#/prodotti/preventivo'); await page.waitForSelector('[data-riga="voce"]');
  await page.click('[data-riga="voce"]');
  await page.fill('#vl-nome', 'Installazione'); await page.fill('#vl-prezzo', '350');
  await page.click('#vl-salva');
  await page.fill('#rp-c', cliente);
  await page.fill('#rp-r', 'Richiesta di prova');
  await page.fill('#rp-sg', '15');
  // consegna e scelte del noleggio, come se fossero state scelte nei passi 2 e 3
  await page.evaluate(async () => {
    const { stato, preventivoCambiato } = await import('./js/stato.js');
    stato.preventivo.consegna = { reg: 'Lombardia', prov: 'MI', opts: { sponda: true } };
    stato.preventivo.noleggio = { contributo: '1000' };
    preventivoCambiato();
  });
}
const pulito = s => s.righe === 0 && s.cliente === '' && s.rif === '' && s.sconto === '' && !s.consegna && !s.noleggio && !s.numero;

// impostazioni che devono restare
await v.vai(page, 'impostazioni');
await page.fill('#imp-azienda', 'Rivenditore di prova Srl');
await page.evaluate(async () => { const { Pref } = await import('./js/store.js'); Pref.set('trasporto_adj', 3); });

// 1. Home → Nuovo preventivo → Salva in archivio e inizia nuovo
await riempi('Officina Uno');
await v.vai(page, 'home');
const continua = await page.locator('.scelta-principale .scelta-titolo').textContent();
const nuovoHome = page.locator('#home-nuovo');
continua === 'Continua il preventivo' && await nuovoHome.isVisible() ? v.ok('Home: "Nuovo preventivo" accanto a "Continua il preventivo"') : v.ko('Home: manca "Nuovo preventivo"');
const box = await nuovoHome.boundingBox();
box && box.height >= 48 ? v.ok(`Home: "Nuovo preventivo" grande come una scelta (${Math.round(box.height)} px)`) : v.ko('Home: "Nuovo preventivo" troppo piccolo');
await nuovoHome.click();
await page.waitForSelector('.foglio [data-np="salva"]');
const pulsanti = await page.locator('.foglio [data-np]').allTextContents();
const principale = await page.locator('.foglio [data-np="salva"]').getAttribute('class');
const rosso = await page.locator('.foglio [data-np="elimina"]').getAttribute('class');
pulsanti.join('|') === 'Salva in archivio e inizia nuovo|Elimina e inizia nuovo|Annulla' && /btn-primario/.test(principale) && /btn-pericolo/.test(rosso)
  ? v.ok('finestra: salva (principale), elimina (rossa), annulla') : v.ko('finestra: ' + pulsanti.join(' | '));
(await page.evaluate(() => document.activeElement?.dataset.np)) === 'salva' ? v.ok('finestra: scelta di base "Salva in archivio"') : v.ko('finestra: il focus non è su "Salva"');
// Annulla non cambia niente
await page.click('.foglio [data-np="annulla"]');
let s = await leggi();
s.righe === 1 && s.cliente === 'Officina Uno' && !(await page.locator('.foglio').count()) ? v.ok('"Annulla": il preventivo resta com\'era') : v.ko('"Annulla" ha cambiato il preventivo');
await nuovoHome.click();
await page.click('.foglio [data-np="salva"]');
await page.waitForFunction(() => location.hash === '#/prodotti');
s = await leggi();
s.archivio.length === 1 && s.archivio[0].cliente === 'Officina Uno' && s.archivio[0].numero === `${anno}/001` && s.archivio[0].righe === 1
  ? v.ok(`salvato in archivio come ${anno}/001`) : v.ko('archivio: ' + JSON.stringify(s.archivio));
pulito(s) ? v.ok('nuovo preventivo pulito: righe, cliente, sconti, consegna e noleggio') : v.ko('non pulito: ' + JSON.stringify(s));
s.azienda === 'Rivenditore di prova Srl' && s.adj === 3 && s.contatore === 1 ? v.ok('restano azienda, adeguamento trasporto e numerazione') : v.ko('impostazioni perse: ' + JSON.stringify(s));

// 2. Prodotti › Il preventivo → Elimina e inizia nuovo → Annulla entro 10 secondi
await riempi('Officina Due');
await page.reload(); await page.waitForSelector('[data-riga="nuovo"]');
await page.click('[data-riga="nuovo"]');
await page.click('.foglio [data-np="elimina"]');
await page.waitForSelector('#toast.mostra');
const avviso = await page.locator('#toast').innerText();
s = await leggi();
/Preventivo eliminato/.test(avviso) && /Annulla/.test(avviso) && pulito(s) && (await page.locator('.riga-prev').count()) === 0
  ? v.ok('"Elimina e inizia nuovo": schermata pulita e avviso "Preventivo eliminato" con "Annulla"') : v.ko('elimina: ' + avviso + ' ' + JSON.stringify(s));
await page.waitForTimeout(8000);
(await page.locator('#toast.mostra').count()) ? v.ok('"Annulla" ancora disponibile dopo 8 secondi') : v.ko('avviso sparito prima di 10 secondi');
await page.click('.toast-azione');
await page.waitForSelector('.riga-prev');
s = await leggi();
s.righe === 1 && s.cliente === 'Officina Due' && (await page.inputValue('#rp-c')) === 'Officina Due' && s.consegna && s.noleggio
  ? v.ok('"Annulla": il preventivo eliminato torna, con consegna e noleggio') : v.ko('annulla: ' + JSON.stringify(s));
s.archivio.length === 1 ? v.ok('"Elimina" non tocca l\'archivio') : v.ko('archivio cambiato: ' + s.archivio.length);
// senza "Annulla" l'avviso sparisce dopo 10 secondi
await page.click('[data-riga="nuovo"]');
await page.click('.foglio [data-np="elimina"]');
await page.waitForSelector('#toast.mostra');
await page.waitForTimeout(10500);
(await page.locator('#toast.mostra').count()) === 0 && pulito(await leggi()) ? v.ok('dopo 10 secondi l\'avviso sparisce e il preventivo resta nuovo') : v.ko('avviso ancora visibile dopo 10 secondi');

// 3. Preventivo senza righe: riparte subito, senza finestra
await page.fill('#rp-c', 'Solo il nome');
await v.vai(page, 'home');
await page.click('#home-nuovo');
await page.waitForFunction(() => location.hash === '#/prodotti');
s = await leggi();
!(await page.locator('.foglio').count()) && pulito(s) ? v.ok('preventivo senza righe: nuovo subito, senza domande') : v.ko('vuoto: ' + JSON.stringify(s));
await v.vai(page, 'home');
(await page.locator('#home-nuovo').count()) === 0 && (await page.locator('.scelta-principale .scelta-titolo').textContent()) === 'Preventivo completo'
  ? v.ok('Home con preventivo nuovo: solo "Preventivo completo"') : v.ko('Home: "Nuovo preventivo" con preventivo vuoto');

// la numerazione continua
await riempi('Officina Tre');
await page.goto(v.url + '#/invia'); await page.waitForSelector('[data-inv="nuovo"]');
await page.click('[data-inv="nuovo"]');
await page.click('.foglio [data-np="salva"]');
await page.waitForFunction(() => /Nuovo preventivo/.test(document.querySelector('.sottotitolo')?.textContent || ''));
s = await leggi();
s.archivio.map(q => q.numero).sort().join(',') === `${anno}/001,${anno}/002` ? v.ok(`Invia: stessa finestra, numerazione continua (${anno}/002)`) : v.ko('numeri: ' + s.archivio.map(q => q.numero));

await v.fine();
