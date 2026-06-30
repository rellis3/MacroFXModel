/**
 * Confluence Test (v2) — does genuine multi-source S/R confluence make price REACT?
 *
 * The first version was confounded: it counted every nearby fib-ladder line as
 * "confluence", so "3+ confluence" really meant "interior level in a dense grid"
 * — and interior levels churn while extremes revert, producing a spurious
 * "confluence → continuation" inversion. This version fixes the methodology:
 *
 *   1. DISTINCT SOURCE KINDS, ladder EXCLUDED. Confluence = how many *different
 *      kinds* of external reference (PDH/PDL, PWH/PWL, pivots, round numbers,
 *      daily opens, swing S&R, swing-fib clusters) sit within tolerance — NOT how
 *      many fib lines are nearby. A THREE-WAY split isolates the multi-swing-fib
 *      thesis so it can't be diluted into a generic count:
 *        fib(cluster)      — a swing_fib cluster aligns (the golden-pocket idea)
 *        confluent(no fib) — ≥2 distinct OTHER source kinds, no fib cluster
 *        plain(<2)         — neither
 *      The fib class answers "do multi-swing fib clusters specifically make price
 *      react" directly; the confluent class is generic overlap as the control.
 *   2. LOCATION-CONTROLLED. Results are bucketed by the level's fib band
 *      (core ≤1 / mid 1–2.5 / outer >2.5), and confluent-vs-plain is compared
 *      WITHIN each band — so the interior-vs-extreme effect can't masquerade as
 *      confluence.
 *   3. REACTION metric, not a one-step barrier. Reports mean BOUNCE toward the
 *      range mid (`excMid`, % of open) — "did price react at the zone" — alongside
 *      reversion rate and after-cost fade edge.
 *
 * Pure; no network. REUSES runRangeLineAnalyser (untouched) + levelSources +
 * perLineStrategy.pnlFor. Tested in js/telegramV2.test.mjs.
 */

import { runRangeLineAnalyser } from './rangeLineAnalyser.js';
import { bucketM1IntoSessions } from './forecastAnalyser.js';
import { pnlFor, costForPair, DEFAULT_COST_PCT, DEFAULT_SLIP_PCT } from './perLineStrategy.js';
import { collectLevels } from './levelSources.js';
import { pipSize as pipSizeOf } from './instrumentRegistry.js';

// External reference sources only — the fib ladder is deliberately NOT a partner
// (that was the density confound). Each contributes a distinct "kind" of S/R.
// swing_sr (N-bar pivots) and swing_fib (multi-swing fib confluence incl. the
// golden pocket) are the user's "where price actually reacts" hypothesis — each
// is one distinct kind, so a fib-cluster landing on a ladder line counts as one
// confluence source, not many.
const PARTNER_SOURCES = ['prior_hilo', 'pivots', 'round_number', 'daily_open', 'swing_sr', 'swing_fib'];

const bandOf = absFib => absFib <= 1 ? 'core(≤1)' : absFib <= 2.5 ? 'mid(1–2.5)' : 'outer(>2.5)';
const fibOf  = name => { const p = String(name).split('_'); return parseFloat(p[p.length - 1]); };

function sessionsToDailyBars(sessions) {
  return [...sessions.keys()].sort().map(date => {
    const b = sessions.get(date);
    let hi = -Infinity, lo = Infinity;
    for (const x of b) { if (x.high > hi) hi = x.high; if (x.low < lo) lo = x.low; }
    return { date, time: Math.floor(Date.parse(date + 'T00:00:00Z') / 1000), open: b[0].open, high: hi, low: lo, close: b[b.length - 1].close };
  });
}

/**
 * runConfluenceTest(sessions, assetClass, opts) →
 *   { tolPips, total, rows:[{key,band,conf,n,bounce,revRate,fadeExp}], cells }
 * where `cells` is the raw accumulator for pooling across pairs (mergeConfluence).
 *
 * opts: { instrument, pip?, conflTolPips=5, plus runRangeLineAnalyser opts }.
 */
