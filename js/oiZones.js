/**
 * OI bot strategy — the gamma-regime master switch, as a pure planner.
 *
 * Turns one instrument's OI picture (from the shared oi_store / oiConfluence
 * bricks) + the live price + config into the trade ZONES the OI bot would take:
 * each with a mode, side, entry, structural SL, scale-out TPs, a size factor and
 * a plain-English rationale. ONE implementation → the zones page renders it AND
 * the Python executor trades it (no drift, the range-line pattern).
 *
 * The strategy (course Lessons 4–6 + the dealer-gamma mechanism):
 *   • PIN (long dealer gamma, +GEX)   → FADE strong walls toward max pain
 *     (Framework 1 wall-to-wall). Sell the call wall, buy the put wall.
 *   • BREAKOUT (short gamma, −GEX)     → FOLLOW a decisive wall break (Framework 3
 *     gamma squeeze) toward the next wall/cluster.
 *   • Near expiry (≤ nearExpiryDTE) + price extended from max pain → MAX-PAIN
 *     REVERSION toward the pin (Framework 2), regardless of regime.
 * Filters: only walls ≥ minTier (the 3× rule); skip walls that are LIQUIDATING
 * (defended then fading → likely to break); optionally require ESTABLISHED walls.
 * Size scales with wall strength × concentration × hold-score × GEX conviction.
 *
 * 2026-08 quant-review upgrades (see MD files/OI_BOT_QUANT_REVIEW_2026-08.md):
 *   • structural distances scale with refMove (pip counts stay as the floor)
 *   • GEX neutral band + conviction sizing vs the trailing median |GEX|
 *   • minRR gate (too-near TP1 promoted to the next ladder node, else dropped)
 *   • wall HOLD-SCORE (per-strike net GEX + OI flow + persistence + multiple),
 *     calibratable from the forward-test via injected weights
 *   • sub-tier walls trade small WITH confluence (subTierTrade)
 *   • react-node type weights + volume-magnet quality floor
 *   • same-side zone spacing dedupe; dropped zones reported via collectDrops
 *
 * FX is the weak asset (CME OI partial); gold + indices are where the mechanism is
 * real. The caller decides the universe — this just plans whatever it's given.
 * Pure: no network/clock/DOM; offline-testable.
 */

import { oiPriceConfirmation } from './oiConfluence.js';
import { oiRegimeBands } from './oi.js';

const _TIER_RANK = { weak: 1, moderate: 2, strong: 3 };
const _rank = t => _TIER_RANK[t] || 0;

// DTE of the expiry being PLANNED — the gate for Mode C (max-pain reversion).
//
// The producer hands the planner `tradeInst`, whose `.dte` is the expiry actually
// traded (the near-dated "day" set when a multi-expiry paste supplied one, else the
// primary) and whose `maxPain` comes from that SAME expiry. The DTE gate and the pin
// it reverts to must therefore read one expiry, or Mode C would time a 1-DTE gate
// against a 25-DTE pin. So `inst.dte` wins whenever it is present.
//
// `inst.expiries` was the ORIGINAL store shape and no longer exists on any live
// entry — the analyser writes `perExpiry` / `dayExpiry` instead. Reading it alone
// returned null for every instrument, which silently disabled Mode C entirely: the
// gate below is `dte != null && dte <= nearExpiryDTE`, so max-pain reversion could
// never fire on ANY instrument regardless of config. It is kept last as a legacy
// fallback (and is the shape the older unit tests construct).
function _nearDTE(inst) {
  if (Number.isFinite(inst?.dte)) return inst.dte;
  const rows = Array.isArray(inst?.perExpiry) ? inst.perExpiry : [];
  const perDtes = rows.map(e => e?.dte).filter(d => Number.isFinite(d));
  if (perDtes.length) return Math.min(...perDtes);
  const es = inst?.expiries ? Object.values(inst.expiries) : [];
  const dtes = es.map(e => e?.dte).filter(d => Number.isFinite(d));
  return dtes.length ? Math.min(...dtes) : null;
}

// Diagnostic companion to buildOIZones: when the planner returns NO zones for an
// in-universe instrument, say WHY in one short line — so an empty plan reads as
// "empty on purpose" (flat regime / no strong walls / walls out of range), not
// "broken". Mirrors the planner's gates. Returns null when zones SHOULD exist
// (the emptiness is unexplained and worth a real look). Universe membership is a
// producer concern, handled there — this only explains an in-universe blank.
export function explainNoZones(inst, price, cfg = {}) {
  if (!inst || typeof inst !== 'object') return 'no OI data in store';
  if (!(price > 0)) return 'no live price';
  const { minTier = 'strong', requireEstablished = false,
          fadeInPin = true, followBreaks = true,
          gexNeutralBand = 0.25, gexMedianAbs = null } = cfg;
  const gex = inst.exposures?.gex ?? inst.gex ?? 0;
  // Mirror the planner's neutral band: |gex| inside the band vs the trailing median
  // → NEUTRAL on purpose (regime not trusted), not a fault.
  const _med = Number.isFinite(gexMedianAbs) && gexMedianAbs > 0 ? gexMedianAbs : null;
  const _conv = _med ? Math.abs(gex) / _med : null;
  const _banded = _conv != null && gexNeutralBand > 0 && _conv < gexNeutralBand;
  const regime = _banded ? 'NEUTRAL' : gex > 0 ? 'PIN' : gex < 0 ? 'BREAKOUT' : 'NEUTRAL';
  const tierOK = w => _rank(w?.tier) >= _rank(minTier);
  const calls = Array.isArray(inst.callWalls) ? inst.callWalls : [];
  const puts = Array.isArray(inst.putWalls) ? inst.putWalls : [];
  const strongCalls = calls.filter(tierOK), strongPuts = puts.filter(tierOK);
  if (regime === 'NEUTRAL') return _banded
    ? `GEX inside the neutral band (|gex| ${_conv.toFixed(2)}× the trailing median < ${gexNeutralBand}) — regime sign not trusted, no fade/break zones`
    : 'flat GEX (gex≈0) — no PIN/BREAKOUT regime, no fade/break zones';
  if (!strongCalls.length && !strongPuts.length) {
    const best = [...calls, ...puts].reduce((m, w) => Math.max(m, _rank(w?.tier)), 0);
    const bestName = best >= 3 ? 'strong' : best >= 2 ? 'moderate' : best >= 1 ? 'weak' : 'none';
    return (calls.length + puts.length)
      ? `no walls ≥ ${minTier} (strongest present: ${bestName}) — lower minTier or none qualify`
      : 'no walls detected in the OI';
  }
  if (regime === 'PIN') {
    if (!fadeInPin) return 'PIN regime but fadeInPin is off';
    const resAbove = strongCalls.some(w => w.strike > price);
    const supBelow = strongPuts.some(w => w.strike < price);
    if (!resAbove && !supBelow)
      return `PIN: no ${minTier}+ wall bracketing price (need a call wall above or a put wall below ${price})`;
    if (requireEstablished) return 'PIN: bracketing walls present but none pass the established-wall filter';
    return null;   // fade zones should exist (unless every candidate was vetoed as liquidating)
  }
  if (regime === 'BREAKOUT' && !followBreaks) return 'BREAKOUT regime but followBreaks is off';
  return null;     // BREAKOUT with strong walls → break zones expected
}

