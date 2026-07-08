/**
 * Forecast Feature Scan (Phase 2) — the "hidden relationships" + day-type layer.
 *
 * Consumes the per-day rows that volForecastResearchEngine already builds (but
 * only aggregated away before). For ONE pair it answers:
 *
 *   • Which conditions KNOWN BEFORE THE DAY predict forecast quality / a big miss?
 *     (Q8 "what do the misses share", the hidden-relationship search.) Only causal
 *     predictors — regime, forecast-time vol/vov, trailing climatology, recent-vs-
 *     baseline realized range, and yesterday's outcome — never same-day realized
 *     features (efficiency, direction), which would be lookahead.
 *   • Can days be clustered into a few recurring volatility "day-types"? (k-means on
 *     the day's realized signature: completion, efficiency, miss size.)
 *
 * Pure, deterministic (seeded k-means), synthetic-testable. Row shape in, compact
 * scan out — no network, no DOM. Honest scope: correlation ≠ predictive edge, and
 * these are HYPOTHESES; the cross-pair layer decides which replicate across pairs.
 */

// ── Small pure stats ──────────────────────────────────────────────────────────
const _mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
function _rank(a) {                                   // fractional (tie-averaged) ranks
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
  const r = new Array(a.length);
  for (let i = 0; i < idx.length;) { let j = i; while (j < idx.length && idx[j][0] === idx[i][0]) j++; const avg = (i + j - 1) / 2 + 1; for (let k = i; k < j; k++) r[idx[k][1]] = avg; i = j; }
  return r;
}
function _pearson(xs, ys) {
  const n = xs.length; if (n < 3) return 0;
  const mx = _mean(xs), my = _mean(ys); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}
