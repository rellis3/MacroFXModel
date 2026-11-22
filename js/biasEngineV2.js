/**
 * Bias Engine V2, shadow (plans/BIAS_ENGINE_V2_SPEC.md v1.1). Owner, 2026-11-19: run V2 beside V1 in shadow mode, with
 * five independently switchable changes, V1 untouched as the production control. Nothing in production reads this file.
 *
 *   F1  point-in-time timestamps (period END, oldest input), cadence-aware budgets; data momentum recomputed per dimension
 *   F2  carry: the bilateral CURRENT policy-rate gap (replaces V1's own-history rate z)
 *   F3  central-bank tone (stance) and COT out of the score, kept as context
 *   F4  one drift-adjusted, symmetric risk factor F in place of V1's R (V1's roles, weights and banding kept)
 *   F5  expected policy repricing: the priced 6-month change (level) and its 20-business-day change, bilateral
 *
 * Every switch off reproduces V1 exactly (test A1). V1's driver functions are private to js/biasEngine.js, which must not
 * be edited, so this file carries a copy of them with the switches threaded through; A1 proves the copy exact.
 *
 * Pure: no fetch, no KV, no clock except the issue time in the snapshot. Tested in js/biasEngineV2.test.mjs and
 * js/biasEngineV2.econ.test.mjs.
 */
import { createHash } from 'node:crypto';
import {
  CCYS, CCY_PRIORITY, ASSETS, CCY_WEIGHTS, GOLD_WEIGHTS, INDEX_WEIGHTS, EU_INDEX_WEIGHTS, CMDTY_WEIGHTS, RISK_ROLE, COMMODITY_OF,
  TH, MAX_AGE_DAYS, MIN_COVERAGE, REAL_YIELD_UNIVERSE, COT_UNIVERSE_MISSING, ENGINE_VERSION, WEIGHTS_VERSION,
  rnd, band, unusable, closedBars, slopeZ, trendD, basketIndex, combine, labelOf, whyLine, flipLine, riskScore, allPairs, pairFrom,
} from './biasEngine.js';
import { FACTORS } from './macroScorecardEngine.js';

export const V2_VERSION = 'bias-engine-v2-shadow';
export const SPEC_VERSION = '1.1';
export const SWITCHES = ['F1', 'F2', 'F3', 'F4', 'F5'];
const DAY = 864e5, H4 = 4 * 3600e3;
const fin = x => typeof x === 'number' && Number.isFinite(x);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const clip2 = x => clamp(x, -2, 2);
const sgn = (x, k = 2) => (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x).toFixed(k);
const pctS = x => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1)}%`;
const dirWord = d => ({ BULLISH: 'Bullish', BEARISH: 'Bearish', NEUTRAL: 'Neutral' }[d]);
const isoDay = s => String(s ?? '').slice(0, 10);

// ── the frozen constants (spec §4.9; test A15 checks this object against the spec table) ─────────────────────────
export const C2 = Object.freeze({
  budgets: Object.freeze({ daily: 10, weekly: 21, monthly: 110, quarterly: 245, meeting: 120 }),
  expected: Object.freeze({ daily: 1, weekly: 10, monthly: 76, quarterly: 152, meeting: 45 }),
  halfLife: Object.freeze({ daily: 3, weekly: 10, monthly: 45, quarterly: 120, meeting: 45 }),
  carryScalePp: 1.0,
  risk: Object.freeze({ window: 252, minWindow: 200, zClip: 3, minInputs: 3, retDays: 20, maxAgeDays: 10 }),
  riskGate: Object.freeze({ corrPC1: 0.90, meanAbs: 0.10, posShare: Object.freeze([0.40, 0.60]), coverage: 0.95 }),
  repricing: Object.freeze({ rungMonths: 6, rungTolMonths: 1, futuresMaxAgeBd: 3, win4wDays: Object.freeze([20, 35]), minDeliveryMonths: 3,
    maxAbsChgBp: 150, levelScaleBp: 50, chgScaleBp: 25, mix: Object.freeze([0.5, 0.5]), y2LevelFactor: 0.5, y2ChgBd: 20, y2MaxAgeDays: 10 }),
  policyTableMaxAgeDays: 10,
  basketMin: 4,
  familyMin: 0.02,
  confidenceMinDays: 120,
});
/** How often each scorecard dimension publishes, per currency (frozen; spec §4.1). */
export const DIM_CADENCE = Object.freeze({
  gdp: 'quarterly',
  retailSales: Object.freeze({ USD: 'monthly', default: 'quarterly' }),
  cpi: Object.freeze({ AUD: 'quarterly', NZD: 'quarterly', default: 'monthly' }),
  ppi: 'monthly',
  ism: Object.freeze({ AUD: 'quarterly', NZD: 'quarterly', default: 'monthly' }),
  laborMarket: Object.freeze({ NZD: 'quarterly', default: 'monthly' }),
  consumerConfidence: 'monthly',
});
export const cadenceOfDim = (dim, ccy) => { const x = DIM_CADENCE[dim]; return !x ? 'monthly' : typeof x === 'string' ? x : x[ccy] ?? x.default; };
/** Independent-evidence families (spec §4.8). */
export const FAMILY_OF = Object.freeze({ carry: 'monetary', repricing: 'monetary', policy: 'monetary', rates: 'monetary', fedPath: 'monetary', ratesPath: 'monetary',
  realYield: 'real rates', data: 'macro data', globalData: 'macro data', risk: 'risk', commodity: 'commodity', inventories: 'commodity',
  usd: 'cross-market', ccy: 'cross-market', trend: 'price', positioning: 'positioning' });
/** The cadence each V1-shaped driver's input publishes at (F1 budgets). */
const CADENCE_OF_KEY = { policy: 'daily', rates: 'monthly', realYield: 'monthly', usReal: 'daily', cot: 'weekly', risk: 'daily', prices: 'daily', stance: 'meeting', data: 'monthly' };

/** The twelve variants (spec §2). */
const ALL = Object.freeze({ F1: true, F2: true, F3: true, F4: true, F5: true }), NONE = Object.freeze({ F1: false, F2: false, F3: false, F4: false, F5: false });
export const VARIANTS = Object.freeze({
  v1r: NONE, v2: ALL,
  ...Object.fromEntries(SWITCHES.map(s => [`v2-no${s}`, Object.freeze({ ...ALL, [s]: false })])),
  ...Object.fromEntries(SWITCHES.map(s => [`v1r+${s}`, Object.freeze({ ...NONE, [s]: true })])),
});
/** Configuration that is frozen with the forward record (spec §6.4). Owner 2026-11-22: trial ended early, V2 scored like V1 from 2026-11-23. */
export const CONFIG = Object.freeze({ FORWARD_START: '2026-11-23', PRIMARY: Object.freeze(['v2', 'v1r']), SCORED_TARGETS: Object.freeze(['d21', 'n07', 'd5', 'd20']) });
/** Canonical JSON (sorted keys) and its SHA-256: the snapshot hash and the config hash. */
export function canonicalJson(x) {
  if (Array.isArray(x)) return `[${x.map(canonicalJson).join(',')}]`;
  if (x && typeof x === 'object') return `{${Object.keys(x).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(x[k])}`).join(',')}}`;
  return JSON.stringify(x === undefined ? null : x);
}
export const sha256 = s => createHash('sha256').update(String(s)).digest('hex');
export const CONFIG_HASH = sha256(canonicalJson({ SPEC_VERSION, C2, DIM_CADENCE, FAMILY_OF, VARIANTS, CONFIG, V1: { ENGINE_VERSION, WEIGHTS_VERSION, CCY_WEIGHTS, GOLD_WEIGHTS, INDEX_WEIGHTS, EU_INDEX_WEIGHTS, CMDTY_WEIGHTS, RISK_ROLE, TH } }));
/** 'trial' before the frozen forward start (or with none), 'forward' on and after it. Trial days never reach the scoreboard. */
export const phaseOf = (date, forwardStart = CONFIG.FORWARD_START) => (forwardStart && date >= forwardStart ? 'forward' : 'trial');

