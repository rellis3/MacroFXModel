// Z-Score V2 — pure confidence-scoring core (no I/O, no network, no parquet dep).
//
// These are the NEW bricks behind the "macro as confidence, not gate" reframe
// (js/zscoreSpreadV2Engine.js is the I/O engine that wires them to FRED + M1 data).
// Kept pure so they unit-test on synthetic data without the network — CLAUDE.md's
// brick rule (d). Every factor is tiered by EVIDENCE and independently ABLATABLE
// (set its weight to 0) so the A/B can INVALIDATE ideas one at a time:
//
//   • zAlign   — rate-differential/carry sets the directional lean; the fade must
//                AGREE. REPLICATED macro factor. (Nominal spread, not real — a
//                documented limitation vs the literature's preference for real rates.)
//   • riskOff  — VIX + HY-credit regime. REPLICATED carry-crash gate: a stressed
//                regime VETOES (dampens) the carry-aligned fade.
//   • approachVel — fast spike into the line → fade. INTERNAL OOS-proven winner.
//   • fibDepth — deeper extension = more stretched. FOLKLORE (weak) — smallest weight.

export const V2_DEFAULTS = {
  splitFrac:     0.6,   // in-sample fraction; headline stats reported on the OOS tail
  confThreshold: 0.50,  // take a trade when composite confidence >= this
  zGateMin:      0,     // optional min |z| floor (0 = fully ungated, the pure reframe)
  velWin:        15,    // M1 bars for the approach-velocity leg (~15 min)
  velRef:        0.50,  // approach travel (as a fraction of Asia range) that scores 1.0
  slFrac:        0.25,  // SL distance beyond the fib level, in Asia-range units (as v1)
  minRR:         0.8,   // reject a zone whose reward:risk < this (as v1)
  zCap:          3,     // |z| saturation for the alignment score
  vixZWindow:    252,   // rolling window (days) for the VIX/HY risk-off z-scores
  // Weights TIERED BY EVIDENCE (replicated macro > internal-OOS > folklore).
  // Set any weight to 0 to ABLATE that factor and re-run the A/B to invalidate it.
  weights:       { z: 0.35, riskOff: 0.20, vel: 0.30, struct: 0.15 },
  fibMults:      [0.25, 0.75, 1.25, 1.5, 2.0],          // extension ladder (both sides)
};

// Risk-off regime series (pair-independent; fetched once per run). Both are FRED
// series already used elsewhere in the platform.
export const RISKOFF_SERIES = { vix: 'VIXCLS', hy: 'BAMLH0A0HYM2' };

// ── Pure confidence-scoring bricks ────────────────────────────────────────────────

// Does the yield-spread z agree with the fade direction? → [0,1], 0.5 = neutral.
//   zBiasDir = the pair's directional lean from sign(z): z>0 → 'LONG', z<0 → 'SHORT'
//     (v1's convention; `inverted` flips it for pairs whose sign is unconfirmed).
//   fadeDir  = the geometry's fade ('LONG' at a down-side level, 'SHORT' at up-side).
// Agree + large |z| → ~1 (macro confirms the fade). Oppose + large |z| → ~0 (veto).
// |z| ~ 0 → 0.5 (macro abstains — no longer an auto-skip, unlike v1's gate).
export function zAlignScore(z, fadeDir, { inverted = false, zCap = 3 } = {}) {
  if (!Number.isFinite(z)) return 0.5;
  let biasDir = z > 0 ? 'LONG' : 'SHORT';
  if (inverted) biasDir = biasDir === 'LONG' ? 'SHORT' : 'LONG';
  const mag    = Math.min(Math.abs(z), zCap) / zCap;   // [0,1]
  const signed = (biasDir === fadeDir ? 1 : -1) * mag; // [-1,1]
  return (signed + 1) / 2;                             // [0,1]
}

// Speed of the approach into the level, scaled by the Asia range (a self-contained
// intraday-vol proxy for touchFeatures' daily-σ velocity). A fast spike into the
// line = overextension → fade-prone (Crabel's "stretch", the OOS-proven winner in
// ENTRY_ZONE_CONFIDENCE.md). Returns raw travel-in-range-units (dimensionless).
export function approachVelRangeScaled(closes, touchIdx, velWin, asiaRange) {
  if (!(touchIdx >= velWin) || !(asiaRange > 0)) return 0;
  const move = Math.abs(closes[touchIdx] - closes[touchIdx - velWin]);
  return move / asiaRange;
}

// Map raw approach velocity → [0,1], saturating at velRef.
export function velToScore(vel, velRef = 0.5) {
  if (!(vel > 0) || !(velRef > 0)) return 0;
  return Math.min(1, vel / velRef);
}

// Zone depth: deeper fib extensions are more overstretched = classic exhaustion
// fades. mult ∈ {0.25..2.0} → [0,1], saturating at 2×.
export function structScore(mult) {
  if (!(mult > 0)) return 0;
  return Math.min(1, mult / 2.0);
}

// Risk-off regime → [0,1], 1 = calm (full confidence), 0 = stressed (veto). The
// literature's carry-crash gate: a carry-aligned fade is dangerous when vol spikes
// or credit widens, so a stressed regime DAMPENS confidence. Inputs are rolling
// z-scores of VIX and HY-OAS (both high = stressed); combined by their max (either
// stress source vetoes). vixZ/hyZ ~ 0 → calm (~1); either ≳ +2σ → stressed (~0).
export function riskOffScore(vixZ, hyZ, { stressCap = 2 } = {}) {
  const zs = [vixZ, hyZ].filter(v => Number.isFinite(v));
  if (!zs.length) return 0.5;                       // no data → neutral, never a free veto
  const stress = Math.max(...zs.map(v => Math.max(0, v)));  // only ABOVE-mean stress counts
  return 1 - Math.min(1, stress / stressCap);
}

