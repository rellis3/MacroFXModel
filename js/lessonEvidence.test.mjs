// Theory Lab lessons that cite the desk ledger.   node js/lessonEvidence.test.mjs
// A verdict box tagged data-evidence="<id>" is filled live from js/deskEvidence.js
// (via /theory-lab/desk-verdicts.json + theory-lab/assets/verdicts.js). This keeps
// the tags honest: every id must exist, every tag must record the ledger date it was
// written against, and every page with a tag must load the script that fills it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESK_EVIDENCE } from './deskEvidence.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'theory-lab', 'lessons');
const byId = new Map(DESK_EVIDENCE.map(e => [e.id, e]));
let failures = 0, tags = 0, stale = 0;
const ok = (n, c, e = '') => { if (!c) { console.log(`  ✗ FAIL ${n}${e ? '  ' + e : ''}`); failures++; } };

for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(dir, f), 'utf8');
  const found = [...html.matchAll(/<div class="(?:tl-verdict|sl-stamp) (\w+)"[^>]*data-evidence="([^"]+)"(?: data-evidence-date="([^"]*)")?/g)];
  if (!found.length) continue;
  ok(`${f} loads verdicts.js`, html.includes('../assets/verdicts.js'));
  for (const [, variant, id, date] of found) {
    tags++;
    const e = byId.get(id);
    ok(`${f}: ${id} exists in the ledger`, !!e);
    ok(`${f}: ${id} records the ledger date it was written against`, /^\d{4}-\d{2}-\d{2}$/.test(date || ''));
    // Not a failure: the page flags this itself. Listed so a re-run study shows up here too.
    if (e && (e.verdict !== variant || e.date > date)) { stale++; console.log(`  ⚠ ${f}: ${id} re-tested since written (${variant} @ ${date} → ${e.verdict} @ ${e.date})`); }
  }
}
ok('at least one lesson cites the ledger', tags > 0);
console.log(`  ${tags} tagged verdict boxes, ${stale} written against an older ledger entry`);
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
