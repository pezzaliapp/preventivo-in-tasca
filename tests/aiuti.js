/* Piccoli aiuti condivisi dai test. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const leggiJSON = p => JSON.parse(fs.readFileSync(path.join(RADICE, p), 'utf8'));

/**
 * Le app originali scrivevano "4800,00" e le nuove "4.800,00" (decisione S-08):
 * per confrontare i testi tolgo il punto delle migliaia dai numeri in entrambi.
 */
export const senzaMigliaia = s => String(s).replace(/(\d)\.(?=\d{3}(?!\d))/g, '$1');

/** "18.197,19 €" → 18197.19 */
export const numeroIT = s => Number(String(s).replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.'));

/** Esegue uno script classico del listino (parser, regole, cerca, agente) in un contesto isolato. */
export function scriptClassico(rel, extra = {}) {
  const ctx = vm.createContext(Object.assign({ console }, extra));
  ctx.self = ctx;
  vm.runInContext(fs.readFileSync(path.join(RADICE, rel), 'utf8'), ctx, { filename: rel });
  return ctx;
}

/** Dati trasporti di prova (copia congelata al 10/10/2026, compreso il prezzo del gasolio). */
export function datiTrasportiProva() {
  const d = {};
  for (const k of ['listini', 'pallet', 'groupage', 'articoli', 'geo', 'gasolio']) d[k] = leggiJSON(`tests/fixtures/trasporti/${k}.json`);
  return d;
}
