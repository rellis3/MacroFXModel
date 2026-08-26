/**
 * Synthetic random-walk M1 generator — THE null-control instrument for the
 * VWAP fixed-sigma family (and any engine that needs a "no structure by
 * construction" packed series). Extracted from
 * scripts/run_gold_vwap_sigma_controls.mjs so the σ-definition A/B and any
 * future control run use the identical generator, never a drifted copy.
 *
 * Deterministic: seeded mulberry32, no Math.random/Date. Driftless Gaussian
 * increments, mild wick noise, unit-ish tick volume.
 */

export function mulberry32(a) {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function syntheticRandomWalkPacked({ seed = 7, days = 800, barsPerDay = 1440,
                                            startPrice = 2000, stepSd = 0.8, wickSd = 0.2,
                                            baseEpoch = Date.UTC(2018, 0, 1) / 1000 } = {}) {
  const rnd = mulberry32(seed);
  const gauss = () => { const u = Math.max(rnd(), 1e-12), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const DAY = 86400;
  const times = [], opens = [], highs = [], lows = [], closes = [], volumes = [];
  let px = startPrice;
  for (let d = 0; d < days; d++) {
    for (let m = 0; m < barsPerDay; m++) {
      const o = px; px += gauss() * stepSd; const c = px;
      times.push(baseEpoch + d * DAY + m * 60); opens.push(o);
      highs.push(Math.max(o, c) + Math.abs(gauss()) * wickSd);
      lows.push(Math.min(o, c) - Math.abs(gauss()) * wickSd);
      closes.push(c); volumes.push(1 + Math.abs(gauss()));
    }
  }
  return { n: times.length, times: Int32Array.from(times), opens: Float32Array.from(opens),
           highs: Float32Array.from(highs), lows: Float32Array.from(lows),
           closes: Float32Array.from(closes), volumes: Float32Array.from(volumes) };
}
