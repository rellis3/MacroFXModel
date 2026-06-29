/**
 * Confluence Test — does "confluence amplify probability"? A pure backtest that
 * tags every historical session-fib touch with how many INDEPENDENT sources align
 * at its price, then reports reversion rate + after-cost fade expectancy per
 * confluence bucket (solo vs 2-source vs 3+). Answers the trading-lesson claim
 * with data instead of assertion — it does NOT change the live v2 policy.
 *
 * Partner sources counted as "confluence" for a level on day D:
 *   • cross-session: the OTHER lines in the same session (Asia × Monday overlap),
 *   • prior sessions: every line from the previous `lookbackDays` sessions,
 *   • levelSources (daily-only): PDH/PDL, PWH/PWL, classic pivots, round numbers,
 *     daily opens — all as of < D (no lookahead).
 *
 * REUSES, never copies: runRangeLineAnalyser (the touch/outcome engine, untouched),
 * perLineStrategy.pnlFor (after-cost triple-barrier PnL), levelSources.collectLevels,
 * confluenceCount. Pure; no network. Tested in js/telegramV2.test.mjs.
 */

import { runRangeLineAnalyser } from './rangeLineAnalyser.js';
import { bucketM1IntoSessions } from './forecastAnalyser.js';
import { pnlFor, costForPair, DEFAULT_COST_PCT, DEFAULT_SLIP_PCT } from './perLineStrategy.js';
import { collectLevels } from './levelSources.js';
import { pipSize as pipSizeOf } from './instrumentRegistry.js';
import { countWithin, confluenceBucket } from './confluenceCount.js';

// Daily-only level sources (no intraday needed) used as confluence partners.
const PARTNER_SOURCES = ['prior_hilo', 'pivots', 'round_number', 'daily_open'];

// Daily OHLC from the M1 sessions, chronological, with epoch-second time for levelSources.
function sessionsToDailyBars(records, sessions) {
  const dates = [...sessions.keys()].sort();
  return dates.map(date => {
    const b = sessions.get(date);
    let hi = -Infinity, lo = Infinity;
    for (const x of b) { if (x.high > hi) hi = x.high; if (x.low < lo) lo = x.low; }
    return { date, time: Math.floor(Date.parse(date + 'T00:00:00Z') / 1000), open: b[0].open, high: hi, low: lo, close: b[b.length - 1].close };
  });
}

/**
 * runConfluenceTest(sessions, assetClass, opts) →
 *   { tolPips, lookbackDays, total, buckets:[{bucket,n,reversionRate,fadeExp}], bySource }
 *
 * opts: { instrument, pip?, conflTolPips=5, lookbackDays=3, costPct?, slipPct?,
 *         plus everything runRangeLineAnalyser accepts (sources, asiaHrs, …) }.
 */