// Weighted composite ∈ [0,1]. Weights need not pre-sum to 1 — normalised here.
// Any factor with weight 0 (ablated) drops out cleanly.
export function compositeConfidence({ zAlign01, riskOff, velScore, struct }, weights = V2_DEFAULTS.weights) {
  const w = { z: 0, riskOff: 0, vel: 0, struct: 0, ...weights };
  const wSum = w.z + w.riskOff + w.vel + w.struct;
  if (!(wSum > 0)) return 0;
  const raw = w.z       * (zAlign01 ?? 0)
            + w.riskOff * (riskOff  ?? 0.5)
            + w.vel     * (velScore ?? 0)
            + w.struct  * (struct   ?? 0);
  return raw / wSum;
}

export function confBucketOf(conf) {
  if (conf >= 0.70) return '0.70+';
  if (conf >= 0.60) return '0.60-0.70';
  if (conf >= 0.50) return '0.50-0.60';
  return '<0.50';
}

// ── Rolling risk-off series (pure; obs maps are passed in, not fetched) ────────────

function shiftDate(dateStr, deltaDays) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().substring(0, 10);
}

// Rolling z-score of a SINGLE forward-filled series (VIX or HY), by calendar date.
// Mirrors buildRollingZSeries' warmup/forward-fill so risk-off aligns with the
// spread z. Returns Map date → z (deviation of today's level from its rolling mean).
export function buildSingleRollingZByDate(obs, zWindow, dateFrom, dateTo) {
  const fredFrom = shiftDate(dateFrom, -(zWindow + 14));
  const days = [];
  for (let d = new Date(fredFrom + 'T00:00:00Z'), end = new Date(dateTo + 'T00:00:00Z');
       d <= end; d = new Date(d.getTime() + 86_400_000)) {
    days.push(d.toISOString().substring(0, 10));
  }
  const byDate = new Map();
  const win = [];
  let sum = 0, sumSq = 0, last = null;
  const warmup = Math.min(zWindow, 30);
  for (const day of days) {
    if (obs.has(day)) last = obs.get(day);
    if (last == null) continue;
    win.push(last); sum += last; sumSq += last * last;
    if (win.length > zWindow) { const old = win.shift(); sum -= old; sumSq -= old * old; }
    if (win.length >= warmup) {
      const n = win.length, mean = sum / n;
      const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
      if (std > 1e-9) byDate.set(day, (last - mean) / std);
    }
  }
  return byDate;
}

// Combine VIX + HY rolling-z maps into a per-date risk snapshot.
export function buildRiskOffByDate(vixObs, hyObs, zWindow, dateFrom, dateTo) {
  const vixZ = buildSingleRollingZByDate(vixObs, zWindow, dateFrom, dateTo);
  const hyZ  = buildSingleRollingZByDate(hyObs,  zWindow, dateFrom, dateTo);
  const out = new Map();
  const keys = new Set([...vixZ.keys(), ...hyZ.keys()]);
  for (const k of keys) out.set(k, { vixZ: vixZ.get(k) ?? null, hyZ: hyZ.get(k) ?? null });
  return out;
}

// ── Confidence-bucket breakdown (the A/B falsification) ───────────────────────────
// Pre-registered test: if confidence is a REAL grader, win% / profit-factor should
// RISE with the bucket (0.50-0.60 < 0.60-0.70 < 0.70+) — the OPPOSITE of v1's
// z-tier decay. A flat or decaying profile here = the reframe did NOT add edge.
export function computeConfBuckets(trades) {
  const out = {};
  for (const tier of ['0.50-0.60', '0.60-0.70', '0.70+']) {
    const tt = trades.filter(t => t.confBucket === tier);
    const wins   = tt.filter(t => t.result === 'TP').length;
    const losses = tt.filter(t => t.result === 'SL').length;
    const pips   = tt.reduce((s, t) => s + t.pips, 0);
    const grossW = tt.filter(t => t.pips > 0).reduce((s, t) => s + t.pips, 0);
    const grossL = Math.abs(tt.filter(t => t.pips < 0).reduce((s, t) => s + t.pips, 0));
    out[tier] = {
      count: tt.length, wins, losses,
      winRate: tt.length ? +(wins / tt.length * 100).toFixed(1) : 0,
      totalPips: +pips.toFixed(1),
      profitFactor: grossL > 0 ? +(grossW / grossL).toFixed(2) : (grossW > 0 ? 999 : 0),
    };
  }
  return out;
}

// ── IS/OOS split (Lego rule #5: judge on the OOS card) ───────────────────────────
export function splitTradesByDate(trades, splitFrac) {
  if (!trades.length) return { splitDate: null, is: [], oos: [] };
  const dates = [...new Set(trades.map(t => t.date))].sort();
  const splitIdx = Math.min(dates.length - 1, Math.floor(dates.length * splitFrac));
  const splitDate = dates[splitIdx];
  return {
    splitDate,
    is:  trades.filter(t => t.date <  splitDate),
    oos: trades.filter(t => t.date >= splitDate),
  };
}
