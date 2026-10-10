/* Formati italiani e date nel fuso di Roma. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { euro, euroOTrattino, numero2, leggiImporto, percento, esc } from '../js/core/formato.js';
import { oggiISO, dataDaIndirizzo, isoToIT, dataIt, dataBreve } from '../js/core/date.js';

const nb = s => s.replace(/ /g, ' ');

test('importi con il punto delle migliaia anche sotto 10.000', () => {
  assert.equal(nb(euro(4800)), '4.800,00 €');
  assert.equal(nb(euro(1234.565)), '1.234,57 €');
  assert.equal(nb(euro(0)), '0,00 €');
  assert.equal(nb(euro(undefined)), '0,00 €');
  assert.equal(euroOTrattino(NaN), '—');
  assert.equal(numero2(18381), '18.381,00');
  assert.equal(numero2(4800), '4.800,00');
  assert.equal(percento(33.5), '33,5');
});

test('lettura importi all\'italiana', () => {
  assert.equal(leggiImporto('18.381,00 €'), 18381);
  assert.equal(leggiImporto(' 3 500 '), 3500);
  assert.equal(leggiImporto('12,5'), 12.5);
  assert.equal(leggiImporto('abc'), 0);
  assert.equal(leggiImporto(''), 0);
});

test('oggi nel fuso italiano, non in quello del dispositivo', () => {
  // 14/10/2026 alle 23:30 UTC sono già le 01:30 del 15/10 a Roma (ora legale)
  assert.equal(oggiISO(new Date('2026-10-14T23:30:00Z')), '2026-10-15');
  assert.equal(oggiISO(new Date('2026-10-14T21:59:00Z')), '2026-10-14');
  // inverno: UTC+1
  assert.equal(oggiISO(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
  // anteprima con ?data=
  assert.equal(oggiISO(new Date('2026-10-10T10:00:00Z'), '2026-10-15'), '2026-10-15');
  assert.equal(dataDaIndirizzo('?data=2026-10-15'), '2026-10-15');
  assert.equal(dataDaIndirizzo('?data=15/10/2026'), null);
  assert.equal(dataDaIndirizzo(''), null);
});

test('date scritte all\'italiana', () => {
  assert.equal(isoToIT('2026-10-15'), '15/10/2026');
  assert.equal(dataIt('2026-01'), 'gennaio 2026');
  assert.equal(dataIt('2026-07-29', true), '29 luglio 2026');
  assert.equal(dataIt('2026-07-29'), '29/07/2026');
  assert.equal(dataBreve('2026-10-14T23:30:00Z'), '15/10/2026');
});

test('testo sicuro nell\'HTML', () => {
  assert.equal(esc('<b>"A&B"</b>'), '&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;');
});
