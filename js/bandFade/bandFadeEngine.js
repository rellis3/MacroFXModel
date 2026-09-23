// bandFade/bandFadeEngine.js — I/O + orchestration for the daily band-fade test.
// Pre-registration: MD files/BAND_FADE_DAILY.md. Pure logic: ./bandFade.js.
// Reads M1 (R2 / local parquet) → UTC-day bars; writes nothing anywhere.
// Read-only research: feeds no live signal, bot or order.

import { loadM1ForPair } from '../volBacktestM1Engine.js';
import { costForPair } from '../perLineStrategy.js';
import { mulberry32 } from '../statsCore.js';
import { systemMetrics, byPeriod, readSystem } from '../mve/bookSystem.js';
import {
  BAND_FADE_DEFAULTS, dailyBarsFromPacked, bandFeatures, unionCalendar, bucketTest, outsideCell, stackTest,
  shuffledNull, readBucket, alignPanel, covSeries, fadeSchedule, runSizedBook, randomSchedule,
} from './bandFade.js';

export const BAND_FADE_UNIVERSE = [
  'eurusd', 'gbpusd', 'usdjpy', 'usdchf', 'usdcad', 'audusd', 'nzdusd',
  'eurgbp', 'eurjpy', 'eurchf', 'euraud', 'eurcad', 'eurnzd',
  'gbpjpy', 'gbpchf', 'gbpaud', 'gbpcad', 'gbpnzd',
  'audjpy', 'cadjpy', 'chfjpy', 'nzdjpy', 'audnzd', 'audcad', 'audchf',
  'gold',
];
const assetClass = k => (k === 'gold' ? 'commodity' : 'fx');

// bars are loaded once per process and reused (a rerun only re-walks the daily data)
let _barsCache = null;
export async function loadDailyBars({ universe = BAND_FADE_UNIVERSE, dropFromDate = null, log = () => {} } = {}) {
  if (_barsCache && _barsCache.key === universe.join(',') + '|' + dropFromDate) return _barsCache.bars;
  const bars = {};
  for (const k of universe) {
    const packed = await loadM1ForPair(k);
    if (!packed) { log(`${k}: no M1 — skipped`); continue; }
    let b = dailyBarsFromPacked(packed);
    if (dropFromDate) b = b.filter(x => x.date < dropFromDate);
    bars[k] = b;
    log(`${k}: ${b.length} daily bars ${b[0]?.date} → ${b[b.length - 1]?.date}`);
  }
  _barsCache = { key: universe.join(',') + '|' + dropFromDate, bars };
  return bars;
}

const pick = (m, keys) => Object.fromEntries(keys.map(k => [k, m[k]]));

