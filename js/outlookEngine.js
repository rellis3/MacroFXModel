// js/outlookEngine.js — Market Outlook Engine (Tier-1 brick).
//
// Turns signals ALREADY computed elsewhere on this dashboard — the pair
// composite (technical+COT+macro+carry, from `pairCompositeEngine.js`), COT
// positioning, the realised-vol percentile gap already used for the card's
// "σ building/cooling" chip, the yield-spread z-score family (the one
// component in this repo with a real OOS result — see
// `MD files/YIELD_SPREAD_STRATEGY.md`), and the RATE OF CHANGE (not level) of
// the macro backdrop already tracked by `js/macroChange.js` (DXY, VIX, HY
// credit spread, US real 10Y/TIPS yield, 1d/5d/20d deltas) — into a labelled
// 5-day / 20-day directional read per pair, plus how much of the horizon an
// upcoming high-impact release eats into.
//
// Covers all THREE tracked asset classes this dashboard trades, from
// whichever legs each one actually has data for (missing legs are left out,
// never padded to a neutral zero — see computeOutlook's own doc comment):
// FX pairs get the full set (composite w/ macro+carry, yieldSpread, cot,
// dxyMomentum, riskMomentum, realYieldMomentum, priceTrend); Gold gets
// everything except yieldSpread (no second currency to spread against) via
// today.html's ASSET_USD_SIDE/ASSET_RISK_LEAN fallback tables, plus a
// GOLD-ONLY goldEtfFlow leg (GLD+IAU combined-AUM flow — no FX/equity
// equivalent exists); equity indices
// get composite (technical+cot only), cot (where a CFTC contract exists —
// NQ/SPX500/US30/US2000, not DE30/UK100), riskMomentum and
// realYieldMomentum (via ASSET_RISK_LEAN/ASSET_REALYIELD_LEAN) and
// priceTrend — deliberately NOT dxyMomentum (see that driver's own header
// for why the dollar/equity relationship is a different, more contestable
// claim this repo hasn't reasoned through).
//
// Pure: plain objects in, plain object out — no DOM, no network, no globals
// (Lego Principle 1: one shared core, imported — never copied). Horizon-
// agnostic (Lego Principle 3): reuses `forecastCore.js`'s own `HORIZONS`
// labels/√-scaling convention so a horizon added there needs no new engine
// here — 'weekly' is the 5-day read, 'monthly' is the 20-day read.
//
// THIS IS A CONTEXT COMPOSITE, NOT A NEW BACKTESTED SIGNAL — same posture as
// `pairCompositeEngine.js`. It reports what already-built reads agree or
// disagree on; agreement is arithmetic, not a validated probability. The one
// exception is the yield-spread leg, tagged VALIDATED below — and even that
// carries the caveat that only USDJPY's sign has been confirmed live
// (`js/yieldSpreadEngine.js`'s own header note); every other pair's z uses
// the engine's automatic FRED-based orientation, unconfirmed live.
//
// DELIBERATELY NOT INCLUDED: central-bank tone/hawkish-score momentum. This
// repo already pre-registered and ran exactly that test — does ΔhawkishScore
// (FOMC/ECB/BoE/BoJ) predict the next day/week's price beyond the initial
// 30-minute reaction — and banked a clean null on both registered cells
// (`MD files/CB_SENTIMENT_PRICE_TEST.md`: R1~Δscore t=-0.75, N=81; Stage-1
// drift t=0.32, N=82). Feeding it into a bias score here would re-litigate a
// falsified test. The dxy/risk-momentum drivers below are a DIFFERENT claim
// (priced-asset momentum, not text sentiment) and have not themselves been
// tested — they carry the same CONTEXT label as every other untested driver
// here, never VALIDATED.
import { HORIZONS } from './forecastCore.js';

export { HORIZONS };

