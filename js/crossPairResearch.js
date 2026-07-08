/**
 * Cross-Pair Forecast-Behaviour Research (the "trend spotter") — Phase 1.
 *
 * Reads the ALREADY-OUTPUT per-pair research JSON (vfr_research + optionally
 * intraday_research) and synthesises it ACROSS pairs. It answers the questions
 * the per-pair book can't:
 *
 *   A. Cross-pair CONSISTENCY — is a pattern robust across pairs of different
 *      TYPES, or just pair-specific noise? (sign test vs Binomial(n,½), then
 *      Benjamini–Hochberg across metrics, plus a type-spread requirement).
 *   B. OUTLIER discounting → trust tiers (trade / caution / exclude), via robust
 *      z-scores (median/MAD) so one broken pair doesn't move the bar. This is the
 *      "USDCHF is bad → don't trade it" answer, made rule-based.
 *   C. PAIR-TYPE grouping (major / eur-cross / jpy-cross / other-cross / gold /
 *      index) — does forecast quality cluster by instrument type?
 *   D. A composite forecast-RELIABILITY score (0–100) → the ranking of which
 *      pairs the expectation model is actually good at.
 *
 * It does NOT re-run the heavy engines and does NOT optimise a strategy — it is a
 * research/understanding layer. Pure + synthetic-testable: per-pair JSON in,
 * cross-pair report out. No network, no DOM.
 *
 * Honest boundaries (see CROSS_PAIR_RESEARCH_DESIGN.md §4): works on the persisted
 * AGGREGATES; the correlation / feature-importance / clustering scan needs the
 * per-day rows (a Phase-2 export), and session-contribution accuracy + macro/news
 * conditioning need data the current JSON doesn't carry.
 */

// ── Pair-type classification ──────────────────────────────────────────────────
const MAJORS = new Set(['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF']);
const INDICES = new Set(['NQ', 'SPX500', 'US30', 'DE30', 'UK100', 'NAS100']);
export function pairType(name) {
  const n = String(name || '').toUpperCase();
  if (n === 'GOLD' || n === 'XAUUSD' || n === 'XAU_USD') return 'gold';
  if (INDICES.has(n)) return 'index';
  if (MAJORS.has(n)) return 'major';
  if (n.includes('JPY')) return 'jpy_cross';          // non-USD JPY crosses
  if (n.startsWith('EUR')) return 'eur_cross';
  return 'other_cross';
}
export const PAIR_TYPE_LABELS = {
  major: 'FX majors', eur_cross: 'EUR crosses', jpy_cross: 'JPY crosses',
  other_cross: 'Other crosses', gold: 'Gold', index: 'Indices',
};

// ── Small pure stats ──────────────────────────────────────────────────────────
const _mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const _median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const _mad = a => { const m = _median(a); if (m == null) return null; return _median(a.map(v => Math.abs(v - m))) * 1.4826; };
function _robustZ(v, arr) { const m = _median(arr), s = _mad(arr); if (m == null || !s) return 0; return (v - m) / s; }
// Percentile rank in [0,1]: fraction below + half the ties (so it's a true rank, not min/max scaling).
function _pctRank(v, arr) { if (!arr.length) return 0.5; let lt = 0, eq = 0; for (const x of arr) { if (x < v) lt++; else if (x === v) eq++; } return (lt + 0.5 * eq) / arr.length; }
function _choose(n, k) { if (k < 0 || k > n) return 0; k = Math.min(k, n - k); let c = 1; for (let i = 0; i < k; i++) c = c * (n - i) / (i + 1); return c; }
// Two-sided sign-test p-value: P(#successes ≥ max(k,n−k) or ≤ min) under p=½.
export function signTestP(n, k) {
  if (n === 0) return 1;
  const kk = Math.max(k, n - k);
  let tail = 0; for (let i = kk; i <= n; i++) tail += _choose(n, i);
  return Math.min(1, 2 * tail * Math.pow(0.5, n));
}
// Benjamini–Hochberg: returns a Set of indices significant at FDR q (monotone).
function _bhSignificant(pvals, q = 0.10) {
  const m = pvals.length; if (!m) return new Set();
  const order = pvals.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  let maxRank = -1;
  for (let r = 0; r < m; r++) if (order[r].p <= ((r + 1) / m) * q) maxRank = r;
  const sig = new Set();
  for (let r = 0; r <= maxRank; r++) sig.add(order[r].i);
  return sig;
}

