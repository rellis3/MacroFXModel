// The Theory Lab's two entry pages: the start page (index.html) and the all-lessons list (hub.html).
//   node js/hubStructure.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripDesk } from './deskStrip.js';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'theory-lab');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let failures = 0;
const ok = (name, cond, extra = '') => { if (!cond) { console.log(`  ✗ FAIL ${name}${extra ? '  ' + extra : ''}`); failures++; } };

const index = read('index.html'), hub = read('hub.html');

// Every link on the start page goes somewhere real.
const targets = [...index.matchAll(/<a [^>]*href="([^"#]+)(?:#[^"]*)?"/g)].map(m => m[1]).filter(h => !/^(?:https?:|\/|mailto:)/.test(h));
for (const t of new Set(targets)) ok(`index.html links to an existing page: ${t}`, fs.existsSync(path.join(root, t)));
ok('index.html has the three ways in (start, paths, all lessons)', ['start.html', 'paths.html', 'hub.html'].every(h => targets.includes(h)));
ok('index.html crumb is exactly "Theory Lab" (the server puts the sign-out link there)', /<div class="tl-crumb">Theory Lab<\/div>/.test(index));

// Desk-only material on the start page sits inside DESK markers, and the drill pair inside DRILL markers too.
const shared = stripDesk(index);
for (const needle of ['market-reading.html', 'replay.html', 'tl-today', 'today.js', 'MacroFXModel'])
  ok(`index.html: "${needle}" is desk-only and stripped for shared readers`, !shared.includes(needle));
ok('index.html: desk practice cards sit inside DRILL sentinels',
  /<!-- DRILL:START -->[\s\S]*market-reading\.html[\s\S]*replay\.html[\s\S]*<!-- DRILL:END -->/.test(index));
ok('index.html: the shared version still has the practice tools', ['practice.html', 'errors.html', 'checklist.html', 'journal.html'].every(h => shared.includes(h)));

// The all-lessons list is only lessons: none of what moved to the start page is still here.
for (const needle of ['id="tl-today"', 'id="tl-review"', 'market-reading.html', 'replay.html', 'href="practice.html"', 'href="journal.html"', 'href="paths.html" data-slug'])
  ok(`hub.html no longer carries: ${needle}`, !hub.includes(needle));
ok('hub.html links back to the start page', /<a href="index\.html">Theory Lab<\/a>/.test(hub));
ok('hub.html has the section navigation bar', /<nav id="tl-secnav"/.test(hub));
const cards = [...hub.matchAll(/<a class="tl-card" href="([^"]+)"/g)].map(m => m[1]);
ok('every hub card is a lesson', cards.every(h => /^lessons\/[a-z0-9-]+\.html$/.test(h)), cards.filter(h => !/^lessons\//.test(h)).join(', '));
for (const h of cards) ok(`hub card exists: ${h}`, fs.existsSync(path.join(root, h)));

// Pages that sit under the lab (not lessons) link their crumb to the start page, not the lesson list.
for (const f of fs.readdirSync(root).filter(f => f.endsWith('.html') && f !== 'hub.html' && f !== 'index.html'))
  ok(`${f}: crumb "Theory Lab" links to the start page`, !read(f).includes('<a href="hub.html">Theory Lab</a>'));

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