// Spearman = Pearson on ranks — robust to the fat tails these features have.
function _spearman(xs, ys) { return +_pearson(_rank(xs), _rank(ys)).toFixed(3); }
function mulberry32(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// Causal predictors — each KNOWN at the day's open (no realized-outcome leakage).
const PREDICTORS = [
  { key: 'volAnnual',    label: 'Annualised vol (forecast-time)' },
  { key: 'vov',          label: 'Vol-of-vol (forecast-time)' },
  { key: 'climHl',       label: 'Trailing climatology H-L' },
  { key: 'regimeRange',  label: 'In a RANGE regime' },
  { key: 'recentVsBase', label: 'Recent vs baseline range (5d÷20d)' },
  { key: 'prevCompletion', label: "Yesterday's completion %" },
  { key: 'prevBigMiss',  label: 'Yesterday was a big miss' },
];

// Build causal day records from the engine's rows (daily H-L component).
// sessionByDate (optional): Map/obj date → { asia:{hlPct}, london:{hlPct}, ny:{hlPct} }
// from dailySessionContributions — joined for the WITHIN-DAY session block only.
function _records(rows, sessionByDate = null) {
  const sget = sessionByDate instanceof Map ? d => sessionByDate.get(d) : d => sessionByDate?.[d];
  const recs = [];
  const hlHist = [];                                  // realized daily H-L, in order
  let prev = null;
  for (const r of rows) {
    const hl = r.comp?.daily?.hl;
    if (!hl || !(hl.med > 0)) { prev = null; continue; }
    const completion = hl.actual / hl.med * 100;
    const absPctErr = Math.abs(hl.actual - hl.med) / hl.med * 100;
    const bigMiss = absPctErr > 50 ? 1 : 0;
    const recent = hlHist.slice(-5), base = hlHist.slice(-20);
    const recentVsBase = (base.length >= 10 && _mean(base) > 0) ? _mean(recent) / _mean(base) : null;
    const sd = sessionByDate ? sget(r.date) : null;
    recs.push({
      date: r.date,
      // predictors (causal)
      volAnnual: r.volAnnual ?? null, vov: r.vov ?? null, climHl: r.climHl ?? null,
      regimeRange: r.regime === 'RANGE' ? 1 : 0,
      recentVsBase,
      prevCompletion: prev ? prev.completion : null,
      prevBigMiss: prev ? prev.bigMiss : null,
      // WITHIN-DAY session shares (end-of-day decomposition — descriptive, NOT pre-open)
      asiaPct: sd?.asia?.hlPct ?? null, londonPct: sd?.london?.hlPct ?? null, nyPct: sd?.ny?.hlPct ?? null,
      // targets (realized outcome of the day)
      completion, absPctErr, bigMiss,
      efficiency: r.efficiency ?? null,
    });
    prev = { completion, bigMiss };
    hlHist.push(hl.actual);
  }
  return recs;
}

// Within-day session predictors — deliberately SEPARATE from the causal set,
// because session shares are known only at end of day (they characterise miss
// days, they don't predict them at the open).
const SESSION_PREDICTORS = [
  { key: 'asiaPct',        label: 'Asia share of daily range' },
  { key: 'londonPct',      label: 'London share of daily range' },
  { key: 'nyPct',          label: 'New York share of daily range' },
  { key: 'asiaMinusLondon', label: 'Asia − London share' },
];

// ── Public: scan one pair's rows ──────────────────────────────────────────────
export function scanFeatures(rows, opts = {}) {
  const { minDays = 150, k = 4, seed = 7, sessionByDate = null } = opts;
  const recs = _records(rows || [], sessionByDate);
  if (recs.length < minDays) return { insufficient: true, nDays: recs.length };

  // Correlations: each causal predictor vs miss size (absPctErr) and completion.
  const correlations = PREDICTORS.map(p => {
    const paired = recs.map(r => [r[p.key], r.absPctErr, r.completion]).filter(t => t[0] != null && isFinite(t[0]));
    if (paired.length < minDays) return { key: p.key, label: p.label, n: paired.length, rhoAbsErr: null, rhoCompletion: null };
    const xs = paired.map(t => t[0]);
    return {
      key: p.key, label: p.label, n: paired.length,
      rhoAbsErr: _spearman(xs, paired.map(t => t[1])),        // +ve ⇒ higher predictor → bigger miss
      rhoCompletion: _spearman(xs, paired.map(t => t[2])),    // +ve ⇒ higher predictor → fuller day
    };
  });
  // Feature importance = |correlation with miss size|, ranked.
  const importance = correlations.filter(c => c.rhoAbsErr != null)
    .map(c => ({ key: c.key, label: c.label, absRho: +Math.abs(c.rhoAbsErr).toFixed(3), rho: c.rhoAbsErr }))
    .sort((a, b) => b.absRho - a.absRho);

  // Miss profile: how do predictors differ on big-miss vs normal days?
  const miss = recs.filter(r => r.bigMiss), norm = recs.filter(r => !r.bigMiss);
  const missProfile = {
    bigMissRatePct: +(recs.length ? miss.length / recs.length * 100 : 0).toFixed(1),
    n: recs.length,
    features: PREDICTORS.map(p => {
      const mv = miss.map(r => r[p.key]).filter(v => v != null), nv = norm.map(r => r[p.key]).filter(v => v != null);
      if (!mv.length || !nv.length) return { key: p.key, label: p.label, onMiss: null, onNormal: null };
      return { key: p.key, label: p.label, onMiss: +_mean(mv).toFixed(3), onNormal: +_mean(nv).toFixed(3) };
    }),
  };

  // Day-type clusters (k-means on standardized realized signature).
  const dayTypes = _cluster(recs, k, seed);

  // Within-day session relationships (Phase 2b) — only when session data joined.
  let sessionRelationships = null;
  if (sessionByDate) {
    const withSess = recs.filter(r => r.asiaPct != null && r.londonPct != null);
    for (const r of withSess) r.asiaMinusLondon = r.asiaPct - r.londonPct;
    if (withSess.length >= minDays) {
      sessionRelationships = {
        nDays: withSess.length, note: 'within-day (session shares are end-of-day; descriptive, not a pre-open predictor)',
        correlations: SESSION_PREDICTORS.map(p => {
          const xs = withSess.map(r => r[p.key]).filter(v => v != null);
          if (xs.length < minDays) return { key: p.key, label: p.label, n: xs.length, rhoAbsErr: null, rhoCompletion: null };
          return { key: p.key, label: p.label, n: withSess.length,
            rhoAbsErr: _spearman(withSess.map(r => r[p.key]), withSess.map(r => r.absPctErr)),
            rhoCompletion: _spearman(withSess.map(r => r[p.key]), withSess.map(r => r.completion)) };
        }),
      };
    }
  }

  return { nDays: recs.length, correlations, importance, missProfile, dayTypes, sessionRelationships };
}

// ── k-means on [completion, efficiency, absPctErr] (standardized), seeded ──────
function _cluster(recs, k, seed) {
  const feats = recs.filter(r => r.efficiency != null).map(r => ({ r, x: [Math.min(r.completion, 250), r.efficiency * 100, Math.min(r.absPctErr, 150)] }));
  if (feats.length < k * 10) return { insufficient: true };
  const dim = 3;
  const mean = Array.from({ length: dim }, (_, d) => _mean(feats.map(f => f.x[d])));
  const std = Array.from({ length: dim }, (_, d) => { const m = mean[d]; const v = _mean(feats.map(f => (f.x[d] - m) ** 2)); return Math.sqrt(v) || 1; });
  const z = feats.map(f => f.x.map((v, d) => (v - mean[d]) / std[d]));
  const rnd = mulberry32(seed);
  let cent = Array.from({ length: k }, () => z[Math.floor(rnd() * z.length)].slice());
  const assign = new Array(z.length).fill(0);
  for (let iter = 0; iter < 25; iter++) {
    let moved = false;
    for (let i = 0; i < z.length; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) { let d = 0; for (let j = 0; j < dim; j++) { const e = z[i][j] - cent[c][j]; d += e * e; } if (d < bd) { bd = d; best = c; } }
      if (assign[i] !== best) { assign[i] = best; moved = true; }
    }
    for (let c = 0; c < k; c++) { const members = z.filter((_, i) => assign[i] === c); if (!members.length) continue; for (let j = 0; j < dim; j++) cent[c][j] = _mean(members.map(m => m[j])); }
    if (!moved) break;
  }
  // Summarise each cluster in ORIGINAL units + label by its centroid.
  const clusters = [];
  for (let c = 0; c < k; c++) {
    const members = feats.filter((_, i) => assign[i] === c);
    if (!members.length) continue;
    const comp = _mean(members.map(m => m.r.completion)), eff = _mean(members.map(m => m.r.efficiency)), ae = _mean(members.map(m => m.r.absPctErr));
    clusters.push({
      n: members.length, sharePct: +(members.length / feats.length * 100).toFixed(1),
      meanCompletion: +comp.toFixed(0), meanEfficiency: +eff.toFixed(2), meanAbsErr: +ae.toFixed(0),
      label: _dayTypeLabel(comp, eff),
    });
  }
  clusters.sort((a, b) => b.sharePct - a.sharePct);
  return { k, n: feats.length, clusters };
}
function _dayTypeLabel(completion, efficiency) {
  const big = completion >= 110, small = completion <= 70, trend = efficiency >= 0.55, chop = efficiency <= 0.35;
  if (big && trend) return 'trend expansion';
  if (big && chop) return 'wide but two-sided (whippy)';
  if (small && chop) return 'quiet & range-bound';
  if (small && trend) return 'small directional drift';
  if (trend) return 'directional';
  if (chop) return 'choppy in-range';
  return 'mid / mixed';
}

export { PREDICTORS };
