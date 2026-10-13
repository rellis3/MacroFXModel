/**
 * Global Read — the synthesis layer. Pure: no I/O, no network.
 *
 * WHY THIS EXISTS. The dashboard has ~40 live engines (HMM, macro scorecard,
 * yields, real yields, credit, COT, OI/GEX, vol forecast, IV/σ, desk watch,
 * the chain…). Each one speaks alone, so the reader has to reconcile them by
 * hand, and the engines that shout loudest (direction calls) are the ones the
 * Evidence Book scores as noise. This module reads ALL of them and answers one
 * question: given everything the system knows right now, what is the most
 * probable scenario, what behaviour should each market show, which instruments
 * are clearest, and how strong is the evidence?
 *
 * HOW IT COMBINES (MD files/GLOBAL_DECISION_ENGINE.md §3). Not a vote count.
 *   1. Every input is registered with what it is ALLOWED to answer (state,
 *      range, behaviour or direction), its timing (leading / coincident /
 *      lagging), and its measured evidence (tier, IC or joint coefficient, n).
 *   2. Its weight is predictive value × reliability × freshness:
 *        e_i = P(real | tier) × IC_i × n_eff/(n_eff + K) × fresh_i
 *      An input that tested null has e_i = 0 — it is still READ and shown in
 *      the agreement table (so conflicts are visible), it just cannot move the
 *      forecast. Nothing is dropped by fiat; the evidence sets the weight.
 *   3. Direction: a regression frame on standardised signals with an assumed
 *      family correlation matrix R. β = R⁻¹e, ŷ = βᵀs, R² = eᵀR⁻¹e,
 *      P(up) = Φ(ŷ / √(1−R²)). Correlated inputs do not double-count; inputs
 *      that disagree cancel; a lone weak input stays near 50%.
 *   4. Range: the JOINT coefficients of forge/COMBINED_RANGE_PREREG.md (fitted
 *      together, so their overlap is already netted out), applied to the
 *      fitted ladder; P(H-L > p75) from the ladder's own dispersion.
 *   5. State: five coincident axes (risk, USD, rates, vol, credit), each with
 *      the agreement of the inputs that measure it. State is description, not
 *      forecast; it drives the scenario text and the invalidation list.
 *
 * Tested by js/globalReadCore.test.mjs. Driven live by scripts/global_read.mjs.
 */

// ── 1. Evidence tiers → probability the measured effect is real ─────────────
// From MD files/TRIAL_LEDGER.md: 35 single-test passes of 115, ~6 expected by
// luck → P(real | one OOS pass) ≈ 0.83, rounded down. A second independent test
// (or a forward record) → 0.95. A descriptive split that was never
// pre-registered → 0.25. A banked null, or never tested → 0.
export const TIER_P = { confirmed: 0.95, validated: 0.80, descriptive: 0.25, null: 0, untested: 0 };
export const SHRINK_K = 30;                     // n_eff/(n_eff+K): 30 effective obs = half weight

// Family correlation for direction inputs (assumed, see §3.3 of the design doc):
// two inputs of the same family share most of their information.
export const RHO_SAME = 0.5, RHO_CROSS = 0.15;