export function runConfluenceTest(sessions, assetClass = 'fx', opts = {}) {
  const records = runRangeLineAnalyser(sessions, assetClass, opts);
  if (!records.length) return null;

  const instrument = opts.instrument ?? null;
  const pip = opts.pip ?? (instrument ? (() => { try { return pipSizeOf(instrument); } catch { return 0.0001; } })() : 0.0001);
  const tolPips = opts.conflTolPips ?? 5;
  const tol = tolPips * pip;
  const costPct = opts.costPct ?? (instrument ? costForPair(instrument, assetClass) : DEFAULT_COST_PCT[assetClass] ?? DEFAULT_COST_PCT.fx);
  const slipPct = opts.slipPct ?? DEFAULT_SLIP_PCT[assetClass] ?? DEFAULT_SLIP_PCT.fx;

  const dailyBars = sessionsToDailyBars(sessions);
  // External level sources as-of < each date → [{price, source}] (no lookahead).
  const lsCache = new Map();
  const lsPartners = (date) => {
    if (lsCache.has(date)) return lsCache.get(date);
    const prior = dailyBars.filter(b => b.date < date);
    let out = [];
    if (prior.length) {
      try {
        out = collectLevels({ dailyBars: prior, instrument: instrument ?? 'EUR/USD', pipSize: pip, price: prior[prior.length - 1].close }, PARTNER_SOURCES)
          .filter(l => Number.isFinite(l.price)).map(l => ({ price: l.price, source: l.source }));
      } catch { out = []; }
    }
    lsCache.set(date, out);
    return out;
  };

  const cells = {};   // key `${band} · ${conf}` → {n, sumBounce, reverted, sumFade}
  const bump = (key, bounce, reverted, fade) => {
    const c = cells[key] ??= { n: 0, sumBounce: 0, reverted: 0, sumFade: 0 };
    c.n++; c.sumBounce += bounce; c.reverted += reverted ? 1 : 0; c.sumFade += fade;
  };

  for (const rec of records) {
    const partners = lsPartners(rec.date);
    for (const ln of rec.lines) {
      // distinct SOURCE kinds within tolerance (the lesson's real "confluence")
      const kinds = new Set();
      for (const p of partners) if (Math.abs(p.price - ln.level) <= tol) kinds.add(p.source);
      // Three-way split that ISOLATES the multi-swing-fib thesis: a touch sitting on
      // a swing_fib cluster (which already requires ≥2 distinct swing pairs to exist)
      // is its own class, so its reaction can't be diluted into generic confluence.
      //   fib(cluster)      — a swing_fib cluster aligns (the user's golden-pocket idea)
      //   confluent(no fib) — ≥2 distinct OTHER source kinds, no fib cluster
      //   plain(<2)         — <2 sources, no fib cluster
      const hasFib = kinds.has('swing_fib');
      const others = [...kinds].filter(k => k !== 'swing_fib').length;
      const conf = hasFib ? 'fib(cluster)' : (others >= 2 ? 'confluent(no fib)' : 'plain(<2)');
      const band = bandOf(Math.abs(fibOf(ln.name)));

      const touch = { decidedBy: ln.decidedBy, side: ln.side, level: ln.level,
        innerLvl: ln.innerLvl, outerLvl: ln.outerLvl, closePx: rec.realized?.close ?? rec.open,
        open: rec.open, reverted: ln.outcome === 'reverted' };
      const fade = pnlFor(touch, 'fade', { costPct, slipPct });
      const bounce = ln.excMid ?? 0;   // max travel toward mid (% of open) = the reaction

      bump(`${band} · ${conf}`, bounce, touch.reverted, fade);
      bump(`ALL · ${conf}`,     bounce, touch.reverted, fade);   // location-pooled comparison
    }
  }

  return { tolPips, costPct: +costPct.toFixed(4), total: records.reduce((s, r) => s + r.lines.length, 0), cells, rows: fmtRows(cells) };
}

function fmtRows(cells) {
  return Object.entries(cells).map(([key, c]) => ({
    key, band: key.split(' · ')[0], conf: key.split(' · ')[1], n: c.n,
    bounce:  c.n ? +(c.sumBounce / c.n).toFixed(4) : 0,    // mean reaction toward mid, % of open
    revRate: c.n ? +(c.reverted / c.n * 100).toFixed(1) : 0,
    fadeExp: c.n ? +(c.sumFade / c.n).toFixed(4) : 0,
  })).sort((a, b) => a.key < b.key ? -1 : 1);
}

// One pair: packed M1 → bucketed sessions → confluence cells (mirrors touchesForPair).
export function confluenceForPair(packed, assetClass = 'fx', opts = {}) {
  const sessions = bucketM1IntoSessions(packed, opts.boundaryHour ?? 22);
  return runConfluenceTest(sessions, assetClass, opts);
}

// Pool per-pair cells into one table (sample-weighted via summed raw accumulators).
export function mergeConfluence(results) {
  const acc = {};
  for (const r of results) {
    if (!r?.cells) continue;
    for (const [key, c] of Object.entries(r.cells)) {
      const a = acc[key] ??= { n: 0, sumBounce: 0, reverted: 0, sumFade: 0 };
      a.n += c.n; a.sumBounce += c.sumBounce; a.reverted += c.reverted; a.sumFade += c.sumFade;
    }
  }
  return fmtRows(acc);
}