const round1 = v => (v == null ? null : +v.toFixed(1));
const clip = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Per-horizon leg weights. NOT fitted — a small principled table, not swept
// (CLAUDE.md: "the brain is a selector, not more knobs"). Rationale per leg:
//  • composite   — the page's own base read; counts at every horizon, a bit
//    less at 20d because a same-day technical/COT snapshot says less about
//    a month out than about the next few sessions.
//  • yieldSpread — mean-reversion in a macro/yield spread plays out over
//    weeks-to-months, not a single session (MARKET_VALUATION_ENGINE.md
//    Q-Final #1) — weight rises from 5d to 20d.
//  • cot         — weekly-cadence positioning data; more a swing-horizon
//    read than a next-few-days one, so it counts a bit more at 20d.
//  • dxyMomentum / riskMomentum — the window itself already picks up most of
//    the horizon-adaptation (the 5d delta feeds 'weekly', the 20d delta feeds
//    'monthly' — see the callers below), so the extra tilt here is modest;
//    kept in the same direction as the others (a bit more at 20d) since a
//    multi-week momentum read is the more natural fit for the longer horizon.
//  • priceTrend  — a same-day HTF regime read (is price sloping, and how
//    cleanly) says more about the next few sessions than a month out, same
//    reasoning as `composite` — weighted down at 20d, not up.
// volRegime is deliberately absent from this table — it never sets direction
// (see volRegimeDriver below), only confidence.
//  • realYieldMomentum — same rate-of-change reasoning as dxyMomentum, so the
//    same weight curve (a bit more at 20d — multi-week rate moves are a more
//    natural fit for the longer horizon than a single week).
//  • goldEtfFlow — fund flows build/reverse over weeks, not single sessions,
//    same "more natural fit for the longer horizon" logic as the other
//    momentum legs above.
export const HORIZON_WEIGHTS = {
  weekly:  { composite: 1.0, yieldSpread: 0.5, cot: 0.5, dxyMomentum: 0.4, riskMomentum: 0.4, priceTrend: 0.8, realYieldMomentum: 0.4, goldEtfFlow: 0.4 },
  monthly: { composite: 0.7, yieldSpread: 1.0, cot: 0.7, dxyMomentum: 0.6, riskMomentum: 0.6, priceTrend: 0.5, realYieldMomentum: 0.6, goldEtfFlow: 0.6 },
};

// Currency risk-character lean — a small, standard FX-market convention
// (classic risk-off havens vs commodity/risk-on currencies), NOT a fitted
// parameter and NOT itself a tested claim. It exists only to SIGN the
// risk-momentum driver below (does a VIX/HY move help or hurt THIS pair's own
// currencies); whether that read has any predictive value is untested. EUR
// and GBP are left neutral — no consistently one-way lean is established for
// either in this repo.
export const CCY_RISK_LEAN = { USD: 1, JPY: 1, CHF: 1, AUD: -1, NZD: -1, CAD: -1, EUR: 0, GBP: 0 };

// net lean for a pair, in [-1, 1]: positive = net haven-leaning (base more
// haven-ish than quote), negative = net risk/commodity-leaning.
export function pairRiskLean(base, quote) {
  const b = CCY_RISK_LEAN[base] ?? 0, q = CCY_RISK_LEAN[quote] ?? 0;
  return (b - q) / 2;
}

// |biasScore| below this reads NEUTRAL — matches pairCompositeEngine's 0.12
// on its -1..1 scale, carried through on this engine's -100..100 scale.
const BIAS_NEUTRAL_BAND = 12;

function biasLabel(score) {
  if (score == null) return null;
  if (score > BIAS_NEUTRAL_BAND) return 'BULLISH';
  if (score < -BIAS_NEUTRAL_BAND) return 'BEARISH';
  return 'NEUTRAL';
}

// `composite` = pairCompositeEngine.pairComposite() output: { score (-1..1),
// direction, agree, total, legs }.
function compositeDriver(composite) {
  if (!composite || composite.score == null) return null;
  return {
    name: 'composite', label: 'Signal composite (technical/COT/macro/carry)',
    status: 'CONTEXT', score: clip(composite.score, -1, 1),
    detail: `${composite.agree}/${composite.total} of this dashboard's own signals agree — arithmetic agreement, not a backtested rule.`,
  };
}

