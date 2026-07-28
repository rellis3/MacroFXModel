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
 * Size scales with wall strength × concentration.
 *
 * FX is the weak asset (CME OI partial); gold + indices are where the mechanism is
 * real. The caller decides the universe — this just plans whatever it's given.
 * Pure: no network/clock/DOM; offline-testable.
 */

import { oiPriceConfirmation } from './oiConfluence.js';

const _TIER_RANK = { weak: 1, moderate: 2, strong: 3 };
const _rank = t => _TIER_RANK[t] || 0;

// Nearest expiry DTE from the per-expiry view (null if none tagged).
function _nearDTE(inst) {
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
          fadeInPin = true, followBreaks = true } = cfg;
  const gex = inst.exposures?.gex ?? inst.gex ?? 0;
  const regime = gex > 0 ? 'PIN' : gex < 0 ? 'BREAKOUT' : 'NEUTRAL';
  const tierOK = w => _rank(w?.tier) >= _rank(minTier);
  const calls = Array.isArray(inst.callWalls) ? inst.callWalls : [];
  const puts = Array.isArray(inst.putWalls) ? inst.putWalls : [];
  const strongCalls = calls.filter(tierOK), strongPuts = puts.filter(tierOK);
  if (regime === 'NEUTRAL') return 'flat GEX (gex≈0) — no PIN/BREAKOUT regime, no fade/break zones';
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

