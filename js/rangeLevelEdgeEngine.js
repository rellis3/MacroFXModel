// Range-Level edge test — I/O engine.
//
// Does a 5m range level have ANY standalone edge vs a placebo (same level shifted to
// the wrong price)? No macro, no z, no confidence — just: does price respect the level.
// Reuses the z-engine's M1 loader + Asia-range analyzer (no copies) and the pure race
// core. Built + unit-tested (core); the real run needs M1 data on Railway.

import { loadM1ForPair } from './volBacktestM1Engine.js';
import { ZSCORE_PAIRS, buildDayIndex, analyzeDay } from './zscoreSpreadEngine.js';
import {
  RANGE_LEVEL_DEFAULTS, buildLadder, findConfluence, mulberry32, barrierRace,
  summarizeRace, edgeVsPlacebo, splitByDate,
} from './rangeLevelCore.js';

export { ZSCORE_PAIRS, RANGE_LEVEL_DEFAULTS };

// First bar in [from,to) whose range straddles the level.
function firstTouch(highs, lows, from, to, level) {
  for (let i = from; i < to; i++) if (lows[i] <= level && highs[i] >= level) return i;
  return -1;
}

// One level → a race record (or null if never touched / can't resolve approach side).
function raceLevel(packed, winStart, winEnd, level, D, Dpips, raceBars, date, type) {
  const { highs, lows, closes } = packed;
  const ti = firstTouch(highs, lows, winStart, winEnd, level);
  if (ti < 0) return { date, type, outcome: 'none', Dpips };
  // approach side: price above the level just before the touch → fell to it → bounce is UP.
  const ref = ti > winStart ? closes[ti - 1] : packed.opens[ti];
  const reversionUp = ref > level;
  const endIdx = Math.min(winEnd - 1, ti + raceBars);
  const outcome = barrierRace(highs, lows, ti, endIdx, level, reversionUp, D);
  return { date, type, outcome, Dpips };
}

export async function runRangeLevelEdge(pairKey, opts = {}) {
  const cfg = ZSCORE_PAIRS[pairKey];
  if (!cfg) throw new Error(`Unknown pair: ${pairKey}`);
  const pip = cfg.pip;
  const dateFrom = opts.dateFrom || '2018-01-01';
  const dateTo   = opts.dateTo   || new Date().toISOString().substring(0, 10);
  const tolPips   = opts.confluenceTolPips ?? RANGE_LEVEL_DEFAULTS.confluenceTolPips;
  const barrierFrac = opts.barrierFrac ?? RANGE_LEVEL_DEFAULTS.barrierFrac;
  const spreadPips = opts.spreadPips ?? RANGE_LEVEL_DEFAULTS.spreadPips;
  const splitFrac  = opts.splitFrac ?? RANGE_LEVEL_DEFAULTS.splitFrac;
  const raceBars   = opts.raceMinutes ?? 240;   // M1 bars (~4h) to resolve the race
  const pMin = opts.placeboMinPips ?? RANGE_LEVEL_DEFAULTS.placeboMinPips;
  const pMax = opts.placeboMaxPips ?? RANGE_LEVEL_DEFAULTS.placeboMaxPips;

  const packed = await loadM1ForPair(pairKey);
  if (!packed) throw new Error(`No M1 data available for ${pairKey} — check R2 credentials or local parquet cache`);

  const dayIndex = [...buildDayIndex(packed.times).entries()]
    .filter(([d]) => d >= dateFrom && d <= dateTo)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));

  const rng = mulberry32(0x9e3779b9 ^ pairKey.length ^ (pairKey.charCodeAt(0) || 0));
  const records = [];   // { date, type: 'edge'|'confluence'|'placebo', outcome, Dpips }
  let prevAsia = null;

  for (const [date, { start, end }] of dayIndex) {
    // entryWindow=16 → winStart at 06:00, winEnd at 22:00 UTC.
    const { asia, winStart, winEnd } = analyzeDay(
      packed.times, packed.opens, packed.highs, packed.lows, packed.closes, start, end, 16);
    if (!asia.complete || winStart === -1) { prevAsia = asia.complete ? asia : prevAsia; continue; }

    const D = barrierFrac * asia.range;
    const Dpips = D / pip;
    if (!(D > 0)) { prevAsia = asia; continue; }

    // real levels: today's raw Asia edges + today∩yesterday fib confluence
    const levels = [{ price: asia.hi, type: 'edge' }, { price: asia.lo, type: 'edge' }];
    if (prevAsia && prevAsia.complete) {
      const conf = findConfluence(buildLadder(asia.lo, asia.range), buildLadder(prevAsia.lo, prevAsia.range), tolPips * pip);
      for (const c of conf) levels.push({ price: c.price, type: 'confluence' });
    }

    for (const lv of levels) {
      records.push(raceLevel(packed, winStart, winEnd, lv.price, D, Dpips, raceBars, date, lv.type));
      // placebo: same level shifted to a random nearby price (same distance profile, wrong spot)
      const shift = (pMin + rng() * (pMax - pMin)) * pip * (rng() < 0.5 ? -1 : 1);
      records.push(raceLevel(packed, winStart, winEnd, lv.price + shift, D, Dpips, raceBars, date, 'placebo'));
    }
    prevAsia = asia;
  }

  const byType = type => records.filter(r => r.type === type);
  const blocks = (recs) => {
    const { is, oos } = splitByDate(recs, splitFrac);
    return { all: summarizeRace(recs, { spreadPips }), is: summarizeRace(is, { spreadPips }), oos: summarizeRace(oos, { spreadPips }) };
  };
  const edge = blocks(byType('edge'));
  const confluence = blocks(byType('confluence'));
  const placebo = blocks(byType('placebo'));

  return {
    pair: cfg.label, pairDisplay: cfg.pairDisplay,
    edge, confluence, placebo,
    vsPlacebo: {
      edge:       edgeVsPlacebo(edge.oos, placebo.oos),
      confluence: edgeVsPlacebo(confluence.oos, placebo.oos),
    },
    nDays: dayIndex.length,
  };
}

export async function runFullRangeLevelEdge(opts = {}, pairKeys = Object.keys(ZSCORE_PAIRS)) {
  const perPair = {};
  const log = [];
  for (const pairKey of pairKeys) {
    try {
      const r = await runRangeLevelEdge(pairKey, opts);
      perPair[pairKey] = r;
      log.push({ pair: r.pair, ok: true, nDays: r.nDays });
    } catch (e) {
      log.push({ pair: pairKey, error: e?.message || String(e) });
    }
  }
  // pooled OOS read: average bounce rates + real-minus-placebo deltas across pairs
  const rs = Object.values(perPair);
  const avg = (get) => { const xs = rs.map(get).filter(Number.isFinite); return xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : null; };
  const pooled = {
    pairs: rs.length,
    edgeBounceOos:       avg(r => r.edge.oos.bounceRate),
    confluenceBounceOos: avg(r => r.confluence.oos.bounceRate),
    placeboBounceOos:    avg(r => r.placebo.oos.bounceRate),
    edgeDelta:       avg(r => r.vsPlacebo.edge.bounceRateDelta),
    confluenceDelta: avg(r => r.vsPlacebo.confluence.bounceRateDelta),
    edgeExpectancyOos:       avg(r => r.edge.oos.expectancyPips),
    confluenceExpectancyOos: avg(r => r.confluence.oos.expectancyPips),
    pairsConfluenceBeatsPlacebo: rs.filter(r => (r.vsPlacebo.confluence.bounceRateDelta ?? 0) > 0).length,
  };
  return { perPair, pooled, log };
}