// ── 2. The registry: every input, and what it is allowed to do ─────────────
// question: 'direction' | 'range' | 'state'.  timing: leading | coincident | lagging.
// ic is a correlation-scale measure of predictive value at the stated horizon.
// For hit-rate evidence, ic ≈ 2·(hit − 0.5).
export const REGISTRY = [
  // direction — the only two with banked out-of-sample evidence
  { id: 'yield-spread', label: '2Y yield-spread sleeve', family: 'rates-rv', question: 'direction', timing: 'leading', horizon: 'weeks',
    tier: 'confirmed', ic: 0.26, n: 868, evidence: 'yield-spread-sleeve + ys-long-confirm (1976-2014, PF 1.28)' },
  { id: 'post-fomc', label: 'Post-FOMC USD drift', family: 'events', question: 'direction', timing: 'leading', horizon: '5 sessions',
    tier: 'validated', ic: 0.30, n: 81, evidence: 'post-fomc-usd-drift (65% positive, n=81, not yet forward-proven)' },
  // direction — descriptive: measured, but never pre-registered; overlapping windows
  { id: 'macro-regime-fx', label: 'Macro regime → FX (20d)', family: 'macro-state', question: 'direction', timing: 'lagging', horizon: '20 sessions',
    tier: 'descriptive', ic: null, n: null, evidence: '/api/macro-regime-fx study (OOS split, but n_eff is tiny)' },
  // direction — read and shown, weight 0 by evidence
  { id: 'lean', label: 'Page lean (direction tag)', family: 'price-state', question: 'direction', timing: 'coincident', horizon: '1-5 sessions',
    tier: 'null', ic: 0, evidence: 'pair ledger forward record: h1 41% [35,48], h5 47%' },
  { id: 'hmm-trend', label: 'HMM trend direction', family: 'price-state', question: 'direction', timing: 'coincident', horizon: 'days',
    tier: 'untested', ic: 0, evidence: 'no banked test of trendDir' },
  { id: 'trend', label: '12m trend basket', family: 'price-state', question: 'direction', timing: 'lagging', horizon: 'months',
    tier: 'null', ic: 0, evidence: 'trend-following-fx (null)' },
  { id: 'macro-score', label: 'Macro scorecard', family: 'macro-state', question: 'direction', timing: 'lagging', horizon: 'weeks',
    tier: 'null', ic: 0, evidence: 'macro-direction, analogue-weeks, regime-divergence-fx (null)' },
  { id: 'cb-tone', label: 'Central-bank tone', family: 'events', question: 'direction', timing: 'lagging', horizon: 'days',
    tier: 'null', ic: 0, evidence: 'cb-tone-direction (t 0.32)' },
  { id: 'cot', label: 'COT positioning', family: 'positioning', question: 'direction', timing: 'lagging', horizon: 'weeks',
    tier: 'null', ic: 0, evidence: 'crowded-bond-short-fomc, squeeze-fuel (null)' },
  { id: 'oi-walls', label: 'OI walls / max pain', family: 'positioning', question: 'direction', timing: 'coincident', horizon: 'session',
    tier: 'null', ic: 0, evidence: 'oi-max-pain, wall-placebo (null)' },
  // range — joint coefficients (forge/COMBINED_RANGE_PREREG.md, test pinball 0.90 / 0.94)
  { id: 'iv-sigma', label: 'IV ÷ σ', family: 'vol-surface', question: 'range', timing: 'leading', tier: 'validated', evidence: 'combined-range, iv-ladder, iv-forecast' },
  { id: 'vix-term', label: 'VIX curve (inversion / front)', family: 'vol-surface', question: 'range', timing: 'leading', tier: 'confirmed', evidence: 'vix-inversion + mv-vixterm-range, vol-curve-front' },
  { id: 'nq-dw', label: 'Nasdaq down-week', family: 'equity-stress', question: 'range', timing: 'leading', tier: 'confirmed', evidence: 'nq-down-week + us-extras-confirm' },
  { id: 'all-down', label: 'All six indices down', family: 'equity-stress', question: 'range', timing: 'leading', tier: 'validated', evidence: 'breadth-all-down' },
  { id: 'gex', label: 'Net GEX sign (NQ)', family: 'positioning', question: 'range', timing: 'leading', tier: 'validated', evidence: 'gex-range (NQ only)' },
  { id: 'event', label: 'Scheduled event size', family: 'events', question: 'range', timing: 'leading', tier: 'validated', evidence: 'event-impact-map, surprise-size' },
];
const REG = Object.fromEntries(REGISTRY.map(r => [r.id, r]));