// `yieldSpread` = { z, inverted } read off /api/yield-spread/plan — already
// sign-oriented (z>0 ⇒ long the pair) by the engine's own resolveInverted
// (see js/yieldSpreadCore.js directionFromZ). Only the 6 pairs in
// js/zscoreSpreadEngine.js's ZSCORE_PAIRS carry this leg; every other pair
// gets no yield-spread driver at all (missing, never a neutral zero — same
// convention pairComposite/cotPairBias already use).
function yieldSpreadDriver(yieldSpread) {
  if (!yieldSpread || yieldSpread.z == null) return null;
  // 3σ ≈ full-scale, same saturation convention cotPairBias uses at 4σ for a
  // Z that runs a little hotter.
  const dirScore = clip(yieldSpread.z / 3, -1, 1);
  return {
    name: 'yieldSpread', label: 'Yield-spread z-score',
    status: 'VALIDATED', score: dirScore,
    detail: `z=${round1(yieldSpread.z)} (US-vs-local short-rate spread, 90d rolling). The one component here with a real OOS result — PF 2.19, Sharpe ~1.14, positive every year 2022-2026 (YIELD_SPREAD_STRATEGY.md). Direction is engine-auto-oriented; only confirmed live for USDJPY.`,
  };
}

// `volRegime` = { volPct, cone5d } — the card's own existing 252d/5d
// volatility percentile pair (no new fetch; identical numbers behind the
// "σ building/cooling" chip). This is a MEASUREMENT of regime, not a
// directional driver — it never sets bias, only confidence: a market
// mid-transition is one where today's snapshot says less about the next
// few sessions.
function volRegimeDriver(volRegime) {
  if (!volRegime || volRegime.volPct == null || volRegime.cone5d == null) return null;
  const gap = volRegime.cone5d - volRegime.volPct;
  const state = gap >= 15 ? 'BUILDING' : gap <= -15 ? 'COOLING' : 'STABLE';
  return {
    name: 'volRegime', label: 'Volatility regime', status: 'CONTEXT',
    score: 0, confidenceAdj: state === 'STABLE' ? 0.05 : -0.05,
    detail: `σ is ${state.toLowerCase()} — 5-day window ranks P${volRegime.cone5d} vs P${volRegime.volPct} over the last year.`,
  };
}

// `cotRead` = cotFor(name)-shaped: { dir, bias (-1..1), level, pct, derived }.
function cotDriver(cotRead) {
  if (!cotRead || cotRead.bias == null) return null;
  return {
    name: 'cot', label: 'Positioning (COT)', status: 'CONTEXT',
    score: clip(cotRead.bias, -1, 1),
    detail: cotRead.level
      ? `${cotRead.level} crowding, ${cotRead.dir}${cotRead.derived ? ' (derived cross)' : ''} — crowded one-way bets can snap back.`
      : `${cotRead.dir} positioning.`,
  };
}

// `input` = { delta, usdSide } — `delta` is the ALREADY window-selected DXY
// change in index points (js/macroChange.js's `deltas[windowDays]`, picked by
// the caller below to match the horizon), `usdSide` is 'base'|'quote' when
// this pair has a direct USD leg. Absent for USD-free crosses (EURGBP,
// EURJPY, EURCHF, GBPCHF, AUDJPY, CADJPY) — no leg, never a neutral zero.
// UNTESTED hypothesis (rate-of-change of a priced index, not text sentiment —
// see the file header for why this is a different claim from the banked-null
// CB-sentiment test); tagged CONTEXT, never VALIDATED.
function dxyMomentumDriver(input) {
  if (!input || input.delta == null || !input.usdSide) return null;
  const sideSign = input.usdSide === 'base' ? 1 : -1;
  return {
    name: 'dxyMomentum', label: 'Dollar-index momentum (DXY)', status: 'CONTEXT',
    score: clip((input.delta / 2) * sideSign, -1, 1),
    detail: `DXY ${input.delta > 0 ? '+' : ''}${round1(input.delta)} over this window, read via USD's side of this pair — a rate-of-change reading, not a tested signal.`,
  };
}