// ── Wall hold-score: will price REACT at this wall, or blow through it? ───────
// A wall's holding power is not its OI count — it is which way dealers hedge when
// price gets there. Components (each 0–1, missing data drops out and the rest
// renormalise, so absent inputs never bias the score):
//   gex          — per-strike net GEX at the wall (from gexProfile): dealers long
//                  gamma there absorb the move (hold); flat/negative accelerates
//                  through it. THE mechanistic component.
//   flow         — OI building at the strike (fresh defence) vs unwinding
//                  (dissolving) from the day-over-day change classification.
//   persistence  — a wall across many expiries is structural, not a one-day pin.
//   mult         — the wall's continuous strength multiple (the 3× rule's raw
//                  number, finer than the tier bucket).
// `weights` overrides the priors — the producer injects calibrated weights from
// the forward-test (oi_hold_calibration) once enough touches have resolved.
// Returns { score: 0–1, parts: {comp: 0–1} } or null when NO component has data.
export const HOLD_WEIGHT_DEFAULTS = { gex: 0.35, flow: 0.25, persistence: 0.2, mult: 0.2 };
export function wallHoldScore(w, kind, { gexProfile = null, change = null, tol = 0, weights = null } = {}) {
  if (!w || !Number.isFinite(w.strike)) return null;
  const parts = {};
  // Per-strike net GEX share: nearest profile row to the strike, scaled by the
  // profile's max |netGex| → 0.5 = neutral, 1 = strongest positive (absorbing).
  if (Array.isArray(gexProfile) && gexProfile.length) {
    const rows = gexProfile.filter(r => Number.isFinite(r?.strike) && Number.isFinite(r?.netGex));
    if (rows.length) {
      const near = rows.reduce((b, r) => Math.abs(r.strike - w.strike) < Math.abs(b.strike - w.strike) ? r : b);
      const maxAbs = rows.reduce((m, r) => Math.max(m, Math.abs(r.netGex)), 0);
      if (maxAbs > 0) parts.gex = +(0.5 + 0.5 * Math.max(-1, Math.min(1, near.netGex / maxAbs))).toFixed(3);
    }
  }
  // OI flow at the strike: building = 1 (fresh defence), unwinding = 0, no signal = 0.5.
  if (change && Array.isArray(change.events)) {
    const ev = change.events.filter(e => e.kind === kind && Math.abs(e.strike - w.strike) <= Math.max(tol, 0));
    if (ev.length) parts.flow = ev.some(e => e.type === 'liquidation') ? 0
      : ev.some(e => e.type === 'fresh_wall' || e.type === 'fresh_positioning') ? 1 : 0.5;
  }
  if (Number.isFinite(w.persistence)) parts.persistence = +Math.min(1, Math.max(0, w.persistence) / 5).toFixed(3);
  if (Number.isFinite(w.mult)) parts.mult = +Math.max(0, Math.min(1, (w.mult - 1) / 3)).toFixed(3);
  const keys = Object.keys(parts);
  if (!keys.length) return null;
  const wts = { ...HOLD_WEIGHT_DEFAULTS, ...(weights || {}) };
  let num = 0, den = 0;
  for (const k of keys) { const ww = Math.max(0, wts[k] ?? 0); num += ww * parts[k]; den += ww; }
  if (den <= 0) return null;
  return { score: +(num / den).toFixed(2), parts };
}