// Joint range multipliers, by class (analysis/output/combined_range/RESULTS.md).
// The fit is σ_adj = σ × exp(xβ − mean_train(xβ)), features centred within
// instrument, so a binary flag contributes mult^(flag − freq) where freq is its
// test-period frequency, and IV÷σ contributes (ratio ÷ centre)^iv_exp where the
// centre is the instrument's typical ratio (geometric mid of its tercile edges).
// iv_exp: ×2.01 per +1 log for indices → ln 2.01 = 0.698; ×2.20 for FX+gold → 0.788.
export const RANGE_COEF = {
  index: { iv_exp: Math.log(2.01), vix_inv: [1.106, 0.053], front_dear: [1.074, 0.349], front_calm: [0.885, 0.300], all_down: [1.034, 0.188], nq_dw: [1.116, 0.278] },
  fx:    { iv_exp: Math.log(2.195), vix_inv: [1.014, 0.054], front_dear: [1.021, 0.330], front_calm: [0.918, 0.317], all_down: [1.027, 0.178], nq_dw: [1.0, 0.26] },
};
export const GEX_SHORT_NQ = 1.176;              // gex-range: short gamma +0.176 ATR next day (NQ only)
const INDEX = new Set(['NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100']);
export const classOf = sym => (INDEX.has(sym) ? 'index' : 'fx');

// ── small maths ─────────────────────────────────────────────────────────────
export function normCdf(x) {                     // Abramowitz-Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r2 = x => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const r3 = x => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);

// Solve A x = b (small dense, Gaussian elimination with partial pivoting).
export function solve(A, b) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) return null;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((row, i) => row[n] / M[i][i]);
}

// ── 3. Weight of one input ──────────────────────────────────────────────────
// fresh: 1 when inside its cadence, decays linearly to 0 at 3× cadence.
export function freshness(ageDays, cadenceDays = 1) {
  if (ageDays == null || !Number.isFinite(ageDays)) return 0;
  const c = Math.max(cadenceDays, 0.04);
  if (ageDays <= c) return 1;
  return clamp(1 - (ageDays - c) / (2 * c), 0, 1);
}
export function effectiveIc({ tier, ic, n_eff }, fresh = 1) {
  const p = TIER_P[tier] ?? 0;
  if (!p || !ic) return 0;
  const shrink = n_eff == null ? 1 : n_eff / (n_eff + SHRINK_K);
  return p * ic * shrink * fresh;
}

// ── 4. Direction: correlation-aware combination ─────────────────────────────
// signals: [{ id, family, s (−1…+1, activation × sign), e (effective IC) }]
// Returns P(up), the R², the per-signal β, and an agreement index that counts
// only inputs with weight (so a null that disagrees is shown, not counted).
export function combineDirection(signals) {
  const live = signals.filter(x => x.e > 0 && x.s !== 0);
  const shown = signals.map(x => ({ id: x.id, family: x.family, s: r2(x.s), e: r3(x.e) }));
  if (!live.length) return { pUp: 0.5, r2: 0, yhat: 0, beta: [], agreement: null, nLive: 0, shown };
  const R = live.map(a => live.map(b => (a === b ? 1 : a.family === b.family ? RHO_SAME : RHO_CROSS)));
  const e = live.map(x => x.e), s = live.map(x => x.s);
  const beta = solve(R, e) ?? e;
  const yhat = beta.reduce((a, b, i) => a + b * s[i], 0);
  const R2 = clamp(beta.reduce((a, b, i) => a + b * e[i], 0), 0, 0.95);
  const pUp = normCdf(yhat / Math.sqrt(1 - R2));
  const num = live.reduce((a, x) => a + x.e * x.s, 0), den = live.reduce((a, x) => a + x.e * Math.abs(x.s), 0);
  return { pUp: r3(pUp), r2: r3(R2), yhat: r3(yhat), beta: live.map((x, i) => ({ id: x.id, beta: r3(beta[i]) })),
    agreement: den && live.length > 1 ? r2(num / den) : null, nLive: live.length, shown };
}

