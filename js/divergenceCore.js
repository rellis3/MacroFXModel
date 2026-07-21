/**
 * Divergence Core — regular & hidden price↔oscillator divergences, pure.
 *
 * Oscillator-AGNOSTIC by design: the caller passes the oscillator series (e.g.
 * `vumanchuCore.waveTrendSeries(bars)` — never a second WaveTrend copy; the whole
 * point of vumanchuCore is one WT compute). This brick only knows pivots + the
 * price/oscillator comparison, so it can never carry a drifted oscillator (the
 * defect in the older `js/divergence.js`, which is fused to global state, hidden-
 * blind, and hand-rolls its own WT).
 *
 * A divergence pairs two consecutive oscillator pivots and compares the swing in
 * price against the swing in the oscillator:
 *   regular bear  — price HIGHER high, osc LOWER high   → reversal DOWN
 *   regular bull  — price LOWER low,   osc HIGHER low    → reversal UP
 *   hidden  bear  — price LOWER high,  osc HIGHER high   → continuation DOWN
 *   hidden  bull  — price HIGHER low,  osc LOWER low     → continuation UP
 * Regular = trend exhaustion (fade); hidden = trend resumption (follow).
 *
 * Pivots use a `reach`-bar fractal (reach bars strictly higher/lower on each
 * side, VuManChu's 5-bar fractal = reach 2). A pivot at i is only confirmable at
 * i+reach, so a causal read at bar t sees pivots up to t−reach — no lookahead
 * beyond the data passed in. Pure; unit-tested in divergenceCore.test.mjs.
 */

// Strict local maxima / minima (fractal tops/bots) of a series.
export function pivotHighs(arr, reach = 2) {
  const out = [];
  for (let i = reach; i < arr.length - reach; i++) {
    let ok = true;
    for (let j = 1; j <= reach; j++) { if (!(arr[i] > arr[i - j] && arr[i] > arr[i + j])) { ok = false; break; } }
    if (ok) out.push(i);
  }
  return out;
}
export function pivotLows(arr, reach = 2) {
  const out = [];
  for (let i = reach; i < arr.length - reach; i++) {
    let ok = true;
    for (let j = 1; j <= reach; j++) { if (!(arr[i] < arr[i - j] && arr[i] < arr[i + j])) { ok = false; break; } }
    if (ok) out.push(i);
  }
  return out;
}

function mk(kind, bias, iPrev, iRec, pricePrev, priceRec, oscPrev, oscRec) {
  return { kind, bias, iPrev, iRec, pricePrev, priceRec, oscPrev, oscRec };
}

// All divergences between consecutive oscillator pivots. `priceHi`/`priceLo` are
// the per-bar highs/lows (same length as `osc`). `obLevel`/`osLevel` gate the
// REGULAR divergences to the overbought/oversold zone (VuManChu applies its
// OB/OS limits to regular divergences only — bear pivot ≥ obLevel, bull pivot ≤
// osLevel; hidden divergences stay UNGATED, matching the Pine `showHiddenDiv_nl`
// default). null on a level = no gate. Feed the SIGNAL line (WaveTrend wt2) — the
// series VuManChu keys divergences off — not wt1. Returns divergences sorted by
// recent-pivot index (each carries both pivot indices + price/osc values, enough
// to drive a selector and draw the connecting lines).
export function findDivergences(priceHi, priceLo, osc, { reach = 2, obLevel = null, osLevel = null } = {}) {
  const out = [];
  const tops = pivotHighs(osc, reach), bots = pivotLows(osc, reach);
  // Regular pivots are the OB/OS-gated subset (so consecutive regular pairs are
  // consecutive GATED pivots, exactly like Pine's gated fractal stream).
  const regTops = obLevel == null ? tops : tops.filter(i => osc[i] >= obLevel);
  const regBots = osLevel == null ? bots : bots.filter(i => osc[i] <= osLevel);
  for (let k = 1; k < regTops.length; k++) {
    const p = regTops[k - 1], r = regTops[k];
    if (priceHi[r] > priceHi[p] && osc[r] < osc[p]) out.push(mk('regular', 'bear', p, r, priceHi[p], priceHi[r], osc[p], osc[r]));
  }
  for (let k = 1; k < regBots.length; k++) {
    const p = regBots[k - 1], r = regBots[k];
    if (priceLo[r] < priceLo[p] && osc[r] > osc[p]) out.push(mk('regular', 'bull', p, r, priceLo[p], priceLo[r], osc[p], osc[r]));
  }
  // Hidden divergences over ALL pivots (ungated).
  for (let k = 1; k < tops.length; k++) {
    const p = tops[k - 1], r = tops[k];
    if (priceHi[r] < priceHi[p] && osc[r] > osc[p]) out.push(mk('hidden', 'bear', p, r, priceHi[p], priceHi[r], osc[p], osc[r]));
  }
  for (let k = 1; k < bots.length; k++) {
    const p = bots[k - 1], r = bots[k];
    if (priceLo[r] > priceLo[p] && osc[r] < osc[p]) out.push(mk('hidden', 'bull', p, r, priceLo[p], priceLo[r], osc[p], osc[r]));
  }
  return out.sort((a, b) => a.iRec - b.iRec);
}

// Selector read for a touch: at bar `touchIdx`, on `side` (+1 up-line / -1 down-
// line), is a REGULAR reversal divergence of the matching bias fresh (its recent
// pivot within `window` bars back)? Up-touches look for a bear reversal, down-
// touches for a bull reversal. Returns 'fade' (reversal present → revert) or
// 'follow' (none → let momentum continue). Only reads data ≤ touchIdx.
export function reversalDecision(priceHi, priceLo, osc, touchIdx, side, { reach = 2, window = 5, obLevel = null, osLevel = null } = {}) {
  if (touchIdx < 2 * reach) return 'follow';   // too early to have a confirmable pivot pair
  const hi = priceHi.slice(0, touchIdx + 1), lo = priceLo.slice(0, touchIdx + 1), o = osc.slice(0, touchIdx + 1);
  const wantBias = side > 0 ? 'bear' : 'bull';
  const divs = findDivergences(hi, lo, o, { reach, obLevel, osLevel });
  const hit = divs.some(d => d.kind === 'regular' && d.bias === wantBias && (touchIdx - d.iRec) <= window);
  return hit ? 'fade' : 'follow';
}
