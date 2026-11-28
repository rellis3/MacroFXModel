// js/terminal/levelEngineCore.js: the LEVEL ENGINE (plans/LEVEL_ENGINE_ROADMAP.md, Phases 2 and 5 as an output layer). For one market, a price X and a horizon it answers
// the roadmap's questions with ONLY the components the Evidence Book holds, each number carrying the Evidence id it rests on and that entry's verdict:
//
//   Q1 REACH     P(price touches X)                  from now to 22:00 London and within 30/60/120/240 minutes (the frozen Phase 2 model M1 in js/levelReach.js,
//                                                     level-p2-reach VALIDATED; what the level IS adds nothing, level-p2-identity NULL),
//                                                     the whole session (the forecast ladder, ladder-calibration VALIDATED), the whole week (the reverting weekly
//                                                     ladder, horizon-reversion VALIDATED) and, from now to Friday's close, plain geometry (Brownian, CONTEXT).
//   Q2 RACE      P(X before Y), P(neither by T)      a driftless random walk between the two levels, its scale taken from M1's reach of each level. A fitted race model
//                                                     does not beat b/(a+b) (level-p2-race NULL; real lines race like placebo lines, live-range-line-race NULL), so geometry it is.
//   Q4 MOVE      how far price may go AGAINST on the way: the chance of an adverse move of m before X is touched, from the same race (geometry, CONTEXT); with the
//                drawdown layer (drawdown-forecast-error-fx / -idx VALIDATED: after a 20-day S&P fall of 2% or more, ranges run ~6-7% FX / ~3% index wider than the
//                lines) shown SIDE BY SIDE, never replacing the base number.
//   Q3 REACTION  what happens after a touch: next-rung odds (line-touch-reach VALIDATED; exhaustion-v2-lockbox VALIDATED for NQ, GOLD, EURUSD by London hour) and the
//                fade / continue edge, which is NULL: placebo after costs (level-context-engine, level-near-miss-entry, live-range-line-race).
//   Q5 TRADE     none. No level trade has positive expectancy after costs; the engine says so and never implies a direction.
//
// Pure: no DOM, no fetch, no clock (nowMs is passed in, so the time machine's as-of time works). No lookahead: bars later than nowMs are dropped before use.
import { reach, exceedance, harSigmaDailyPct, londonOpenMs, checkpointAt } from './reachCore.js';
import { scenarios as m1Scenarios, END_MIN } from '../levelReach.js';

const fin = v => v != null && Number.isFinite(+v);
export const HORIZONS = ['ROS', 'EOD', 'EOW'];
export const HORIZON_LABEL = { ROS: 'Rest of the London day (from now to 22:00)', EOD: 'At any point in today\'s session (from its open)', EOW: 'At any point this week (from Monday\'s open)' };
const INDICES = new Set(['NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100']);

/** Every component the engine shows, with the Evidence id it rests on and that entry's verdict (the test checks both against js/deskEvidence.js). `shown` overrides the chip word
 *  when the number is not the tested thing itself (plain geometry beside a validated model is CONTEXT, never borrowed validation). */
