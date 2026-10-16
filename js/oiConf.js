/**
 * OI-CONF — the planner for the OI-Conf bot: arm a level only where an OPTIONS level and a VOLATILITY line land on (almost) the same price.
 *
 *   OI levels  : call/put walls, max pain, gamma flip, GEX flip, charm/vanna flips, volume magnets, implied-move edges (all from the OI store, spot terms)
 *   vol lines  : the 12 forecast lines per instrument — 6 STATIC morning lines (open ± ladder p50/p75/p90) and 6 DYNAMIC lines (the hourly re-forecast's
 *                projected high/low p50/p75/p90, which move with the day's running high/low — js/intradayRange.js, the Live Range page's lines)
 *
 * A coincidence = |OI level − vol line| ≤ tol, with tol = tolSigma × (one day's σ in price) — a fraction of the day's σ, so the same setting means the
 * same thing on gold, NQ and EUR/USD (a fixed "2 pips" is 0.04σ on gold and 0.03σ on EURUSD but 0.005σ on NQ). A fixed tolerance in pips is available.
 * The dynamic line moves, so coincidences are RE-EVALUATED every refresh: a zone exists only while the two lines are together. The zone is anchored at the
 * OI level (static for the day → a stable zone_id) — the moving line only decides whether it is armed.
 *
 * RESEARCH STATUS (oi_research_book/GEX_LADDER_CONFLUENCE_RESULTS.md, 2026-10-15): NQ, 308 resolved lines — confluent lines bounced LESS (43% vs 47%, CI −9.9…+2.2 pp),
 * unjudgeable under its own gate; OI walls and ladder lines are each placebo-null. This bot is a FORWARD EXPERIMENT on demo, not a validated edge.
 *
 * Pure, offline-testable; the server supplies the inputs.
 */

export const OI_CONF_TYPES = ['call_wall', 'put_wall', 'max_pain', 'gamma_flip', 'gex_flip', 'charm_flip', 'vanna_flip', 'oi_volume', 'exp_move_hi', 'exp_move_lo'];

export const OI_CONF_DEFAULTS = {
  tolSigma: 0.10,            // coincidence radius, in fractions of ONE DAY's σ (price). 0.10 ≈ 5 on gold, ~35 on NQ, ~7 pips on EURUSD
  tolPips: 0,                // >0 = use this fixed tolerance in the instrument's pips instead
  style: 'fade',             // 'fade' = bounce off the zone (buy support / sell resistance) · 'break' = trade through it
  slSigma: 0.25,             // stop distance from the entry, in σ
  tpR: 1.0,                  // take-profit at this multiple of the risk (1.0 = the 0.25σ-bounce-vs-0.25σ-break race the research test used)
  maxArmSigma: 1.5,          // only arm zones within this many σ of spot
  minSpotGapSigma: 0.03,     // a zone this close to spot has no defined side yet — wait
  minTier: 'moderate',       // OI wall strength floor ('weak' | 'moderate' | 'strong')
  oiTypes: OI_CONF_TYPES,
  rungs: ['p50', 'p75', 'p90'],
  useStatic: true,           // the 6 morning lines
  useDynamic: true,          // the 6 hourly re-forecast lines
  minSources: 1,             // min number of DISTINCT vol lines on the zone (1 = any coincidence)
  minTouchP: 0,              // optional calibrated touch gate (0 = off — the experiment wants the unfiltered record)
  touchHorizon: '4h',
  pairs: ['nq', 'gold', 'dow', 'rut', 'eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdcad', 'usdchf'],
};

const PRIORITY = { call_wall: 6, put_wall: 6, gex_flip: 5, gamma_flip: 4, max_pain: 4, oi_volume: 3, charm_flip: 2, vanna_flip: 2, exp_move_hi: 1, exp_move_lo: 1 };

/** The 12 vol lines. static: ladder + open. dynamic: the latest hourly re-forecast (projHigh/projLow). */
export function volLines({ staticLevels = null, dynamic = null, rungs = ['p50', 'p75', 'p90'], useStatic = true, useDynamic = true } = {}) {
  const out = [];
  if (useStatic && staticLevels) {
    for (const r of rungs) {
      if (Number.isFinite(staticLevels[`up_${r}`])) out.push({ name: `AM ↑${r}`, kind: 'static', rung: r, side: 'hi', price: staticLevels[`up_${r}`] });
      if (Number.isFinite(staticLevels[`dn_${r}`])) out.push({ name: `AM ↓${r}`, kind: 'static', rung: r, side: 'lo', price: staticLevels[`dn_${r}`] });
    }
  }
  if (useDynamic && dynamic) {
    for (const r of rungs) {
      if (Number.isFinite(dynamic.projHigh?.[r])) out.push({ name: `live ↑${r}`, kind: 'dynamic', rung: r, side: 'hi', price: dynamic.projHigh[r] });
      if (Number.isFinite(dynamic.projLow?.[r])) out.push({ name: `live ↓${r}`, kind: 'dynamic', rung: r, side: 'lo', price: dynamic.projLow[r] });
    }
  }
  return out;
}

