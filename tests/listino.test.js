/*
 * Listino: i file portati 1:1 sono identici agli originali (altrimenti il book cifrato
 * non si sblocca) e danno gli stessi risultati sul listino sintetico.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { RADICE, leggiJSON, scriptClassico } from './aiuti.js';
import { pdfSintetico } from './fixtures/listino-sintetico.js';

const sha = rel => crypto.createHash('sha256').update(fs.readFileSync(path.join(RADICE, rel))).digest('hex');
const G = leggiJSON('tests/golden/listino.json');

// Impronte dei file originali di listino-in-tasca 1.4.0: NON si cambiano.
const IDENTICI = {
  'js/listino/parser.js': '3986c0e8462dc010e32241dcb12eb5e8f0ce1ccf3ae760692be89dbde7c37f47',
  'js/listino/regole.js': '5410772ca589f615292269cc363667f1e14d1928e26e7a68c313626c22c78cec',
  'js/listino/cerca.js': '6a227642b61884e151bee0a1145ca87d38e23fd591d7933c2fb04fa0e819596c',
  'js/listino/agente.js': '1e136f46fba59f06963231955eeb3c6bb82b9ada271e86c29ba4fa8248ef5abb',
  'js/listino/pdfview.js': 'd45e8ca875cabe5124b7693ce58f15a0bd993dd15ec3cae8106457b557fc3682',
  'data/agente.pack.json': 'f728ab82405278d3f906f285496460de35a74a75f6efd040dd2dd2957bd1fdd3',
  'data/d/03c89b2a1496afb3c082.bin': '5e3e06aed1ea1b420558b005906cdb74cd8ee00bffa18913b42ea7abc346ec76',
  'data/d/0ff5c605e6a0ab2bb1c8.bin': '7f171e565aeb9e3cf6a04287aa62e217718423020dee8157bae7f66d198c55d8',
  'data/d/1968389a3afbb5c7fd8b.bin': '33eee205e3ed7453770f82d341ab37f0415b4b252b89def2d170acb1293df1bd',
  'data/d/229e950c2f0179ef7687.bin': '29356ba5dca030f5106425b3dfb1c56bc4834812744a752efc3f7be62f40ba2c',
  'data/d/2ac5ba5a36ea9149ffb7.bin': '91511362dc4ff6e1bf7840b9330fa267ee379ea7e03d1c20ee3ac9c16ad22068',
  'data/d/2e3db457e36e9fa79be4.bin': '0c30773d942bfc35abc89a91a45951304c94048d9b459893e1d24788071a944a',
  'data/d/35fd3aac8656e6240093.bin': 'fd817c86d5d71b614b70c3b03181850f846ba3d41d02f58138a247ef54d9ead1',
  'data/d/38251c61cd19ba62e810.bin': '471c938693e76ecda9debe26e185d8366a853f551c2688c29b563cf0274ef573',
  'data/d/3ab5368067cb5ed977e5.bin': '61c410e190e3a64426585ae5d341cd0c658c946decf02ef22b089e872865fd63',
  'data/d/4f7705660db1af1ed40a.bin': '94db0a77154a18dd44fc2d7134b78a267a22fbeb6524f6f9120773601045385e',
  'data/d/8f3775d736a7c615c6f5.bin': '92ba219902e415005a3fa4fb16a9d91030e64ca41083c914490aa65a56e449c7'
};

test('parser, regole, ricerca, book e disegni sono byte per byte quelli originali', () => {
  for (const [f, h] of Object.entries(IDENTICI)) assert.equal(sha(f), h, f + ' è stato modificato');
  assert.equal(fs.readdirSync(path.join(RADICE, 'data/d')).length, 11, 'disegni cifrati');
});

const parser = scriptClassico('js/listino/parser.js').ListinoParser;

test('parser: PARSER_VERSION 4 e catalogo identico all\'originale sul listino sintetico', async () => {
  assert.equal(parser.PARSER_VERSION, 4);
  const cat = await parser.parseListino(pdfSintetico());
  assert.match(cat.parsedAt, /^\d{4}-\d{2}-\d{2}T/);
  delete cat.parsedAt;
  assert.deepEqual(JSON.parse(JSON.stringify(cat)), G.catalogo);
  for (const [s, n] of G.parsePrezzi) assert.deepEqual(parser.priceToNumber(s), n === null ? NaN : n, s);
});

test('chiave del book: testo canonico e SHA-256 invariati', async () => {
  const agente = scriptClassico('js/listino/agente.js', { atob, TextEncoder, TextDecoder }).Agente;
  const cat = await parser.parseListino(pdfSintetico());
  const canonico = agente.canonical(cat);
  assert.equal(canonico, G.canonico);
  assert.equal(crypto.createHash('sha256').update(agente.KDF_LABEL + canonico).digest('hex'), G.chiaveSha256);
});

test('il book NON si apre con un listino diverso', async () => {
  const agente = scriptClassico('js/listino/agente.js', { atob, TextEncoder, TextDecoder }).Agente;
  const pack = leggiJSON('data/agente.pack.json');
  const cat = await parser.parseListino(pdfSintetico());
  await assert.rejects(agente.decrypt(pack, cat, crypto.webcrypto.subtle));
});

test('regole dei veicoli e ricerca: risultati identici', () => {
  const regole = scriptClassico('js/listino/regole.js').Regole;
  const cat = regole.applyVehicleRules(JSON.parse(JSON.stringify(G.catalogo)));
  assert.deepEqual(JSON.parse(JSON.stringify(cat)), G.conRegole);
  const cerca = scriptClassico('js/listino/cerca.js').Cerca;
  const prodotti = JSON.parse(JSON.stringify(cat.products));
  prodotti.forEach(p => cerca.prepare(p, cat.families[p.family]));
  for (const [q, codici] of G.ricerche) assert.deepEqual(Array.from(cerca.search(prodotti, q), p => p.code + '|' + p.power), codici, q);
});
