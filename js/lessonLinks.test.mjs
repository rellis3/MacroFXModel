// Link-rot tests for js/lessonLinks.js.   node js/lessonLinks.test.mjs
// Every mapped href must point at a lesson file that exists, at an id that exists in
// it, and (where named) at a ledger entry the lesson really cites.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LESSON_LINKS, lessonLinkHTML } from './lessonLinks.js';
import { DESK_EVIDENCE } from './deskEvidence.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

const entries = Object.entries(LESSON_LINKS);
ok('map is non-empty', entries.length > 0, `${entries.length} conditions`);
for (const [key, l] of entries) {
  const m = /^\/theory-lab\/lessons\/([a-z0-9-]+\.html)#([A-Za-z][\w-]*)$/.exec(l.href || '');
  ok(`${key}: href is /theory-lab/lessons/<slug>.html#<anchor>`, !!m, l.href);
  if (!m) continue;
  const file = path.join(ROOT, 'theory-lab', 'lessons', m[1]);
  const exists = fs.existsSync(file);
  ok(`${key}: ${m[1]} exists`, exists);
  if (!exists) continue;
  const html = fs.readFileSync(file, 'utf8');
  ok(`${key}: #${m[2]} exists in ${m[1]}`, new RegExp(`\\sid="${m[2]}"`).test(html));
  ok(`${key}: has a label`, typeof l.label === 'string' && l.label.length > 0);
  if (l.evidence) {
    ok(`${key}: ledger id ${l.evidence} is in deskEvidence`, DESK_EVIDENCE.some(e => e.id === l.evidence));
    ok(`${key}: ${m[1]} cites data-evidence="${l.evidence}"`, html.includes(`data-evidence="${l.evidence}"`));
  }
  const a = lessonLinkHTML(key);
  ok(`${key}: link opens a new tab with rel=noopener and honest text`,
    a.includes(`href="${l.href}"`) && a.includes('target="_blank"') && a.includes('rel="noopener"') && a.includes('Theory Lab: why'));
}
ok('unknown key renders nothing', lessonLinkHTML('no-such-condition') === '');

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
