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
  // direction — post-FOMC drift is now the only one with banked out-of-sample evidence.
  // The 2Y sleeve was 'confirmed' until 2026-10-17, when the evidence book deflated it to
  // context: the banked result needed a +2-day lag on GS2, which FRED first publishes a
  // median 32 days late; on point-in-time data OOS Sharpe 0.09, PF 1.08, p 0.91.
  { id: 'yield-spread', label: '2Y yield-spread sleeve', family: 'rates-rv', question: 'direction', timing: 'leading', horizon: 'weeks',
    tier: 'null', ic: 0, n: 150, evidence: 'yield-spread-sleeve deflated 2026-10-17 (point-in-time OOS Sharpe 0.09, p 0.91); ys-long-confirm context' },
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
  // story-only reads: no test has asked these to lead, so weight 0 in the tested arm; the story arm scores them forward
  { id: 'us-yields', label: 'US 10Y yield trend', family: 'rates', question: 'direction', timing: 'coincident', horizon: 'days', tier: 'untested', ic: 0, evidence: 'yield→asset coupling null (same-bar only)' },
  { id: 'dollar-tape', label: 'Dollar trend (20d)', family: 'price-state', question: 'direction', timing: 'lagging', horizon: 'days', tier: 'untested', ic: 0, evidence: 'untested as a day-direction read' },
  { id: 'risk-tone', label: 'Credit / risk tone', family: 'risk', question: 'direction', timing: 'coincident', horizon: 'days', tier: 'untested', ic: 0, evidence: 'credit-stress gate failed OOS; direction untested' },
  { id: 'today-tape', label: 'Today so far (open → now)', family: 'intraday', question: 'direction', timing: 'coincident', horizon: 'session', tier: 'untested', ic: 0, evidence: 'path-neutral lines, jump-momentum null; shown as a story read only' },
  { id: 'real-yields', label: 'Real yield trend', family: 'rates', question: 'direction', timing: 'coincident', horizon: 'days', tier: 'untested', ic: 0, evidence: 'gold/NQ real-yield links tested quiet, not drivers (chain read)' },
  { id: 'vix-tone', label: 'VIX curve tone', family: 'vol-surface', question: 'direction', timing: 'coincident', horizon: 'days', tier: 'untested', ic: 0, evidence: 'VIX curve validated for range only; direction untested' },
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
// gex-range (NQ only): next-day range vs a vol-matched Brownian baseline is DR ≈ 1.02 on short-gamma days and
// ≈ 0.85 on long-gamma days -- "long gamma is quiet", short gamma is ordinary. Centred on an even split so the
// two states move the ladder symmetrically around it. (+0.176 is the DR GAP, not a multiplier: applying
// ×1.176 to short gamma alone used to turn an ordinary NQ day into "WIDE / FOLLOW BREAKS".)
export const GEX_DR = { short: 1.02, long: 0.85 };
const GEX_MID = (GEX_DR.short + GEX_DR.long) / 2;
export const GEX_SHORT_NQ = +(GEX_DR.short / GEX_MID).toFixed(3), GEX_LONG_NQ = +(GEX_DR.long / GEX_MID).toFixed(3);
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
  const shown = signals.map(x => ({ id: x.id, label: x.label ?? REG[x.id]?.label ?? x.id, family: x.family, tier: x.tier ?? REG[x.id]?.tier ?? null, s: r2(x.s), e: r3(x.e), note: x.note ?? null }));
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

