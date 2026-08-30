#!/usr/bin/env node
/**
 * §20 — "only go long while price is above VWAP": the standalone TREND
 * counterpart to every mean-reversion VWAP idea tested in this study so far
 * (GOLD_VWAP_FIXED_SIGMA_FINDINGS.md §1-19, all null). Trade WITH VWAP's own
 * directional read via `vwapReversionEngine.js`'s new `vwap_trend_cross`
 * mode — first fresh close-based cross of session VWAP each day enters,
 * exits on the opposite cross or session end. No σ-band, no stop/target —
 * the minimal-DOF version (CLAUDE.md: nothing to overfit with zero free
 * parameters beyond mechanics already fixed by the primitive).
 *
 * Pre-registered before running: OOS t>2, n>=30, positive gross, same sign
 * IS/OOS, gold + >=2/3 FX majors — the same house bar every trade test in
 * this study has used. Stated prior: genuinely open. This is the first
 * non-band-anchored VWAP idea tested in the whole study, so there's no
 * direct precedent to lean on either way — but every fade construction
 * tried so far failed for the same structural reason (losers run further
 * than a capped winner), and a trend-following bet has the opposite R:R
 * shape in principle (a capped stop, an uncapped ride), which is a
 * theoretical reason this could behave differently, not a prediction it will.
 *
 *   node scripts/run_vwap_trend_cross.mjs [pairs...]
 */

import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { runVwapReversion } from '../js/vwapReversionEngine.js';
import { summarizeSplit } from '../js/honestForecastEngine.js';

const pairs = process.argv.slice(2).filter(a => !a.startsWith('-'));
const list = pairs.length ? pairs : ['gold', 'eurusd', 'gbpusd', 'usdjpy'];

const tOf = s => s.trades > 1 && s.tradesPerYr > 0
  ? +((s.sharpe / Math.sqrt(s.tradesPerYr)) * Math.sqrt(s.trades)).toFixed(2) : null;

const variants = [
  ['V0 both directions', { dir: 'both' }],
  ['V1 long-only', { dir: 'long' }],
  ['V2 short-only', { dir: 'short' }],
];

for (const pair of list) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.log(`\n=== ${pair}: no M1 ===`); continue; }
  const costPct = pair === 'gold' ? 0.020 : 0.012;
  console.log(`\n=== ${pair.toUpperCase()} (cost ${costPct}%) ===`);
  for (const [label, gates] of variants) {
    const records = runVwapReversion(packed, { mode: 'vwap_trend_cross', sessionAnchor: 'day', costPct, ...gates });
    const filled = records.filter(r => r.filled);
    const { is, oos } = summarizeSplit(records, 0.4);
    const grossOOS = oos.trades ? +(oos.expectancy + costPct).toFixed(4) : null;
    console.log(`  ${label.padEnd(20)} sessions=${records.length} filled=${filled.length}  IS n=${String(is.trades).padStart(4)} mean ${String(is.expectancy).padStart(8)}% t ${String(tOf(is)).padStart(6)} | OOS n=${String(oos.trades).padStart(4)} mean ${String(oos.expectancy).padStart(8)}% t ${String(tOf(oos)).padStart(6)} win ${oos.winRate ?? '—'}% gross ${grossOOS}%`);
  }
}
