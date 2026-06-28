/**
 * Gate Analysis — compare candidate trade GATES on a backtest's trades, honestly.
 *
 * Built to answer one question without fooling ourselves: does tightening a gate
 * actually improve OUT-OF-SAMPLE expectancy, and at what trade-count cost? Per
 * SYSTEM_ASSESSMENT.md §2.5, a stacked score (the A/B grade) can look great
 * in-sample and die OOS — so every gate here is reported on a true IS/OOS split
 * with the OOS trade count next to it. A gate "wins" only if its stricter buckets
 * beat "all" on OOS with a non-trivial OOS sample (≥30), per CLAUDE.md.
 *
 * Three gates, each a set of CUMULATIVE pass-thresholds (loosest → strict → all):
 *   • grade   — the live entry grade (A+ / A / B …); the stacked-score gate.
 *   • volPos  — forecast HL75 stretch (|entry-anchor|/HL75 half-range); a fade is
 *               higher-edge the more the level is statistically stretched. The
 *               theory-grounded gate that ties into the vol forecaster.
 *   • dayType — day-type T (reversion↔continuation); a fade wants LOW T.
 *
 * Pure: takes the trades array (each {date, pnl_pct, filled, live_grade, vol_pos,
 * day_type_T}) and returns a structured comparison. Metrics via metricsCore.
 */

import { summarizeTrades } from './metricsCore.js';

// Gate definitions: ordered buckets, each a predicate over a trade. "all" last.
export const GATES = {
  grade: {
    label: 'Entry grade (stacked score)',
    field: 'live_grade',
    buckets: [
      { label: 'A+ only',     pass: t => t.live_grade === 'A+' },
      { label: 'A+ / A',      pass: t => t.live_grade === 'A+' || t.live_grade === 'A' },
      { label: 'A+ / A / B',  pass: t => ['A+', 'A', 'B'].includes(t.live_grade) },
      { label: 'all',         pass: () => true },
    ],
  },
  volPos: {
    label: 'Vol-forecast stretch (HL75)',
    field: 'vol_pos',
    buckets: [
      { label: '≥ 1.50× HL75', pass: t => t.vol_pos != null && t.vol_pos >= 1.50 },
      { label: '≥ 1.00× HL75', pass: t => t.vol_pos != null && t.vol_pos >= 1.00 },
      { label: '≥ 0.75× HL75', pass: t => t.vol_pos != null && t.vol_pos >= 0.75 },
      { label: 'all',          pass: () => true },
    ],
  },
  dayType: {
    label: 'Day-type T (fade = low T)',
    field: 'day_type_T',
    buckets: [
      { label: 'T < 0.30 (range)',  pass: t => t.day_type_T != null && t.day_type_T < 0.30 },
      { label: 'T < 0.45',          pass: t => t.day_type_T != null && t.day_type_T < 0.45 },
      { label: 'T < 0.55 (≤mixed)', pass: t => t.day_type_T != null && t.day_type_T < 0.55 },
      { label: 'all',               pass: () => true },
    ],
  },
};

// Split filled trades into IS / OOS by date fraction (same convention as
// honestForecastEngine.summarizeSplit: cut on the sorted date timeline).
function splitByDate(trades, oosFrac) {
  const all = trades.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!all.length) return { splitDate: null, is: [], oos: [] };
  const cut = Math.floor(all.length * (1 - oosFrac));
  const splitDate = all[cut]?.date ?? null;
  return {
    splitDate,
    is:  trades.filter(t => (splitDate ? t.date <  splitDate : true)),
    oos: trades.filter(t => (splitDate ? t.date >= splitDate : false)),
  };
}

const metricsOf = ts => summarizeTrades(ts.map(t => t.pnl_pct), ts.map(t => t.date));

// Compare every gate's buckets on IS and OOS. minOosTrades flags buckets too thin
// to trust. Returns { splitDate, gates: { key: { label, field, rows[] } } }.
export function compareGates(trades, { oosFrac = 0.4, minOosTrades = 30 } = {}) {
  const filled = trades.filter(t => t.filled);
  const { splitDate, is, oos } = splitByDate(filled, oosFrac);

  const out = { splitDate, oosFrac, minOosTrades, total: filled.length, gates: {} };
  for (const [key, def] of Object.entries(GATES)) {
    const coverage = filled.filter(t => t[def.field] != null).length;
    const rows = def.buckets.map(b => {
      const isPass  = is.filter(b.pass);
      const oosPass = oos.filter(b.pass);
      const oosM    = metricsOf(oosPass);
      return {
        label:    b.label,
        is:       metricsOf(isPass),
        oos:      oosM,
        thin:     oosM.trades < minOosTrades,   // OOS sample too small to trust
      };
    });
    // "Edge vs all" on OOS: does the stricter bucket beat the unfiltered set?
    const allOos = rows.find(r => r.label === 'all')?.oos;
    for (const r of rows) {
      r.oosExpectancyVsAll = allOos ? +(r.oos.expectancy - allOos.expectancy).toFixed(4) : 0;
      r.oosSharpeVsAll     = allOos ? +(r.oos.sharpe - allOos.sharpe).toFixed(3) : 0;
    }
    out.gates[key] = { label: def.label, field: def.field, coverage, rows };
  }
  return out;
}

// Pick the single best gate+threshold: the bucket with the highest OOS expectancy
// that still clears minOosTrades AND beats "all". Returns null if none qualifies
// (i.e. no gate adds OOS edge — itself a useful finding).
export function bestGate(comparison) {
  let best = null;
  for (const [key, g] of Object.entries(comparison.gates)) {
    for (const r of g.rows) {
      if (r.label === 'all') continue;
      if (r.thin) continue;
      if (r.oosExpectancyVsAll <= 0) continue;
      if (!best || r.oos.expectancy > best.oos.expectancy) {
        best = { gate: key, gateLabel: g.label, bucket: r.label, oos: r.oos, oosExpectancyVsAll: r.oosExpectancyVsAll };
      }
    }
  }
  return best;
}
