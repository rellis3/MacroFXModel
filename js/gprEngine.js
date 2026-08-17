// js/gprEngine.js — Geopolitical Risk Index (Caldara & Iacoviello, Federal
// Reserve Board / matteoiacoviello.com) — a genuinely global, currency-
// agnostic macro-backdrop read: counts geopolitical-tension language across
// 10 major newspapers, published daily. This is the ONE series this
// dashboard reads that is NOT on FRED (everything else reuses
// fetchFredObservations) — the source file is a raw .xls download, parsed
// server-side (see server.js's _buildGprScore).
//
// Design: use the DAILY file's own 30-day moving average (GPRD_MA30) as the
// level, not the raw daily print — the raw print is noisy news-count data;
// MA30 is the smoothed series the authors publish alongside it specifically
// for this reason. z-scored against its own trailing history via the shared
// js/statsCore.js rollingZAt (never re-inline a z-score — CLAUDE.md's Lego
// Principle) — same convention as every other context read on today.html's
// Market Read (Credit Quality, Real Yield).
import { rollingZAt } from './statsCore.js';

// ~2 calendar years of daily prints — long enough for a stable trailing
// baseline, short enough to reflect the current geopolitical regime rather
// than averaging across the full 1985–present history (which would include
// eras — Cold War end, pre-9/11 calm — not representative of "normal" today).
export const GPR_LOOKBACK_DAYS = 730;

// rows: [{date:'YYYY-MM-DD', gprdMa30:number}], any order — sorted internally.
// Returns { level, z, trend, asOfDate } or null if there isn't enough clean
// history to compute a meaningful z-score.
export function gprScore(rows) {
  const clean = (rows ?? [])
    .filter(r => r?.date && Number.isFinite(r.gprdMa30))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  if (clean.length < 60) return null;

  const vals = clean.map(r => r.gprdMa30);
  const idx = vals.length - 1;
  const z = rollingZAt(vals, idx, Math.min(GPR_LOOKBACK_DAYS, vals.length));
  const level = vals[idx];
  const asOfDate = clean[idx].date;

  // Trend vs ~30 days ago (one MA30 cycle) — simple direction, not a rate.
  const priorIdx = Math.max(0, idx - 30);
  const prior = vals[priorIdx];
  const trend = level > prior * 1.05 ? 'rising' : level < prior * 0.95 ? 'falling' : 'flat';

  return { level: +level.toFixed(1), z: +z.toFixed(2), trend, asOfDate };
}
