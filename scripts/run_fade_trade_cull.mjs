#!/usr/bin/env node
/**
 * Does culling on the survivors from run_fade_trade_conditions.mjs actually
 * flip the trade's expectancy, not just its descriptive win rate? The four
 * AVOID conditions and one PREFER condition below all cross-validated
 * (same sign, OOS-held) on gold + EURUSD + GBPUSD + USDJPY:
 *
 *   AVOID  session === 'London'                (win% -12 to -18pp OOS, all 4)
 *   AVOID  sessionPos === '2·mid'               (win% -8 to -19pp OOS, all 4)
 *   AVOID  rangeConsumed === '2·mid'            (win% -11 to -20pp OOS, all 4)
 *   AVOID  rangeConf === '1·asia'               (win% -11 to -23pp OOS, all 4)
 *   PREFER approachER === '1·choppy'            (win% +8 to +11pp OOS, all 4)
 *
 * Pre-registered before running: minimal-DOF first (each AVOID lever alone),
 * then the 4 AVOIDs stacked (correlated conditions, so pool shrinkage will
 * be less than naive multiplication), then + the PREFER lever on top. Same
 * house bar as every trade test in this study: OOS t>2, n>=30, positive
 * gross, same sign IS/OOS, gold + 2/3 FX majors. Stated prior: genuinely
 * open — this is the richest, most cross-validated descriptive signal set
 * in the whole study, but every previous "descriptive lift converts to
 * trade edge" bet in this study has failed, so no assumption either way.
 */

import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { fixedSigmaWalk } from '../js/vwapFixedSigmaEngine.js';
import { runStackedFade } from '../js/stackedFadeV1Engine.js';
import { summarizeSplit } from '../js/honestForecastEngine.js';

const pairs = process.argv.slice(2).filter(a => !a.startsWith('-'));
const list = pairs.length ? pairs : ['gold', 'eurusd', 'gbpusd', 'usdjpy'];

const tOf = s => s.trades > 1 && s.tradesPerYr > 0
  ? +((s.sharpe / Math.sqrt(s.tradesPerYr)) * Math.sqrt(s.trades)).toFixed(2) : null;

const AVOID_LONDON = t => t.session !== 'London';
const AVOID_MIDSESSION = t => t.sessionPos !== '2·mid';
const AVOID_MIDRANGE = t => t.rangeConsumed !== '2·mid';
const AVOID_ASIACONF = t => t.rangeConf !== '1·asia';
const PREFER_CHOPPY = t => t.approachER === '1·choppy';

const variants = [
  ['V0 baseline (no filter)', () => true],
  ['V1 avoid-London alone', AVOID_LONDON],
  ['V2 avoid-midSessionPos alone', AVOID_MIDSESSION],
  ['V3 avoid-midRangeConsumed alone', AVOID_MIDRANGE],
  ['V4 avoid-AsiaConf alone', AVOID_ASIACONF],
  ['V5 prefer-choppy alone', PREFER_CHOPPY],
  ['V6 all 4 AVOIDs stacked', t => AVOID_LONDON(t) && AVOID_MIDSESSION(t) && AVOID_MIDRANGE(t) && AVOID_ASIACONF(t)],
  ['V7 all 4 AVOIDs + prefer-choppy', t => AVOID_LONDON(t) && AVOID_MIDSESSION(t) && AVOID_MIDRANGE(t) && AVOID_ASIACONF(t) && PREFER_CHOPPY(t)],
];

for (const pair of list) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.log(`\n=== ${pair}: no M1 ===`); continue; }
  const costPct = pair === 'gold' ? 0.020 : 0.012;
  const { touches } = fixedSigmaWalk(packed, { instrument: pair, assetClass: pair === 'gold' ? 'commodity' : 'fx', sigmaMode: 'developing' });
  console.log(`\n=== ${pair.toUpperCase()} (cost ${costPct}%) ===`);
  for (const [label, filterFn] of variants) {
    const filteredTouches = touches.filter(t => t.ordinal !== 1 || t.band !== 3 || filterFn(t));
    const { records, meta } = runStackedFade(packed, filteredTouches, { bands: [3], costPct });
    const { is, oos } = summarizeSplit(records, 0.4);
    const grossOOS = oos.trades ? +(oos.expectancy + costPct).toFixed(4) : null;
    console.log(`  ${label.padEnd(34)} pool=${String(meta.pool).padStart(4)}  IS n=${String(is.trades).padStart(4)} mean ${String(is.expectancy).padStart(8)}% t ${String(tOf(is)).padStart(6)} | OOS n=${String(oos.trades).padStart(4)} mean ${String(oos.expectancy).padStart(8)}% t ${String(tOf(oos)).padStart(6)} win ${oos.winRate ?? '—'}% gross ${grossOOS}%`);
  }
}