export const COMPONENTS = {
  m1:         { ev: 'level-p2-reach', verdict: 'validated', note: 'The Phase 2 reach model for ANY level price (distance in sigma over the vol-time left, range used, extension side, hour, class), fitted before 2022: Brier skill +1.7% [+1.1, +2.2] over plain vol-time geometry at 22:00 (+5.4% at 30 minutes), calibration gap 5.7 -> 0.9 points, every class above 0. Starts at 03:00 London; 0.05-3 sigma.' },
  identity:   { ev: 'level-p2-identity', verdict: 'null', note: 'What the level is (ladder line, pivot, prior high, round number, VWAP, fib...) adds no reach information: -0.01% [-0.03, +0.02]. The chance depends on where the level is, not what it is.' },
  session:    { ev: 'ladder-calibration', verdict: 'validated', note: 'The forecast ladder: price reaches its p50 line 50%, p75 25%, p90 10% of sessions by design; off by up to ~3 points by volatility regime.' },
  p90:        { ev: 'day-recon-p90-boundary', verdict: 'context', note: 'p90 is a frequency (about one day in ten), not a ceiling: two thirds of the days that reach it go a further quarter sigma.' },
  week:       { ev: 'horizon-reversion', verdict: 'validated', note: 'Weekly lines that let sigma fade back to its long-run level beat the square-root-of-time lines on 33 of 33 instruments.' },
  geometry:   { ev: 'level-p2-reach', verdict: 'validated', shown: 'context', note: 'Plain random-walk geometry, not a fitted model: within the day it overstates reach by 5-9 points at the decile level (Phase 2; M1 fixes that), and the near-miss study found it under-predicts at very short range. The chip is the Phase 2 model it is scaled to (to 22:00) or compared with (to Friday): read these as approximate.' },
  race:       { ev: 'level-p2-race', verdict: 'null', note: 'Which level first: a fitted model does not beat the random walk b/(a+b) (+0.05% [-0.03, +0.12]); b/(a+b) is already calibrated within about 2 points. Within a time limit the same walk is used, scaled so the reach of each level matches M1. Real lines race like placebo lines (live-range-line-race).' },
  drawdown:   { ev: 'drawdown-forecast-error-fx', ev2: 'drawdown-forecast-error-idx', verdict: 'validated', note: 'After a 20-day S&P fall of 2% or more, FX ranges run about 6.7% and index ranges about 2.8% wider than the shipped lines (in-sample validated; the forward shadow record is research only).' },
  nextRung:   { ev: 'line-touch-reach', verdict: 'validated', note: 'After a line is touched, the odds of the next line before the close hold: p50 to p75 about 50%, p75 to p90 about 40%.' },
  exhaustion: { ev: 'exhaustion-v2-lockbox', verdict: 'validated', note: 'Out of sample (2026-08-24 to 2026-11-18, ~1,560 touches a track): next-rung odds fall through the London day, 25-27% observed after 16:00.' },
  adverse:    { ev: 'vol-layer-stops-confirm-skill', verdict: 'validated', note: 'The vol-clock + spread model of adverse-move odds beats sigma-only on unseen data; it is not wired into the terminal yet, so the adverse-move odds here are the plain geometry.' },
  reaction:   { ev: 'level-context-engine', verdict: 'null', note: 'Fading or following a touch: net -0.18R / -0.15R, line minus placebo about 0 (645k futures + 1.1M CFD touches, 2020-2026). Placebo after costs.' },
  nearMiss:   { ev: 'level-near-miss-entry', verdict: 'null', note: 'Price turns before our lines no more than before placebo lines: 15.9% vs 15.8% (645k approach episodes).' },
  lineRace:   { ev: 'live-range-line-race', verdict: 'null', note: 'Continue or fade at a touch: real = placebo within 1 point pooled (92,914 real vs 96,912 placebo touches).' },
};

/** X7 next-rung odds after a touch, by London hour bucket (exhaustion-v2-lockbox RESULTS.md, CFD track; futures within 1-2 points). NQ, GOLD, EURUSD only. */
export const X7_BUCKETS = [{ from: 0, to: 7, p: 0.65, obs: 0.59 }, { from: 7, to: 12, p: 0.56, obs: 0.56 }, { from: 12, to: 16, p: 0.48, obs: 0.43 }, { from: 16, to: 22, p: 0.28, obs: 0.25 }];
export const X7_MARKETS = new Set(['NQ', 'GOLD', 'EURUSD']);
export const DRAWDOWN_RULE = { thresholdPct: -2.0, factor: { fx: 1.067, idx: 1.028 } };   // the same rule as js/drawdownShadowCore.js (a test checks they agree)

