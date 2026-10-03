// The shareable Theory Lab: desk material only inside DESK markers.   node js/deskStrip.test.mjs
// A non-admin reader is served stripDesk(page). This checks every Theory Lab page:
// markers pair up, the stripped page is still well-formed, and nothing that is about
// THIS desk (its verdicts, its tests, its systems, its live data) survives the strip.
// Generic trading language ("a desk", "desks commonly…") is fine and not matched, and so
// is "repo" in the money-market sense; "this repo" (the codebase) and its files are not.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripDesk, deskMarkerProblems } from './deskStrip.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'theory-lab');
// Served only to admins (server.js returns 404 to everyone else), so not checked here;
// lessons/action-*.html likewise.
const ADMIN_ONLY = new Set(['market-reading.html', 'capstone-vol.html', 'capstone-macro.html']);
const pages = [
  ...fs.readdirSync(root).filter(f => f.endsWith('.html') && !ADMIN_ONLY.has(f)),
  ...fs.readdirSync(path.join(root, 'lessons')).filter(f => f.endsWith('.html') && !f.startsWith('action-')).map(f => 'lessons/' + f),
];
// What counts as the owner's desk, not trading in general.
const DESK = /\bthis desk\b|\bthe desk['’]s (own|verdicts?|tests?|record|ledger|board|data|systems?|result|finding|prior|pre-?registration)|\bdesk[- ]verdicts?\b|\bdesk (ledger|evidence)\b|\bdesk test\b|\bdesk data\b|data-evidence=|MacroFXModel|desk-verdicts\.json|capstone-board\.json|\.\.\/today\.html|\bour desk\b|\bmy desk\b|\bthis (?:repo|project|codebase)\b|\bthe codebase\b|\bthis project['’]s\b|\bjs\/[\w./-]+\.(?:js|mjs)\b|\b[\w-]+\.py\b|Lego Principle|CLAUDE\.md|\bMEMORY\.md\b/i;
const TAGS = ['div', 'section', 'details', 'summary', 'ul', 'ol', 'li', 'p', 'table', 'tr', 'td', 'svg', 'span', 'a', 'h2', 'h3'];
let failures = 0, leaks = 0;
const fail = (m) => { console.log('  ✗ FAIL ' + m); failures++; };
for (const f of pages) {
  const raw = fs.readFileSync(path.join(root, f), 'utf8');
  for (const p of deskMarkerProblems(raw)) fail(`${f}: ${p}`);
  const t = stripDesk(raw).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  for (const g of TAGS) {
    const o = (t.match(new RegExp(`<${g}(?:\\s[^>]*)?>`, 'g')) || []).length - (t.match(new RegExp(`<${g}(?:\\s[^>]*)?/>`, 'g')) || []).length;
    const c = (t.match(new RegExp(`</${g}>`, 'g')) || []).length;
    if (o !== c) { fail(`${f}: <${g}> unbalanced after strip (${o} open, ${c} close)`); break; }
  }
  t.split('\n').forEach((line, i) => {
    const m = line.match(DESK);
    if (m) { leaks++; if (leaks <= 40) fail(`${f}:${i + 1} desk material outside DESK markers: "${m[0]}"`); }
  });
}
if (leaks > 40) console.log(`  … ${leaks - 40} more`);
console.log(`  ${pages.length} pages, ${leaks} desk mentions outside markers`);
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
