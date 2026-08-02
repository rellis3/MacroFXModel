/**
 * OI (options-interest) forward-test tagging.
 *
 * There is NO historical options-OI for spot FX (OTC, fragmented), so gamma /
 * put-call walls / max-pain as range-entry confluence cannot be backtested the
 * way touch/naked were. This is instead a FORWARD test: the day's OI levels are
 * captured each morning (before entries → no lookahead), and every resolved
 * range-line trade is joined to THAT day's levels by price proximity. After
 * enough trades accumulate, tagged-vs-untagged expectancy says whether an OI
 * level lining up with a range level actually trades better.
 *
 * The independence cut is the lesson from the naked-levels null: big OI strikes
 * cluster on round numbers, which the confluence already counts (`round_number`).
 * So the audit also reports the "tagged AND not already at a round number" slice
 * — if OI only helps where a round number already is, it is redundant, not edge.
 *
 * Pure — no network/clock/DOM; offline-testable. The server injects the trade
 * log + the daily OI artifact; this only joins and tallies.
 */

// Canonical OI level types (free-form labels are allowed; these are the ones the
// breakdown names). gamma_flip is a regime boundary, not a magnet — tagged apart.
import { gammaFlip } from './gammaFlow.js';

export const OI_TYPES = ['put_wall', 'call_wall', 'max_pain', 'gamma_flip', 'hvl'];

// Normalise a free-typed label to a slug: "Call Wall"/"callwall"/"c-wall" → call_wall.
export function normOIType(raw) {
  const s = String(raw ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (!s) return 'oi';
  if (/(call).*wall|^cw$|^c_wall$/.test(s)) return 'call_wall';
  if (/(put).*wall|^pw$|^p_wall$/.test(s)) return 'put_wall';
  if (/max.*pain|^mp$/.test(s)) return 'max_pain';
  if (/gamma.*(flip|zero|wall)|zero.*gamma|^gf$|^gflip$/.test(s)) return 'gamma_flip';
  if (/^hvl$|high.*vol|high.*gamma/.test(s)) return 'hvl';
  return s;
}

// Parse pasted OI lines → [{price, type}]. Tolerates "1.0850 call_wall",
// "1.0820, max pain", "1.0850" (untyped → 'oi'), blank lines and '#' comments.
export function parseOILevels(text) {
  const out = [];
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    // first number token = price; the rest = type label
    const m = line.match(/^([+-]?\d[\d,]*\.?\d*)\s*[, \t]*\s*(.*)$/);
    if (!m) continue;
    const price = parseFloat(m[1].replace(/,/g, ''));
    if (!Number.isFinite(price)) continue;
    out.push({ price, type: normOIType(m[2]) });
  }
  return out;
}

// Round-number proximity — the independence flag. Big OI strikes sit on round
// numbers the confluence already counts, so a tag that only fires at a round
// number adds nothing. Grid = big-figure / half / quarter of the pip decade
// (approximates the `round_number` source; diagnostic, not a gated source).
export function nearRoundNumber(price, pip, tolPips = 10) {
  if (!(price > 0) || !(pip > 0)) return false;
  const tol = tolPips * pip;
  const step = pip * 100;                       // one "big figure" = 100 pips
  for (const frac of [1, 0.5, 0.25]) {
    const grid = step * frac;
    const nearest = Math.round(price / grid) * grid;
    if (Math.abs(price - nearest) <= tol) return true;
  }
  return false;
}

// The 3× rule (Lesson 4): a wall's strength is its OI as a MULTIPLE of the
// surrounding strikes, not its absolute size. 1.5× weak · 2× moderate · 3×+ strong.
// `neighbourOIs` = the OIs at the nearest strikes either side of the wall (the
// analyser supplies them). Returns { multiple, tier }.
export function wallStrengthTier(oi, neighbourOIs) {
  const ns = (Array.isArray(neighbourOIs) ? neighbourOIs : []).filter(n => Number.isFinite(n) && n >= 0);
  if (!(oi > 0) || !ns.length) return { multiple: null, tier: null };
  const avg = ns.reduce((a, b) => a + b, 0) / ns.length;
  if (!(avg > 0)) return { multiple: null, tier: 'strong' };    // isolated wall — nothing around it
  const mult = +(oi / avg).toFixed(2);
  const tier = mult >= 3 ? 'strong' : mult >= 2 ? 'moderate' : mult >= 1.5 ? 'weak' : null;
  return { multiple: mult, tier };
}

// OI skew (Lesson 4): WHERE the positioning sits, not just the P/C ratio. Put OI
// concentrated below spot = downside hedging; call OI above = upside positioning.
// score in [-1,1]: + upside-tilted, − downside-hedged. Returns null without a spot.
export function oiSkew(strikes, callOIs, putOIs, spot) {
  if (!Array.isArray(strikes) || !strikes.length || !(spot > 0)) return null;
  let putBelow = 0, callAbove = 0;
  for (let i = 0; i < strikes.length; i++) {
    if (strikes[i] < spot) putBelow += (putOIs?.[i] || 0);
    else if (strikes[i] > spot) callAbove += (callOIs?.[i] || 0);
  }
  const tot = putBelow + callAbove;
  if (!(tot > 0)) return null;
  const score = +((callAbove - putBelow) / tot).toFixed(3);
  return { score, callAbove: Math.round(callAbove), putBelow: Math.round(putBelow),
    read: score > 0.2 ? 'upside-tilted' : score < -0.2 ? 'downside-hedged' : 'balanced' };
}

