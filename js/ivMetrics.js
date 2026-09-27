/**
 * IV-surface metrics from the CME QuikStrike settlement paste — the tradeable reads
 * beyond charm/vanna. Pure, offline-testable; all fed by `parseIVSettlement`.
 *
 *   expectedMove(...)  → the option market's implied range to expiry (ATM straddle).
 *                        REAL, definitional — a legit cross-check vs the vol cone.
 *   ivDynamics(...)    → per-strike IV change: ATM direction + skew steepening
 *                        (tail-hedging demand). Makes vanna a LIVE read.
 *   riskReversal(...)  → OTM put IV − OTM call IV: directional sentiment tilt.
 *   vannaState(...)    → combine VEX sign + IV direction → the classic vanna read.
 *
 * HONESTY: expected move is real. IV-change, risk-reversal and the vanna read are
 * positioning/sentiment CONTEXT — folklore-tier for direction, strongest on equity
 * indices, weak on gold, partial/unmeasurable on FX. Not validated signals.
 */

const _atmIndex = (strikes, spot) => {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < strikes.length; i++) { const d = Math.abs(strikes[i] - spot); if (d < bd) { bd = d; bi = i; } }
  return bi;
};

// Expected move ≈ the ATM straddle (call+put settle at the nearest strike) — the
// option market's ~1σ implied range to expiry. `daily` scales it by 1/√DTE.
// An ATM straddle can never be worth a large fraction of the underlying — a 1-month
// ATM straddle runs a few percent of spot, and the implied move is bounded by that.
// So a "move" anywhere near spot means the straddle column was mis-parsed, not that
// the market expects a 100% swing. NQ stored move 28,591 on spot 28,565 (100.09%,
// lower bound MINUS 26) because a Settlements term-structure table was pasted into the
// per-strike smile box and `parseIVSettlement` read the futures settle as the put
// price. Nothing checked, so it was stored, surfaced, and silently disabled the OI
// bot's reachability gate (nothing is ever beyond a 100% move).
//
// Reject rather than return garbage: callers already handle null by falling back.
export const MAX_IMPLIED_MOVE_FRAC = 0.25;   // 25% of spot — far above any real ATM straddle
// …and a FLOOR. The original guard only caught "too big", so USD/JPY stored an implied
// move of 0.003 against a spot of 163.87 — 0.0018%, which is not a move, it is a unit
// mismatch (the 6J straddle is priced in USD-per-JPY while spot is JPY-per-USD). An ATM
// straddle is worth a meaningful fraction of spot at any real DTE; a few hundredths of a
// percent means the two numbers are in different units.
export const MIN_IMPLIED_MOVE_FRAC = 0.0005;   // 0.05% of spot
function _sane(move, spot) {
  return Number.isFinite(move) && move > 0 && spot > 0
    && move > spot * MIN_IMPLIED_MOVE_FRAC
    && move < spot * MAX_IMPLIED_MOVE_FRAC && (spot - move) > 0;
}

export function expectedMove(strikes, callPx, putPx, spot, { dte = null } = {}) {
  if (!Array.isArray(strikes) || !strikes.length || !(spot > 0)) return null;
  const i = _atmIndex(strikes, spot);
  const c = callPx?.[i], p = putPx?.[i];
  if (!(c >= 0) || !(p >= 0)) return null;
  const move = c + p;                                   // ± range to expiry (~1σ)
  if (!_sane(move, spot)) return null;                  // mis-parsed column — see MAX_IMPLIED_MOVE_FRAC
  return {
    atmStrike: strikes[i], straddle: +move.toFixed(4),
    move: +move.toFixed(4), pct: +(move / spot * 100).toFixed(3),
    upper: +(spot + move).toFixed(6), lower: +(spot - move).toFixed(6),
    daily: dte > 0 ? +(move / Math.sqrt(dte)).toFixed(4) : null, dte: dte ?? null,
  };
}

// Expected move straight from a KNOWN ATM straddle price (the CME "Settlements"
// per-expiry table gives the straddle settle directly — no per-strike reconstruction
// needed). Same shape as expectedMove() so it drops into the same slots. Pure.
export function expectedMoveFromStraddle(spot, straddle, { dte = null, atmStrike = null } = {}) {
  if (!(spot > 0) || !(straddle > 0)) return null;
  const move = straddle;
  if (!_sane(move, spot)) return null;                  // mis-parsed column — see MAX_IMPLIED_MOVE_FRAC
  return {
    atmStrike: atmStrike ?? null, straddle: +move.toFixed(4),
    move: +move.toFixed(4), pct: +(move / spot * 100).toFixed(3),
    upper: +(spot + move).toFixed(6), lower: +(spot - move).toFixed(6),
    daily: dte > 0 ? +(move / Math.sqrt(dte)).toFixed(4) : null, dte: dte ?? null,
    source: 'settlement-straddle',
  };
}

