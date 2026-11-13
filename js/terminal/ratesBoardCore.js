/**
 * Desk Terminal, Macro tab: the Rates & policy board. The pure shaping behind it. No fetch, no DOM.
 *
 *   buildRatesBoard(S, now)   server side (/api/rates-board): the Treasury curve, the three slopes with their changes
 *                             and where each sits in its own 1-year and 5-year history, the curve now against a week
 *                             and a month ago, and the 2Y-minus-fed-funds proxy.
 *   fedPathRows(zq, board)    the next meetings from the fed funds futures strip, against the same strip a week ago,
 *                             set beside the 2Y and 10Y moves over that same week.
 *   reconcile(board, rows)    the two "policy priced in" numbers side by side.
 *   gapStrip(gyRows)          the 10-year gap to the Treasury for each other country, from the global-yields board.
 *
 * What this is NOT: a signal. The Fed-path lead on 15-minute moves is a banked NULL on this desk (Evidence Book
 * 'stir-wide-scan', 'cog-rate-futures-other-tests') and nothing tests a daily repricing, so the board sets the policy
 * path BESIDE the curve and says so.
 *
 * S is { us2y, us5y, us10y, us30y, effr, ... }: ascending [{date, value}] in percent (FRED H.15 / NY Fed, daily).
 */

