/**
 * Currency strength (σ) as it stood at every 15 minutes of a London session day: the replay's strength layer. Pure: bars in, a series out.
 *
 * It is the SAME engine as the live board (js/ccyStrengthCore.js buildStrength), run once per step with the bars TRUNCATED to what had finished by that
 * step, so each pair's normal move (the σ unit) is taken only from bars before the moment: nothing from after it leaks in. While the FX week is shut a
 * step carries closed:true and its windows end at the last price, exactly as the live board does.
 */
import { buildStrength, CCYS } from './ccyStrengthCore.js';

const HOUR = 3600e3;
/** The bars (ascending, t = open ms) that had FINISHED by t. A bar of `stepMs` is finished at open + stepMs. */
export function upTo(arr, stepMs, t) {
  let lo = 0, hi = (arr?.length ?? 0) - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m].t + stepMs <= t) { k = m; lo = m + 1; } else hi = m - 1; }
  return k < 0 ? [] : arr.slice(0, k + 1);
}

/** bars = { 'EUR_USD': { m5: [{t,c}], h1: [{t,c}], d: [{t,c}] }, ... }. Steps start at startMs, every stepMs, up to (not including) endMs. */
export function buildStrengthSeries({ bars, startMs, endMs, stepMs = 15 * 60e3 }) {
  const steps = [];
  for (let t = startMs; t < endMs; t += stepMs) {
    const per = {};
    for (const [pair, b] of Object.entries(bars ?? {})) per[pair] = { m5: upTo(b.m5, 300e3, t), h1: upTo(b.h1, HOUR, t), d: upTo(b.d, 24 * HOUR, t) };
    const p = buildStrength({ bars: per, now: t });
    if (!p.ok) { steps.push({ t, ok: false }); continue; }
    const h = {};
    for (const hz of ['1H', '4H', '1D', '1W']) {
      const x = p.horizons?.[hz];
      if (!x?.available) { h[hz] = null; continue; }
      const m = Object.fromEntries(x.scores.map(s => [s.ccy, s.score]));
      h[hz] = CCYS.map(c => m[c]);
    }
    steps.push({ t, closed: !!p.closed, h });
  }
  return { ccys: CCYS, stepMs, steps };
}