// ── normal distribution and first passage ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** Standard normal CDF (Abramowitz and Stegun 7.1.26 erf, error < 1.5e-7). */
export function normCdf(z) {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}
/** P(a driftless random walk with spread s over the horizon touches a level d away) = 2(1 - N(d/s)) (the reflection principle). */
export function brownianReach(d, s) {
  if (!(d > 0)) return 1;
  if (!(s > 0)) return 0;
  return Math.min(1, 2 * (1 - normCdf(d / s)));
}
/** The spread s for which brownianReach(d, s) = p (bisection; null when p is not in (0, 1)). */
export function impliedScale(d, p) {
  if (!(d > 0) || !(p > 0) || !(p < 1)) return null;
  let lo = d * 1e-4, hi = d * 1e4;
  for (let i = 0; i < 200; i++) { const mid = Math.sqrt(lo * hi); if (brownianReach(d, mid) < p) lo = mid; else hi = mid; }
  return Math.sqrt(lo * hi);
}
/**
 * Two levels, one a above and one b below the price (both > 0, same units as s = sigma x sqrt(time left)). A driftless random walk killed at either:
 *   P(top first by T) = b/L - sum_k 2(-1)^(k+1)/(k pi) sin(k pi b/L) exp(-k^2 pi^2 s^2 / (2 L^2)),  L = a + b  (Fourier series of the heat equation)
 * and the same with a and b swapped for the bottom. Returns { top, bottom, neither, top_eventually: b/L }.
 */
export function race2(a, b, s) {
  if (!(a > 0) || !(b > 0)) return null;
  const L = a + b, eventual = b / L;
  if (!(s > 0)) return { top: 0, bottom: 0, neither: 1, top_eventually: eventual };
  const side = x => {
    let sum = 0;
    for (let k = 1; k <= 20000; k++) {
      const e = Math.exp(-k * k * Math.PI * Math.PI * s * s / (2 * L * L));
      sum += 2 * (k % 2 ? 1 : -1) / (k * Math.PI) * Math.sin(k * Math.PI * x / L) * e;
      if (e < 1e-14) break;
    }
    return Math.min(1, Math.max(0, x / L - sum));
  };
  const top = side(b), bottom = side(a);
  return { top, bottom, neither: Math.max(0, 1 - top - bottom), top_eventually: eventual };
}

// ── time ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const londonParts = ms => {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
  const o = {}; for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
  return { date: `${o.year}-${o.month}-${o.day}`, dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday), hour: +o.hour };
};
/** The London date (YYYY-MM-DD) of an instant. */
export const londonDate = ms => londonParts(ms).date;
/** Epoch ms of 00:00 London on the Monday of the week holding nowMs (a Saturday or Sunday belongs to the week just ended). Research convention london22: Sunday-evening bars are outside it. */
export function weekOpenMs(nowMs) {
  const { dow } = londonParts(nowMs), back = dow === 0 ? 6 : dow - 1;
  let open = londonOpenMs(nowMs);
  for (let i = 0; i < back; i++) open = londonOpenMs(open - 3600e3);
  return open;
}
/** Sessions of time left until Friday 22:00 London, counting today's remaining London hours (00:00-22:00 = one session) as a fraction. 0 at a weekend. */
export function sessionsLeftInWeek(nowMs) {
  const { dow } = londonParts(nowMs); if (dow === 0 || dow === 6) return 0;
  const h = checkpointAt(nowMs).hours, today = Math.max(0, Math.min(1, (22 - h) / 22));
  return today + (5 - dow);
}
/** Sessions of time left today (to 22:00 London), 0 at a weekend or after 22:00. */
export function sessionsLeftToday(nowMs) {
  const { dow } = londonParts(nowMs); if (dow === 0 || dow === 6) return 0;
  return Math.max(0, Math.min(1, (22 - checkpointAt(nowMs).hours) / 22));
}
/** The X7 bucket (next-rung odds after a touch) for the London hour of nowMs. */
export const x7At = nowMs => { const h = checkpointAt(nowMs).hours; return X7_BUCKETS.find(b => h >= b.from && h < b.to) ?? null; };

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const drawdownClass = sym => (INDICES.has(sym) ? 'idx' : (/^[A-Z]{6}$/.test(sym) && sym !== 'BTCUSD' ? 'fx' : null));
/** The drawdown layer for a market: { on, factor, spx20, cls } (on = the 20-day S&P fall rule fired and the market is FX or an index). */
export function drawdownLayer(sym, spx20) {
  const cls = drawdownClass(String(sym).toUpperCase());
  const on = fin(spx20) && +spx20 <= DRAWDOWN_RULE.thresholdPct && !!cls;
  return { on, cls, spx20: fin(spx20) ? +spx20 : null, factor: on ? DRAWDOWN_RULE.factor[cls] : 1 };
}
const asOfBars = (bars, nowMs) => (bars ?? []).filter(b => fin(b?.time) && b.time * 1000 <= nowMs);
const ladderOf = (fc, kind) => (kind === 'week' ? (fc?.ladder_weekly_rev ?? fc?.ladder_weekly ?? null) : (fc?.ladder ?? null));
const rungsFor = (L, side, f = 1) => { const r = L?.[side === 'up' ? 'oh' : 'ol']; return r && fin(r.p50) && fin(r.p75) && fin(r.p90) ? [{ x: r.p50 * f, p: 0.5 }, { x: r.p75 * f, p: 0.25 }, { x: r.p90 * f, p: 0.1 }] : null; };
const sigmaPct = fc => harSigmaDailyPct(fc) ?? (fc?.ladder?.sigma_daily_pct > 0 ? fc.ladder.sigma_daily_pct : null);

