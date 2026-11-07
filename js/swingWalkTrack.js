/**
 * Swing Map walk, forward record (register row `swing-walk-track`, forge/SWING_WALK_TRACK_PREREG.md): scores the
 * nightly walk records the server saves at R2 swing_walk/<INST>/<capture>.json the same way the history test scores
 * the replayed walk, so the page can show whether each anchor's dot is tracking.
 *
 * Per record (one night) and anchor, every walk step [expiry, dte, px, pullShare] whose expiry has a close becomes a
 * scored step, all in expected moves to that expiry (u = vol * sqrt(h), h = closes after the record's close up to and
 * including the expiry date):
 *   g  = ln(dot / close) / u      how far the dot said price would go
 *   z0 = ln(close at expiry / close) / u   how far it went
 * beta = sum(g z0) / sum(g^2): the share of the gap price travelled (1 = the dot is the expected price, 0 = nothing).
 * rmsMiss vs rmsNoMove: the dot's miss against "price stays where it is".
 * reachDot vs reachMirror (register row swing-walk-heading): on settled steps with |g| >= 0.1 and bars carrying high/low,
 * how often price traded through the dot in the sessions after the record up to the expiry, against a level the same log
 * distance on the other side of the record's close.
 * Steps still live (expiry after the last close) feed `paths`: each expiry's gap night by night as it counts down, so
 * a dot that stays 4% away while the expected move shrinks shows as a line climbing away from zero.
 *
 * Descriptive forward record: it never changes the history verdict. Pure, no I/O. Tested by js/swingWalkTrack.test.mjs.
 */
export const WALK_BUCKETS = [[1, 2, '1-2'], [3, 5, '3-5'], [6, 10, '6-10'], [11, 20, '11-20'], [21, 40, '21-40'], [41, 1e9, '41+']];

const bucketOf = h => WALK_BUCKETS.find(([lo, hi]) => h >= lo && h <= hi)?.[2] ?? null;

function summarise(steps) {
  if (!steps.length) return { n: 0, beta: null, rmsMiss: null, rmsNoMove: null, medianGap: null, reachN: 0, reachDot: null, reachMirror: null };
  let gz = 0, gg = 0, mm = 0, zz = 0;
  for (const s of steps) { gz += s.g * s.z0; gg += s.g * s.g; mm += (s.z0 - s.g) ** 2; zz += s.z0 * s.z0; }
  const gaps = steps.map(s => Math.abs(s.g)).sort((a, b) => a - b);
  const rs = steps.filter(s => s.td != null);
  const share = k => (rs.length ? rs.filter(s => s[k]).length / rs.length : null);
  return { n: steps.length, expiries: new Set(steps.map(s => s.expiry)).size, beta: gg > 0 ? gz / gg : null,
    rmsMiss: Math.sqrt(mm / steps.length), rmsNoMove: Math.sqrt(zz / steps.length), medianGap: gaps[gaps.length >> 1],
    reachN: rs.length, reachDot: share('td'), reachMirror: share('tm') };
}

/**
 * records: the saved walk records (v1: { closeDate, close, vol, walks: { anchor: [[expiry, dte, px, pullShare], ...] } }).
 * bars: daily closes [{ date, close }] sorted, labelled by close day (as the Swing Map's bars).
 * Returns { lastClose, anchors: { key: { all, buckets: { '1-2': summary, ... }, paths: { expiry: [[closeDate, h, g, dte], ...] } } } }.
 */
export function scoreWalkRecords(records, bars, { keys = null } = {}) {
  const dates = (bars || []).map(b => b.date);
  const closeOn = new Map((bars || []).map(b => [b.date, b.close]));
  const idxAfter = d => { let lo = 0, hi = dates.length; while (lo < hi) { const m = (lo + hi) >> 1; if (dates[m] <= d) lo = m + 1; else hi = m; } return lo; };
  const lastClose = dates.at(-1) ?? null;
  const out = {};
  for (const r of records || []) {
    if (!(r?.close > 0) || !(r?.vol > 0) || !r.closeDate || !r.walks) continue;
    const i0 = idxAfter(r.closeDate);                       // first close after the record's close
    for (const [key, pts] of Object.entries(r.walks)) {
      if (keys && !keys.includes(key)) continue;
      const A = (out[key] ??= { steps: [], paths: {} });
      for (const [expiry, dte, px] of pts || []) {
        if (!(px > 0) || !(expiry > r.closeDate)) continue;
        const live = !lastClose || expiry > lastClose;
        const h = Math.max(1, (live ? Math.max(dates.length, i0) + _weekdays(lastClose ?? r.closeDate, expiry) : idxAfter(expiry)) - i0);
        const u = r.vol * Math.sqrt(h), g = Math.log(px / r.close) / u;
        (A.paths[expiry] ??= []).push([r.closeDate, h, +g.toFixed(3), dte]);
        if (live || !closeOn.has(expiry)) continue;
        const step = { expiry, h, g, z0: Math.log(closeOn.get(expiry) / r.close) / u, td: null, tm: null };
        const path = (bars || []).slice(i0, idxAfter(expiry));
        if (Math.abs(g) >= 0.1 && path.length && path.every(b => b.high > 0 && b.low > 0)) {
          const hi = Math.max(...path.map(b => b.high)), lo = Math.min(...path.map(b => b.low)), mirror = r.close * r.close / px;
          step.td = px > r.close ? hi >= px : lo <= px;
          step.tm = px > r.close ? lo <= mirror : hi >= mirror;
        }
        A.steps.push(step);
      }
    }
  }
  const anchors = {};
  for (const [key, A] of Object.entries(out)) {
    const buckets = {};
    for (const [, , lab] of WALK_BUCKETS) { const s = A.steps.filter(x => bucketOf(x.h) === lab); if (s.length) buckets[lab] = summarise(s); }
    for (const p of Object.values(A.paths)) p.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    anchors[key] = { all: summarise(A.steps), buckets, paths: A.paths };
  }
  return { lastClose, records: (records || []).length, anchors };
}

function _weekdays(a, b) {
  let t = Date.parse(`${a}T00:00:00Z`), k = 0; const e = Date.parse(`${b}T00:00:00Z`);
  while (t < e) { t += 864e5; const w = new Date(t).getUTCDay(); if (w && w !== 6) k++; }
  return k;
}