// `input` = { delta, lean } — `delta` is the ALREADY window-selected US real
// 10Y (TIPS) yield change in bps (js/macroChange.js's `tips` row, which is
// already bps-scaled — see that file's header). `lean` uses the EXACT SAME
// sign convention as dxyMomentum's `sideSign` above (+1 = "USD-base"-like,
// this asset benefits when US real yields/the dollar are firming; -1 =
// "USD-quote"-like, this asset is hurt by it) — for FX pairs and Gold the
// caller passes the identical resolved sideSign it already computed for
// dxyMomentum (usdSide 'base'/'quote'). For an asset with no FX base/quote at
// all (an equity index), the caller instead supplies a small fixed lean
// (today.html's ASSET_REALYIELD_LEAN, -1 for every tracked index) reflecting
// the well-known "higher discount rate hurts equity valuations" relationship
// — a DIFFERENT, less contestable claim than dxyMomentum's dollar-flow-vs-
// earnings ambiguity, which is why indices get this leg but not that one.
// UNTESTED hypothesis, same CONTEXT caveat as dxyMomentum/riskMomentum.
function realYieldMomentumDriver(input) {
  if (!input || input.delta == null || !input.lean) return null;
  return {
    name: 'realYieldMomentum', label: 'Real-yield momentum (US 10Y TIPS)', status: 'CONTEXT',
    score: clip((input.delta / 30) * input.lean, -1, 1),
    detail: `US real 10Y ${input.delta > 0 ? '+' : ''}${round1(input.delta)}bps over this window — a rate-of-change reading (rising real yields = headwind for a non-yielding/long-duration asset, tailwind for a USD-base-like one), not a tested signal.`,
  };
}

// `input` = { delta } — the ALREADY window-selected % change in combined
// GLD+IAU AUM (today.html's goldEtfFlow, sourced from server.js's
// self-collected daily snapshot history — see that file's header for why no
// vendor-hosted flow history exists to fetch directly). GOLD-ONLY: no FX pair
// has an "ETF" the same way, so this driver is never wired for anything else.
// Inflows (rising combined AUM) read as bullish demand, outflows as bearish —
// the plainest possible reading of a flow number, same UNTESTED-hypothesis
// posture as every other momentum driver here. Divisor (8% over the window =
// full-scale) is a small round, non-fitted constant, not swept.
function goldEtfFlowDriver(input) {
  if (!input || input.delta == null) return null;
  return {
    name: 'goldEtfFlow', label: 'Gold ETF flow (GLD+IAU AUM)', status: 'CONTEXT',
    score: clip(input.delta / 8, -1, 1),
    detail: `Combined GLD+IAU AUM ${input.delta > 0 ? '+' : ''}${round1(input.delta)}% over this window — inflow/outflow read as demand, not a tested signal.`,
  };
}

// `input` = { vixDelta, hyDelta, netLean } — vixDelta (index points) and
// hyDelta (bps) are ALREADY window-selected (js/macroChange.js deltas);
// netLean is `pairRiskLean(base, quote)` above. Rising VIX/HY = risk-off;
// a net-haven-leaning pair (netLean>0) is read as benefiting, a net
// risk/commodity-leaning pair (netLean<0) as hurt. Absent for neutral-vs-
// neutral pairs (netLean===0, e.g. EURGBP) — no meaningful read either way.
// UNTESTED hypothesis, same caveat as dxyMomentumDriver.
function riskMomentumDriver(input) {
  if (!input || !input.netLean) return null;
  const vixN = input.vixDelta != null ? clip(input.vixDelta / 10, -1, 1) : null;
  const hyN = input.hyDelta != null ? clip(input.hyDelta / 50, -1, 1) : null;
  const terms = [vixN, hyN].filter(x => x != null);
  if (!terms.length) return null;
  const riskOffMomentum = terms.reduce((a, b) => a + b, 0) / terms.length;
  return {
    name: 'riskMomentum', label: 'Risk-regime momentum (VIX/HY)', status: 'CONTEXT',
    score: clip(input.netLean * riskOffMomentum, -1, 1),
    detail: `VIX ${input.vixDelta != null ? (input.vixDelta > 0 ? '+' : '') + round1(input.vixDelta) : 'n/a'} · HY OAS ${input.hyDelta != null ? (input.hyDelta > 0 ? '+' : '') + round1(input.hyDelta) + 'bps' : 'n/a'} over this window, read via this pair's own risk-currency lean — a rate-of-change reading, not a tested signal.`,
  };
}