// Tag one entry price by whether an OI level sits within tol of it.
//   → { hit, types:[…distinct…], nearest, distPips }
export function tagTradeOI(entryPrice, oiLevels, { pip, tolPips = 10 } = {}) {
  const none = { hit: false, types: [], nearest: null, distPips: null };
  if (!(entryPrice > 0) || !(pip > 0) || !Array.isArray(oiLevels) || !oiLevels.length) return none;
  const tol = tolPips * pip;
  const types = new Set();
  let nearest = null, nearestDist = Infinity;
  for (const lv of oiLevels) {
    if (!Number.isFinite(lv?.price)) continue;
    const d = Math.abs(lv.price - entryPrice);
    if (d <= tol) types.add(lv.type || 'oi');
    if (d < nearestDist) { nearestDist = d; nearest = lv.price; }
  }
  return types.size
    ? { hit: true, types: [...types], nearest, distPips: +(nearestDist / pip).toFixed(1) }
    : { ...none, nearest, distPips: Number.isFinite(nearestDist) ? +(nearestDist / pip).toFixed(1) : null };
}

// Size-independent per-trade return (%), signed by direction — the expectancy
// metric (lots vary by pair, so raw profit isn't comparable across pairs).
export function tradePctReturn(t) {
  if (t?.close_price == null || t?.open_price == null) return null;   // still open → unresolved
  const dir = String(t?.direction ?? '');
  const sign = /buy|long/i.test(dir) ? 1 : /sell|short/i.test(dir) ? -1 : 0;
  const o = Number(t.open_price), c = Number(t.close_price);
  if (!sign || !(o > 0) || !Number.isFinite(c)) return null;
  return (c - o) / o * 100 * sign;
}

// Extract price levels from ONE `oi_store` entry (index.html's OI analyser output)
// → [{price,type}] in this brick's shape, so the forward test reuses the OI the
// user already computes daily instead of a second manual entry. Pulls max pain,
// the headline + top-ranked call/put walls, the gamma-flip strike (first netGex
// sign change in the strike-sorted gexProfile) and the HVL (highest-|gamma|
// strike). Pure. inst = { maxPain, callWall, putWall, callWalls[], putWalls[],
// gexProfile[{strike,netGex,gamma}] }.
// Day-over-day OI dynamics (Lesson 4 §dynamic): compare today's `oi_store` entry
// against a prior day's archived one → what MOVED. Powers the brief's "wall firming
// / fading, positioning building / unwinding" narrative and the delta rows on the
// card. Pure — takes two inst snapshots ({maxPain, callWall, putWall, pcRatio,
// totalCallOI, totalPutOI, callWalls[], putWalls[]}). Returns null if either side
// is missing so callers degrade gracefully on the first day (no prior).
// Strike spacing inferred from ONE day's ladder (the SMALLEST gap between that day's
// wall strikes - walls are the top-N by OI, not contiguous, so gaps are multiples of the
// spacing and the minimum IS the spacing). Deliberately not derived from both days
// pooled: the two ladders are offset by the basis, so a pooled gap list alternates
// drift-sized and spacing-sized gaps and any median of it is meaningless.
function _spacingOf(snap) {
  const ks = [...(snap?.callWalls || []), ...(snap?.putWalls || [])]
    .map(w => w?.strike).filter(Number.isFinite).sort((a, b) => a - b);
  let min = Infinity;
  for (let i = 1; i < ks.length; i++) { const g = ks[i] - ks[i - 1]; if (g > 1e-9 && g < min) min = g; }
  return Number.isFinite(min) ? min : null;
}

// Tolerance for calling two strikes "the same strike on different days".
// This is the PASS-1 (drift-discovery) tolerance, so it is deliberately generous: it must
// exceed the overnight basis drift, and stay under HALF the spacing or a strike could pair
// with its neighbour. 0.45x spacing sits just inside that bound. Pass 2 re-matches at a
// tight tolerance once the drift has been removed, so the loose pass-1 value never decides
// the final pairing. (EUR/USD: 25-pip ladder -> 11.25 pips of pass-1 room against ~4.5 pips
// of observed drift; the old fixed 0.25x gave only 6.25 and a 1.4x margin.)
export function strikeMatchTol(cur, prev, explicit = null) {
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const a = _spacingOf(cur), b = _spacingOf(prev);
  const sp = (a != null && b != null) ? Math.min(a, b) : (a ?? b);
  if (sp != null) return sp * 0.45;
  const ref = cur?.spot ?? cur?.maxPain ?? prev?.spot;              // last resort: 10 bps
  return Number.isFinite(ref) ? Math.abs(ref) * 0.001 : 0;
}

// Greedy nearest-within-tolerance pairing; each prior wall is consumed at most once so
// two current strikes can never both claim the same prior one.
function _pairWalls(cw, pw, tol) {
  const used = new Set(), pairs = [];
  for (const w of cw) {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < pw.length; i++) {
      if (used.has(i)) continue;
      const dd = Math.abs((pw[i]?.strike ?? NaN) - w.strike);
      if (dd <= tol && dd < bestD) { bestD = dd; best = i; }
    }
    if (best >= 0) { used.add(best); pairs.push([w, pw[best]]); } else pairs.push([w, null]);
  }
  return { pairs, faded: pw.filter((_, i) => !used.has(i)) };
}