// ── 4b. The STORY arm (D2): every input with a direction gets a vote-sized weight ──
// The owner's hypothesis: the many descriptive reads (chain, rates, spreads, scorecard,
// COT, OI, HMM, lean...) say something TOGETHER that none says alone. The evidence-weighted
// arm above gives a null input weight 0, so it can never test that. This arm gives every
// input that points a way a small NOMINAL weight (an IC of 0.05, a ~52.5% hit rate), still
// correlation-aware so a family of six rates reads counts as about one voice, not six.
// It is a SHADOW: scored forward as D2 next to D1, never allowed to move D1, the range
// arm or any bot. If D2 beats D1 and a coin flip out of sample, the weights get promoted
// by registry edit; if not, the story stays a story.
export const STORY_IC = 0.05;
export function storyDirection(signals) {
  // Weight: an input keeps its evidence weight only while its TESTED rule is active (x.s ≠ 0, e > 0). A
  // below-threshold story value (e.g. the 2Y spread under its 2.75 entry) is a story read like any other
  // and gets the nominal weight -- giving it the confirmed tier weight let one inactive input set the lean.
  const lifted = signals.map(x => { const sv = x.sStory ?? x.s; const tested = x.s !== 0 && x.e > 0;
    return { ...x, s: sv, e: sv === 0 ? 0 : tested ? x.e : STORY_IC * Math.abs(sv) }; });
  const d = combineDirection(lifted);
  // the reads, strongest first, for the "because" chips: what pulls up, what pulls down
  // ranked by what each read actually contributes to the lean (beta_i * s_i), not by its raw size
  const betaOf = Object.fromEntries((d.beta ?? []).map(b => [b.id, b.beta]));
  const reads = lifted.filter(x => x.s !== 0).map(x => ({ id: x.id, label: x.label ?? REG[x.id]?.label ?? x.id, family: x.family, s: r2(x.s),
    contrib: r3((betaOf[x.id] ?? 0) * x.s), note: x.note ?? null })).sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib));
  return { pUp: d.pUp, r2: d.r2, agreement: d.agreement, nLive: d.nLive, reads,
    byFamily: Object.fromEntries(Object.entries(lifted.filter(x => x.s !== 0).reduce((a, x) => { (a[x.family] ??= []).push(Math.sign(x.s)); return a; }, {}))
      .map(([f, v]) => [f, Math.sign(v.reduce((a, b) => a + b, 0))])) };
}