// ATM IV term structure from the per-expiry settlement rows (`[{dte, iv(%) , ivChg}]`).
// slope = back IV − front IV: > 0 = upward-sloping (normal — calm now, uncertainty later);
// < 0 = INVERTED (front-loaded — a near-term event/stress the market is paying up for).
// Pure. `iv` in percent (as the table quotes it); returned unchanged.
export function ivTermStructure(rows) {
  const r = (Array.isArray(rows) ? rows : [])
    .filter(x => Number.isFinite(x?.dte) && Number.isFinite(x?.iv) && x.iv > 0)
    .sort((a, b) => a.dte - b.dte);
  if (r.length < 2) return null;
  const front = r[0], back = r[r.length - 1];
  const slope = back.iv - front.iv;
  return {
    front: { dte: front.dte, iv: +front.iv.toFixed(2) },
    back: { dte: back.dte, iv: +back.iv.toFixed(2) },
    slope: +slope.toFixed(2),
    shape: slope > 0.5 ? 'upward' : slope < -0.5 ? 'inverted' : 'flat',
    points: r.map(x => ({ dte: x.dte, iv: +x.iv.toFixed(2), ivChg: Number.isFinite(x.ivChg) ? +x.ivChg.toFixed(2) : null })),
  };
}

// 30-day constant-maturity ATM IV from the term-structure points (`[{dte, iv(%)}]`),
// by total-variance interpolation between the expiries bracketing `days` — the same
// construction as oi_research_book/scripts/14_iv_surface.py's `iv30`, which the IV
// forecast ladder (js/forecastLadderParamsIV.js) is calibrated on. Expiries under
// `minDte` are dropped: a 1-3 day option's IV is dominated by a single session.
// Flat-extrapolates outside the listed range. Returns a DECIMAL (0.0612) or null.
// Checked 2026-09-23 against the settlement inversion on 16 overlapping days: median
// gap 0.05-0.19 vol on FX, 0.5 on NQ.
export function constantMaturityIV(points, { days = 30, minDte = 5 } = {}) {
  const r = (Array.isArray(points) ? points : [])
    .filter(x => Number.isFinite(x?.dte) && x.dte >= minDte && Number.isFinite(x?.iv) && x.iv > 0)
    .sort((a, b) => a.dte - b.dte);
  if (!r.length) return null;
  const T = r.map(x => x.dte / 365), v = r.map(x => x.iv / 100), t = days / 365;
  if (t <= T[0]) return v[0];
  if (t >= T[T.length - 1]) return v[v.length - 1];
  const j = T.findIndex(x => x >= t);
  const w0 = v[j - 1] ** 2 * T[j - 1], w1 = v[j] ** 2 * T[j];
  const tv = w0 + (w1 - w0) * (t - T[j - 1]) / (T[j] - T[j - 1]);
  return Math.sqrt(tv / t);
}

// Today's options-implied move, from the term-structure points (`[{dte, iv(%)}]`): a
// one-trading-day σ from the 30-day constant-maturity IV (iv30/√252 — the SAME basis the
// IV Forecast export uses and the one validated against realized range), plus the ATM-
// straddle equivalent — the expected ABSOLUTE move, E|x| = σ·√(2/π) ≈ 0.80σ — which is the
// "±233"-style number a desk quotes and the one comparable to the forecast's O-C row.
// Not the front expiry's IV: IV is quoted per CALENDAR day, so a 1-3 DTE expiry spanning a
// weekend reads artificially low (2026-09-27: EUR front 4.1% vs iv30 ~5.4%), and the stored
// points carry no trading-day count to correct it. The front is still returned for context.
// Not expectedMove either: that runs to the PRIMARY expiry (5-69 DTE on 2026-09-27).
// Percent in, percent out. Null when no expiry qualifies.
// Median next-day |close move| in units of iv30/√252, measured 2020-2026 on all 7 CME-IV
// instruments (oi_research_book/IV_FORECAST_PREREG.md, post-hoc description): 0.43-0.47,
// pooled ≈ 0.46. In-sample and close-to-close, so an approximation of the session O-C
// median — close enough to put the two side by side, not a fitted rung.
export const IMPLIED_OC_MEDIAN_SIGMA = 0.46;

