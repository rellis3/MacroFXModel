#!/usr/bin/env node
// Research status: what every session is working on, and what the record is missing.
//
//   node .claude/skills/research-protocol/scripts/research_status.mjs            # full report
//   node .claude/skills/research-protocol/scripts/research_status.mjs --days 7   # branches active in the last 7 days
//   node .claude/skills/research-protocol/scripts/research_status.mjs --no-fetch # use the cache as it is
//   node .claude/skills/research-protocol/scripts/research_status.mjs --out plans/RESEARCH_STATUS.md
//
// Sessions work on their own branches and only merge later, so main alone hides in-flight work.
// This keeps a small blobless, depth-1 mirror of every remote branch in .git/research-status-cache
// (about 5 MB, about a second to refresh), then reports:
//   1. the register (plans/RESEARCH_REGISTER.md) on main;
//   2. register rows and new pre-registrations / results that exist only on recently active branches;
//   3. hygiene: pre-registrations with no banked verdict, a stale TRIAL_LEDGER, ledger docs that don't exist,
//      register rows whose status and ledger disagree.
// Read-only: it never writes to the repo unless --out is given, and never pushes.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const DAYS = Number(opt('--days', 21));
const FETCH = !args.includes('--no-fetch');
const OUT = opt('--out', null);

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const GITDIR = resolve(ROOT, execFileSync('git', ['rev-parse', '--git-dir'], { cwd: ROOT, encoding: 'utf8' }).trim());
const CACHE = join(GITDIR, 'research-status-cache');
const REGISTER = 'plans/RESEARCH_REGISTER.md';
const LEDGER_MD = 'MD files/TRIAL_LEDGER.md';
const STUDY_FILE = /(^|\/)[^/]*(PREREG|RESULTS?|ADDENDUM|AMENDMENT)[^/]*\.md$/i;

const git = (a, opts = {}) => execFileSync('git', ['--git-dir', CACHE, ...a],
  { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
const tryGit = a => { try { return git(a); } catch { return null; } };

// ── cache ────────────────────────────────────────────────────────────────────
function refreshCache() {
  if (!existsSync(CACHE)) {
    mkdirSync(CACHE, { recursive: true });
    git(['init', '--bare', '-q']);
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8' }).trim();
    git(['remote', 'add', 'origin', url]);
  }
  if (FETCH) git(['fetch', '-q', '--prune', '--depth=1', '--filter=blob:none', 'origin', '+refs/heads/*:refs/remotes/origin/*']);
}

// ── register parsing ─────────────────────────────────────────────────────────
// Rows of the first table under "## Active" (and "## Done"), keyed by ID.
const COLS = ['id', 'question', 'status', 'branch', 'updated', 'prereg', 'results', 'ledger', 'next'];
function parseRegister(text) {
  const rows = new Map();
  if (!text) return rows;
  let section = '';
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.*)/);
    if (h) { section = h[1].trim().toLowerCase(); continue; }
    if (!/^\|/.test(line) || /^\|\s*-/.test(line) || /^\|\s*ID\s*\|/i.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < COLS.length || !cells[0] || cells[0].startsWith('<')) continue;
    const row = Object.fromEntries(COLS.map((k, i) => [k, cells[i]]));
    row.section = section; row.raw = line.trim();
    rows.set(row.id.replace(/`/g, ''), row);
  }
  return rows;
}

// ── main ─────────────────────────────────────────────────────────────────────
refreshCache();
const now = Date.now();
const branches = git(['for-each-ref', '--sort=-committerdate', '--format=%(committerdate:unix) %(refname:short)', 'refs/remotes/origin'])
  .trim().split('\n').filter(Boolean)
  .map(l => { const [t, ref] = l.split(' '); return { t: Number(t) * 1000, ref }; })
  .filter(b => b.ref !== 'origin/HEAD' && b.ref !== 'origin');
const main = branches.find(b => b.ref === 'origin/main');
if (!main) { console.error('origin/main not found in the cache'); process.exit(1); }

const tree = ref => new Map((tryGit(['ls-tree', '-r', ref]) ?? '').split('\n').filter(Boolean)
  .map(l => { const [meta, path] = l.split('\t'); return [path, meta.split(' ')[2]]; }));
const show = (ref, path) => tryGit(['show', `${ref}:${path}`]);

const mainTree = tree('origin/main');
const mainReg = parseRegister(show('origin/main', REGISTER));
const recent = branches.filter(b => b.ref !== 'origin/main' && now - b.t <= DAYS * 864e5);

// Every register row anywhere (main, recent branches, this working tree): a study file is covered if any row cites it.
const allRows = [...mainReg.values()];
const branchRegs = new Map(recent.map(b => [b.ref, parseRegister(show(b.ref, REGISTER))]));
for (const reg of branchRegs.values()) allRows.push(...reg.values());
if (existsSync(join(ROOT, REGISTER))) allRows.push(...parseRegister(readFileSync(join(ROOT, REGISTER), 'utf8')).values());
const cited = allRows.map(r => [r.prereg, r.results].join(' ')).join(' ');
const covered = p => cited.includes(p) || cited.includes(p.split('/').slice(0, -1).join('/') + '/*');

const inflight = [];
for (const b of recent) {
  const t = tree(b.ref);
  const files = [...t].filter(([p, sha]) => STUDY_FILE.test(p) && mainTree.get(p) !== sha).map(([p]) => p);
  // A file that differs only because main moved on after the branch was cut is not the branch's work:
  // keep files that are new on the branch, or whose last commit on the branch is the branch's own.
  const newFiles = files.filter(p => !mainTree.has(p));
  const changed = files.filter(p => mainTree.has(p));
  const reg = branchRegs.get(b.ref);
  const regRows = [...reg.values()].filter(r => { const m = mainReg.get(r.id.replace(/`/g, '')); return !m || m.raw !== r.raw; });
  if (newFiles.length || regRows.length) inflight.push({ ...b, newFiles, changed, regRows });
}

