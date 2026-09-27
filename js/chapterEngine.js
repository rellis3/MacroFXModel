/**
 * Chapters: a complex read the same way every time.
 *
 * The shape is borrowed from the owner's educator, who publishes one chapter per market
 * complex, each carrying a composite gauge, a percentile receipt for every member, an
 * attribution ("the loudest member is PPI at +3.32 z"), and a watch with arm/stand-down
 * thresholds. The gauge, attribution and watch live in js/gaugeRead.js. This file adds
 * the two pieces that are specific to a chapter: the receipts, and the surface split.
 *
 * WHAT THIS DESK ADDS THAT THE SOURCE CANNOT. His read says where things are. It never
 * says whether being there has ever meant anything. Every chapter here carries an
 * `evidence` list naming the ledger entries that tested its readings, so a gauge that
 * was measured and came back null is displayed WITH that verdict rather than quietly
 * implying it matters. The liquidity chapter is the example: it reads fine and this
 * desk's own G1 test returned null on all three OOS hit rates.
 *
 * ── RECEIPTS ────────────────────────────────────────────────────────────────
 * "52nd percentile of its 240-week range, median 3.33%, span 2.33% to 8.98%" places a
 * number inside its own history instead of asserting it is high. Two refinements on the
 * source, both cheap and both mattering:
 *
 *   ROBUST z. Mean and standard deviation are dragged around by the very outliers a
 *   macro series is full of. Median and MAD are not, so a 2022 CPI print does not
 *   permanently rescale everything measured against it.
 *
 *   THE CHANGE, not only the level. "2nd percentile of 240 weeks" is a statement about
 *   where a series sits; most readings that matter are about where it just went. Both
 *   are reported, and they routinely disagree.
 *
 * ── THE SURFACE SPLIT ───────────────────────────────────────────────────────
 * A 3D yield-curve surface is a way of LOOKING at a matrix. The quantitative version of
 * the same information is three numbers — level, slope and curvature — which turn "the
 * curve moved" into "this week was 80% level, the slope did nothing". That is a sentence
 * you can act on and a picture is not. The same decomposition works on any tenor-like
 * axis: an IV surface by expiry, credit by rating grade, carry by maturity.
 *
 * Pure: no fetch, no DOM, no clock. Tested in js/chapterEngine.test.mjs.
 */

const finite = v => Number.isFinite(v);
const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Median absolute deviation, scaled so it is comparable to a standard deviation. */
export function mad(values) {
  const v = values.filter(finite); if (v.length < 3) return null;
  const m = med(v);
  const d = med(v.map(x => Math.abs(x - m)));
  return d == null ? null : d * 1.4826;
}

/** A series' own cadence, in days, taken from the median gap between its prints. */
export function cadenceDays(series = []) {
  const pts = (series ?? []).filter(p => p && p.date);
  if (pts.length < 4) return null;
  const gaps = [];
  for (let i = 1; i < pts.length; i++) {
    const d = (Date.parse(pts[i].date) - Date.parse(pts[i - 1].date)) / 864e5;
    if (d > 0 && d < 400) gaps.push(d);
  }
  return gaps.length ? med(gaps) : null;
}

/**
 * Where the latest value sits inside its own trailing window.
 *
 * THE WINDOW IS IN YEARS, NOT PRINTS, and this matters more than it looks. The source
 * says "240-week range", and the obvious implementation — keep the last 240 observations
 * — gives a DAILY series about one year and a MONTHLY series twenty. Putting a 1-year
 * percentile and a 20-year percentile side by side in the same gauge compares unlike
 * things while looking perfectly consistent, which is the worst kind of wrong. So the
 * window is a span of time, and each series' print count is derived from its own cadence.
 *
 * `changeOver` is likewise in prints: one print back is the series' own last move,
 * whatever its frequency.
 */
export function receipt(series = [], { years = 5, changeOver = 1, window = null } = {}) {
  const pts = (series ?? []).filter(p => p && finite(p.value));
  if (pts.length < 8) return null;
  const cad = cadenceDays(pts);
  // an explicit `window` still wins, for callers that genuinely mean a print count
  const take = window ?? (cad ? Math.max(12, Math.round((years * 365.25) / cad)) : 240);
  const tail = pts.slice(-take);
  const vals = tail.map(p => p.value);
  const latest = pts.at(-1);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const m = med(vals), s = mad(vals);
  const pct = vals.filter(v => v <= latest.value).length / vals.length;

  // the change, on the same window, so "where it sits" and "where it went" are comparable
  const prior = pts.at(-1 - changeOver);
  const chg = prior ? latest.value - prior.value : null;
  const chgSeries = [];
  for (let i = changeOver; i < tail.length; i++) chgSeries.push(tail[i].value - tail[i - changeOver].value);
  const cm = med(chgSeries), cs = mad(chgSeries);
  const chgPct = chg == null || !chgSeries.length ? null : chgSeries.filter(v => v <= chg).length / chgSeries.length;

  return {
    value: latest.value, date: latest.date ?? null, n: vals.length,
    years: cad ? +((vals.length * cad) / 365.25).toFixed(1) : null, cadenceDays: cad,
    pct: +(pct * 100).toFixed(0), median: m, lo, hi,
    // robust rather than mean/sd, so one 2022 print does not rescale the series forever
    z: s ? +((latest.value - m) / s).toFixed(2) : null,
    change: chg == null ? null : +chg.toFixed(4),
    changePct: chgPct == null ? null : +(chgPct * 100).toFixed(0),
    changeZ: cs && chg != null ? +((chg - cm) / cs).toFixed(2) : null,
  };
}

