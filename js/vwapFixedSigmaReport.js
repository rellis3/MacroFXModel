/**
 * VWAP Fixed-Sigma Band Atlas — report layer. Turns `fixedSigmaWalk()`'s raw
 * touch records into the OOS-gated reference book, exactly the Level Atlas
 * report pattern: cell = (side, band), every dimension bucketed against the
 * out/back/neither race, IS/OOS split, and the SHARED `annotateHolds` gate
 * imported from levelAtlasReport.js (REFERENCE_ENGINE_PLAYBOOK.md §3.2 — one
 * gate function, no per-dimension special cases, never a second copy).
 *
 * NOT a screen: a 38% cell is a complete answer. Numeric outcome summaries
 * (MFE/MAE in σ, reach-VWAP rate, time to resolve) ride along per bucket so
 * the book answers the fade-sizing question descriptively, not just the race.
 *
 * Pure: touches[] in, tables out.
 */

import { annotateHolds } from './levelAtlasReport.js';

export const DIMENSIONS = [
  ['session', 'Session (Asia/London/NY)'],
  ['dow', 'Day of week'],
  ['dowSession', 'Day of week × session'],
  ['sessionPos', 'Position within the day (early/mid/late)'],
  ['overlapWindow', 'London/NY overlap (12:00-16:00 UTC)'],
  ['gapBucket', "Open gap from prior day's close (in fixed-σ units)"],
  ['volRegime', 'Fixed σ vs its own 60-session trailing median'],
  ['prevSessionVol', "Yesterday's realized RMS vs today's fixed σ"],
  ['vwapDrift', 'VWAP drift from the open, oriented to the touch side'],
  ['churn', 'How price got here: one-sided drive vs two-sided churn'],
  ['otherSideMaxBand', 'Deepest band already tagged on the OPPOSITE side today'],
  ['ladderStep', 'Band progression: retest / orderly next step / jump'],
  ['ordinal', 'Test number of this band today (1st/2nd/3rd…)'],
  ['approachVel', 'Approach velocity into the band'],
  ['approachER', 'Approach efficiency (driven vs choppy)'],
  ['wtState', 'WaveTrend state at touch (session TF)'],
  ['wtMtf', 'WaveTrend MTF agreement (15m/1h/4h)'],
  ['wtSlow', 'WaveTrend 1h stretch'],
  ['momAdx', '1h ADX trend/range'],
  ['htfTrend', '4h EMA trend vs the touch direction'],
  ['volClimax', 'Touch-bar tick-volume spike vs its own trailing average'],
  ['candleReject', 'Touch-bar wick rejection'],
  ['roundNum', "The band level's distance to the nearest round number"],
];
const DIM_LABEL = new Map(DIMENSIONS);

function splitAt(touches, frac = 0.6) {
  const sorted = [...touches].sort((a, b) => a.date.localeCompare(b.date));
  const cut = sorted[Math.floor(sorted.length * frac)]?.date;
  return { split: cut, is: touches.filter(t => t.date < cut), oos: touches.filter(t => t.date >= cut) };
}

// One dimension's table for one (side, band) cell. `outPct` is the field the
// shared holds-gate reads — here it is the continuation rate (reached the next
// band out before falling one band back).
function tableFor(touches, dimKey) {
  const groups = {};
  for (const t of touches) {
    const b = t[dimKey]; if (b == null) continue;
    const g = (groups[b] ??= { n: 0, out: 0, back: 0, neither: 0,
                               mfe: 0, mae: 0, vwapHits: 0, reentries: 0, mtr: [] });
    g.n++; g[t.outcome]++;
    g.mfe += t.mfeSigma; g.mae += t.maeSigma;
    if (t.reachedVwap) g.vwapHits++;
    if (t.reentered) g.reentries++;
    if (t.minsToResolve != null) g.mtr.push(t.minsToResolve);
  }
  const out = {};
  for (const [b, g] of Object.entries(groups)) {
    const mtrS = [...g.mtr].sort((x, y) => x - y);
    out[b] = {
      n: g.n,
      outPct: +(g.out / g.n * 100).toFixed(1),
      backPct: +(g.back / g.n * 100).toFixed(1),
      neitherPct: +(g.neither / g.n * 100).toFixed(1),
      avgMfeSigma: +(g.mfe / g.n).toFixed(2),
      avgMaeSigma: +(g.mae / g.n).toFixed(2),
      vwapPct: +(g.vwapHits / g.n * 100).toFixed(1),
      reentryPct: +(g.reentries / g.n * 100).toFixed(1),
      medMinsToResolve: mtrS.length ? mtrS[mtrS.length >> 1] : null,
    };
  }
  return out;
}

function summarizeAll(touches) {
  const fake = touches.map(t => ({ ...t, _all: 'all' }));
  return tableFor(fake, '_all').all;
}

/**
 * Build the full book: every (side, band) cell, every dimension, IS and OOS,
 * holds-gated.
 *
 *   buildFixedSigmaBook(touches, { firstTouchOnly })
 *     -> { instrument, splitDate, cells: { 'up|1': { n, base:{is,oos}, dims }, … } }
 *
 * `firstTouchOnly` restricts to ordinal===1 (the first tag of a band each
 * day) — the cleaner unit for band-touch statistics, since the Pine-style
 * close-inside re-arm can re-fire many times while price saws a band.
 */
