// Theory Lab learning paths.   node js/lessonPaths.test.mjs
// theory-lab/assets/paths-data.js is generated from the lessons; this keeps it honest.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'theory-lab');
const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/paths-data.js'), 'utf8'), ctx);
const D = ctx.window.TL_PATHS;
let failures = 0;
const ok = (n, c, e = '') => { if (!c) { console.log(`  ✗ FAIL ${n}${e ? '  ' + e : ''}`); failures++; } };
const file = s => path.join(root, 'lessons', s + '.html');
const all = new Set([...D.core.lessons, ...D.paths.flatMap(p => p.stages.flatMap(s => s.lessons)), ...D.paths.flatMap(p => p.deliverable.steps.map(s => s.lesson))]);
for (const s of all) {
  ok(`${s} exists`, fs.existsSync(file(s)));
  ok(`${s} has data (title, minutes)`, !!D.lessons[s]);
  if (fs.existsSync(file(s)) && D.lessons[s]) {
    const h1 = (fs.readFileSync(file(s), 'utf8').match(/<h1 class="tl-title">([\s\S]*?)<\/h1>/) || [])[1] || '';
    const t = h1.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
    ok(`${s} title in sync with its <h1>`, t === D.lessons[s].t, `"${D.lessons[s].t}" vs "${t}"`);
    ok(`${s} loads paths.js`, /assets\/paths\.js/.test(fs.readFileSync(file(s), 'utf8')));
  }
}
ok('no institutional (admin-only) lesson on a public path', ![...all].some(s => s.startsWith('institutional-')));
for (const p of D.paths) {
  ok(`${p.id}: has a capstone with steps`, p.deliverable && p.deliverable.steps.length >= 3);
  ok(`${p.id}: every stage has lessons`, p.stages.every(s => s.lessons.length));
}
console.log(`  ${D.paths.length} paths, ${all.size} distinct lessons`);
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
