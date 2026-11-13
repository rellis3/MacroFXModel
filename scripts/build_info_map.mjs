// scripts/build_info_map.mjs - derives everything about the Info Map registry (js/infoMap.js) that the repo can tell us,
// and writes js/infoMapDerived.js (read by the Desk Terminal's Info map tab) and plans/INFO_MAP.md.
// Run: node scripts/build_info_map.mjs          (write both files)
//      node scripts/build_info_map.mjs --check  (exit 1 when the checked-in derived file is out of date)
// Derived per family: page exists + last git change + Command Hub group; route exists in server.js / _worker.js / *Routes.js;
// analyst-pack membership (js/deskPack.js DESK_FEEDS); NAME MATCHES in the terminal, Today, Atlas and newsletter code (a
// string match, not a trace: it shows a feed is named there, not that its numbers shape anything); each evidence id's verdict.
// The registry's traced status is hand-kept; where it disagrees with the name match the family gets a `drift` hint.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch { return ''; } };
const { FAMILIES, EXCLUDED_PAGES, AUTO_EXCLUDED_CATEGORIES } = await import(pathToFileURL(path.join(root, 'js/infoMap.js')).href);
const { DESK_FEEDS } = await import(pathToFileURL(path.join(root, 'js/deskPack.js')).href);
const { DESK_EVIDENCE } = await import(pathToFileURL(path.join(root, 'js/deskEvidence.js')).href);

