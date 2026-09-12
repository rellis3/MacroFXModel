#!/usr/bin/env node
/**
 * Session-window comparison — the owner's own question (2026-09-12): the
 * Asia Fib Atlas strategy pulls its range from a fixed 00:00-06:00 London
 * window ("the range-extension lesson's Asia session"), draws the fib
 * ladder off it, flags levels within `confluenceThresholdPips` (2 pips for
 * FX) of the SAME window's ladder the day before as "strong", and holds that
 * ladder live until the next calendar day's SAME window rebuilds it. This
 * script asks: does that specific choice of window (quiet Asia session,
 * built while everything else is asleep) actually matter, or would pulling
 * the identical range/confluence/vote machinery from a DIFFERENT window —
 * London's own session, New York's own session, or an arbitrary "good time
 * to trade" stretch — do just as well, better, or worse, and is any of them
 * more CONSISTENT (stable year to year) rather than just higher on average?
 *
 * Every variant below is the EXACT SAME strategy (`asiaFibAtlasWalk` →
 * `buildAsiaFibAtlasBook` → `runBarrierWalkForward`'s vote-margin + optional
 * 2-pip-confluence gate) — only `startHour`/`asiaHrs` (i.e. which window
 * builds the range, and how long it runs) changes. This is possible with a
 * single new parameter (`startHour`, added 2026-09-12 to
 * `sessionRanges.buildAsiaSessions` and threaded through
 * `asiaFibAtlasWalk`) precisely BECAUSE the walk-window/lifetime logic was
 * already written in terms of `asia.epoch` (the window's own start), never
 * a hardcoded midnight — see that file's own doc for the mechanism.
 *
 * Data note: `loadM1ForPair` (js/volBacktestM1Engine.js) tries Cloudflare R2
 * first, and in THIS environment the R2-hosted parquet copies carry two
 * extra numeric columns before the datetime column (8 cols vs local disk's
 * 6) — that mismatch makes `loadM1ForPair`'s hardcoded `r[5]` datetime read
 * silently return an all-zero time axis (a genuine, pre-existing data
 * bug, not something this script works around by masking a real error).
 * This script uses `loadM1ForPairLocal` (js/localM1Loader.js) instead,
 * reading straight from the local `VolRangeForecaster/data/m1/` cache,
 * which has the correct 6-column schema.
 *
 *   node scripts/run_session_window_comparison.mjs [pairs...]
 *     (default: eurusd gbpusd usdjpy gold)
 */
import { loadM1ForPairLocal } from '../js/localM1Loader.js';
import { asiaFibAtlasWalk } from '../js/asiaFibAtlasEngine.js';
import { buildAsiaFibAtlasBook } from '../js/asiaFibAtlasReport.js';
import { runBarrierWalkForward } from '../js/asiaFibAtlasVoteReview.js';
import { applyConcurrencyCap } from '../js/levelAtlasVoteReview.js';
import { costForPair } from '../js/perLineStrategy.js';
import { writeFileSync } from 'fs';

const args = process.argv.slice(2);
const pairs = args.filter(a => !a.startsWith('-'));
const list = pairs.length ? pairs : ['eurusd', 'gbpusd', 'usdjpy', 'gold'];

// ── Session-window variants — same engine, different range-building window ──
// All hours are LONDON-LOCAL (DST-aware, same convention asiaFibAtlasEngine
// already uses throughout). Each variant's range is built over
// [startHour, startHour+hrs), then held live until the NEXT calendar day's
// SAME window starts building again (falls out of asia.epoch + 24h, not a
// separate rule) — exactly the owner's own "levels live to midnight when
// Asia starts building again" description, generalized to whichever window.
const VARIANTS = [
  { key: 'asia', label: 'Asia 00:00-06:00 (baseline)', startHour: 0, hrs: 6,
    note: 'the existing strategy: quiet, thin-liquidity session builds the range' },
  { key: 'london', label: 'London 07:00-16:00', startHour: 7, hrs: 9,
    note: "full London session builds the range; held through NY, Asia, back to London" },
  { key: 'ny', label: 'New York 13:00-21:00', startHour: 13, hrs: 8,
    note: 'full NY session builds the range; held through Asia, London, back to NY' },
  { key: 'morning', label: 'Morning 08:00-12:00', startHour: 8, hrs: 4,
    note: '"good time to trade" London morning window as the RANGE source' },
  { key: 'overlap', label: 'Overlap 13:00-17:00', startHour: 13, hrs: 4,
    note: 'London/NY overlap ("best liquidity") window as the RANGE source' },
  { key: 'control', label: 'Control 10:00-14:00', startHour: 10, hrs: 4,
    note: 'arbitrary mid-session window, no session-boundary rationale — a control group' },
];