// Rigid-shift estimator. Each (current, prior) strike pair proposes an offset; score it by
// how many current strikes land within `tol` of SOME prior strike once shifted back by it,
// and keep the best. Requires >=2 corroborating strikes so one coincidental pair can never
// define the drift; returns 0 (assume no drift) when nothing corroborates. O(n^4) on the
// wall list, which is <=8 per side - trivial.
function _estimateDrift(cur, prev, tol) {
  const pick = o => [...(o?.callWalls || []), ...(o?.putWalls || [])]
    .map(w => w?.strike).filter(Number.isFinite);
  const cs = pick(cur), ps = pick(prev);
  if (!cs.length || !ps.length) return 0;

  // A rigid shift is only identifiable UP TO ONE STRIKE STEP. On a periodic ladder the
  // offsets `drift` and `drift +/- spacing` both align strikes, and the alias can score
  // HIGHER purely from which walls happen to be in each day's top-N. Observed on gold:
  // true drift +0.635 scored 8 matches, the -99.365 alias (one 100-point step away) scored
  // 10 and won - which then pairs each wall with a DIFFERENT strike and mis-attributes
  // every firming/fading. So candidates are bounded by:
  //   * 0.9x the strike spacing - past that the shift is aliased, not measured; and
  //   * 0.5% of price - an overnight futures-basis move is a carry adjustment, orders of
  //     magnitude smaller than that (gold 0.635 = 0.016%, NQ 81.25 = 0.29%, EUR/USD
  //     4.45 pips = 0.04%). The -99.365 gold alias was 2.5%, physically impossible.
  // The tighter of the two applies, since which one binds differs by instrument (FX has
  // fine spacing relative to price; gold and the indices the reverse).
  const sp = _spacingOf(cur) ?? _spacingOf(prev);
  const ref = Math.abs(cur?.spot ?? cur?.maxPain ?? prev?.spot ?? 0);
  const caps = [];
  if (sp != null) caps.push(sp * 0.9);
  if (ref > 0) caps.push(ref * 0.005);
  const cap = caps.length ? Math.min(...caps) : Infinity;

  const scored = [];
  for (const c of cs) for (const p of ps) {
    const off = c - p;
    if (Math.abs(off) > cap) continue;                 // aliased or physically implausible
    let n = 0;
    for (const c2 of cs) if (ps.some(p2 => Math.abs((c2 - off) - p2) <= tol)) n++;
    scored.push({ off, n });
  }
  if (!scored.length) return { drift: 0, n: 0, ambiguous: false };
  // Ties break toward the SMALLEST shift - prefer "barely moved" over an equally
  // well-supported larger shift.
  scored.sort((a, b) => (b.n - a.n) || (Math.abs(a.off) - Math.abs(b.off)));
  const top = scored[0];
  if (top.n < 2) return { drift: 0, n: top.n, ambiguous: false };

  // HONEST AMBIGUITY FLAG. Drift is recoverable only while it stays well under HALF the
  // strike spacing; past that, shifting by (drift - spacing) aligns the ladder just as well
  // and there is no way to tell the two apart from strikes alone. When a genuinely DIFFERENT
  // offset scores within one match of the winner, say so rather than pick one and present it
  // as fact - a mis-chosen offset pairs every wall with the wrong strike and would report
  // fabricated firming/fading. Consumers should treat per-wall dynamics as unreliable when
  // this is set. (Measured limit: a 25-pip ladder recovers a 13-pip drift but not 26 - at 26
  // it selects the 1-pip alias. Real drifts run 0.02-0.3% of price against 0.2-1.2% spacing,
  // so they sit inside the reliable band; this flag exists for when they do not.)
  const rival = scored.find(x => Math.abs(x.off - top.off) > tol && x.n >= top.n - 1);
  return { drift: top.off, n: top.n, ambiguous: !!rival };
}

