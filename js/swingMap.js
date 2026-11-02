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
export const MINOR_REV = 1.5;      // display-only finer swings

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
  afterRally: { n: 176, ret20: -0.126, ret20Ci: [-0.383, 0.153], pPullbackFirst: 0.324, baselinePPullback: 0.335, daysToPullback: 8, daysToContinue: 7, baselineDaysToPullback: 9, baselineDaysToContinue: 7 },
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

export const DTE_BUCKETS = [[0, 10], [11, 30], [31, 60], [61, 100]];
export const THIN_FLOOR = 0.10;     // an expiry under 10% of all live expiries' OI is too thin to read (prereg §3.2)

/**
 * Do the option readings agree with each other? Near-dated (<= 10 days, not thin) OI lean, the same expiries' one-day
 * charm hedge (dealers buy or sell), and the far (11-60 days) lean. Plain words for the page; all UNTESTED.
 */
export function signalCheck(expiries, live) {
  const ok = e => !e.thin && Number.isFinite(e.dte);
  const near = (expiries || []).filter(e => ok(e) && e.dte <= 10), far = (expiries || []).filter(e => ok(e) && e.dte > 10 && e.dte <= 60);
  const w = xs => xs.reduce((a, e) => a + (e.totalOI || 0), 0);
  const lean = xs => { const W = w(xs); if (!W) return null; const sh = xs.reduce((a, e) => a + (e.shareAbove ?? 0.5) * (e.totalOI || 0), 0) / W; return sh > 0.55 ? 'up' : sh < 0.45 ? 'down' : 'balanced'; };
  const charmSum = near.reduce((a, e) => a + (e.greeks?.charm1d ?? 0), 0);
  const charmNotional = near.reduce((a, e) => a + (e.greeks?.charmNotional ?? 0), 0);
  const charm = near.some(e => e.greeks) ? (charmSum > 0 ? 'buy' : charmSum < 0 ? 'sell' : 'flat') : null;
  const nl = lean(near), fl = lean(far);
  const parts = [];
  if (nl) parts.push(`near expiries (0-10 days) lean ${nl}`);
  if (charm) parts.push(`their one-day charm hedge is a dealer ${charm.toUpperCase()} of ${Math.abs(Math.round(charmSum))} contracts${charmNotional ? ` (about ${fmtMoney(Math.abs(charmNotional))})` : ''}`);
  if (fl) parts.push(`the 11-60 day expiries lean ${fl}`);
  const charmDir = charm === 'buy' ? 'up' : charm === 'sell' ? 'down' : null;
  const agree = nl && charmDir ? nl === charmDir : null;
  return { nearLean: nl, farLean: fl, charm, charmSum, charmNotional, agree, handover: nl && fl && nl !== 'balanced' && fl !== 'balanced' && nl !== fl,
    text: parts.length ? parts.join('; ') + '.' + (agree === false ? ' These disagree: the OI location and the dealer charm flow point opposite ways.' : agree ? ' These agree.' : '') : 'No readable expiries.' };
}
function fmtMoney(x) { return x >= 1e9 ? `$${(x / 1e9).toFixed(1)}bn` : x >= 1e6 ? `$${(x / 1e6).toFixed(0)}m` : `$${Math.round(x / 1e3)}k`; }

export const LEAN_BAND = 0.05;      // shareAbove within 0.45..0.55 reads as balanced

const lean = share => (share == null ? null : share > 0.5 + LEAN_BAND ? 'up' : share < 0.5 - LEAN_BAND ? 'down' : 'balanced');

/**
 * The option pull by days-to-expiry bucket: OI-weighted share of open interest above price, the weighted pull (OI
 * centre vs price, %), last night's build above vs below, and the build over the last `nights` nights from each
 * expiry's history. Then the term structure of the lean: where it changes side as expiries get further out
 * ("0-10 days leans down, 31-60 leans up"). UNTESTED context: nothing yet shows a book's lean moves price.
 */
