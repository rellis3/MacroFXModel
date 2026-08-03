/**
 * Expected-Move Core — one consolidated "continue or fade, and by how much" read
 * per pair, over a chosen forward horizon. Pure orchestration: it invents no new
 * math, it wires three existing bricks together for the SAME instant:
 *
 *   magnitude    — Cone A (forecastPathCore) + Cone B (analogCone) blended via
 *                  coneBlend — the exact call sequence forecast-blend.html uses
 *                  for one pair, run here for any pair's bars.
 *   direction    — dayTypeScore/classifyDayType's trend-day-ness T (drift÷diffusion),
 *                  the built continue-vs-fade classifier (js/dayTypeCore.js), read
 *                  on this pair's own recent closes. Its estimators are magnitude-only
 *                  (unsigned), so the actual UP/DOWN call comes from the blended
 *                  cone's own median path (sign of center vs anchor) — T decides
 *                  whether to trust that lean (TREND) or expect it to fade back
 *                  toward anchor instead (RANGE).
 *   wall context — GEX call/put wall + gamma-flip proximity (js/gammaFlow.js), read
 *                  from the user's own pasted OI data (oi_store) when present for
 *                  this pair. A conditional modifier, not a standalone vote — it has
 *                  nothing to say when price isn't near a wall.
 *
 * Per CLAUDE.md's honest-teammate rules: this combines EXISTING signals of very
 * different validation status (Cone A/B calibration is graded OOS per pair by
 * coneBlend's own calibration; dayTypeScore backs live strategies elsewhere;
 * the GEX wall read is explicitly "folklore-tier, not validated" per gammaFlow.js's
 * own docstring). Nothing here claims a combined edge — it is a decision-support
 * readout, not a new backtested strategy. Callers must not present it as one.
 */
import { buildIntradayContext, intradayCone, INTRADAY_DEFAULTS } from './forecastPathCore.js';
import { buildAnalogContext, analogCone } from './analogCone.js';
import { fitBlendWeights, blendCones, weightAFor } from './coneBlend.js';
import { classifyDayType } from './dayTypeCore.js';
import { gammaFlip, distanceToFlip } from './gammaFlow.js';

// Same floor forecast-blend.html uses for "enough history for the analog cone's
// warmup + a real IS/OOS split" (INTRADAY_DEFAULTS.warmupBars + 600), so a pair
// that can't be blend-fit doesn't silently get a worse (unfit) blend weight.
export const MIN_BARS = INTRADAY_DEFAULTS.warmupBars + 600;

// One pair's read. `bars` = M15/M5 candles [{time,open,high,low,close}], oldest→
// newest — the same shape forecast-blend.html feeds the cones. `oiInst` = this
// pair's oi_store entry (or null — the wall layer just goes inert without it).
export function computeExpectedMove({ pair, bars, H, pip, oiInst = null, dayTypeWin = 32 } = {}) {
  if (!Array.isArray(bars) || bars.length < MIN_BARS) {
    return { pair, ok: false, error: `only ${bars?.length ?? 0} bars — need ${MIN_BARS}+ for a real IS/OOS blend fit` };
  }
  const ctxA = buildIntradayContext(bars);
  const ctxB = buildAnalogContext(bars);
  const i = bars.length;
  const coneA = intradayCone(ctxA, i, H);
  const coneB = analogCone(ctxB, i, H);
  if (!coneA && !coneB) return { pair, ok: false, error: 'not enough history for either cone at this date' };

  let wA = 0.5, bucketTrusted = false;
  if (coneA && coneB) {
    try {
      const fit = fitBlendWeights(bars, H, { ctxA, ctxB });
      wA = weightAFor(fit, coneB.target.regime, coneB.target.vol);
      bucketTrusted = fit.bucketWeights.get(`${coneB.target.regime}_${coneB.target.vol}`) != null;
    } catch { /* thin history for a walk-forward fit — fall back to 50/50, still an honest blend */ }
  }
  const blend = blendCones(coneA, coneB, wA);
  const step = blend.steps[blend.steps.length - 1];
  const anchor = blend.anchor;

  const closes = bars.map(b => b.close);
  const { T, signedT, label } = classifyDayType({ closes, idx: i, win: dayTypeWin });
  const driftDir = Math.sign(step.center - anchor);
  const call = label === 'RANGE' ? 'FADE'
    : label === 'TREND' ? (driftDir > 0 ? 'CONTINUE_UP' : driftDir < 0 ? 'CONTINUE_DOWN' : 'CONTINUE')
    : 'MIXED';
  const direction = { T, signedT, dayTypeLabel: label, driftDir, call };

  const toPips = v => (pip > 0 && Number.isFinite(v)) ? +((v - anchor) / pip).toFixed(1) : null;
  const expected = {
    horizonBars: H, anchor, center: step.center,
    pipsCenter: toPips(step.center),
    p50: { up: step.p50Up, down: step.p50Dn, pipsUp: toPips(step.p50Up), pipsDown: toPips(step.p50Dn) },
    p75: { up: step.p75Up, down: step.p75Dn, pipsUp: toPips(step.p75Up), pipsDown: toPips(step.p75Dn) },
  };

  const wall = wallModifier(oiInst, anchor, pip);

  return {
    pair, ok: true, anchor, anchorTime: blend.anchorTime,
    direction, expected, wall,
    coneB: coneB ? { regime: coneB.target.regime, vol: coneB.target.vol, nAnalogs: coneB.nAnalogs,
      nEpisodes: coneB.nEpisodes, lowConfidence: coneB.lowConfidence } : null,
    weightA: +wA.toFixed(3), bucketTrusted,
    warnings: [
      !coneA && 'Cone A unavailable — Cone B only',
      !coneB && 'Cone B unavailable — Cone A only',
      coneB?.lowConfidence && 'Cone B: thin analog sample for this regime/vol bucket',
    ].filter(Boolean),
  };
}

// GEX wall proximity read for one pair, from its oi_store entry (js/oi.js's
// processOIData output — {maxPain, callWall, putWall, gexProfile[{strike,netGex}]}).
// Inert (returns null) without OI data pasted for this pair — a conditional
// modifier, never a required input. tolPips mirrors oiConfluence.js's default.
export function wallModifier(inst, spot, pip, tolPips = 10) {
  if (!inst || !(spot > 0) || !(pip > 0)) return null;
  const flip = Array.isArray(inst.gexProfile) ? gammaFlip(inst.gexProfile, spot) : null;
  const distFlip = flip != null ? distanceToFlip(spot, flip) : null;
  const distPips = level => Number.isFinite(level) ? Math.abs(spot - level) / pip : null;
  const dCall = distPips(inst.callWall), dPut = distPips(inst.putWall);
  let near = null;
  if (dCall != null && dCall <= tolPips) {
    near = { level: 'call_wall', price: inst.callWall, distPips: dCall,
      effect: 'short-gamma / amplifying — favors continuation through the level' };
  } else if (dPut != null && dPut <= tolPips) {
    near = { level: 'put_wall', price: inst.putWall, distPips: dPut,
      effect: 'long-gamma / dampening — favors fade at the level' };
  }
  return { maxPain: inst.maxPain ?? null, callWall: inst.callWall ?? null, putWall: inst.putWall ?? null,
    flip, distFlip, near };
}