const DAY = 864e5;
const ts = d => Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`);
const iso = t => new Date(t).toISOString().slice(0, 10);
const last = a => (Array.isArray(a) && a.length ? a[a.length - 1] : null);
const fin = v => v != null && Number.isFinite(v);

/** Last observation on or before a date ('YYYY-MM-DD'), or null. */
export function onOrBefore(a, date) {
  if (!Array.isArray(a)) return null;
  for (let i = a.length - 1; i >= 0; i--) if (a[i].date <= date) return a[i];
  return null;
}

/** Change in basis points over n calendar days (the same rule the rest of the terminal uses: the last print against
 *  the last print on or before n days earlier). null when the series cannot answer. */
export function changeBp(a, n) {
  const l = last(a); if (!l) return null;
  const ref = onOrBefore(a, iso(ts(l.date) - n * DAY));
  if (!ref || ref.date === l.date) return null;
  // a reference much older than the window means the series does not print that often: say nothing
  if ((ts(l.date) - ts(ref.date)) / DAY > n + Math.max(4, 0.6 * n)) return null;
  return +((l.value - ref.value) * 100).toFixed(1);
}

/** a minus b, in basis points, on the dates both print. Ascending. */
export function spreadSeries(a, b) {
  const m = new Map((b ?? []).map(p => [p.date, p.value]));
  const out = [];
  for (const p of a ?? []) if (m.has(p.date) && fin(p.value) && fin(m.get(p.date))) out.push({ date: p.date, value: +((p.value - m.get(p.date)) * 100).toFixed(2) });
  return out;
}

/** Where the last value sits in its own trailing window: share of prints at or below it, 0-100, with n. */
export function pctile(a, years, minN = 60) {
  const l = last(a); if (!l) return { pct: null, n: 0 };
  const from = iso(ts(l.date) - years * 365.25 * DAY);
  const w = a.filter(p => p.date >= from && fin(p.value));
  if (w.length < minN) return { pct: null, n: w.length };
  return { pct: Math.round(100 * w.filter(p => p.value <= l.value).length / w.length), n: w.length };
}

const TENORS = [['2y', 2, 'us2y'], ['5y', 5, 'us5y'], ['10y', 10, 'us10y'], ['30y', 30, 'us30y']];
const SLOPES = [['2s10s', '2y–10y', 'us10y', 'us2y'], ['2s30s', '2y–30y', 'us30y', 'us2y'], ['10s30s', '10y–30y', 'us30y', 'us10y']];

/** Days between a print's date and now (weekend-tolerant staleness is the caller's call). */
export function ageDays(asOf, now = Date.now()) {
  const t = ts(asOf); return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / DAY)) : null;
}

/** The curve as of a date: each tenor's last print on or before it. */
function curveAt(S, date) {
  const pts = [];
  for (const [k, y, key] of TENORS) { const o = onOrBefore(S[key], date); if (o && fin(o.value)) pts.push({ k, y, v: o.value, asOf: o.date }); }
  return pts.length >= 3 ? { date, pts } : null;
}

export function buildRatesBoard(S, now = Date.now()) {
  const us2 = last(S?.us2y), us10 = last(S?.us10y), us30 = last(S?.us30y);
  if (!us2 || !us10 || !us30) return { ok: false, error: 'FRED 2y/10y/30y not loaded yet' };
  const asOf = [us2.date, us10.date, us30.date].sort().at(-1);
  const tenors = TENORS.map(([k, y, key]) => {
    const l = last(S[key]); if (!l) return null;
    return { k, y, level: l.value, asOf: l.date, ageDays: ageDays(l.date, now), chg1d: changeBp(S[key], 1), chg5d: changeBp(S[key], 5), chg20d: changeBp(S[key], 20),
      // 7 and 28 calendar days = the chain's 5D and 20D (trading days): the spans the fed funds strip is looked back over (js/fedPathYieldsCore.js)
      chg7d: changeBp(S[key], 7), chg28d: changeBp(S[key], 28) };
  }).filter(Boolean);
  const slopes = SLOPES.map(([k, label, long, short]) => {
    const sr = spreadSeries(S[long], S[short]); const l = last(sr); if (!l) return null;
    const p1 = pctile(sr, 1), p5 = pctile(sr, 5, 250);
    const chg = n => { const ref = onOrBefore(sr, iso(ts(l.date) - n * DAY)); return ref && ref.date !== l.date ? +(l.value - ref.value).toFixed(1) : null; };
    return { k, label, bp: Math.round(l.value), asOf: l.date, ageDays: ageDays(l.date, now), chg1d: chg(1), chg5d: chg(5), chg20d: chg(20), chg7d: chg(7), chg28d: chg(28),
      pct1y: p1.pct, n1y: p1.n, pct5y: p5.pct, n5y: p5.n, inverted: l.value < 0, spark: sr.slice(-60).map(p => p.value) };
  }).filter(Boolean);
  const wk = iso(ts(asOf) - 7 * DAY), mo = iso(ts(asOf) - 28 * DAY);
  const curve = { now: curveAt(S, asOf), w1: curveAt(S, wk), m1: curveAt(S, mo) };
  const effr = last(S.effr);
  const policy = effr ? (() => {
    const gapBp = Math.round((us2.value - effr.value) * 100);
    return { effr: effr.value, effrAsOf: effr.date, twoYear: us2.value, twoYearAsOf: us2.date, gapBp, hikesEquivalent: +(gapBp / 25).toFixed(1),
      direction: gapBp < -12 ? 'cuts' : gapBp > 12 ? 'hikes' : 'roughly on hold' };
  })() : null;
  return { ok: true, fetchedAt: new Date(now).toISOString(), asOf, tenors, slopes, curve, policy,
    window: { pct1y: 'trailing 1 year of daily prints', pct5y: 'trailing 5 years of daily prints', source: 'FRED H.15 constant-maturity Treasury yields; fed funds: NY Fed EFFR' } };
}

/** Cumulative priced move in basis points from the strip's own starting rate to a meeting's "rate after". */
const cumBp = (rows, i) => (rows.length ? +(((rows[i].rAfter - rows[0].rBefore) * 100)).toFixed(1) : null);

/**
 * The next meetings from the fed funds futures strip, against the same strip a week ago.
 * zq = { asOf, meetings: [{meeting, rBefore, rAfter, moveBp, probPct, direction, thin, combined}], weekAgo: {asOf, meetings} }.
 * Meetings already past the strip's date are dropped. `horizons` are the cumulative moves to the December and June
 * meetings in 25bp steps ("hikes-equivalent"), now and a week ago, with `thin` flagged when any contract on the way
 * traded almost nothing (the back half of the strip is decoration: js/fedPathZq.js).
 */
export function fedPathRows(zq, board, { count = 3 } = {}) {
  const now = (zq?.meetings ?? []).filter(m => m && fin(m.rAfter) && fin(m.rBefore) && m.meeting >= String(zq.asOf ?? '').slice(0, 10));
  if (!now.length) return null;
  const ago = (zq.weekAgo?.meetings ?? []).filter(m => m && fin(m.rAfter) && fin(m.rBefore) && m.meeting >= String(zq.weekAgo.asOf ?? '').slice(0, 10));
  const agoBy = new Map(ago.map(m => [m.meeting, m]));
  const rows = now.slice(0, count).map((m, i) => {
    const w = agoBy.get(m.meeting) ?? null;
    return { meeting: m.meeting, moveBp: m.moveBp, probPct: m.probPct, direction: m.direction, thin: !!m.thin, combined: m.combined ?? null,
      cumBp: cumBp(now, i), weekAgoMoveBp: w ? w.moveBp : null, weekAgoCumBp: w ? cumBp(ago, ago.indexOf(w)) : null,
      dMoveBp: w ? +(m.moveBp - w.moveBp).toFixed(1) : null };
  });
  const horizon = (m, label) => {
    if (!m) return null;
    const i = now.indexOf(m), w = agoBy.get(m.meeting) ?? null;
    const c = cumBp(now, i), cw = w ? cumBp(ago, ago.indexOf(w)) : null;
    return { label, meeting: m.meeting, steps: +(c / 25).toFixed(2), weekAgoSteps: cw == null ? null : +(cw / 25).toFixed(2), dSteps: cw == null ? null : +((c - cw) / 25).toFixed(2), thin: now.slice(0, i + 1).some(x => x.thin) };
  };
  const dec = now.find(m => m.meeting.slice(5, 7) === '12'), jun = now.find(m => m.meeting.slice(5, 7) === '06');
  const horizons = [horizon(dec, 'by December'), horizon(jun, 'by June')].filter(Boolean);
  const tn = k => board?.tenors?.find(t => t.k === k);
  return { asOf: zq.asOf, weekAgoAsOf: zq.weekAgo?.asOf ?? null, rows, horizons,
    week: { y2: tn('2y')?.chg5d ?? null, y10: tn('10y')?.chg5d ?? null, s2s10: board?.slopes?.find(s => s.k === '2s10s')?.chg5d ?? null },
    thinAny: now.slice(0, count).some(m => m.thin) };
}

/**
 * The two "policy priced in" numbers side by side. They are different things and the difference is not an error:
 * the 2-year proxy is the 2-year yield less the effective fed funds rate in 25bp steps (an average over two years that
 * carries term premium); the futures strip is a decision-by-decision path about a year out, reliable only for the first
 * few meetings. `diff` is proxy minus the furthest meeting shown that is not thin.
 */
export function reconcile(board, fp) {
  const proxy = board?.policy?.hikesEquivalent ?? null;
  const hs = (fp?.horizons ?? []).filter(h => !h.thin);
  const far = hs.at(-1) ?? null;
  const strip = far ? far.steps : (fp?.rows?.length ? +(fp.rows.at(-1).cumBp / 25).toFixed(2) : null);
  const stripLabel = far ? far.label : (fp?.rows?.length ? `by ${fp.rows.at(-1).meeting}` : null);
  return { proxy, proxyDirection: board?.policy?.direction ?? null, strip, stripLabel, diff: proxy != null && strip != null ? +(proxy - strip).toFixed(2) : null };
}

/** The 10-year gap to the Treasury for every other country on the global-yields board (bp, with its 20-day change). */
export function gapStrip(rows) {
  const us = (rows ?? []).find(r => r.ccy === 'USD'); if (!us || !fin(us.y10)) return [];
  return (rows ?? []).filter(r => r.ccy !== 'USD' && fin(r.y10)).map(r => ({
    short: r.short, ccy: r.ccy, gapBp: Math.round((r.y10 - us.y10) * 100),
    chg20d: fin(r.chg10y20d) && fin(us.chg10y20d) ? Math.round(r.chg10y20d - us.chg10y20d) : null,
    note: r.note ?? null,
  }));
}
