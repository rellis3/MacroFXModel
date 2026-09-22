#!/usr/bin/env node
/**
 * Residual mean-reversion — the FX branch of the MVE, run for the first time.
 * Design frozen in MD files/RESIDUAL_REVERSION_FX_TEST.md before this ran.
 *
 *   node analysis/residual_reversion_fx.mjs     (needs FRED_KEY + OANDA_KEY)
 *
 * Also reachable as a live route + page: GET /api/mve-validate-full/:sym and
 * mve.html's "Run OOS validation" button — same underlying function
 * (validateInstrumentWithRegimeSplit), so a CLI run and a browser run always
 * agree (Lego Principle 1: one shared core, imported, never copied).
 *
 * Per pair (EURUSD, GBPUSD, USDJPY, AUDUSD):
 *   - FACTOR branch: OLS fair value on rate differentials + breakeven,
 *     walk-forward OOS, icEdge vs trailing-mean benchmark, deflated Sharpe.
 *     Publication-lag-honest (js/mve/liveAdapter.js PUB_LAG_DAYS, fixed before
 *     this ran).
 *   - KALMAN branch: price-only mechanical anchor, no FRED needed, for comparison.
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
import { validateInstrumentWithRegimeSplit, validateMechanicalAnchor, poolConsistency } from '../js/mve/validateInstrument.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output'); fs.mkdirSync(OUT_DIR, { recursive: true });

const PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD'];
const REGIME = { from: '2022-01-01', to: '2024-12-31', label: '2022-24 rate-divergence supercycle' };
const COST_RT_PCT = 0.02;   // validated sleeve's own round-trip assumption — an ASSUMPTION here, not a measured spread/ATR gate
const SLOW_HORIZONS = [20, 60];

const fmt = (x, dp = 3) => x == null || !Number.isFinite(x) ? 'n/a' : `${x >= 0 ? '+' : ''}${x.toFixed(dp)}`;
const log = (...a) => console.log(...a);

async function runPair(pair, deps) {
  log(`\n═══ ${pair} ═══`);
  const out = { pair };

  // ── FACTOR branch + regime split + cost overlay (one shared function) ──
  const built = await fetchContext({ sym: pair, deps });
  if (!built.ok) { log(`  FACTOR branch: ${built.error}`); out.factor = { ok: false, error: built.error }; }
  else {
    const full = validateInstrumentWithRegimeSplit(built.ctx, { regime: REGIME, regimeHorizons: SLOW_HORIZONS, costRtPct: COST_RT_PCT });
    out.factor = full;
    if (!full.ok) log(`  FACTOR: ${full.error}`);
    else {
      const rep = full.base;
      log(`  FACTOR (pub-lag honest, ${built.ctx.meta.fredKeys.join('+')}): ${rep.oosPoints} OOS points`);
      for (const H of SLOW_HORIZONS) {
        const h = rep.perHorizon[H];
        if (!h || h.insufficient) { log(`    ${H}-bar: insufficient`); continue; }
        log(`    ${H}-bar: n=${h.n} icPredictive=${fmt(h.icPredictive)} icBenchmark=${fmt(h.icBenchmark)} icEdge=${fmt(h.icEdge)} hitRate=${fmt(h.hitRate, 3)} (n=${h.nActionable})`);
      }
      log(`    best config: ${rep.strategy.bestHold}-bar hold @ z≥${rep.strategy.bestThreshold}, ${rep.strategy.trades} trades, annSharpe=${rep.strategy.annualizedSharpe}, deflatedSharpe=${fmt(rep.strategy.deflatedSharpe)}`);
      log(`    → ${rep.verdict}`);

      if (full.costOverlay) log(`    cost overlay (${COST_RT_PCT}% RT, assumed): mean ${fmt(full.costOverlay.meanPreCost, 5)} → ${fmt(full.costOverlay.meanPostCost, 5)} per trade (shape-only Sharpe ${full.costOverlay.sharpeShapeOnly})`);

      const rg = full.regime;
      log(`    regime split — ${REGIME.label} (n=${rg.nInWindow}): ${rg.inWindow.ok ? rg.inWindow.verdict : rg.inWindow.error}`);
      log(`    regime split — rest of sample (n=${rg.nOutOfWindow}): ${rg.outOfWindow.ok ? rg.outOfWindow.verdict : rg.outOfWindow.error}`);
      log(`    → ${rg.reading}`);
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
  const pooling = {};
  for (const H of SLOW_HORIZONS) {
    const rows = PAIRS.map(p => {
      const h = results[p]?.factor?.ok ? results[p].factor.base.perHorizon[H] : null;
      if (!h || h.insufficient) return null;
      return { instrument: p, slowIcEdge: h.icEdge, slowHitRate: h.hitRate, deflatedSharpe: results[p].factor.base.strategy.deflatedSharpe };
    }).filter(Boolean);
    if (!rows.length) { log(`  ${H}-bar: no pairs with usable data`); continue; }
    const pooled = poolConsistency(rows);
    log(`  ${H}-bar: ${pooled.read}`);
    pooling[H] = pooled;
  }

  const out = { ranAt: new Date().toISOString(), pairs: PAIRS, regime: REGIME, costRtPctAssumed: COST_RT_PCT, results, pooling };
  fs.writeFileSync(path.join(OUT_DIR, 'residual_reversion_fx.json'), JSON.stringify(out, null, 1));
  log('\nwritten analysis/output/residual_reversion_fx.json');
  log('\nNext: append these numbers to MD files/RESIDUAL_REVERSION_FX_TEST.md §7');
  log('verbatim, with the pre-registered reading (§2/§4) applied — then add the');
  log('js/deskEvidence.js ledger entry only once there is an actual verdict.');
}

main().catch(e => { console.error(e); process.exitCode = 1; });
