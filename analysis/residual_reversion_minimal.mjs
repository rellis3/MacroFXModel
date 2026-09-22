#!/usr/bin/env node
/**
 * Minimal-DOF residual mean-reversion — the PRICE-ONLY (AR(1) residual) branch,
 * run independently of the MVE macro-factor test.
 *
 *   node analysis/residual_reversion_minimal.mjs            (needs OANDA_KEY only)
 *   node analysis/residual_reversion_minimal.mjs EURUSD     (one pair)
 *
 * What this is / isn't:
 *   - It is NOT a re-run of the MVE macro-factor residual (that is a documented
 *     NULL on FX — MD files/RESIDUAL_REVERSION_FX_TEST.md). This tests the OTHER
 *     minimal object: price minus its own AR(1) one-step forecast, faded at the
 *     bare sign, with essentially nothing to overfit. No FRED, no factor soup.
 *   - The benchmark is a trailing-mean anchor z-score built the SAME way, because
 *     ANY trailing anchor "reverts" on a random walk. Only the model's EDGE over
 *     that spurious baseline (icEdge) is real signal. The synthetic unit test
 *     (js/residualReversionCore.test.mjs) proves this: random walk → NULL, AR(1) →
 *     reversion is real but the edge over a trailing mean is ~0.
 *
 * Honesty gates (CLAUDE.md): true chronological IS/OOS split, costs ON (0.02% RT,
 * the validated sleeve's assumption — stated as an assumption, not a measured
 * spread/ATR gate), deflated Sharpe across the whole hold×threshold sweep, ≥30 OOS
 * trades before any belief, and cross-instrument pooling that requires corroboration.
 *
 * Pre-registered outcomes (frozen before running — see the engine header):
 *   "It worked" = OOS icEdge > 0.03 AND deflated-Sharpe ≥ 0.95 after costs on ≥30
 *                 OOS trades. "It didn't" = anything else, including a positive RAW
 *                 icPredictive that does not beat the trailing-mean benchmark.
 *
 * Output: console + analysis/output/residual_reversion_minimal.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load a root .env if present (OANDA_KEY etc.) — no-op on Railway where the env is
// already injected, and lets a local run work by dropping the key into ./.env.
// Kept dependency-free (tiny parser) so the runner needs no `npm install dotenv`.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
try {
  const envTxt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const line of envTxt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#') && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch { /* no .env — rely on the process env (Railway) */ }

import { fetchD1, INSTRUMENTS } from '../js/volBacktestEngine.js';
import { validateResidualReversion } from '../js/residualReversionCore.js';

const OUT_DIR = path.join(__dirname, 'output'); fs.mkdirSync(OUT_DIR, { recursive: true });

// Default FX majors + gold so the pooled read is cross-sectional, not one pair.
// Names must match INSTRUMENTS[].name in js/volBacktestEngine.js (GOLD, not XAUUSD).
const DEFAULT_SET = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'GOLD', 'NQ'];
const COST_RT = 0.0002;          // 0.02% round-trip — an ASSUMPTION, not a measured gate
const SLOW_HORIZONS = [20, 60];  // where a slow reversion edge would live, if anywhere

const fmt = (x, dp = 3) => x == null || !Number.isFinite(x) ? 'n/a' : `${x >= 0 ? '+' : ''}${x.toFixed(dp)}`;
const log = (...a) => console.log(...a);

// Resolve a friendly name to its OANDA symbol via the shared registry (an ARRAY of
// { name, oanda, assetClass }). Falls back to inserting an underscore for FX pairs.
function oandaSym(name) {
  const cfg = (INSTRUMENTS || []).find(i => i.name === name);
  return cfg?.oanda || name.replace(/([A-Z]{3})([A-Z]{3})/, '$1_$2');
}