// ── F1: dating, budgets, freshness ───────────────────────────────────────────────────────────────────────────────
const monthEnd = d => { const y = +d.slice(0, 4), m = +d.slice(5, 7); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const quarterEnd = d => { const y = +d.slice(0, 4), m = +d.slice(5, 7), qEnd = Math.ceil(m / 3) * 3; return new Date(Date.UTC(y, qEnd, 0)).toISOString().slice(0, 10); };
/**
 * The end of the period a reading measures, as an ISO time, capped at the issue (a partial period read before it ends is
 * dated at the issue and flagged). Monthly: the last day of the month; quarterly: of the quarter; daily, weekly, meeting:
 * the reading's own date.
 */
export function obsEndOf(asOf, cadence, issueMs) {
  const d = isoDay(asOf);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { obsEndMs: null, partial: false };
  let end = cadence === 'monthly' ? monthEnd(d) : cadence === 'quarterly' ? quarterEnd(d) : null;
  const endMs = end ? Date.parse(`${end}T23:59:00Z`) : Date.parse(asOf);
  if (!Number.isFinite(endMs)) return { obsEndMs: null, partial: false };
  return endMs > issueMs ? { obsEndMs: issueMs, partial: true } : { obsEndMs: endMs, partial: false };
}
export function ageDaysOf(asOf, cadence, issueMs) { const { obsEndMs } = obsEndOf(asOf, cadence, issueMs); return obsEndMs == null ? null : (issueMs - obsEndMs) / DAY; }
/** f = 0.5^(max(0, age − expected) / halfLife) ∈ (0, 1]; null age -> 0. */
export function freshness(ageDays, cadence) {
  if (!fin(ageDays)) return 0;
  return 0.5 ** (Math.max(0, ageDays - C2.expected[cadence]) / C2.halfLife[cadence]);
}
/** F1's usability: published by the issue, and its age from the period end within the cadence budget. null = usable. */
export function unusableF1(asOf, cadence, issueMs) {
  const t = Date.parse(asOf ?? '');
  if (!Number.isFinite(t)) return 'no date';
  if (cadence !== 'monthly' && cadence !== 'quarterly' && t > issueMs) return 'published after the issue time';
  const age = ageDaysOf(asOf, cadence, issueMs);
  if (age == null) return 'no date';
  if (age > C2.budgets[cadence]) return `stale (${Math.floor(age)} days past the period end; ${cadence} budget ${C2.budgets[cadence]})`;
  return null;
}

// ── F4: the risk factor ──────────────────────────────────────────────────────────────────────────────────────────
const before = (xs, date) => (xs ?? []).filter(p => p && p.date < date && fin(p.value)).sort((a, b) => (a.date < b.date ? -1 : 1));
function zLast(xs) {   // xs oldest first; z of the last value against the window before it
  const n = xs.length; if (n < C2.risk.minWindow + 1) return null;
  const w = xs.slice(Math.max(0, n - 1 - C2.risk.window), n - 1), m = w.reduce((s, x) => s + x, 0) / w.length;
  const sd = Math.sqrt(w.reduce((s, x) => s + (x - m) ** 2, 0) / (w.length - 1));
  return sd > 0 ? clamp((xs[n - 1] - m) / sd, -C2.risk.zClip, C2.risk.zClip) : null;
}
/**
 * F at an issue date from daily series [{ date, value }] (only points dated before `date`): the equal-weight mean of
 * z(−log VIX), z(−VIX/VIX3M), z(−HY OAS 20-bd change), z(S&P 20-bd log return), each z against its own trailing 252
 * observations (drift-adjusted by construction), clipped ±3; F = clip(mean, −2, 2), needs 3 of the 4.
 */
export function riskFactorAt(series, date) {
  const k = C2.risk.retDays, vix = before(series?.vix, date), v3 = before(series?.vix3m, date), hy = before(series?.hy, date), spx = before(series?.spx, date);
  const lastDate = xs => xs.at(-1)?.date ?? null, dateMs = Date.parse(`${date}T00:00:00Z`);
  const fresh = xs => xs.length && (dateMs - Date.parse(`${lastDate(xs)}T00:00:00Z`)) / DAY <= C2.risk.maxAgeDays;
  const z = {}, why = {};
  if (fresh(vix)) z.vix = zLast(vix.map(p => -Math.log(p.value))); else why.vix = vix.length ? 'stale' : 'no data';
  const v3m = new Map(v3.map(p => [p.date, p.value])), term = vix.filter(p => v3m.get(p.date) > 0).map(p => ({ date: p.date, value: p.value / v3m.get(p.date) }));
  if (fresh(term)) z.term = zLast(term.map(p => -p.value)); else why.term = term.length ? 'stale' : 'no data';
  if (fresh(hy) && hy.length > k) z.credit = zLast(hy.slice(k).map((p, i) => -(p.value - hy[i].value) * 100)); else why.credit = hy.length ? 'stale or short' : 'no data';
  if (fresh(spx) && spx.length > k) z.equity = zLast(spx.slice(k).map((p, i) => Math.log(p.value / spx[i].value))); else why.equity = spx.length ? 'stale or short' : 'no data';
  for (const [n, v] of Object.entries(z)) if (v == null) { delete z[n]; why[n] = 'too little history'; }
  const vals = Object.values(z);
  const score = vals.length >= C2.risk.minInputs ? clip2(vals.reduce((s, x) => s + x, 0) / vals.length) : null;
  return { score: score == null ? null : rnd(score, 4), coverage: vals.length / 4, z: Object.fromEntries(Object.entries(z).map(([n, v]) => [n, rnd(v, 3)])), why,
    asOf: [vix, term, hy, spx].map(lastDate).filter(Boolean).sort()[0] ?? null };
}

// ── F5: expected policy repricing readings ───────────────────────────────────────────────────────────────────────
const ymOf = d => +String(d).slice(0, 4) * 12 + (+String(d).slice(4, 6) - 1);
const ymFromIso = d => +d.slice(0, 4) * 12 + (+d.slice(5, 7) - 1);
const weekdaysBetween = (a, b) => { let n = 0; for (let t = Date.parse(`${a}T12:00:00Z`) + DAY; t <= Date.parse(`${b}T12:00:00Z`); t += DAY) if (new Date(t).getUTCDay() % 6) n++; return n; };
/** The rung nearest `months` ahead (±tolerance), from rungs [{ local, month: 'YYYYMM', rate, date, rate4wAgo, date4wAgo }]. */
export function pickRung(rungs, issueDate, months = C2.repricing.rungMonths, tol = C2.repricing.rungTolMonths) {
  const want = ymFromIso(issueDate) + months; let best = null;
  for (const r of rungs ?? []) { if (!fin(r?.rate) || !/^\d{6}/.test(String(r?.month))) continue; const d = Math.abs(ymOf(r.month) - want); if (!best || d < best.d || (d === best.d && String(r.month) < String(best.r.month))) best = { d, r }; }
  return best && best.d <= tol ? best.r : null;
}
/**
 * One currency's futures reading: level P (bp priced over ~6 m vs the policy rate) and change ΔP (bp, the same contract
 * against its own price ~4 weeks earlier), with the continuity checks C1–C6 (spec §4.5). Returns { ok, P, dP, rung, why }.
 */
export function futuresReading(bank, policyRate, issueDate) {
  if (!bank?.rungs?.length) return { ok: false, why: 'no futures strip' };
  const rungs = bank.rungs.filter(r => fin(r?.rate)).sort((a, b) => String(a.month).localeCompare(String(b.month)));
  const r = pickRung(rungs, issueDate);
  if (!r) return { ok: false, why: `no contract within ±${C2.repricing.rungTolMonths} month of ${C2.repricing.rungMonths} months ahead` };
  const base = bank.kind === 'bill' ? rungs[0].rate : policyRate;
  if (!fin(base)) return { ok: false, why: 'no policy rate' };
  const fail = why => ({ ok: false, why, rung: r.local ?? r.month });
  if (!fin(r.rate4wAgo)) return fail('C1: no price 4 weeks ago for this contract');
  const gap = (Date.parse(`${isoDay(r.date)}T12:00:00Z`) - Date.parse(`${isoDay(r.date4wAgo)}T12:00:00Z`)) / DAY;
  if (!fin(gap) || gap < C2.repricing.win4wDays[0] || gap > C2.repricing.win4wDays[1]) return fail(`C2: the 4-week bar is ${fin(gap) ? Math.round(gap) : '?'} days back (needs ${C2.repricing.win4wDays.join('-')})`);
  // C3: the last close within 3 business days of the issue. An exchange's trading-day label can be the issue's own date or the next weekday
  // (Osaka's evening session belongs to the next day), so a later LABEL is allowed; knowability is the pull's own time (removeLookahead).
  const nextWd = (() => { let t = Date.parse(`${issueDate}T12:00:00Z`) + DAY; while (!(new Date(t).getUTCDay() % 6)) t += DAY; return new Date(t).toISOString().slice(0, 10); })();
  if (isoDay(r.date) > nextWd || (isoDay(r.date) < issueDate && weekdaysBetween(isoDay(r.date), issueDate) > C2.repricing.futuresMaxAgeBd)) return fail(`C3: the contract's last close ${isoDay(r.date)} is not within ${C2.repricing.futuresMaxAgeBd} business days of the issue`);
  if (ymOf(r.month) < ymFromIso(issueDate) + C2.repricing.minDeliveryMonths) return fail(`C4: contract month ${r.month} is within ${C2.repricing.minDeliveryMonths} months of delivery`);
  if (r.firstTrade && isoDay(r.date4wAgo) < isoDay(r.firstTrade)) return fail('C5: the contract did not trade 4 weeks ago');
  const dP = (r.rate - r.rate4wAgo) * 100;
  if (Math.abs(dP) > C2.repricing.maxAbsChgBp) return fail(`C6: a ${Math.round(dP)} bp change in 4 weeks is treated as a data error`);
  return { ok: true, P: (r.rate - base) * 100, dP, rung: r.local ?? r.month, month: r.month, kind: bank.kind ?? null, date: isoDay(r.date), source: bank.source ?? 'futures', against: bank.kind === 'bill' ? 'front contract' : 'policy rate' };
}
/** The 2y proxy: level (y2 − policy) × 100 × 0.5 bp and change over 20 business days, bp. */
export function y2Reading(points, policyRate, issueDate) {
  const pts = (points ?? []).filter(p => p && p.date < issueDate && fin(p.value)).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!pts.length) return { ok: false, why: 'no 2y points' };
  const last = pts.at(-1);
  if ((Date.parse(`${issueDate}T00:00:00Z`) - Date.parse(`${last.date}T00:00:00Z`)) / DAY > C2.repricing.y2MaxAgeDays) return { ok: false, why: `2y last point ${last.date} is stale` };
  let back = last.date; for (let i = 0; i < C2.repricing.y2ChgBd; i++) { let t = Date.parse(`${back}T12:00:00Z`) - DAY; while (!(new Date(t).getUTCDay() % 6)) t -= DAY; back = new Date(t).toISOString().slice(0, 10); }
  const prev = [...pts].reverse().find(p => p.date <= back);
  if (!prev || (Date.parse(`${back}T12:00:00Z`) - Date.parse(`${prev.date}T12:00:00Z`)) / DAY > C2.repricing.y2MaxAgeDays) return { ok: false, why: `no 2y point near ${back}` };
  if (!fin(policyRate)) return { ok: false, why: 'no policy rate' };
  return { ok: true, P: (last.value - policyRate) * 100 * C2.repricing.y2LevelFactor, dP: (last.value - prev.value) * 100, proxy: true, date: last.date, y2: last.value, source: '2y government yield (proxy)' };
}

