/**
 * Swing Map engine: one instrument's daily picture laid out the way the gold chart did it, built only from parts
 * this repo has measured, each tagged with how far it is proven.
 *
 *   legs       zigzag on daily closes, reversal at REV x the 60-day daily sigma (1:1 port of
 *              scripts/swing-leg-baserates/analyse.py, parity checked in js/swingMap.test.mjs)
 *   live leg   size so far (% and sigma) and its percentile among the instrument's own completed legs
 *   state      fall from the 1-year high in annualised sigma, RSI(14), 20-day closing extreme, and whether the
 *              swing-leg-baserates condition is on today
 *   baseRates  the pooled look-back numbers next to their every-day baseline (EXPLORATORY, not banked)
 *   bands      the validated weekly/monthly reverting range lines (horizon-reversion, VALIDATED) turned into prices
 *   expiries   per-expiry option zones from the expiry tracker (UNTESTED context until the expiry-tracker scoring
 *              prereg has expiries behind it)
 *
 * The proof tag on each part is data, not decoration: the page prints it beside the part. Pure: no I/O.
 */

export const REV = 6.0;            // must match analyse.py
export const SIGMA_WINDOW = 60;

export const PROOF = {
  validated: 'VALIDATED',
  exploratory: 'EXPLORATORY',
  context: 'CONTEXT',
  untested: 'UNTESTED',
};

// Pooled numbers from analysis/output/swing-leg-baserates/results_m15.json (OANDA NY-close, 11 instruments,
// 2018-01 -> 2026-08-21) with the Yahoo robustness run beside them. Copied, not recomputed live, because the study
// is frozen at the lockbox; js/swingMap.test.mjs checks they still match the results file.
export const BASE_RATES = {
  source: 'analysis/output/swing-leg-baserates/RESULTS.md',
  proof: PROOF.exploratory,
  legs: { down: { median: 11.06, p25: 8.02, p75: 16.84, p90: 23.81, days: 33 }, up: { median: 12.17, p25: 8.14, p75: 17.7, p90: 24.72, days: 48 } },
  furtherAfterTravelled: 'about 5 sigma more, whether the leg has gone 6 or 20 sigma (no exhaustion size)',
  afterFall: {
    condition: 'fall from the 1-year high >= 1.0 annualised sigma, RSI(14) < 30, at a 20-day closing low',
    n: 87, ret20: 0.405, ret20Ci: [0.184, 0.631], win: 0.678, pBounceFirst: 0.552, pBounceFirstCi: [0.43, 0.67],
    daysToBounce: 10, daysToFlush: 4, adverse60Median: 0.373, adverse60P75: 0.835,
    baseline: { ret20: 0.103, win: 0.565, pBounceFirst: 0.447, adverse60Median: 0.498 },
    yahoo: { n: 158, ret20: 0.246, ret20Ci: [0.073, 0.426], pBounceFirst: 0.443, baselineRet20: 0.068, baselinePBounce: 0.433 },
    barriers: { up: 0.75, down: 0.45, unit: 'sigma_d x sqrt(20)' },
  },
  afterRally: { n: 176, ret20: -0.126, ret20Ci: [-0.383, 0.153], pPullbackFirst: 0.324, baselinePPullback: 0.335 },
};

/** Daily log-return sigma, trailing window, aligned to bars (null until enough data). */
export function sigmaSeries(closes, win = SIGMA_WINDOW, minP = 40) {
  const r = closes.map((c, i) => (i ? Math.log(c / closes[i - 1]) : null));
  return closes.map((_, i) => {
    const xs = r.slice(Math.max(1, i - win + 1), i + 1).filter(Number.isFinite);
    if (xs.length < minP) return null;
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
  });
}