export function buildOIZones(inst, price, cfg = {}) {
  if (!inst || typeof inst !== 'object' || !(price > 0)) return [];
  const {
    pip = 0.0001,
    minTier = 'strong',            // only walls this strong or better
    slBufferPips = 15,             // structural stop beyond the wall
    breakPips = 20,                // decisive-break distance (hold-vs-break)
    nearExpiryDTE = 2,             // max-pain reversion window
    extendedPips = 30,             // "price extended from max pain" threshold
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
  } = cfg;

  const gex = inst.exposures?.gex ?? inst.gex ?? 0;
  const regime = gex > 0 ? 'PIN' : gex < 0 ? 'BREAKOUT' : 'NEUTRAL';
  const maxPain = Number.isFinite(inst.maxPain) ? inst.maxPain : null;
  const conc = inst.concentration?.read || null;
  const buf = slBufferPips * pip;
  const brk = breakPips * pip;
  const tol = Math.max(buf, pip);
  const tierOK = w => _rank(w?.tier) >= _rank(minTier);

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
    if (regimeWarning) rationale = `${rationale} · ⚠ ${regimeWarning}`;
    if (vannaNote) rationale = `${rationale} · ${vannaNote}`;
    // A take-profit sitting beyond the option-implied expected-move band is a
    // low-probability target by expiry — flag it (don't block the trade).
    if (expMove && tp1 != null && (tp1 > expMove.upper || tp1 < expMove.lower))
      rationale = `${rationale} · ⚠ TP beyond implied move (low-prob by expiry)`;
    // A wall between spot and this entry is the first level price hits — flag it and
    // trim entry size (price may reject/stall there before reaching the traded wall).
    let sizeFactor = z.sizeFactor;
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
    zones.push({ ...z, sizeFactor, entry: +z.entry.toFixed(6), sl: +z.sl.toFixed(6),
      tp1: tp1 != null ? +tp1.toFixed(6) : null, tp2: tp2 != null ? +tp2.toFixed(6) : null, rationale, regime });
  };

  // ── Mode A — PIN: fade strong walls toward max pain ─────────────────────────
  // The active pin boundary is the NEAREST strong wall bracketing price, not the
  // strongest-by-OI (which can sit far out of range and never trade). Order resistance
  // above / support below by DISTANCE to price: the nearest is the primary fade (full
  // size); each further wall is "secondary" and sized ×secondaryTrim. Durability still
  // boosts size through sizeFactor(); the reachability gate in add() trims any that sit
  // beyond the implied move. Selecting by distance uses the FULL tierOK set (not the
  // strength-capped calls/puts) so a near strong wall can't be cut by a far stronger one.
  if (fadeInPin && regime === 'PIN') {
    const resist = (Array.isArray(inst.callWalls) ? inst.callWalls : [])
      .filter(w => tierOK(w) && w.strike > price).sort((a, b) => a.strike - b.strike);
    const support = (Array.isArray(inst.putWalls) ? inst.putWalls : [])
      .filter(w => tierOK(w) && w.strike < price).sort((a, b) => b.strike - a.strike);
    const resistPin = maxZonesPerSide > 0 ? resist.slice(0, maxZonesPerSide) : resist;
    const supportPin = maxZonesPerSide > 0 ? support.slice(0, maxZonesPerSide) : support;
    resistPin.forEach((w, i) => {
      if (isLiquidating(w.strike, 'call') || !isEstablished(w.strike, 'call')) return;
      const tp1 = (maxPain != null && maxPain < w.strike) ? maxPain : null;
      const oppo = support.filter(p => p.strike < w.strike).sort((a, b) => b.strike - a.strike)[0]?.strike ?? null;
      const sec = i > 0;
      add({ mode: 'fade', side: 'sell', level: w.strike, entry: w.strike, sl: w.strike + buf,
        tp1, tp2: oppo, sizeFactor: +(sizeFactor(w) * (sec ? secondaryTrim : 1)).toFixed(2),
        blocker: nearestBlocker(w.strike, w.strike),
        rationale: `${regime} · call wall ${w.strike} ${w.tier}${w.mult ? ` ${w.mult}×` : ''} → fade (resistance)${tp1 != null ? ` toward max pain ${maxPain}` : ''}${conc ? ` · ${conc}` : ''}${persNote(w)} · ${sec ? 'secondary (further wall)' : 'primary (nearest strong wall)'}` });
    });
    supportPin.forEach((w, i) => {
      if (isLiquidating(w.strike, 'put') || !isEstablished(w.strike, 'put')) return;
      const tp1 = (maxPain != null && maxPain > w.strike) ? maxPain : null;
      const oppo = resist.filter(c => c.strike > w.strike).sort((a, b) => a.strike - b.strike)[0]?.strike ?? null;
      const sec = i > 0;
      add({ mode: 'fade', side: 'buy', level: w.strike, entry: w.strike, sl: w.strike - buf,
        tp1, tp2: oppo, sizeFactor: +(sizeFactor(w) * (sec ? secondaryTrim : 1)).toFixed(2),
        blocker: nearestBlocker(w.strike, w.strike),
        rationale: `${regime} · put wall ${w.strike} ${w.tier}${w.mult ? ` ${w.mult}×` : ''} → fade (support)${tp1 != null ? ` toward max pain ${maxPain}` : ''}${conc ? ` · ${conc}` : ''}${persNote(w)} · ${sec ? 'secondary (further wall)' : 'primary (nearest strong wall)'}` });
    });
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
      add({ mode: 'break', side: 'buy', level: w.strike, entry: w.strike + brk, sl: w.strike - buf,
        tp1: calls.filter(c => c.strike > w.strike).sort((a, b) => a.strike - b.strike)[0]?.strike ?? null, tp2: null,
        sizeFactor: +(sizeFactor(w) * bn.trim).toFixed(2), blocker: nearestBlocker(w.strike + brk, w.strike),
        rationale: `${regime} · call wall ${w.strike} ${w.tier} → follow the break UP (short-gamma squeeze) past ${+(w.strike + brk).toFixed(6)}${persNote(w)}${bn.note}` });
    }
    for (const w of puts) {
      const bn = breakNote(w.strike, 'put', -1);
      add({ mode: 'break', side: 'sell', level: w.strike, entry: w.strike - brk, sl: w.strike + buf,
        tp1: puts.filter(p => p.strike < w.strike).sort((a, b) => b.strike - a.strike)[0]?.strike ?? null, tp2: null,
        sizeFactor: +(sizeFactor(w) * bn.trim).toFixed(2), blocker: nearestBlocker(w.strike - brk, w.strike),
        rationale: `${regime} · put wall ${w.strike} ${w.tier} → follow the break DOWN (short-gamma squeeze) past ${+(w.strike - brk).toFixed(6)}${persNote(w)}${bn.note}` });
    }
  }

  // ── Mode C — max-pain reversion near expiry ─────────────────────────────────
  const dte = _nearDTE(inst);
  if (maxPainReversion && dte != null && dte <= nearExpiryDTE && maxPain != null && Math.abs(price - maxPain) >= extendedPips * pip) {
    const side = price > maxPain ? 'sell' : 'buy';
    const guardWall = side === 'sell'
      ? calls.filter(c => c.strike > price).sort((a, b) => a.strike - b.strike)[0]?.strike
      : puts.filter(p => p.strike < price).sort((a, b) => b.strike - a.strike)[0]?.strike;
    add({ mode: 'maxpain', side, level: maxPain, entry: price,
      sl: guardWall != null ? (side === 'sell' ? guardWall + buf : guardWall - buf) : (side === 'sell' ? price + buf * 4 : price - buf * 4),
      tp1: maxPain, tp2: null, sizeFactor: 1.0,
      rationale: `max-pain reversion · ${dte}DTE · price extended from pin ${maxPain} → fade toward it` });
  }

  return zones.sort((a, b) => Math.abs(a.entry - price) - Math.abs(b.entry - price));
}
