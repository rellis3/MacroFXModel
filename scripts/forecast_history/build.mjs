// STEP 0 — forecast history table (forge/FORECAST_HISTORY_SPEC.md, plans/LESSON_TARGET_REBUILD_PLAN.md).
// One row per instrument per London session: the export calculation point-in-time (walk-forward fold specs) and
// with today's live spec, plus what the candles did (London 00-22) and jump measures. Reads only; no live edits.
//   node scripts/forecast_history/build.mjs [fileKey SYM ...]
// Writes analysis/output/forecast_history/<SYM>.csv
import fs from 'fs';
import path from 'path';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { buildContext } from '../rangebook/common.mjs';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { forecastSigma } from '../../js/forecastSigma.js';
import { buildLadder, paramsFor } from '../../js/forecastLadder.js';

const OUT = 'analysis/output/forecast_history';
const FX = ['audcad', 'audchf', 'audjpy', 'audnzd', 'audusd', 'cadchf', 'cadjpy', 'chfjpy', 'euraud', 'eurcad', 'eurchf', 'eurgbp',
  'eurjpy', 'eurnzd', 'eurusd', 'gbpaud', 'gbpcad', 'gbpchf', 'gbpjpy', 'gbpnzd', 'gbpusd', 'nzdcad', 'nzdjpy', 'nzdusd', 'usdcad', 'usdchf', 'usdjpy'];
const DEFAULT = [...FX.map(k => [k, k.toUpperCase()]), ['gold', 'GOLD'], ['nq', 'NQ'], ['spx500', 'SPX500'], ['us30', 'DOW'],
  ['us2000', 'US2000'], ['de30', 'DE30'], ['uk100', 'UK100']];
const args = process.argv.slice(2);
const JOBS = args.length ? Array.from({ length: args.length / 2 }, (_, i) => [args[2 * i], args[2 * i + 1]]) : DEFAULT;

const Q = ['oh', 'ol', 'hl', 'oc'], R = ['p50', 'p75', 'p90'];
const WKEY = { hl: 'BM', oc: 'HN', oh: 'OH', ol: 'OL' };          // vol_report width_mult names -> ladder quantities
const TOUCH = [['OH', 'oh', 1], ['OL', 'ol', -1]];
const r4 = x => (x == null || !Number.isFinite(x)) ? '' : Math.round(x * 1e4) / 1e4;
const r6 = x => (x == null || !Number.isFinite(x)) ? '' : Math.round(x * 1e6) / 1e6;

// Walk-forward fold specs per instrument, converted to buildLadder's params shape.
const REPORT = JSON.parse(fs.readFileSync('forge/out_vol_lon/vol_report.json', 'utf8'));
function foldSpecs(key) {
  const rep = REPORT[key];
  if (!rep) return null;
  return rep.specs.map(s => ({
    fold: s.fold,
    trainedThrough: Date.parse(s.trained_through.replace(' ', 'T') + 'Z') / 1000,
    estimator: s.estimator,
    pair: { estimator: s.estimator, event: s.event_mult,
            width: Object.fromEntries(Q.map(q => [q, R.map(r => s.width_mult[`${WKEY[q]}_${r.toUpperCase()}`])])) },
  })).sort((a, b) => a.trainedThrough - b.trainedThrough);
}

// London midnight (UTC epoch s) for a London calendar date.
const _lonFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour12: false, hour: '2-digit' });
function londonMidnight(date) {
  const noonUtc = Date.parse(date + 'T12:00:00Z') / 1000;
  const lonHourAtNoon = +_lonFmt.format(new Date(noonUtc * 1000)) % 24;     // 12 (GMT) or 13 (BST)
  return Date.parse(date + 'T00:00:00Z') / 1000 - (lonHourAtNoon - 12) * 3600;
}

fs.mkdirSync(OUT, { recursive: true });
const calendar = loadCalendarProxy();