/** Wilder RSI on closes (same ewm(alpha=1/n, adjust=False) as the Python). */
export function rsiSeries(closes, n = 14) {
  let up = 0, dn = 0;
  return closes.map((c, i) => {
    if (!i) return null;
    const d = c - closes[i - 1], a = 1 / n;
    if (i === 1) { up = Math.max(d, 0); dn = Math.max(-d, 0); }
    else { up = a * Math.max(d, 0) + (1 - a) * up; dn = a * Math.max(-d, 0) + (1 - a) * dn; }
    return dn === 0 ? 100 : 100 - 100 / (1 + up / dn);
  });
}

/** Zigzag legs (port of analyse.py zigzag). bars: [{date, close}], sig aligned. */
export function zigzag(bars, sig, rev = REV) {
  const c = bars.map(b => b.close);
  const legs = [];
  let hi = 0, lo = 0, dir = 0, start = 0, ext = 0;
  for (let i = 1; i < c.length; i++) {
    if (dir === 0) {
      if (c[i] > c[hi]) hi = i;
      if (c[i] < c[lo]) lo = i;
      if (Math.log(c[hi] / c[i]) >= rev * sig[hi]) { dir = -1; start = hi; ext = i; }
      else if (Math.log(c[i] / c[lo]) >= rev * sig[lo]) { dir = 1; start = lo; ext = i; }
      continue;
    }
    if (dir === 1) {
      if (c[i] >= c[ext]) ext = i;
      else if (Math.log(c[ext] / c[i]) >= rev * sig[ext]) { legs.push([start, ext, 1]); dir = -1; start = ext; ext = i; }
    } else {
      if (c[i] <= c[ext]) ext = i;
      else if (Math.log(c[i] / c[ext]) >= rev * sig[ext]) { legs.push([start, ext, -1]); dir = 1; start = ext; ext = i; }
    }
  }
  const out = legs.map(([a, b, s]) => ({
    start: bars[a].date, end: bars[b].date, startPx: c[a], endPx: c[b], dir: s > 0 ? 'up' : 'down',
    pct: (c[b] / c[a] - 1) * 100, sigma: Math.abs(Math.log(c[b] / c[a])) / sig[a], days: b - a,
  }));
  const last = c.length - 1;
  const live = dir === 0 ? null : {
    start: bars[start].date, startPx: c[start], dir: dir > 0 ? 'up' : 'down',
    extreme: bars[ext].date, extremePx: c[ext],
    pct: (c[last] / c[start] - 1) * 100, sigma: Math.abs(Math.log(c[last] / c[start])) / sig[start], days: last - start,
  };
  return { legs: out, live };
}

const pctileOf = (xs, x) => (xs.length ? xs.filter(v => v < x).length / xs.length : null);

/**
 * The whole picture for one instrument.
 * bars: daily [{date, close}] ascending (OANDA NY-close; weekends already dropped). Needs >= 300 bars.
 * opts: { ladderWeeklyRev, ladderMonthlyRev } (js/forecastLadderReverting.js outputs, % of price),
 *       expiries: [{ expiry, dte, zones:[{px, oi, share, buildStreak, chgSinceFirst, distPct}], totalOI, centrePx, maxPain, stale, date }]
 */