// Day-over-day OI dynamics.
//
// WALL MATCHING IS BY TOLERANCE, NOT EQUALITY (fixed 2026-07-29). Archived strikes are
// stored as SPOT-converted prices (strike - basis), and the futures/spot basis moves
// overnight, so the identical CME strike lands on a different number each day (observed:
// EUR/USD 1.157605 -> 1.158050, a 4.45-pip shift applied to EVERY strike). The old
// `new Map(...).get(w.strike)` exact-float lookup therefore matched NOTHING: `strengthening`
// and `weakening` came back permanently empty, every current wall was reported `appeared`
// and every prior one `faded`, and `classifyOIChange` consequently told the daily brief
// "fresh positioning building" for 9 of 11 unrelated instruments on the same day. That is a
// confidently-wrong output, not a missing one. (`oiWallStability` was unaffected - it
// already took a tolerance, which is why wall stability read correctly throughout.)
//
// `basisDrift` = the median signed shift across MATCHED walls, i.e. the overnight basis
// move itself. The `*ShiftNet` fields subtract it, so a max pain that did not actually move
// reads as 0 instead of inheriting the basis. Raw `*Shift` values are unchanged for
// back-compat; prefer the Net ones for any "did this level really move" claim.
export function oiDeltas(cur, prev, tol = null) {
  if (!cur || !prev || typeof cur !== 'object' || typeof prev !== 'object') return null;
  const d = (a, b) => (Number.isFinite(a) && Number.isFinite(b)) ? +(a - b).toFixed(6) : null;
  const totCur = (cur.totalCallOI || 0) + (cur.totalPutOI || 0);
  const totPrev = (prev.totalCallOI || 0) + (prev.totalPutOI || 0);
  const totalOIChange = Math.round(totCur - totPrev);
  const T = strikeMatchTol(cur, prev, tol);
  const T2 = T * (0.15 / 0.45);          // tight, post-alignment residual tolerance

  // PASS 1 - discover the overnight basis drift by CONSENSUS, not by proximity. Every
  // (current, prior) strike pair proposes an offset; the winner is the offset that aligns
  // the MOST strikes at once. Proximity pairing cannot be used here because it silently
  // caps the detectable drift at half the strike spacing - the whole ladder shifts
  // rigidly, so once the drift approaches one strike-step, "nearest" starts pairing each
  // strike with its NEIGHBOUR and the estimate collapses. Consensus has no such bound: a
  // rigid shift of any size still produces one offset that matches every strike.
  // Ties break toward the SMALLEST offset (prefer "no drift" over an equally-good shift by
  // a whole strike-step, which is the one genuinely ambiguous case on a periodic ladder).
  const _est = _estimateDrift(cur, prev, T2);
  const drift0 = _est.drift;

  // PASS 2 - subtract the drift, then match TIGHTLY. After correction the same strike lands
  // on ~0 residual, so a small tolerance is now both safe and far more discriminating than
  // the loose pass-1 window. `_raw` preserves the ORIGINAL prior strike for reporting.
  const align = arr => (Array.isArray(arr) ? arr : [])
    .map(w => ({ ...w, strike: w.strike + drift0, _raw: w.strike }));

  const drifts = [];
  const wallDyn = (curW, prevW, kind) => {
    const cw = Array.isArray(curW) ? curW : [], pw = align(prevW);
    const { pairs, faded } = _pairWalls(cw, pw, T2);
    const strengthening = [], weakening = [], appeared = [];
    for (const [w, p] of pairs) {
      if (!p) { appeared.push({ strike: w.strike, oi: w.oi, kind }); continue; }
      drifts.push(w.strike - (p._raw ?? p.strike));      // true drift vs the UNshifted strike
      const dd = Math.round(w.oi - p.oi);
      const pct = p.oi > 0 ? +((w.oi - p.oi) / p.oi * 100).toFixed(0) : null;
      const row = { strike: w.strike, delta: dd, pct, oi: w.oi, kind, prevStrike: p._raw ?? p.strike };
      if (dd > 0) strengthening.push(row); else if (dd < 0) weakening.push(row);
    }
    return { strengthening, weakening, appeared,
      faded: faded.map(w => ({ strike: w._raw ?? w.strike, oi: w.oi, kind })) };
  };
  const callWalls = wallDyn(cur.callWalls, prev.callWalls, 'call');
  const putWalls  = wallDyn(cur.putWalls,  prev.putWalls,  'put');

  drifts.sort((a, b) => a - b);
  const basisDrift = drifts.length ? +drifts[drifts.length >> 1].toFixed(6) : null;
  const net = v => (v == null || basisDrift == null) ? v : +(v - basisDrift).toFixed(6);

  return {
    maxPainShift: d(cur.maxPain, prev.maxPain),
    callWallShift: d(cur.callWall, prev.callWall),
    putWallShift: d(cur.putWall, prev.putWall),
    maxPainShiftNet: net(d(cur.maxPain, prev.maxPain)),
    callWallShiftNet: net(d(cur.callWall, prev.callWall)),
    putWallShiftNet: net(d(cur.putWall, prev.putWall)),
    basisDrift, strikeTol: +T2.toFixed(6), strikeTolPass1: +T.toFixed(6), matchedWalls: drifts.length,
    // true => the shift could not be pinned down; per-wall firming/fading is unreliable.
    driftAmbiguous: _est.ambiguous, driftSupport: _est.n,
    pcRatioChange: d(cur.pcRatio, prev.pcRatio),
    totalCallOIChange: Math.round((cur.totalCallOI || 0) - (prev.totalCallOI || 0)),
    totalPutOIChange: Math.round((cur.totalPutOI || 0) - (prev.totalPutOI || 0)),
    totalOIChange,
    totalOIChangePct: totPrev > 0 ? +((totCur - totPrev) / totPrev * 100).toFixed(1) : null,
    // L1: rising total OI = new money entering; falling = positions liquidating.
    flow: totalOIChange > 0 ? 'building' : totalOIChange < 0 ? 'unwinding' : 'flat',
    callWalls, putWalls,
  };
}

// Daily-change CLASSIFICATION (ChatGPT layer 2 / course L4 §dynamic): turn the raw
// deltas into human labels the brief + bots can act on — fresh_wall (appeared),
// fresh_positioning (big % build on an existing wall), liquidation (a wall fading /
// dropping), stable (little change). Roll (near-expiry fall + next-expiry rise)
// needs per-expiry change data → deferred; flagged when we can't tell. `freshPct` =
// the OI-change % that counts as a decisive build/liquidation.
export function classifyOIChange(deltas, { freshPct = 40 } = {}) {
  if (!deltas) return null;
  const out = { events: [] };
  const add = (kind, e, label) => out.events.push({ type: label, kind, strike: e.strike, oi: e.oi ?? null, pct: e.pct ?? null, delta: e.delta ?? null });
  for (const w of deltas.callWalls?.appeared || []) add('call', w, 'fresh_wall');
  for (const w of deltas.putWalls?.appeared || []) add('put', w, 'fresh_wall');
  for (const w of [...(deltas.callWalls?.strengthening || []), ...(deltas.putWalls?.strengthening || [])])
    if ((w.pct ?? 0) >= freshPct) add(w.kind, w, 'fresh_positioning');
  for (const w of [...(deltas.callWalls?.weakening || []), ...(deltas.putWalls?.weakening || [])])
    if ((w.pct ?? 0) <= -freshPct) add(w.kind, w, 'liquidation');
  for (const w of [...(deltas.callWalls?.faded || []), ...(deltas.putWalls?.faded || [])]) add(w.kind, w, 'liquidation');
  // Headline read: dominant activity + the whole-book flow.
  const n = t => out.events.filter(e => e.type === t).length;
  out.summary = n('fresh_wall') || n('fresh_positioning')
    ? (deltas.flow === 'building' ? 'fresh positioning building' : 'repositioning')
    : n('liquidation') ? 'positions liquidating (levels weakening)'
    : (deltas.flow === 'flat' ? 'stable' : deltas.flow === 'building' ? 'building' : 'unwinding');
  return out;
}

