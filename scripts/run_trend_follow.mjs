#!/usr/bin/env node
/**
 * Owner's request (2026-08-30): "test a with-trend entry not fade" —
 * the natural trade-level follow-up to §12/§13's finding that expanding
 * volatility (bandSlope) at a deep fixed-sigma band correlates with MORE
 * continuation, not reversion, and that this specific finding — unlike the
 * regimeState=trend×expanding cell — replicates cleanly across gold and all
 * three FX majors tested.
 *
 * Uses `js/stackedFadeV1Engine.js`'s new `action:'follow'` (added alongside
 * the existing 'fade' as a parameter of the ONE entry primitive, per
 * CLAUDE.md's Lego Principle #2 — not a new bespoke engine). Mechanics:
 * entry WITH the touch direction (continuation), TP = the (band+1)σ level
 * as of the touch (frozen), SL = the (band-1)σ level as of the touch
 * (frozen) — literally the same symmetric race fixedSigmaWalk's own
 * out/back outcome already measures descriptively, now run as a costed
 * trade. 240min cap, one trade/day, costs on — same mechanics as every
 * other trade test in this study, for direct comparability.
 *
 * PRE-REGISTERED BEFORE RUNNING (this comment written first, results filled
 * in below by the script's own printed output — not edited after the fact):
 *   "worked" = OOS per-trade t>2, positive mean, OOS n>=30, positive gross,
 *   on gold AND replicating in the same direction on at least 2 of 3 FX
 *   majors (this study's own cross-instrument bar for trusting a trade
 *   result, matching how the descriptive findings were required to
 *   replicate before being trusted).
 *   Priors: TP and SL are both exactly 1×fixedSigma from the touched band
 *   by construction (entry sits at the band itself) — a roughly symmetric
 *   1:1 R:R geometry, so this needs a real win-rate edge above ~50% (plus a
 *   little for costs) to be positive, not just "more likely than not to
 *   continue a bit." Every trade-level test run in this study so far (§6,
 *   §8b, §9, §9a — four separate pre-registered attempts) has come back
 *   null, including ones built on the study's own best-looking descriptive
 *   conditions. bandSlope=expanding is the best-corroborated descriptive
 *   finding of the whole effort (real, cross-market, §13) — if any
 *   descriptive finding in this study were going to convert to a trade,
 *   this is the best candidate so far — but the standing base rate from
 *   this study is still null, stated plainly rather than talked up.
 *
 *   Usage: node scripts/run_trend_follow.mjs [pairs...]  (default: gold eurusd gbpusd usdjpy)
 */

import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { fixedSigmaWalk } from '../js/vwapFixedSigmaEngine.js';
import { runStackedFade } from '../js/stackedFadeV1Engine.js';
import { summarizeSplit } from '../js/honestForecastEngine.js';

const pairs = process.argv.slice(2).filter(a => !a.startsWith('-'));
const list = pairs.length ? pairs : ['gold', 'eurusd', 'gbpusd', 'usdjpy'];

const tOf = s => s.trades > 1 && s.tradesPerYr > 0
  ? +((s.sharpe / Math.sqrt(s.tradesPerYr)) * Math.sqrt(s.trades)).toFixed(2) : null;

const summary = [];
for (const pair of list) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.log(`\n=== ${pair}: no M1 ===`); continue; }
  const costPct = pair === 'gold' ? 0.020 : 0.012;
  const { touches } = fixedSigmaWalk(packed, { instrument: pair, assetClass: pair === 'gold' ? 'commodity' : 'fx' });
  console.log(`\n=== ${pair.toUpperCase()} — with-trend (action:'follow'), cost ${costPct}% ===`);
  const variants = [
    ['V0-follow (regardless)', { action: 'follow' }],
    ['V-expanding (bandSlope=3·expanding)', { action: 'follow', requireBandSlopeExpanding: true }],
  ];
  for (const [label, gates] of variants) {
    const { records, meta } = runStackedFade(packed, touches, { ...gates, costPct });
    const { is, oos } = summarizeSplit(records, 0.4);
    const grossOOS = oos.trades ? +(oos.expectancy + costPct).toFixed(4) : null;
    console.log(`  ${label.padEnd(38)} pool=${String(meta.pool).padStart(5)}  IS n=${String(is.trades).padStart(4)} mean ${String(is.expectancy).padStart(8)}% t ${String(tOf(is)).padStart(6)} | OOS n=${String(oos.trades).padStart(4)} mean ${String(oos.expectancy).padStart(8)}% t ${String(tOf(oos)).padStart(6)} win ${oos.winRate ?? '—'}% gross ${grossOOS}%`);
    summary.push({ pair, label, oosN: oos.trades, oosMean: oos.expectancy, oosT: tOf(oos), oosWin: oos.winRate, oosGross: grossOOS });
  }
}

console.log('\n=== Cross-instrument summary (OOS) ===');
for (const s of summary) {
  console.log(`  ${s.pair.padEnd(8)} ${s.label.padEnd(38)} n=${String(s.oosN).padStart(4)} mean=${String(s.oosMean).padStart(8)}% t=${String(s.oosT).padStart(6)} win=${s.oosWin}% gross=${s.oosGross}%`);
}