// The two grid cells worth reporting per variant (mirrors
// scripts/run_asia_fib_atlas_vote_backtest.mjs's own grid): the unfiltered
// vote-margin baseline, and the owner's own actual ask — "grab the line with
// confluence" (margin=2, both dims agree, AND within 2 pips of the previous
// cycle's ladder).
const GRID = [
  { minMargin: 1, confluenceOnly: false, label: 'margin>=1, any' },
  { minMargin: 2, confluenceOnly: true, label: 'margin=2, confluence<=2p (the owner\'s strategy)' },
];

function linRegSlope(ys) {
  const n = ys.length;
  if (n < 2) return null;
  const xs = ys.map((_, i) => i);
  const xbar = xs.reduce((a, b) => a + b, 0) / n, ybar = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - xbar; sxx += dx * dx; sxy += dx * (ys[i] - ybar); }
  return sxx > 1e-9 ? sxy / sxx : null;
}

const results = {};   // variantKey -> pair -> gridLabel -> { overall, byYear, tradesUsed }

for (const pair of list) {
  const t0 = Date.now();
  const packed = await loadM1ForPairLocal(pair);
  if (!packed?.n) { console.log(`\n=== ${pair}: no local M1 ===`); continue; }
  const assetClass = pair === 'gold' ? 'commodity' : 'fx';
  const cost = costForPair(pair, assetClass);
  console.log(`\n\n################ ${pair.toUpperCase()} (loaded ${((Date.now() - t0) / 1000).toFixed(1)}s, cost=${cost}%) ################`);

  for (const v of VARIANTS) {
    const tw = Date.now();
    const { touches, coverage } = asiaFibAtlasWalk(packed, {
      instrument: pair.toUpperCase(), assetClass, rearmFracs: [0.3],
      startHour: v.startHour, asiaHrs: v.hrs,
    });
    if (!touches.length) { console.log(`\n--- ${v.label}: no touches ---`); continue; }
    const book = buildAsiaFibAtlasBook(touches, { rearmFrac: 0.3 });
    const walkMs = Date.now() - tw;
    if (!book) { console.log(`\n--- ${v.label}: no book (too few touches) ---`); continue; }

    console.log(`\n--- ${v.label} — ${touches.length} touches, ${coverage.sessions} sessions [${coverage.from}..${coverage.to}], walk ${walkMs}ms ---`);
    (results[v.key] ??= {})[pair] ??= {};

    for (const g of GRID) {
      const wf = runBarrierWalkForward(touches, book, { rearmFrac: 0.3, cost, minMargin: g.minMargin, confluenceOnly: g.confluenceOnly });
      if (!wf || !wf.tradesUsed) { console.log(`  ${g.label.padEnd(40)} 0 trades`); continue; }
      const o = wf.overall;
      const years = Object.keys(wf.byYear).sort();
      const yearSharpes = years.map(y => wf.byYear[y].sharpe);
      const yearWinRates = years.map(y => wf.byYear[y].winRate);
      const positiveYears = years.filter(y => wf.byYear[y].totalPnl > 0).length;
      const slope = linRegSlope(yearSharpes);
      console.log(`  ${g.label.padEnd(40)} RAW    n=${String(wf.tradesUsed).padStart(5)}  winRate=${String(o.winRate).padStart(5)}%  Sharpe=${String(o.sharpe).padStart(7)}±${o.sharpeSE}  totalPnl=${String(o.totalPnl).padStart(8)}%  maxDD=${String(o.maxDD).padStart(7)}%  PF=${o.profitFactor}  |  ${positiveYears}/${years.length} positive yrs, Sharpe trend/yr=${slope != null ? slope.toFixed(2) : 'n/a'}`);

      // Same-day-clustering-aware view (max 1 open position at a time) — the
      // repo's own standing caveat on any raw Sharpe here (LEGO_MODULES.md:
      // uncapped concurrency roughly halved EURUSD's reported Sharpe on the
      // original Asia-only strategy once checked). Reported alongside RAW,
      // never in its place, so a variant that only "wins" via overlapping
      // same-day trades is visible as such.
      const trades = wf.trades ?? [];
      const capped = applyConcurrencyCap(trades, { maxConcurrent: 1 });
      let cappedPositiveYears = 0;
      if (capped) {
        const c = capped.keptSummary;
        const byYearTrades = {};
        for (const t of capped.kept) (byYearTrades[t.date.slice(0, 4)] ??= []).push(t);
        const cyears = Object.keys(byYearTrades).sort();
        cappedPositiveYears = cyears.filter(y => byYearTrades[y].reduce((s, t) => s + t.pnlPct, 0) > 0).length;
        console.log(`  ${''.padEnd(40)} CAP    n=${String(c.trades).padStart(5)}  winRate=${String(c.winRate).padStart(5)}%  Sharpe=${String(c.sharpe).padStart(7)}±${c.sharpeSE}  totalPnl=${String(c.totalPnl).padStart(8)}%  maxDD=${String(c.maxDD).padStart(7)}%  PF=${c.profitFactor}  (skipped ${capped.skippedCount}/${capped.totalCount})`);
      }

      results[v.key][pair][g.label] = {
        overall: o, byYear: wf.byYear, tradesUsed: wf.tradesUsed,
        positiveYears, totalYears: years.length, sharpeTrendSlope: slope,
        yearSharpes: Object.fromEntries(years.map((y, i) => [y, yearSharpes[i]])),
        yearWinRates: Object.fromEntries(years.map((y, i) => [y, yearWinRates[i]])),
        capped: capped ? { overall: capped.keptSummary, positiveYears: cappedPositiveYears, skippedCount: capped.skippedCount, totalCount: capped.totalCount } : null,
      };
    }
  }
}

