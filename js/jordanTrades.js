/**
 * Jordan's trades on the forecast lines, for the Forecast Reversion page (study: forge/FUTURES_OC_TP_FADE_PREREG.md,
 * forge/FUTURES_QLIKE_TRADES_PREREG.md). Same trade shape as js/reversionLadder.js reversionTrades, so the page's
 * markers, tally and stats work unchanged. Pure functions, one session at a time, no lookahead (VWAP is the bars BEFORE
 * the touch; the entry fills on the touch bar, exits are checked from the next bar; a bar that reaches both = stop).
 *
 *   j_oc_fade    fade the first touch of O-H / O-L p75, TP = open ± OC p50, stop = p90 + 0.05σ   (banked NULL, -0.065R)
 *   j_vwap_fade  same entry and stop, TP = session VWAP frozen at the bar before the touch       (futures-qlike-trades A)
 *   j_p90_follow go WITH the first break of p90, stop = the same-side p75 line, exit at the day's close (B, +0.054R)
 */
export const JORDAN_STYLES = {
  j_oc_fade:    { label: 'Fade p75 → OC' },
  j_vwap_fade:  { label: 'Fade p75 → VWAP' },
  j_p90_follow: { label: 'Follow p90 break' },
};

const KEY = { 1: { 75: 'OH_p75', 90: 'OH_p90', c: '#10b981' }, [-1]: { 75: 'OL_p75', 90: 'OL_p90', c: '#ef4444' } };

/**
 * d: { open, bars: [{time, open, high, low, close}], vwap?: Float64Array (running, incl. bar k) }
 * b: the day's bands (% of open): oh_p75, oh_p90, ol_p75, ol_p90, oc_p50 (or oc_median), sigma (daily %, optional)
 * opts: { style, costPct, armed: Set of line keys }
 */
export function jordanTrades(d, b, opts) {
  const { style, costPct = 0, armed } = opts;
  const out = [];
  if (!d || !b || !(d.open > 0) || !d.bars?.length) return out;
  const o = d.open, bars = d.bars, n = bars.length;
  const sig = b.sigma > 0 ? b.sigma : null;
  const oc50 = b.oc_p50 ?? b.oc_median;
  for (const side of [1, -1]) {
    const q = side > 0 ? 'oh' : 'ol';
    const p75 = b[`${q}_p75`], p90 = b[`${q}_p90`];
    if (!(p75 > 0) || !(p90 > 0)) continue;
    const lv = p => o * (1 + side * p / 100);
    const follow = style === 'j_p90_follow';
    const key = KEY[side][follow ? 90 : 75];
    if (armed && !armed.has(key)) continue;
    const entryPx = follow ? lv(p90) : lv(p75);
    let k = -1;
    for (let i = 0; i < n; i++) if (side > 0 ? bars[i].high >= entryPx : bars[i].low <= entryPx) { k = i; break; }
    if (k < 0) continue;
    // direction of the trade: fades sell an up-line (buy a down-line); the follow goes with the break
    const dir = follow ? side : -side;
    let stop, tp = null;
    if (follow) {
      stop = lv(p75);
    } else {
      stop = lv(p90 + 0.05 * (sig ?? 0));
      if (style === 'j_oc_fade') tp = oc50 > 0 ? lv(oc50) : null;
      else if (style === 'j_vwap_fade') tp = k > 0 && d.vwap ? d.vwap[k - 1] : null;
      // the TP must sit between the open side and the entry, else no trade
      if (tp == null || !(side > 0 ? tp < entryPx : tp > entryPx)) continue;
    }
    let exitPx = bars[n - 1].close, outcome = 'expired', exitTime = bars[n - 1].time;
    for (let j = k + 1; j < n; j++) {
      const B = bars[j];
      const hitStop = dir > 0 ? B.low <= stop : B.high >= stop;
      const hitTp = tp != null && (dir > 0 ? B.high >= tp : B.low <= tp);
      if (hitStop) { exitPx = stop; outcome = 'loss'; exitTime = B.time; break; }
      if (hitTp) { exitPx = tp; outcome = 'win'; exitTime = B.time; break; }
    }
    const grossPct = dir * (exitPx - entryPx) / entryPx * 100;
    if (outcome === 'expired' && follow) outcome = grossPct > 0 ? 'win' : 'loss';
    out.push({
      key, label: `${JORDAN_STYLES[style].label} ${side > 0 ? 'O-H' : 'O-L'}`, color: KEY[side].c,
      side: dir > 0 ? 'BUY' : 'SELL', action: follow ? 'follow' : 'fade',
      entry: entryPx, target: tp ?? NaN, stop, exitPrice: exitPx, pct: follow ? p90 : p75,
      outcome, grossPct, netPct: grossPct - costPct,
      entryTime: bars[k].time, exitTime,
    });
  }
  return out;
}

/** Contracts for a $ risk on a futures trade: floor(risk / (|entry − stop| × point value)), at least 0. */
export function contractsFor(riskUsd, entry, stop, pointValue) {
  const per = Math.abs(entry - stop) * pointValue;
  return per > 0 ? Math.max(0, Math.floor(riskUsd / per)) : 0;
}