// ── 5. Range: joint multiplier on the fitted ladder, and P(H-L > p75) ───────
// row: one daily-read row { sym, ratio (IV/σ), edges ([lo,hi] tercile cuts), lines:{hl_p50,hl_p75} }
// flags: { vixInv, frontDear, frontCalm, allDown, nqDownWeek, gexShortNq }
// When the row carries the CHOSEN lines (persistence + implied vol, the Daily Plan's forecast), nothing is
// multiplied on top: IV÷σ is already inside them, and forge/ONE_RANGE_FORECAST_PREREG.md (run 2026-10-18) found the
// VIX-curve / breadth / NQ-week flags (SIX ÷ SI 0.9926, bar 0.99) and the NQ gamma sign (1.0019) add nothing beyond
// them. The flags are still reported, as context with no multiplier. Plain lines (fallback) keep the old adjustments.
export function rangeView(row, flags = {}) {
  const cls = classOf(row.sym), C = RANGE_COEF[cls];
  const chosen = row.lines?.source === 'chosen';
  const drivers = [], context = []; let m = 1;
  const add = (id, mult, why) => {
    if (!mult || Math.abs(mult - 1) <= 0.001) return;
    if (chosen) { context.push({ id, mult: 1, why: `${why} — already in / no gain over the chosen lines` }); return; }
    m *= mult; drivers.push({ id, mult: r3(mult), why });
  };
  const flag = (id, key, on, why) => { if (on == null) return; const [mu, freq] = C[key]; add(id, Math.pow(mu, (on ? 1 : 0) - freq), `${why}: ${on ? 'yes' : 'no'}`); };
  if (!chosen && Number.isFinite(row.ratio) && row.ratio > 0) {
    const centre = Array.isArray(row.edges) && row.edges.length === 2 ? Math.sqrt(row.edges[0] * row.edges[1]) : 1;
    add('iv-sigma', Math.pow(row.ratio / centre, C.iv_exp), `IV÷σ ${r2(row.ratio)} vs its usual ${r2(centre)}`);
  }
  flag('vix-term', 'vix_inv', flags.vixInv, 'VIX ≥ VIX3M');
  flag('vix-term', 'front_dear', flags.frontDear, 'VIX front dear');
  flag('vix-term', 'front_calm', flags.frontCalm, 'VIX front calm');
  flag('all-down', 'all_down', flags.allDown, 'all six indices down');
  if (cls === 'index') flag('nq-dw', 'nq_dw', flags.nqDownWeek, 'NAS100 down-week');
  if (row.sym === 'NQ' && flags.gexShortNq != null) add('gex', flags.gexShortNq ? GEX_SHORT_NQ : GEX_LONG_NQ, flags.gexShortNq ? 'NQ dealers short gamma (ordinary movement)' : 'NQ dealers long gamma (quieter)');
  // The ladder's lines already carry the event multiplier (forecastLadder.buildLadder), so it is not re-applied.
  const p50 = row.lines?.hl_p50, p75 = row.lines?.hl_p75;
  let pAbove75 = null;
  if (p50 > 0 && p75 > p50) {
    const sd = Math.log(p75 / p50) / 0.6745;   // the ladder's own log-dispersion
    pAbove75 = 1 - normCdf(0.6745 - Math.log(m) / sd);
  }
  return { sym: row.sym, cls, lines: chosen ? 'chosen' : 'plain', mult: r3(m), hlP50: p50 ?? null, hlP75: p75 ?? null, expectedHl: p50 ? r3(p50 * m) : null, pAbove75: r3(pAbove75), drivers, context };
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
  if (o.csi != null) put('credit', 'credit stress index', clamp(o.csi / 2, -1, 1), `credit-stress composite ${o.csi}`);
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
  const story = storyDirection(dirSignals);
  const storyLabel = story.nLive === 0 ? 'the story has no direction today'
    : Math.abs(story.pUp - 0.5) < 0.02 ? 'the story nets to ~50/50'
    : `${story.pUp > 0.5 ? 'UP' : 'DOWN'} ${Math.round(Math.max(story.pUp, 1 - story.pUp) * 100)}% (${story.nLive} reads, unvalidated)`;
  const card = { sym, range: rv, behaviour: bh, direction: { ...dir, label: dirLabel, story: { ...story, label: storyLabel } }, clarity };
  card.plan = tradePlan(card);
  return card;
}

