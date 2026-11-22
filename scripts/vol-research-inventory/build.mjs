// Builds analysis/output/vol-research-inventory/inventory.json for vol-research-inventory.html.
// For every proof [file, regex] in inventory.mjs it finds the first matching line in the file, copies the line
// verbatim with its number and exits non-zero if any proof is missing: a number on the page cannot drift from its source.
//
//   node scripts/vol-research-inventory/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import * as INV from './inventory.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'analysis/output/vol-research-inventory/inventory.json');
const cache = new Map();
const missing = [];

function lines(file) {
  if (!cache.has(file)) {
    const p = path.join(ROOT, file);
    cache.set(file, fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n') : null);
  }
  return cache.get(file);
}

export function resolve([file, pattern]) {
  const ls = lines(file);
  if (!ls) { missing.push(`${file}: file not found`); return { file, pattern, ok: false }; }
  const re = new RegExp(pattern);
  const i = ls.findIndex(l => re.test(l));
  if (i < 0) { missing.push(`${file}: no line matches /${pattern}/`); return { file, pattern, ok: false }; }
  let text = ls[i].trim();
  if (text.length > 420) text = text.slice(0, 417) + '…';
  return { file, line: i + 1, text, ok: true };
}

const withProof = o => ({ ...o, proof: (o.proof || []).map(resolve) });

let commit = 'unknown';
try { commit = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch { /* not a git checkout */ }

const out = {
  built: new Date().toISOString(),
  commit,
  repo: 'rellis3/MacroFXModel',
  meta: INV.META,
  statuses: INV.STATUS,
  keyFacts: INV.KEY_FACTS,
  inFlight: withProof(INV.IN_FLIGHT),
  clarification: withProof(INV.KEY_CLARIFICATION),
  sections: INV.SECTIONS.map(s => ({ ...s, rows: s.rows.map(withProof) })),
  top5: INV.TOP5,
  dontRepeat: INV.DONT_REPEAT,
  conflicts: INV.CONFLICTS,
  conflictProof: INV.CONFLICT_PROOF.map(resolve),
  next: INV.NEXT,
};

for (const s of out.sections) for (const r of s.rows) {
  if (!INV.STATUS.includes(r.status)) missing.push(`${r.q} ${r.area}: unknown status "${r.status}"`);
}

const total = [out.inFlight, out.clarification, ...out.sections.flatMap(s => s.rows)].reduce((n, o) => n + o.proof.length, 0)
  + out.conflictProof.length;
out.proofCount = total;
out.sourceCount = cache.size;

if (missing.length) {
  console.error(`FAILED: ${missing.length} of ${total} proofs could not be verified:\n  ` + missing.join('\n  '));
  process.exit(1);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`OK: ${total} proofs verified against ${cache.size} source files at ${commit.slice(0, 9)} -> ${path.relative(ROOT, OUT)}`);