export function impliedDayMove(points, { minDte = 1 } = {}) {
  const r = (Array.isArray(points) ? points : [])
    .filter(x => Number.isFinite(x?.dte) && x.dte >= minDte && Number.isFinite(x?.iv) && x.iv > 0)
    .sort((a, b) => a.dte - b.dte);
  if (!r.length) return null;
  const front = r[0];
  const iv30 = constantMaturityIV(points);
  const sigmaDayPct = (iv30 != null ? iv30 * 100 : front.iv) / Math.sqrt(252);
  return {
    frontIv: +front.iv.toFixed(2), frontDte: front.dte,
    sigmaDayPct: +sigmaDayPct.toFixed(3),
    expMovePct: +(sigmaDayPct * Math.sqrt(2 / Math.PI)).toFixed(3),
    // Like-for-like with the forecast's O-C MEDIAN. The straddle number above is a MEAN
    // |move|; fat tails put the median well below it, so comparing the straddle to an O-C
    // median would read "options rich" on every instrument every day.
    ocMedPct: +(sigmaDayPct * IMPLIED_OC_MEDIAN_SIGMA).toFixed(3),
    iv30Pct: iv30 != null ? +(iv30 * 100).toFixed(2) : null,
  };
}

// Per-strike IV change → ATM direction + skew steepening. `wingPct` = how far OTM a
// strike must be to count as a "wing". skewSteepening > 0 ⇒ wings' IV rising faster
// than ATM (tail-hedging demand up).
export function ivDynamics(strikes, iv, ivPrior, spot, { wingPct = 0.03 } = {}) {
  if (!Array.isArray(strikes) || !strikes.length || !(spot > 0)) return null;
  const i = _atmIndex(strikes, spot);
  const atmIV = iv[i], atmPrior = ivPrior?.[i];
  const atmChg = (Number.isFinite(atmIV) && Number.isFinite(atmPrior)) ? atmIV - atmPrior : null;
  const wing = [];
  for (let j = 0; j < strikes.length; j++) {
    if (Math.abs(strikes[j] - spot) / spot < wingPct) continue;
    if (Number.isFinite(iv[j]) && Number.isFinite(ivPrior?.[j])) wing.push(iv[j] - ivPrior[j]);
  }
  const wingChg = wing.length ? wing.reduce((a, b) => a + b, 0) / wing.length : null;
  const skewSteepening = (wingChg != null && atmChg != null) ? +(wingChg - atmChg).toFixed(4) : null;
  return {
    atmIV: Number.isFinite(atmIV) ? +(atmIV * 100).toFixed(2) : null,          // back to % for display
    atmChg: atmChg != null ? +(atmChg * 100).toFixed(2) : null,
    wingChg: wingChg != null ? +(wingChg * 100).toFixed(2) : null,
    skewSteepening: skewSteepening != null ? +(skewSteepening * 100).toFixed(2) : null,
    rising: atmChg != null ? atmChg > 0 : null,
  };
}

// Risk reversal: OTM put IV − OTM call IV at ~`pct` OTM either side. Positive ⇒ puts
// richer (downside fear / bearish skew); negative ⇒ calls richer (upside chase).
export function riskReversal(strikes, iv, spot, { pct = 0.03 } = {}) {
  if (!Array.isArray(strikes) || strikes.length < 3 || !(spot > 0)) return null;
  const nearest = target => {
    let bi = -1, bd = Infinity;
    for (let i = 0; i < strikes.length; i++) { const d = Math.abs(strikes[i] - target); if (d < bd) { bd = d; bi = i; } }
    return bi;
  };
  const pi = nearest(spot * (1 - pct)), ci = nearest(spot * (1 + pct));
  const putIV = iv[pi], callIV = iv[ci];
  if (!Number.isFinite(putIV) || !Number.isFinite(callIV)) return null;
  return {
    rr: +((putIV - callIV) * 100).toFixed(2),                    // vol points
    putIV: +(putIV * 100).toFixed(2), callIV: +(callIV * 100).toFixed(2),
    putStrike: strikes[pi], callStrike: strikes[ci],
    tilt: putIV > callIV ? 'downside' : putIV < callIV ? 'upside' : 'flat',
  };
}

// Vanna read: combine net VEX sign with today's ATM IV direction. The classic
// "vanna rally" fires when IV FALLS in a positive-VEX book (mechanical dealer buying).
// Descriptive only — the precise sign depends on dealer-positioning assumptions our
// (call−put) proxy can't fully pin, so it's context, not a trigger.
export function vannaState(vex, atmChg) {
  if (!Number.isFinite(vex) || vex === 0 || !Number.isFinite(atmChg)) return { state: 'neutral', firing: false };
  const ivFalling = atmChg < 0;
  // +VEX & IV falling → classic supportive tailwind; +VEX & IV rising → headwind; mirror for −VEX.
  const supportive = (vex > 0 && ivFalling) || (vex < 0 && !ivFalling);
  return {
    state: supportive ? 'tailwind' : 'headwind',
    firing: Math.abs(atmChg) >= 0.5,                              // ≥0.5 vol-pt move = a real IV shift
    vexSign: vex > 0 ? '+' : '−', ivFalling,
  };
}