// Concentration (ChatGPT layer 5): top-N strikes as a % of total OI. Concentrated
// positioning → sharper reactions at those strikes; dispersed → weaker influence.
// `strikeOIs` = per-strike total OI (call+put). Pure.
// Today's option VOLUME vs resting OI — the "fresh positioning" read. A wall with
// high volume relative to its resting OI is being defended/built TODAY (new money),
// not stale positioning. ratio ≥ 1 = today's volume matched/exceeded the whole
// resting OI (very fresh); < 0.4 = quiet/stale. Pure.
export function wallFreshness(oi, volume) {
  if (!(oi > 0)) return null;
  const r = (+volume || 0) / oi;
  return { ratio: +r.toFixed(2), tag: r >= 1 ? 'fresh' : r >= 0.4 ? 'active' : 'stale' };
}

// Volume put/call ratio = today's directional FLOW (vs the OI P/C = resting
// positioning). A divergence — resting balanced but today heavily one side — is the
// tell. Returns null if no call volume. Pure.
export function volumePCRatio(callVol, putVol) {
  const c = +callVol || 0, p = +putVol || 0;
  return c > 0 ? +(p / c).toFixed(3) : null;
}

// OI-change × price-direction: is a move BACKED by fresh positioning, or hollow?
// The classic table — +OI with the move = new money (confirmed); −OI = the move is
// on positions CLOSING (short-covering up / long-liquidation down = weak/unsustainable).
// Signs: oiChg > 0 = OI building, < 0 = unwinding; priceDir > 0 = up, < 0 = down.
export function oiPriceConfirmation(oiChg, priceDir) {
  const oi = Math.sign(oiChg || 0), px = Math.sign(priceDir || 0);
  if (oi === 0 || px === 0) return null;
  if (oi > 0 && px > 0) return { read: 'new longs', trust: 'confirmed', note: 'up on building OI — new longs, move is backed' };
  if (oi > 0 && px < 0) return { read: 'new shorts', trust: 'confirmed', note: 'down on building OI — new shorts, move is backed' };
  if (oi < 0 && px > 0) return { read: 'short covering', trust: 'weak', note: 'up on FALLING OI — short covering, rally may be weak/unsustainable' };
  return { read: 'long liquidation', trust: 'weak', note: 'down on FALLING OI — long liquidation, capitulation/possible bottom' };
}

export function oiConcentration(strikeOIs, totalOI = null) {
  const arr = (Array.isArray(strikeOIs) ? strikeOIs : []).filter(n => Number.isFinite(n) && n >= 0).sort((a, b) => b - a);
  const tot = totalOI > 0 ? totalOI : arr.reduce((a, b) => a + b, 0);
  if (!(tot > 0) || !arr.length) return null;
  const sum = k => arr.slice(0, k).reduce((a, b) => a + b, 0);
  const top5 = +(sum(5) / tot * 100).toFixed(1), top10 = +(sum(10) / tot * 100).toFixed(1);
  return { top5Pct: top5, top10Pct: top10, read: top5 >= 50 ? 'concentrated' : top5 >= 30 ? 'moderate' : 'dispersed' };
}

// Strike CLUSTERING (ChatGPT layer 7 / course "walls are zones not lines"): merge
// nearby high-OI strikes within `tolPrice` into one institutional zone (OI-weighted
// centre + total). Feeds the brief, the confluence scorers and the OI bot — a
// clustered zone is higher-conviction than a lone strike. `walls` = [{strike|price,
// oi, kind?}]. Pure.
export function clusterStrikes(walls, tolPrice) {
  const items = (Array.isArray(walls) ? walls : [])
    .map(w => ({ strike: w?.strike ?? w?.price, oi: w?.oi ?? 0, kind: w?.kind ?? w?.type ?? null }))
    .filter(w => Number.isFinite(w.strike) && w.oi >= 0)
    .sort((a, b) => a.strike - b.strike);
  if (!items.length || !(tolPrice > 0)) return [];
  const clusters = [];
  let cur = null;
  for (const it of items) {
    if (cur && it.strike - cur.hi <= tolPrice) { cur.members.push(it); cur.hi = it.strike; cur.totalOI += it.oi; }
    else { if (cur) clusters.push(cur); cur = { lo: it.strike, hi: it.strike, totalOI: it.oi, members: [it] }; }
  }
  if (cur) clusters.push(cur);
  return clusters.map(c => ({
    low: +c.lo.toFixed(6), high: +c.hi.toFixed(6),
    center: +(c.members.reduce((s, m) => s + m.strike * m.oi, 0) / Math.max(c.totalOI, 1)).toFixed(6),
    totalOI: Math.round(c.totalOI), count: c.members.length,
    kinds: [...new Set(c.members.map(m => m.kind).filter(Boolean))],
  })).sort((a, b) => b.totalOI - a.totalOI);
}

// Wall STABILITY (ChatGPT layer 4): how many consecutive days each of the CURRENT
// walls has persisted (within `tolPrice`) across the archived `oi_history` series —
// an established wall (many days) is more reliable than one that appeared overnight.
// `historyDays` = [{date, callWalls:[{strike,oi}], putWalls:[...]}] oldest→newest. Pure.
export function oiWallStability(historyDays, tolPrice) {
  const days = Array.isArray(historyDays) ? historyDays : [];
  if (!days.length || !(tolPrice > 0)) return [];
  const cur = days[days.length - 1];
  const curWalls = [
    ...(cur.callWalls || []).map(w => ({ ...w, kind: 'call' })),
    ...(cur.putWalls || []).map(w => ({ ...w, kind: 'put' })),
  ];
  const present = (day, strike, kind) =>
    ((kind === 'call' ? day.callWalls : day.putWalls) || []).some(w => Math.abs(w.strike - strike) <= tolPrice);
  return curWalls.map(w => {
    let d = 0;
    for (let i = days.length - 1; i >= 0; i--) { if (present(days[i], w.strike, w.kind)) d++; else break; }
    return { strike: w.strike, kind: w.kind, oi: w.oi, daysPresent: d, fresh: d <= 1, established: d >= 5 };
  });
}