// ── 5. Range: joint multiplier on the fitted ladder, and P(H-L > p75) ───────
// row: one daily-read row { sym, ratio (IV/σ), edges ([lo,hi] tercile cuts), lines:{hl_p50,hl_p75} }
// flags: { vixInv, frontDear, frontCalm, allDown, nqDownWeek, gexShortNq }
export function rangeView(row, flags = {}) {
  const cls = classOf(row.sym), C = RANGE_COEF[cls];
  const drivers = []; let m = 1;
  const add = (id, mult, why) => { if (mult && Math.abs(mult - 1) > 0.001) { m *= mult; drivers.push({ id, mult: r3(mult), why }); } };
  const flag = (id, key, on, why) => { if (on == null) return; const [mu, freq] = C[key]; add(id, Math.pow(mu, (on ? 1 : 0) - freq), on ? why : `not ${why}`); };
  if (Number.isFinite(row.ratio) && row.ratio > 0) {
    const centre = Array.isArray(row.edges) && row.edges.length === 2 ? Math.sqrt(row.edges[0] * row.edges[1]) : 1;
    add('iv-sigma', Math.pow(row.ratio / centre, C.iv_exp), `IV÷σ ${r2(row.ratio)} vs its usual ${r2(centre)}`);
  }
  flag('vix-term', 'vix_inv', flags.vixInv, 'VIX ≥ VIX3M');
  flag('vix-term', 'front_dear', flags.frontDear, 'front of the VIX curve dear');
  flag('vix-term', 'front_calm', flags.frontCalm, 'front of the VIX curve calm');
  flag('all-down', 'all_down', flags.allDown, 'all six indices closed down');
  if (cls === 'index') flag('nq-dw', 'nq_dw', flags.nqDownWeek, 'NAS100 down ≥1% on the week');
  if (flags.gexShortNq && row.sym === 'NQ') add('gex', GEX_SHORT_NQ, 'NQ dealers short gamma');
  // The ladder's lines already carry the event multiplier (forecastLadder.buildLadder), so it is not re-applied.
  const p50 = row.lines?.hl_p50, p75 = row.lines?.hl_p75;
  let pAbove75 = null;
  if (p50 > 0 && p75 > p50) {
    const sd = Math.log(p75 / p50) / 0.6745;   // the ladder's own log-dispersion
    pAbove75 = 1 - normCdf(0.6745 - Math.log(m) / sd);
  }
  return { sym: row.sym, cls, mult: r3(m), hlP50: p50 ?? null, expectedHl: p50 ? r3(p50 * m) : null, pAbove75: r3(pAbove75), drivers };
}

// Behaviour from the range view (and the validated intraday rules, as text).
// Day-level continuation vs reversal is a banked null (S7a 49.0%), so the engine
// never labels a DAY continuation/reversal — it labels the RANGE regime and hands
// the intraday continuation/reversal question to the hourly rules.
export function behaviourOf(rv, { tag = null, hmmRange = null } = {}) {
  const p = rv.pAbove75;
  if (p == null) return { label: 'unknown', why: 'no ladder for this instrument' };
  if (p >= 0.32) return { label: 'expansion', why: `P(range beyond p75) ${Math.round(p * 100)}% vs 25% normal: breaks of p50/p75 tend to run; follow, do not fade` };
  if (p <= 0.18) return { label: tag === 'exhaust' ? 'exhaustion (capped)' : 'contained', why: `P(range beyond p75) ${Math.round(p * 100)}%: p75/p90 act as caps; take profit at lines, do not chase breaks` };
  return { label: hmmRange ? 'two-way, low variance' : 'two-way', why: `P(range beyond p75) ${Math.round(p * 100)}%, near the 25% design rate: no edge at a touch either way` };
}