// ── V1's drivers, copied, with the switch hooks (F-off paths are V1's arithmetic exactly) ─────────────────────────
function makeCtx(snap, sw) {
  const inputs = snap.v1 ?? {}, extra = snap.extra ?? {}, asOf = inputs.asOf, issueMs = Date.parse(asOf ?? ''), issueDate = new Date(issueMs).toISOString().slice(0, 10);
  // the age check every V1-shaped driver uses: V1's MAX_AGE_DAYS, or F1's cadence budget measured from the period end
  const bad = (x, key, asOfField = x?.asOf) => {
    if (!sw.F1) return unusable(asOfField, issueMs, MAX_AGE_DAYS[key]);
    const cad = CADENCE_OF_KEY[key] ?? 'daily';
    const a = key === 'cot' && asOfField ? new Date(Date.parse(asOfField) - 3 * DAY).toISOString() : asOfField;   // COT: the Tuesday report, not the Friday release
    return Date.parse(asOfField ?? '') > issueMs ? 'published after the issue time' : unusableF1(a, cad, issueMs);
  };
  return { inputs, extra, sw, asOf, issueMs, issueDate, bad };
}
function v1Policy(c, X) {
  const { inputs, issueMs, sw } = X;
  const p = inputs?.policy?.[c], st = sw.F3 ? null : inputs?.stance?.[c], base = { key: 'policy', label: 'Policy path', w: CCY_WEIGHTS.policy, source: sw.F3 ? '/api/cb-expectations' : '/api/cb-expectations + /api/macro-scorecard cbSentiment' };
  const b = p ? X.bad(p, 'policy') : (inputs?.policyWhy?.[c] ?? 'no policy expectations');
  if (b || !fin(p.weekBp)) return { ...base, d: null, why: b ?? `no week change in the ${p.proxy ? '2y series' : 'futures pull'}` };
  const stOk = st && fin(st.score) && !X.bad(st, 'stance', st.asOf ?? st.meetingDate);
  const dSt = stOk ? (st.score >= TH.stance ? 1 : st.score <= -TH.stance ? -1 : 0) : 0;
  const d = clamp(band(p.weekBp, TH.policyWeekBp) + dSt, -2, 2);
  const what = p.proxy ? `2y yield ${sgn(p.weekBp, 0)}bp over the week (proxy, futures ${/stale/.test(p.futuresWhy ?? '') ? 'stale' : 'missing'})` : `${p.horizon ?? '6m'} priced ${sgn(p.weekBp, 0)}bp over the week`;
  return { ...base, ...(p.proxy ? { source: sw.F3 ? (p.source ?? '2y government yield') : `${p.source ?? '2y government yield'} + /api/macro-scorecard cbSentiment`, proxy: true } : {}), d, asOf: p.asOf,
    reading: `${what}${stOk ? `; stance ${st.score >= TH.stance ? 'hawkish' : st.score <= -TH.stance ? 'dovish' : 'neutral'} (${sgn(st.score)}, ${st.meetingDate ?? ''})` : ''}`, policyD: d };
}
function v1Rates(c, X, avg) {
  const r = X.inputs?.rates?.[c], base = { key: 'rates', label: 'Rate differential trend', w: CCY_WEIGHTS.rates, source: '/api/rate-diff' };
  const b = r ? X.bad(r, 'rates') : 'no short rate';
  if (b || !fin(r.z)) return { ...base, d: null, why: b ?? 'no z (too little history)' };
  const gap = fin(r.level) && fin(avg) ? r.level - avg : null;
  const d = clamp(band(r.z, TH.ratesZ) + (gap == null ? 0 : gap >= TH.ratesGapPp ? 1 : gap <= -TH.ratesGapPp ? -1 : 0), -2, 2);
  return { ...base, d, asOf: r.asOf, reading: `short rate ${fin(r.level) ? `${r.level.toFixed(2)}%` : '?'}${gap == null ? '' : ` (${sgn(gap)}pp vs the 8 average)`}, z ${sgn(r.z)} vs its own history` };
}
/** F1's data momentum: recomputed from the scorecard's dimensions, each within its own cadence budget; dated by its oldest. */
export function dataF1(c, extra, issueMs) {
  const row = extra?.scorecard?.[c];
  if (!row?.dims) return { score: null, why: 'no scorecard dimensions' };
  const facs = [], used = [];
  for (const k of ['growth', 'inflation', 'labour', 'demand']) {
    const ok = (FACTORS[k]?.dims ?? []).filter(dim => fin(row.dims[dim]) && row.asOf?.[dim] && !unusableF1(row.asOf[dim], cadenceOfDim(dim, c), issueMs));
    if (!ok.length) continue;
    facs.push(+(ok.reduce((s, dim) => s + row.dims[dim], 0) / ok.length).toFixed(2));
    used.push(...ok.map(dim => ({ dim, cadence: cadenceOfDim(dim, c), asOf: row.asOf[dim], age: ageDaysOf(row.asOf[dim], cadenceOfDim(dim, c), issueMs) })));
  }
  if (facs.length < 2) return { score: null, why: `${facs.length} of 4 factors within budget (needs 2)`, used };
  const oldest = used.reduce((a, x) => (x.age > a.age ? x : a));
  return { score: facs.reduce((s, x) => s + x, 0) / facs.length, factors: facs.length, used, oldest, asOf: new Date(issueMs - oldest.age * DAY).toISOString() };
}
function v1Data(c, X, w = CCY_WEIGHTS.data, key = 'data', label = 'Data momentum') {
  const base = { key, label, w, source: '/api/macro-scorecard' };
  if (X.sw.F1) {
    const x = dataF1(c, X.extra, X.issueMs);
    if (!fin(x.score)) return { ...base, d: null, why: x.why };
    return { ...base, d: band(x.score, TH.data), asOf: x.asOf, reading: `${c} growth/inflation/labour/demand ${sgn(x.score)} (${x.factors} factors; oldest ${x.oldest.dim} ${Math.floor(x.oldest.age)} d past period end)`, oldestAgeDays: x.oldest.age, oldestCadence: x.oldest.cadence };
  }
  const x = X.inputs?.data?.[c];
  const b = x ? unusable(x.asOf, X.issueMs, MAX_AGE_DAYS.data) : 'no scorecard factors';
  if (b || !fin(x.score)) return { ...base, d: null, why: b ?? 'no score' };
  return { ...base, d: band(x.score, TH.data), asOf: x.asOf, reading: `${c} growth/inflation/labour/demand ${sgn(x.score)}` };
}
function v1RealYield(c, X, avg) {
  const x = X.inputs?.realYield?.[c], base = { key: 'realYield', label: 'Real yield', w: CCY_WEIGHTS.realYield, source: '/api/real-yield' };
  if (!x && !REAL_YIELD_UNIVERSE.includes(c)) return { ...base, d: null, na: true, why: 'no real-yield series for this currency (not held)' };
  const b = x ? X.bad(x, 'realYield') : 'no real yield';
  if (b || !fin(x.level)) return { ...base, d: null, why: b ?? 'no level' };
  const gap = fin(avg) ? x.level - avg : null;
  const dl = gap == null ? 0 : gap >= TH.realGapPp ? 1 : gap <= -TH.realGapPp ? -1 : 0, dz = fin(x.z) ? (x.z >= TH.realZ ? 1 : x.z <= -TH.realZ ? -1 : 0) : 0;
  return { ...base, d: clamp(dl + dz, -2, 2), asOf: x.asOf, reading: `10y real ${x.level.toFixed(2)}%${gap == null ? '' : ` (${sgn(gap)}pp vs peers)`}${fin(x.z) ? `, z ${sgn(x.z)}` : ''}` };
}
function v1Role(name, R, w, label = 'Risk role × R', fLabel = false) {
  const role = RISK_ROLE[name] ?? 0, base = { key: 'risk', label: fLabel ? label.replace(/\bR\b/, 'F') : label, w, source: fLabel ? 'bias-engine-v2 risk factor F' : 'bias-engine risk score' };
  if (!R || !fin(R.score) || R.coverage < MIN_COVERAGE) return { ...base, d: null, why: fLabel ? 'risk factor unavailable' : 'risk score unavailable' };
  const x = role * R.score;
  return { ...base, d: band(x, TH.roleR) + 0, asOf: R.asOf, reading: `role ${sgn(role)} × ${fLabel ? 'F' : 'R'} ${sgn(R.score)} = ${sgn(x)}` };
}
function v1Cot(name, X, w) {
  const x = X.inputs?.cot?.[name], base = { key: 'positioning', label: 'Positioning (COT, contrarian)', w, source: '/api/cot-state' };
  if (X.sw.F3) return { ...base, d: null, na: true, why: 'context only (F3: COT out of the score)' };
  if (!x && COT_UNIVERSE_MISSING.includes(name)) return { ...base, d: null, na: true, why: 'no COT contract tracked for this market (not held)' };
  const b = x ? X.bad(x, 'cot') : 'no COT row';
  if (b || !fin(x.pct)) return { ...base, d: null, why: b ?? 'no percentile' };
  const { crowded, leaning } = TH.cotPct, p = x.pct, long = !fin(x.share) || x.share > 0, short = !fin(x.share) || x.share < 0;
  const d = p >= crowded && long ? -2 : p >= leaning ? -1 : p <= 100 - crowded && short ? 2 : p <= 100 - leaning ? 1 : 0;
  return { ...base, d, asOf: x.asOf, reading: `speculators at the ${Math.round(p)}th percentile${fin(x.share) ? `, net ${x.share > 0 ? 'long' : 'short'} ${Math.abs(x.share).toFixed(1)}% of OI` : ''}` };
}
const trendWord = z => (z == null ? 'n/a' : z >= TH.trendZ[0] ? `up (${z.toFixed(2)})` : z <= -TH.trendZ[0] ? `down (${z.toFixed(2)})` : `flat (${z.toFixed(2)})`);
function v1Trend(name, zD1, zH4, w, asOf, src) {
  const base = { key: 'trend', label: 'Trend (D1/H4 EMA20)', w, source: src };
  const d = trendD(zD1, zH4);
  if (d == null) return { ...base, d: null, why: 'too few closed daily bars' };
  return { ...base, d, asOf, reading: `D1 ${trendWord(zD1)}, H4 ${trendWord(zH4)}${zH4 != null && d === 0 && band(zD1, TH.trendZ) && band(zH4, TH.trendZ) && Math.sign(zD1) !== Math.sign(zH4) ? ': timeframes conflict' : ''}` };
}
const lastAsOf = (bars, durMs) => (bars?.length ? new Date(bars.at(-1).t + durMs).toISOString() : null);
function priceTrend(name, X) {
  const d1 = closedBars(X.inputs?.prices?.d1?.[name], X.issueMs, DAY), h4 = closedBars(X.inputs?.prices?.h4?.[name], X.issueMs, H4);
  const fresh = d1.length && !X.bad(null, 'prices', lastAsOf(d1, DAY));
  return { d1: fresh ? d1 : [], zD1: fresh ? slopeZ(d1.map(b => Math.log(b.c))) : null, zH4: fresh && h4.length ? slopeZ(h4.map(b => Math.log(b.c))) : null, asOf: lastAsOf(d1, DAY) };
}
const ret20 = bars => (bars.length > 20 ? (bars.at(-1).c / bars.at(-21).c - 1) * 100 : null);
function v1UsReal(X, w, key, label) {
  const x = X.inputs?.usReal, base = { key, label, w, source: 'FRED DFII10 (US 10y TIPS yield)' };
  const b = x ? X.bad(x, 'usReal') : 'no US real yield series';
  if (b || !fin(x.chg20bp)) return { ...base, d: null, why: b ?? 'no 20-day change' };
  return { ...base, d: -band(x.chg20bp, TH.usRealChg20bp) || 0, asOf: x.asOf, reading: `US 10y real ${fin(x.level) ? `${x.level.toFixed(2)}% ` : ''}${sgn(x.chg20bp, 0)}bp in 20 days (falling = supportive)` };
}
function v1Usd(usd, w, label = 'USD (inverted)') {
  const base = { key: 'usd', label, w, source: 'bias-engine USD score' };
  if (!usd || !fin(usd.score) || usd.coverage < MIN_COVERAGE) return { ...base, d: null, why: 'USD score unavailable' };
  return { ...base, d: -band(usd.score, TH.usdScore) || 0, asOf: usd.asOf, reading: `USD score ${sgn(usd.score)} (${usd.dir === 'NEUTRAL' ? `below its own call threshold, ${usd.strength}/10` : `${dirWord(usd.dir)} ${usd.strength}/10`})` };
}
/** A central bank's path for an asset: V1's −policy d, or (F5) −(the bank's own repricing d). */
function pathFor(ccy, X, legs, w, label) {
  const base = { key: ccy === 'USD' ? 'fedPath' : 'ratesPath', label, w, source: '/api/cb-expectations' };
  if (X.sw.F5) {
    const r = X.rep[ccy];
    if (!r?.ok) return { ...base, d: null, why: `no ${ccy} repricing reading (${r?.why ?? 'none'})` };
    const dl = clip2(r.P / C2.repricing.levelScaleBp), dc = clip2(r.dP / C2.repricing.chgScaleBp), d = -(C2.repricing.mix[0] * dl + C2.repricing.mix[1] * dc) || 0;
    return { ...base, ...(r.proxy ? { proxy: true, source: r.source } : {}), d, asOf: X.asOf, reading: `${ccy} priced ${sgn(r.P, 0)}bp by 6 m, ${sgn(r.dP, 0)}bp in 20 bd (${r.proxy ? '2y proxy' : r.rung}); hawkish = −`, components: { level: -C2.repricing.mix[0] * dl || 0, change: -C2.repricing.mix[1] * dc || 0 } };
  }
  const p = legs[ccy]?._policyD;
  if (!fin(p)) return { ...base, d: null, why: `no ${ccy} policy expectations` };
  return { ...base, ...(legs[ccy]._policyProxy ? { source: legs[ccy]._policySource, proxy: true } : {}), d: -p || 0, asOf: legs[ccy]._policyAsOf, reading: `${ccy} policy ${sgn(p, 0)}: ${legs[ccy]._policyReading}` };
}
function finish(name, c, extra = {}) {
  const lab = labelOf(c.score, c.coverage, c.drivers.map(x => x.contrib));
  const m = { score: c.score, dir: lab.dir, strength: lab.strength, coverage: c.coverage, ...(lab.neutral ? { neutral: lab.neutral } : {}), ...extra, drivers: c.drivers, missing: c.missing };
  m.why = whyLine(name, m); m.flip = flipLine(m);
  return m;
}