async function runPair(pair) {
  log(`\n═══ ${pair} ═══`);
  let bars;
  try { bars = await fetchD1(oandaSym(pair), 5000); }
  catch (e) { log(`  fetch failed: ${e.message}`); return { pair, ok: false, error: e.message }; }
  if (!bars?.length) { log('  no bars'); return { pair, ok: false, error: 'no bars' }; }
  const price = bars.map(b => b.close);
  log(`  ${bars.length} D1 bars (${bars[0].date} → ${bars.at(-1).date})`);

  const rep = validateResidualReversion(price, { instrument: pair, costRt: COST_RT });
  if (!rep.ok) { log(`  ${rep.error}`); return { pair, ok: false, error: rep.error }; }

  log(`  meanPhi=${fmt(rep.meanPhi, 4)}  OU halfLife=${rep.ou?.halfLife ?? 'n/a'}b  snapback baseRate=${rep.snapbackBaseRate?.baseRate != null ? (rep.snapbackBaseRate.baseRate * 100).toFixed(0) + '%' : 'n/a'} (${rep.snapbackBaseRate?.events ?? 0} events)`);
  for (const H of SLOW_HORIZONS) {
    const h = rep.perHorizon[H];
    if (!h || h.insufficient) { log(`    ${H}-bar: insufficient`); continue; }
    log(`    ${H}-bar: n=${h.n} icPredictive=${fmt(h.icPredictive)} icBenchmark=${fmt(h.icBenchmark)} icEdge=${fmt(h.icEdge)} hitRate=${fmt(h.hitRate)} (n=${h.nActionable})`);
  }
  log(`    best fade: ${rep.strategy.bestHold}-bar @ z≥${rep.strategy.bestThreshold}, ${rep.strategy.trades} OOS trades, annSharpe=${rep.strategy.annualizedSharpe}, deflatedSharpe=${fmt(rep.strategy.deflatedSharpe)} (${rep.strategy.nConfigsTried} configs)`);
  log(`    → ${rep.verdict}`);
  return { pair, ok: true, report: rep };
}

// Cross-instrument pooling on the slow horizons — requires BOTH a positive icEdge
// AND an above-coin-flip hit rate to count as real evidence (sign-only is a coin flip).
function pool(results) {
  const rows = results.filter(r => r.ok).map(r => {
    const slow = SLOW_HORIZONS.map(H => r.report.perHorizon[H]).filter(h => h && h.icEdge != null);
    const best = slow.sort((a, b) => b.icEdge - a.icEdge)[0] || {};
    return { instrument: r.pair, slowIcEdge: best.icEdge ?? null, slowHitRate: best.hitRate ?? null, deflatedSharpe: r.report.strategy.deflatedSharpe };
  }).filter(r => r.slowIcEdge != null);
  const n = rows.length;
  if (!n) return { n: 0, read: 'no instruments scored' };
  const real = rows.filter(r => r.slowIcEdge > 0.03 && (r.slowHitRate ?? 0) > 0.50);
  const tradeable = real.filter(r => (r.deflatedSharpe ?? 0) >= 0.60);
  const signOnly = rows.filter(r => r.slowIcEdge > 0.03).length;
  const meanEdge = +(rows.reduce((s, r) => s + r.slowIcEdge, 0) / n).toFixed(4);
  const meanHit = +(rows.reduce((s, r) => s + (r.slowHitRate ?? 0), 0) / n).toFixed(3);
  const consistent = real.length >= Math.max(3, Math.ceil(n * 0.6)) && tradeable.length >= 2;
  const read = consistent
    ? `CONSISTENT: ${real.length}/${n} instruments show a positive slow-horizon icEdge WITH an above-coin-flip hit rate (${tradeable.length} tradeable) — cross-sectional evidence of a real reversion edge.`
    : `NULL / INCONSISTENT: only ${real.length}/${n} clear both a positive icEdge AND a >50% hit rate (mean hit ${meanHit}). ${signOnly}/${n} positive on sign alone — a coin-flip outcome at this magnitude (mean icEdge ${meanEdge}). No tradeable reversion edge — do NOT wire in.`;
  return { n, realEvidence: real.length, tradeable: tradeable.length, positiveSignOnly: signOnly, meanSlowIcEdge: meanEdge, meanSlowHitRate: meanHit, consistent, read, rows };
}

async function main() {
  const arg = process.argv[2];
  const pairs = arg ? [arg.toUpperCase()] : DEFAULT_SET;
  if (!process.env.OANDA_KEY) {
    log('OANDA_KEY not set — cannot fetch D1. Set it in the env (Railway) to run on real data.');
    process.exitCode = 1; return;
  }
  log('Minimal-DOF residual mean-reversion (AR(1) residual, price-only)');
  log(`Pairs: ${pairs.join(', ')} · cost ${COST_RT * 100}% RT (assumed) · IS/OOS chronological · deflated Sharpe across the full sweep`);

  const results = [];
  for (const p of pairs) {
    try { results.push(await runPair(p)); }
    catch (e) { log(`${p}: threw — ${e.message}`); results.push({ pair: p, ok: false, error: e.message }); }
  }

  log('\n═══ Cross-instrument pooling (slow horizons) ═══');
  const pooled = pool(results);
  log(pooled.read);

  const out = { generatedAt: new Date().toISOString(), costRt: COST_RT, pairs, pooled, results };
  const file = path.join(OUT_DIR, 'residual_reversion_minimal.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  log(`\nWrote ${path.relative(process.cwd(), file)}`);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