export function buildOIZones(inst, price, cfg = {}) {
  if (!inst || typeof inst !== 'object' || !(price > 0)) return [];
  const {
    pip = 0.0001,
    minTier = 'strong',            // only walls this strong or better
    slBufferPips = 15,             // structural stop beyond the wall
    breakPips = 20,                // decisive-break distance (hold-vs-break)
    nearExpiryDTE = 2,             // max-pain reversion window
    extendedPips = 30,             // "price extended from max pain" threshold
    maxpainSlFrac = 1.0,           // Mode C stop cap, as a fraction of the distance to the pin.
                                   // The guard wall (next structural level on the far side) is the
                                   // right stop when it is CLOSE — price stalling there is the thesis
                                   // failing. When price is extended it can sit far away, giving a stop
                                   // many times the target: risk sizing then collapses to the 0.01-lot
                                   // floor (where a wide stop OVERSHOOTS risk_pct) or minRR drops the
                                   // zone outright. Capping at this × the pin distance makes
                                   // reward:risk ≥ 1/maxpainSlFrac BY CONSTRUCTION, so Mode C can never
                                   // be silently dropped by its own minRR gate. 0 = uncapped (old
                                   // behaviour: pure guard wall).
    fadeInPin = true, followBreaks = true, maxPainReversion = true,
    requireEstablished = false, avoidLiquidating = true,
    maxZonesPerSide = 4,           // TRADE only the K walls per side — for PIN fades the K
                                   // NEAREST strong walls bracketing price (the active
                                   // range); for breakouts the K strongest by OI. 0 = no cap.
    secondaryTrim = 0.6,           // PIN fade: the nearest strong wall is the primary (full
                                   // size); each further wall on that side is "secondary" and
                                   // sized ×this (the active pin boundary is the nearest wall).
    reachMult = 1.0,               // reachability: an entry more than reachMult × the option-
                                   // implied move from spot is low-probability to fill BY EXPIRY
                                   // (the option market prices it as unlikely). Flag + trim.
    reachTrim = 0.7,               // size haircut for an entry beyond the implied-move horizon.
    maxReachPips = 0,              // fallback reach cap in pips when no expMove/IV is present
                                   // (0 = off → unchanged when IV wasn't pasted).
    persistenceWeight = 0.1,       // how much across-expiry durability boosts a wall's
                                   // rank/size (0 = ignore; each extra expiry ≈ +10%).
    persistentDTE = 5,             // "durable" = present in ≥ this many expiries (size bump + rationale)
    fallbackTpR = 0,               // when a zone has NO wall-based TP (e.g. a breakout through the
                                   // outermost wall — common on FX where CME OI is partial), give it
                                   // a measured-move TP at this R-multiple of the stop distance.
                                   // 0 = leave it SL-only (unchanged). The producer sets it for FX.
    nearFlip = false,              // spot sits within ~0.5 ATR of the gamma flip → regime is at the
                                   // boundary and less reliable; trim size (distance-to-flip vol read).
    regimeWarning = null,          // flip-drift note (regime change loading) — appended to rationale.
    refMove = null,                // symmetric fallback distance scale (inst.refMove.move): implied
                                   // when trustworthy, else flat-vol. Used when expMove is absent —
                                   // which is now the NORMAL case on indices, whose straddle column
                                   // mis-parses and is correctly rejected, leaving expectedMove null.
    expMove = null,                // {upper,lower} option-implied range to expiry — a TP beyond it is
                                   // low-probability by expiry (flagged in the rationale, not blocked).
    vannaNote = null,              // vanna-state note (firing tailwind/headwind) — appended to rationale.
    stability = null,              // oiWallStability(...) output (server-injected from oi_history)
    change = null,                 // classifyOIChange(...) output (server-injected)
    pathBlockCheck = true,         // flag when ANOTHER wall sits between spot and the zone's entry —
                                   // price interacts with that nearer level FIRST (it may reject/stall
                                   // before reaching the stronger wall the bot is trading). Note + trim,
                                   // never blocks. Uses ALL walls (incl. sub-minTier ones the bot skips).
    blockMinTier = 'moderate',     // a path wall must be ≥ this tier to count as a blocker (skip trivia)
    blockTrim = 0.9,               // entry-size haircut when a blocking wall sits in the path
    levelLadderTP = false,         // opt-in: TP to the NEAREST structural level in the trade's profit
                                   // direction (walls · max pain · gamma flip · vanna flip · vol magnets),
                                   // trade level-to-level, instead of defaulting TP1 to (a far, weak-
                                   // until-expiry) max pain. Off → the classic max-pain/next-wall targets.
    gammaFlipLevel = null,         // the zero-GEX crossing (regime boundary) — a ladder node when present
    vannaFlipLevel = null,         // vanna-exposure flip — a ladder node when an IV smile was pasted
    gexFlipLevel = null,           // total-GEX zero crossing — a react/ladder node when present
    reactAtLevels = false,         // opt-in Mode D: trade BETWEEN structural nodes (walls ≥ reactMinTier +
                                   // gamma/gex/vanna flips + volume magnets), treated BY REGIME — fade a
                                   // node toward the next node (PIN full size; BREAKOUT counter-trend trim).
    reactMinTier = 'moderate',     // which walls count as reaction nodes (flips/magnets always count)
    reactBreakoutTrim = 0.6,       // size haircut for a react-fade in BREAKOUT (fading is counter-trend
                                   // in short gamma — nodes still act as intraday S/R, but respect the trend)
    vannaState = null,             // {state:'tailwind'|'headwind', firing} — conditions size BY MODE per theory:
                                   // tailwind (dealer flow amplifies the move) boosts FOLLOW-breaks + trims
                                   // fades; headwind mirrors. Only when firing. null = no effect.
    vannaBoost = 1.15, vannaTrim = 0.85,
    charmActive = false,           // charm firing near expiry → amplify the max-pain PIN (Mode C): charm
                                   // flows pin price toward strikes as time decays into expiry/the close.
    charmBoost = 1.2,
    localRegime = false,           // OFF by default. The net-GEX regime is evaluated AT SPOT, so it's the
                                   // right read for where price IS — but the bot trades WALLS that can sit
                                   // in a DIFFERENT gamma band (the regime flips at each gamma crossing).
                                   // Fading a wall that lives in a short-gamma band (it may BREAK not hold),
                                   // or following a break INTO a long-gamma band (dealers dampen it), is the
                                   // wrong side. When on, gate each fade/break zone by the LOCAL regime at
                                   // the wall (from oiRegimeBands) and trim size on a mismatch. Live-trading
                                   // change — kept behind a flag for forward-testing before default-on.
    localRegimeTrim = 0.5,         // size haircut for a wall whose local band contradicts its fade/follow mode
    // ── refMove-scaled structural distances ─────────────────────────────────
    // pip = 1.0 for gold AND every index, so a global pip count is 0.03% of spot on
    // Dow but 0.63% on Russell (~20× spread in effective buffer). Effective distance
    // = max(pips × pip, frac × refMove): pips stay as the floor, the fraction of the
    // instrument's own reference move does the scaling. frac 0 (or no refMove) →
    // pips-only, exactly the old behaviour.
    slBufferRefFrac = 0.10,        // SL buffer as a fraction of refMove
    breakRefFrac = 0.15,           // decisive-break distance as a fraction of refMove
    extendedRefFrac = 0.25,        // max-pain "extended" threshold as a fraction of refMove
    // Absolute floor under the SL buffer, in this instrument's own price units (0 = off).
    // refMove-fraction sizing is right for REACH/trigger checks — a wall genuinely does
    // reach less far on a 1-DTE book than a 30-DTE one, and shrinking those with a
    // day-scaled refMove is the whole point. But the stop shares the same refMove input,
    // and a plain fraction of a much smaller number can undercut what the instrument's own
    // noise (spread + ordinary wicks) needs to not be stopped out by chop rather than by
    // the level actually failing. Set per-instrument by the producer (day-scaled refMove
    // shrank gold's buffer from ~45 to ~8 price units — $0.30 typical spread away, thin);
    // 0 leaves the pure fraction × refMove behaviour unchanged for every other instrument.
    minStopAbs = 0,
    // ── GEX conviction (neutral band + sizing) ──────────────────────────────
    // The regime was SIGN-ONLY: a book +0.1% net GEX today and −0.1% tomorrow flipped
    // the whole strategy (fade ↔ follow) on noise around zero. gexMedianAbs (injected
    // by the producer from oi_history — trailing median |netGEX|) anchors a neutral
    // band: |gex| below band × median → NEUTRAL (no fade/break zones; max-pain
    // reversion still runs, it is regime-agnostic). Above the band, size scales with
    // conviction = |gex|/median, clamped — a barely-positive book fades at half size.
    gexNeutralBand = 0.25,         // |gex| < this × median|gex| → NEUTRAL (0 = off)
    gexMedianAbs = null,           // trailing median |netGEX| (producer-injected; null = band+conviction off)
    convictionSizing = true,       // scale zone size with |gex|/median (clamped 0.5–1.2)
    // ── minimum reward:risk ─────────────────────────────────────────────────
    minRR = 0.8,                   // drop (or ladder-promote past) a TP1 closer than this × the stop
                                   // distance — a 0.2R fade was previously planned at full size. 0 = off.
    // ── smaller trade levels (sub-tier walls, graded in — not gated out) ────
    subTierTrade = false,          // walls BELOW minTier become fade zones at subTierSize — but only
                                   // WITH CONFLUENCE (a volume magnet / flip / multi-expiry persistence
                                   // agreeing within tolerance). A weak wall alone is noise; a weak wall
                                   // on the day's volume shelf is a level.
    subTierSize = 0.4,             // size multiplier for sub-tier confluence zones
    minZoneSpacing = 0.05,         // same-side zones closer than this × refMove collapse to the
                                   // higher-conviction one (plan-side dedupe; the executor's stack
                                   // guard stays as the backstop). 0 or no refMove = off.
    // ── react-node weights + volume-magnet quality ──────────────────────────
    // Mode D treated every node type identically — but a wall is defended inventory,
    // a volume magnet is one day's flow, and a flip is a transition zone with nothing
    // defending it. Per-type size weights (0 = that type doesn't enter); flips and
    // magnets keep working as TP-ladder nodes regardless.
    reactNodes = null,             // {walls, gammaFlip, gexFlip, vannaFlip, volMagnets} — merged over defaults
    volMagnetMinShare = 0.25,      // a magnet needs ≥ this share of the strongest magnet's volume to
                                   // count as a node (top-8 by volume was the only floor before)
    // ── wall hold-score (react-vs-blow-through) ─────────────────────────────
    holdScore = true,              // compute + stamp a 0–1 hold score per wall zone; sizes FADES by it
                                   // (breaks keep the existing OI-flow confirmation — no double count)
    holdWeights = null,            // calibrated component weights (producer-injected from
                                   // oi_hold_calibration once the forward-test has enough trades)
    collectDrops = null,           // array to receive {level, mode, side, reason} for every zone the
                                   // planner dropped (minRR / spacing) — so a blank reads as intended
  } = cfg;

  const gex = inst.exposures?.gex ?? inst.gex ?? 0;
  // Conviction vs the trailing median |GEX| (null when no history was injected).
  const _medAbs = Number.isFinite(gexMedianAbs) && gexMedianAbs > 0 ? gexMedianAbs : null;
  const conviction = _medAbs ? +(Math.abs(gex) / _medAbs).toFixed(2) : null;
  const _neutralByBand = conviction != null && gexNeutralBand > 0 && conviction < gexNeutralBand;
  const regime = _neutralByBand ? 'NEUTRAL' : gex > 0 ? 'PIN' : gex < 0 ? 'BREAKOUT' : 'NEUTRAL';
  // Conviction size multiplier for regime-dependent zones (fade/break/react — NOT
  // maxpain, which is regime-agnostic). No history → 1 (unchanged behaviour).
  const convMult = (convictionSizing && conviction != null && regime !== 'NEUTRAL')
    ? Math.min(1.2, Math.max(0.5, conviction)) : 1;
  // Local gamma regime along price (from the zero-gamma crossings), so a wall can be judged
  // by the regime AT ITS OWN PRICE, not just the net sign at spot. Null unless the flag is on
  // and the inst carries gexFlips — degrades to the net-GEX regime (current behaviour) otherwise.
  const _rmWin = (Number.isFinite(refMove) && refMove > 0) ? refMove
               : (Number.isFinite(inst.refMove?.move) && inst.refMove.move > 0) ? inst.refMove.move
               : (Number.isFinite(price) ? price * 0.02 : 0);
  const _bands = (localRegime && _rmWin > 0) ? oiRegimeBands(inst, { lo: price - 4 * _rmWin, hi: price + 4 * _rmWin }) : null;
  // A band list with no crossing in it carries NO local information: oiRegimeBands
  // returns a single band spanning the whole window at the net-GEX sign, so every
  // price "resolves" to the regime we already knew. Reporting that as a local read
  // produced "· local pin confirmed" on walls where nothing had been checked — worse
  // than no gate, because it asserts a confirmation. 0 crossings → 1 band, N in-range
  // crossings → N+1, so >1 band is exactly the condition for a real local read.
  const _bandsResolve = Array.isArray(_bands) && _bands.length > 1;
  const _regimeAtPrice = (p) => {
    if (!_bandsResolve || !Number.isFinite(p)) return null;
    const b = _bands.find(bd => p >= bd.lo && p <= bd.hi);
    return (b && b.regime !== 'neutral') ? b.regime : null;   // 'pin' | 'breakout' | null
  };
  const maxPain = Number.isFinite(inst.maxPain) ? inst.maxPain : null;
  const conc = inst.concentration?.read || null;
  // Effective structural distances: pip floor + refMove fraction (see above).
  const _ref = Number.isFinite(refMove) && refMove > 0 ? refMove : null;
  const _eff = (pips, frac) => Math.max(pips * pip, (_ref && frac > 0) ? frac * _ref : 0);
  const buf = Math.max(_eff(slBufferPips, slBufferRefFrac), minStopAbs > 0 ? minStopAbs : 0);
  const brk = _eff(breakPips, breakRefFrac);
  const ext = _eff(extendedPips, extendedRefFrac);
  const tol = Math.max(buf, pip);
  const tierOK = w => _rank(w?.tier) >= _rank(minTier);
  const _reactW = { walls: 1.0, gammaFlip: 0.8, gexFlip: 0.8, vannaFlip: 0.6, volMagnets: 0.6, ...(reactNodes || {}) };
  // Volume magnets with a quality floor: ≥ minShare of the strongest magnet's volume.
  // Applied everywhere magnets are used (react nodes AND ladder targets) — magnet #8
  // at 3% of magnet #1's volume was previously a full node.
  const _magnets = (() => {
    const vs = (Array.isArray(inst.volumeMagnets) ? inst.volumeMagnets : []).filter(v => Number.isFinite(v?.strike));
    const top = vs.reduce((m, v) => Math.max(m, v?.volume || 0), 0);
    return top > 0 ? vs.filter(v => (v.volume || 0) >= volMagnetMinShare * top) : vs;
  })();
  const _drop = (z, reason) => { if (Array.isArray(collectDrops)) collectDrops.push({ mode: z.mode, side: z.side, level: z.level ?? null, entry: z.entry ?? null, reason }); };

  // Keep walls ≥ minTier, then rank by STRENGTH = OI × durability, where durability
  // rewards a wall present across many expiries (persistence — a wall living in one
  // 0-DTE expiry is a transient pin; one across 15 expiries is a structural level).
  // Take the K strongest per side so the bot trades the dominant, most-durable walls.
  const strength = w => (w?.oi || 0) * (1 + persistenceWeight * Math.max(0, (w?.persistence || 0) - 1));
  const _rank2 = a => a.slice().sort((x, y) => strength(y) - strength(x));
  const _cap = a => (maxZonesPerSide > 0 ? a.slice(0, maxZonesPerSide) : a);
  const calls = _cap(_rank2((Array.isArray(inst.callWalls) ? inst.callWalls : []).filter(tierOK)));
  const puts = _cap(_rank2((Array.isArray(inst.putWalls) ? inst.putWalls : []).filter(tierOK)));

  const isLiquidating = (strike, kind) => avoidLiquidating &&
    (change?.events || []).some(e => e.type === 'liquidation' && e.kind === kind && Math.abs(e.strike - strike) <= tol);
  // OI flow AT a wall strike: +1 = OI building here (fresh money), −1 = unwinding,
  // 0 = no change signal. Reads the classifyOIChange events the producer injected.
  const wallOIFlow = (strike, kind) => {
    const ev = (change?.events || []).filter(e => e.kind === kind && Math.abs(e.strike - strike) <= tol);
    if (ev.some(e => e.type === 'fresh_wall' || e.type === 'fresh_positioning')) return 1;
    if (ev.some(e => e.type === 'liquidation')) return -1;
    return 0;
  };
  const isEstablished = (strike, kind) => !requireEstablished ||
    (stability || []).some(w => w.kind === kind && Math.abs(w.strike - strike) <= tol && w.established);
  // A wall present across many expiries is a durable structural level, not a one-day
  // pin — nudge size up (capped) so the bot leans harder on the persistent walls.
  const isDurable = w => (w?.persistence || 0) >= persistentDTE;
  const sizeFactor = w => {
    let s = _rank(w?.tier) >= 3 ? 1.5 : _rank(w?.tier) >= 2 ? 1.0 : 0.6;
    if (conc === 'concentrated') s *= 1.2; else if (conc === 'dispersed') s *= 0.8;
    if (isDurable(w)) s *= 1.15;
    if (nearFlip) s *= 0.85;   // spot near the gamma flip → regime unstable, trade smaller
    return +Math.min(s, 2.0).toFixed(2);
  };
  const persNote = w => (w?.persistence > 1 ? ` · durable ${w.persistence}exp` : '');

  // Path-blocking wall: the FIRST wall price runs into on the way to a zone's entry.
  // The bot trades the STRONGEST wall (by OI×durability) which may sit further away than
  // a weaker wall — but price hits the nearer one first and can reject/stall there. Use
  // the FULL wall list (all tiers, incl. the sub-minTier walls the bot won't trade) so a
  // nearby moderate wall the selector dropped still registers as a level in the path.
  const _blockRank = _rank(blockMinTier);
  const allWalls = [
    ...(Array.isArray(inst.callWalls) ? inst.callWalls : []).map(w => ({ strike: w?.strike, tier: w?.tier, kind: 'call' })),
    ...(Array.isArray(inst.putWalls) ? inst.putWalls : []).map(w => ({ strike: w?.strike, tier: w?.tier, kind: 'put' })),
  ].filter(w => Number.isFinite(w.strike) && _rank(w.tier) >= _blockRank);
  // Nearest wall STRICTLY between spot and `entry`, excluding the wall being traded
  // (`ownLevel`). Returns the one closest to price (first hit), or null.
  const nearestBlocker = (entry, ownLevel) => {
    if (!pathBlockCheck) return null;
    const lo = Math.min(price, entry), hi = Math.max(price, entry);
    const cands = allWalls.filter(w => w.strike > lo + tol && w.strike < hi - tol && Math.abs(w.strike - ownLevel) > tol);
    if (!cands.length) return null;
    return cands.sort((a, b) => Math.abs(a.strike - price) - Math.abs(b.strike - price))[0];
  };

  // Reachability: is this entry so far from spot that price is unlikely to reach it by
  // expiry? The option-implied move (expMove, per direction) IS the market's own read of
  // how far price travels — an entry beyond reachMult × that half-move is low-probability
  // to fill. Returns a short label when beyond (→ flag + trim, never blocks), else null.
  // With no expMove (IV not pasted) fall back to a pip cap; maxReachPips 0 = off. maxpain
  // enters at spot so it always passes.
  const reachFlag = (entry) => {
    const dist = Math.abs(entry - price);
    if (expMove && Number.isFinite(expMove.upper) && Number.isFinite(expMove.lower)) {
      const half = entry >= price ? (expMove.upper - price) : (price - expMove.lower);
      if (half > 0 && dist > reachMult * half) return `~${(dist / half).toFixed(1)}× implied move`;
      return null;
    }
    // Symmetric reference move — same question, one less dimension. Without this the
    // gate fell through to a pip cap that defaults to OFF, so every index instrument
    // was armed with no reachability check at all.
    if (Number.isFinite(refMove) && refMove > 0) {
      if (dist > reachMult * refMove) return `~${(dist / refMove).toFixed(1)}× reference move`;
      return null;
    }
    if (maxReachPips > 0 && dist / pip > maxReachPips) return `${Math.round(dist / pip)}pip beyond ${maxReachPips}pip reach`;
    return null;
  };

  // ── Level-ladder targets (opt-in via levelLadderTP) ─────────────────────────
  // Every price level the market reacts to becomes a TP candidate: walls (ANY tier —
  // a wall the bot won't ENTER is still a level price stalls at), max pain, the gamma
  // flip (regime boundary), the vanna flip, and today's volume magnets. For a trade,
  // TP1 = the nearest node in the profit direction (bank at the first structure), TP2 =
  // the next (runner). Max pain becomes one node among many rather than the hardcoded
  // target — directly the "trade to the next level, level-to-level" behaviour.
  const _ladder = levelLadderTP ? (() => {
    const nodes = [];
    const push = (lvl, kind) => { if (Number.isFinite(lvl)) nodes.push({ lvl, kind }); };
    for (const w of (Array.isArray(inst.callWalls) ? inst.callWalls : [])) push(w?.strike, 'call wall');
    for (const w of (Array.isArray(inst.putWalls) ? inst.putWalls : [])) push(w?.strike, 'put wall');
    push(maxPain, 'max pain');
    push(gammaFlipLevel, 'gamma flip');
    push(vannaFlipLevel, 'vanna flip');
    for (const v of _magnets) push(v?.strike, 'vol magnet');   // quality-floored (volMagnetMinShare)
    return nodes;
  })() : null;
  // Nearest two nodes strictly in the profit direction (dir +1 = above entry, −1 = below),
  // skipping the traded wall (ownLevel) and anything within tol of the entry; near-identical
  // strikes collapse to the nearest. Returns {tp1,tp2,tp1kind,tp2kind} or null (nothing ahead).
  const ladderTP = (entry, dir, ownLevel) => {
    if (!_ladder) return null;
    const ahead = _ladder
      .filter(n => Math.abs(n.lvl - ownLevel) > tol && (dir > 0 ? n.lvl > entry + tol : n.lvl < entry - tol))
      .sort((a, b) => Math.abs(a.lvl - entry) - Math.abs(b.lvl - entry));
    const uniq = [];
    for (const n of ahead) if (!uniq.some(u => Math.abs(u.lvl - n.lvl) <= tol)) uniq.push(n);
    if (!uniq.length) return null;
    return { tp1: uniq[0].lvl, tp1kind: uniq[0].kind, tp2: uniq[1]?.lvl ?? null, tp2kind: uniq[1]?.kind ?? null };
  };
  // Compose the TP rationale fragment for a ladder trade (empty when the ladder is off).
  const ladderNote = L => L ? ` → ${L.tp1kind} ${+L.tp1.toFixed(6)}${L.tp2 != null ? ` then ${L.tp2kind} ${+L.tp2.toFixed(6)}` : ''}` : '';

  const zones = [];
  // Fallback measured-move TP: a trade with no wall-based target (both null) would go
  // to the broker SL-only. If fallbackTpR > 0, give it a TP at fallbackTpR × the stop
  // distance, in the trade's direction — so it always has a defined exit (used for FX,
  // where partial CME OI often leaves a breakout with no next wall ahead).
  const add = z => {
    let { tp1, tp2, rationale } = z;
    if (tp1 == null && tp2 == null && fallbackTpR > 0 && z.sl != null) {
      const risk = Math.abs(z.entry - z.sl);
      if (risk > 0) {
        tp1 = z.side === 'buy' ? z.entry + fallbackTpR * risk : z.entry - fallbackTpR * risk;
        rationale = `${rationale} · TP ${fallbackTpR}R measured move (no wall ahead)`;
      }
    }
    // Minimum reward:risk. TP1 to max pain (or the nearest ladder node) can sit a
    // handful of pips from the entry while the SL sits a full buffer behind the wall
    // — a 0.2R trade was previously planned, alerted, and traded at full size. With
    // a too-near TP1 and a further TP2 that clears the bar, promote TP2; otherwise
    // drop the zone and record why (SL-only zones pass — no TP to measure).
    if (minRR > 0 && z.sl != null && tp1 != null) {
      const risk = Math.abs(z.entry - z.sl);
      if (risk > 0) {
        let rr = Math.abs(tp1 - z.entry) / risk;
        if (rr < minRR && tp2 != null && Math.abs(tp2 - z.entry) / risk >= minRR) {
          rationale = `${rationale} · TP1 ${+(+tp1).toFixed(6)} inside ${minRR}R → promoted to next level`;
          tp1 = tp2; tp2 = null;
          rr = Math.abs(tp1 - z.entry) / risk;
        }
        if (rr < minRR) { _drop(z, `${rr.toFixed(2)}R < minRR ${minRR} — target too close to the entry for the stop`); return; }
      }
    }
    if (regimeWarning) rationale = `${rationale} · ⚠ ${regimeWarning}`;
    if (vannaNote) rationale = `${rationale} · ${vannaNote}`;
    // Vanna conditioner (theory): a 'tailwind' state = dealer vega-hedging AMPLIFIES the
    // prevailing move (buy strength / sell weakness) → supports continuation, so it boosts
    // FOLLOW-breaks and trims mean-reversion fades; 'headwind' mirrors. Applied to size
    // below, by mode (fade/react = reversion, break = follow), only when firing.
    let _vannaMult = 1;
    if (vannaState?.firing && (z.mode === 'fade' || z.mode === 'react' || z.mode === 'break')) {
      const isFollow = z.mode === 'break';
      const tail = vannaState.state === 'tailwind';
      _vannaMult = (tail === isFollow) ? vannaBoost : vannaTrim;   // tail+follow / head+fade → boost; else trim
      rationale = `${rationale} · vanna ${vannaState.state} → size ${_vannaMult > 1 ? 'up' : 'down'}`;
    }
    // A take-profit sitting beyond the option-implied expected-move band is a
    // low-probability target by expiry — flag it (don't block the trade).
    if (expMove && tp1 != null && (tp1 > expMove.upper || tp1 < expMove.lower))
      rationale = `${rationale} · ⚠ TP beyond implied move (low-prob by expiry)`;
    // A wall between spot and this entry is the first level price hits — flag it and
    // trim entry size (price may reject/stall there before reaching the traded wall).
    let sizeFactor = +(z.sizeFactor * _vannaMult).toFixed(2);
    if (z.blocker) {
      rationale = `${rationale} · ⚠ ${z.blocker.tier} ${z.blocker.kind} wall ${+z.blocker.strike.toFixed(6)} in the path (price hits it first)`;
      sizeFactor = +(sizeFactor * blockTrim).toFixed(2);
    }
    // Entry beyond the option-implied move → unlikely to fill by expiry: flag + trim.
    const reach = reachFlag(z.entry);
    if (reach) {
      rationale = `${rationale} · ⚠ ${reach} — unlikely to fill by expiry`;
      sizeFactor = +(sizeFactor * reachTrim).toFixed(2);
    }
    // Wall hold-score: sizes FADES (reversion leans on the wall holding) and
    // annotates breaks (which keep the OI-flow confirmation as their size input —
    // flow is a hold component, so sizing breaks by hold too would double-count it).
    if (holdScore && z.hold && Number.isFinite(z.hold.score)) {
      const hs = z.hold.score;
      if (z.mode === 'fade') {
        const hm = +(0.7 + 0.6 * hs).toFixed(2);              // 0.7× (weak wall) … 1.3× (strong hold)
        sizeFactor = +(sizeFactor * hm).toFixed(2);
        rationale = `${rationale} · hold ${Math.round(hs * 100)}%${hs < 0.4 ? ' ⚠ weak wall (blow-through risk)' : ''}`;
      } else if (z.mode === 'break') {
        rationale = `${rationale} · hold ${Math.round(hs * 100)}%${hs >= 0.7 ? ' ⚠ strong wall (break may stall)' : ''}`;
      }
    }
    // GEX conviction: regime-dependent zones scale with |GEX| vs its trailing median
    // (maxpain is regime-agnostic and skips it). Surfaced so the paper test can be
    // reviewed per conviction bucket later.
    if (conviction != null && z.mode !== 'maxpain') {
      sizeFactor = +(sizeFactor * convMult).toFixed(2);
      rationale = `${rationale} · GEX ${conviction}× median${convMult !== 1 ? ` → size ${convMult > 1 ? 'up' : 'down'}` : ''}`;
    }
    // Local-regime gate: a FADE wants its wall in a PIN (long-gamma) band; a BREAK wants a
    // BREAKOUT (short-gamma) band. The net-GEX regime is at spot, but the wall may sit past a
    // gamma crossing — so judge the wall by the band AT ITS OWN PRICE and trim on a mismatch.
    if (_bands && (z.mode === 'fade' || z.mode === 'break')) {
      const rg = _regimeAtPrice(z.level);
      const wants = z.mode === 'fade' ? 'pin' : 'breakout';
      if (rg && rg !== wants) {
        sizeFactor = +(sizeFactor * localRegimeTrim).toFixed(2);
        rationale = `${rationale} · ⚠ wall in ${rg === 'breakout' ? 'short-gamma zone (may break, not hold)' : 'long-gamma zone (break may be dampened)'} → size down`;
      } else if (rg) {
        rationale = `${rationale} · local ${rg} confirmed`;
      } else if (!_bandsResolve) {
        // Say so rather than passing silently: the gate was asked for and could not run.
        rationale = `${rationale} · local regime unresolved (no gamma crossing in range)`;
      }
    }
    zones.push({ ...z, sizeFactor, entry: +z.entry.toFixed(6), sl: +z.sl.toFixed(6),
      tp1: tp1 != null ? +tp1.toFixed(6) : null, tp2: tp2 != null ? +tp2.toFixed(6) : null,
      hold: z.hold?.score ?? null, holdParts: z.hold?.parts ?? null, conviction, rationale, regime });
  };

  // ── Mode A — PIN: fade strong walls toward max pain ─────────────────────────
  // The active pin boundary is the NEAREST strong wall bracketing price, not the
  // strongest-by-OI (which can sit far out of range and never trade). Order resistance
  // above / support below by DISTANCE to price: the nearest is the primary fade (full
  // size); each further wall is "secondary" and sized ×secondaryTrim. Durability still
  // boosts size through sizeFactor(); the reachability gate in add() trims any that sit
  // beyond the implied move. Selecting by distance uses the FULL tierOK set (not the
  // strength-capped calls/puts) so a near strong wall can't be cut by a far stronger one.
  const _hold = (w, kind) => holdScore
    ? wallHoldScore(w, kind, { gexProfile: inst.gexProfile, change, tol, weights: holdWeights }) : null;
  if (fadeInPin && regime === 'PIN') {
    const resist = (Array.isArray(inst.callWalls) ? inst.callWalls : [])
      .filter(w => tierOK(w) && w.strike > price).sort((a, b) => a.strike - b.strike);
    const support = (Array.isArray(inst.putWalls) ? inst.putWalls : [])
      .filter(w => tierOK(w) && w.strike < price).sort((a, b) => b.strike - a.strike);
    const resistPin = maxZonesPerSide > 0 ? resist.slice(0, maxZonesPerSide) : resist;
    const supportPin = maxZonesPerSide > 0 ? support.slice(0, maxZonesPerSide) : support;
    resistPin.forEach((w, i) => {
      if (isLiquidating(w.strike, 'call') || !isEstablished(w.strike, 'call')) return;
      let tp1 = (maxPain != null && maxPain < w.strike) ? maxPain : null;
      let tp2 = support.filter(p => p.strike < w.strike).sort((a, b) => b.strike - a.strike)[0]?.strike ?? null;
      let tpNote = tp1 != null ? ` toward max pain ${maxPain}` : '';
      if (levelLadderTP) { const L = ladderTP(w.strike, -1, w.strike); tp1 = L?.tp1 ?? null; tp2 = L?.tp2 ?? null; tpNote = ladderNote(L); }
      const sec = i > 0;
      add({ mode: 'fade', side: 'sell', level: w.strike, entry: w.strike, sl: w.strike + buf,
        tp1, tp2, sizeFactor: +(sizeFactor(w) * (sec ? secondaryTrim : 1)).toFixed(2),
        blocker: nearestBlocker(w.strike, w.strike), hold: _hold(w, 'call'),
        rationale: `${regime} · call wall ${w.strike} ${w.tier}${w.mult ? ` ${w.mult}×` : ''} → fade (resistance)${tpNote}${conc ? ` · ${conc}` : ''}${persNote(w)} · ${sec ? 'secondary (further wall)' : 'primary (nearest strong wall)'}` });
    });
    supportPin.forEach((w, i) => {
      if (isLiquidating(w.strike, 'put') || !isEstablished(w.strike, 'put')) return;
      let tp1 = (maxPain != null && maxPain > w.strike) ? maxPain : null;
      let tp2 = resist.filter(c => c.strike > w.strike).sort((a, b) => a.strike - b.strike)[0]?.strike ?? null;
      let tpNote = tp1 != null ? ` toward max pain ${maxPain}` : '';
      if (levelLadderTP) { const L = ladderTP(w.strike, +1, w.strike); tp1 = L?.tp1 ?? null; tp2 = L?.tp2 ?? null; tpNote = ladderNote(L); }
      const sec = i > 0;
      add({ mode: 'fade', side: 'buy', level: w.strike, entry: w.strike, sl: w.strike - buf,
        tp1, tp2, sizeFactor: +(sizeFactor(w) * (sec ? secondaryTrim : 1)).toFixed(2),
        blocker: nearestBlocker(w.strike, w.strike), hold: _hold(w, 'put'),
        rationale: `${regime} · put wall ${w.strike} ${w.tier}${w.mult ? ` ${w.mult}×` : ''} → fade (support)${tpNote}${conc ? ` · ${conc}` : ''}${persNote(w)} · ${sec ? 'secondary (further wall)' : 'primary (nearest strong wall)'}` });
    });

    // ── Sub-tier walls, graded in — not gated out ─────────────────────────────
    // minTier was a binary gate while sizeFactor already grades tiers, so the
    // machinery for trading smaller levels at smaller size existed but was
    // unreachable below the gate. A sub-tier wall qualifies only WITH CONFLUENCE:
    // a second, independent read agreeing within tolerance (volume magnet, a
    // gamma/GEX/vanna flip, or multi-expiry persistence). A weak wall alone is
    // noise; a weak wall sitting on the day's volume shelf is a level.
    if (subTierTrade) {
      const confluence = (w) => {
        const near = (lvl) => Number.isFinite(lvl) && Math.abs(lvl - w.strike) <= tol * 2;
        if (_magnets.some(v => near(v.strike))) return 'volume magnet';
        if (near(gammaFlipLevel)) return 'gamma flip';
        if (near(gexFlipLevel)) return 'gex flip';
        if (near(vannaFlipLevel)) return 'vanna flip';
        if ((w?.persistence || 0) >= 2) return `persistent ${w.persistence}exp`;
        return null;
      };
      const _capSub = a => (maxZonesPerSide > 0 ? a.slice(0, maxZonesPerSide) : a);
      const subResist = _capSub((Array.isArray(inst.callWalls) ? inst.callWalls : [])
        .filter(w => !tierOK(w) && _rank(w?.tier) >= 1 && w.strike > price).sort((a, b) => a.strike - b.strike));
      const subSupport = _capSub((Array.isArray(inst.putWalls) ? inst.putWalls : [])
        .filter(w => !tierOK(w) && _rank(w?.tier) >= 1 && w.strike < price).sort((a, b) => b.strike - a.strike));
      for (const w of subResist) {
        const c = confluence(w);
        if (!c || isLiquidating(w.strike, 'call') || !isEstablished(w.strike, 'call')) continue;
        let tp1 = (maxPain != null && maxPain < w.strike) ? maxPain : null, tp2 = null, tpNote = tp1 != null ? ` toward max pain ${maxPain}` : '';
        if (levelLadderTP) { const L = ladderTP(w.strike, -1, w.strike); tp1 = L?.tp1 ?? null; tp2 = L?.tp2 ?? null; tpNote = ladderNote(L); }
        add({ mode: 'fade', side: 'sell', level: w.strike, entry: w.strike, sl: w.strike + buf,
          tp1, tp2, sizeFactor: +(sizeFactor(w) * subTierSize).toFixed(2),
          blocker: nearestBlocker(w.strike, w.strike), hold: _hold(w, 'call'),
          rationale: `${regime} · sub-tier ${w.tier} call wall ${w.strike} → fade SMALL (confluence: ${c})${tpNote}${persNote(w)}` });
      }
      for (const w of subSupport) {
        const c = confluence(w);
        if (!c || isLiquidating(w.strike, 'put') || !isEstablished(w.strike, 'put')) continue;
        let tp1 = (maxPain != null && maxPain > w.strike) ? maxPain : null, tp2 = null, tpNote = tp1 != null ? ` toward max pain ${maxPain}` : '';
        if (levelLadderTP) { const L = ladderTP(w.strike, +1, w.strike); tp1 = L?.tp1 ?? null; tp2 = L?.tp2 ?? null; tpNote = ladderNote(L); }
        add({ mode: 'fade', side: 'buy', level: w.strike, entry: w.strike, sl: w.strike - buf,
          tp1, tp2, sizeFactor: +(sizeFactor(w) * subTierSize).toFixed(2),
          blocker: nearestBlocker(w.strike, w.strike), hold: _hold(w, 'put'),
          rationale: `${regime} · sub-tier ${w.tier} put wall ${w.strike} → fade SMALL (confluence: ${c})${tpNote}${persNote(w)}` });
      }
    }
  }

  // ── Mode B — BREAKOUT: follow a decisive wall break (gamma squeeze) ──────────
  // A break is only "backed" if OI is BUILDING at the wall (new money forcing through).
  // A break on FALLING OI is short-covering / long-liquidation — the wall is dissolving
  // rather than being overpowered, so the follow-through is weaker: annotate + trim size.
  if (followBreaks && regime === 'BREAKOUT') {
    const breakNote = (strike, kind, dir) => {
      const conf = oiPriceConfirmation(wallOIFlow(strike, kind), dir);
      return conf ? { note: ` · ${conf.read} (${conf.trust})`, trim: conf.trust === 'weak' ? 0.85 : 1 } : { note: '', trim: 1 };
    };
    for (const w of calls) {
      const bn = breakNote(w.strike, 'call', +1);
      let tp1 = calls.filter(c => c.strike > w.strike).sort((a, b) => a.strike - b.strike)[0]?.strike ?? null, tp2 = null, tpNote = '';
      if (levelLadderTP) { const L = ladderTP(w.strike + brk, +1, w.strike); tp1 = L?.tp1 ?? null; tp2 = L?.tp2 ?? null; tpNote = ladderNote(L); }
      add({ mode: 'break', side: 'buy', level: w.strike, entry: w.strike + brk, sl: w.strike - buf,
        tp1, tp2, sizeFactor: +(sizeFactor(w) * bn.trim).toFixed(2), blocker: nearestBlocker(w.strike + brk, w.strike),
        hold: _hold(w, 'call'),
        rationale: `${regime} · call wall ${w.strike} ${w.tier} → follow the break UP (short-gamma squeeze) past ${+(w.strike + brk).toFixed(6)}${tpNote}${persNote(w)}${bn.note}` });
    }
    for (const w of puts) {
      const bn = breakNote(w.strike, 'put', -1);
      let tp1 = puts.filter(p => p.strike < w.strike).sort((a, b) => b.strike - a.strike)[0]?.strike ?? null, tp2 = null, tpNote = '';
      if (levelLadderTP) { const L = ladderTP(w.strike - brk, -1, w.strike); tp1 = L?.tp1 ?? null; tp2 = L?.tp2 ?? null; tpNote = ladderNote(L); }
      add({ mode: 'break', side: 'sell', level: w.strike, entry: w.strike - brk, sl: w.strike + buf,
        tp1, tp2, sizeFactor: +(sizeFactor(w) * bn.trim).toFixed(2), blocker: nearestBlocker(w.strike - brk, w.strike),
        hold: _hold(w, 'put'),
        rationale: `${regime} · put wall ${w.strike} ${w.tier} → follow the break DOWN (short-gamma squeeze) past ${+(w.strike - brk).toFixed(6)}${tpNote}${persNote(w)}${bn.note}` });
    }
  }

  // ── Mode C — max-pain reversion near expiry ─────────────────────────────────
  const dte = _nearDTE(inst);
  if (maxPainReversion && dte != null && dte <= nearExpiryDTE && maxPain != null && Math.abs(price - maxPain) >= ext) {
    const side = price > maxPain ? 'sell' : 'buy';
    const guardWall = side === 'sell'
      ? calls.filter(c => c.strike > price).sort((a, b) => a.strike - b.strike)[0]?.strike
      : puts.filter(p => p.strike < price).sort((a, b) => b.strike - a.strike)[0]?.strike;
    // Charm (theory): as time decays into expiry, dealer charm-hedging pins price toward
    // the big strikes — so near expiry a firing charm AMPLIFIES the max-pain pull. Boost size.
    const mcSize = charmActive ? +(1.0 * charmBoost).toFixed(2) : 1.0;
    // Stop distance: the guard wall when it is near, capped at maxpainSlFrac × the
    // distance to the pin (see the cfg note). Floored at `buf` so the stop is never
    // inside the noise band, and falling back to buf×4 only when BOTH inputs are
    // absent (no guard wall and the cap switched off).
    const mpTargetDist = Math.abs(price - maxPain);
    const mpGuardDist = guardWall != null ? Math.abs(guardWall - price) + buf : Infinity;
    const mpCapDist = maxpainSlFrac > 0 ? maxpainSlFrac * mpTargetDist : Infinity;
    const mpCands = [mpGuardDist, mpCapDist].filter(d => Number.isFinite(d) && d > 0);
    const mpSlDist = Math.max(buf, mpCands.length ? Math.min(...mpCands) : buf * 4);
    const mpSlSrc = !mpCands.length ? `${+(buf * 4).toFixed(6)} fallback (no guard wall)`
      : (mpCapDist < mpGuardDist ? `capped ${maxpainSlFrac}× pin distance`
        : `guard wall ${+guardWall.toFixed(6)}`);
    // minDist rides the zone so the ENGINE re-validates at fire time: the extended
    // check above ran at plan-build; by the time the bot loads the plan (or restarts)
    // price may already be back at the pin — the edge is spent and the zone must not
    // fire. The engine requires |px − level| ≥ minDist on the planned side.
    // Mode C is the ONLY mode whose entry and stop come from SPOT rather than from a
    // strike -- and `price` here is the OI capture's spot (paired to the futures for the
    // basis once a day), not a live quote. `wall ± buf` is the same number all day;
    // `spot ± mpSlDist` is not, and by mid-session it can sit the WRONG SIDE of the
    // market: a max-pain buy whose stop is above the bid is rejected by MT5 (10016) on
    // every retry, forever, because a rejection deliberately keeps the zone open. So ship
    // the stop's INGREDIENTS -- all of them day-static (a strike, a fraction, a floor) --
    // and let the executor re-anchor them to live price at fire time, which is the same
    // immunity every strike-anchored mode already gets for free. `sl` stays as the
    // plan-time absolute: the zones page renders it, and an older executor still reads it.
    add({ mode: 'maxpain', side, level: maxPain, entry: price, minDist: +ext.toFixed(6),
      sl: side === 'sell' ? price + mpSlDist : price - mpSlDist,
      slGuardWall: guardWall != null ? +guardWall.toFixed(6) : null,   // a STRIKE (day-static), not the distance to it
      slFrac: maxpainSlFrac,                                           // re-cap against the LIVE distance to the pin
      slFloor: +buf.toFixed(6),                                        // noise-band floor
      slDist: +mpSlDist.toFixed(6),                                    // plan-time resolution (last-resort fallback)
      tp1: maxPain, tp2: null, sizeFactor: mcSize,
      rationale: `max-pain reversion · ${dte}DTE · price extended from pin ${maxPain} → fade toward it · stop ${mpSlSrc}, re-anchored to live price at entry${charmActive ? ' · charm firing → pin amplified into expiry' : ''}` });
  }

  // ── Mode D — react at levels (opt-in reactAtLevels): trade BETWEEN structural nodes,
  // treated BY REGIME (the dealer-gamma theory the owner asked for). Nodes = walls ≥
  // reactMinTier + gamma/gex/vanna flips + volume magnets. A node ABOVE spot is resistance
  // → SELL (react-fade down to the next node); a node BELOW is support → BUY (react-fade up).
  //   • PIN (long dealer gamma): mean-reversion regime → fading nodes is the natural play,
  //     full size (the reachability/vanna conditioners still apply in add()).
  //   • BREAKOUT (short gamma): price TRENDS, so fading a node is a counter-trend scalp —
  //     nodes still act as intraday S/R (the flip capping a rally is the classic short-gamma
  //     rejection), but size is trimmed ×reactBreakoutTrim to respect the trend; the Mode-B
  //     follow-breaks carry the continuation. This is the level-to-level "trade between the
  //     levels" behaviour, with the break handling "…unless it's in the same direction".
  // Skips a node already traded by Modes A/B on the SAME side (no duplicate zone); the
  // opposite side is allowed so a wall is bracketed (buy the bounce / sell the break).
  if (reactAtLevels && regime !== 'NEUTRAL') {
    const rTierOK = w => _rank(w?.tier) >= _rank(reactMinTier);
    // Per-node-type weights: a wall is defended inventory, a volume magnet is one
    // day's flow, a flip is a transition zone with nothing defending it — they are
    // not equally trustworthy entries. weight 0 = that type never ENTERS (it still
    // serves as a TP node); the weight multiplies the react zone's size.
    const _kindW = { 'call wall': _reactW.walls, 'put wall': _reactW.walls, 'gamma flip': _reactW.gammaFlip,
                     'gex flip': _reactW.gexFlip, 'vanna flip': _reactW.vannaFlip, 'vol magnet': _reactW.volMagnets };
    const rnodes = [];
    const push = (lvl, kind) => { if (Number.isFinite(lvl)) rnodes.push({ lvl, kind }); };
    for (const w of (Array.isArray(inst.callWalls) ? inst.callWalls : [])) if (rTierOK(w)) push(w.strike, 'call wall');
    for (const w of (Array.isArray(inst.putWalls) ? inst.putWalls : [])) if (rTierOK(w)) push(w.strike, 'put wall');
    push(gammaFlipLevel, 'gamma flip');
    push(gexFlipLevel, 'gex flip');
    push(vannaFlipLevel, 'vanna flip');
    for (const v of _magnets) push(v?.strike, 'vol magnet');   // quality-floored (volMagnetMinShare)
    // Collapse near-identical nodes (first push wins → a wall label beats a coincident flip/magnet).
    const dedup = [];
    for (const n of rnodes) if (!dedup.some(d => Math.abs(d.lvl - n.lvl) <= tol)) dedup.push(n);
    const nextNode = (from, dir) => dedup
      .filter(n => dir > 0 ? n.lvl > from + tol : n.lvl < from - tol)
      .sort((a, b) => Math.abs(a.lvl - from) - Math.abs(b.lvl - from))[0] ?? null;
    const trim = regime === 'BREAKOUT' ? reactBreakoutTrim : 1;
    const trimNote = trim < 1 ? ' · counter-trend (short-gamma) trimmed' : '';
    const already = (lvl, side) => zones.some(z => Number.isFinite(z.level) && Math.abs(z.level - lvl) <= tol && z.side === side);
    const cap = a => (maxZonesPerSide > 0 ? a.slice(0, maxZonesPerSide) : a);
    const above = cap(dedup.filter(n => n.lvl > price + tol).sort((a, b) => a.lvl - b.lvl));   // resistance
    const below = cap(dedup.filter(n => n.lvl < price - tol).sort((a, b) => b.lvl - a.lvl));   // support
    const wNote = (wgt) => wgt !== 1 ? ` · node weight ×${wgt}` : '';
    for (const n of above) {
      const wgt = _kindW[n.kind] ?? 1;
      if (wgt <= 0 || already(n.lvl, 'sell')) continue;
      const t1 = nextNode(n.lvl, -1), t2 = t1 ? nextNode(t1.lvl, -1) : null;
      add({ mode: 'react', side: 'sell', level: n.lvl, entry: n.lvl, sl: n.lvl + buf,
        tp1: t1?.lvl ?? null, tp2: t2?.lvl ?? null, sizeFactor: +(1 * trim * wgt).toFixed(2),
        blocker: nearestBlocker(n.lvl, n.lvl),
        rationale: `${regime} · ${n.kind} ${+n.lvl.toFixed(6)} → react-fade (resistance)${t1 ? ` → ${t1.kind} ${+t1.lvl.toFixed(6)}` : ''}${trimNote}${wNote(wgt)}` });
    }
    for (const n of below) {
      const wgt = _kindW[n.kind] ?? 1;
      if (wgt <= 0 || already(n.lvl, 'buy')) continue;
      const t1 = nextNode(n.lvl, +1), t2 = t1 ? nextNode(t1.lvl, +1) : null;
      add({ mode: 'react', side: 'buy', level: n.lvl, entry: n.lvl, sl: n.lvl - buf,
        tp1: t1?.lvl ?? null, tp2: t2?.lvl ?? null, sizeFactor: +(1 * trim * wgt).toFixed(2),
        blocker: nearestBlocker(n.lvl, n.lvl),
        rationale: `${regime} · ${n.kind} ${+n.lvl.toFixed(6)} → react-fade (support)${t1 ? ` → ${t1.kind} ${+t1.lvl.toFixed(6)}` : ''}${trimNote}${wNote(wgt)}` });
    }
  }

  // ── Zone spacing: two same-side zones within minZoneSpacing × refMove are ONE
  // level, not two — keep the higher-conviction (sizeFactor) one, record the drop.
  // Plan-side dedupe; the executor's stack guard stays as the runtime backstop.
  // maxpain is exempt (its entry is spot — a different semantic, and the engine
  // re-validates it at fire time anyway).
  let out = zones;
  if (minZoneSpacing > 0 && _ref) {
    const minDist = minZoneSpacing * _ref;
    const ranked = zones.filter(z => z.mode !== 'maxpain').slice().sort((a, b) => b.sizeFactor - a.sizeFactor);
    const kept = [];
    for (const z of ranked) {
      const dup = kept.find(k => k.side === z.side && Math.abs(k.entry - z.entry) < minDist);
      if (dup) { _drop(z, `within ${minZoneSpacing}×refMove of ${dup.mode} ${dup.level} (same side — one level, not two)`); continue; }
      kept.push(z);
    }
    out = [...kept, ...zones.filter(z => z.mode === 'maxpain')];
  }

  return out.sort((a, b) => Math.abs(a.entry - price) - Math.abs(b.entry - price));
}