// `input` = { label, trendDir, trendProb, reliable } — the card's own
// existing HMM daily regime read (`r.d.regime`, already loaded for free, zero
// new fetches). Absent when `label !== 'TREND'` (a RANGE regime has no
// trend_dir to read) or the read is missing entirely. Same scoring shape as
// `pairSignal()` already uses for the composite's own "technical" leg — see
// the detail text below for why that overlap matters, not just that it
// exists. Tagged CONTEXT: the HMM regime classifier itself is used elsewhere
// in this repo as a "canonical classifier", but a standalone trend_dir-alone
// forecast has no OOS result recorded here to point to.
function priceTrendDriver(input) {
  if (!input || input.label !== 'TREND' || !input.trendDir) return null;
  const dirSign = input.trendDir === 'up' ? 1 : input.trendDir === 'down' ? -1 : 0;
  if (!dirSign) return null;
  const prob = (input.trendProb ?? 60) / 100;
  const reliability = input.reliable ? 1 : 0.6;
  return {
    name: 'priceTrend', label: 'Price trend (HTF regime)', status: 'CONTEXT',
    score: clip(dirSign * prob * reliability, -1, 1),
    detail: `HMM daily regime reads TREND ${input.trendDir} at ${input.trendProb}%${input.reliable ? '' : ' (flagged less reliable)'}. NOTE: this is the SAME regime read already folded into the "Signal composite" driver's technical leg above — shown separately for visibility into the specific evidence, not as fully independent confirmation of it.`,
  };
}

// ── Central-bank tone (DESCRIPTIVE ONLY — never a driver) ───────────────────
// `history` = the /api/{fomc,ecb,boe,boj}/history-shaped array, oldest first:
// [{ meetingDate, hawkishScore, regime }]. Summarizes whether the tone has
// gotten more hawkish, more dovish, or held, over the last few meetings.
//
// DELIBERATE, STRUCTURAL EXCLUSION FROM computeOutlook: this repo already
// pre-registered and ran the exact test of whether ΔhawkishScore predicts
// forward price — a clean banked null on both registered cells
// (MD files/CB_SENTIMENT_PRICE_TEST.md). This function exists ONLY to
// describe the tone in plain words for display (the drawer, the AI prompt) —
// it returns no `score`, is not shaped like the drivers above, and MUST NEVER
// be passed to computeOutlook or added to HORIZON_WEIGHTS. If you're tempted
// to score it, re-read that doc first — the test already ran.
export function describeCbTrend(history) {
  const rows = (history ?? []).filter(h => h?.hawkishScore != null);
  if (rows.length < 2) {
    return { trend: 'INSUFFICIENT_DATA', latestScore: rows[0]?.hawkishScore ?? null, deltaVsPrev: null, nMeetings: rows.length, detail: 'Not enough scored meetings to read a trend.' };
  }
  const last = rows[rows.length - 1], prev = rows[rows.length - 2];
  const delta = round1(last.hawkishScore - prev.hawkishScore);
  const trend = delta > 0.05 ? 'MORE_HAWKISH' : delta < -0.05 ? 'MORE_DOVISH' : 'UNCHANGED';
  const label = trend === 'MORE_HAWKISH' ? 'turned more hawkish' : trend === 'MORE_DOVISH' ? 'turned more dovish' : 'held steady';
  return {
    trend, latestScore: round1(last.hawkishScore), deltaVsPrev: delta, nMeetings: rows.length,
    detail: `Tone ${label} vs the prior meeting (${last.meetingDate}). Context only — this repo tested and banked a null on hawkish-score momentum predicting price (CB_SENTIMENT_PRICE_TEST.md); never treat this as a directional reason.`,
  };
}

// `events` = pairEvents(name)-shaped array, each carrying `ms` (epoch) and
// `impact`. Returns how many fall inside the horizon's forward window.
function eventRiskFor(events, windowMs) {
  const now = Date.now();
  const inWindow = (events ?? []).filter(e => e.ms >= now && e.ms - now <= windowMs);
  const high = inWindow.filter(e => (e.impact ?? '').toLowerCase() === 'high');
  return { count: inWindow.length, highCount: high.length, next: inWindow[0] ?? null };
}

