/**
 * Unit tests for macroConditionerEngine — pure, synthetic, no network.
 * Verifies: row building + labels, σ-rank bucketing, the σ-controlled cells,
 * the regime-spread, and that the verdict fires INCREMENTAL only on a planted
 * within-bucket separation and REDUNDANT when regime is noise vs σ.
 */
import assert from 'node:assert';
import { buildRows, summarizeRows, verdict, analyzePair, REGIMES, SIGMA_BUCKETS } from './macroConditionerEngine.js';

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };

// ── synthetic pair generator ─────────────────────────────────────────────────
// Deterministic. Each day gets a σ, a regime, and OHLC whose realized range is a
// controlled multiple of σ so we can PLANT (or not) a within-σ-bucket regime effect.
function makePair({ n = 800, plantIncremental = false, seed = 1 }) {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const date = [], open = [], high = [], low = [], close = [], sigma = [];
  const regimeByDate = {};
  const base = Date.UTC(2015, 0, 1);
  for (let i = 0; i < n; i++) {
    const d = new Date(base + i * 864e5).toISOString().slice(0, 10);
    // σ spans low→high independent of regime so buckets aren't confounded by it
    const sig = 0.004 + 0.006 * rnd();
    // regime assigned INDEPENDENTLY of σ (so a within-bucket effect is pure regime)
    const u = rnd();
    const regime = u < 0.25 ? 'RISK_OFF' : u < 0.55 ? 'RISK_ON' : 'NEUTRAL';
    const O = 100;
    // realized range in σ-units: baseline ~1.4σ + noise. If plantIncremental, RISK_OFF
    // days get +0.9σ of extra range REGARDLESS of σ bucket (a true incremental effect).
    let rlzSig = 1.2 + 0.6 * rnd();
    if (plantIncremental && regime === 'RISK_OFF') rlzSig += 0.9;
    const rng = rlzSig * sig * O;
    const hi = O + rng * 0.6, lo = O - rng * 0.4;
    const cl = O + (rnd() - 0.5) * rng;
    date.push(d); open.push(O); high.push(hi); low.push(lo); close.push(cl); sigma.push(sig);
    regimeByDate[d] = regime;
  }
  return { series: { date, open, high, low, close, sigma }, regimeByDate };
}

// ── 1. buildRows: labels, ranks, seg split ───────────────────────────────────
{
  const { series, regimeByDate } = makePair({ n: 400 });
  const { rows, nDays, splitDate } = buildRows(series, regimeByDate, { isFrac: 0.5 });
  ok(nDays === 400, 'all valid days kept');
  ok(rows.every(r => r.expand === 0 || r.expand === 1), 'expand is binary');
  ok(rows.every(r => r.dayEff >= 0 && r.dayEff <= 1), 'dayEff in [0,1]');
  ok(rows.every(r => r.sigmaRank >= 0 && r.sigmaRank <= 1), 'sigmaRank in [0,1]');
  ok(REGIMES.includes(rows[0].regime), 'regime canonicalized');
  const is = rows.filter(r => r.seg === 0).length, oos = rows.filter(r => r.seg === 1).length;
  ok(is === 200 && oos === 200, 'IS/OOS split at isFrac');
  ok(typeof splitDate === 'string', 'splitDate reported');
  // σ-rank buckets should be ~evenly populated (independent of regime)
  const counts = { lo: 0, mid: 0, hi: 0 };
  for (const r of rows) counts[r.sigmaRank < 1 / 3 ? 'lo' : r.sigmaRank < 2 / 3 ? 'mid' : 'hi']++;
  ok(Math.min(counts.lo, counts.mid, counts.hi) > 90, 'σ buckets each well populated');
}

// ── 2. unknown regime strings canonicalize to NEUTRAL ────────────────────────
{
  const { series } = makePair({ n: 150 });
  const bad = {};
  for (const d of series.date) bad[d] = 'GARBAGE';
  const { rows } = buildRows(series, bad, {});
  ok(rows.every(r => r.regime === 'NEUTRAL'), 'unknown regime → NEUTRAL');
}