/** The probability of touching `level` from an anchor (an open) with a ladder, as exceedance of the move from the anchor (1 once the move is <= 0). */
function fromAnchor(L, side, anchor, level, f = 1) {
  const rungs = rungsFor(L, side, f); if (!rungs || !(anchor > 0)) return null;
  const x = (side === 'up' ? level - anchor : anchor - level) / anchor * 100;
  const ex = x <= 0 ? { p: 1, tail: false } : exceedance(rungs, x);
  return { p: ex.p, tail: ex.tail, xPct: x, lines: { p50: anchor * (1 + (side === 'up' ? 1 : -1) * rungs[0].x / 100), p75: anchor * (1 + (side === 'up' ? 1 : -1) * rungs[1].x / 100), p90: anchor * (1 + (side === 'up' ? 1 : -1) * rungs[2].x / 100) } };
}

/** Which daily ladder line (if any) X sits on, within a tenth of the day's sigma: { name: 'p50'|'p75'|'p90', side, price } or null. */
export function nearestLine(L, open, level, sigmaPrice) {
  if (!L || !(open > 0) || !(sigmaPrice > 0)) return null;
  let best = null;
  for (const side of ['up', 'down']) {
    const r = L[side === 'up' ? 'oh' : 'ol']; if (!r) continue;
    for (const name of ['p50', 'p75', 'p90']) {
      if (!fin(r[name])) continue;
      const price = open * (1 + (side === 'up' ? 1 : -1) * r[name] / 100), gap = Math.abs(price - level);
      if (gap <= 0.1 * sigmaPrice && (!best || gap < best.gap)) best = { name, side, price, gap };
    }
  }
  return best;
}

/**
 * The whole card for one market and one level (and optionally a second level for the race). inputs:
 *   sym, fc (the instrument's /api/vol-forecast entry), bars (5-minute desk bars, ascending, time in seconds), weekBars (hourly desk bars reaching back to Monday; optional),
 *   nowMs (the live clock or the time machine's as-of time), level, level2 (optional), horizon ('ROS' | 'EOD' | 'EOW'), spx20 (S&P 20-day log return %, optional).
 * Returns { ok, ... } or { ok: false, error }.
 */
