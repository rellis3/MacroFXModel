// Z-Score V2 — pure confidence-scoring core (no I/O, no network, no parquet dep).
//
// These are the NEW bricks behind the "macro as confidence, not gate" reframe
// (js/zscoreSpreadV2Engine.js is the I/O engine that wires them to FRED + M1 data).
// Kept pure so they unit-test on synthetic data without the network — CLAUDE.md's
// brick rule (d). Every factor is tiered by EVIDENCE and independently ABLATABLE
// (set its weight to 0) so the A/B can INVALIDATE ideas one at a time. A factor
// with NO data for a given trade returns null and drops out of the composite
// (renormalised), so "no data" behaves exactly like "ablated" — never a free bias.
//
// Phase 1 factors:
//   • zAlign   — nominal rate-differential/carry sets the directional lean; the fade
//                must AGREE. REPLICATED macro factor.
//   • riskOff  — VIX + HY-credit regime. REPLICATED carry-crash gate: a stressed
//                regime VETOES (dampens) the carry-aligned fade.
//   • approachVel — fast spike into the line → fade. INTERNAL OOS-proven winner.
//   • fibDepth — deeper extension = more stretched. FOLKLORE (weak) — smallest weight.
//
// Phase 1.5 factors (added from the cross-asset macro framework docs):
//   • realRate    — US 10Y REAL yield (DFII10) as a USD-strength bias, oriented to the
//                   pair's USD role. REPLICATED and the literature's PREFERRED read over
//                   nominal — closes v1's nominal-only gap.
//   • coherence   — cross-asset agreement: fraction of the directional macro lenses
//                   (nominal-carry, real-rate) that AGREE with the fade. The docs' central
//                   "coherence → conviction" idea. (Overlaps the align factors by design —
//                   it scores concordance, not level; ablate to test its marginal value.)
//   • positioning — COT net-spec extreme the fade OPPOSES (crowded longs → fade shorts have
//                   fuel). MEDIUM evidence; neutral/null until a positioning series is wired.
//   • eventVeto   — hard SKIP on FOMC/NFP/CPI days (never fade into a print). A GATE, not a
//                   weighted factor. NFP is deterministic (first Friday); FOMC/CPI via a date list.

export const V2_DEFAULTS = {
  splitFrac:     0.6,   // in-sample fraction; headline stats reported on the OOS tail
  confThreshold: 0.50,  // take a trade when composite confidence >= this
  zGateMin:      0,     // optional min |z| floor (0 = fully ungated, the pure reframe)
  velWin:        15,    // M1 bars for the approach-velocity leg (~15 min)
  velRef:        0.50,  // approach travel (as a fraction of Asia range) that scores 1.0
  slFrac:        0.25,  // SL distance beyond the fib level, in Asia-range units (as v1)
  minRR:         0.8,   // reject a zone whose reward:risk < this (as v1)
  zCap:          3,     // |z| saturation for the alignment score
  vixZWindow:    252,   // rolling window (days) for the VIX/HY/real-yield z-scores
  eventVeto:     true,  // skip FOMC/NFP/CPI days (hard veto — never fade into a print)
  eventDates:    [],    // extra 'YYYY-MM-DD' event dates (FOMC/CPI) to veto; NFP is intrinsic
  // Weights TIERED BY EVIDENCE (replicated macro > internal-OOS > folklore).
  // Set any weight to 0 to ABLATE that factor and re-run the A/B to invalidate it.
  // A factor with no data drops out and the rest renormalise (no dilution).
  weights: {
    z:           0.22,  // nominal carry             — replicated
    realRate:    0.18,  // real-yield USD bias       — replicated, docs-preferred
    riskOff:     0.15,  // VIX+HY carry-crash gate   — replicated
    coherence:   0.12,  // cross-asset agreement     — docs-central (overlaps aligns)
    positioning: 0.08,  // COT extreme the fade opposes — medium
    vel:         0.20,  // approach spike            — internal OOS-proven
    struct:      0.05,  // fib depth                 — folklore, ablate-first
  },
  fibMults:      [0.25, 0.75, 1.25, 1.5, 2.0],          // extension ladder (both sides)
};

// FRED series fetched once per run (pair-independent). All already used elsewhere
// in the platform.
export const RISKOFF_SERIES  = { vix: 'VIXCLS', hy: 'BAMLH0A0HYM2' };
export const REALRATE_SERIES = 'DFII10';   // US 10Y TIPS (real) yield

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

