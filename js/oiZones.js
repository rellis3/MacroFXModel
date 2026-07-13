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

const _TIER_RANK = { weak: 1, moderate: 2, strong: 3 };
const _rank = t => _TIER_RANK[t] || 0;

// Nearest expiry DTE from the per-expiry view (null if none tagged).
function _nearDTE(inst) {
  const es = inst?.expiries ? Object.values(inst.expiries) : [];
  const dtes = es.map(e => e?.dte).filter(d => Number.isFinite(d));
  return dtes.length ? Math.min(...dtes) : null;
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
    stability = null,              // oiWallStability(...) output (server-injected from oi_history)
    change = null,                 // classifyOIChange(...) output (server-injected)
  } = cfg;

  const gex = inst.exposures?.gex ?? inst.gex ?? 0;
  const regime = gex > 0 ? 'PIN' : gex < 0 ? 'BREAKOUT' : 'NEUTRAL';
  const maxPain = Number.isFinite(inst.maxPain) ? inst.maxPain : null;
  const conc = inst.concentration?.read || null;
  const buf = slBufferPips * pip;
  const brk = breakPips * pip;
  const tol = Math.max(buf, pip);
  const tierOK = w => _rank(w?.tier) >= _rank(minTier);

  const calls = (Array.isArray(inst.callWalls) ? inst.callWalls : []).filter(tierOK);
  const puts = (Array.isArray(inst.putWalls) ? inst.putWalls : []).filter(tierOK);

  const isLiquidating = (strike, kind) => avoidLiquidating &&
    (change?.events || []).some(e => e.type === 'liquidation' && e.kind === kind && Math.abs(e.strike - strike) <= tol);
  const isEstablished = (strike, kind) => !requireEstablished ||
    (stability || []).some(w => w.kind === kind && Math.abs(w.strike - strike) <= tol && w.established);
  const sizeFactor = w => {
    let s = _rank(w?.tier) >= 3 ? 1.5 : _rank(w?.tier) >= 2 ? 1.0 : 0.6;
    if (conc === 'concentrated') s *= 1.2; else if (conc === 'dispersed') s *= 0.8;
    return +s.toFixed(2);
  };

  const zones = [];
  const add = z => zones.push({ ...z, entry: +z.entry.toFixed(6), sl: +z.sl.toFixed(6),
    tp1: z.tp1 != null ? +z.tp1.toFixed(6) : null, tp2: z.tp2 != null ? +z.tp2.toFixed(6) : null, regime });

  // ── Mode A — PIN: fade strong walls toward max pain ─────────────────────────
  if (fadeInPin && regime === 'PIN') {
    for (const w of calls) {
      if (!(w.strike > price)) continue;                          // resistance sits above
      if (isLiquidating(w.strike, 'call') || !isEstablished(w.strike, 'call')) continue;
      const tp1 = (maxPain != null && maxPain < w.strike) ? maxPain : null;
      const oppo = puts.filter(p => p.strike < w.strike).sort((a, b) => b.strike - a.strike)[0]?.strike ?? null;
      add({ mode: 'fade', side: 'sell', level: w.strike, entry: w.strike, sl: w.strike + buf,
        tp1, tp2: oppo, sizeFactor: sizeFactor(w),
        rationale: `${regime} · call wall ${w.strike} ${w.tier}${w.mult ? ` ${w.mult}×` : ''} → fade (resistance)${tp1 != null ? ` toward max pain ${maxPain}` : ''}${conc ? ` · ${conc}` : ''}` });
    }
    for (const w of puts) {
      if (!(w.strike < price)) continue;                          // support sits below
      if (isLiquidating(w.strike, 'put') || !isEstablished(w.strike, 'put')) continue;
      const tp1 = (maxPain != null && maxPain > w.strike) ? maxPain : null;
      const oppo = calls.filter(c => c.strike > w.strike).sort((a, b) => a.strike - b.strike)[0]?.strike ?? null;
      add({ mode: 'fade', side: 'buy', level: w.strike, entry: w.strike, sl: w.strike - buf,
        tp1, tp2: oppo, sizeFactor: sizeFactor(w),
        rationale: `${regime} · put wall ${w.strike} ${w.tier}${w.mult ? ` ${w.mult}×` : ''} → fade (support)${tp1 != null ? ` toward max pain ${maxPain}` : ''}${conc ? ` · ${conc}` : ''}` });
    }
  }

  // ── Mode B — BREAKOUT: follow a decisive wall break (gamma squeeze) ──────────
  if (followBreaks && regime === 'BREAKOUT') {
    for (const w of calls) {
      add({ mode: 'break', side: 'buy', level: w.strike, entry: w.strike + brk, sl: w.strike - buf,
        tp1: calls.filter(c => c.strike > w.strike).sort((a, b) => a.strike - b.strike)[0]?.strike ?? null, tp2: null,
        sizeFactor: sizeFactor(w),
        rationale: `${regime} · call wall ${w.strike} ${w.tier} → follow the break UP (short-gamma squeeze) past ${+(w.strike + brk).toFixed(6)}` });
    }
    for (const w of puts) {
      add({ mode: 'break', side: 'sell', level: w.strike, entry: w.strike - brk, sl: w.strike + buf,
        tp1: puts.filter(p => p.strike < w.strike).sort((a, b) => b.strike - a.strike)[0]?.strike ?? null, tp2: null,
        sizeFactor: sizeFactor(w),
        rationale: `${regime} · put wall ${w.strike} ${w.tier} → follow the break DOWN (short-gamma squeeze) past ${+(w.strike - brk).toFixed(6)}` });
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