export async function runBandFade(opts = {}) {
  const o = { ...BAND_FADE_DEFAULTS, ...(opts.config || {}) };
  const progress = opts.progress || (() => {});
  const todayUtc = new Date().toISOString().slice(0, 10);
  const bars = opts.bars || await loadDailyBars({ universe: opts.universe || BAND_FADE_UNIVERSE, dropFromDate: todayUtc, log: progress });
  const insts = Object.entries(bars).map(([key, b]) => ({ key, costRtPct: costForPair(key, assetClass(key)), f: bandFeatures(b, o) }));
  const cal = unionCalendar(insts);
  const splitDate = cal[Math.floor(cal.length * o.splitFrac)];
  const H = o.primaryH;

  // ── stage 1 ──
  progress('stage 1: bucket tests');
  const primaryCell = outsideCell(insts, { h: H, cal, splitDate, band: o.band });
  progress(`stage 1: shuffled null (${o.nullDraws} draws)`);
  const nullDist = shuffledNull(insts, { h: H, cal, splitDate, band: o.band, draws: o.nullDraws, seed: o.seed, o });
  const bucketReading = readBucket(primaryCell, nullDist);
  const fx = insts.filter(x => x.key !== 'gold'), gold = insts.filter(x => x.key === 'gold');
  const stage1 = {
    primary: { cell: 'vol band, h=5, |z| ≥ 2', ...primaryCell, null: nullDist, reading: bucketReading },
    buckets: Object.fromEntries(o.horizons.map(h => [`h${h}`, bucketTest(insts, { h, cal, splitDate, stretchKey: 'z' })])),
    context: {
      volBand_h1: outsideCell(insts, { h: 1, cal, splitDate, band: o.band }),
      volBand_h10: outsideCell(insts, { h: 10, cal, splitDate, band: o.band }),
      keltner_h5: outsideCell(insts, { h: H, cal, splitDate, stretchKey: 'kz', band: o.band }),
      bollinger_h5: outsideCell(insts, { h: H, cal, splitDate, stretchKey: 'bz', band: o.band }),
      adxLow_h5: outsideCell(insts, { h: H, cal, splitDate, band: o.band, filter: (inst, t) => inst.f.adx[t] < o.adxThreshold }),
      adxHigh_h5: outsideCell(insts, { h: H, cal, splitDate, band: o.band, filter: (inst, t) => inst.f.adx[t] >= o.adxThreshold }),
      fxOnly_h5: outsideCell(fx, { h: H, cal, splitDate, band: o.band }),
      goldOnly_h5: gold.length ? outsideCell(gold, { h: H, cal, splitDate, band: o.band }) : null,
    },
    keltnerBuckets_h5: bucketTest(insts, { h: H, cal, splitDate, stretchKey: 'kz' }),
    bollingerBuckets_h5: bucketTest(insts, { h: H, cal, splitDate, stretchKey: 'bz' }),
    stack_h5: stackTest(insts, { h: H, cal, splitDate, band: o.band }),
    perInstrument: insts.map(x => ({ key: x.key, costRtPct: x.costRtPct, ...outsideCell([x], { h: H, cal, splitDate, band: o.band }) })),
    contextCellsCounted: 8 + 2 + 4,
  };

  // ── stage 2 ──
  progress('stage 2: sized book');
  const panel = alignPanel(insts, cal);
  const cov = covSeries(panel, o.covWindow);
  const costOneWay = insts.map(x => x.costRtPct / 100 / 2);
  const schedule = fadeSchedule(panel, o);
  const prim = runSizedBook({ panel, cov, schedule, costOneWay, o });
  const cost2 = runSizedBook({ panel, cov, schedule, costOneWay: costOneWay.map(c => 2 * c), o, withTrades: false });
  const k = Math.max(0, prim.dates.findIndex(d => d >= splitDate));
  const met = (res, lo, hi, extra = {}) => systemMetrics(res.net.slice(lo, hi), res.dates.slice(lo, hi), extra);
  const tradesIn = (lo, hi) => prim.trades.filter(t => t.entryDate >= lo && (!hi || t.entryDate < hi));
  const full = met(prim, 0, undefined, { leverage: prim.leverage, costs: prim.costs, trades: prim.trades, usdShare: prim.usdShare });
  const is = met(prim, 0, k, { leverage: prim.leverage.slice(0, k), costs: prim.costs.slice(0, k), trades: tradesIn('', splitDate) });
  const oos = met(prim, k, undefined, { leverage: prim.leverage.slice(k), costs: prim.costs.slice(k), trades: tradesIn(splitDate) });
  const full2x = met(cost2, 0);
  const grossOnly = systemMetrics(prim.gross, prim.dates);

  progress(`stage 2: random-entry control (${o.controlDraws} draws)`);
  const rng = mulberry32(o.seed ^ 0xc0ffee);
  const ctrl = [];
  for (let d = 0; d < o.controlDraws; d++) {
    const rs = randomSchedule(panel, schedule, rng);
    const b = runSizedBook({ panel, cov, schedule: rs, costOneWay, o, withTrades: false });
    ctrl.push(systemMetrics(b.net, b.dates).sharpe);
  }
  ctrl.sort((a, b) => a - b);
  const q = p => ctrl[Math.min(ctrl.length - 1, Math.floor(p * ctrl.length))];
  const control = { draws: ctrl.length, p05: q(0.05), p50: q(0.5), p95: q(0.95), rankOfFade: ctrl.filter(s => s < full.sharpe).length / ctrl.length };

  const sys = readSystem(full, is, oos, full2x);
  const checks = { stage1BucketEdge: bucketReading.verdict === 'BUCKET-EDGE', ...sys.checks, beatsRandomControl95: full.sharpe > control.p95 };
  const verdict = Object.values(checks).every(Boolean) ? 'SYSTEM-WORTHY' : 'NOT-YET';

  let eq = 1, peak = 1;
  const curve = prim.net.map((r, i) => { eq *= 1 + r; peak = Math.max(peak, eq); return { d: prim.dates[i], eq: +eq.toFixed(5), dd: +((eq / peak - 1) * 100).toFixed(3) }; });
  const exitMix = {};
  for (const t of prim.trades) exitMix[t.exitReason] = (exitMix[t.exitReason] || 0) + 1;

  return {
    ok: true, generatedAt: new Date().toISOString(), doc: 'MD files/BAND_FADE_DAILY.md',
    config: pick(o, ['emaSpan', 'ewmaLambda', 'band', 'entryZ', 'rearmZ', 'maxHold', 'targetVol', 'maxGross', 'covWindow', 'splitFrac', 'nullDraws', 'controlDraws']),
    universe: insts.map(x => ({ key: x.key, costRtPct: x.costRtPct, bars: x.f.dates.length, from: x.f.dates[0], to: x.f.dates[x.f.dates.length - 1] })),
    splitDate, calendar: { from: cal[0], to: cal[cal.length - 1], days: cal.length },
    stage1,
    stage2: {
      verdict, checks, control, exitMix,
      metrics: { full, is, oos, full2x, grossNoCost: grossOnly },
      yearly: byPeriod(prim.dates, prim.net, 4), monthly: byPeriod(prim.dates, prim.net, 7),
      curve, trades: prim.trades,
    },
  };
}