// ── Metric specs ──────────────────────────────────────────────────────────────
// QUALITY: feed the reliability score + outlier detection. `get(rec)` → value|null.
const _hl = s => s?.perComponent?.daily?.hl || null;
const QUALITY = [
  { key: 'sharpness', label: 'Sharpness (forecast↔realized corr)', betterHigh: true,  get: r => _hl(r.s)?.sharpnessCorr ?? null },
  { key: 'skill',     label: 'Skill vs climatology',              betterHigh: true,  get: r => r.s?.dailyHlSkillVsClimatology ?? null },
  { key: 'calMed',    label: 'Median-calibration error (|exceed−50|)', betterHigh: false, get: r => { const v = _hl(r.s)?.exceedMedianPct; return v == null ? null : Math.abs(v - 50); } },
  { key: 'cal75',     label: '75th-calibration error (|exceed−25|)',   betterHigh: false, get: r => { const v = _hl(r.s)?.exceed75Pct; return v == null ? null : Math.abs(v - 25); } },
  { key: 'absErr',    label: '|median % error|',                  betterHigh: false, get: r => { const v = r.s?.errorDist?.medianPctErr; return v == null ? null : Math.abs(v); } },
];
// Reliability sub-score groups (transparent weights; lead with calibration+skill).
const RELIABILITY_WEIGHTS = { calibration: 0.30, skill: 0.30, sharpness: 0.25, lowError: 0.15 };

// CONSISTENCY: signed per-pair values; a positive majority means the pattern holds.
const CONSISTENCY = [
  { key: 'calib_dir', q: 2,  label: 'Calibration bias (exceed-median − 50)', get: r => { const v = _hl(r.s)?.exceedMedianPct; return v == null ? null : v - 50; }, pos: 'bands too tight (range under-forecast)', neg: 'bands too wide (range over-forecast)', unit: 'pp' },
  { key: 'skill_pos', q: 1,  label: 'Beats climatology (skill > 0)',        get: r => r.s?.dailyHlSkillVsClimatology ?? null, pos: 'model beats naive', neg: 'model worse than naive', unit: '' },
  { key: 'sharp_pos', q: 1,  label: 'Forecast informative (sharpness > 0)', get: r => _hl(r.s)?.sharpnessCorr ?? null, pos: 'forecast tracks realized', neg: 'forecast uninformative', unit: '' },
  { key: 'vol_clust', q: 9,  label: 'Volatility clusters (after >75th day)', get: r => { const p = r.s?.persistence; return (p && p.n) ? p.afterAbove75Pct - p.baseExceedMedianPct : null; }, pos: 'elevated vol persists next day', neg: 'elevated vol mean-reverts', unit: 'pp' },
  { key: 'dir_skill', q: 14, label: 'Forecast skew predicts direction',     get: r => { const v = r.s?.fcSkewDirHitPct; return v == null ? null : v - 50; }, pos: 'skew predicts the day’s direction', neg: 'skew anti-predicts', unit: 'pp' },
  { key: 'overstate', q: 1,  label: 'Realized vs forecast median (median % err)', get: r => r.s?.errorDist?.medianPctErr ?? null, pos: 'realized exceeds forecast (too low)', neg: 'realized below forecast (too high)', unit: '%' },
  // Intraday (optional — only pairs present in intraday_research contribute).
  { key: 'in_continue', q: 6, label: 'Touched median line continues (intraday)', get: r => { const t = r.in?.daily?.touches?.medianExtension; return (t && t.n) ? t.continuePct - t.reversePct : null; }, pos: 'break-and-go dominates', neg: 'fade dominates at the line', unit: 'pp' },
];

