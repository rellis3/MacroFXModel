// p90 Regime Study -- treats p90 as a standalone line, not a trade.
//
// Earlier work (analysis/p90_fade_study.mjs, analysis/p90_empirical_outer_backtest.mjs)
// tried to make p90 TRADEABLE by inventing a target/stop (a synthetic symmetric
// gap, then an empirical percentile of runPips) -- two different, both somewhat
// arbitrary answers to "what's the next line," which is exactly the source of
// the earlier back-and-forth confusion. This script drops that question
// entirely, per instruction: no target, no stop, no vote, no "next line."
// Just, for every real p90 touch across 10ish years and 17 pairs: how far does
// price actually fade back (toward p75/the open) vs continue past p90, how
// long does that take, and does it change under different VWAP/volatility/
// session conditions at the moment of touch.
//
// Reuses atlasWalk wholesale -- the SAME M1 load, SAME causal fadePips/runPips
// computation, SAME dimension tags (vwapSide, dayVol, prevSessionVol, session,
// churn) already computed for every rung including p90 (buildAtlasBook already
// aggregates p90 same as p50/p75 -- js/levelAtlasReport.js). Nothing here
// recomputes sigma, the ladder, VWAP, or fadePips/runPips; this only adds the
// STACKED/cross-tab reporting layer the stored book doesn't expose (the book
// keeps per-bucket AVERAGES only, one dimension at a time, never raw
// distributions or cross-tabs).
//
// p90's `outcome` field can only ever be 'back' or 'neither' (never 'out' --
// there is no rung beyond p90 in the 3-rung ladder, RUNGS=['p50','p75','p90']),
// which is fine here since 'out'/'back' isn't the question being asked --
// fadePips/runPips magnitude is, and those are computed independently of
// whether 'out' can structurally fire.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');
const REARM_FRAC = 0.3;   // same convention as every other Level Atlas script this session
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const median = a => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct1 = x => x == null ? null : +x.toFixed(1);
const pct = (n, d) => d > 0 ? +(n / d * 100).toFixed(1) : null;

function summarizeGroup(rows) {
  const fadePct = rows.map(r => r.fadePct), runPct = rows.map(r => r.runPct);
  const resolved = rows.filter(r => r.outcome === 'back');
  const mins = resolved.map(r => r.minsToResolve).filter(x => x != null);
  return {
    n: rows.length,
    backPct: pct(rows.filter(r => r.outcome === 'back').length, rows.length),
    neitherPct: pct(rows.filter(r => r.outcome === 'neither').length, rows.length),
    meanFadePct: pct1(mean(fadePct)), medFadePct: pct1(median(fadePct)),
    meanRunPct: pct1(mean(runPct)), medRunPct: pct1(median(runPct)),
    medMinsToFadeBack: mins.length ? +median(mins).toFixed(0) : null,
  };
}

function breakdownBy(rows, dimKey) {
  const byBucket = {};
  for (const r of rows) {
    const b = r[dimKey];
    if (b == null) continue;
    (byBucket[b] ??= []).push(r);
  }
  const out = {};
  for (const [b, list] of Object.entries(byBucket).sort(([a], [b2]) => a.localeCompare(b2))) out[b] = summarizeGroup(list);
  return out;
}