export function pullByBucket(expiries, { buckets = DTE_BUCKETS, nights = 5 } = {}) {
  const out = buckets.map(([lo, hi]) => {
    const xs = (expiries || []).filter(e => !e.thin && Number.isFinite(e.dte) && e.dte >= lo && e.dte <= hi && Number.isFinite(e.shareAbove));
    const w = xs.reduce((a, e) => a + (e.totalOI || 0), 0);
    if (!xs.length || w <= 0) return { lo, hi, n: 0, lean: null };
    const wavg = f => xs.reduce((a, e) => a + (e[f] ?? 0) * (e.totalOI || 0), 0) / w;
    const recent = xs.reduce((acc, e) => {
      const h = (e.history || []).filter(r => !r[7]).slice(-nights);
      for (const r of h) { acc.above += r[4] ?? 0; acc.below += r[5] ?? 0; }
      return acc;
    }, { above: 0, below: 0 });
    const share = wavg('shareAbove');
    return { lo, hi, n: xs.length, expiries: xs.map(e => e.expiry), totalOI: w, shareAbove: share, pullPct: wavg('pullPct'),
      lean: lean(share), buildAbove: xs.reduce((a, e) => a + (e.buildAbove ?? 0), 0), buildBelow: xs.reduce((a, e) => a + (e.buildBelow ?? 0), 0),
      recentBuildAbove: recent.above, recentBuildBelow: recent.below,
      buildLean: recent.above + recent.below === 0 ? null : recent.above > recent.below ? 'up' : 'down' };
  });
  const sided = out.filter(b => b.lean === 'up' || b.lean === 'down');
  const flips = [];
  for (let i = 1; i < sided.length; i++) if (sided[i].lean !== sided[i - 1].lean)
    flips.push({ from: sided[i - 1].lean, to: sided[i].lean, nearBucket: `${sided[i - 1].lo}-${sided[i - 1].hi}`, farBucket: `${sided[i].lo}-${sided[i].hi}`,
      firstExpiry: sided[i].expiries?.[0] ?? null });
  const words = out.filter(b => b.n).map(b => `${b.lo}-${b.hi} days ${b.lean === 'balanced' ? 'balanced' : `leans ${b.lean}`} (${Math.round(b.shareAbove * 100)}% of OI above price)`);
  return { buckets: out, flips, summary: words.join('; ') + (flips.length ? `. The lean changes side from ${flips.map(f => `${f.from} to ${f.to} after the ${f.nearBucket}-day bucket`).join(', then ')}.` : words.length ? '. One side all the way out.' : ''),
    proof: PROOF.untested };
}