// The 3× rule's tiers, ranked (course Lesson 4: 1.5× weak · 2× moderate · 3×+ strong).
const _TIER_RANK = { weak: 1, moderate: 2, strong: 3 };

// Which walls leave the modal. COMPUTE ONCE, LET CONSUMERS FILTER — the modal decides
// what qualifies as a wall; the export draws them and the bot picks which to trade.
//
// This replaced a hard `topWalls = 2` cap that silently dropped everything past the
// two biggest per side. On real EUR/USD data that hid 1.1300 — the single largest put
// strike in the whole book (17,443 contracts, plainly visible on the OI chart) — from
// both the indicator and `/api/oi-levels`, because it ranked 3rd within the selected
// expiry. A count cap can't express "strong enough to matter"; the tier can.
//
// Fallback matters: if NOTHING reaches minTier (a thin/illiquid chain) we still emit
// the top 2, so raising the bar can never blank out an instrument's levels entirely.
// TWO tests, both required — tier alone is not enough.
//
// The 3× rule is RELATIVE (OI vs neighbouring strikes), and in the far tails the
// neighbours are ~empty, so a few hundred lots scores "strong". Filtering on tier
// alone pulled 1.2450/1.2600/1.3000 into EUR/USD's export as call walls off ~1,800
// contracts, next to a real 6,867-lot wall at 1.1600 — the deep-OTM tail-hedge
// distortion of Lesson 6 pitfall 4, which `pickPrimaryExpiry` already guards against
// when choosing an expiry. So also require meaningful ABSOLUTE size: at least
// `minShare` of the biggest wall on that side. Share, not a contract count, so it
// travels across instruments without per-symbol tuning.
// RELEVANCE WEIGHT — a soft near-money window, scaled by the reference move.
//
// A wall matters if price could plausibly reach it. Gold's largest call OI sat at
// 5,370 with 8,008 contracts — 31% above spot on a contract expiring the next day,
// abandoned paper nobody pays commission to close. It outranked the real 4,300 wall
// purely on size.
//
// Deliberately near-FLAT inside the region and steep at the edge (^12), for two
// reasons. Inside, ranking should stay by OI — that is the desk convention and what
// the 3× rule measures; a gentler decay would promote whatever is nearest spot over
// the genuinely bigger wall just beyond it. At the edge, a HARD cutoff is knife-edge:
// on gold a ±7.5% window put the boundary at 4,397 and ±7.6% at 4,400, flipping the
// answer from 4,300 to 4,400 — a 100-point swing off a 3-point boundary move. Soft
// shoulders remove the cliff without changing the ranking philosophy.
//
// R = k × refMove. With no refMove available the weight is 1 everywhere and selection
// degrades to the old size-only behaviour rather than silently dropping every wall.
function _relevance(strike, spot, refMove, k) {
  if (!(spot > 0) || !(refMove > 0) || !Number.isFinite(strike)) return 1;
  const R = k * refMove;
  if (!(R > 0)) return 1;
  return 1 / (1 + Math.pow(Math.abs(strike - spot) / R, 12));
}

function _selectWalls(list, { topWalls, minTier, maxWalls, minShare, spot, refMove, nearK }) {
  const arr = Array.isArray(list) ? list : [];
  if (Number.isFinite(topWalls)) return arr.slice(0, topWalls);   // explicit count wins (back-compat)
  const minRank = _TIER_RANK[minTier] ?? 2;
  const scored = arr.map(w => ({ w, score: (w?.oi || 0) * _relevance(w?.strike, spot, refMove, nearK) }));
  const maxScore = scored.reduce((m, x) => Math.max(m, x.score), 0);
  const floor = maxScore * (Number.isFinite(minShare) ? minShare : 0.3);
  const keep = scored
    .filter(x => (_TIER_RANK[x.w?.tier] ?? 0) >= minRank && x.score >= floor)
    .sort((a, b) => b.score - a.score)
    .map(x => x.w);
  return (keep.length ? keep : arr.slice(0, 2)).slice(0, maxWalls);
}