async function main() {
  const perPairRows = [];   // pooled, normalized-to-% rows across all pairs
  const perPairSummary = [];

  for (const pair of PAIRS) {
    console.log(`Loading M1 + walking ${pair}...`);
    let packed;
    try { packed = await loadM1ForPair(pair); } catch (e) { console.log(`  M1 load failed for ${pair}: ${e.message}`); continue; }
    if (!packed || !packed.n) { console.log(`  no M1 for ${pair}, skipping`); continue; }
    const assetClass = assetClassFor(pair);
    const { touches, coverage } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [REARM_FRAC], pendingRearmFrac: REARM_FRAC });
    if (!touches.length || !coverage) { console.log(`  no touches/coverage for ${pair}, skipping`); continue; }

    const p90 = touches.filter(t => t.rung === 'p90' && t.rearmFrac === REARM_FRAC);
    const p90First = p90.filter(t => t.ordinal === 1);   // one per (day, side) -- the touch-rate denominator's numerator
    const upFirst = p90First.filter(t => t.side === 'up').length;
    const dnFirst = p90First.filter(t => t.side === 'down').length;
    const eitherDays = new Set(p90First.map(t => t.date)).size;

    for (const t of p90) {
      if (!(t.open > 0) || !(t.pip > 0)) continue;
      perPairRows.push({
        pair: pair.toUpperCase(), date: t.date, side: t.side,
        fadePct: t.fadePips * t.pip / t.open * 100,
        runPct: t.runPips * t.pip / t.open * 100,
        outcome: t.outcome, minsToResolve: t.minsToResolve,
        vwapSide: t.vwapSide, dayVol: t.dayVol, prevSessionVol: t.prevSessionVol,
        session: t.session, churn: t.churn,
      });
    }

    console.log(`  ${pair}: ${coverage.sessions} sessions walked (${coverage.from} -> ${coverage.to}), `
      + `p90 touched ${eitherDays} days (${pct(eitherDays, coverage.sessions)}% of sessions) -- `
      + `up ${pct(upFirst, coverage.sessions)}% / down ${pct(dnFirst, coverage.sessions)}%`);
    perPairSummary.push({
      pair: pair.toUpperCase(), sessions: coverage.sessions, from: coverage.from, to: coverage.to,
      touchedDaysPct: pct(eitherDays, coverage.sessions),
      upTouchPct: pct(upFirst, coverage.sessions), downTouchPct: pct(dnFirst, coverage.sessions),
      nTouches: p90.length,
    });
  }

  if (!perPairRows.length) { console.log('No p90 touches collected -- nothing to report.'); return; }

  console.log(`\n==== TOUCH RATE (nominal calibration target: ~10% of sessions, either side) ====`);
  console.log('pair      sessions  touched%  up%    down%   n');
  for (const s of perPairSummary) {
    console.log(`${s.pair.padEnd(9)} ${String(s.sessions).padStart(7)}  ${String(s.touchedDaysPct).padStart(7)}%  ${String(s.upTouchPct).padStart(5)}%  ${String(s.downTouchPct).padStart(5)}%  ${s.nTouches}`);
  }
  const avgTouchedPct = mean(perPairSummary.map(s => s.touchedDaysPct));
  console.log(`\nAverage across pairs: ${avgTouchedPct.toFixed(1)}% of sessions see a p90 touch (either side).`);

  console.log(`\n==== OVERALL (pooled across all pairs, ${perPairRows.length} touches) ====`);
  console.log(JSON.stringify(summarizeGroup(perPairRows), null, 2));

  for (const dim of ['vwapSide', 'dayVol', 'prevSessionVol', 'session', 'churn']) {
    console.log(`\n==== BY ${dim} ====`);
    const bd = breakdownBy(perPairRows, dim);
    for (const [bucket, s] of Object.entries(bd)) {
      console.log(`  ${bucket.padEnd(12)} n=${String(s.n).padStart(5)}  back=${String(s.backPct).padStart(5)}%  neither=${String(s.neitherPct).padStart(5)}%  `
        + `fade(mean/med)=${s.meanFadePct}/${s.medFadePct}%  run(mean/med)=${s.meanRunPct}/${s.medRunPct}%  medMinsToFadeBack=${s.medMinsToFadeBack ?? '—'}`);
    }
  }

  // Two-way stack: vwapSide x dayVol -- the two dimensions the user specifically
  // asked to combine (VWAP position + volatility regime), mirroring the
  // forecast-reversion.html screenshots' single-dimension breakdowns but
  // actually crossed together instead of shown separately.
  console.log(`\n==== STACKED: vwapSide x dayVol ====`);
  const combos = {};
  for (const r of perPairRows) {
    if (r.vwapSide == null || r.dayVol == null) continue;
    const key = `${r.vwapSide} | ${r.dayVol}`;
    (combos[key] ??= []).push(r);
  }
  for (const [key, list] of Object.entries(combos).sort()) {
    const s = summarizeGroup(list);
    console.log(`  ${key.padEnd(24)} n=${String(s.n).padStart(5)}  fade(mean)=${s.meanFadePct}%  run(mean)=${s.meanRunPct}%  back=${s.backPct}%`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'p90_regime_study_touchrate.csv'),
    ['pair,sessions,from,to,touchedDaysPct,upTouchPct,downTouchPct,nTouches',
      ...perPairSummary.map(s => `${s.pair},${s.sessions},${s.from},${s.to},${s.touchedDaysPct},${s.upTouchPct},${s.downTouchPct},${s.nTouches}`)].join('\n'));
  fs.writeFileSync(path.join(OUT_DIR, 'p90_regime_study_touches.json'), JSON.stringify(perPairRows));
  console.log(`\nWrote touch-rate summary + raw pooled touches to ${OUT_DIR}/p90_regime_study_*`);
}

main();
