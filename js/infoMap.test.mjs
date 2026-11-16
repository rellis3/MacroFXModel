// js/infoMap.test.mjs - guard for the Info Map registry (js/infoMap.js) and its derived file (js/infoMapDerived.js).
// Run: node js/infoMap.test.mjs
// Fails when: ids repeat or fields are invalid, a family points at a page, route or module that no longer exists, an Evidence
// Book id is invented, text carries an em-dash or arrow, a root html page is in no family and not excluded (so a new page cannot
// slip in unclassified), an excluded page is gone or also in a family, or the checked-in derived file is out of date.
// Prints (does not fail) the counts and the drift hints, which say a traced status may need re-tracing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAMILIES, GROUPS, STATUSES, USES, FLAG_KINDS, TAB_LABELS, EXCLUDED_PAGES } from './infoMap.js';
import { DERIVED } from './infoMapDerived.js';
import { computeDerived } from '../scripts/build_info_map.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];
const bad = m => errors.push(m);
const warn = m => warnings.push(m);
const ledger = fs.readFileSync(path.join(root, 'js/deskEvidence.js'), 'utf8');
const groupIds = new Set(GROUPS.map(g => g.id));
// What the repo says RIGHT NOW. Pointers (page, route, module exists) are judged against this, never against the checked-in derived file:
// that file is a cache for the terminal's Info map tab and goes stale whenever two sessions push at once (see the stale-file note below).
const fresh = computeDerived();

if (!Array.isArray(FAMILIES) || FAMILIES.length < 60 || FAMILIES.length > 110) bad(`FAMILIES has ${FAMILIES?.length} entries, expected 60 to 110`);

const ids = new Set();
for (const f of FAMILIES) {
  const w = `family ${f.id}`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.id ?? '')) bad(`${w}: id is not kebab-case`);
  if (ids.has(f.id)) bad(`${w}: duplicate id`); ids.add(f.id);
  for (const k of ['name', 'family', 'visual']) if (typeof f[k] !== 'string' || f[k].length < 3) bad(`${w}: ${k} missing`);
  if (!groupIds.has(f.group)) bad(`${w}: group ${f.group}`);
  if (!(f.status in STATUSES)) bad(`${w}: status ${f.status}`);
  if (!(f.use in USES)) bad(`${w}: use ${f.use}`);
  if (f.tab != null && !(f.tab in TAB_LABELS)) bad(`${w}: tab ${f.tab} is not a terminal tab`);
  if ((f.status === 'DRAWN') && f.tab == null) { /* some drawn feeds are not pinned to one tab yet (UNVERIFIED), allowed */ }
  if ((f.status === 'PACK' || f.status === 'STANDALONE') && f.tab) bad(`${w}: a ${f.status} family cannot name a terminal tab`);
  for (const k of ['pages', 'routes', 'modules', 'evidence']) if (!Array.isArray(f[k])) bad(`${w}: ${k} must be an array`);
  if (!f.pages?.length && !f.routes?.length && !f.modules?.length) bad(`${w}: needs a page, a route or a module`);
  for (const r of f.routes ?? []) if (!/^\/api\/[A-Za-z0-9_\-/]+$/.test(r) || r.endsWith('-') || r.endsWith('/')) bad(`${w}: route ${r} is not a clean /api/... path`);
  if (f.flag && !(f.flag.kind in FLAG_KINDS)) bad(`${w}: flag kind ${f.flag.kind}`);
  if (f.flag && String(f.flag.text ?? '').length < 20) bad(`${w}: a flag needs its reason`);
  for (const e of f.evidence ?? []) if (!new RegExp(`id:\\s*'${e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`).test(ledger)) bad(`${w}: evidence id ${e} is not in js/deskEvidence.js`);
  if (/[—→]/.test(JSON.stringify(f))) bad(`${w}: no em-dashes or arrows in text`);
  if (!DERIVED.families?.[f.id]) warn(`${w}: missing from js/infoMapDerived.js (the cache for the Info map tab): run node scripts/build_info_map.mjs`);
  const d = fresh.families[f.id];
  for (const p of d.pages) if (!p.exists) bad(`${w}: page ${p.file} does not exist`);
  for (const r of d.routes) if (!r.exists) bad(`${w}: route ${r.route} not found in server.js, _worker.js or a *Routes.js module`);
  for (const m of d.modules) if (!m.exists) bad(`${w}: module ${m.file} does not exist`);
}

// every information page is in a family or excluded with a reason
for (const p of fresh.unclassified) bad(`page ${p} is in no family and not in EXCLUDED_PAGES (js/infoMap.js): add it to a family or exclude it with a reason`);
const inFamily = new Set(FAMILIES.flatMap(f => f.pages));
for (const [p, why] of Object.entries(EXCLUDED_PAGES)) {
  if (!fs.existsSync(path.join(root, p))) bad(`excluded page ${p} no longer exists: remove it from EXCLUDED_PAGES`);
  if (inFamily.has(p)) bad(`page ${p} is both in a family and excluded`);
  if (typeof why !== 'string' || why.length < 4) bad(`excluded page ${p} needs a reason`);
}

// the checked-in derived file matches the repo (dates aside)
const strip = d => JSON.stringify({ ...d, generatedAt: undefined, families: Object.fromEntries(Object.entries(d.families).map(([k, v]) => [k, { ...v, pages: v.pages.map(p => ({ ...p, lastModified: undefined })) }])) });
// 2026-11-16: this was a hard failure and it kept main red. Two causes, both fixed at the root: (1) the generator listed files in the
// machine's directory order, which differs between Windows (where it is written) and Linux (CI), so the file could never match on CI
// once two names differed in case (scripts/build_info_map.mjs now sorts, and js/infoMapOrder.test.mjs guards it); (2) several sessions
// regenerating and pushing at once leave it a commit behind. A stale cache is cosmetic (names matches and drift hints for the Info map
// tab), so it is a WARNING here and the nightly 'Info map refresh' workflow commits the fresh copy. INFOMAP_STRICT=1 makes it fail again
// (scripts/prepush_check.mjs regenerates first, so it never trips locally).
if (strip(DERIVED) !== strip(fresh)) (process.env.INFOMAP_STRICT ? bad : warn)('js/infoMapDerived.js is out of date: run node scripts/build_info_map.mjs (the nightly refresh also does this)');

const by = k => FAMILIES.reduce((a, f) => ((a[f[k]] = (a[f[k]] ?? 0) + 1), a), {});
console.log(`\nInfo map: ${FAMILIES.length} families, status ${JSON.stringify(by('status'))}, use ${JSON.stringify(by('use'))}, flagged ${FAMILIES.filter(f => f.flag).length}`);
const drift = Object.entries(fresh.families).filter(([, v]) => v.drift.length);
console.log(`Drift hints (re-trace these, not a failure): ${drift.length}`);
for (const [id, v] of drift) console.log(`  ${id}: ${v.drift[0]}`);

if (warnings.length) { console.log(`
Warnings (not failures): ${warnings.length}`); for (const w of warnings) console.log('  ! ' + w); }
if (errors.length) { console.error(`\nFAILED, ${errors.length} problem${errors.length > 1 ? 's' : ''}:`); for (const e of errors) console.error('  - ' + e); process.exit(1); }
console.log('\nOK');