// ── hygiene, from the working tree ───────────────────────────────────────────
const issues = [];
let ev = [];
try { ev = (await import(pathToFileURL(join(ROOT, 'js/deskEvidence.js')).href)).DESK_EVIDENCE; }
catch (e) { issues.push(`could not load js/deskEvidence.js: ${e.message}`); }
const ids = new Set(ev.map(e => e.id));
const latestEv = ev.map(e => e.date).sort().at(-1) ?? '';
const ledgerText = existsSync(join(ROOT, LEDGER_MD)) ? readFileSync(join(ROOT, LEDGER_MD), 'utf8') : '';
const ledgerDate = (ledgerText.match(/Generated (\d{4}-\d{2}-\d{2})/) ?? [])[1] ?? 'never';
const ledgerCount = ledgerText.split('\n').filter(l => /^\| \d{4}-\d{2}-\d{2} \|/.test(l)).length;
if (ledgerCount !== ev.length) issues.push(`TRIAL_LEDGER is stale: generated ${ledgerDate} with ${ledgerCount} rows; the Evidence Book has ${ev.length} (latest ${latestEv}). Run \`node scripts/build_trial_ledger.mjs\`.`);
for (const e of ev) {
  // A doc may list several write-ups joined by ' · '; memory notes are not files.
  for (const part of String(e.doc ?? '').split('·')) {
    const d = part.split('#')[0].trim();
    if (d && !/^memory/i.test(d) && !existsSync(join(ROOT, d))) issues.push(`ledger \`${e.id}\`: doc \`${d}\` does not exist`);
  }
}
const localReg = parseRegister(existsSync(join(ROOT, REGISTER)) ? readFileSync(join(ROOT, REGISTER), 'utf8') : '');
for (const r of localReg.values()) {
  const led = r.ledger.replace(/`/g, '').split(/[,\s]+/).filter(x => x && x !== '—' && x !== '-');
  if (/^BANKED/i.test(r.status) && !led.length) issues.push(`register \`${r.id}\`: BANKED with no ledger id`);
  for (const id of led) if (!ids.has(id)) issues.push(`register \`${r.id}\`: ledger id \`${id}\` is not in js/deskEvidence.js`);
  if (/^(CLAIMED|REGISTERED|RUNNING|RESULTS)/i.test(r.status) && r.updated && now - Date.parse(r.updated) > 14 * 864e5)
    issues.push(`register \`${r.id}\`: ${r.status} and not updated since ${r.updated}; update it or mark it PARKED`);
}
// Unbanked pre-registrations: same matching rule as scripts/build_trial_ledger.mjs.
const docs = new Set(ev.flatMap(e => [e.doc, ...(e.also ?? [])]).map(d => String(d ?? '').split('#')[0].trim()).filter(Boolean));
const stem = p => p.split('/').pop().replace(/\.md$/i, '').replace(/_(PREREG|RESULTS?)$/i, '').toUpperCase();
const stems = new Set([...docs].map(stem));
const registered = new Set([...localReg.values()].flatMap(r => [r.prereg, r.results]).map(x => x.replace(/`/g, '')));
const unbanked = [...mainTree.keys()]
  .filter(p => /^(forge|MD files|oi_research_book|cog-replication)\/[^/]*PREREG[^/]*\.md$/i.test(p) && !/TEMPLATE/i.test(p))
  .filter(p => !docs.has(p) && !stems.has(stem(p)));

// ── report ───────────────────────────────────────────────────────────────────
const day = t => new Date(t).toISOString().slice(0, 10);
const L = [];
L.push(`# Research status — ${day(now)}`, '');
L.push(`*Generated by \`node .claude/skills/research-protocol/scripts/research_status.mjs\`. main at ${day(main.t)}; ${recent.length} branches active in the last ${DAYS} days.*`, '');
L.push('## 1. Register on main', '');
const active = [...mainReg.values()].filter(r => !/^done/.test(r.section));
if (!mainReg.size) L.push(`No \`${REGISTER}\` on main yet.`);
else if (!active.length) L.push('No active rows.');
else { L.push('| ID | Status | Branch | Updated | Next |', '|---|---|---|---|---|'); for (const r of active) L.push(`| ${r.id} | ${r.status} | ${r.branch} | ${r.updated} | ${r.next} |`); }
L.push('', `## 2. In flight on branches (not on main yet)`, '');
if (!inflight.length) L.push('Nothing: no recently active branch has a register row or study file that main lacks.');
for (const b of inflight) {
  L.push(`### ${b.ref.replace(/^origin\//, '')} — last commit ${day(b.t)}`);
  for (const r of b.regRows) L.push(`- register: **${r.id}** · ${r.status} · ${r.question} · next: ${r.next}`);
  const pre = b.newFiles.filter(p => /PREREG/i.test(p)), res = b.newFiles.filter(p => !/PREREG/i.test(p));
  const list = (label, xs) => { if (!xs.length) return;
    if (xs.length <= 6) xs.forEach(p => L.push(`- ${label}: \`${p}\``));
    else L.push(`- ${xs.length} × ${label}: ${xs.slice(0, 6).map(p => '`' + p.split('/').pop() + '`').join(', ')}, …`); };
  list('new prereg', pre); list('new results', res);
  const loose = b.newFiles.filter(p => !covered(p));
  if (loose.length) L.push(`- ⚠ ${loose.length} of these files are cited by no register row on any branch`);
  L.push('');
}
L.push('## 3. Hygiene', '');
if (!issues.length) L.push('No issues.');
for (const i of issues) L.push(`- ${i}`);
L.push('', `## 4. Pre-registrations on main with no banked verdict (${unbanked.length})`, '');
L.push('Each is still to run, ran and was never banked, or is banked under a doc the matcher cannot see. Bank it, register it as PARKED/ABANDONED, or point its ledger entry\'s `doc`/`also` at the prereg.', '');
for (const p of unbanked) L.push(`- \`${p}\`${registered.has(p) ? ' (in the register)' : ''}`);
L.push('');

const text = L.join('\n');
if (OUT) { writeFileSync(join(ROOT, OUT), text, 'utf8'); console.log(`wrote ${OUT}`); }
else console.log(text);