/** The receipt as a sentence, in the source's own phrasing. */
export function receiptSentence(r, label, unit = '%') {
  if (!r) return null;
  const f = v => `${(+v).toFixed(2)}${unit}`;
  const win = r.years ? `${r.years}-year` : `${r.n}-print`;
  let s = `${label} sits at the ${r.pct}${ord(r.pct)} percentile of its ${win} range, against a median of ${f(r.median)} and a span from ${f(r.lo)} to ${f(r.hi)}.`;
  // the level and the change disagreeing is the interesting case, so it is said out loud
  if (r.changePct != null && Math.abs(r.changePct - r.pct) >= 40) {
    s += ` Its latest change sits at the ${r.changePct}${ord(r.changePct)} percentile, so where it IS and where it is GOING disagree.`;
  }
  return s;
}
const ord = n => (n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th');

/**
 * Level, slope and curvature of a curve, and the attribution of its latest move.
 *
 * `tenors`: [{ key, years, value, prev }] — at least three, sorted by maturity here.
 * Reported in the curve's own units, and the attribution as shares of the total absolute
 * movement so "80% level" is a proportion that means something.
 */
export function curveFactors(tenors = []) {
  const t = (tenors ?? []).filter(x => x && finite(x.value) && finite(x.years)).sort((a, b) => a.years - b.years);
  if (t.length < 3) return null;
  const short = t[0], long = t.at(-1);
  const mid = t[Math.floor(t.length / 2)];
  const f = (s, m, l) => ({
    level: (s + m + l) / 3,
    slope: l - s,
    curvature: 2 * m - s - l,          // the butterfly: the belly against the wings
  });
  const now = f(short.value, mid.value, long.value);

  const hasPrev = t.every(x => finite(x.prev));
  let move = null;
  if (hasPrev) {
    const was = f(short.prev, mid.prev, long.prev);
    const d = { level: now.level - was.level, slope: now.slope - was.slope, curvature: now.curvature - was.curvature };
    const gross = Math.abs(d.level) + Math.abs(d.slope) + Math.abs(d.curvature);
    move = {
      ...d,
      // shares of the GROSS move, so they are proportions and sum to 1
      share: gross > 0
        ? { level: +(Math.abs(d.level) / gross).toFixed(3), slope: +(Math.abs(d.slope) / gross).toFixed(3), curvature: +(Math.abs(d.curvature) / gross).toFixed(3) }
        : null,
      gross: +gross.toFixed(4),
    };
    if (move.share) {
      const [dom] = Object.entries(move.share).sort((a, b) => b[1] - a[1]);
      move.dominant = dom[0];
      move.dominantShare = dom[1];
    }
  }
  return {
    level: +now.level.toFixed(3), slope: +now.slope.toFixed(3), curvature: +now.curvature.toFixed(3),
    short: { key: short.key, years: short.years, value: short.value },
    long: { key: long.key, years: long.years, value: long.value },
    inverted: now.slope < 0,
    n: t.length, move,
  };
}

/** The curve move in one sentence, or null when there is no previous reading to compare. */
export function curveSentence(cf, unit = '%') {
  if (!cf) return null;
  let s = `The curve runs ${(+cf.short.value).toFixed(2)}${unit} at ${yrs(cf.short.years)} to ${(+cf.long.value).toFixed(2)}${unit} at ${yrs(cf.long.years)}, a slope of ${cf.slope >= 0 ? '+' : ''}${cf.slope.toFixed(2)}${unit}${cf.inverted ? ' — inverted' : ''}.`;
  if (cf.move?.share) {
    const pc = Math.round(cf.move.dominantShare * 100);
    s += ` The latest move was ${pc}% ${cf.move.dominant}`;
    const quiet = Object.entries(cf.move.share).filter(([k, v]) => k !== cf.move.dominant && v < 0.15).map(([k]) => k);
    if (quiet.length) s += `, with ${quiet.join(' and ')} doing almost nothing`;
    s += '.';
  }
  return s;
}
const yrs = y => y < 1 ? `${Math.round(y * 12)}M` : `${y}Y`;
