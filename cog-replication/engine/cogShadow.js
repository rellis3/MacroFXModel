// cog-replication/engine/cogShadow.js — the shadow emitter.
//
// Emits OUR version of COG's three gates every trading day, stamped BEFORE his
// alerts land, so the forward comparison is honest by construction. It places
// no orders and gives no advice: it is a measuring instrument.
//
// Read cog-replication/README.md first. In short: the OI/GEX direction
// hypothesis cannot be backtested (oi_history grows one day per manual paste
// and currently holds 2 days), so a live shadow record is the only route.
//
// ── The three layers ────────────────────────────────────────────────────────
//   G1 TIDE         is money flowing in?  → persistent BIAS      (weekly-ish)
//   G2 TRANSMISSION how far / how violently today? → STOP % + TIER (daily)
//   G3 MAGNET       where is it pulled?   → DIRECTION + TARGET   (daily)
//
// Mapping to COG's observed stages, with our schedule set to fire just AHEAD of
// each of his so we can never be accused of copying him:
//   his "Data threshold 1"  02:00–14:00 UK (variable)  → ours 08:00 UTC
//   his "Data threshold 2"  ~13:53 UK = 12:53 UTC      → ours 12:45 UTC
//   his "Order filled"      ~14:26 UK = 13:26 UTC      → ours 13:15 UTC
//
// ── What is inferred, and must not harden into fact ─────────────────────────
// COG STATED: repo, reverse repo, central-bank balance sheets; "nothing to do
// with NAS price". He never mentioned options positioning. G2's GEX mapping and
// G3's wall-magnet rule are OUR INFERENCE from two matched screenshots. The
// thresholds below are first guesses chosen to be interpretable, NOT calibrated
// — nothing has been fitted, because there is nothing to fit against yet. Every
// emission records its inputs so the rules can be re-derived later from the
// accumulated record rather than re-invented.

// ── G1 — the tide ───────────────────────────────────────────────────────────
// Net liquidity = Fed balance sheet − Treasury General Account − reverse repo.
// The framework COG described ("money pumped into the USA"). Direction comes
// from its RATE OF CHANGE, not its level: a big balance sheet that is shrinking
// is a headwind. HY credit is the risk-appetite switch — if credit is stressed,
// liquidity does not reach equities.
export function computeG1(series, opts = {}) {
  const { rocWeeks = 4, creditStressBp = 25, flowThresholdBn = 10 } = opts;
  // ALL SERIES MUST ARRIVE IN $ MILLIONS. FRED ships WALCL and WTREGEN in
  // millions but RRPONTSYD in BILLIONS — subtracting them raw understates RRP
  // by 1000x and silently deletes it from net liquidity. Our first emission did
  // exactly that: it reported $5,917.8bn, which is WALCL − TGA with RRP
  // contributing ~nothing. The caller converts; this function assumes millions
  // and says so loudly because the failure is invisible in the output.
  const { walcl = [], tga = [], rrp = [], hy = [] } = series;
  const last = a => (a.length ? a[a.length - 1] : null);
  const back = (a, n) => (a.length > n ? a[a.length - 1 - n] : null);

  // Align a weekly series onto a daily date by taking the most recent print at
  // or before that date — the only causal way to mix weekly WALCL with daily
  // TGA/RRP.
  const asOf = (arr, date) => {
    let v = null;
    for (const x of arr) { if (x.date <= date) v = x.value; else break; }
    return v;
  };

  // DAILY net liquidity. TGA and RRP publish daily; only WALCL is weekly, and
  // it is the slowest-moving of the three. This is what makes a daily
  // money-flow reading possible at all — a purely weekly series cannot produce
  // a fresh directional signal 60 times a year, which was the standing
  // objection to the whole macro thesis.
  const daily = [];
  for (const t of tga) {
    const w = asOf(walcl, t.date), r = asOf(rrp, t.date);
    if (w == null || r == null || !Number.isFinite(t.value)) continue;
    daily.push({ date: t.date, net: w - t.value - r });
  }
  if (daily.length < 2) {
    return { state: 'INVALID', bias: null, reason: 'daily net-liquidity series too short', days: daily.length };
  }

  const cur = daily[daily.length - 1], prev = daily[daily.length - 2];
  const flowBn = (cur.net - prev.net) / 1000;                    // millions → $bn

  // TIDE — the persistent bias (multi-week trend).
  const nBack = Math.min(daily.length - 1, rocWeeks * 5);        // ~5 business days/week
  const tideThen = daily[daily.length - 1 - nBack];
  const tideChgPct = tideThen && tideThen.net !== 0
    ? (cur.net - tideThen.net) / Math.abs(tideThen.net) * 100 : 0;

  // Credit is a VETO, not a vote: liquidity that cannot reach risk assets is
  // not liquidity for this purpose.
  const hyNow = last(hy)?.value ?? null, hyThen = back(hy, rocWeeks)?.value ?? null;
  const hyChgBp = (hyNow != null && hyThen != null) ? (hyNow - hyThen) * 100 : null;
  const creditStressed = hyChgBp != null && hyChgBp > creditStressBp;

  const tideBias = tideChgPct > 0 ? 'LONG' : tideChgPct < 0 ? 'SHORT' : null;
  const flowBias = flowBn > flowThresholdBn ? 'LONG' : flowBn < -flowThresholdBn ? 'SHORT' : null;

  // BOTH readings are emitted. Which one tracks COG's Gate 1 is exactly what
  // the forward record is for — picking one now would be inventing the answer.
  let bias = tideBias, state = tideBias ? 'VALID' : 'NEUTRAL';
  if (creditStressed) { state = 'INVALID'; bias = null; }

  return {
    state, bias,
    netLiquidityUsdBn: +(cur.net / 1000).toFixed(1),
    asOfDate: cur.date, dailyDays: daily.length,
    tide: { chgPct: +tideChgPct.toFixed(2), overDays: nBack, bias: tideBias },
    flow: { dayOverDayBn: +flowBn.toFixed(1), fromDate: prev.date, toDate: cur.date,
            bias: flowBias, thresholdBn: flowThresholdBn },
    agree: !!(tideBias && flowBias && tideBias === flowBias),
    hyNow, hyChgBp: hyChgBp == null ? null : +hyChgBp.toFixed(1), creditStressed,
    reason: creditStressed
      ? `HY credit widened ${hyChgBp?.toFixed(0)}bp over ${rocWeeks}w — liquidity is not reaching risk assets`
      : `TIDE ${tideChgPct >= 0 ? '+' : ''}${tideChgPct.toFixed(2)}% over ${nBack}d`
        + ` · FLOW ${flowBn >= 0 ? '+' : ''}${flowBn.toFixed(1)}bn day-over-day`
        + (tideBias && flowBias && tideBias !== flowBias ? ' — TIDE and FLOW DISAGREE' : ''),
  };
}