// ── bilateral drivers (F2 carry, F5 repricing) ───────────────────────────────────────────────────────────────────
function policyRatesOf(X) {
  const t = X.extra?.policyRates, fetched = Date.parse(t?.fetchedAt ?? '');
  // the table is fetched during the issue's own gather, so a fetch up to 2 h after the issue time is the same reading; its rates are decisions in force
  const stale = !Number.isFinite(fetched) || fetched > X.issueMs + 2 * 3600e3 || (X.issueMs - fetched) / DAY > C2.policyTableMaxAgeDays;
  const out = {};
  for (const c of CCYS) { const v = t?.rates?.[c]; out[c] = !stale && fin(v?.rate) ? v.rate : null; }
  return { rates: out, why: stale ? 'the policy-rate table is missing or older than its daily budget' : null, fetchedAt: t?.fetchedAt ?? null };
}
function repricingOf(X, rates) {
  const out = {};
  for (const c of CCYS) {
    const f = futuresReading(X.extra?.futures?.banks?.[c], rates[c], X.issueDate);
    if (f.ok) { out[c] = f; continue; }
    const p = y2Reading(X.extra?.y2?.[c]?.points, rates[c], X.issueDate);
    out[c] = p.ok ? { ...p, futuresWhy: f.why } : { ok: false, why: `futures: ${f.why}; 2y proxy: ${p.why}` };
  }
  return out;
}
const carryDriver = (gapPp, readingTxt) => ({ key: 'carry', label: 'Carry (policy-rate gap)', w: CCY_WEIGHTS.rates, bilateral: true, source: '/api/cb-expectations policy rates',
  d: fin(gapPp) ? clip2(gapPp / C2.carryScalePp) : null, reading: readingTxt, ...(fin(gapPp) ? {} : { why: 'a policy rate is missing' }) });
