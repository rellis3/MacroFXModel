// Bias Evidence manifest builder: collects every evidence pack into one JSON for bias-evidence.html.
//
// HOW TO ADD A NEW STUDY: run the study so scripts/evidence_pack/pack.py writes
// analysis/output/<study>/**/evidence/evidence.json, then re-run
//     node scripts/evidence_pack/build_manifest.mjs
// and commit analysis/output/bias-evidence/manifest.json. The page picks the new study up on its own.
//
// What it does: finds every analysis/output/**/evidence/evidence.json, keeps its numbers, and attaches
//   - the matching js/deskEvidence.js entry (verdict + result + use): first an entry whose `also` cites this pack's
//     folder, then an entry id <study>-<suffix> whose suffix matches the cell name, then an entry id === <study>,
//     then the only entry for the study; otherwise every entry for the study is listed as study-level context;
//   - the study's RESULTS.md / prereg doc paths and the pack's EVIDENCE.md / PNG / sample_rows.csv paths.
// The site serves the repo root statically (server.js express.static), so the PNGs and markdown are linked in place.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(root, 'analysis', 'output');
const manifestPath = path.join(outDir, 'bias-evidence', 'manifest.json');
const rel = p => path.relative(root, p).split(path.sep).join('/');

function walk(dir, hits = []) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return hits; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['_cache', 'cache', 'raw', 'node_modules'].includes(e.name)) walk(p, hits); }
    else if (e.name === 'evidence.json') hits.push(p);
  }
  return hits;
}

// Python's json.dump writes NaN / Infinity, which JSON.parse rejects.
const readPack = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/\bNaN\b|-?\bInfinity\b/g, 'null'));

const { DESK_EVIDENCE } = await import(pathToFileURL(path.join(root, 'js', 'deskEvidence.js')).href);
const ALIAS = { indices: 'idx', index: 'idx', nq: 'idx' };
const tokens = cell => cell.toLowerCase().split(/[_\-.\s|:]+/).filter(Boolean).map(t => ALIAS[t] || t);

function matchDesk(study, cell, packDir) {
  const dirRel = rel(packDir);
  const cited = DESK_EVIDENCE.filter(e => [e.doc, ...(e.also || [])].some(a => typeof a === 'string' && a.startsWith(dirRel)));
  if (cited.length) return { how: 'cited', entries: cited };
  const fam = DESK_EVIDENCE.filter(e => e.id === study || String(e.id).startsWith(study + '-'));
  if (!fam.length) return { how: 'none', entries: [] };
  const lc = cell.toLowerCase(), toks = tokens(cell);
  let best = [], bestScore = 0;
  for (const e of fam) {
    if (e.id === study) continue;
    const suf = e.id.slice(study.length + 1).toLowerCase();
    let s = 0;
    if (lc === suf) s = 4;
    else if (toks.includes(suf)) s = 3;
    else if (toks.some(t => t.startsWith(suf))) s = 2;
    else if (suf.length === 1 && toks.some(t => t.endsWith(suf))) s = 1;
    if (s > bestScore) { bestScore = s; best = [e]; } else if (s && s === bestScore) best.push(e);
  }
  if (best.length) return { how: 'cell', entries: best };
  const exact = fam.find(e => e.id === study);
  if (exact) return { how: 'study', entries: [exact] };
  if (fam.length === 1) return { how: 'study', entries: fam };
  return { how: 'study-family', entries: fam };
}

const deskLite = e => ({ id: e.id, verdict: e.verdict, date: e.date, doc: e.doc || null, claim: e.claim || '', result: e.result || '', use: e.use || '' });

// Only committed packs by default, so the page never links a PNG the deployed site does not have. --all includes local ones.
let tracked = null;
if (!process.argv.includes('--all')) {
  try { tracked = new Set(execSync('git ls-files analysis/output', { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).split(String.fromCharCode(10)).map(x => x.trim()).filter(x => x.endsWith('/evidence.json'))); } catch { tracked = null; }
}

const packs = [];
for (const f of walk(outDir).sort()) {
  let p;
  try { p = readPack(f); } catch (err) { console.warn('skip (unreadable):', rel(f), err.message); continue; }
  if (!p || !p.diagnosis || !Array.isArray(p.ci)) continue;              // not a pack.py evidence.json
  if (tracked && !tracked.has(rel(f))) { console.log('  skip (not committed yet):', rel(f)); continue; }
  const evDir = path.dirname(f), packDir = path.basename(evDir) === 'evidence' ? path.dirname(evDir) : evDir;
  const parts = rel(f).split('/');               // analysis/output/<study>/.../evidence/evidence.json
  const study = parts[2];
  const cell = String(p.slug || '').includes(':') ? String(p.slug).split(':').slice(1).join(':') : path.basename(packDir) === study ? 'main' : path.basename(packDir);
  const has = n => fs.existsSync(path.join(evDir, n)) ? rel(path.join(evDir, n)) : null;
  const results = fs.existsSync(path.join(outDir, study, 'RESULTS.md')) ? `analysis/output/${study}/RESULTS.md` : null;
  const m = matchDesk(study, cell, packDir);
  packs.push({
    study, cell, slug: p.slug, dir: rel(evDir),
    files: { evidence_md: has('EVIDENCE.md'), sample_rows: has('sample_rows.csv'), results,
             charts: Object.fromEntries(['placebo', 'buckets', 'breakdown', 'plants'].map(k => [k, has(k + '.png')]).filter(([, v]) => v)) },
    desk: { how: m.how, entries: m.entries.map(deskLite) },
    unit: p.unit, bar: p.bar, n_rows: p.n_rows, n_clusters: p.n_clusters, n_instruments: p.n_instruments, span: p.span,
    estimate: p.estimate, ci: p.ci, se: p.se, verdict_word: p.verdict_word ?? null, notes: p.notes || '',
    placebo: p.placebo, buckets: p.buckets, by_instrument: p.by_instrument, by_year: p.by_year, by_half: p.by_half,
    without_top1pct: p.without_top1pct ?? null, net_of_cost: p.net_of_cost ?? null,
    positive_control: p.positive_control || [], lookahead_canary: p.lookahead_canary || null, diagnosis: p.diagnosis,
  });
}

const studies = [...new Set(packs.map(p => p.study))].map(s => {
  const prereg = packs.filter(p => p.study === s).flatMap(p => p.desk.entries.map(e => e.doc)).find(d => d && d.startsWith('forge/'))
    || (fs.existsSync(path.join(root, 'forge', s.toUpperCase().split('-').join('_') + '_PREREG.md')) ? 'forge/' + s.toUpperCase().split('-').join('_') + '_PREREG.md' : null);
  return { study: s, n_cells: packs.filter(p => p.study === s).length, results: packs.find(p => p.study === s).files.results, prereg };
});

fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
const repo = 'https://github.com/rellis3/MacroFXModel/blob/main/';
fs.writeFileSync(manifestPath, JSON.stringify({ built: new Date().toISOString(), repo, studies, packs }, (k, v) => typeof v === 'number' && !Number.isInteger(v) ? +v.toPrecision(5) : v) + '\n');
console.log(`bias-evidence manifest: ${packs.length} packs from ${studies.length} studies -> ${rel(manifestPath)} (${(fs.statSync(manifestPath).size / 1024).toFixed(0)} KB)`);
for (const p of packs) if (p.desk.how !== 'cited' && p.desk.how !== 'cell') console.log(`  ${p.study}:${p.cell} desk match = ${p.desk.how} (${p.desk.entries.map(e => e.id).join(', ') || 'none'})`);
