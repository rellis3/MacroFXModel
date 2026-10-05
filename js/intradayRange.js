/**
 * Intraday range re-forecast — the live half of forge/INTRADAY_RANGE_PREREG.md (PASS 2026-10-05:
 * FX + gold 21/21 hourly checkpoints, indices 19/21, vs the morning lines).
 *
 * At each hourly checkpoint h (01:00 … 21:00 London) the session so far is placed in one of 9
 * cells — tercile of RANGE USED × tercile of the LAST HOUR's range, both in σ units — and the
 * cell's fitted distribution of "more still to come" gives:
 *   projected high (p50/75/90) = running high + U_q · σ · open
 *   projected low  (p50/75/90) = running low  − D_q · σ · open
 *   P(a level above/below is still reached today) from the same distribution.
 * Size only, never direction. Information at h uses bars strictly before h:00, as tested.
 *
 * Pure (browser + node). σ is the forecast's own `ladder.sigma_daily_pct` (the same σ basis the
 * grids were fitted on).
 */
import { INTRADAY_PARAMS } from './intradayRangeParams.js';

const RUNGS = { p50: 0.5, p75: 0.75, p90: 0.9 };

const _fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
/** London date (YYYY-MM-DD) and fractional hour of a UTC epoch-seconds stamp. */
export function londonParts(tSec) {
  const p = Object.fromEntries(_fmt.formatToParts(new Date(tSec * 1000)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour + (+p.minute) / 60 };
}

/** Linear interpolation of a quantile grid: value at probability q. */
function qAt(grid, vals, q) {
  if (q <= grid[0]) return vals[0];
  if (q >= grid[grid.length - 1]) return vals[vals.length - 1];
  const j = grid.findIndex(g => g >= q);
  const w = (q - grid[j - 1]) / (grid[j] - grid[j - 1]);
  return vals[j - 1] + w * (vals[j] - vals[j - 1]);
}
/** P(X >= x) from a quantile grid (clamped to the grid's tail probabilities). */
function pAbove(grid, vals, x) {
  if (x <= vals[0]) return 1 - grid[0];
  if (x >= vals[vals.length - 1]) return 1 - grid[grid.length - 1];
  const j = vals.findIndex(v => v >= x);
  const w = vals[j] === vals[j - 1] ? 0 : (x - vals[j - 1]) / (vals[j] - vals[j - 1]);
  return 1 - (grid[j - 1] + w * (grid[j] - grid[j - 1]));
}

export function classOf(instrument, params = INTRADAY_PARAMS) {
  const k = params.alias?.[instrument] ?? instrument;
  return params.instrument_class?.[k] ?? null;
}

/**
 * Today's session state at every passed hourly checkpoint.
 * @param bars  ascending [{t (UTC sec), open, high, low, close}] — any intraday granularity
 * @param date  London session date (YYYY-MM-DD); defaults to the last bar's London date
 * @returns { date, open, checkpoints: [{h, runHigh, runLow, lastHigh, lastLow}], last: {t, close, high, low} }
 */
export function sessionState(bars, date = null) {
  const tagged = (bars ?? []).map(b => ({ ...b, ...londonParts(b.t) }));
  const d = date ?? tagged.at(-1)?.date;
  const day = tagged.filter(b => b.date === d && b.hour < 22);
  if (!day.length) return null;
  const cps = [];
  for (let h = 1; h <= 21; h++) {
    const before = day.filter(b => b.hour < h);
    if (!before.length || day.at(-1).hour < h) continue;          // no data yet, or h not reached
    const last = before.filter(b => b.hour >= h - 1);
    cps.push({
      h,
      runHigh: Math.max(...before.map(b => b.high)), runLow: Math.min(...before.map(b => b.low)),
      lastHigh: last.length ? Math.max(...last.map(b => b.high)) : null,
      lastLow: last.length ? Math.min(...last.map(b => b.low)) : null,
    });
  }
  return {
    date: d, open: day[0].open, checkpoints: cps,
    now: { t: day.at(-1).t, close: day.at(-1).close,
           high: Math.max(...day.map(b => b.high)), low: Math.min(...day.map(b => b.low)) },
  };
}

/**
 * Re-forecast at one checkpoint.
 * @returns { h, cell, usedSigma, speedSigma, projHigh{p50,p75,p90}, projLow{…}, remaining{…} (price units),
 *            probUp(level), probDn(level) } — or null when the class/checkpoint has no fit.
 */
export function reforecast(cp, { instrument, open, sigmaDailyPct, params = INTRADAY_PARAMS }) {
  const cls = classOf(instrument, params);
  const P = cls && params.classes?.[cls]?.[String(cp.h)];
  if (!P || !(sigmaDailyPct > 0) || !(open > 0)) return null;
  const unit = sigmaDailyPct / 100 * open;
  const used = (cp.runHigh - cp.runLow) / unit;
  const speed = cp.lastHigh != null ? (cp.lastHigh - cp.lastLow) / unit : 0;
  const tu = used < P.used_edges[0] ? 0 : used < P.used_edges[1] ? 1 : 2;
  const ts = speed < P.speed_edges[0] ? 0 : speed < P.speed_edges[1] ? 1 : 2;
  const C = P.cells[tu * 3 + ts];
  const g = params.grid;
  const projHigh = {}, projLow = {}, remaining = {};
  for (const [k, q] of Object.entries(RUNGS)) {
    projHigh[k] = cp.runHigh + qAt(g, C.U, q) * unit;
    projLow[k] = cp.runLow - qAt(g, C.Dn, q) * unit;
    remaining[k] = qAt(g, C.R, q) * unit;
  }
  const label = ['low', 'mid', 'high'];
  return {
    h: cp.h, cell: { used: label[tu], speed: label[ts], n: C.n },
    usedSigma: used, speedSigma: speed, unit, projHigh, projLow, remaining,
    probUp: level => (level <= cp.runHigh ? 1 : pAbove(g, C.U, (level - cp.runHigh) / unit)),
    probDn: level => (level >= cp.runLow ? 1 : pAbove(g, C.Dn, (cp.runLow - level) / unit)),
  };
}

/** Morning ladder levels off the session open (the faint reference lines). */
export function morningLevels(ladder, open) {
  const out = {};
  for (const k of Object.keys(RUNGS)) {
    if (ladder?.oh?.[k] != null) out[`up_${k}`] = open * (1 + ladder.oh[k] / 100);
    if (ladder?.ol?.[k] != null) out[`dn_${k}`] = open * (1 - ladder.ol[k] / 100);
  }
  return out;
}
