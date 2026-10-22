// js/yieldLegs.js — government bond YIELDS (%) as chart legs for cog-chart.html, beside the futures legs.
//
// Why: the futures legs (ZT/ZN/ZB, Schatz/Bund/Buxl) are PRICES, so a "US 2y minus German 2y" built from them is a price
// difference, not the yield spread the education material uses (macro-deep-dives Lesson 2: US vs German 10Y in bp, 2Y for
// direction, 10Y for magnitude; term spread 10Y - 2Y). These legs are yields:
//   - official daily closes: FRED H.15 (DGS2/5/10/30, ~15:30 New York) and the Bundesbank par curve (R02XX..R30XX);
//   - intraday where a liquid CFD exists (OANDA US 2/5/10/30 Treasury CFDs, the Bund 10y CFD): the yield between two
//     official closes is the last official yield moved by the CFD's price change through a duration estimated from the data
//     (daily price change vs daily yield change), re-anchored at every official close. Approximate intraday (bp-level drift),
//     exact at each anchor.
// Pure: no fetch, no DOM. Tested by js/yieldLegs.test.mjs.

/** UTC epoch seconds of a wall-clock time in a time zone on a calendar date ('YYYY-MM-DD'). */
export function zonedEpoch(date, hh, mm, timeZone) {
  const guess = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), hh, mm) / 1000;
  const f = new Intl.DateTimeFormat('en-GB', { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(guess * 1000)).map(x => [x.type, x.value]));
  const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) / 1000;
  return guess - (shown - guess);
}

/** Close of the bar covering instant t (bars stamped at their OPEN, step seconds): the last bar opened before t. */
function priceAt(bars, t, step) {
  let lo = 0, hi = bars.length - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (bars[m].t + step <= t) { k = m; lo = m + 1; } else hi = m - 1; }
  if (k < 0 || t - (bars[k].t + step) > 6 * 3600) return null;          // nothing within 6 h of the fix
  return bars[k].c;
}

/** Anchors: one per official date, with the CFD price at that date's fix time. */
export function anchors(official, bars, step, fixOf) {
  const out = [];
  for (const o of official) {
    if (!Number.isFinite(o.value)) continue;
    const t = fixOf(o.date), p = priceAt(bars, t, step);
    if (p != null && p > 0) out.push({ t, y: o.value, p });
  }
  return out;
}

/** Duration from the data: slope of daily d(ln price) on daily d(yield, % points), D = -100 x slope. Falls back if unstable. */
export function estimateDuration(anc, fallback) {
  const dx = [], dy = [];
  for (let i = 1; i < anc.length; i++) { dy.push(Math.log(anc[i].p / anc[i - 1].p)); dx.push(anc[i].y - anc[i - 1].y); }
  if (dx.length < 40) return { D: fallback, n: dx.length, fitted: false };
  const mx = dx.reduce((a, b) => a + b, 0) / dx.length, my = dy.reduce((a, b) => a + b, 0) / dy.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < dx.length; i++) { sxy += (dx[i] - mx) * (dy[i] - my); sxx += (dx[i] - mx) ** 2; syy += (dy[i] - my) ** 2; }
  const D = -100 * sxy / sxx, r = sxy / Math.sqrt(sxx * syy);
  if (!(D > 0.3 && D < 40) || !(r < -0.5)) return { D: fallback, n: dx.length, fitted: false, r };
  return { D, n: dx.length, fitted: true, r };
}

/** Intraday yield bars from CFD price bars and anchors: y = y_anchor - 100 * ln(p / p_anchor) / D (high and low swap). */
export function impliedYieldBars(bars, anc, D) {
  const out = []; let k = -1;
  for (const b of bars) {
    while (k + 1 < anc.length && anc[k + 1].t <= b.t) k++;
    if (k < 0) continue;
    const a = anc[k], y = p => a.y - 100 * Math.log(p / a.p) / D;
    out.push({ t: b.t, o: y(b.o), h: y(b.l), l: y(b.h), c: y(b.c) });
  }
  return out;
}

/** Daily official values as one bar per date, stamped at the fix time (the page carries them forward between prints). */
export function dailyBars(official, fixOf) {
  return official.filter(o => Number.isFinite(o.value)).map(o => ({ t: fixOf(o.date), o: o.value, h: o.value, l: o.value, c: o.value })).sort((a, b) => a.t - b.t);
}