export function oiStoreToLevels(inst, { topWalls = null, minTier = "moderate", maxWalls = 3, minShare = 0.3, nearK = 2.5 } = {}) {
  if (!inst || typeof inst !== 'object') return [];
  const out = [];
  // Walls carry their 3× strength `tier` so the bots can weight/gate by it — the
  // fix for "a strong wall should trade differently from a weak one". Non-wall
  // types (max_pain/gamma_flip/hvl/oi_volume) have no tier.
  const push = (price, type, tier = null) => { if (Number.isFinite(price) && price > 0) out.push(tier ? { price: +price, type, tier } : { price: +price, type }); };
  const spot = inst?.spot, refMove = inst?.refMove?.move ?? null;
  const wallOpts = { topWalls, minTier, maxWalls, minShare, spot, refMove, nearK };
  const cw = Array.isArray(inst.callWalls) ? inst.callWalls : [];
  const pw = Array.isArray(inst.putWalls) ? inst.putWalls : [];
  push(inst.maxPain, 'max_pain');
  // The headline walls are "nearest above/below spot", chosen by DISTANCE — so they
  // can be trivially small. On EUR/USD the nearest call wall above spot carried 376
  // contracts next to a genuine 6,867-lot wall at 1.1600, and was exported and drawn
  // identically. Hold them to the same size floor: if the nearest thing above spot
  // isn't actually a wall, the honest answer is that there is no near call wall, not
  // a line pretending there is one.
  const headOK = (list, strike) => {
    if (Number.isFinite(topWalls)) return true;                 // explicit-count callers keep old behaviour
    const sc = list.map(w => (w?.oi || 0) * _relevance(w?.strike, spot, refMove, nearK));
    const maxScore = sc.reduce((m, x) => Math.max(m, x), 0);
    const i = list.findIndex(w => w.strike === strike);
    return !maxScore || (i >= 0 && sc[i] >= maxScore * (Number.isFinite(minShare) ? minShare : 0.3));
  };
  if (headOK(cw, inst.callWall)) push(inst.callWall, 'call_wall', cw.find(w => w.strike === inst.callWall)?.tier ?? null);
  if (headOK(pw, inst.putWall)) push(inst.putWall, 'put_wall', pw.find(w => w.strike === inst.putWall)?.tier ?? null);
  for (const w of _selectWalls(cw, wallOpts)) push(w?.strike, 'call_wall', w?.tier ?? null);
  for (const w of _selectWalls(pw, wallOpts)) push(w?.strike, 'put_wall', w?.tier ?? null);
  const gp = Array.isArray(inst.gexProfile) ? inst.gexProfile : [];
  // ONE source for the flip. This used to be an inline copy of the first-sign-change
  // scan — the same logic `gammaFlip` had before it was fixed — so the export and
  // /api/oi-levels kept emitting the old, tail-latching, strike-snapped value long
  // after the brick was corrected. Exactly the drift Lego Principle 1 forbids: two
  // copies, one fixed, silently disagreeing. Prefer the value computed at save time
  // (already on the record), fall back to the shared brick.
  push(Number.isFinite(inst.gammaFlip) ? inst.gammaFlip : gammaFlip(gp, inst.spot), 'gamma_flip');
  let hvl = null, hg = -Infinity;
  for (const g of gp) { const ag = Math.abs(g?.gamma ?? 0); if (ag > hg) { hg = ag; hvl = g?.strike; } }
  push(hvl, 'hvl');
  // The RIGOROUS gamma boundary (total net GEX re-evaluated at candidate prices,
  // root-found) alongside the cheap per-strike crossing. Both are emitted because they
  // answer the same question with different accuracy and consumers weight them
  // differently — see `gex_flip` handling in ConfluenceBot's level_matrix, where it is
  // deliberately credited as a BOUNDARY (like gamma_flip) and never as a magnet.
  // Every crossing, not just the nearest. A one-sided book crosses more than once,
  // and each crossing is a real regime edge: the bands between them alternate
  // long/short gamma. Falls back to the scalar for entries stored before `gexFlips`
  // existed. Distance relevance is already handled downstream (level_matrix's
  // `near()`, oiZones' reachMult x refMove), so no filtering is duplicated here.
  if (Array.isArray(inst.gexFlips) && inst.gexFlips.length) {
    for (const f of inst.gexFlips) push(f?.price, 'gex_flip');
  } else {
    push(inst.gexFlip, 'gex_flip');
  }
  // Volume magnets are today's flow, not resting structure, and carry no tier — keep
  // them to a small count so they stay a hint rather than crowding the chart.
  for (const v of (Array.isArray(inst.volumeMagnets) ? inst.volumeMagnets : []).slice(0, Number.isFinite(topWalls) ? topWalls : 2)) push(v?.strike, 'oi_volume');
  // Institutional CLUSTER zones (≥2 merged strikes) — a higher-conviction level the
  // bots/OI-bot can trade off. Emit the zone centre as `oi_cluster`.
  for (const c of (Array.isArray(inst.clusters) ? inst.clusters : [])) if ((c?.count ?? 0) >= 2) push(c.center, 'oi_cluster');
  const seen = new Set(), dedup = [];
  for (const l of out) { const k = `${l.type}@${l.price}`; if (!seen.has(k)) { seen.add(k); dedup.push(l); } }
  return dedup;
}

