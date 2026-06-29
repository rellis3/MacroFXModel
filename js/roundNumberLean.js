/**
 * Round-Number Lean — the Osler at-vs-beyond asymmetry as a fade/follow lean.
 *
 * Evidence basis (REVERSION_CONTINUATION_EVIDENCE.md §1; Osler 2003 JF / 2005 JIMF):
 *   • Take-profit orders cluster AT round numbers   → price reverts there → FADE.
 *   • Stop-loss orders cluster JUST BEYOND a figure  → a breach cascades   → FOLLOW.
 *
 * What this is / isn't (the lego boundary)
 *   • It REUSES the round-number arithmetic already in js/confluenceModules.js
 *     (MODULE 10 `round_number` + its `nearest` helper) — never copies it. That
 *     module only detects PROXIMITY (the magnet/fade half). This adapter adds the
 *     missing CONTINUATION half: was the figure BREACHED during the move (i.e. did
 *     price come from the other side)?
 *   • Output is a signed lean in [-1,+1] — SAME convention as dayTypeCore.signedT
 *     (−ve = fade, +ve = follow, 0 = no nearby figure / neutral). It is a
 *     LEVEL-MAGNETISM signal — a sibling to the day-type PATH signal, meant to feed
 *     the forecaster's SELECTOR alongside signedT, NOT to be folded inside
 *     dayTypeScore (which is drift/diffusion only).
 *   • No lookahead: it reads only the current price and a prior reference price.
 */

import { MODULE_MAP } from './confluenceModules.js';

const RN = MODULE_MAP.round_number;

/**
 * roundNumberLean({ price, refPrice?, pipSize, ... }) → { lean, mode, figure, type, distPips }
 *   price        : the level being evaluated (e.g. a forecast band tag or current price)
 *   refPrice     : where the move came from (e.g. session open / prior bar close). If
 *                  given and the figure sits between refPrice and price, the figure was
 *                  BREACHED → continuation half is in play. Omit → magnet/fade only.
 *   pipSize      : instrument pip size (same convention as the confluence system)
 *   zoneRadiusPips : "at the figure" magnet band, strongest fade at the figure (default 3)
 *   cascadePips    : "just beyond" stop-cascade band, follow lean decays to 0 by here (default 15)
 *   minorWeight    : half-figures weaker than big figures (Osler: 0-ending > 5-ending; default 0.6)
 */
export function roundNumberLean(opts = {}) {
  const {
    price, refPrice = null, pipSize,
    zoneRadiusPips = 3, cascadePips = 15, minorWeight = 0.6,
  } = opts;
  const none = { lean: 0, mode: 'none', figure: null, type: null, distPips: null };
  if (!(pipSize > 0) || price == null) return none;

  const state = RN.buildDayState(null, null, pipSize, null, opts); // { pipSize }
  const near = RN.nearest(price, state);
  if (!near) return none;

  const d = near.distPips;                              // signed pips from figure (+above/−below)
  const ad = Math.abs(d);
  const w = near.type === 'minor' ? minorWeight : 1;    // big figure > half figure
  const base = { figure: near.figure, type: near.type, distPips: +d.toFixed(2) };

  // 1) Magnet half — sitting at / approaching the figure → FADE (strongest at the figure).
  if (ad <= zoneRadiusPips) {
    const lean = -w * (1 - ad / zoneRadiusPips);
    return { ...base, lean: +lean.toFixed(4), mode: lean < 0 ? 'fade' : 'none' };
  }

  // 2) Continuation half — figure was BREACHED (refPrice on the other side) and price is
  //    in the just-beyond stop-cascade band → FOLLOW (strongest just past the figure).
  if (refPrice != null && cascadePips > zoneRadiusPips) {
    const sideNow = Math.sign(price - near.figure);
    const sideRef = Math.sign(refPrice - near.figure);
    const crossed = sideRef !== 0 && sideNow !== sideRef;
    if (crossed && ad <= cascadePips) {
      const lean = w * (1 - (ad - zoneRadiusPips) / (cascadePips - zoneRadiusPips));
      return { ...base, lean: +Math.max(lean, 0).toFixed(4), mode: lean > 0 ? 'follow' : 'none' };
    }
  }

  return { ...base, lean: 0, mode: 'none' };
}

/**
 * Blend a level-magnetism lean with the day-type path lean (signedT). Both are in
 * [-1,+1]; returns a combined directional score in [-1,+1] (−ve fade, +ve follow).
 * This is the intended consumption point for a selector / the analysis page —
 * default weight 0.5 each; tune & validate OOS before trusting it in a live path.
 */
export function blendLean(signedT, rnLean, wRn = 0.5) {
  const wT = 1 - wRn;
  const c = wT * (signedT ?? 0) + wRn * (rnLean ?? 0);
  return +Math.max(-1, Math.min(1, c)).toFixed(4);
}
