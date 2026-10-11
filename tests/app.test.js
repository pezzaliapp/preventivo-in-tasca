/* Guscio dell'app: lista offline completa, versioni allineate, privacy del listino. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RADICE, leggiJSON } from './aiuti.js';

const leggi = rel => fs.readFileSync(path.join(RADICE, rel), 'utf8');
const sw = leggi('sw.js');
const SHELL = JSON.parse(sw.slice(sw.indexOf('const SHELL = [') + 'const SHELL = '.length, sw.indexOf('];', sw.indexOf('const SHELL')) + 1).replace(/'/g, '"'));

function tutti(dir) {
  return fs.readdirSync(path.join(RADICE, dir), { withFileTypes: true })
    .flatMap(d => d.isDirectory() ? tutti(path.join(dir, d.name)) : [path.join(dir, d.name).split(path.sep).join('/')]);
}

test('ogni file della lista offline esiste', () => {
  for (const f of SHELL) if (f !== './') assert.ok(fs.existsSync(path.join(RADICE, f)), 'manca ' + f);
});

test('nella lista offline ci sono tutti i file dell\'app', () => {
  const servono = [...tutti('js'), ...tutti('css'), ...tutti('fonts').filter(f => f.endsWith('.woff2')),
    ...tutti('icons'), ...tutti('data/trasporti'), ...tutti('data/noleggio'), 'data/agente.pack.json',
    'lib/pdf.min.js', 'lib/pdf.worker.min.js', 'lib/xlsx.mini.min.js', 'lib/jspdf.umd.min.js', ...tutti('strumenti'), 'index.html', 'manifest.webmanifest', 'versione.json'];
  for (const f of servono) assert.ok(SHELL.includes(f), 'non è nella lista offline di sw.js: ' + f);
});

test('pubblicazione: ogni file della lista offline e del book è tra quelli copiati sul sito', () => {
  const wf = leggi('.github/workflows/pagine.yml');
  const riga = /cp -R (.+) _site\//.exec(wf)[1].split(/\s+/);
  const pubblicato = f => riga.some(r => f === r || f.startsWith(r + '/'));
  for (const f of SHELL) if (f !== './') assert.ok(pubblicato(f), 'non pubblicato: ' + f);
  for (const f of tutti('data/d')) assert.ok(pubblicato(f), 'non pubblicato: ' + f);
  for (const via of ['_sorgenti', 'tests', 'docs', 'node_modules', 'scripts', 'PROMPT_CLAUDE_CODE.md', 'CLAUDE.md']) assert.ok(!riga.includes(via), via + ' non va sul sito');
});

test('versione uguale in sw.js, versione.json e app.js', () => {
  const v = /const VERSION = 'pit-([\d.]+)'/.exec(sw)[1];
  assert.equal(leggiJSON('versione.json').app, v);
  assert.equal(/export const VERSIONE = '([\d.]+)'/.exec(leggi('js/app.js'))[1], v);
});

test('privacy: il listino PDF non entra nella repo né nella cache', () => {
  const gi = leggi('.gitignore');
  assert.match(gi, /^\*\.pdf$/m);
  assert.match(gi, /^!data\/noleggio\/documenti\/\*\.pdf$/m);
  for (const f of SHELL.filter(f => /\.pdf$/i.test(f))) assert.ok(f.startsWith('data/noleggio/documenti/'), f);
  assert.match(sw, /if \(\/\\\.pdf\$\/i\.test\(url\.pathname\) && !url\.pathname\.includes\('\/data\/noleggio\/documenti\/'\)\) return;/);
});

test('nessuna risorsa esterna: niente Google Fonts, Analytics o CDN', () => {
  const html = leggi('index.html') + leggi('css/tokens.css') + leggi('css/app.css') + tutti('js').map(leggi).join('');
  assert.doesNotMatch(html, /googleapis|gstatic|googletagmanager|gtag\(|cdn\.|unpkg|jsdelivr/i);
});

test('manifest e autore', () => {
  const m = leggiJSON('manifest.webmanifest');
  assert.equal(m.name, 'Preventivo in tasca');
  assert.equal(m.scope, './');
  assert.ok(m.icons.some(i => i.purpose === 'maskable'));
  assert.match(m.description, /Alessandro Pezzali/);
  assert.match(leggi('LICENSE'), /Alessandro Pezzali\. Tutti i diritti riservati\./);
});

test('ogni nome importato da un modulo esiste tra le sue esportazioni', () => {
  const moduli = tutti('js').filter(f => !f.startsWith('js/listino/'));
  const esportati = f => {
    const src = leggi(f);
    const nomi = new Set([...src.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([\w$]+)/g)].map(m => m[1]));
    for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) m[1].split(',').forEach(x => nomi.add(x.trim().split(/\s+as\s+/).pop()));
    return nomi;
  };
  for (const f of moduli) {
    for (const m of leggi(f).matchAll(/import\s*\{([^}]+)\}\s*from\s*'([^']+)'/g)) {
      const dest = path.posix.join(path.posix.dirname(f), m[2]);
      assert.ok(fs.existsSync(path.join(RADICE, dest)), `${f}: file importato inesistente ${dest}`);
      const ok = esportati(dest);
      for (const nome of m[1].split(',').map(x => x.trim().split(/\s+as\s+/)[0]).filter(Boolean))
        assert.ok(ok.has(nome), `${f}: "${nome}" non è esportato da ${dest}`);
    }
  }
});

test('documenti BCC: ogni file elencato esiste ed è nella lista offline', () => {
  const k = leggiJSON('data/noleggio/documenti.json');
  const files = [...k.documenti, ...k.oltre50mila.documenti].map(d => 'data/noleggio/documenti/' + d.file);
  assert.equal(files.length, 7);
  for (const f of files) { assert.ok(fs.existsSync(path.join(RADICE, f)), f); assert.ok(SHELL.includes(f), f); }
});

test('workflow del gasolio copiato: aggiorna il file dati di questa app', () => {
  const wf = leggi('.github/workflows/gasolio.yml');
  const py = leggi('scripts/aggiorna_gasolio.py');
  assert.match(wf, /python scripts\/aggiorna_gasolio\.py/);
  assert.match(wf, /git add data\/trasporti\/gasolio\.json/);
  assert.match(wf, /paths-ignore: \["data\/trasporti\/gasolio\.json"\]/);
  assert.match(py, /"data" \/ "trasporti" \/ "gasolio\.json"/);
  const g = leggiJSON('data/trasporti/gasolio.json');
  assert.ok(g.base.prezzo > 0 && g.attuale.prezzo > 0 && /^\d{4}-\d{2}-\d{2}$/.test(g.attuale.data));
});