// ── 6. State axes (coincident description, with within-axis agreement) ─────
// obs: normalised readings (see scripts/global_read.mjs). Each input votes
// −1…+1 on its axis; the axis reports the mean and how many agree.
export function stateAxes(o = {}) {
  const ax = {};
  const put = (axis, id, v, text) => { if (v == null || !Number.isFinite(v)) return; (ax[axis] ??= []).push({ id, v: clamp(v, -1, 1), text }); };
  // risk appetite (+ = risk-on)
  if (o.crossAssetRiskOnShare != null) put('risk', 'cross-asset sides', (o.crossAssetRiskOnShare - 0.5) * 2, `${Math.round(o.crossAssetRiskOnShare * 100)}% of markets on the risk-on side (20d)`);
  if (o.vix != null && o.vix3m != null) put('risk', 'VIX term', clamp((o.vix3m - o.vix) / 4, -1, 1), `VIX ${o.vix} vs VIX3M ${o.vix3m}`);
  if (o.hy20dBp != null) put('risk', 'HY 20d', clamp(-o.hy20dBp / 50, -1, 1), `HY ${o.hy20dBp > 0 ? '+' : ''}${o.hy20dBp}bp over 20d`);
  if (o.stockBondCorr != null) put('risk', 'stock-bond corr', clamp(-o.stockBondCorr, -1, 1) * 0.5, `SPY/TLT 20d corr ${r2(o.stockBondCorr)} (positive = bonds not hedging)`);
  // USD (+ = stronger)
  if (o.dxy20dPct != null) put('usd', 'broad dollar 20d', clamp(o.dxy20dPct / 2.5, -1, 1), `broad dollar ${o.dxy20dPct > 0 ? '+' : ''}${o.dxy20dPct}% over 20d`);
  if (o.usdMove20Pct != null) put('usd', 'USD factor 20d', clamp(o.usdMove20Pct / 2, -1, 1), `USD factor ${o.usdMove20Pct > 0 ? '+' : ''}${o.usdMove20Pct}% over 20d`);
  // rates (+ = tightening / higher real yields)
  if (o.us10y20dBp != null) put('rates', 'US10Y 20d', clamp(o.us10y20dBp / 30, -1, 1), `10Y ${o.us10y20dBp > 0 ? '+' : ''}${o.us10y20dBp}bp over 20d`);
  if (o.real20dBp != null) put('rates', 'real 10Y 20d', clamp(o.real20dBp / 30, -1, 1), `real 10Y ${o.real20dBp > 0 ? '+' : ''}${o.real20dBp}bp over 20d`);
  if (o.hikesPriced != null) put('rates', 'policy priced', clamp(o.hikesPriced / 3, -1, 1), `${o.hikesPriced} moves priced (${o.hikesDir ?? '?'})`);
  // vol (+ = high vol)
  if (o.medianVolPctIdx != null) put('vol', 'index vol pctile', (o.medianVolPctIdx - 50) / 50, `index realised-vol percentile ${o.medianVolPctIdx}`);
  if (o.medianVolPctFx != null) put('vol', 'FX vol pctile', (o.medianVolPctFx - 50) / 50, `FX realised-vol percentile ${o.medianVolPctFx}`);
  if (o.frontState) put('vol', 'VIX front', o.frontState === 'dear' ? 0.8 : o.frontState === 'calm' ? -0.8 : 0, `VIX front ${o.frontState}`);
  // credit / liquidity (+ = stress)
  if (o.hy20dBp != null) put('credit', 'HY 20d', clamp(o.hy20dBp / 50, -1, 1), `HY ${o.hy20dBp > 0 ? '+' : ''}${o.hy20dBp}bp over 20d`);
  if (o.csi != null) put('credit', 'credit stress index', clamp(-o.csi / 2, -1, 1), `credit-stress composite ${o.csi}`);
  if (o.liquidityBlocked != null) put('credit', 'liquidity gate', o.liquidityBlocked ? 0.6 : -0.3, o.liquidityBlocked ? 'index liquidity gate BLOCKED' : 'liquidity gate open');

  const out = {};
  for (const [k, xs] of Object.entries(ax)) {
    const mean = xs.reduce((a, x) => a + x.v, 0) / xs.length;
    const sgn = Math.sign(mean);
    const agree = xs.filter(x => Math.sign(x.v) === sgn && Math.abs(x.v) > 0.1).length;
    out[k] = { score: r2(mean), agree: `${agree}/${xs.length}`, inputs: xs.map(x => ({ ...x, v: r2(x.v) })) };
  }
  return out;
}

