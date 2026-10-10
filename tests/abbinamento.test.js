/* Abbinamento listino ↔ catalogo trasporti, con i nomi veri del catalogo e nomi di listino plausibili. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { leggiJSON } from './aiuti.js';
import { abbina, chiavi } from '../js/core/abbinamento.js';

const articoli = leggiJSON('tests/fixtures/trasporti/articoli.json');
const prova = (name, title = '', code = '09999999', subtitle = '') => abbina({ code, name }, { title, subtitle }, articoli);

test('sigle e codici a 8 cifre del catalogo', () => {
  assert.deepEqual(chiavi('TOUCH MEC 2000S LIFT ( con sollevatore cod. 21100399 )'), { codici: ['21100399'], parole: ['touch', 'mec', '2000s', 'lift', 'sollevatore'] });
  assert.deepEqual(chiavi('F 535S + RF SYSTEM').parole, ['f', '535s', 'rf', 'system']);
});

test('abbinamento sicuro: vince il nome più specifico che compare per intero', () => {
  const casi = [
    [prova('TOUCH MEC 2000S', 'TOUCH MEC 2000S'), 'TOUCH MEC 2000S'],
    [prova('TOUCH MEC 2000S-P', 'TOUCH MEC 2000S'), 'TOUCH MEC 2000S-P'],
    [prova('TOUCH MEC 2000S-P LIFT con sollevatore', 'TOUCH MEC 2000S'), 'TOUCH MEC 2000S-P LIFT ( con sollevatore cod. 21100399 )'],
    [prova('F 535S leverless', 'F 535S'), 'F 535S LEVERLESS'],
    [prova('F535S + RF System', 'F 535S'), 'F 535S + RF SYSTEM'],
    [prova('Assetto ruote 3D', 'GEO 25 MOBILE', '03100103'), 'GEO 25 MOBILE cod. 03100103'],
    [prova('Sollevatore a due colonne PFA 40', 'PFA 40'), 'PFA 40']
  ];
  for (const [r, nome] of casi) { assert.equal(r.esito, 'sicuro', nome); assert.equal(r.articolo.nome, nome); }
});

test('abbinamento incerto: 2–3 proposte da scegliere', () => {
  const r = prova('MEC 1000 versione base', 'MEC 1000', '09999999', 'Equilibratrice per auto con sonar e laser');
  assert.equal(r.esito, 'incerto');
  assert.ok(r.proposte.length >= 2 && r.proposte.length <= 3);
  assert.equal(r.proposte[0].art.nome, 'TOUCH MEC 1000 SONAR');
});

test('nessun abbinamento: nessuna parola di modello in comune', () => {
  assert.equal(prova('Compressore 100 litri', 'Compressori').esito, 'nessuno');
  assert.equal(prova('Flangia universale', 'ACCESSORI').esito, 'nessuno');
});

test('una parola di una sola lettera deve comparire intera ("P" non è "pneumatico")', () => {
  const r = prova('TOUCH MEC 2000S per pneumatici', 'TOUCH MEC 2000S');
  assert.equal(r.articolo.nome, 'TOUCH MEC 2000S');
});

test('modelli diversi con nomi simili: nel dubbio "da scegliere", mai "sicuro"', () => {
  // "MEC 1000" non è "TOUCH MEC 1000 SONAR", anche se il sottotitolo parla di touch e sonar
  const mec = prova('MEC 1000 versione base', 'MEC 1000', '09999999', 'Equilibratrice touch con sonar e laser');
  assert.notEqual(mec.esito, 'sicuro');
  assert.ok(mec.proposte.some(p => p.art.nome === 'TOUCH MEC 1000 SONAR'));
  // la parola di una variante (P, sollevatore) nel listino: non si sceglie da soli
  assert.notEqual(prova('Versione P con sollevatore', 'TOUCH MEC 2000S').esito, 'sicuro');
  // VDL e VDLL sono modelli diversi
  assert.equal(prova('MEC 822VDLL SONAR', 'MEC 822VDLL SONAR').articolo.nome, 'MEC 822VDLL SONAR');
  assert.equal(prova('MEC 822VDL SONAR', 'MEC 822VDL SONAR').articolo.nome, 'MEC 822VDL SONAR');
  // lo stesso modello scritto con uno spazio resta lui; "900" non diventa "900B"
  assert.equal(prova('TOUCH MEC 900 B ESD', '').articolo.nome, 'TOUCH MEC 900B ESD');
  assert.equal(prova('TOUCH MEC 900 ESD', '').articolo.nome, 'TOUCH MEC 900 ESD');
  // dopo il modello c'è un'altra sigla: è un altro modello
  assert.notEqual(prova('PFA 40 PFA50', '').esito, 'sicuro');
  // MEC 100 non è MEC 1000
  const cento = prova('MEC 1000', 'MEC 1000');
  assert.ok(!(cento.esito === 'sicuro' && cento.articolo.nome === 'MEC 100 ESD'));
  assert.equal(prova('TOUCH MEC 1000 SONAR', 'TOUCH MEC 1000 SONAR').articolo.nome, 'TOUCH MEC 1000 SONAR');
});

test('su tutto il catalogo: ogni articolo, usato come nome di listino, si abbina a sé stesso o resta da scegliere', () => {
  let sicuri = 0, sbagliati = [];
  for (const a of articoli) {
    const r = abbina({ code: '09999999', name: a.nome }, { title: '' }, articoli);
    if (r.esito !== 'sicuro') continue;
    sicuri++;
    if (r.articolo.nome !== a.nome) sbagliati.push(`${a.nome} → ${r.articolo.nome}`);
  }
  assert.deepEqual(sbagliati, []);
  assert.ok(sicuri > 100, `sicuri: ${sicuri}`);
});

test('Consegna: con una macchina non abbinata il costo non si mostra', async () => {
  const { controlloCarico } = await import('../js/core/abbinamento.js');
  const voci = [
    { it: { code: '01100313', name: 'MEC 822VDL-P SONAR' }, p: { accessory: false }, stato: 'art' },
    { it: { code: '02100101', name: 'F 536S GT RACING MI' }, p: { accessory: false }, stato: 'da-scegliere' },
    { it: { code: '25100040', name: 'Flangia' }, p: { accessory: true }, stato: 'escluso' }
  ];
  const c = controlloCarico(voci);
  assert.equal(c.completo, false);
  assert.deepEqual(c.mancanti, [{ code: '02100101', nome: 'F 536S GT RACING MI' }]);
  // abbinata la macchina, il calcolo è completo; l'accessorio escluso resta fuori
  voci[1].stato = 'art';
  const ok = controlloCarico(voci);
  assert.equal(ok.completo, true);
  assert.deepEqual(ok.incluse, ['MEC 822VDL-P SONAR', 'F 536S GT RACING MI']);
  // un accessorio "da scegliere" non blocca
  assert.equal(controlloCarico([{ it: { code: 'x', name: 'Cono' }, p: { accessory: true }, stato: 'da-scegliere' }]).completo, true);
});