// ── corpora ──
const listJs = dir => fs.existsSync(path.join(root, dir)) ? fs.readdirSync(path.join(root, dir)).filter(f => /\.js$/.test(f) && !/\.test\./.test(f)).map(f => `${dir}/${f}`) : [];
const CORPORA = {
  terminal: ['desk-terminal.html', ...listJs('js/terminal')],
  today: ['today.html'],
  atlas: ['atlas.html'],
  newsletter: fs.readdirSync(path.join(root, 'js')).filter(f => /^newsletter.*\.js$/.test(f) && !/\.test\./.test(f)).map(f => `js/${f}`),
};
const TEXT = Object.fromEntries(Object.entries(CORPORA).map(([k, fs_]) => [k, fs_.map(f => [f, read(f)])]));
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const boundRe = s => new RegExp(esc(s) + '(?![A-Za-z0-9_-])');
// a route is named either whole ('/api/nowcast') or bare in a quoted list (the terminal's loadEnrich asks for 'nowcast')
const quotedRe = ep => new RegExp('[\'"`]' + esc(ep.replace(/^\/api\//, '')) + '(?![A-Za-z0-9_-])');
const hits = (corpus, needles) => {
  const res = needles.flatMap(n => (/^\/api\//.test(n) ? [boundRe(n), quotedRe(n)] : [boundRe(n)]));
  return TEXT[corpus].filter(([, t]) => res.some(r => r.test(t))).map(([f]) => f);
};

// ── routes ──
const routeMods = fs.readdirSync(path.join(root, 'js')).filter(f => /Routes\.js$/.test(f)).map(f => read('js/' + f)).join('\n');
const routeText = read('server.js') + '\n' + read('_worker.js') + '\n' + routeMods;
export const routeExists = ep => {
  if (boundRe(ep).test(routeText)) return true;
  const segs = ep.split('/');   // template routes: app.get(`/api/${key}/history`)
  if (segs.length >= 4) {
    const tail = segs.slice(3).join('/');
    if (new RegExp('/api/\\$\\{[^}]+\\}/' + esc(tail)).test(routeText)) return true;
  }
  return false;
};

// ── Command Hub membership: file -> the dropdown groups that list it ──
const hubText = read('js/commandHub.js');
const hub = new Map();
{
  const marks = [...hubText.matchAll(/id="chubDD([A-Za-z0-9_]+)"/g)].map(m => [m.index, m[1]]);
  for (const m of hubText.matchAll(/data-href="([^"]+\.html)"/g)) {
    let g = null; for (const [i, id] of marks) if (i < m.index) g = id; else break;
    if (!hub.has(m[1])) hub.set(m[1], new Set()); if (g) hub.get(m[1]).add(g);
  }
}

// ── pages.csv category ──
function parseCsv(t) {
  const rows = []; let r = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { r.push(f); f = ''; } else if (c === '\n') { r.push(f); rows.push(r); r = []; f = ''; } else if (c !== '\r') f += c;
  }
  if (f || r.length) { r.push(f); rows.push(r); }
  return rows;
}
const csv = parseCsv(read('analysis/output/repo-review-2026-10-31/pages.csv'));
const catCol = csv[0]?.indexOf('category') ?? -1;
export const pageCategory = Object.fromEntries(csv.slice(1).filter(r => r[0]).map(r => [r[0], r[catCol]]));

// last change of a file: one pass over the recent history for every page, a single-file lookup only for the rest (git log -- file is slow in a big repo)
let _recent = null;
const gitDate = file => {
  try {
    if (!_recent) {
      _recent = new Map();
      const out = execFileSync('git', ['log', '--format=@@%cs', '--name-only', '--no-renames', '-n', '3000', '--', '*.html'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
      for (const blk of out.split('@@').slice(1)) { const [d, ...rows] = blk.split(/\r?\n/); for (const f of rows) if (f && !_recent.has(f)) _recent.set(f, d.trim()); }
    }
    return _recent.get(file) ?? (execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null);
  } catch { return null; }
};
const verdictOf = Object.fromEntries(DESK_EVIDENCE.map(e => [e.id, { verdict: e.verdict, date: e.date ?? null }]));
const pack = DESK_FEEDS.map(f => ({ skill: f.skill, path: '/api/' + String(f.path).split('?')[0], maxAgeH: f.maxAgeH }));
const packFor = route => pack.find(p => p.path === route || p.path.startsWith(route + '/')) ?? null;

export function computeDerived() {
  const families = {};
  for (const f of FAMILIES) {
    const pages = f.pages.map(file => ({ file, exists: fs.existsSync(path.join(root, file)), lastModified: null, hub: [...(hub.get(file) ?? [])].sort() }));
    const routes = f.routes.map(route => { const p = packFor(route); return { route, exists: routeExists(route), pack: p ? { skill: p.skill, maxAgeH: p.maxAgeH } : null }; });
    const modules = f.modules.map(file => ({ file, exists: fs.existsSync(path.join(root, file)) }));
    const needles = [...f.routes, ...f.pages, ...f.modules.map(m => m.replace(/^.*\//, ''))];
    const names = {};
    for (const k of Object.keys(CORPORA)) names[k] = hits(k, needles.filter(n => !(k === 'terminal' && /\.html$/.test(n) && n === 'desk-terminal.html')));
    const evidence = f.evidence.map(id => ({ id, known: id in verdictOf, verdict: verdictOf[id]?.verdict ?? null }));
    const drift = [];
    const named = routes.map(r => hits('terminal', [r.route]).length > 0);
    const nameInTerminal = named.some(Boolean) || modules.some(m => hits('terminal', [m.file.replace(/^.*\//, '')]).length);
    // a shared route (/api/events, /api/drill-series) is named by several families, so only ALL routes named counts as evidence of drawing
    if ((f.status === 'SUMMARY' || f.status === 'PACK' || f.status === 'STANDALONE') && named.length && named.every(Boolean)) drift.push('The terminal code names every route of this feed but the traced status says it is not drawn: re-trace.');
    if ((f.status === 'DRAWN') && f.routes.length && !nameInTerminal) drift.push('The traced status says drawn but no terminal file names its route: re-trace (it may arrive through a bundle).');
    families[f.id] = { pages, routes, modules, names, evidence, packSkills: [...new Set(routes.map(r => packFor(r.route)?.skill).filter(Boolean))], drift };
  }
  // pages in no family and not excluded
  const rootPages = fs.readdirSync(root).filter(f => /\.html$/.test(f));
  const inFamily = new Set(FAMILIES.flatMap(f => f.pages));
  const unclassified = rootPages.filter(p => !inFamily.has(p) && !(p in EXCLUDED_PAGES) && !AUTO_EXCLUDED_CATEGORIES.includes(pageCategory[p] ?? '?'));
  return { families, unclassified: unclassified.sort(), rootPageCount: rootPages.length, packFeeds: pack.length };
}

/** git dates are the only churn-prone field; kept apart so the --check ignores them */
function addDates(d) {
  for (const f of Object.values(d.families)) for (const p of f.pages) if (p.exists) p.lastModified = gitDate(p.file);
  return d;
}

const stable = d => JSON.stringify({ ...d, families: Object.fromEntries(Object.entries(d.families).map(([k, v]) => [k, { ...v, pages: v.pages.map(p => ({ ...p, lastModified: undefined })) }])) });

const loadChecked = async () => { try { return (await import(pathToFileURL(path.join(root, 'js/infoMapDerived.js')).href + '?t=' + Date.now())).DERIVED; } catch { return null; } };

function planDoc(d) {
  const cell = s => String(s ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  const n = (k, v) => FAMILIES.filter(f => f[k] === v).length;
  const out = ['# Info map', ''];
  out.push('Generated by scripts/build_info_map.mjs from js/infoMap.js (hand-kept pointers, status and visual ideas) and the repo (derived columns). Do not edit by hand. Guard test: js/infoMap.test.mjs. The same table is the Desk Terminal "Info map" tab.', '');
  out.push(`${FAMILIES.length} information families. Drawn ${n('status', 'DRAWN')}, summary only ${n('status', 'SUMMARY')}, analysts only ${n('status', 'PACK')}, standalone only ${n('status', 'STANDALONE')}. Status was traced by reading the code on 2026-11-13; the name-match columns are a string match, not a trace.`, '');
  out.push('Not included: backtests, bots, systems, shadows, research pages and the per-asset jump layer (see EXCLUDED_PAGES in js/infoMap.js).', '');
  const flagged = FAMILIES.filter(f => f.flag);
  if (flagged.length) { out.push('## Stale, blocked or doubtful', ''); for (const f of flagged) out.push(`- **${f.name}** (${f.flag.kind}): ${f.flag.text}`); out.push(''); }
  const groups = [...new Set(FAMILIES.map(f => f.group))];
  for (const g of groups) {
    out.push(`## ${g}`, '');
    out.push('| Family | Status | Tab | Use | Pages | Tested | Visual idea |', '| --- | --- | --- | --- | --- | --- | --- |');
    for (const f of FAMILIES.filter(x => x.group === g)) {
      const dv = d.families[f.id];
      out.push(`| ${[f.name, f.status, f.tab ?? '', f.use, f.pages.join(', '), dv.evidence.map(e => `${e.id}: ${e.verdict}`).join('; ') || 'none', f.visual].map(cell).join(' | ')} |`);
    }
    out.push('');
  }
  return out.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const d = computeDerived();
  if (process.argv.includes('--check')) {
    const cur = await loadChecked();
    if (!cur) { console.error('js/infoMapDerived.js is missing: run node scripts/build_info_map.mjs'); process.exit(1); }
    const { generatedAt, ...rest } = cur;
    if (stable(rest) !== stable(d)) { console.error('js/infoMapDerived.js is out of date: run node scripts/build_info_map.mjs'); process.exit(1); }
    console.log('derived file is current'); process.exit(0);
  }
  addDates(d);
  d.generatedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(root, 'js/infoMapDerived.js'), `// js/infoMapDerived.js - GENERATED by scripts/build_info_map.mjs from js/infoMap.js and the repo. Do not edit by hand.\nexport const DERIVED = ${JSON.stringify(d, null, 1)};\n`);
  fs.writeFileSync(path.join(root, 'plans/INFO_MAP.md'), planDoc(d));
  const drift = Object.entries(d.families).filter(([, v]) => v.drift.length);
  console.log(`wrote js/infoMapDerived.js and plans/INFO_MAP.md: ${FAMILIES.length} families, ${d.unclassified.length} unclassified pages, ${drift.length} drift hints`);
  for (const [id, v] of drift) console.log(`  drift ${id}: ${v.drift[0]}`);
  for (const p of d.unclassified) console.log(`  unclassified page: ${p}`);
  for (const [id, v] of Object.entries(d.families)) { for (const r of v.routes) if (!r.exists) console.log(`  missing route ${id}: ${r.route}`); for (const p of v.pages) if (!p.exists) console.log(`  missing page ${id}: ${p.file}`); }
}