/** OI levels as a flat list: oiStoreToLevels output (filtered to the wanted types) + the greeks-flow flips and implied-move edges the export also draws. */
export function oiLevelList(levels, inst, types = OI_CONF_TYPES) {
  const want = new Set(types), out = [];
  for (const l of levels || []) if (want.has(l.type) && Number.isFinite(l.price) && l.price > 0) out.push({ type: l.type, price: l.price, tier: l.tier ?? null, dte: l.dte ?? null });
  const gk = inst?.greeksFlow;
  if (gk) {
    if (want.has('charm_flip') && Number.isFinite(+gk.charmFlip) && gk.charmFlip != null) out.push({ type: 'charm_flip', price: +gk.charmFlip, tier: null, dte: gk.dteDays ?? null });
    if (want.has('vanna_flip') && Number.isFinite(+gk.vannaFlip) && gk.vannaFlip != null) out.push({ type: 'vanna_flip', price: +gk.vannaFlip, tier: null, dte: gk.dteDays ?? null });
  }
  const em = inst?.expectedMove;
  if (em && Number.isFinite(em.upper) && want.has('exp_move_hi')) out.push({ type: 'exp_move_hi', price: em.upper, tier: null, dte: em.dte ?? null });
  if (em && Number.isFinite(em.lower) && want.has('exp_move_lo')) out.push({ type: 'exp_move_lo', price: em.lower, tier: null, dte: em.dte ?? null });
  return out;
}

/** Every (OI level, vol line) pair within tol, plus near-misses within 2× tol (for the audit: what is about to line up / has just drifted apart). */
export function findCoincidences(oi, vol, tol) {
  const hits = [], near = [];
  for (const o of oi) for (const v of vol) {
    const d = Math.abs(o.price - v.price);
    if (d <= tol) hits.push({ oi: o, vol: v, delta: d });
    else if (d <= 2 * tol) near.push({ oi: o, vol: v, delta: d });
  }
  return { hits, near };
}

const r6 = v => +(+v).toPrecision(9);

/** The coincidence radius in price units for one instrument. */
export function confTolerance(cfg, sigmaPrice, pipSize = null) {
  const c = { ...OI_CONF_DEFAULTS, ...cfg };
  return c.tolPips > 0 && pipSize > 0 ? c.tolPips * pipSize : c.tolSigma * sigmaPrice;
}

/**
 * Zones from coincidences. One zone per OI level (merged when two OI levels sit within tol of each other, keeping the higher-priority one as the anchor);
 * `sources` = the DISTINCT vol lines on it. Side by position vs spot (fade: below → buy, above → sell; break: reversed).
 * Returns { zones, tooFar, tooClose, tol, sigma }.
 */
export function buildConfZones({ spot, sigmaPrice, hits, cfg = {}, pipSize = null }) {
  const c = { ...OI_CONF_DEFAULTS, ...cfg };
  if (!(spot > 0) || !(sigmaPrice > 0)) return { zones: [], tooFar: [], tooClose: [], tol: 0, sigma: sigmaPrice };
  const tol = confTolerance(c, sigmaPrice, pipSize);
  // group hits by OI level price (merge OI levels within tol, anchor on the highest-priority member)
  const groups = [];
  for (const h of [...hits].sort((a, b) => (PRIORITY[b.oi.type] || 0) - (PRIORITY[a.oi.type] || 0))) {
    const g = groups.find(g => Math.abs(g.level - h.oi.price) <= tol);
    if (g) { g.hits.push(h); } else groups.push({ level: h.oi.price, hits: [h] });
  }
  const zones = [], tooFar = [], tooClose = [];
  for (const g of groups) {
    const oiMembers = []; const volMembers = [];
    for (const h of g.hits) {
      if (!oiMembers.some(o => o.type === h.oi.type && Math.abs(o.price - h.oi.price) < 1e-9)) oiMembers.push(h.oi);
      if (!volMembers.some(v => v.name === h.vol.name)) volMembers.push({ ...h.vol, delta: h.delta });
    }
    if (volMembers.length < c.minSources) continue;
    const level = g.level, dist = Math.abs(level - spot) / sigmaPrice;
    const info = { level, dist: +dist.toFixed(2), oi: oiMembers, vol: volMembers };
    if (dist > c.maxArmSigma) { tooFar.push(info); continue; }
    if (dist < c.minSpotGapSigma) { tooClose.push(info); continue; }
    const below = level < spot;
    const fade = c.style !== 'break';
    const side = fade ? (below ? 'buy' : 'sell') : (below ? 'sell' : 'buy');
    const risk = c.slSigma * sigmaPrice, dir = side === 'buy' ? 1 : -1;
    const sl = level - dir * risk, tp1 = level + dir * c.tpR * risk;
    const names = oiMembers.map(o => o.type.replace('_', ' ')).join(' + '), vnames = volMembers.map(v => `${v.name} (Δ${v.delta < 1 ? v.delta.toFixed(3) : v.delta.toFixed(2)})`).join(' + ');
    zones.push({
      mode: fade ? 'fade' : 'break', side, level: r6(level), entry: r6(level), sl: r6(sl), tp1: r6(tp1), tp2: null,
      sizeFactor: 1, regime: null, minRR: 0, hold: null, conviction: null,
      confluence: { oi: oiMembers, vol: volMembers, tol: r6(tol), distSigma: info.dist, sources: volMembers.length },
      rationale: `CONFLUENCE · ${names} ${r6(level)} with ${vnames} within ${r6(tol)} → ${fade ? 'fade' : 'break'} ${side} · SL ${c.slSigma}σ, TP ${c.tpR}R · ${volMembers.length} vol line${volMembers.length > 1 ? 's' : ''}`,
    });
  }
  zones.sort((a, b) => Math.abs(a.level - spot) - Math.abs(b.level - spot));
  return { zones, tooFar, tooClose, tol, sigma: sigmaPrice };
}