// US 10Y REAL-yield (DFII10) rolling-z → a USD-strength bias, oriented to the pair's
// USD role and the fade → [0,1], 0.5 neutral. Rising real yield = USD bid (the docs'
// real-yield channel). Same shape as zAlignScore but on real, not nominal, rates —
// the literature's preferred read. usdRole: +1 USD is base (USDJPY), −1 USD is quote
// (EURUSD), 0 neither. Returns null (drops out) when the real-yield z is unavailable.
export function realRateAlignScore(realYieldZ, fadeDir, usdRole, { zCap = 3 } = {}) {
  if (!Number.isFinite(realYieldZ) || !usdRole) return null;
  // Does this fade profit from USD strength? LONG a USD-base pair, or SHORT a USD-quote pair.
  const fadeWantsStrongUsd = (usdRole > 0 && fadeDir === 'LONG') || (usdRole < 0 && fadeDir === 'SHORT');
  const usdStrong = realYieldZ > 0;
  const mag    = Math.min(Math.abs(realYieldZ), zCap) / zCap;
  const signed = (fadeWantsStrongUsd === usdStrong ? 1 : -1) * mag;
  return (signed + 1) / 2;
}

// USD role of a pair key → +1 (USD base, e.g. usdjpy), −1 (USD quote, e.g. eurusd), 0.
export function usdRole(pairKey) {
  const k = String(pairKey || '').toLowerCase();
  if (k.startsWith('usd')) return 1;
  if (k.endsWith('usd'))   return -1;
  return 0;
}

// Cross-asset coherence → [0,1]: the fraction of the directional macro lenses that
// AGREE with the fade. Each lens is an align score in [0,1] (>hi = agree, <lo =
// disagree, else abstain). The docs' "coherence → conviction" — high agreement means
// several independent macro reads point the same way. 0.5 when all lenses abstain.
export function coherenceScore(alignScores, { hi = 0.55, lo = 0.45 } = {}) {
  let agree = 0, disagree = 0;
  for (const a of alignScores) {
    if (a == null) continue;
    if (a >= hi) agree++;
    else if (a <= lo) disagree++;
  }
  const tot = agree + disagree;
  return tot > 0 ? agree / tot : 0.5;
}

// COT positioning → [0,1]: boost when the fade OPPOSES a crowded position (the fuel for
// mean reversion), dampen when the fade sides with the crowd. posZ = z of net-spec
// positioning where + = net LONG the pair. Fade SHORT vs crowded long, or fade LONG vs
// crowded short, agrees. Returns null (drops out) when no positioning data.
export function positioningBoostScore(posZ, fadeDir, { zCap = 3 } = {}) {
  if (!Number.isFinite(posZ)) return null;
  const fadeOpposesCrowd = (posZ > 0 && fadeDir === 'SHORT') || (posZ < 0 && fadeDir === 'LONG');
  const mag    = Math.min(Math.abs(posZ), zCap) / zCap;
  const signed = (fadeOpposesCrowd ? 1 : -1) * mag;
  return (signed + 1) / 2;
}

// Weighted composite ∈ [0,1]. Each factor may be a [0,1] score or null; a factor with
// weight 0 (ablated) OR a null value (no data) drops out and the rest renormalise, so
// missing data never biases the score. `factors` keys mirror `weights` keys.
export function compositeConfidence(factors = {}, weights = V2_DEFAULTS.weights) {
  const keys = ['z', 'realRate', 'riskOff', 'coherence', 'positioning', 'vel', 'struct'];
  let num = 0, den = 0;
  for (const k of keys) {
    const w = weights[k] ?? 0;
    const v = factors[k];
    if (w > 0 && v != null) { num += w * v; den += w; }
  }
  return den > 0 ? num / den : 0;
}

// ── Event veto (hard gate — never fade into a scheduled print) ────────────────────
// NFP = first Friday of the month (deterministic, no feed). FOMC/CPI dates are passed
// in as a list. eventVetoActive → true means SKIP every trade that day.
export function isNfpFriday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.getUTCDay() === 5 && d.getUTCDate() <= 7;
}
export function eventVetoActive(dateStr, extraDates = []) {
  return isNfpFriday(dateStr) || (Array.isArray(extraDates) && extraDates.includes(dateStr));
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