// ── 3. summarizeRows shape + sigmaOnly ablation adds up ──────────────────────
{
  const { series, regimeByDate } = makePair({ n: 900 });
  const { rows } = buildRows(series, regimeByDate, {});
  const sum = summarizeRows(rows);
  for (const seg of ['IS', 'OOS']) for (const b of SIGMA_BUCKETS) {
    const cell = sum.cells[seg][b];
    const regimeN = REGIMES.reduce((s, rg) => s + cell[rg].n, 0);
    ok(regimeN === sum.sigmaOnly[seg][b].n, `${seg}/${b}: regime cells sum to σ-only bucket n`);
  }
}

// ── 4. verdict: REDUNDANT when regime is noise vs σ ──────────────────────────
{
  const { series, regimeByDate } = makePair({ n: 1600, plantIncremental: false });
  const res = analyzePair(series, regimeByDate, { minSpread: 0.05, minN: 30 });
  ok(res.verdict.label === 'REDUNDANT_OR_NULL', 'no planted effect → REDUNDANT_OR_NULL');
}

// ── 5. verdict: INCREMENTAL when a within-σ-bucket effect is planted ─────────
{
  const { series, regimeByDate } = makePair({ n: 1600, plantIncremental: true });
  const res = analyzePair(series, regimeByDate, { minSpread: 0.05, minN: 30 });
  ok(res.verdict.label === 'INCREMENTAL', 'planted within-bucket effect → INCREMENTAL');
  // spread should be positive (RISK_OFF expands more) in OOS across buckets
  const spreads = SIGMA_BUCKETS.map(b => res.summary.regimeSpread.OOS[b]).filter(x => x != null);
  ok(spreads.every(x => x > 0), 'planted RISK_OFF spread is positive OOS in every bucket');
  ok(res.episodes.length > 0 && res.episodes.every(e => e.n > 0), 'risk-off episodes detected');
}

// ── 6. insufficient data guard ───────────────────────────────────────────────
{
  const { series, regimeByDate } = makePair({ n: 50 });
  const res = analyzePair(series, regimeByDate, {});
  ok(res.insufficient === true, 'guards <100 days');
}

// ── 7. coverage: missing-regime days are DROPPED, not counted NEUTRAL ─────────
{
  const { series, regimeByDate } = makePair({ n: 800 });
  const full = buildRows(series, regimeByDate, {});
  ok(full.coverage.coveredFrac === 1 && full.coverage.droppedNoRegime === 0, 'full coverage → nothing dropped');
  // now blank out the regime for the FIRST 70% of dates (simulate a truncated HY series
  // that only covers recent years — the exact bug the live run hit)
  const truncated = {};
  const cut = Math.floor(series.date.length * 0.7);
  series.date.slice(cut).forEach(d => { truncated[d] = regimeByDate[d]; });
  const b = buildRows(series, truncated, {});
  ok(b.coverage.droppedNoRegime > 0, 'uncovered days are dropped');
  ok(b.coverage.coveredFrac < 0.4, 'coveredFrac reflects the truncation');
  ok(b.rows.every(r => truncated[r.date] !== undefined), 'every kept row has a real regime (none faked NEUTRAL)');
  // IS/OOS split lands WITHIN the covered window, not across the empty first 70%
  ok(b.rows.some(r => r.seg === 0) && b.rows.some(r => r.seg === 1), 'both IS & OOS populated inside covered window');
}

// ── 8. truncated coverage → INSUFFICIENT_COVERAGE, never a fake REDUNDANT null ─
{
  // regime only on a thin recent slice → too few risk-off days on BOTH halves to judge
  const { series, regimeByDate } = makePair({ n: 1600, plantIncremental: true });
  const thin = {};
  const cut = Math.floor(series.date.length * 0.92);   // ~8% coverage
  series.date.slice(cut).forEach(d => { thin[d] = regimeByDate[d]; });
  const res = analyzePair(series, thin, { minSpread: 0.05, minN: 30 });
  ok(res.verdict.label === 'INSUFFICIENT_COVERAGE', 'thin regime coverage → INSUFFICIENT_COVERAGE, not REDUNDANT/NULL');
  ok(res.verdict.bucketsEvaluable < 2, 'fewer than 2 evaluable buckets reported');
  ok(res.coverage.coveredFrac < 0.15, 'coverage surfaced on the result');
}

console.log(`macroConditionerEngine: ${passed} assertions passed`);