export function runConfluenceTest(sessions, assetClass = 'fx', opts = {}) {
  const records = runRangeLineAnalyser(sessions, assetClass, opts);
  if (!records.length) return null;

  const instrument = opts.instrument ?? null;
  const pip = opts.pip ?? (instrument ? (() => { try { return pipSizeOf(instrument); } catch { return 0.0001; } })() : 0.0001);
  const tolPips = opts.conflTolPips ?? 5;
  const tol = tolPips * pip;
  const lookbackDays = opts.lookbackDays ?? 3;
  const costPct = opts.costPct ?? (instrument ? costForPair(instrument, assetClass) : DEFAULT_COST_PCT[assetClass] ?? DEFAULT_COST_PCT.fx);
  const slipPct = opts.slipPct ?? DEFAULT_SLIP_PCT[assetClass] ?? DEFAULT_SLIP_PCT.fx;

  const dailyBars = sessionsToDailyBars(records, sessions);
  // levelSources partner prices per record-date (as of < that date).
  const lsCache = new Map();
  const lsPartners = (date) => {
    if (lsCache.has(date)) return lsCache.get(date);
    const prior = dailyBars.filter(b => b.date < date);
    let prices = [];
    if (prior.length) {
      try {
        prices = collectLevels({ dailyBars: prior, instrument: instrument ?? 'EUR/USD', pipSize: pip, price: prior[prior.length - 1].close }, PARTNER_SOURCES)
          .map(l => l.price).filter(Number.isFinite);
      } catch { prices = []; }
    }
    lsCache.set(date, prices);
    return prices;
  };

  const mk = () => ({ n: 0, reverted: 0, sumFade: 0 });
  const buckets = { '0·solo': mk(), '1·pair': mk(), '2·triple+': mk() };
  const bySource = {};   // 'A' | 'M' → same shape, keyed by bucket

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const priorLevels = [];
    for (let j = Math.max(0, i - lookbackDays); j < i; j++) for (const ln of records[j].lines) priorLevels.push(ln.level);
    const lsHere = lsPartners(rec.date);

    for (const ln of rec.lines) {
      const partners = [
        ...rec.lines.filter(o => o !== ln).map(o => o.level),   // cross-session, same day
        ...priorLevels,                                          // prior sessions
        ...lsHere,                                               // daily levelSources
      ];
      const conflN = countWithin(ln.level, partners, tol);
      const bucket = confluenceBucket(conflN);

      const touch = { decidedBy: ln.decidedBy, side: ln.side, level: ln.level,
        innerLvl: ln.innerLvl, outerLvl: ln.outerLvl, closePx: rec.realized?.close ?? rec.open,
        open: rec.open, reverted: ln.outcome === 'reverted' };
      const fade = pnlFor(touch, 'fade', { costPct, slipPct });

      const b = buckets[bucket];
      b.n++; b.reverted += touch.reverted ? 1 : 0; b.sumFade += fade;

      const src = ln.name?.[0] === 'M' ? 'M' : 'A';
      const bs = (bySource[src] ??= { '0·solo': mk(), '1·pair': mk(), '2·triple+': mk() });
      const bb = bs[bucket]; bb.n++; bb.reverted += touch.reverted ? 1 : 0; bb.sumFade += fade;
    }
  }

  const fmt = obj => Object.entries(obj).map(([bucket, b]) => ({
    bucket, n: b.n,
    reversionRate: b.n ? +(b.reverted / b.n * 100).toFixed(1) : 0,
    fadeExp: b.n ? +(b.sumFade / b.n).toFixed(4) : 0,
  }));

  const total = Object.values(buckets).reduce((s, b) => s + b.n, 0);
  return {
    tolPips, lookbackDays, costPct: +costPct.toFixed(4), total,
    buckets: fmt(buckets),
    bySource: Object.fromEntries(Object.entries(bySource).map(([k, v]) => [k, fmt(v)])),
  };
}

// One pair: packed M1 → bucketed sessions → confluence table (mirrors touchesForPair).
export function confluenceForPair(packed, assetClass = 'fx', opts = {}) {
  const sessions = bucketM1IntoSessions(packed, opts.boundaryHour ?? 22);
  return runConfluenceTest(sessions, assetClass, opts);
}

// Combine per-pair confluence-test results into one pooled table (server route uses this).
export function mergeConfluence(results) {
  const acc = { '0·solo': { n: 0, rw: 0, ew: 0 }, '1·pair': { n: 0, rw: 0, ew: 0 }, '2·triple+': { n: 0, rw: 0, ew: 0 } };
  for (const r of results) {
    if (!r?.buckets) continue;
    for (const b of r.buckets) {
      const a = acc[b.bucket]; if (!a) continue;
      a.n += b.n; a.rw += b.reversionRate * b.n; a.ew += b.fadeExp * b.n;   // sample-weighted
    }
  }
  return Object.entries(acc).map(([bucket, a]) => ({
    bucket, n: a.n,
    reversionRate: a.n ? +(a.rw / a.n).toFixed(1) : 0,
    fadeExp: a.n ? +(a.ew / a.n).toFixed(4) : 0,
  }));
}
