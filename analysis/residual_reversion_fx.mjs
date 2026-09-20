#!/usr/bin/env node
/**
 * Residual mean-reversion — the FX branch of the MVE, run for the first time.
 * Design frozen in MD files/RESIDUAL_REVERSION_FX_TEST.md before this ran.
 *
 *   node analysis/residual_reversion_fx.mjs     (needs FRED_KEY + OANDA_KEY)
 *
 * Per pair (EURUSD, GBPUSD, USDJPY, AUDUSD):
 *   - FACTOR branch (validateInstrument): OLS fair value on rate differentials +
 *     breakeven, walk-forward OOS, icEdge vs trailing-mean benchmark, deflated
 *     Sharpe. Publication-lag-honest (js/mve/liveAdapter.js PUB_LAG_DAYS, fixed
 *     before this ran).
 *   - KALMAN branch (validateMechanicalAnchor): price-only mechanical anchor, no
 *     FRED needed, for comparison.
 *   - Regime split: the SAME OOS scoring re-run on 2022-01-01..2024-12-31 vs the
 *     rest, at the slow (20/60-bar) horizons only — CLAUDE.md's "disaggregate
 *     before declaring a pooled null", applied here from the start.
 *   - Cost overlay: the best z-fade config's trades, haircut by the validated
 *     yield-spread sleeve's own 0.02% round-trip assumption — an ASSUMPTION, not a
 *     live spread/ATR gate (that data isn't in this harness; said plainly).
 *   - poolConsistency across all 4 pairs' slow-horizon results.
 *
 * Output: console + analysis/output/residual_reversion_fx.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchD1 } from '../js/volBacktestEngine.js';
import { fetchFredObservations } from '../js/zscoreSpreadEngine.js';
import { fetchContext, fetchPriceOnly, SUPPORTED } from '../js/mve/liveAdapter.js';
import {
  validateInstrument, validateMechanicalAnchor, oosMispricingSeries,
  scoreMispricing, poolConsistency,
} from '../js/mve/validateInstrument.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output'); fs.mkdirSync(OUT_DIR, { recursive: true });

const PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD'];
const REGIME = { from: '2022-01-01', to: '2024-12-31', label: '2022-24 rate-divergence supercycle' };
const COST_RT_PCT = 0.02;   // validated sleeve's own round-trip assumption (YIELD_SPREAD_STRATEGY.md §2) — an ASSUMPTION here, not a measured spread/ATR gate (§3 of the doc)
const SLOW_HORIZONS = [20, 60];

const fmt = (x, dp = 3) => x == null || !Number.isFinite(x) ? 'n/a' : `${x >= 0 ? '+' : ''}${x.toFixed(dp)}`;
const log = (...a) => console.log(...a);

function costOverlay(trPnls, costRtPct) {
  if (!Array.isArray(trPnls) || !trPnls.length) return null;
  const cost = costRtPct / 100;
  const net = trPnls.map(p => p - cost);
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
  const m = mean(net), s = sd(net);
  return { n: net.length, meanPreCost: +mean(trPnls).toFixed(5), meanPostCost: +m.toFixed(5), sharpeShapeOnly: s > 0 ? +(m / s).toFixed(3) : 0 };
}

// Re-run the exact scoreMispricing machinery on a date-restricted slice of the SAME
// walk-forward OOS series (no refit — the split is on scoring, not training).
function regimeSlice(ctx, { idx, z, zBench }, { from, to }, invert = false) {
  const inWindow = d => d >= from && d <= to;
  const keep = [];
  for (let k = 0; k < idx.length; k++) {
    const d = ctx.dates[idx[k]];
    const want = invert ? !inWindow(d) : inWindow(d);
    if (want) keep.push(k);
  }
  return {
    idx: keep.map(k => idx[k]), z: keep.map(k => z[k]), zBench: keep.map(k => zBench[k]),
  };
}

async function runPair(pair, deps) {
  log(`\n═══ ${pair} ═══`);
  const out = { pair };

  // ── FACTOR branch ──
  const built = await fetchContext({ sym: pair, deps });
  if (!built.ok) { log(`  FACTOR branch: ${built.error}`); out.factor = { ok: false, error: built.error }; }
  else {
    const ctx = built.ctx;
    const rep = validateInstrument(ctx, { includeTrades: true });
    out.factor = rep;
    if (!rep.ok) log(`  FACTOR: ${rep.error}`);
    else {
      log(`  FACTOR (pub-lag honest, ${ctx.meta.fredKeys.join('+')}): ${rep.oosPoints} OOS points`);
      for (const H of SLOW_HORIZONS) {
        const h = rep.perHorizon[H];
        if (!h || h.insufficient) { log(`    ${H}-bar: insufficient`); continue; }
        log(`    ${H}-bar: n=${h.n} icPredictive=${fmt(h.icPredictive)} icBenchmark=${fmt(h.icBenchmark)} icEdge=${fmt(h.icEdge)} hitRate=${fmt(h.hitRate, 3)} (n=${h.nActionable})`);
      }
      log(`    best config: ${rep.strategy.bestHold}-bar hold @ z≥${rep.strategy.bestThreshold}, ${rep.strategy.trades} trades, annSharpe=${rep.strategy.annualizedSharpe}, deflatedSharpe=${fmt(rep.strategy.deflatedSharpe)}`);
      log(`    → ${rep.verdict}`);

      // ── cost overlay (§3 — an assumption, not a live gate) ──
      const overlay = costOverlay(rep.strategy.bestTrPnls, COST_RT_PCT);
      out.costOverlay = overlay;
      if (overlay) log(`    cost overlay (${COST_RT_PCT}% RT, assumed): mean ${fmt(overlay.meanPreCost, 5)} → ${fmt(overlay.meanPostCost, 5)} per trade (shape-only Sharpe ${overlay.sharpeShapeOnly})`);

      // ── regime split (§2) — same OOS series, two date slices ──
      const series = oosMispricingSeries(ctx.price, ctx.factors, { window: 150, minTrain: 180 });
      const inSlice = regimeSlice(ctx, series, REGIME, false);
      const outSlice = regimeSlice(ctx, series, REGIME, true);
      const scoreSlice = (slice, label) => {
        if (slice.idx.length < 30) return { ok: false, error: `only ${slice.idx.length} OOS points in ${label}` };
        return scoreMispricing({ instrument: pair, idx: slice.idx, z: slice.z, zBench: slice.zBench, price: ctx.price, horizons: SLOW_HORIZONS, includeTrades: true });
      };
      const inRep = scoreSlice(inSlice, REGIME.label);
      const outRep = scoreSlice(outSlice, 'rest of sample');
      out.regimeSplit = { inWindow: inRep, outOfWindow: outRep };
      log(`    regime split — ${REGIME.label} (n=${inSlice.idx.length}): ${inRep.ok ? inRep.verdict : inRep.error}`);
      log(`    regime split — rest of sample (n=${outSlice.idx.length}): ${outRep.ok ? outRep.verdict : outRep.error}`);
      if (inRep.ok && outRep.ok) {
        const inSurvives = /^SURVIVES/.test(inRep.verdict), outSurvives = /^SURVIVES/.test(outRep.verdict);
        if (inSurvives && !outSurvives) log(`    → POOLED NULL WAS HIDING A REGIME-CONCENTRATED EDGE (2022-24 only, n=1 regime — hypothesis, not proof; see doc §2)`);
        else if (inSurvives && outSurvives) log(`    → both slices clear SURVIVES independently — broader than a regime artifact`);
        else log(`    → the regime split did not change the reading`);
      }
    }
  }

  // ── KALMAN branch (price-only, no FRED) ──
  const po = await fetchPriceOnly({ sym: pair, deps });
  if (!po.ok) { log(`  KALMAN branch: ${po.error}`); out.kalman = { ok: false, error: po.error }; }
  else {
    const krep = validateMechanicalAnchor(po.price, { instrument: pair });
    out.kalman = krep;
    if (krep.ok) {
      log(`  KALMAN (price-only): ${krep.oosPoints} OOS points, best ${krep.strategy.bestHold}-bar @ z≥${krep.strategy.bestThreshold}, deflatedSharpe=${fmt(krep.strategy.deflatedSharpe)}`);
      log(`    → ${krep.verdict}`);
    } else log(`  KALMAN: ${krep.error}`);
  }

  return out;
}

async function main() {
  if (!process.env.FRED_KEY) {
    log('FRED_KEY not set — cannot run the FACTOR branch. This is the expected state');
    log('off Railway; see MD files/RESIDUAL_REVERSION_FX_TEST.md §5/§7. The KALMAN');
    log('branch needs only OANDA_KEY — checking whether that alone can run:');
    if (!process.env.OANDA_KEY) { log('OANDA_KEY also not set — nothing can run here.'); process.exitCode = 1; return; }
    log('OANDA_KEY present — running KALMAN-only (no FRED_KEY needed for this branch).\n');
  }

  const deps = {
    fredKey: process.env.FRED_KEY,
    fetchD1: (sym, count) => fetchD1(sym, count),
    fetchFred: (id, from, key) => fetchFredObservations(id, from, key),
  };

  const results = {};
  for (const pair of PAIRS) {
    if (!SUPPORTED.includes(pair)) { log(`${pair}: not in liveAdapter SUPPORTED list, skipping`); continue; }
    try { results[pair] = await runPair(pair, deps); }
    catch (e) { log(`${pair}: threw — ${e.message}`); results[pair] = { pair, error: e.message }; }
  }

  // ── cross-instrument pooling (§4) — slow horizons only ──
  log('\n═══ Cross-instrument pooling (poolConsistency, slow horizons) ═══');
  for (const H of SLOW_HORIZONS) {
    const rows = PAIRS.map(p => {
      const h = results[p]?.factor?.ok ? results[p].factor.perHorizon[H] : null;
      if (!h || h.insufficient) return null;
      return { instrument: p, slowIcEdge: h.icEdge, slowHitRate: h.hitRate, deflatedSharpe: results[p].factor.strategy.deflatedSharpe };
    }).filter(Boolean);
    if (!rows.length) { log(`  ${H}-bar: no pairs with usable data`); continue; }
    const pooled = poolConsistency(rows);
    log(`  ${H}-bar: ${pooled.read}`);
    (results.pooling ??= {})[H] = pooled;
  }

  const out = { ranAt: new Date().toISOString(), pairs: PAIRS, regime: REGIME, costRtPctAssumed: COST_RT_PCT, results };
  fs.writeFileSync(path.join(OUT_DIR, 'residual_reversion_fx.json'), JSON.stringify(out, null, 1));
  log('\nwritten analysis/output/residual_reversion_fx.json');
  log('\nNext: append these numbers to MD files/RESIDUAL_REVERSION_FX_TEST.md §7');
  log('verbatim, with the pre-registered reading (§2/§4) applied — then add the');
  log('js/deskEvidence.js ledger entry only once there is an actual verdict.');
}

main().catch(e => { console.error(e); process.exitCode = 1; });
