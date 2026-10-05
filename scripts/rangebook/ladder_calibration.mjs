// LADDER CALIBRATION: does the Export forecast's p50/p75/p90 ladder get exceeded 50/25/10% of the time?
// Rebuilds every London day's ladder with the page's own calculation (v4Days -> forecastSigma -> buildLadder)
// and scores it against that day's realised OH / OL / HL / |OC| from M1. Split at the params' trained_through
// date, so the post-split rows are out-of-sample for the frozen widths.
//   node scripts/rangebook/ladder_calibration.mjs [fileKey SYM ...]
// Writes analysis/surfaces/ladder_calibration/<SYM>.csv (one row per day); summarise with ladder_calibration.py.
// CANDIDATE=v2 scores a side-by-side candidate instead: same days, opens, event tags and realised values, but sigma
// and widths from js/forecastLadderParamsV2.js (har_rv_log), via buildLadder's ladderParams override. Live params and
// shared engines are only read, never changed. Output goes to analysis/surfaces/ladder_calibration_v2/.
import fs from 'fs';
import path from 'path';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { buildContext } from './common.mjs';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { forecastSigma } from '../../js/forecastSigma.js';
import { buildLadder, paramsFor } from '../../js/forecastLadder.js';
import { LADDER_PARAMS as V2 } from '../../js/forecastLadderParamsV2.js';

const CAND = process.env.CANDIDATE === 'v2' ? V2 : null;
const OUT = CAND ? 'analysis/surfaces/ladder_calibration_v2' : 'analysis/surfaces/ladder_calibration';
const FX = ['audcad', 'audchf', 'audjpy', 'audnzd', 'audusd', 'cadchf', 'cadjpy', 'chfjpy', 'euraud', 'eurcad', 'eurchf', 'eurgbp',
  'eurjpy', 'eurnzd', 'eurusd', 'gbpaud', 'gbpcad', 'gbpchf', 'gbpjpy', 'gbpnzd', 'gbpusd', 'nzdcad', 'nzdjpy', 'nzdusd', 'usdcad', 'usdchf', 'usdjpy'];
const DEFAULT = [...FX.map(k => [k, k.toUpperCase()]), ['gold', 'GOLD'], ['nq', 'NQ'], ['spx500', 'SPX500'], ['us30', 'DOW'],
  ['us2000', 'US2000'], ['de30', 'DE30'], ['uk100', 'UK100']];
const args = process.argv.slice(2);
const JOBS = args.length ? Array.from({ length: args.length / 2 }, (_, i) => [args[2 * i], args[2 * i + 1]]) : DEFAULT;
const r4 = x => Math.round(x * 1e4) / 1e4;
fs.mkdirSync(OUT, { recursive: true });
const calendar = loadCalendarProxy();
const Q = ['oh', 'ol', 'hl', 'oc'], R = ['p50', 'p75', 'p90'];

for (const [key, SYM] of JOBS) {
  const t0 = Date.now();
  let packed;
  try { packed = await loadM1ForPair(key); } catch (e) { console.log(`${SYM}: load failed ${e.message}`); continue; }
  if (!packed?.n) { console.log(`${SYM}: no M1`); continue; }
  const assetClass = assetClassFor(key);
  const ctx = buildContext(packed, { sym: SYM, assetClass, tagFor: calendar(SYM) });
  const candEst = CAND ? paramsFor(SYM, assetClass, CAND).estimator : null;
  const head = ['inst', 'date', 'event', 'nbars', 'sigDaily', 'sigUsed', 'r_oh', 'r_ol', 'r_hl', 'r_oc',
    ...Q.flatMap(q => R.map(r => `${q}_${r}`))];
  const rows = [head.join(',')];
  for (const d of ctx.days) {
    const bars = d.bars;
    if (bars.length < 60) continue;
    let hi = -Infinity, lo = Infinity;
    for (const b of bars) { if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
    const o = d.open, c = bars[bars.length - 1].close, pc = x => r4(x / o * 100);
    let L = d.ladder;
    if (CAND) {
      const sig = forecastSigma(ctx.ny.slice(0, d.nyBarsUsed), candEst);
      if (!(sig > 0)) continue;
      L = buildLadder(sig, { instrument: SYM, assetClass, horizon: 'daily', eventTag: d.eventTag ?? 'unknown', ladderParams: CAND });
    }
    rows.push([SYM, d.date, d.eventTag ?? 'unknown', bars.length, r4(L.sigma_daily_pct), r4(L.sigma_used_pct),
      pc(hi - o), pc(o - lo), pc(hi - lo), pc(Math.abs(c - o)),
      ...Q.flatMap(q => R.map(r => r4(L[q]?.[r] ?? NaN)))].join(','));
  }
  fs.writeFileSync(path.join(OUT, `${SYM}.csv`), rows.join('\n') + '\n');
  console.log(`${SYM}${CAND ? ' [' + candEst + ']' : ''}: ${rows.length - 1} days, ${Math.round((Date.now() - t0) / 1000)} s`);
}