export function levelCard({ sym, fc, bars, weekBars = null, nowMs, level, level2 = null, horizon = 'ROS', spx20 = null }) {
  sym = String(sym ?? '').toUpperCase();
  if (!HORIZONS.includes(horizon)) horizon = 'ROS';
  if (!fin(level) || !(level > 0)) return { ok: false, error: 'Type a price level.' };
  if (!fin(nowMs)) return { ok: false, error: 'No clock.' };
  const b5 = asOfBars(bars, nowMs), b1 = asOfBars(weekBars, nowMs);
  if (!b5.length && !b1.length) return { ok: false, error: 'No prices for this market up to that time.' };
  if (!fc) return { ok: false, error: `No forecast for ${sym}.` };
  const base = b5.length ? b5 : b1, P = base[base.length - 1].close;
  const sig = sigmaPct(fc), sigmaPrice = sig > 0 ? sig / 100 * P : null;
  const dd = drawdownLayer(sym, spx20);
  const notes = [];

  // the session so far (London midnight open, high and low) from the existing calculator, so it cannot drift from what the desk showed before
  const r = reach({ sym, fc, bars: b5.length ? b5 : b1, nowMs, level });
  if (!r.ok) return { ok: false, error: r.error };
  const side = r.side, dist = Math.abs(level - P);
  const todayLeft = sessionsLeftToday(nowMs), londonMin = checkpointAt(nowMs).hours * 60;
  // Q1 REACH from now to 22:00 London: the frozen Phase 2 model M1 (js/levelReach.js, the S3 shadow's model): distance in sigma over the vol-time left, range used, extension side, hour, class
  const m1 = price => {
    if (!(todayLeft > 0) || !r.started || londonMin >= END_MIN) return { ok: false, why: todayLeft > 0 ? 'the session has not started' : 'the market is shut (weekend) or the London day is over' };
    const sc = m1Scenarios({ sym, open: r.open, price: P, high: r.sessionHigh, low: r.sessionLow, sigmaDailyPct: fc.ladder?.sigma_daily_pct, londonMin }, [{ price, family: 'typed', label: 'typed' }]);
    if (!sc.ok) return { ok: false, why: sc.why };
    const x = sc.levels[0];
    return x.eligible ? { ok: true, p: x.p, geo: x.geo, unit: sc.unit } : { ok: false, why: x.why };
  };
  const mX = m1(level);
  if (!r.started) notes.push(todayLeft > 0 ? 'The London session of today has not started, so the session chance is its prior measured from the last price.' : 'The market is shut: the session chance is the prior of the next session measured from the last price, and "this week" is the week just ended.');
  const reachOut = { ROS: null, EOD: null, EOW: null, EOWnow: null };
  if (mX.ok) reachOut.ROS = { p: mX.p.end, by: { '30': mX.p['30'], '60': mX.p['60'], '120': mX.p['120'], '240': mX.p['240'] }, geometry: mX.geo.end, c: 'm1' };
  else if (r.alreadyTouched) reachOut.ROS = { p: 1, touched: true, c: 'm1' };
  else notes.push(`No from-now chance today: ${mX.why === 'beyond 3σ' ? 'the level is more than 3 sigma away (outside the range the model covers)' : mX.why === 'at price' ? 'the level is within 0.05 sigma of the price' : mX.why === 'model starts 03:00 London' ? 'the model starts at 03:00 London' : mX.why}.`);
  if (r.whole) {
    const withDd = dd.on ? fromAnchor(fc.ladder, side, r.open, level, dd.factor) : null;
    reachOut.EOD = { p: r.whole.p, band: r.whole.band, tail: r.whole.tail, lines: r.whole.rungs, fromOpen: r.whole.fromOpen, c: r.whole.tail ? 'p90' : 'session', drawdown: withDd ? { p: withDd.p } : null };
  }
  // the week, from Monday's open on the reverting weekly ladder
  const wOpenMs = weekOpenMs(nowMs), wk = (b1.length ? b1 : b5).filter(b => b.time * 1000 >= wOpenMs), today = b5.filter(b => b.time * 1000 >= wOpenMs);
  const wBars = [...wk, ...today.filter(b => !wk.length || b.time > wk[wk.length - 1].time)];
  const LW = ladderOf(fc, 'week');
  if (wBars.length && LW) {
    const wOpen = wBars[0].open, wHi = Math.max(...wBars.map(b => b.high)), wLo = Math.min(...wBars.map(b => b.low));
    const w = fromAnchor(LW, side, wOpen, level), wDd = dd.on ? fromAnchor(LW, side, wOpen, level, dd.factor) : null;
    const coversMonday = londonDate(wBars[0].time * 1000) === londonDate(wOpenMs);
    if (w) reachOut.EOW = { p: w.p, tail: w.tail, lines: w.lines, open: wOpen, alreadyTouched: side === 'up' ? wHi >= level : wLo <= level, c: 'week', ladder: fc.ladder_weekly_rev ? 'reverting' : 'square-root', drawdown: wDd ? { p: wDd.p } : null, coversMonday };
    if (w && !coversMonday) notes.push('The hourly bars held do not reach back to Monday\'s open, so the week is measured from the earliest bar held: read the weekly chance loosely.');
  } else if (!LW) notes.push('No weekly ladder for this market, so no whole-week chance.');
  const weekLeft = sessionsLeftInWeek(nowMs);
  if (sigmaPrice && weekLeft > 0) {
    const s = sigmaPrice * Math.sqrt(weekLeft);
    reachOut.EOWnow = { p: brownianReach(dist, s), s, sessionsLeft: weekLeft, c: 'geometry', drawdown: dd.on ? { p: brownianReach(dist, s * dd.factor) } : null };
  }
  if (reachOut.EOW?.alreadyTouched) notes.push(`Price has already touched ${level} this week; the whole-week chance counts that touch (100% by the week's own measure from its open).`);

  // the spread s to the end of the horizon, for the race and the adverse move: to 22:00 London the random walk is scaled so its reach equals M1's for that distance; to Friday, sigma x sqrt(sessions left)
  const sToday = sigmaPrice && todayLeft > 0 ? sigmaPrice * Math.sqrt(todayLeft) : null;
  const scaleAt = price => { const m = m1(price); return m.ok && m.p.end > 0 && m.p.end < 1 ? impliedScale(Math.abs(price - P), m.p.end) : null; };
  const scaleFor = (d, hz) => (hz === 'EOW' ? reachOut.EOWnow?.s ?? null : scaleAt(side === 'up' ? P + d : P - d) ?? sToday);
  const horizonEnd = horizon === 'EOW' ? 'Friday\'s 22:00 London close' : 'the 22:00 London close';

  // Q2 RACE (two levels)
  let race = null;
  if (fin(level2) && level2 > 0 && level2 !== level) {
    const up = Math.max(level, level2), dn = Math.min(level, level2);
    if (up > P && dn < P) {
      const a = up - P, b = P - dn;
      // the scale from each side's M1 reach (geometric mean of the two), so the race agrees with the reach numbers on the card
      let s = null;
      if (horizon === 'EOW') s = reachOut.EOWnow?.s ?? null;
      else { const su = scaleAt(up), sd = scaleAt(dn); s = su && sd ? Math.sqrt(su * sd) : (su ?? sd ?? sToday); }
      const rr = s ? race2(a, b, s) : null;
      race = rr ? { up, down: dn, upFirst: rr.top, downFirst: rr.bottom, neither: rr.neither, upEventually: rr.top_eventually, s, end: horizonEnd, c: 'race',
        drawdown: dd.on ? (() => { const x = race2(a, b, s * dd.factor); return { upFirst: x.top, downFirst: x.bottom, neither: x.neither }; })() : null } : { up, down: dn, error: 'No time left in this horizon (or no sigma), so the race has no answer.' };
    } else {
      const near = Math.abs(level - P) < Math.abs(level2 - P) ? level : level2;
      race = { sameSide: true, first: near, note: `Both levels are on the same side of the price, so ${near} (the nearer) is always touched first; the chance of the farther one is its own reach.` };
    }
  }

  // Q4 MOVE: how far against on the way to X (adverse move m before X, within the horizon): the race between X and a level m the other way
  const sX = scaleFor(dist, horizon);
  const mae = [];
  if (sigmaPrice && dist > 0) {
    for (const k of [0.25, 0.5, 1]) {
      const m = k * sigmaPrice, against = side === 'up' ? P - m : P + m;
      const x = sX ? race2(dist, m, sX) : null;    // top = X first (X is "a" above in the mirrored frame), bottom = adverse first
      const y = sX && dd.on ? race2(dist, m, sX * dd.factor) : null;
      mae.push({ k, m, price: against, againstFirst: x?.bottom ?? null, xFirst: x?.top ?? null, againstEventually: dist / (dist + m), drawdown: y ? { againstFirst: y.bottom } : null });
    }
  }

  // Q3 REACTION: what is known after a touch
  const L = fc.ladder, line = nearestLine(L, r.open, level, sigmaPrice);
  const x7 = X7_MARKETS.has(sym) ? x7At(nowMs) : null;
  const after = {
    line,
    nextRung: line?.name === 'p50' ? { p: 0.5, from: 'p50', to: 'p75', c: 'nextRung' } : line?.name === 'p75' ? { p: 0.4, from: 'p75', to: 'p90', c: 'nextRung' } : line?.name === 'p90' ? { c: 'p90' } : null,
    x7: x7 ? { ...x7, c: 'exhaustion' } : null,
    reaction: { verdict: 'null', items: ['reaction', 'nearMiss', 'lineRace'] },
  };

  return {
    ok: true, sym, price: P, level, level2: fin(level2) ? +level2 : null, side, distancePct: (level - P) / P * 100, dSigma: sigmaPrice ? dist / sigmaPrice : null, sigmaPrice, sigmaPct: sig,
    horizon, horizonEnd, open: r.open, started: r.started, alreadyTouched: r.alreadyTouched, sessionHigh: r.sessionHigh, sessionLow: r.sessionLow, checkpoint: r.checkpoint,
    reach: reachOut, race, mae, after, drawdown: dd, notes, asOfMs: nowMs, lastBarMs: base[base.length - 1].time * 1000,
  };
}