export function buildSwingMap(bars, opts = {}) {
  const clean = (bars || []).filter(b => b && Number.isFinite(b.close) && b.close > 0);
  if (clean.length < 300) return { ok: false, error: `need >= 300 daily bars, have ${clean.length}` };
  const closes = clean.map(b => b.close);
  const sig = sigmaSeries(closes);
  const first = sig.findIndex(Number.isFinite);
  const bars2 = clean.slice(first), sig2 = sig.slice(first), c2 = closes.slice(first);
  const rsi = rsiSeries(closes).slice(first);
  const { legs, live } = zigzag(bars2, sig2);
  const n = c2.length - 1, last = c2[n], s = sig2[n], ann = s * Math.sqrt(252);
  const win = (k, f) => f(...c2.slice(Math.max(0, n - k + 1)));
  const hi252 = win(252, Math.max), lo252 = win(252, Math.min), hi20 = win(20, Math.max), lo20 = win(20, Math.min);
  const hi252i = n - [...c2.slice(Math.max(0, n - 251))].reverse().indexOf(hi252);
  const state = {
    date: bars2[n].date, close: last, sigmaDailyPct: s * 100, volAnnualPct: ann * 100, rsi14: rsi[n],
    fallFrom1yHighAnnSigma: Math.log(hi252 / last) / ann, riseFrom1yLowAnnSigma: Math.log(last / lo252) / ann,
    high1y: hi252, high1yDate: bars2[hi252i]?.date ?? null, low1y: lo252,
    at20dLow: last <= lo20, at20dHigh: last >= hi20,
  };
  state.fallSignal = state.fallFrom1yHighAnnSigma >= 1.0 && state.rsi14 < 30 && state.at20dLow;
  state.rallySignal = state.riseFrom1yLowAnnSigma >= 1.0 && state.rsi14 > 70 && state.at20dHigh;

  const own = legs.filter(l => live && l.dir === live.dir).map(l => l.sigma);
  const liveOut = live && { ...live, pctileVsOwn: pctileOf(own, live.sigma), ownLegs: own.length,
    ownMedianSigma: own.length ? [...own].sort((a, b) => a - b)[Math.floor(own.length / 2)] : null };

  // Base-rate barriers in price terms for TODAY's sigma (the look-back's +0.75 / -0.45 sigma*sqrt(20)).
  const unit = s * Math.sqrt(20);
  const sign = live?.dir === 'up' ? -1 : 1;           // after a rally the "bounce" is down
  const barriers = { bounce: last * Math.exp(sign * BASE_RATES.afterFall.barriers.up * unit),
    flush: last * Math.exp(-sign * BASE_RATES.afterFall.barriers.down * unit), unitPct: unit * 100 };

  const band = (lad, label, sessions) => {
    if (!lad?.oh || !lad?.ol) return null;
    const lv = r => ({ up: last * (1 + (lad.oh[r] ?? NaN) / 100), down: last * (1 - (lad.ol[r] ?? NaN) / 100) });
    return { label, sessions, p50: lv('p50'), p75: lv('p75'), p90: lv('p90'), sigmaUsedPct: lad.sigma_used_pct ?? null,
      halfLifeDays: lad.half_life_days ?? null, anchor: 'latest close', proof: PROOF.validated, ledger: 'horizon-reversion' };
  };
  const bands = [band(opts.ladderWeeklyRev, 'weekly (5 sessions)', 5), band(opts.ladderMonthlyRev, 'monthly (20 sessions)', 20)].filter(Boolean);

  const expiries = (opts.expiries || []).map(e => ({ ...e,
    zones: (e.zones || []).map(z => ({ ...z, inWeeklyP90: bands[0] ? z.px >= bands[0].p90.down && z.px <= bands[0].p90.up : null,
      inMonthlyP90: bands[1] ? z.px >= bands[1].p90.down && z.px <= bands[1].p90.up : null })),
    proof: PROOF.untested }));

  return {
    ok: true, generatedFor: state.date,
    series: bars2.map((b, i) => [b.date, b.close]),
    legs, live: liveOut, state, barriers, bands, expiries,
    baseRates: BASE_RATES,
    proofs: {
      legs: PROOF.context, live: PROOF.context, state: PROOF.exploratory, baseRates: PROOF.exploratory,
      bands: PROOF.validated, expiries: PROOF.untested,
    },
    notes: [
      'Leg size does not tell you when a leg ends: across 10 years, legs that had gone 6 sigma or 20 sigma went a further ~5 sigma either way.',
      'Bounce-before-flush odds after a deep fall equal the every-day baseline; the 20-day lean up is modest and exploratory.',
      'Option zones are untested context: OI walls have so far behaved like ordinary levels (wall-placebo), max pain does not pin.',
    ],
  };
}