for (const [key, SYM] of JOBS) {
  const t0 = Date.now();
  const specs = foldSpecs(key);
  if (!specs) { console.log(`${SYM}: no fold specs in vol_report`); continue; }
  let packed;
  try { packed = await loadM1ForPair(key); } catch (e) { console.log(`${SYM}: load failed ${e.message}`); continue; }
  if (!packed?.n) { console.log(`${SYM}: no M1`); continue; }
  const assetClass = assetClassFor(key);
  const ctx = buildContext(packed, { sym: SYM, assetClass, tagFor: calendar(SYM) });

  const head = ['inst', 'date', 'oos', 'fold', 'est', 'event', 'cal_known', 'nbars', 'open',
    'pit_sig_daily', 'pit_sig_used', 'live_sig_daily', 'live_sig_used',
    ...Q.flatMap(q => R.map(r => `pit_${q}_${r}`)), ...Q.flatMap(q => R.map(r => `live_${q}_${r}`)),
    'r_oh', 'r_ol', 'r_hl', 'r_oc', 'r_ocs', 'min_high', 'min_low',
    ...TOUCH.flatMap(([n]) => R.map(r => `ft_${n}_${r}`)),
    ...Array.from({ length: 22 }, (_, i) => `oh_h${i + 1}`), ...Array.from({ length: 22 }, (_, i) => `ol_h${i + 1}`),
    'gap', 'rv5', 'bv5', 'jump_share', 'max_r5', 'min_max_r5', 'n5', 'last_min'];
  const rows = [head.join(',')];
  let dropped = 0, prevClose = null;

  for (const d of ctx.days) {
    const mid = londonMidnight(d.date), end22 = mid + 22 * 3600;
    const bars = d.bars.filter(b => b.time < end22);
    if (bars.length < 60) { dropped++; continue; }
    // the cache's final session can stop mid-day: an unfinished day is not a realised outcome
    if (d === ctx.days.at(-1) && bars.at(-1).time < mid + 21 * 3600) { dropped++; continue; }
    const o = d.open, pc = x => x / o * 100;

    // point-in-time spec: newest fold trained before this session's open
    let spec = null;
    for (const s of specs) if (s.trainedThrough < d.openSec) spec = s;
    const oos = spec ? 1 : 0;
    if (!spec) spec = specs[0];
    const sig = forecastSigma(ctx.ny.slice(0, d.nyBarsUsed), spec.estimator);
    if (!(sig > 0)) { dropped++; continue; }
    const pit = buildLadder(sig, { instrument: SYM, assetClass, horizon: 'daily', eventTag: d.eventTag ?? 'unknown',
                                   ladderParams: { pairs: { [SYM]: spec.pair } } });
    const live = d.ladder;                                  // v4Days: today's live spec, same days and tags

    // realised (London 00-22)
    let hi = -Infinity, lo = Infinity, kHi = 0, kLo = 0;
    for (let k = 0; k < bars.length; k++) {
      if (bars[k].high > hi) { hi = bars[k].high; kHi = k; }
      if (bars[k].low < lo) { lo = bars[k].low; kLo = k; }
    }
    const c = bars.at(-1).close;
    const minOf = k => Math.round((bars[k].time - mid) / 60);

    // first touch of the pit OH/OL lines
    const ft = [];
    for (const [, q, sg] of TOUCH) for (const r of R) {
      const lv = o * (1 + sg * pit[q][r] / 100);
      const k = bars.findIndex(b => sg > 0 ? b.high >= lv : b.low <= lv);
      ft.push(k < 0 ? '' : minOf(k));
    }

    // running OH / OL at the end of each London hour
    const ohH = [], olH = [];
    let rh = o, rl = o, k = 0;
    for (let h = 1; h <= 22; h++) {
      while (k < bars.length && bars[k].time < mid + h * 3600) { rh = Math.max(rh, bars[k].high); rl = Math.min(rl, bars[k].low); k++; }
      ohH.push(r4(pc(rh - o))); olH.push(r4(pc(o - rl)));
    }

    // 5-minute returns from M1 closes on the 5-minute grid; RV, bipower variation, largest move
    const c5 = []; let last = o;
    for (let g = 1, j = 0; g <= 22 * 12; g++) {
      const edge = mid + g * 300;
      while (j < bars.length && bars[j].time < edge) { last = bars[j].close; j++; }
      c5.push(last);
    }
    let rv = 0, bv = 0, mx = 0, mxAt = 0, n5 = 0, prev = Math.log(c5[0] / o);
    rv += prev * prev; n5++;
    for (let i = 1; i < c5.length; i++) {
      const r = Math.log(c5[i] / c5[i - 1]);
      rv += r * r; bv += Math.abs(r) * Math.abs(prev); prev = r; n5++;
      if (Math.abs(r) > Math.abs(mx)) { mx = r; mxAt = (i + 1) * 5; }
    }
    bv *= Math.PI / 2;
    const js = rv > 0 ? Math.max(0, rv - bv) / rv : null;

    rows.push([SYM, d.date, oos, spec.fold, spec.estimator, d.eventTag ?? 'unknown', d.eventTag == null ? 0 : 1, bars.length, r6(o),
      r4(pit.sigma_daily_pct), r4(pit.sigma_used_pct), r4(live.sigma_daily_pct), r4(live.sigma_used_pct),
      ...Q.flatMap(q => R.map(r => r4(pit[q]?.[r]))), ...Q.flatMap(q => R.map(r => r4(live[q]?.[r]))),
      r4(pc(hi - o)), r4(pc(o - lo)), r4(pc(hi - lo)), r4(pc(Math.abs(c - o))), r4(pc(c - o)), minOf(kHi), minOf(kLo),
      ...ft, ...ohH, ...olH,
      prevClose == null ? '' : r4(pc(o - prevClose)), r6(rv * 1e4), r6(bv * 1e4), r4(js), r4(mx * 100), mxAt, n5, minOf(bars.length - 1)].join(','));
    prevClose = c;
  }
  fs.writeFileSync(path.join(OUT, `${SYM}.csv`), rows.join('\n') + '\n');
  console.log(`${SYM}: ${rows.length - 1} sessions, dropped ${dropped}, ${Math.round((Date.now() - t0) / 1000)} s`);
}