export function environmentLabel(ax) {
  const g = k => ax[k]?.score ?? 0;
  const parts = [];
  if (g('rates') > 0.4 && g('usd') > 0.3) parts.push('real-rate dollar regime');
  else if (g('rates') < -0.4 && g('usd') < -0.3) parts.push('easing-rates, softer dollar');
  else if (g('usd') > 0.4) parts.push('dollar-led'); else if (g('usd') < -0.4) parts.push('dollar-weak');
  parts.push(g('vol') < -0.3 ? 'compressed volatility' : g('vol') > 0.3 ? 'elevated volatility' : 'normal volatility');
  if (g('credit') > 0.3 && g('vol') < 0) parts.push('credit widening under a calm tape');
  else if (g('credit') > 0.3) parts.push('credit stress');
  parts.push(g('risk') > 0.25 ? 'risk-on' : g('risk') < -0.25 ? 'risk-off' : 'mixed risk appetite');
  return parts.join(' · ');
}

// ── 7. Data quality: stale, dead, contradictory ─────────────────────────────
export function dataQuality({ health = [], checks = [] } = {}) {
  const bad = health.filter(h => ['dead', 'stale', 'lagging'].includes(h.state)).map(h => ({ id: h.id, state: h.state, why: h.why ?? null }));
  const issues = checks.filter(c => c && c.problem);
  const score = clamp(1 - 0.05 * bad.filter(b => b.state !== 'lagging').length - 0.02 * bad.filter(b => b.state === 'lagging').length - 0.04 * issues.length, 0, 1);
  return { score: r2(score), feeds: bad, issues };
}

// ── 8. One instrument's card ────────────────────────────────────────────────
export function instrumentCard(sym, { row, flags, dirSignals = [], tag, hmmRange, fresh = 1 }) {
  const rv = row ? rangeView(row, flags) : null;
  const bh = rv ? behaviourOf(rv, { tag, hmmRange }) : { label: 'unknown', why: 'no IV/σ row' };
  const dir = combineDirection(dirSignals);
  // Clarity: how far today's forecast sits from "normal day, coin-flip direction".
  const rangeEdge = rv?.pAbove75 == null ? 0 : Math.abs(rv.pAbove75 - 0.25) / 0.25;   // 0 = normal day
  const dirEdge = Math.abs(dir.pUp - 0.5) * 2;                                       // 0 = coin flip
  const clarity = r2(fresh * Math.max(rangeEdge * TIER_P.validated, dirEdge * 3));    // a 55/45 call ≈ a 30%-off range call
  const dirLabel = dir.nLive === 0 ? 'no tested directional input is active'
    : Math.abs(dir.pUp - 0.5) < 0.04 ? `active inputs net to ~50/50${dir.agreement == null ? ' (one weak input)' : ` (agreement ${dir.agreement})`}`
    : `${dir.pUp > 0.5 ? 'UP' : 'DOWN'} ${Math.round(Math.max(dir.pUp, 1 - dir.pUp) * 100)}% (R² ${dir.r2}, ${dir.nLive} input${dir.nLive > 1 ? 's' : ''})`;
  return { sym, range: rv, behaviour: bh, direction: { ...dir, label: dirLabel }, clarity };
}