const outPath = new URL('../analysis/session_window_comparison_results.json', import.meta.url);
writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), pairs: list, variants: VARIANTS, grid: GRID, results }, null, 2));
console.log(`\n\nResults written to ${outPath.pathname}`);

// ── Pooled cross-pair summary per variant × grid cell ────────────────────────
console.log('\n\n================ POOLED CROSS-PAIR SUMMARY (per variant) ================');
for (const v of VARIANTS) {
  const perPair = results[v.key] ?? {};
  console.log(`\n--- ${v.label} (${v.note}) ---`);
  for (const g of GRID) {
    const rows = Object.entries(perPair).map(([pair, byGrid]) => [pair, byGrid[g.label]]).filter(([, r]) => r);
    if (!rows.length) { console.log(`  ${g.label.padEnd(40)} no data`); continue; }
    const totalTrades = rows.reduce((s, [, r]) => s + r.tradesUsed, 0);
    const avgSharpe = rows.reduce((s, [, r]) => s + r.overall.sharpe, 0) / rows.length;
    const avgWinRate = rows.reduce((s, [, r]) => s + r.overall.winRate, 0) / rows.length;
    const avgPosYearFrac = rows.reduce((s, [, r]) => s + r.positiveYears / r.totalYears, 0) / rows.length;
    const avgSlope = rows.reduce((s, [, r]) => s + (r.sharpeTrendSlope ?? 0), 0) / rows.length;
    const cappedRows = rows.filter(([, r]) => r.capped);
    const avgCappedSharpe = cappedRows.length ? cappedRows.reduce((s, [, r]) => s + r.capped.overall.sharpe, 0) / cappedRows.length : null;
    console.log(`  ${g.label.padEnd(40)} pairs=${rows.length}  totalTrades=${totalTrades}  avgSharpe(raw)=${avgSharpe.toFixed(2)}  avgSharpe(capped)=${avgCappedSharpe != null ? avgCappedSharpe.toFixed(2) : 'n/a'}  avgWinRate=${avgWinRate.toFixed(1)}%  avgPositiveYearFrac=${(avgPosYearFrac * 100).toFixed(0)}%  avgSharpeTrend/yr=${avgSlope.toFixed(2)}`);
  }
}