/** The headline number for the chosen horizon ({ p, c, label } or null): ROS = M1 from now to 22:00; EOD = the session ladder; EOW = the weekly ladder from Monday. */
export function headline(card) {
  if (!card?.ok) return null;
  const x = card.reach[card.horizon];
  return x ? { p: x.p, c: x.c, label: HORIZON_LABEL[card.horizon] } : null;
}

/** Levels at multiples of the day's sigma either side of the price, each with its chance for the chosen horizon (for the clickable ladder). */
export function ladderLevels(args, mults = [0.25, 0.5, 1, 1.5, 2, 3]) {
  const b = asOfBars(args.bars?.length ? args.bars : args.weekBars, args.nowMs), P = b[b.length - 1]?.close, sig = sigmaPct(args.fc);
  if (!(P > 0) || !(sig > 0)) return [];
  const unit = sig / 100 * P;
  const pick = c => { if (!c.ok) return null; const h = c.reach[c.horizon]; return h ? h.p : null; };
  return mults.map(k => ({ k, up: { level: P + k * unit, p: pick(levelCard({ ...args, level: P + k * unit, level2: null })) }, down: { level: P - k * unit, p: pick(levelCard({ ...args, level: P - k * unit, level2: null })) } }));
}

/** Parse the command-line words after REACH: '<market> <price> [<price2>] [ROS|EOD|EOW]'. resolve(word) -> instrument key or null. */
export function parseReachArgs(args, resolve) {
  const toks = String(args ?? '').trim().split(/\s+/).filter(Boolean), out = { inst: null, level: null, level2: null, horizon: null };
  const HZ = { ROS: 'ROS', REST: 'ROS', TODAY: 'ROS', EOD: 'EOD', DAY: 'EOD', SESSION: 'EOD', EOW: 'EOW', WEEK: 'EOW' };
  for (const t of toks) {
    const u = t.toUpperCase(), n = parseFloat(t.replace(/,/g, ''));
    if (HZ[u]) { out.horizon = HZ[u]; continue; }
    if (/^[-+]?\d[\d,]*\.?\d*$/.test(t) && Number.isFinite(n) && n > 0) { if (out.level == null) out.level = n; else if (out.level2 == null) out.level2 = n; else return { error: 'At most two prices: REACH <market> <price> [<second price>] [ROS|EOD|EOW].' }; continue; }
    const k = resolve ? resolve(t) : null;
    if (k && !out.inst) { out.inst = k; continue; }
    return { error: `"${t}" is not a market, a price or a horizon (ROS, EOD, EOW) I know. Try REACH GOLD 4200 EOD or REACH EURUSD 1.17 1.15.` };
  }
  return out;
}