function repricingDriver(gP, gdP, readingTxt, flags = {}) {
  const base = { key: 'repricing', label: 'Expected policy repricing (6 m)', w: CCY_WEIGHTS.policy, bilateral: true, source: 'rate futures (6 m rung) / 2y proxy', ...flags };
  if (!fin(gP) || !fin(gdP)) return { ...base, d: null, why: 'a repricing reading is missing' };
  const dl = clip2(gP / C2.repricing.levelScaleBp), dc = clip2(gdP / C2.repricing.chgScaleBp);
  return { ...base, d: C2.repricing.mix[0] * dl + C2.repricing.mix[1] * dc, components: { level: C2.repricing.mix[0] * dl, change: C2.repricing.mix[1] * dc }, reading: readingTxt };
}
function basketMean(vals, c) {
  const xs = CCYS.filter(j => j !== c).map(j => vals[j]).filter(fin);
  return xs.length >= C2.basketMin ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}

// ── one variant ─────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Build one variant from a snapshot { v1: V1's inputs (as _beGather), extra: { policyRates, futures, y2, riskSeries,
 * scorecard, riskGate } } under switches sw. Returns { switches, risk, currencies, markets } with V1's shapes plus the
 * V2 fields (spec §5).
 */
export function buildVariant(snap, sw) {
  const X = makeCtx(snap, sw), { inputs, issueMs, asOf } = X;
  if (!Number.isFinite(issueMs)) throw new Error('snapshot.v1.asOf (the issue time) is required');
  const f4 = !!sw.F4 && snap?.extra?.riskGate?.pass === true;

  // risk: V1's R (with F1's budgets when F1 is on) or F
  const spxT = priceTrend('SPX500', X), spxBars = spxT.d1, spx = spxBars.length > 20 ? { ret20: ret20(spxBars), asOf: lastAsOf(spxBars, DAY) } : null;
  const v1Risk = (() => {
    if (!sw.F1) return { ...riskScore(inputs, issueMs, spx), asOf };
    const r = inputs?.risk ?? {}, nr = {};   // F1: the risk inputs are daily: drop any older than the daily budget, then V1's own scoring
    for (const [k, v] of Object.entries(r)) if (v && !unusableF1(v.asOf, 'daily', issueMs)) nr[k] = { ...v, asOf: asOf };
    return { ...riskScore({ ...inputs, risk: nr }, issueMs, spx), asOf };
  })();
  const F = f4 ? { ...riskFactorAt(snap.extra?.riskSeries, X.issueDate), asOf } : null;
  const R = f4 ? F : v1Risk;

  const pr = (sw.F2 || sw.F5) ? policyRatesOf(X) : null;
  X.rep = sw.F5 ? repricingOf(X, pr.rates) : {};

  // the currency legs: V1's drivers, minus the ones a bilateral switch takes over
  const bD1 = basketIndex(inputs?.prices?.d1, issueMs, DAY), bH4 = basketIndex(inputs?.prices?.h4, issueMs, H4);
  const bFresh = bD1?.lastT != null && !X.bad(null, 'prices', new Date(bD1.lastT + DAY).toISOString());
  const avgOf = (blk, k, key) => { const v = CCYS.map(c => blk?.[c]).filter(x => x && fin(x[k]) && !X.bad(x, key)).map(x => x[k]); return v.length >= 4 ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const rateAvg = avgOf(inputs?.rates, 'level', 'rates'), realAvg = avgOf(inputs?.realYield, 'level', 'realYield');
  const legs = {};
  for (const c of CCYS) {
    const pol = v1Policy(c, X);
    const dr = [];
    if (!sw.F5) dr.push(pol);
    if (!sw.F2) dr.push(v1Rates(c, X, rateAvg));
    dr.push(v1Data(c, X), v1RealYield(c, X, realAvg), v1Role(c, R, CCY_WEIGHTS.risk, 'Risk role × R', f4));
    if (c in COMMODITY_OF) {
      const name = COMMODITY_OF[c], base = { key: 'commodity', label: `Commodity link${name ? ` (${name === 'WTI' ? 'oil' : 'copper'})` : ' (dairy)'}`, w: CCY_WEIGHTS.commodity, source: name ? `OANDA ${name} daily` : 'none' };
      if (!name) dr.push({ ...base, d: null, why: 'no dairy price feed' });
      else { const bars = priceTrend(name, X).d1, x = ret20(bars); dr.push(x == null ? { ...base, d: null, why: `no ${name} daily closes` } : { ...base, d: band(x, TH.commodityPct), asOf: lastAsOf(bars, DAY), reading: `${name === 'WTI' ? 'WTI' : 'copper'} ${pctS(x)} in 20 sessions` }); }
    } else dr.push({ key: 'commodity', label: 'Commodity link', w: CCY_WEIGHTS.commodity, na: true });
    dr.push(v1Cot(c, X, CCY_WEIGHTS.positioning));
    dr.push(bFresh ? v1Trend(c, slopeZ(bD1.index[c]), bH4 ? slopeZ(bH4.index[c]) : null, CCY_WEIGHTS.trend, new Date(bD1.lastT + DAY).toISOString(), 'OANDA D1/H4, 7 USD majors → 8-currency basket')
      : { key: 'trend', label: 'Trend (D1/H4 EMA20)', w: CCY_WEIGHTS.trend, d: null, why: 'no basket candles' });
    const m = finish(c, combine(dr), { riskRole: RISK_ROLE[c] });
    Object.defineProperties(m, { _policyD: { value: pol.policyD ?? null }, _policyAsOf: { value: pol.asOf ?? null }, _policyReading: { value: pol.reading ?? null },
      _policyProxy: { value: !!pol.proxy }, _policySource: { value: pol.source }, _W: { value: dr.filter(x => !x.na).reduce((s, x) => s + x.w, 0) } });
    m.asOf = asOf;
    legs[c] = m;
  }

  // bilateral drivers for a pair or for a currency against its basket
  const bilateral = (b, q) => {   // q = null: the basket
    const out = [];
    if (sw.F2) {
      const rb = pr.rates[b], rq = q ? pr.rates[q] : basketMean(pr.rates, b);
      const gap = fin(rb) && fin(rq) ? rb - rq : null;
      out.push(carryDriver(gap, gap == null ? null : `${b} ${rb.toFixed(2)}% vs ${q ?? 'basket'} ${rq.toFixed(2)}%: ${sgn(gap)}pp`));
    }
    if (sw.F5) {
      const rb = X.rep[b], val = k => (q ? (X.rep[q]?.ok ? X.rep[q][k] : null) : basketMean(Object.fromEntries(CCYS.map(c => [c, X.rep[c]?.ok ? X.rep[c][k] : null])), b));
      const P = rb?.ok && fin(val('P')) ? rb.P - val('P') : null, dP = rb?.ok && fin(val('dP')) ? rb.dP - val('dP') : null;
      const mixed = q && rb?.ok && X.rep[q]?.ok && !!rb.proxy !== !!X.rep[q].proxy;
      out.push(repricingDriver(P, dP, P == null ? null : `priced 6 m gap ${sgn(P, 0)}bp; 20-bd change ${sgn(dP, 0)}bp`, { ...(mixed ? { mixedSource: true } : {}), ...((rb?.proxy || (q && X.rep[q]?.proxy)) ? { proxy: true } : {}) }));
    }
    return out;
  };
  // S = [W_L·legPart + Σ_B w·d] / [W_L + Σ_B w(avail)], contributions listed per leg (V1 style) and per bilateral driver
  const blend = (name, legPart, legDrivers, legMissing, WL, legCov, bil, extra) => {
    const avail = bil.filter(x => fin(x.d)), Wb = avail.reduce((s, x) => s + x.w, 0), Wapp = bil.reduce((s, x) => s + x.w, 0), den = WL + Wb;
    const score = fin(legPart) && den > 0 ? rnd((WL * legPart + avail.reduce((s, x) => s + x.w * x.d, 0)) / den, 4) : null;
    const k = den > 0 ? WL / den : 0;
    const drivers = [...legDrivers.map(x => ({ ...x, contrib: rnd(x.contrib * k, 4) })),
      ...avail.map(x => ({ key: x.key, label: x.label, reading: x.reading, d: rnd(x.d, 4), w: x.w, wNorm: rnd(x.w / den, 4), contrib: rnd(x.w * x.d / den, 4), source: x.source, bilateral: true,
        ...(x.components ? { components: Object.fromEntries(Object.entries(x.components).map(([c, v]) => [c, rnd(x.w * v / den, 4)])) } : {}), ...(x.proxy ? { proxy: true } : {}), ...(x.mixedSource ? { mixedSource: true } : {}) }))];
    const missing = [...legMissing, ...bil.filter(x => !fin(x.d)).map(x => ({ key: x.key, label: x.label, w: x.w, why: x.why }))];
    const coverage = rnd((WL * legCov + Wb) / (WL + Wapp), 3);
    return finish(name, { score, coverage, drivers, missing }, extra);
  };

  const currencies = {};
  for (const c of CCYS) {
    const bil = bilateral(c, null);
    if (!bil.length) { currencies[c] = legs[c]; continue; }
    const L = legs[c];
    const m = blend(c, L.score, L.drivers, L.missing, L._W, L.coverage, bil, { riskRole: RISK_ROLE[c] });
    m.asOf = asOf; currencies[c] = m;
  }
  // a pair in either orientation: its bilateral drivers come from the two legs' readings only, never from the currency views
  const pairOf = (b, q) => {
    const bil = bilateral(b, q);
    if (!bil.length) return pairFrom(b, q, legs);
    const L = pairFrom(b, q, legs), WL = (legs[b]._W + legs[q]._W) / 2;
    const legPart = fin(legs[b].score) && fin(legs[q].score) ? (legs[b].score - legs[q].score) / 2 : null;
    return blend(`${b}/${q}`, legPart, L.drivers, L.missing, WL, Math.min(legs[b].coverage ?? 0, legs[q].coverage ?? 0), bil, { legs: [b, q], legScores: { [b]: legs[b].score, [q]: legs[q].score } });
  };
  const markets = {};
  for (const p of allPairs()) markets[p] = pairOf(p.slice(0, 3), p.slice(3));

  // assets (V1's models; F2/F5 change the USD view, F5 the bank paths, F4 the risk input, F3 removes COT)
  const usd = currencies.USD;
  const goldLike = (name, extraNote) => {
    const t = priceTrend(name, X);
    const dr = [v1UsReal(X, GOLD_WEIGHTS.realYield, 'realYield', 'US real yield (falling = +)'), v1Usd(usd, GOLD_WEIGHTS.usd),
      pathFor('USD', X, legs, GOLD_WEIGHTS.fedPath, 'Fed path (dovish = +)'), v1Role(name, R, GOLD_WEIGHTS.risk, name === 'GOLD' ? 'Risk / fear (−R)' : 'Risk (industrial, +0.5 R)', f4),
      v1Cot(name, X, GOLD_WEIGHTS.positioning), v1Trend(name, t.zD1, t.zH4, GOLD_WEIGHTS.trend, t.asOf, `OANDA ${name} D1/H4`)];
    return finish(name, combine(dr), { model: name === 'GOLD' ? 'gold' : 'silver (gold model, R +0.5)', ...(extraNote ? { note: extraNote } : {}), asOf });
  };
  markets.GOLD = goldLike('GOLD');
  markets.SILVER = goldLike('SILVER', 'Gold model with the risk role at +0.5 (industrial demand).');
  for (const name of ['NQ', 'SPX500', 'US30', 'US2000']) {
    const t = priceTrend(name, X);
    const dr = [v1UsReal(X, INDEX_WEIGHTS.rates, 'rates', 'Rates and real yields (falling = +)'), pathFor('USD', X, legs, INDEX_WEIGHTS.fedPath, 'Fed path (dovish = +)'),
      v1Role(name, R, INDEX_WEIGHTS.risk, 'Risk and credit (R)', f4), v1Data('USD', X, INDEX_WEIGHTS.data, 'data', 'US data momentum'),
      v1Cot(name, X, INDEX_WEIGHTS.positioning), v1Trend(name, t.zD1, t.zH4, INDEX_WEIGHTS.trend, t.asOf, `OANDA ${name} D1/H4`)];
    markets[name] = finish(name, combine(dr), { model: 'us-index', asOf });
  }
  for (const [name, ccy] of [['DE30', 'EUR'], ['UK100', 'GBP']]) {
    const t = priceTrend(name, X), own = currencies[ccy];
    const ccyD = own && fin(own.score) && own.coverage >= MIN_COVERAGE
      ? { key: 'ccy', label: `${ccy} (weaker = +)`, w: EU_INDEX_WEIGHTS.ccy, d: -band(own.score, TH.usdScore) || 0, asOf, source: `bias-engine ${ccy} score`, reading: `${ccy} score ${sgn(own.score)}` }
      : { key: 'ccy', label: `${ccy} (weaker = +)`, w: EU_INDEX_WEIGHTS.ccy, d: null, why: `${ccy} score unavailable` };
    const dr = [pathFor(ccy, X, legs, EU_INDEX_WEIGHTS.ratesPath, `${ccy === 'EUR' ? 'ECB' : 'BoE'} path (dovish = +)`), ccyD, v1Role(name, R, EU_INDEX_WEIGHTS.risk, 'Risk (R)', f4),
      v1Data(ccy, X, EU_INDEX_WEIGHTS.data, 'data', `${ccy} data momentum`), v1Trend(name, t.zD1, t.zH4, EU_INDEX_WEIGHTS.trend, t.asOf, `OANDA ${name} D1/H4`),
      v1Cot(name, X, EU_INDEX_WEIGHTS.positioning)];
    markets[name] = finish(name, combine(dr), { model: 'eu-index', asOf });
  }
  const gData = (() => {
    const v = sw.F1 ? CCYS.map(c => dataF1(c, X.extra, issueMs)).filter(x => fin(x.score)).map(x => ({ score: x.score, asOf: x.asOf }))
      : CCYS.map(c => inputs?.data?.[c]).filter(x => x && fin(x.score) && !unusable(x.asOf, issueMs, MAX_AGE_DAYS.data));
    if (v.length < TH.globalDataMin) return null;
    return { score: v.reduce((s, x) => s + x.score, 0) / v.length, n: v.length, asOf: v.map(x => x.asOf).sort().at(-1) };
  })();
  for (const name of ['WTI', 'COPPER']) {
    const t = priceTrend(name, X);
    const dr = [v1Usd(usd, CMDTY_WEIGHTS.usd),
      gData ? { key: 'globalData', label: 'Global data momentum', w: CMDTY_WEIGHTS.globalData, d: band(gData.score, TH.data), asOf: gData.asOf, source: '/api/macro-scorecard', reading: `mean of ${gData.n} economies ${sgn(gData.score)}` }
        : { key: 'globalData', label: 'Global data momentum', w: CMDTY_WEIGHTS.globalData, d: null, why: `fewer than ${TH.globalDataMin} economies scored` },
      v1Role(name, R, CMDTY_WEIGHTS.risk, 'Risk (R)', f4),
      name === 'WTI' ? { key: 'inventories', label: 'Inventories (EIA)', w: CMDTY_WEIGHTS.inventories, d: null, why: 'no EIA inventory feed held' } : { key: 'inventories', label: 'Inventories', w: CMDTY_WEIGHTS.inventories, na: true },
      v1Trend(name, t.zD1, t.zH4, CMDTY_WEIGHTS.trend, t.asOf, `OANDA ${name} D1/H4`)];
    markets[name] = finish(name, combine(dr), { model: 'commodity', asOf });
  }

  const v = { switches: { ...sw }, ...(sw.F4 && !f4 ? { f4Blocked: 'the risk gate G-F4 has not passed: F4 is off in this variant' } : {}),
    risk: f4 ? { kind: 'F', ...F } : { kind: 'R', score: v1Risk.score, coverage: v1Risk.coverage, drivers: v1Risk.drivers },
    // F is always computed and shown, so its reading can be watched even while the gate keeps it out of the score
    riskFactorContext: snap?.extra?.riskSeries ? { ...riskFactorAt(snap.extra.riskSeries, X.issueDate), usedInScore: f4 } : null,
    currencies, markets };
  decorate(v, X, pr);
  Object.defineProperty(v, 'pairOf', { value: (b, q) => { const m = pairOf(b, q); decorate({ currencies: {}, markets: { [b + q]: m } }, X, pr); return m; } });
  return v;
}

// ── V2 output fields: dataQuality, agreement, support, confidence, context, pair features ────────────────────────
const UNCALIBRATED = Object.freeze({ status: 'uncalibrated', haveDays: 0, needDays: C2.confidenceMinDays, note: 'no forward calibration yet; strength is a magnitude, not a probability' });
/** Freshness of a driver from the snapshot, measured the F1 way in every variant (quality is a measurement, not a score input). */
function driverF(x, X, leg) {
  const key = x.key, issueMs = X.issueMs;
  if (key === 'data' || key === 'globalData') {
    const cs = key === 'data' ? [leg ?? null].filter(Boolean) : CCYS;
    const fs = cs.map(c => dataF1(c, X.extra, issueMs)).filter(d => d.oldest).map(d => freshness(d.oldest.age, d.oldest.cadence));
    return fs.length ? Math.min(...fs) : (fin(x.d) ? 0.5 : 0);
  }
  const cad = key === 'rates' || key === 'realYield' ? 'monthly' : key === 'positioning' ? 'weekly' : 'daily';
  if (!x.asOf) return fin(x.d) ? 1 : 0;
  return freshness(ageDaysOf(x.asOf, cad, issueMs), cad);
}
function decorate(v, X, pr) {
  const ctx = context(X, pr);
  const addFields = (name, m, isPair, legsOf = null) => {
    if (!m) return;
    const drivers = m.drivers ?? [];
    for (const x of drivers) { x.family = FAMILY_OF[x.key] ?? x.key; x.f = rnd(driverF(x, X, x.leg ?? (CCYS.includes(name) ? name : null)), 3); }
    const tot = drivers.reduce((s, x) => s + Math.abs(x.contrib ?? 0), 0), s = Math.sign(m.score ?? 0);
    m.agreement = tot > 0 && s ? rnd(drivers.filter(x => Math.sign(x.contrib) === s).reduce((a, x) => a + Math.abs(x.contrib), 0) / tot, 3) : null;
    const fam = {};
    for (const x of drivers) fam[x.family] = (fam[x.family] ?? 0) + (x.contrib ?? 0);
    m.support = { for: Object.entries(fam).filter(([, n]) => s && Math.sign(n) === s && Math.abs(n) >= C2.familyMin).map(([k]) => k).sort(),
      against: Object.entries(fam).filter(([, n]) => s && Math.sign(n) === -s && Math.abs(n) >= C2.familyMin).map(([k]) => k).sort(), families: Object.keys(fam).length };
    const appW = drivers.reduce((a, x) => a + (x.leg ? x.w / 2 : x.w), 0) + (m.missing ?? []).reduce((a, x) => a + (x.leg ? x.w / 2 : x.w), 0);
    m.dataQuality = appW > 0 ? rnd(drivers.reduce((a, x) => a + (x.leg ? x.w / 2 : x.w) * x.f, 0) / appW, 3) : 0;
    m.confidence = UNCALIBRATED;
    m.direction = m.dir;
    if (isPair) { const [b, q] = legsOf; m.pairFeatures = pairFeatures(b, q, ctx); m.context = { stance: { [b]: ctx.stance[b] ?? null, [q]: ctx.stance[q] ?? null }, cot: { [b]: ctx.cot[b] ?? null, [q]: ctx.cot[q] ?? null }, policyCurve: { [b]: ctx.curve[b] ?? null, [q]: ctx.curve[q] ?? null } }; }
    else m.context = { stance: ctx.stance[name] ?? null, cot: ctx.cot[name] ?? null, policyCurve: ctx.curve[name] ?? null };
  };
  for (const [c, m] of Object.entries(v.currencies)) addFields(c, m, false);
  for (const [p, m] of Object.entries(v.markets)) addFields(p, m, !!m?.legs, m?.legs ?? null);
}
function context(X, pr) {
  const stance = {}, cot = {}, curve = {}, rates = pr?.rates ?? policyRatesOf(X).rates, y2 = {};
  for (const [c, s] of Object.entries(X.inputs?.stance ?? {})) stance[c] = { score: s.score, meetingDate: s.meetingDate ?? null, note: 'banked NULL as a direction signal (cb-tone-direction); context only' };
  for (const [c, s] of Object.entries(X.inputs?.cot ?? {})) cot[c] = { percentile: s.pct, netShare: s.share ?? null, crowded: fin(s.pct) && (s.pct >= TH.cotPct.crowded || s.pct <= 100 - TH.cotPct.crowded), asOf: s.asOf, note: 'context only' };
  for (const c of CCYS) {
    const bank = X.extra?.futures?.banks?.[c];
    if (bank?.rungs?.length) {
      const pt = m => { const r = pickRung(bank.rungs, X.issueDate, m, 1); return r ? { month: r.month, rung: r.local ?? null, bp: fin(rates[c]) ? rnd((r.rate - rates[c]) * 100, 1) : null, chg4wBp: fin(r.rate4wAgo) ? rnd((r.rate - r.rate4wAgo) * 100, 1) : null } : null; };
      curve[c] = { m3: pt(3), m6: pt(6), m12: pt(12), kind: bank.kind ?? null };
    }
    const pts = (X.extra?.y2?.[c]?.points ?? []).filter(p => p.date < X.issueDate && fin(p.value));
    y2[c] = pts.length ? pts.at(-1).value : null;
  }
  return { stance, cot, curve, rates, y2, rep: X.rep ?? {} };
}
function pairFeatures(b, q, ctx) {
  const d = (x, y) => (fin(x) && fin(y) ? rnd(x - y, 4) : null), r = ctx.rep;
  return { carryGapPp: d(ctx.rates[b], ctx.rates[q]), expectedGapBp: r[b]?.ok && r[q]?.ok ? d(r[b].P, r[q].P) : null, expectedChgBp: r[b]?.ok && r[q]?.ok ? d(r[b].dP, r[q].dP) : null,
    y2GapPp: d(ctx.y2[b], ctx.y2[q]), legs: [b, q], sources: { [b]: r[b]?.ok ? (r[b].proxy ? '2y proxy' : r[b].rung) : null, [q]: r[q]?.ok ? (r[q].proxy ? '2y proxy' : r[q].rung) : null } };
}

// ── the lookahead guard and the whole record ─────────────────────────────────────────────────────────────────────
/** Remove every extra reading dated on or after the issue date (daily series) or after the issue time; list what went. */
export function removeLookahead(snap) {
  const issueMs = Date.parse(snap?.v1?.asOf ?? ''), date = new Date(issueMs).toISOString().slice(0, 10), removed = [];
  const cut = (xs, label) => (xs ?? []).filter(p => { const ok = p && String(p.date) < date; if (!ok && p) removed.push(`${label} ${p.date}`); return ok; });
  const e = structuredClone(snap?.extra ?? {});
  if (e.riskSeries) for (const k of Object.keys(e.riskSeries)) e.riskSeries[k] = cut(e.riskSeries[k], `risk ${k}`);
  if (e.y2) for (const c of Object.keys(e.y2)) e.y2[c] = { ...e.y2[c], points: cut(e.y2[c].points, `2y ${c}`) };
  // futures: knowable when the laptop PULLED them (futures.asOf). A rung's own date is the exchange's trading-day label, which can be
  // the next day for an Asian evening session, so it is not the test. A pull stamped after the issue is removed whole.
  if (e.futures?.banks && Number.isFinite(Date.parse(e.futures.asOf ?? '')) && Date.parse(e.futures.asOf) > issueMs) { removed.push(`futures pull ${e.futures.asOf}`); e.futures = { asOf: e.futures.asOf, banks: {} }; }
  if (e.scorecard) for (const [c, row] of Object.entries(e.scorecard)) for (const [dim, d] of Object.entries(row.asOf ?? {})) if (d && Date.parse(d) > issueMs) { removed.push(`scorecard ${c} ${dim} ${d}`); row.dims[dim] = null; }
  return { snap: { ...snap, extra: e }, removed };
}
/** All twelve variants from one snapshot. `v1Issue` (optional) = the production V1 record of the day, for the identity check. */
export function buildV2Record(snapshot, { v1Issue = null, forwardStart = CONFIG.FORWARD_START, variants = VARIANTS } = {}) {
  const { snap, removed } = removeLookahead(snapshot);
  const date = new Date(Date.parse(snap.v1.asOf)).toISOString().slice(0, 10);
  const out = {};
  for (const [id, sw] of Object.entries(variants)) out[id] = buildVariant(snap, sw);
  const identity = v1Issue?.markets ? (() => {
    const ks = Object.keys(v1Issue.markets).filter(k => out.v1r?.markets?.[k]);
    const same = ks.filter(k => v1Issue.markets[k].dir === out.v1r.markets[k].dir);
    return { v1IssueAsOf: v1Issue.asOf ?? null, markets: ks.length, labelAgreement: ks.length ? rnd(same.length / ks.length, 3) : null, differ: ks.filter(k => !same.includes(k)) };
  })() : null;
  return { version: V2_VERSION, specVersion: SPEC_VERSION, configHash: CONFIG_HASH, phase: phaseOf(date, forwardStart), date, asOf: snap.v1.asOf,
    snapshot: { sha256: sha256(canonicalJson(snapshot)), removedLookahead: removed }, dataIdentity: identity, riskGate: snapshot?.extra?.riskGate ?? { pass: false, why: 'no gate result' },
    variants: out, note: 'Shadow engine: not a production signal; V1 is the production control. Confidence is uncalibrated.' };
}