// ── 9. Scenarios: persistence as the base case, measured base rates for the rest
// persist: { macroMonthly (P quadrant persists a month), vixInvert5d (P first
// inversion inside 5 sessions) }. Probabilities are only quoted where measured.
export function scenarios({ envLabel, ax, persist = {}, eventsDue = [] }) {
  const out = [];
  const pBase = persist.vixInvert5d != null ? 1 - persist.vixInvert5d : null;
  out.push({ name: 'Base: no VIX inversion within 5 sessions', p: r2(pBase),
    pWhy: persist.vixInvert5d != null ? '1 − base rate of a first VIX inversion within 5 sessions' : 'not measured',
    text: `${envLabel}. Ranges follow the instrument cards below; direction only where a tested input is active.` });
  out.push({ name: 'Alternative: stress transmits to equity vol', p: r2(persist.vixInvert5d),
    pWhy: 'unconditional base rate (VIX ≥ VIX3M first day, n=86 since 2008). Credit widening may raise it; that conditional is untested.',
    text: 'VIX curve inverts → tested next-5-session range: SPX +0.76, NQ +0.82, USDJPY +0.44, gold +0.43 ATR (vix-inversion). Direction is not part of the finding.' });
  if (eventsDue.length) out.push({ name: 'Event: a scheduled print reprices the day', p: null, pWhy: 'size is tested (event-impact-map); direction is not',
    text: eventsDue.map(e => `${e.label}. Tested next-session range: ${(e.effects ?? []).map(x => `${x.inst} +${x.effAtr} ATR`).join(', ') || 'size not measured for these pairs'} (surprise-size). The 22:00 ladder rebuild carries the event multiplier, so the next read's lines already include it.`).join(' ') });
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

// ── 11. The trade plan: what the evidence says to DO with each market ──────
// Management guidance from the behaviour label (the validated range facts) and
// a direction line only when a tested input is active. It never invents an
// entry signal: level fades and follows at the lines are banked nulls on their
// own (Evidence Book, "lines are waypoints, not walls"), so the plan says how to
// treat the lines, not that the lines are an edge.
export function tradePlan(card) {
  const b = card.behaviour?.label ?? 'unknown', p = card.range?.pAbove75, d = card.direction;
  const pct = p == null ? '?' : `${Math.round(p * 100)}%`;
  let stance, lines;
  if (b === 'expansion') { stance = 'FOLLOW BREAKS'; lines = `Wide day likely (beyond p75 ${pct} vs 25% normal). Breaks of p50/p75 tend to run to the next line: follow early, don't fade, trail behind the last line broken.`; }
  else if (/exhaustion|contained/.test(b)) { stance = 'TAKE PROFIT AT LINES'; lines = `Capped day likely (beyond p75 ${pct}). Expect price to stall before p75/p90: take profit at the line, don't chase breakouts. Reversal odds at the outer lines are still ~50/50, so this is not a fade signal.`; }
  else if (b === 'unknown') { stance = 'NO READ'; lines = 'No IV÷σ row for this instrument today, so no range view.'; }
  else { stance = 'NO EDGE AT LINES'; lines = `Normal day (beyond p75 ${pct}). A touch is close to a coin flip either way. Let the intraday rules decide: a fast start (≥ 0.6 ATR by 09:00 London) means a wider rest of day${/^(EURUSD|GOLD)$/.test(card.sym) ? '; this market reverts more in the 20–22 UTC hour' : ''}.`; }
  const active = (d?.shown ?? []).filter(x => x.e > 0 && x.s !== 0);
  const dirLine = active.length && Math.abs(d.pUp - 0.5) >= 0.04
    ? `Tested bias ${d.pUp > 0.5 ? 'UP' : 'DOWN'} ${Math.round(Math.max(d.pUp, 1 - d.pUp) * 100)}% from ${active.map(x => x.label).join(' + ')} (${active.map(x => x.note).filter(Boolean).join('; ')}). Size by volatility; the view ends when its input switches off.`
    : 'No tested direction today: any position is a both-sides or management decision, not a directional bet.';
  return { stance, lines, direction: dirLine };
}

// ── 12. Currency tier: the pair cards rolled up, plus each currency's own state
// A currency's "range pressure" is the mean P(>p75) of its pairs; its direction
// is the pair P(up)s mapped into currency space (base: p, quote: 1−p), so it is
// exactly as strong as the tested pair inputs and no stronger. The rest are its
// own readings, shown as state.
export function currencyTier(currencies = {}, cards = {}) {
  const out = {};
  for (const [c, info] of Object.entries(currencies)) {
    const legs = Object.values(cards).filter(k => k.sym.length === 6 && (k.sym.startsWith(c) || k.sym.endsWith(c)));
    const ps = legs.map(k => k.range?.pAbove75).filter(Number.isFinite);
    const dirs = legs.map(k => (k.sym.startsWith(c) ? k.direction.pUp : 1 - k.direction.pUp));
    const pStrong = dirs.length ? dirs.reduce((a, b) => a + b, 0) / dirs.length : 0.5;
    const notes = [];
    if (info.dollarShare != null && c !== 'USD') notes.push(info.dollarShare >= 0.6 ? `${Math.round(info.dollarShare * 100)}% of its pair is the dollar: a USD story` : `own story: only ${Math.round(info.dollarShare * 100)}% dollar`);
    if (info.vr4h != null) notes.push(info.vr4h < 0.85 ? `intraday moves give back (VR4h ${info.vr4h})` : info.vr4h > 1.1 ? `intraday moves persist (VR4h ${info.vr4h})` : `intraday persistence normal (VR4h ${info.vr4h})`);
    if (info.surprise?.stale) notes.push('surprise index stale');
    if (info.macroStale?.length) notes.push(`scorecard has stale dims (${info.macroStale.join(', ')})`);
    out[c] = {
      ccy: c, pairs: legs.map(k => k.sym), rangePressure: ps.length ? r3(ps.reduce((a, b) => a + b, 0) / ps.length) : null,
      pStronger: r3(pStrong), directionView: Math.abs(pStrong - 0.5) < 0.04 ? 'no tested view' : `${pStrong > 0.5 ? 'stronger' : 'weaker'} ${Math.round(Math.max(pStrong, 1 - pStrong) * 100)}%`,
      state: info, notes,
    };
  }
  return out;
}

// ── 13. The whole read ─────────────────────────────────────────────────────
export function buildGlobalRead(input) {
  const { obs = {}, rows = [], flags = {}, dir = {}, tags = {}, hmm = {}, health = [], checks = [], persist = {}, eventsDue = [], context = [], invalidation = [], currencies = {}, meta = {} } = input;
  const dq = dataQuality({ health, checks });
  const ax = stateAxes(obs);
  const envLabel = environmentLabel(ax);
  const cards = {};
  for (const row of rows) cards[row.sym] = instrumentCard(row.sym, { row, flags, dirSignals: dir[row.sym] ?? [], tag: tags[row.sym], hmmRange: hmm[row.sym] === 'RANGE' });
  for (const sym of Object.keys(dir)) if (!cards[sym]) cards[sym] = instrumentCard(sym, { row: null, flags, dirSignals: dir[sym] });
  const ranked = Object.values(cards).sort((a, b) => b.clarity - a.clarity).map(c => ({ sym: c.sym, clarity: c.clarity, behaviour: c.behaviour.label, stance: c.plan.stance, direction: c.direction.label }));
  const conv = conviction(cards, dq);
  const top = ranked.filter(r => r.clarity >= 0.2).slice(0, 3);
  const headline = `${envLabel}. ${top.length ? `Clearest: ${top.map(r => `${r.sym} ${r.stance.toLowerCase()}`).join(', ')}.` : 'No market stands out today.'} ${conv.direction < 10 ? 'No tested directional view is active.' : ''}`.trim();
  return { headline, envLabel, axes: ax, scenarios: scenarios({ envLabel, ax, persist, eventsDue }), cards, ranked, currencies: currencyTier(currencies, cards),
    conviction: conv, dataQuality: dq, context, invalidation, flags, meta, registry: REGISTRY };
}

export { REG };

// ── 14. The forward record (MD files/GLOBAL_DECISION_ENGINE.md §6) ─────────
// One compact row per London session, written at the first run after 07:00
// London, then filled from the daily-read score (the same lines, the same
// realised session) once the session is scored. Pure, so the test is too.
export function recordRow(read, day, sessionInstruments = {}) {
  const cards = {};
  for (const c of Object.values(read.cards ?? {})) cards[c.sym] = {
    mult: c.range?.mult ?? null, hlP50: c.range?.hlP50 ?? null, hlP75: c.range?.hlP75 ?? null, pAbove75: c.range?.pAbove75 ?? null,
    behaviour: c.behaviour?.label ?? null, stance: c.plan?.stance ?? null, pUp: c.direction?.pUp ?? 0.5, nLive: c.direction?.nLive ?? 0, pUpStory: c.direction?.story?.pUp ?? 0.5, nStory: c.direction?.story?.nLive ?? 0, clarity: c.clarity,
    realisedHl: null, beyondP75: null, oc: null,
    oc07: Number.isFinite(sessionInstruments[c.sym]?.oc) ? sessionInstruments[c.sym].oc : null,   // % from the open at the 07:00 read
  };
  return { day, at: read.meta?.asOf ?? new Date().toISOString(), headline: read.headline, conviction: read.conviction, cards };
}
// The 10:00 snapshot (D3): the story arm re-read mid-morning, with how far each market had already
// moved from the open (session % at that moment). Scored on what is LEFT: the close-minus-snapshot move,
// so the morning's move cannot flatter the call. Written once, the first run in the 10:00 London hour.
// sessionInstruments: /api/vol-forecast/session .instruments ({ SYM: { oc } }).
export function snapshotRow(read, sessionInstruments = {}) {
  const out = {};
  for (const c of Object.values(read.cards ?? {})) {
    const st = c.direction?.story; if (!st?.nLive) continue;
    const oc10 = sessionInstruments[c.sym]?.oc;
    if (!Number.isFinite(oc10)) continue;
    out[c.sym] = { pUpStory: st.pUp, nStory: st.nLive, oc10, at: read.meta?.asOf ?? null };
  }
  return out;
}
// scoreRows: daily-read's score.rows for that day ({ sym, hl, oc, band }; band ≥ 2 = beyond p75).
export function attachRealised(row, scoreRows = []) {
  let changed = false;
  for (const s of scoreRows) {
    const c = row.cards?.[s.sym]; if (!c || c.realisedHl != null || !Number.isFinite(s.hl)) continue;
    c.realisedHl = s.hl; c.beyondP75 = Number.isFinite(s.band) ? s.band >= 2 : null; c.oc = Number.isFinite(s.oc) ? s.oc : null; changed = true;
  }
  return changed;
}
const pinball = (q, y, tau) => (y >= q ? tau * (y - q) : (1 - tau) * (q - y));
export function scoreRecord(rows = [], { floor = 30 } = {}) {
  const obs = rows.flatMap(r => Object.entries(r.cards ?? {}).map(([sym, c]) => ({ day: r.day, sym, ...c, snap: r.snap10?.[sym] ?? null, conv: r.conviction?.range ?? null }))).filter(o => o.realisedHl != null);
  const sessions = new Set(obs.map(o => o.day)).size;
  // R1: engine quantiles (ladder × multiplier) vs the plain ladder
  const byInst = {};
  for (const o of obs) {
    if (!(o.hlP50 > 0 && o.hlP75 > 0 && o.mult > 0)) continue;
    const b = (byInst[o.sym] ??= { eng: 0, plain: 0, n: 0 });
    b.eng += pinball(o.hlP50 * o.mult, o.realisedHl, 0.5) + pinball(o.hlP75 * o.mult, o.realisedHl, 0.75);
    b.plain += pinball(o.hlP50, o.realisedHl, 0.5) + pinball(o.hlP75, o.realisedHl, 0.75); b.n++;
  }
  const ratios = Object.values(byInst).filter(b => b.plain > 0).map(b => b.eng / b.plain).sort((a, b) => a - b);
  const R1 = { instruments: ratios.length, medianRatio: ratios.length ? r3(ratios[Math.floor(ratios.length / 2)]) : null, betterShare: ratios.length ? r2(ratios.filter(x => x < 1).length / ratios.length) : null };
  // R2: P(beyond p75) vs the constant 25%
  const b2 = obs.filter(o => o.pAbove75 != null && o.beyondP75 != null);
  const brier = b2.length ? b2.reduce((a, o) => a + (o.pAbove75 - (o.beyondP75 ? 1 : 0)) ** 2, 0) / b2.length : null;
  const base = b2.length ? b2.reduce((a, o) => a + (0.25 - (o.beyondP75 ? 1 : 0)) ** 2, 0) / b2.length : null;
  const rate = xs => (xs.length ? r3(xs.filter(o => o.beyondP75).length / xs.length) : null);
  const R2 = { n: b2.length, brierSkill: brier != null && base ? r3(1 - brier / base) : null,
    expansionRate: rate(b2.filter(o => o.behaviour === 'expansion')), containedRate: rate(b2.filter(o => /contained|exhaustion/.test(o.behaviour ?? ''))) };
  // D1: direction calls only where the engine made one
  const calls = obs.filter(o => o.nLive > 0 && Math.abs(o.pUp - 0.5) >= 0.04 && o.oc != null && o.oc !== 0);
  const bd = calls.length ? calls.reduce((a, o) => a + (o.pUp - (o.oc > 0 ? 1 : 0)) ** 2, 0) / calls.length : null;
  const D1 = { n: calls.length, hits: calls.filter(o => (o.pUp > 0.5) === (o.oc > 0)).length, brierSkill: bd != null ? r3(1 - bd / 0.25) : null };
  // D2: the story arm (nominal weights), scored on the same sessions and the same outcome
  // scored on the move LEFT after the 07:00 read (close − 07:00 level): the read includes the tape so far,
  // so scoring it from the midnight open would count seven hours of the outcome as a forecast
  const left = o => o.oc - o.oc07;
  const sc = obs.filter(o => o.nStory > 0 && Math.abs(o.pUpStory - 0.5) >= 0.02 && o.oc != null && o.oc07 != null && left(o) !== 0);
  const bs = sc.length ? sc.reduce((a, o) => a + (o.pUpStory - (left(o) > 0 ? 1 : 0)) ** 2, 0) / sc.length : null;
  const h2 = sc.filter(o => (o.pUpStory > 0.5) === (left(o) > 0)).length;
  const D2 = { n: sc.length, hits: h2, hitRate: sc.length ? r3(h2 / sc.length) : null, brierSkill: bs != null ? r3(1 - bs / 0.25) : null };
  // D3: the 10:00 story, scored on the remaining move (close minus the 10:00 level, in % of the open)
  const s3 = obs.filter(o => o.snap && o.oc != null && o.snap.nStory > 0 && Math.abs(o.snap.pUpStory - 0.5) >= 0.02 && (o.oc - o.snap.oc10) !== 0);
  const hit3 = s3.filter(o => (o.snap.pUpStory > 0.5) === (o.oc - o.snap.oc10 > 0)).length;
  const b3 = s3.length ? s3.reduce((a, o) => a + (o.snap.pUpStory - (o.oc - o.snap.oc10 > 0 ? 1 : 0)) ** 2, 0) / s3.length : null;
  const D3 = { n: s3.length, hits: hit3, hitRate: s3.length ? r3(hit3 / s3.length) : null, brierSkill: b3 != null ? r3(1 - b3 / 0.25) : null };
  const verdict = sessions < floor ? `too early: ${sessions} of ${floor} sessions` : [
    R1.medianRatio == null ? 'R1 n/a' : R1.medianRatio < 0.97 && R1.betterShare >= 0.6 ? 'R1 PASS' : R1.medianRatio >= 1 ? 'R1 FAIL' : 'R1 between bars',
    R2.brierSkill == null ? 'R2 n/a' : R2.brierSkill > 0 && R2.expansionRate != null && R2.containedRate != null && R2.expansionRate - R2.containedRate >= 0.10 ? 'R2 PASS' : R2.brierSkill <= 0 ? 'R2 FAIL' : 'R2 between bars',
    D1.n < floor ? `D1 too few calls (${D1.n})` : D1.brierSkill > 0 ? 'D1 PASS' : 'D1 FAIL',
    D2.n < floor ? `D2 (story) too few calls (${D2.n})` : D2.brierSkill > 0 && (D1.brierSkill == null || D2.brierSkill > D1.brierSkill) ? 'D2 story beats D1' : 'D2 story FAIL',
  ].join(' · ');
  return { sessions, observations: obs.length, R1, R2, D1, D2, D3, verdict };
}
