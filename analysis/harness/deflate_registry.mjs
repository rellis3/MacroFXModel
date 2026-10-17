/**
 * Registry deflation — forge/HARNESS_REGISTRY_PREREG.md Part B, method frozen 2026-10-17.
 *
 *   node analysis/harness/deflate_registry.mjs            # dry run: prints the table, writes the report
 *   node analysis/harness/deflate_registry.mjs --apply    # also edits js/deskEvidence.js
 *
 * Method, as registered:
 *   1. For every entry with a reported p or CI, extract p (CI → two-sided p at the reported level).
 *      Entries with neither are "not deflatable" and keep their status with that label.
 *   2. BH-FDR at 10% across ALL extractable p in the registry — one family.
 *   3. Sharpe/PF entries: deflated Sharpe with N = cells in their own prereg; PBO where tuned.
 *   4. Harness re-run where the store can feed it; re-run p beside the banked p.
 *   Keep `validated` iff survives BH AND (Sharpe-type → DSR ≥ 0.95) AND (re-run → clears own bar).
 *   Otherwise → `context` with deflated: { from: 'validated', why }.
 *
 * EXTRACTION IS CURATED FOR THE 36 VALIDATED ENTRIES, by reading each entry and its doc — the
 * POWER map's own note explains why nothing is regex-guessed on entries whose status can change.
 * For null/context/underpowered entries (status cannot change; they only size the BH family) the
 * extraction is automatic: a stated "p=" first, else the first [lo, hi] interval.
 *
 * Rules applied inside the curated table, stated once:
 *   - a bootstrap interval [lo, hi] on an estimate est → z = |est| / ((hi − lo) / 3.92), p two-sided
 *   - where the entry's bar needed several cells to pass, the LARGEST p among them is the entry's p
 *   - "k/n instruments better", "monotonic in 68/68 cells", calibration misses: NOT converted
 *     (instruments share a factor; a count is not a p) → not deflatable
 *   - "4/7 DM p<0.05": the bound, p = 0.05
 *   - placebo percentile q → p = 2 × (1 − q)
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESK_EVIDENCE } from '../../js/deskEvidence.js';
import { bhFdr, normCdf } from '../../js/harness/stats.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'analysis', 'output', 'harness');
const LEDGER = path.join(ROOT, 'js', 'deskEvidence.js');
const APPLY = process.argv.includes('--apply');
const TODAY = '2026-10-17';

const pFromCi = (est, lo, hi) => { const se = (hi - lo) / 3.92; const z = Math.abs(est) / se; return 2 * (1 - normCdf(z)); };
const pFromZ = z => 2 * (1 - normCdf(Math.abs(z)));

// ── Curated: the 36 validated entries ────────────────────────────────────────
const CURATED = {
  'vix-inversion':            { p: pFromCi(0.76, 0.29, 1.29), basis: 'ci95, doc S1: SPX500 next-5 +0.76 [+0.29, +1.29]' },
  'surprise-size':            { p: pFromCi(0.38, 0.24, 0.54), basis: 'ci95, doc S7: rate decisions EUR/USD +0.38 [+0.24, +0.54]' },
  'nq-down-week':             { p: pFromCi(0.185, 0.118, 0.262), basis: 'ci95, doc: growth down & rates quiet +0.185 [+0.118, +0.262]' },
  'event-impact-map':         { basis: 'descriptive map (spike ratios); no test' },
  'post-fomc-usd-drift':      { p: 2 * (1 - 0.998), basis: 'placebo: event mean at the 99.8th percentile of 10,000 → two-sided 0.004' },
  'yield-spread-sleeve':      { basis: 'no p reported; Sharpe-type', sharpe: true, rerun: ['yield-spread-sleeve-harness', 'gs2-2-126'], ownBar: 'OOS profitable, PF > 1, years positive' },
  'multi-spread-sleeve':      { basis: 'no p reported; Sharpe-type', sharpe: true, rerun: ['multi-spread-sleeve-harness', 'gs2-2-126'], ownBar: 'Bar A: 12/12 grid cells profitable', ownBarCheck: r => r.cells.every(c => c.pnl.pfOos > 1) },
  'spread-sleeve-factor-audit': { basis: 'book-layer audit of the two sleeves; its sanity gate reproduces the sleeve engines (same inputs)', sharpe: true, inherits: ['yield-spread-sleeve', 'multi-spread-sleeve'] },
  'tape-speed-persistence':   { basis: '68/68 cells monotonic — a count, not converted' },
  'execution-gate':           { basis: '0/30 cells profitable — descriptive' },
  'reversal-hour':            { basis: '+10pp above base, no interval reported' },
  'mv-vixterm-range':         { p: Math.max(pFromCi(0.52, 0.38, 0.88), pFromCi(0.44, 0.26, 0.78)), basis: 'ci95, larger p of SPX500 / NQ (n=14 firings)' },
  'mv-dispersion-range':      { p: Math.max(pFromCi(0.52, 0.37, 0.64), pFromCi(0.55, 0.37, 0.69)), basis: 'ci95, larger p of SPX500 / NQ (n=9 firings)' },
  'first-hour-fraction':      { basis: 'descriptive shares, no test' },
  'fast-start-rest-of-day':   { p: pFromCi(0.15, 0.07, 0.25), basis: 'ci95, doc T3: EUR/USD +0.15 [+0.07, +0.25], the smallest effect with a stated interval' },
  'iv-over-rv-wider':         { p: Math.max(pFromCi(0.38, 0.11, 0.62), pFromCi(0.67, 0.13, 1.21)), basis: 'ci95, larger p of NAS100 next-5 / SPX500 next-20' },
  'breadth-all-down':         { p: Math.max(pFromCi(0.31, 0.17, 0.45), pFromCi(0.26, 0.15, 0.38)), basis: 'ci95, larger p of SPX500 / NAS100 next-5' },
  'dispersion-reset':         { p: Math.max(pFromCi(0.186, 0.017, 0.349), pFromCi(0.307, 0.091, 0.584), pFromCi(0.148, 0.039, 0.254), pFromCi(0.262, 0.091, 0.433)), basis: 'ci95, the gate needed 4/4 cells: largest p (SPX500 5-session +0.186 [+0.017, +0.349])' },
  'band-reach-from-here':     { basis: 'odds ratios, no interval reported' },
  'gex-range':                { p: 0.0008, basis: 'stated p 0.0008' },
  'vol-curve-front':          { p: pFromZ(4.9), basis: 'logistic z, weakest of the four (−4.9)' },
  'horizon-reversion':        { basis: '33/33 instruments better — a count, not converted' },
  'combined-range':           { basis: '6/6 and 7/7 instruments better — counts' },
  'cross-iv':                 { basis: '15/15 crosses better — a count' },
  'us-extras-confirm':        { basis: '3/4 better — a count' },
  'intraday-range':           { basis: '21/21, 19/21 checkpoints — counts' },
  'line-touch-reach':         { basis: 'calibration (20/22 cells within 5pp) — not a test' },
  'extreme-in-probability':   { p: pFromCi(0.209, 0.205, 0.213), basis: 'ci95, Brier skill +20.9% [+20.5, +21.3]' },
  'iv-ladder-gold':           { basis: '5/6 folds — a count' },
  'iv-ladder':                { basis: '5/7 instruments — a count' },
  'ladder-calibration':       { basis: 'calibration miss, one test year — not a test' },
  'vol-target':               { p: pFromCi(0.32, 0.14, 0.50), basis: 'ci95, TREND Sharpe +0.32 [+0.14, +0.50]' },
  'iv-forecast':              { p: 0.05, basis: 'bound: "4/7 DM p<0.05" (3/7 did not)' },
  'forecast-persistence-fix': { p: pFromCi(1 - 0.976, 1 - 0.981, 1 - 0.970), basis: 'ci95, pinball 0.976 [0.970, 0.981] vs 1' },
  'forecast-pick':            { p: pFromCi(1 - 0.980, 1 - 0.985, 1 - 0.974), basis: 'ci95, pinball 0.980 [0.974, 0.985] vs 1' },
  'ys-long-confirm':          { p: pFromCi(0.243, 0.005, 0.464), basis: 'ci95, +0.243% [+0.005, +0.464] per trade', sharpe: true, rerun: ['ys-long-honest-harness', 'long-honestUS-forlag45-2-126'], ownBar: 'mean > 0 with interval above 0' },
};

// ── Automatic extraction for entries whose status cannot change ──────────────
function autoExtract(text) {
  const mP = text.match(/\bp\s*(?:=|≈)\s*(0?\.\d+)/i) || text.match(/\(p\s+(0?\.\d+)\)/i) || text.match(/\bp\s+(0?\.\d{2,})/);
  if (mP) return { p: Number(mP[1]), basis: `stated p ${mP[1]}` };
  const mLt = text.match(/\bp\s*<\s*(0?\.\d+)/i);
  if (mLt) return { p: Number(mLt[1]), basis: `bound p<${mLt[1]}` };
  const num = '[+\\-−]?\\d+(?:\\.\\d+)?';
  const re = new RegExp(`(${num})(?:%|pp|R| ATR| bp)?\\s*\\[\\s*(${num})\\s*,\\s*(${num})\\s*\\]`);
  const m = text.match(re);
  if (m) {
    const f = s => Number(String(s).replace('−', '-').replace('+', ''));
    const est = f(m[1]), lo = f(m[2]), hi = f(m[3]);
    if (Number.isFinite(est) && Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) return { p: pFromCi(est, lo, hi), basis: `ci95 (auto): ${m[1]} [${m[2]}, ${m[3]}]` };
  }
  return null;
}

async function readRun(id) { try { return JSON.parse(await readFile(path.join(OUT, `${id}.json`), 'utf8')); } catch { return null; } }

const rows = [];
for (const e of DESK_EVIDENCE) {
  const cur = e.verdict === 'validated' ? (CURATED[e.id] ?? { basis: 'MISSING FROM CURATED TABLE' }) : (autoExtract(e.result) ?? { basis: 'none found (auto)' });
  rows.push({ id: e.id, verdict: e.verdict, domain: e.domain, p: cur.p ?? NaN, basis: cur.basis, sharpe: !!cur.sharpe, rerun: cur.rerun ?? null, inherits: cur.inherits ?? null, ownBar: cur.ownBar ?? null, ownBarCheck: cur.ownBarCheck ?? null });
}

// Step 2: BH across every extractable p
const fdr = bhFdr(rows.map(r => r.p), 0.10);
rows.forEach((r, i) => { r.passesBh = Number.isFinite(r.p) ? fdr.pass[i] : null; });

// Steps 3–4: harness re-runs and DSR for the Sharpe-type validated entries
for (const r of rows.filter(r => r.verdict === 'validated' && r.rerun)) {
  const run = await readRun(r.rerun[0]);
  if (!run) { r.rerunResult = { missing: r.rerun[0] }; continue; }
  const cell = run.cells.find(c => c.key === r.rerun[1]);
  r.rerunResult = {
    file: r.rerun[0], cell: r.rerun[1], sharpeOos: cell.pnl.sharpeOos, pfOos: cell.pnl.pfOos, winOos: cell.pnl.winOos, tradesOos: cell.pnl.tradesOos,
    pValueOos: cell.pnl.pValueOos, yearsPositiveOos: cell.pnl.yearsPositiveOos, dsr: cell.dsr.dsr, nTrials: cell.dsr.nTrials, pbo: run.pbo?.pbo ?? null,
    clearsOwnBar: r.ownBarCheck ? r.ownBarCheck(run) : (cell.pnl.pValueOos < 0.05 && cell.pnl.meanDailyOos > 0 && cell.pnl.pfOos > 1),
  };
  r.dsr = cell.dsr.dsr;
}

// Decide
const byId = Object.fromEntries(rows.map(r => [r.id, r]));
for (const r of rows.filter(r => r.verdict === 'validated')) {
  const why = [];
  if (Number.isFinite(r.p) && r.passesBh === false) why.push(`fails registry-wide BH-FDR 10% (p ${r.p.toPrecision(2)} vs threshold ${fdr.threshold.toPrecision(2)})`);
  if (r.sharpe && Number.isFinite(r.dsr) && r.dsr < 0.95) why.push(`deflated Sharpe ${r.dsr} < 0.95 (N=${r.rerunResult?.nTrials})`);
  if (r.rerunResult && !r.rerunResult.missing && !r.rerunResult.clearsOwnBar) why.push(`harness re-run on point-in-time asofs does not clear its own bar (${r.ownBar}): OOS Sharpe ${r.rerunResult.sharpeOos}, PF ${r.rerunResult.pfOos}, p ${r.rerunResult.pValueOos}`);
  if (r.inherits) {
    const lost = r.inherits.filter(id => byId[id]?.lose);
    if (lost.length) why.push(`rests on the return streams of ${lost.join(' and ')}, which lost validated status`);
  }
  r.lose = why.length > 0;
  r.why = why.join('; ');
  r.label = r.lose ? 'deflated' : (Number.isFinite(r.p) || r.rerunResult ? 'kept' : 'not-deflatable');
}
// an entry that inherits must be decided after its parents — one more pass
for (const r of rows.filter(r => r.verdict === 'validated' && r.inherits)) {
  const lost = r.inherits.filter(id => byId[id]?.lose);
  if (lost.length && !r.lose) { r.lose = true; r.why = `rests on the return streams of ${lost.join(' and ')}, which lost validated status`; r.label = 'deflated'; }
}

// Specific notes the harness found that belong in the why
const LOOKAHEAD = 'the banked result reproduces only under the engine\'s +2-day assumption on GS2 — a monthly average FRED first publishes a median 32 days after its date (forge/HARNESS_REGISTRY_ADDENDUM_A.md)';
for (const id of ['yield-spread-sleeve', 'ys-long-confirm']) if (byId[id]?.lose) byId[id].why += `; ${LOOKAHEAD}`;

// ── Report ───────────────────────────────────────────────────────────────────
const val = rows.filter(r => r.verdict === 'validated');
const losers = val.filter(r => r.lose);
const lines = [];
lines.push(`# Registry deflation — ${TODAY}`, '', `Family: ${fdr.m} extractable p-values of ${rows.length} entries; BH-FDR 10% threshold **${fdr.threshold.toPrecision(3)}**, ${fdr.k} rejected.`, '',
  `Validated 36 → **${losers.length} lose status** (prediction: 3–8). Kept with a p or re-run: ${val.filter(r => r.label === 'kept').length}. Not deflatable (no p or CI reported): ${val.filter(r => r.label === 'not-deflatable').length}.`, '',
  '| entry | p | basis | BH | re-run (Sharpe / PF / p / DSR) | outcome |', '|---|---|---|---|---|---|');
for (const r of val) {
  const rr = r.rerunResult ? (r.rerunResult.missing ? `missing ${r.rerunResult.missing}` : `${r.rerunResult.sharpeOos} / ${r.rerunResult.pfOos} / ${r.rerunResult.pValueOos} / ${r.rerunResult.dsr}`) : '';
  lines.push(`| ${r.id} | ${Number.isFinite(r.p) ? r.p.toPrecision(2) : '—'} | ${r.basis} | ${r.passesBh == null ? '—' : r.passesBh ? 'pass' : 'FAIL'} | ${rr} | **${r.label}**${r.lose ? ' — ' + r.why : ''} |`);
}
lines.push('', '## Family (non-validated, automatic extraction — status unchanged)', '', '| entry | verdict | p | basis |', '|---|---|---|---|');
for (const r of rows.filter(r => r.verdict !== 'validated' && Number.isFinite(r.p))) lines.push(`| ${r.id} | ${r.verdict} | ${r.p.toPrecision(2)} | ${r.basis} |`);
lines.push('', `Not extractable (non-validated): ${rows.filter(r => r.verdict !== 'validated' && !Number.isFinite(r.p)).length} entries.`);
const report = lines.join('\n');
await writeFile(path.join(OUT, 'REGISTRY_DEFLATION.md'), report);
await writeFile(path.join(OUT, 'REGISTRY_DEFLATION.json'), JSON.stringify({ date: TODAY, fdr: { q: fdr.q, m: fdr.m, k: fdr.k, threshold: fdr.threshold }, rows: rows.map(({ ownBarCheck, ...r }) => r) }, null, 1));
console.log(report);

// ── Apply ────────────────────────────────────────────────────────────────────
if (APPLY) {
  let src = await readFile(LEDGER, 'utf8');
  const esc = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  for (const r of losers) {
    const re = new RegExp(`(\\n    id: '${r.id}', domain: '[a-z]+', verdict: )'validated'(,[^\\n]*\\n)`);
    const m = src.match(re);
    if (!m) throw new Error(`apply: could not anchor ${r.id}`);
    if ((src.match(new RegExp(`id: '${r.id}'`, 'g')) || []).length !== 1) throw new Error(`apply: ${r.id} matched more than once`);
    src = src.replace(re, `$1'context'$2    deflated: { from: 'validated', date: '${TODAY}', why: '${esc(r.why)}' },\n`);
  }
  const block = `// <registry-deflation> written by analysis/harness/deflate_registry.mjs — do not edit by hand\nconst REGISTRY_DEFLATION = ${JSON.stringify({
    date: TODAY, bhThreshold: +fdr.threshold.toPrecision(3), family: fdr.m,
    entries: Object.fromEntries(val.map(r => [r.id, { label: r.label, p: Number.isFinite(r.p) ? +r.p.toPrecision(3) : null, basis: r.basis }])),
  }, null, 0).replace(/"([a-zA-Z_][a-zA-Z0-9_-]*)":/g, (s, k) => (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k) ? `${k}:` : `'${k}':`)).replace(/"/g, "'")};\n// </registry-deflation>`;
  const a = src.indexOf('// <registry-deflation>'), b = src.indexOf('// </registry-deflation>');
  if (a < 0 || b < 0) throw new Error('apply: marker block missing in deskEvidence.js');
  src = src.slice(0, a) + block + src.slice(b + '// </registry-deflation>'.length);
  await writeFile(LEDGER, src);
  console.log(`\napplied: ${losers.length} entries → context, REGISTRY_DEFLATION block rewritten`);
}
