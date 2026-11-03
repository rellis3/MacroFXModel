#!/usr/bin/env node
// Evidence map for a research theme: everything the repo already knows, grouped by verdict.
//
//   node .claude/skills/research-director/scripts/evidence_map.mjs gex gamma "zero gamma"
//   node .claude/skills/research-director/scripts/evidence_map.mjs --brief rates nasdaq
//
// Matches each keyword (case-insensitive) against Evidence Book entries (id, claim, result, use), register rows
// (plans/RESEARCH_REGISTER.md) and prereg/results file names under forge/, MD files/, oi_research_book/,
// analysis/output/. Read-only.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const brief = args.includes('--brief');
const kws = args.filter(a => !a.startsWith('--')).map(k => k.toLowerCase());
if (!kws.length) { console.error('usage: evidence_map.mjs [--brief] <keyword> [keyword …]'); process.exit(2); }

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const hit = s => { const t = String(s ?? '').toLowerCase(); return kws.some(k => t.includes(k)); };
const cut = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

const { DESK_EVIDENCE: E } = await import(pathToFileURL(join(ROOT, 'js/deskEvidence.js')).href);
const ev = E.filter(e => hit(e.id) || hit(e.claim) || hit(e.result) || hit(e.use));
const order = ['validated', 'underpowered', 'null', 'context'];
const L = [`# Evidence map: ${kws.join(', ')}`, '', `${ev.length} of ${E.length} Evidence Book entries match.`, ''];
for (const v of order) {
  const xs = ev.filter(e => e.verdict === v).sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!xs.length) continue;
  L.push(`## ${v.toUpperCase()} (${xs.length})`, '');
  for (const e of xs) {
    L.push(`- **${e.id}** (${e.date}, ${e.domain}${e.instruments ? ', ' + e.instruments.join('/') : ''}) — ${cut(e.claim, 160)}`);
    if (!brief) { L.push(`  - result: ${cut(e.result, 420)}`); L.push(`  - use: ${cut(e.use, 300)}`); L.push(`  - doc: \`${e.doc}\``); }
  }
  L.push('');
}

const regPath = join(ROOT, 'plans/RESEARCH_REGISTER.md');
if (existsSync(regPath)) {
  const rows = readFileSync(regPath, 'utf8').split('\n').filter(l => /^\| [a-z0-9]/.test(l) && hit(l));
  L.push(`## Register rows (${rows.length})`, '');
  for (const r of rows) { const c = r.split('|').map(x => x.trim()); L.push(`- **${c[1]}** · ${c[3]} · ${cut(c[2], 120)} · next: ${cut(c[9], 160)}`); }
  L.push('');
}

const files = [];
const walk = (d, depth) => {
  if (!existsSync(d) || depth > 3) return;
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, depth + 1);
    else if (/(PREREG|RESULTS?)[^/]*\.md$/.test(f) && hit(p.slice(ROOT.length + 1).replace(/_/g, ' '))) files.push(p.slice(ROOT.length + 1));
  }
};
for (const d of ['forge', 'MD files', 'oi_research_book', 'analysis/output']) walk(join(ROOT, d), 0);
L.push(`## Prereg / results files by name (${files.length})`, '');
for (const f of files.sort()) L.push(`- \`${f}\``);
L.push('');
console.log(L.join('\n'));