// ── G2 — transmission: GEX → stop distance + risk tier ──────────────────────
// COG's Gate 2 emits a stop distance % and a risk tier in two variants exactly
// 2× apart (0.44%/2.2% and 0.21%/1.00%, both ≈5× leverage). GEX is the only
// mechanism we have that produces a per-day range number from positioning:
// dealers short gamma (negative GEX) amplify moves, long gamma dampens them.
//
// The base range is the instrument's own recent realised range — GEX scales it
// rather than replacing it, so a broken/missing GEX degrades to a plain vol
// stop instead of an invented one.
export function computeG2(gex, baseRangePct, opts = {}) {
  // OBSERVED ENVELOPE — the owner has never seen COG quote a stop above 0.48%,
  // and has seen 0.44% (standard) and 0.21% (conservative). Our first attempt
  // produced 1.97% by scaling the daily range, which is 4x outside anything he
  // has ever emitted. That is not a tuning gap, it falsifies the mapping.
  //
  // What his numbers actually say:
  //   0.44 / 0.21 = 2.1   the two tiers are ONE number, halved
  //   2.2 / 0.44 = 5.0    and 1.00 / 0.21 = 4.76 — leverage is ~5x in both
  // So the stop does not scale with daily volatility. It sits in a tight
  // 0.21-0.48% band, and Gate 2's real decision is WHICH TIER — the stop falls
  // out of hitting ~5x leverage at the chosen risk.
  //
  // GEX therefore selects the tier rather than widening the stop: dealers short
  // gamma means moves get amplified, which argues for LESS size, not a looser
  // stop. Volatility still nudges the stop inside the observed band so the
  // model is not purely hardcoded to him, but it can never leave that band.
  const {
    stopFloorPct = 0.20, stopCapPct = 0.48,   // the owner's observed envelope
    anchorStopPct = 0.44,                     // his standard tier
    targetLeverage = 5.0,                     // implied by both his tiers
    volFraction = 0.30,                       // how much realised range nudges inside the band
  } = opts;

  const gexBn = Number.isFinite(gex) ? gex / 1e9 : null;
  const regime = gexBn == null ? 'UNKNOWN' : gexBn < 0 ? 'SHORT_GAMMA' : 'LONG_GAMMA';

  // Nudge within the band, then CLAMP. The clamp is empirical, from the owner's
  // observation - flagged rather than buried, because it is the one number here
  // fitted to COG rather than derived.
  const raw = Number.isFinite(baseRangePct) && baseRangePct > 0
    ? baseRangePct * volFraction : anchorStopPct;
  const clamped = Math.min(Math.max(raw, stopFloorPct), stopCapPct);
  const wasClamped = raw > stopCapPct || raw < stopFloorPct;

  // Short gamma ⇒ amplified moves ⇒ take the conservative (half-size) tier.
  const tier = regime === 'SHORT_GAMMA' ? 'conservative' : 'standard';
  const stopStd = +clamped.toFixed(3);
  const stopCons = +(clamped / 2).toFixed(3);

  return {
    state: 'VALID', regime, gexBn: gexBn == null ? null : +gexBn.toFixed(2),
    baseRangePct: Number.isFinite(baseRangePct) ? +baseRangePct.toFixed(3) : null,
    rawStopPct: +raw.toFixed(3), wasClamped, observedEnvelope: [stopFloorPct, stopCapPct],
    recommendedTier: tier,
    standard:     { stopPct: stopStd,  riskPct: +(stopStd * targetLeverage).toFixed(2) },
    conservative: { stopPct: stopCons, riskPct: +(stopCons * targetLeverage).toFixed(2) },
    reason: (wasClamped
      ? `realised range implied ${raw.toFixed(2)}% — CLAMPED to COG's observed ${stopFloorPct}-${stopCapPct}% envelope. `
      : '')
      + (regime === 'SHORT_GAMMA'
        ? `dealers SHORT gamma (GEX ${gexBn?.toFixed(1)}bn) — moves amplified, so take the CONSERVATIVE tier (less size, not a looser stop)`
        : regime === 'LONG_GAMMA'
        ? `dealers LONG gamma (GEX ${gexBn?.toFixed(1)}bn) — moves dampened, standard tier`
        : 'no GEX — defaulting to standard tier'),
  };
}

