import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Owner decision 2026-10-23: the C.OG Education Bank is a SEPARATE source. No Theory Lab / cog page links to it,
// names it as a source, or points at the verbatim copies in education/bank-verbatim.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BANK = /cog000\.github\.io|Education[\s-]Bank|bank-verbatim|Micro Learning Bank/i;
const hits = [];
for (const d of ['theory-lab', 'theory-lab/lessons', 'cog', 'cog/lessons']) {
  for (const f of fs.readdirSync(path.join(root, d)).filter(f => f.endsWith('.html'))) {
    const m = BANK.exec(fs.readFileSync(path.join(root, d, f), 'utf8'));
    if (m) hits.push(`${d}/${f}: "${m[0]}"`);
  }
}
assert.deepEqual(hits, [], `pages reference the separate Education Bank:\n${hits.join('\n')}`);
console.log('lessonNoBankLinks: no page references the Education Bank');
