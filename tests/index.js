/*
 * Punto d'ingresso di `node --test tests/`: su Node 24 una cartella passata a --test
 * viene aperta come modulo, quindi qui carico tutti i file *.test.js.
 */
import fs from 'node:fs';

const qui = new URL('./', import.meta.url);
for (const f of fs.readdirSync(qui).filter(f => f.endsWith('.test.js')).sort()) await import(new URL(f, qui));