/** The next Monday-to-Friday date after 'YYYY-MM-DD' (holidays are not known here: a holiday shows as a gap). */
export function nextBusinessDay(date) {
  const d = new Date(date + 'T12:00:00Z');
  do d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

/** Aggregate bars into a longer step (e.g. 900 -> 3600). */
export function aggregate(bars, step) {
  const g = new Map();
  for (const b of bars) {
    const k = Math.floor(b.t / step) * step, a = g.get(k);
    if (!a) g.set(k, { t: k, o: b.o, h: b.h, l: b.l, c: b.c }); else { a.h = Math.max(a.h, b.h); a.l = Math.min(a.l, b.l); a.c = b.c; }
  }
  return [...g.values()].sort((a, b) => a.t - b.t);
}

export const toColumns = bars => ({ t: bars.map(b => b.t), o: bars.map(b => +b.o.toFixed(4)), h: bars.map(b => +b.h.toFixed(4)), l: bars.map(b => +b.l.toFixed(4)), c: bars.map(b => +b.c.toFixed(4)) });

// The legs. fix = when the official daily value is struck. US: FRED H.15 / Treasury ~15:30 New York (checked: the implied 2/5/10/30y
// matched the Treasury's official 2026-10-22 closes within 1 bp). Germany: the Bundesbank par curve lines up best with the Bund CFD at
// ~11:15 Frankfurt (fit scanned 08:30-20:00 on 128 days: r -0.90 at 11:15 vs -0.55 at the 17:15 close; one-day drift median 0.6 bp).
// The Bundesbank publishes later the same day, so live intraday values only use it once it is out (no look-ahead on the live edge).
const US_FIX = d => zonedEpoch(d, 15, 30, 'America/New_York');
const DE_FIX = d => zonedEpoch(d, 11, 15, 'Europe/Berlin');
export const YIELD_LEGS = {
  Y_US2:  { label: 'US 2y Treasury yield (%)',  side: 'US',  daily: { src: 'fred', id: 'DGS2' },  cfd: 'USB02Y_USD', D: 1.9, fix: US_FIX },
  Y_US5:  { label: 'US 5y Treasury yield (%)',  side: 'US',  daily: { src: 'fred', id: 'DGS5' },  cfd: 'USB05Y_USD', D: 4.5, fix: US_FIX },
  Y_US10: { label: 'US 10y Treasury yield (%)', side: 'US',  daily: { src: 'fred', id: 'DGS10' }, cfd: 'USB10Y_USD', D: 8.0, fix: US_FIX },
  Y_US30: { label: 'US 30y Treasury yield (%)', side: 'US',  daily: { src: 'fred', id: 'DGS30' }, cfd: 'USB30Y_USD', D: 17,  fix: US_FIX },
  Y_DE2:  { label: 'German 2y Bund yield (%), daily', side: 'EUR', daily: { src: 'bbk', id: 'R02XX' }, cfd: null, fix: DE_FIX },
  Y_DE5:  { label: 'German 5y Bund yield (%), daily', side: 'EUR', daily: { src: 'bbk', id: 'R05XX' }, cfd: null, fix: DE_FIX },
  Y_DE10: { label: 'German 10y Bund yield (%)', side: 'EUR', daily: { src: 'bbk', id: 'R10XX' }, cfd: 'DE10YB_EUR', D: 8.5, fix: DE_FIX },
  Y_DE30: { label: 'German 30y Bund yield (%), daily', side: 'EUR', daily: { src: 'bbk', id: 'R30XX' }, cfd: null, fix: DE_FIX },
};
export const YIELD_GROUP = 'Yields % (US Treasury, German Bund)';

/** Meta rows in the shape of legs_meta.json. */
export function yieldMeta(builtAsOf = {}) {
  return Object.entries(YIELD_LEGS).map(([name, s]) => ({
    name, label: s.label, group: YIELD_GROUP, side: s.side, kind: 'yield',
    period: s.cfd ? 'intraday (CFD, anchored to the official daily close)' : 'daily official close',
    source: s.daily.src === 'fred' ? `FRED ${s.daily.id} + OANDA ${s.cfd}` : (s.cfd ? `Bundesbank ${s.daily.id} + OANDA ${s.cfd}` : `Bundesbank ${s.daily.id}`),
    first: builtAsOf[name]?.first ?? '2015-01-02', asOf: builtAsOf[name]?.asOf ?? (s.cfd ? 'live' : 'daily'),      // shown as "[2015-01 to live]" until a leg has been built
  }));
}

/** Build one leg from fetched inputs: official [{date, value}], CFD m15/m5 bars [{t,o,h,l,c}] (open-stamped). */
export function buildYieldLeg(name, { official, m15 = [], m5 = [], now = Date.now() / 1000 }) {
  const s = YIELD_LEGS[name]; if (!s) throw new Error('unknown yield leg ' + name);
  const daily = dailyBars(official, s.fix);
  if (!s.cfd || !m15.length) {
    // a daily value holds until the next print: one marker bar (same value) up to the next business day's fix + 1 h (publication
    // slack), capped at now, so the page carries it across the day and the weekend instead of stopping at the fix (it never
    // carries a leg past its last bar); a missed print shows as a gap after that
    const last = daily[daily.length - 1], lastDate = official.filter(o => Number.isFinite(o.value)).map(o => o.date).sort().pop();
    const end = last ? Math.min(Math.floor(now / 900) * 900, s.fix(nextBusinessDay(lastDate)) + 3600 - 900) : null;
    const withHold = last && end > last.t ? [...daily, { ...last, t: end }] : daily;
    return { m5: withHold, m15: withHold, h1: withHold, duration: null, mode: 'daily' };
  }
  const anc = anchors(official, m15, 900, s.fix), dur = estimateDuration(anc, s.D);
  const y15 = impliedYieldBars(m15, anc, dur.D), y5 = m5.length ? impliedYieldBars(m5, anc, dur.D) : [];
  // history before the CFD window: the official daily closes
  const firstIntraday = y15.length ? y15[0].t : Infinity, before = daily.filter(b => b.t < firstIntraday);
  return { m5: y5, m15: y15, h1: [...before, ...aggregate(y15, 3600)], duration: dur, mode: 'intraday', anchors: anc.length };
}