// OI-implied directional bias at a level the price is touching — the standard
// dealer-hedging reads, encoded so the bot can "trade sell/buy off the level":
//   • call_wall  = resistance (heavy call OI above; dealers sell into it) → SELL
//   • put_wall   = support    (heavy put OI below; dealers buy into it)   → BUY
//   • max_pain   = pin toward the strike: if the touched level is ABOVE max pain
//                  the pull is DOWN → SELL; BELOW → BUY (at the pin itself → none)
//   • gamma_flip = regime, not direction: above it = long-gamma (mean-revert /
//                  fade favoured), below = short-gamma (trend / follow favoured)
//   • hvl        = defended level, no inherent side → contributes to `regime` only
// Hold-vs-break (Lesson 5, `breakPips`>0 + `px`): a wall broken by more than
// breakPips flips from fade barrier to squeeze — call wall broken UP → buy, put
// wall broken DOWN → sell (parity with rangeline.py oi_bias).
// Returns { dir:'buy'|'sell'|null, strength (# agreeing OI reasons), reasons:[],
// regime:'meanrevert'|'trend'|null, conflict:bool }. Pure. `maxPain` optional
// (else inferred from an OI level of type max_pain).
export function oiBias(price, oiLevels, { pip, tolPips = 10, maxPain = null, px = null, breakPips = 0 } = {}) {
  const none = { dir: null, strength: 0, reasons: [], regime: null, conflict: false };
  if (!(price > 0) || !(pip > 0) || !Array.isArray(oiLevels) || !oiLevels.length) return none;
  const tol = tolPips * pip;
  // Break check first: a broken wall is a squeeze, not a barrier.
  if (Number.isFinite(px) && breakPips > 0) {
    const bd = breakPips * pip;
    for (const lv of oiLevels) {
      if (!Number.isFinite(lv?.price) || Math.abs(lv.price - price) > tol) continue;
      if (lv.type === 'call_wall' && px > lv.price + bd) return { dir: 'buy', strength: 1, reasons: ['call_wall broken up→squeeze→buy'], regime: 'trend', conflict: false };
      if (lv.type === 'put_wall' && px < lv.price - bd) return { dir: 'sell', strength: 1, reasons: ['put_wall broken down→squeeze→sell'], regime: 'trend', conflict: false };
    }
  }
  let buy = 0, sell = 0; const reasons = []; let regime = null;
  const mp = Number.isFinite(maxPain) ? maxPain
           : (oiLevels.find(l => l.type === 'max_pain' && Number.isFinite(l.price))?.price ?? null);
  const flip = oiLevels.find(l => l.type === 'gamma_flip' && Number.isFinite(l.price))?.price ?? null;
  if (Number.isFinite(flip)) regime = price > flip ? 'meanrevert' : 'trend';
  for (const lv of oiLevels) {
    if (!Number.isFinite(lv?.price) || Math.abs(lv.price - price) > tol) continue;
    if (lv.type === 'call_wall') { sell++; reasons.push('call_wall→resistance→sell'); }
    else if (lv.type === 'put_wall') { buy++; reasons.push('put_wall→support→buy'); }
    else if (lv.type === 'max_pain') { reasons.push('at max_pain→pin (no side)'); }
  }
  // Max-pain gravity: a touched level away from max pain is pulled back toward it.
  if (Number.isFinite(mp) && Math.abs(price - mp) > tol) {
    if (price > mp) { sell++; reasons.push('above max_pain→pull down→sell'); }
    else { buy++; reasons.push('below max_pain→pull up→buy'); }
  }
  const dir = buy > sell ? 'buy' : sell > buy ? 'sell' : null;
  return { dir, strength: Math.max(buy, sell), reasons, regime, conflict: buy > 0 && sell > 0 };
}

const _acc = () => ({ n: 0, wins: 0, sumRet: 0 });
const _add = (a, ret) => { a.n++; if (ret > 0) a.wins++; a.sumRet += ret; };
const _fin = a => ({ n: a.n, winRate: a.n ? +(a.wins / a.n).toFixed(4) : 0,
  avgRet: a.n ? +(a.sumRet / a.n).toFixed(5) : 0, sumRet: +a.sumRet.toFixed(5) });

// The forward-test audit. Joins the accumulated trade log against the per-date OI
// artifact and tallies tagged-vs-untagged expectancy, per OI type, plus the
// round-number-independence slice.
//   tradeLog: [{ date, symbol|instrument, open_price, close_price, direction, … }]
//   oiByDate: { 'YYYY-MM-DD': { instrKey: [{price,type}, …] } }
//   pipFor(instrKey) → pip size; tolPips proximity; roundTolPips for the round grid.
export function oiAudit(tradeLog, oiByDate, { pipFor = () => 0, tolPips = 10, roundTolPips = 10 } = {}) {
  const tagged = _acc(), untagged = _acc(), taggedNotRound = _acc(), taggedAtRound = _acc();
  const dirAgree = _acc(), dirDisagree = _acc();
  const byType = {};
  let joined = 0, noOI = 0, unresolved = 0;
  for (const t of (Array.isArray(tradeLog) ? tradeLog : [])) {
    const ret = tradePctReturn(t);
    if (ret == null) { unresolved++; continue; }
    const key = t.key || String(t.instrument ?? t.symbol ?? '').toLowerCase().replace('/', '').replace('_', '');
    const oi = oiByDate?.[t.date]?.[key];
    const pip = pipFor(key) || 0;
    // Only trades on a day whose OI was captured can be judged — tagged (an OI
    // level sits near the entry) vs untagged (OI present that day, but not near
    // this entry). Days with no OI captured are excluded, not counted as untagged.
    if (!oi || !oi.length || !(pip > 0)) { noOI++; continue; }
    joined++;
    const tag = tagTradeOI(t.open_price, oi, { pip, tolPips });
    if (tag.hit) {
      _add(tagged, ret);
      for (const ty of tag.types) { (byType[ty] ??= _acc()); _add(byType[ty], ret); }
      _add(nearRoundNumber(t.open_price, pip, roundTolPips) ? taggedAtRound : taggedNotRound, ret);
      // OI-DIRECTION scoring: did the trade's actual side match the OI read, and
      // did agreeing help? This is what validates the `oi_override` idea before it's
      // trusted live — split tagged trades by whether direction agreed with oiBias.
      const bias = oiBias(t.open_price, oi, { pip, tolPips });
      const tdir = /buy|long/i.test(String(t.direction)) ? 'buy' : /sell|short/i.test(String(t.direction)) ? 'sell' : null;
      if (bias.dir && tdir) _add(bias.dir === tdir ? dirAgree : dirDisagree, ret);
    } else {
      _add(untagged, ret);
    }
  }
  const finByType = {}; for (const k of Object.keys(byType)) finByType[k] = _fin(byType[k]);
  return {
    tagged: _fin(tagged), untagged: _fin(untagged),
    taggedNotRound: _fin(taggedNotRound), taggedAtRound: _fin(taggedAtRound),
    oiDirAgree: _fin(dirAgree), oiDirDisagree: _fin(dirDisagree),
    byType: finByType,
    coverage: { tradesWithOIDay: joined, tradesNoOIDay: noOI, unresolved },
    edge: +(_fin(tagged).avgRet - _fin(untagged).avgRet).toFixed(5),   // tagged − untagged expectancy
    oiDirEdge: +(_fin(dirAgree).avgRet - _fin(dirDisagree).avgRet).toFixed(5),   // agree − disagree (validates oi_override)
  };
}