// ── 9. Scenarios: persistence as the base case, measured base rates for the rest
// persist: { macroMonthly (P quadrant persists a month), vixInvert5d (P first
// inversion inside 5 sessions) }. Probabilities are only quoted where measured.
export function scenarios({ envLabel, ax, persist = {}, eventsDue = [] }) {
  const out = [];
  const pBase = persist.vixInvert5d != null ? 1 - persist.vixInvert5d : null;
  out.push({ name: 'Base: the current state persists', p: r2(pBase),
    pWhy: persist.vixInvert5d != null ? '1 − base rate of a first VIX inversion within 5 sessions' : 'not measured',
    text: `${envLabel}. Ranges follow the instrument cards below; direction only where a tested input is active.` });
  out.push({ name: 'Alternative: stress transmits to equity vol', p: r2(persist.vixInvert5d),
    pWhy: 'unconditional base rate (VIX ≥ VIX3M first day, n=86 since 2008). Credit widening may raise it; that conditional is untested.',
    text: 'VIX curve inverts → tested next-5-session range: SPX +0.76, NQ +0.82, USDJPY +0.44, gold +0.43 ATR (vix-inversion). Direction is not part of the finding.' });
  if (eventsDue.length) out.push({ name: 'Event: a scheduled print reprices the day', p: null, pWhy: 'size is tested (event-impact-map); direction is not',
    text: eventsDue.map(e => `${e.label}: ~${e.mult}× an ordinary half-hour`).join('; ') });
  if (persist.macroMonthly != null) out.push({ name: 'Slow: macro quadrant', p: r2(persist.macroMonthly), pWhy: 'historical monthly persistence of the current quadrant', text: 'quadrant is a monthly, lagging description; it sets context only' });
  return out;
}

// ── 10. Conviction: one number, decomposed ─────────────────────────────────
// Predictive value (what the active inputs can explain) × reliability (tier) ×
// freshness (data quality) × agreement. Reported separately for range and
// direction, because the system is strong on one and weak on the other.
export function conviction(cards, dq) {
  const xs = Object.values(cards).filter(c => c.range?.pAbove75 != null);
  const rng = xs.length ? xs.reduce((a, c) => a + Math.min(1, Math.abs(c.range.pAbove75 - 0.25) / 0.25), 0) / xs.length : 0;
  const dirs = Object.values(cards).map(c => Math.abs(c.direction.pUp - 0.5) * 2);
  const dir = dirs.length ? Math.max(...dirs) : 0;
  const q = dq?.score ?? 1;
  return {
    range: Math.round(100 * clamp(rng * TIER_P.validated * q * 1.6, 0, 1)),        // 1.6: a 40%-off-normal day across the board = full marks
    direction: Math.round(100 * clamp(dir * 3 * q, 0, 1)),                         // 3: a 66/34 call = full marks
    dataQuality: Math.round(100 * q),
  };
}

// ── 11. The whole read ─────────────────────────────────────────────────────
export function buildGlobalRead(input) {
  const { obs = {}, rows = [], flags = {}, dir = {}, tags = {}, hmm = {}, health = [], checks = [], persist = {}, eventsDue = [], context = [], invalidation = [] } = input;
  const dq = dataQuality({ health, checks });
  const ax = stateAxes(obs);
  const envLabel = environmentLabel(ax);
  const cards = {};
  for (const row of rows) cards[row.sym] = instrumentCard(row.sym, { row, flags, dirSignals: dir[row.sym] ?? [], tag: tags[row.sym], hmmRange: hmm[row.sym] === 'RANGE' });
  for (const sym of Object.keys(dir)) if (!cards[sym]) cards[sym] = instrumentCard(sym, { row: null, flags, dirSignals: dir[sym] });
  const ranked = Object.values(cards).sort((a, b) => b.clarity - a.clarity).map(c => ({ sym: c.sym, clarity: c.clarity, behaviour: c.behaviour.label, direction: c.direction.label }));
  return { envLabel, axes: ax, scenarios: scenarios({ envLabel, ax, persist, eventsDue }), cards, ranked, conviction: conviction(cards, dq), dataQuality: dq, context, invalidation, registry: REGISTRY };
}

export { REG };