export function buildFixedSigmaBook(touches, { firstTouchOnly = false } = {}) {
  const pool = firstTouchOnly ? touches.filter(t => t.ordinal === 1) : touches;
  if (!pool.length) return null;
  const { split, is, oos } = splitAt(pool);
  const instrument = pool[0].instrument;

  const cells = {};
  const bands = [...new Set(pool.map(t => t.band))].sort((a, b) => a - b);
  for (const side of ['up', 'dn']) {
    for (const band of bands) {
      const key = `${side}|${band}`;
      const cellIS = is.filter(t => t.side === side && t.band === band);
      const cellOOS = oos.filter(t => t.side === side && t.band === band);
      if (!cellIS.length) continue;
      const base = { is: summarizeAll(cellIS), oos: cellOOS.length ? summarizeAll(cellOOS) : null };
      const dims = {};
      for (const [dimKey] of DIMENSIONS) {
        const tIs = tableFor(cellIS, dimKey), tOos = tableFor(cellOOS, dimKey);
        if (!Object.keys(tIs).length) continue;
        dims[dimKey] = { is: tIs, oos: tOos };
      }
      if (base.oos) annotateHolds(dims, base.is, base.oos);
      cells[key] = { n: { is: cellIS.length, oos: cellOOS.length }, base, dims };
    }
  }
  return { instrument, splitDate: split, firstTouchOnly, cells };
}

/** Every holds-gated finding across the book, biggest |effect| first. */
export function extractHeldFindings(book, { limit = 60 } = {}) {
  if (!book) return [];
  const out = [];
  for (const [cellKey, cell] of Object.entries(book.cells)) {
    for (const [dimKey, dim] of Object.entries(cell.dims)) {
      for (const [bucket, g] of Object.entries(dim.is)) {
        if (!g.holdsOOS) continue;
        const o = dim.oos[bucket];
        out.push({ cellKey, dimKey, dimLabel: DIM_LABEL.get(dimKey) ?? dimKey, bucket,
          n: { is: g.n, oos: o.n },
          deltaOutIS: g.deltaOut, deltaOutOOS: o.deltaOut,
          outPctIS: g.outPct, outPctOOS: o.outPct });
      }
    }
  }
  return out.sort((a, b) => Math.abs(b.deltaOutIS) - Math.abs(a.deltaOutIS)).slice(0, limit);
}

/** Per-day band coverage: on what fraction of walked days is ±k tagged at all? */
export function bandCoverage(touches, daysWalked) {
  const byKey = new Map();
  for (const t of touches) {
    const key = `${t.side}|${t.band}`;
    (byKey.get(key) ?? byKey.set(key, new Set()).get(key)).add(t.date);
  }
  const out = {};
  for (const [key, dates] of byKey) {
    out[key] = { days: dates.size, pctOfDays: daysWalked ? +(dates.size / daysWalked * 100).toFixed(1) : null };
  }
  return out;
}

// ── Plain-text renderer — the whole book as a readable reference page ────────
export function renderBookText(book, coverage = null) {
  if (!book) return '(no data)';
  const lines = [];
  lines.push(`${book.instrument} — VWAP Fixed-Sigma Band Atlas  (OOS split ${book.splitDate}${book.firstTouchOnly ? ', first touches only' : ''})`);
  lines.push('='.repeat(78));
  const keys = Object.keys(book.cells).sort((a, b) => {
    const [sa, ka] = a.split('|'), [sb, kb] = b.split('|');
    return sa === sb ? (+ka - +kb) : sa.localeCompare(sb);
  });
  for (const key of keys) {
    const cell = book.cells[key];
    const [side, band] = key.split('|');
    const cov = coverage?.[key];
    lines.push('');
    lines.push(`── ${side === 'up' ? '+' : '−'}${band}σ  (n IS=${cell.n.is} OOS=${cell.n.oos}${cov ? `, tagged on ${cov.pctOfDays}% of days` : ''}) ${'─'.repeat(20)}`);
    const b = cell.base;
    const fmt = s => `out ${s.outPct}% / back ${s.backPct}% / neither ${s.neitherPct}%  · fade MFE ${s.avgMfeSigma}σ MAE ${s.avgMaeSigma}σ · VWAP hit ${s.vwapPct}% · re-entry ${s.reentryPct}% · med resolve ${s.medMinsToResolve}min`;
    lines.push(`  base IS:  ${fmt(b.is)}`);
    if (b.oos) lines.push(`      OOS:  ${fmt(b.oos)}`);
    for (const [dimKey, dimLabel] of DIMENSIONS) {
      const d = cell.dims[dimKey]; if (!d) continue;
      const held = Object.entries(d.is).filter(([, g]) => g.holdsOOS);
      if (!held.length) continue;   // text view: held findings only, the full book stays in JSON
      lines.push(`  · ${dimLabel}:`);
      for (const [bucket, g] of held) {
        const o = d.oos[bucket];
        lines.push(`      ${String(bucket).padEnd(14)} n=${String(g.n).padStart(4)}  out ${String(g.outPct).padStart(5)}% (Δ${g.deltaOut > 0 ? '+' : ''}${g.deltaOut})  |  OOS n=${String(o.n).padStart(4)}  out ${String(o.outPct).padStart(5)}% (Δ${o.deltaOut > 0 ? '+' : ''}${o.deltaOut})  ✓holds`);
      }
    }
  }
  return lines.join('\n');
}