// ── Public: build the cross-pair report ───────────────────────────────────────
// vfr = the vfr_research payload ({ perPair, cross, pairs }); intraday = optional
// intraday_research payload. opts.fdrQ (default 0.10), opts.minPairsForConsistency.
export function analyzeCrossPair(vfr, intraday = null, opts = {}) {
  const { fdrQ = 0.10, minPairsForConsistency = 6, weights = RELIABILITY_WEIGHTS } = opts;
  const perPair = vfr?.perPair || {};
  const inPer = intraday?.perPair || {};
  const names = Object.keys(perPair);
  if (!names.length) return { insufficient: true, nPairs: 0 };

  const recs = names.map(name => ({ name, type: pairType(name), s: perPair[name], in: inPer[name] || null }));

  // ── D. Reliability score (percentile-rank each quality metric within the set) ──
  const colOf = m => recs.map(r => m.get(r)).filter(v => v != null);
  const cols = Object.fromEntries(QUALITY.map(m => [m.key, colOf(m)]));
  const _rank = (m, v) => { if (v == null) return null; const p = _pctRank(v, cols[m.key]); return m.betterHigh ? p : 1 - p; };
  const reliability = recs.map(r => {
    const rk = Object.fromEntries(QUALITY.map(m => [m.key, _rank(m, m.get(r))]));
    const calibration = _mean([rk.calMed, rk.cal75].filter(v => v != null));
    const sub = {
      calibration: +(calibration).toFixed(3),
      skill:       rk.skill == null ? null : +rk.skill.toFixed(3),
      sharpness:   rk.sharpness == null ? null : +rk.sharpness.toFixed(3),
      lowError:    rk.absErr == null ? null : +rk.absErr.toFixed(3),
    };
    let wsum = 0, w = 0;
    for (const [k, wk] of Object.entries(weights)) if (sub[k] != null) { wsum += sub[k] * wk; w += wk; }
    const score = w ? +(100 * wsum / w).toFixed(1) : null;
    return { pair: r.name, type: r.type, score, sub };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  // ── B. Outlier discounting → trust tiers ──
  // Hard exclusion rules (a forecast that fails these is not tradeable), plus a
  // robust-z outlier flag on any quality metric, plus a bottom-tertile catch.
  const scoreByPair = Object.fromEntries(reliability.map(r => [r.pair, r.score]));
  const scores = reliability.map(r => r.score).filter(v => v != null).sort((a, b) => a - b);
  const bottomTertile = scores.length ? scores[Math.floor(scores.length / 3)] : 0;
  const trust = { perPair: {}, trade: [], caution: [], exclude: [] };
  for (const r of recs) {
    const hl = _hl(r.s); const reasons = [];
    const sharp = hl?.sharpnessCorr, skill = r.s?.dailyHlSkillVsClimatology;
    const exMed = hl?.exceedMedianPct;
    let tier = 'trade';
    // Hard exclusions.
    if (sharp != null && sharp <= 0) { tier = 'exclude'; reasons.push(`forecast uninformative (sharpness ${sharp})`); }
    if (skill != null && skill < -0.05) { tier = 'exclude'; reasons.push(`worse than climatology (skill ${skill})`); }
    if (exMed != null && Math.abs(exMed - 50) > 20) { tier = 'exclude'; reasons.push(`badly miscalibrated (exceed-median ${exMed}% vs 50%)`); }
    // Robust-z outlier on any quality metric (only demote, never promote).
    if (tier !== 'exclude') {
      for (const m of QUALITY) {
        const v = m.get(r); if (v == null) continue;
        const z = _robustZ(v, cols[m.key]);
        const bad = m.betterHigh ? z < -3.5 : z > 3.5;
        if (bad) { tier = 'caution'; reasons.push(`outlier on ${m.label} (robust z ${z.toFixed(1)})`); }
      }
      // Bottom-tertile reliability.
      const sc = scoreByPair[r.name];
      if (tier === 'trade' && sc != null && sc <= bottomTertile && scores.length >= 6) { tier = 'caution'; reasons.push(`bottom-tertile reliability (${sc})`); }
    }
    trust.perPair[r.name] = { tier, score: scoreByPair[r.name], reasons };
    trust[tier].push(r.name);
  }

  // ── C. Pair-type profiles ──
  const byType = {};
  for (const t of Object.keys(PAIR_TYPE_LABELS)) {
    const g = recs.filter(r => r.type === t); if (!g.length) continue;
    const sc = g.map(r => scoreByPair[r.name]).filter(v => v != null);
    byType[t] = {
      label: PAIR_TYPE_LABELS[t], n: g.length, pairs: g.map(r => r.name),
      medianReliability: sc.length ? +(_median(sc)).toFixed(1) : null,
      medianSharpness: +( _median(g.map(r => _hl(r.s)?.sharpnessCorr).filter(v => v != null)) ?? 0).toFixed(3),
      medianSkill: +(_median(g.map(r => r.s?.dailyHlSkillVsClimatology).filter(v => v != null)) ?? 0).toFixed(3),
      medianExceedMed: +(_median(g.map(r => _hl(r.s)?.exceedMedianPct).filter(v => v != null)) ?? 0).toFixed(1),
    };
  }

  // ── A. Cross-pair consistency (sign test → BH → type-spread) ──
  const raw = CONSISTENCY.map(m => {
    const vals = recs.map(r => ({ r, v: m.get(r) })).filter(x => x.v != null);
    const nz = vals.filter(x => x.v !== 0);
    const up = nz.filter(x => x.v > 0), down = nz.filter(x => x.v < 0);
    const n = nz.length, k = Math.max(up.length, down.length);
    const majoritySide = up.length >= down.length ? up : down;
    const typeSpread = new Set(majoritySide.map(x => x.r.type)).size;
    const p = n >= 1 ? signTestP(n, k) : 1;
    return {
      key: m.key, question: m.q, label: m.label, unit: m.unit,
      nPairs: n, agree: k, direction: up.length >= down.length ? 'positive' : 'negative',
      meaning: up.length >= down.length ? m.pos : m.neg,
      medianEffect: +(_median(vals.map(x => x.v)) ?? 0).toFixed(2),
      pValue: +p.toFixed(4), typeSpread,
      agreeingPairs: majoritySide.map(x => x.r.name),
    };
  }).filter(x => x.nPairs >= minPairsForConsistency);
  const sig = _bhSignificant(raw.map(x => x.pValue), fdrQ);
  const consistency = raw.map((x, i) => ({ ...x, robust: sig.has(i) && x.typeSpread >= 2 }))
    .sort((a, b) => a.pValue - b.pValue);

  // ── Hypotheses (from robust findings + type differences) — candidates, not rules ──
  const hypotheses = [];
  for (const c of consistency.filter(x => x.robust)) {
    hypotheses.push({ text: `${c.label}: robust across ${c.agree}/${c.nPairs} pairs spanning ${c.typeSpread} types — ${c.meaning}.`, evidence: `sign-test p=${c.pValue}, median effect ${c.medianEffect}${c.unit}`, dataNeeded: 'none (testable now)' });
  }
  // Type dispersion in reliability → is a whole type weak?
  const typeScores = Object.entries(byType).map(([t, v]) => ({ t, s: v.medianReliability })).filter(x => x.s != null);
  if (typeScores.length >= 2) {
    typeScores.sort((a, b) => a.s - b.s);
    const lo = typeScores[0], hi = typeScores.at(-1);
    if (hi.s - lo.s >= 20) hypotheses.push({ text: `Forecast reliability clusters by type: ${PAIR_TYPE_LABELS[hi.t]} (median ${hi.s}) rank well above ${PAIR_TYPE_LABELS[lo.t]} (median ${lo.s}).`, evidence: `${hi.s - lo.s} pt reliability gap`, dataNeeded: 'none (testable now)' });
  }
  hypotheses.push({ text: 'Do hidden day-level relationships (small Asia → bigger errors; recent RV vs long-term RV; variable combinations) predict forecast quality?', evidence: 'not computable from aggregates', dataNeeded: 'per-day rows export (Phase 2)' });

  return {
    nPairs: names.length, pairs: names,
    generatedFrom: { vfrPairs: names.length, intradayPairs: Object.keys(inPer).length },
    fdrQ, weights,
    reliability, trust, byType, consistency, hypotheses,
    notes: [
      'Reliability sub-scores are percentile ranks WITHIN this pair set — relative, not absolute.',
      'Correlated pairs are not independent: within-type agreement is down-weighted via the ≥2-type-spread requirement for "robust".',
      'Session-contribution accuracy and macro/news conditioning are not derivable from the current JSON (see design §4).',
    ],
  };
}