/** Weekday date `n` sessions after `date` (holidays not modelled). */
export function tradingDaysAhead(date, n) {
  let t = Date.parse(`${date}T00:00:00Z`), k = 0;
  while (k < n) { t += 864e5; const w = new Date(t).getUTCDay(); if (w !== 0 && w !== 6) k++; }
  return new Date(t).toISOString().slice(0, 10);
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
  // Every visible swing high/low for labelling: a finer zigzag (3 sigma) over the last ~18 months, each pivot marked
  // major when it is also a 6-sigma leg end. Display only; the base rates use the 6-sigma legs.
  const fine = zigzag(bars2, sig2, MINOR_REV);
  const majorDates = new Set(legs.flatMap(l => [l.start, l.end]).concat(live ? [live.start] : []));
  const fromDate = bars2[Math.max(0, bars2.length - 400)].date;
  const pivots = [];
  const addPv = (date, px, type) => { if (date >= fromDate && !pivots.some(p => p.date === date)) pivots.push({ date, px, type, major: majorDates.has(date) }); };
  for (const l of fine.legs) { addPv(l.start, l.startPx, l.dir === 'up' ? 'low' : 'high'); addPv(l.end, l.endPx, l.dir === 'up' ? 'high' : 'low'); }
  if (fine.live) addPv(fine.live.start, fine.live.startPx, fine.live.dir === 'up' ? 'low' : 'high');
  for (const l of legs) { addPv(l.start, l.startPx, l.dir === 'up' ? 'low' : 'high'); addPv(l.end, l.endPx, l.dir === 'up' ? 'high' : 'low'); }
  if (live) addPv(live.start, live.startPx, live.dir === 'up' ? 'low' : 'high');
  pivots.sort((a, b) => (a.date < b.date ? -1 : 1));
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
  // the 1-day expected move from the live daily ladder (validated as the forecaster's calibrated range); kept apart from
  // `bands` so bands[0] stays weekly and bands[1] monthly for every existing reader
  const bandDaily = band(opts.ladderDaily, '1 day', 1);

  // Thin books (under THIN_FLOOR of all live expiries' open interest, the expiry-tracker prereg's 10% floor) are shown
  // greyed and left out of the lean summary, the arrows and the Monte Carlo pull: a 261-contract weekly is not a book.
  const allOI = (opts.expiries || []).reduce((a, e) => a + (e.totalOI || 0), 0);
  const expiries = (opts.expiries || []).map(e => ({ ...e,
    oiShare: allOI > 0 ? (e.totalOI || 0) / allOI : null,
    thin: allOI > 0 ? (e.totalOI || 0) < THIN_FLOOR * allOI : true,
    zones: (e.zones || []).map(z => ({ ...z, inWeeklyP90: bands[0] ? z.px >= bands[0].p90.down && z.px <= bands[0].p90.up : null,
      inMonthlyP90: bands[1] ? z.px >= bands[1].p90.down && z.px <= bands[1].p90.up : null })),
    proof: PROOF.untested }));
  const signals = signalCheck(expiries, live);

  const pull = pullByBucket(expiries);

  // The two paths (the owner's preferred picture over the cone). Every waypoint is a measured number:
  //  A bounce first: the look-back's bounce barrier at its median sessions-to-bounce, then the monthly p75 high.
  //  B flush first:  the flush barrier at its median sessions-to-flush, then the monthly p75 low.
  // Odds are the look-back's bounce-first share after the deep-fall condition, printed beside the every-day baseline,
  // and only when the condition is on; otherwise the baseline alone. Waypoint dates are sessions ahead, not forecasts.
  const af = BASE_RATES.afterFall, ar = BASE_RATES.afterRally, mb = bands[1] ?? null;
  const rising = live?.dir === 'up';
  const on = rising ? state.rallySignal : state.fallSignal;
  // falling: A = bounce first (barriers.bounce is above). rising: A = pullback first (barriers.bounce is below).
  const pA = rising ? (on ? ar.pPullbackFirst : ar.baselinePPullback) : (on ? af.pBounceFirst : af.baseline.pBounceFirst);
  const baseA = rising ? ar.baselinePPullback : af.baseline.pBounceFirst;
  const dA = rising ? (on ? ar.daysToPullback : ar.baselineDaysToPullback) : (on ? af.daysToBounce : 11), dB = rising ? (on ? ar.daysToContinue : ar.baselineDaysToContinue) : (on ? af.daysToFlush : 7);
  const leg = (sessions, px, label, proof) => ({ sessions, date: tradingDaysAhead(state.date, sessions), px, label, proof });
  const start = { sessions: 0, date: state.date, px: last, label: 'last close' };
  const mUp = mb ? leg(20, mb.p75.up, 'monthly p75 high (reached 1 time in 4)', PROOF.validated) : null;
  const mDn = mb ? leg(20, mb.p75.down, 'monthly p75 low (reached 1 time in 4)', PROOF.validated) : null;
  const paths = [
    { key: 'A', name: rising ? 'Pullback first' : 'Bounce first', prob: pA, baseline: baseA, conditionOn: on,
      points: [start, leg(dA, barriers.bounce, `${rising ? 'pullback' : 'bounce'} barrier (median ${dA} sessions when it comes first)`, PROOF.exploratory), ...((rising ? mDn : mUp) ? [rising ? mDn : mUp] : [])] },
    { key: 'B', name: rising ? 'Continue first' : 'Flush first', prob: 1 - pA, baseline: 1 - baseA, conditionOn: on,
      points: [start, leg(dB, barriers.flush, `${rising ? 'continuation' : 'flush'} barrier (median ${dB} sessions when it comes first)`, PROOF.exploratory), ...((rising ? mUp : mDn) ? [rising ? mUp : mDn] : [])] },
  ];


  return {
    ok: true, generatedFor: state.date,
    series: bars2.map((b, i) => [b.date, b.close]),
    legs, live: liveOut, pivots, state, barriers, bands, bandDaily, expiries, pull, paths, signals,
    baseRates: BASE_RATES,
    proofs: {
      legs: PROOF.context, live: PROOF.context, state: PROOF.exploratory, baseRates: PROOF.exploratory,
      bands: PROOF.validated, expiries: PROOF.untested, pull: PROOF.untested, paths: PROOF.exploratory,
    },
    notes: [
      'Leg size does not tell you when a leg ends: across 10 years, legs that had gone 6 sigma or 20 sigma went a further ~5 sigma either way.',
      'Bounce-before-flush odds after a deep fall equal the every-day baseline; the 20-day lean up is modest and exploratory.',
      'Option zones are untested context: OI walls have so far behaved like ordinary levels (wall-placebo), max pain does not pin.',
    ],
  };
}