// inputs = { composite, yieldSpread, volRegime, cot, events, dxyMomentum,
// riskMomentum, priceTrend }. Each field is optional — a caller with only
// some of these signals loaded still gets a read built from what it has
// (never padded with a neutral zero for what's missing, same discipline as
// pairComposite). Central-bank tone is DELIBERATELY not one of these fields —
// see describeCbTrend's own header for why it's structurally kept out.
// dxyMomentum = { deltas: {1,5,20}, usdSide } | null (from js/macroChange.js's
// dxy row); riskMomentum = { vixDeltas: {1,5,20}, hyDeltas: {1,5,20}, netLean }
// | null; realYieldMomentum = { deltas: {1,5,20}, lean } | null (from that
// file's `tips` row); goldEtfFlow = { deltas: {1,5,20} } | null (GOLD only,
// from today.html's self-collected GLD+IAU AUM history) — all four carry ALL
// windows, and computeOutlook picks the one matching the requested horizon
// (5d for 'weekly', 20d for 'monthly') below.
export function computeOutlook(inputs = {}, horizonKey = 'weekly') {
  const horizon = HORIZONS[horizonKey] ?? HORIZONS.weekly;
  const w = HORIZON_WEIGHTS[horizonKey] ?? HORIZON_WEIGHTS.weekly;
  const wd = horizon.windowDays;

  const drivers = [];
  const c = compositeDriver(inputs.composite);   if (c) drivers.push(c);
  const y = yieldSpreadDriver(inputs.yieldSpread); if (y) drivers.push(y);
  const v = volRegimeDriver(inputs.volRegime);   if (v) drivers.push(v);
  const o = cotDriver(inputs.cot);               if (o) drivers.push(o);
  const dx = dxyMomentumDriver(inputs.dxyMomentum
    ? { delta: inputs.dxyMomentum.deltas?.[wd] ?? null, usdSide: inputs.dxyMomentum.usdSide }
    : null);
  if (dx) drivers.push(dx);
  const rm = riskMomentumDriver(inputs.riskMomentum
    ? { vixDelta: inputs.riskMomentum.vixDeltas?.[wd] ?? null, hyDelta: inputs.riskMomentum.hyDeltas?.[wd] ?? null, netLean: inputs.riskMomentum.netLean }
    : null);
  if (rm) drivers.push(rm);
  const ry = realYieldMomentumDriver(inputs.realYieldMomentum
    ? { delta: inputs.realYieldMomentum.deltas?.[wd] ?? null, lean: inputs.realYieldMomentum.lean }
    : null);
  if (ry) drivers.push(ry);
  const gf = goldEtfFlowDriver(inputs.goldEtfFlow
    ? { delta: inputs.goldEtfFlow.deltas?.[wd] ?? null }
    : null);
  if (gf) drivers.push(gf);
  const pt = priceTrendDriver(inputs.priceTrend); if (pt) drivers.push(pt);

  const directional = drivers.filter(d => d.name !== 'volRegime');
  let biasScore = null, agree = 0;
  if (directional.length) {
    let wsum = 0, ssum = 0;
    for (const d of directional) { const wt = w[d.name] ?? 1; wsum += wt; ssum += wt * d.score; }
    biasScore = wsum > 0 ? round1(clip(ssum / wsum, -1, 1) * 100) : null;
  }
  const bias = biasLabel(biasScore);
  if (bias) {
    const sign = bias === 'BULLISH' ? 1 : bias === 'BEARISH' ? -1 : 0;
    agree = directional.filter(d => d.score !== 0 && Math.sign(d.score) === sign).length;
  }

  const windowMs = horizon.windowDays * 24 * 3600e3;
  const eventRisk = eventRiskFor(inputs.events, windowMs);

  // Confidence: leg-agreement fraction (30-70pt) + validated-leg bonus (+15) +
  // vol-regime stability adj (±5) − event-risk penalty (up to −20, a
  // high-impact release inside the window can overturn the read before it
  // plays out). Arithmetic, not a calibrated probability — same honesty
  // posture as every other composite here.
  let confidence = null;
  if (bias) {
    const agreeFrac = directional.length ? agree / directional.length : 0;
    let conf = 30 + agreeFrac * 40;
    if (y) conf += 15;
    if (v?.confidenceAdj) conf += v.confidenceAdj * 100;
    conf -= Math.min(20, eventRisk.highCount * 10);
    confidence = Math.round(clip(conf, 5, 95));
  }

  return {
    horizonKey, horizonLabel: horizon.label, bias, biasScore, confidence,
    agree, total: directional.length, drivers, eventRisk,
    disclaimer: 'CONTEXT composite, not a validated predictive signal — see MD files/CLAUDE.md. The yield-spread leg (when present) is the one component with a real OOS result behind it.',
  };
}

// Convenience: both trading horizons in one call, for a side-by-side view.
export function computeOutlookAllHorizons(inputs = {}, horizonKeys = ['weekly', 'monthly']) {
  const out = {};
  for (const k of horizonKeys) out[k] = computeOutlook(inputs, k);
  return out;
}