// ── G3 — magnet: direction + target from the wall structure ─────────────────
// Dealer hedging into large strikes creates flow toward them. The dominant wall
// (heavier of call/put by OI) is the magnet; its side of spot is the direction.
// Explicitly NOT price momentum — this is positioning, which is what COG said
// his system reads.
export function computeG3(oi, opts = {}) {
  const { minEdgePct = 0.15, dominanceRatio = 1.2 } = opts;
  if (!oi || !Number.isFinite(oi.spot) || oi.spot <= 0) {
    return { state: 'INVALID', reason: 'no spot' };
  }
  const spot = oi.spot;
  const cw = oi.callWall, pw = oi.putWall;
  const cOI = oi.callWallOI ?? 0, pOI = oi.putWallOI ?? 0;
  if (!Number.isFinite(cw) && !Number.isFinite(pw)) {
    return { state: 'INVALID', reason: 'no walls in the book' };
  }
  // Dominant only if it is meaningfully heavier — a near-tie is not a magnet,
  // it is a range, and calling it a direction would be inventing conviction.
  let dom = null, domSide = null;
  if (Number.isFinite(cw) && Number.isFinite(pw)) {
    if (cOI >= pOI * dominanceRatio)      { dom = cw; domSide = 'CALL'; }
    else if (pOI >= cOI * dominanceRatio) { dom = pw; domSide = 'PUT'; }
  } else if (Number.isFinite(cw)) { dom = cw; domSide = 'CALL'; }
  else                            { dom = pw; domSide = 'PUT'; }

  if (dom == null) {
    return { state: 'NEUTRAL', reason: `walls balanced (call OI ${cOI} vs put OI ${pOI}) — a range, not a magnet`,
             callWall: cw, putWall: pw };
  }
  const edgePct = (dom - spot) / spot * 100;
  if (Math.abs(edgePct) < minEdgePct) {
    return { state: 'NEUTRAL', reason: `price sitting on the ${domSide} wall (${edgePct.toFixed(2)}%) — pinned, no travel`,
             dominantWall: dom, edgePct: +edgePct.toFixed(3) };
  }
  return {
    state: 'VALID', direction: edgePct > 0 ? 'LONG' : 'SHORT',
    dominantWall: dom, dominantSide: domSide, target: dom,
    edgePct: +edgePct.toFixed(3), spot,
    callWall: cw, putWall: pw, callWallOI: cOI, putWallOI: pOI,
    maxPain: oi.maxPain ?? null,
    reason: `${domSide} wall at ${dom} is ${Math.abs(edgePct).toFixed(2)}% ${edgePct > 0 ? 'above' : 'below'} spot ${spot} (OI ${domSide === 'CALL' ? cOI : pOI} vs ${domSide === 'CALL' ? pOI : cOI})`,
  };
}

// Combine into the day's shadow call. Deliberately conservative: all three must
// line up. G1 supplies a bias, G3 the day's direction — if they disagree, we
// stand aside and SAY SO, because a disagreement is itself data about which
// layer drives COG's calls.
export function combine(g1, g2, g3) {
  const reasons = [];
  if (g1.state === 'INVALID') reasons.push('G1 invalid: ' + g1.reason);
  if (g2.state !== 'VALID')   reasons.push('G2 invalid: ' + (g2.reason ?? ''));
  if (g3.state !== 'VALID')   reasons.push('G3 ' + g3.state.toLowerCase() + ': ' + (g3.reason ?? ''));

  const agree = g1.bias && g3.direction && g1.bias === g3.direction;
  const conflict = g1.bias && g3.direction && g1.bias !== g3.direction;
  if (conflict) reasons.push(`G1 tide says ${g1.bias} but G3 magnet says ${g3.direction}`);

  const action = (!reasons.length && agree) ? 'TRADE' : 'NO_TRADE';
  return {
    action,
    direction: action === 'TRADE' ? g3.direction : null,
    target: action === 'TRADE' ? g3.target : null,
    stopPct: g2.state === 'VALID' ? g2.standard.stopPct : null,
    riskPct: g2.state === 'VALID' ? g2.standard.riskPct : null,
    conflict: !!conflict,
    reasons,
  };
}
