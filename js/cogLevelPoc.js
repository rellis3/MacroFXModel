/**
 * COG-level POC — the honest test: COG's ACTUAL forecast levels vs ACTUAL price,
 * on the exact days we have COG reference data for (EURUSD / NQ / GOLD).
 *
 * For each COG day we set COG's median & 75th H-L range and its O-C displacement,
 * then walk that day's intraday bars and ask the question directly:
 *   • did price REACH COG's level?
 *   • did it REVERT there (fade) or blow through (continue)?
 *   • by HOW MUCH did it revert (pullback pips / % of price)?
 *   • how MANY times (out of the days we have)?
 *
 * Levels tested per day:
 *   - dynamic H-L median / 75th — the opposite extreme projected from the RUNNING
 *     high/low by COG's range (the M1-justifying "NAS" level), and
 *   - static O-C median — open ± COG's open-close displacement.
 *
 * Pure core (no network / no KV): the route feeds it the parsed COG levels + the
 * day's bars. Reuses the reversion bricks (_dynLevelOutcome / _levelOutcome) — the
 * SAME measurement the touch study uses; copies nothing (Lego Principle).
 */
import { _dynLevelOutcome, _levelOutcome } from './intradayForecastResearch.js';

const _mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const _round = (x, d = 1) => x == null ? null : +x.toFixed(d);

// dayRecords: [{ date, open, bars, pip, cog:{hl_med,hl_75,oc_med,oc_75} }]
//   bars = that London day's intraday bars ({ _t, high, low, close }), oldest→newest.
//   cog fields are % of price (COG's export). Missing/zero levels are skipped.
export function analyzeCogLevels(dayRecords) {
  const rows = { dynMed: [], dyn75: [], ocMed: [] };
  const tag = (o, date, r) => ({ ...o, date, revertPct: (o.entry > 0) ? +(o.maePips * r.pip / o.entry * 100).toFixed(4) : null });
  for (const d of dayRecords) {
    const { open, bars, pip, cog } = d;
    if (!(open > 0) || !bars?.length || !cog) continue;
    const rr = { pip };
    // Dynamic H-L: project the opposite extreme from the running high/low by COG's range.
    if (cog.hl_med > 0) for (const dir of [-1, +1]) { const o = _dynLevelOutcome(bars, cog.hl_med / 100, dir, pip); if (o) rows.dynMed.push(tag(o, d.date, rr)); }
    if (cog.hl_75 > 0) for (const dir of [-1, +1]) { const o = _dynLevelOutcome(bars, cog.hl_75 / 100, dir, pip); if (o) rows.dyn75.push(tag(o, d.date, rr)); }
    // Static O-C: open ± COG's open-close displacement.
    if (cog.oc_med > 0) {
      const hyst = Math.max(pip, 0.15 * open * cog.oc_med / 100);
      const up = _levelOutcome(bars, open * (1 + cog.oc_med / 100), +1, pip, hyst);
      const dn = _levelOutcome(bars, open * (1 - cog.oc_med / 100), -1, pip, hyst);
      if (up) rows.ocMed.push(tag(up, d.date, rr)); if (dn) rows.ocMed.push(tag(dn, d.date, rr));
    }
  }
  return { nDays: dayRecords.length, dynMed: _summ(rows.dynMed), dyn75: _summ(rows.dyn75), ocMed: _summ(rows.ocMed), rows };
}

// Reversion summary for one level's touches. "revert" = pulled back toward the
// interior (a fade win); "continue" = blew through the level.
function _summ(rows) {
  if (!rows.length) return { n: 0 };
  const rev = rows.filter(r => r.outcome === 'reverse'), cont = rows.filter(r => r.outcome === 'continue');
  const fadeWins = rows.filter(r => r.closeFadePips > 0);
  return {
    n: rows.length,                                    // how many touches (across the days we have)
    revertCount: rev.length,                           // how many reverted (faded)
    revertPct: _round(rev.length / rows.length * 100), // …as a %
    continuePct: _round(cont.length / rows.length * 100),
    meanRevertPips: _round(_mean(rows.map(r => r.maePips))),      // BY HOW MUCH it pulled back (the fade)
    meanRevertPct:  _round(_mean(rows.map(r => r.revertPct ?? 0)), 3),
    meanAdversePips: _round(_mean(rows.map(r => r.mfePips))),     // how far it ran past (the risk)
    rev20Pct: _round(rows.filter(r => r.rev20).length / rows.length * 100),
    rev50Pct: _round(rows.filter(r => r.rev50).length / rows.length * 100),
    // Hold-to-close fade: enter at the level, exit at day close. +ve = reverted profitably.
    meanCloseFadePips: _round(_mean(rows.map(r => r.closeFadePips))),
    closeFadeWinPct: _round(fadeWins.length / rows.length * 100),
  };
}
