/**
 * The research lab's QUICK TEST (owner-approved build item 6, 2026-11-04): a bounded, standard first look at a simple
 * relationship hypothesis, "X leads / predicts Y over horizon h (optionally when condition C)", for the research pod's
 * proposals and a free-form form in the Desk Office.
 *
 * It is EXPLORATORY and says so on every result: not pre-registered, never written to the Evidence Book, never banked.
 * The research-protocol skill's route stays the only way to a ledger verdict (register row, prereg on fresh data). The
 * verdict word uses the repo's four (VALIDATED, NULL, UNDERPOWERED, CONTEXT), always shown as "exploratory".
 *
 * What it runs, in order (all pure, seeded, bounded):
 *   1. Data quality: per series n, span, coverage of business days, the longest gap, stale runs (≥ 5 identical prints),
 *      days since the last print; the overlap of X and Y. Under 750 overlapping days → UNDERPOWERED (data).
 *   2. Lockbox: every date after 2026-08-21 is dropped from both series before anything is computed
 *      (forge/LOCKBOX_PROTOCOL.md; the data-rules skill).
 *   3. Clock: X is known at the end of day t; Y's forward change starts at t + 1 (one whole day skipped), so a later
 *      print clock on X cannot lend Y its own same-day move.
 *   4. Lead/lag: correlation of X (as transformed) with Y's 1-day change k days later, k = −10 … +10, with the ±1.96/√n
 *      band. A peak at k ≤ 0 is X following or moving with Y, not leading it.
 *   5. Conditional split, walk-forward: X's 20th / 80th percentiles from the data BEFORE each day (expanding, ≥ 250
 *      days, refreshed every 21) mark the bottom and top quintile; the effect d = (mean forward Y after top − after
 *      bottom) / SD of forward Y, against the unconditional mean. With a condition C, only days where C holds count.
 *   6. In-sample / out-of-sample: the first 60% of usable days is discovery, the last 40% the test. The OOS d gets a
 *      moving-block bootstrap (date clusters, block max(h, 20), B = 500, seed 20261104): interval, p, SE, MDE (2.8 SE).
 *   7. Multiple testing: Holm across the horizons tried (BH reported beside it).
 *   8. Verdict per horizon: passes = Holm OOS p < 0.05, |d_OOS| ≥ 0.20, OOS sign = IS sign, IS p < 0.05. Overall:
 *      VALIDATED (exploratory) if any horizon passes; else CONTEXT if X and Y move together the same day (|r0| beyond
 *      2.58/√n and ≥ 0.10) but X does not lead; else NULL if every horizon could have found d = 0.20 (MDE ≤ 0.20),
 *      UNDERPOWERED otherwise.
 *
 * Tested on synthetic series: a planted lead must come back VALIDATED, pure noise NULL (js/quickTest.test.mjs).
 */
import { clusteredBlockBootstrap, bhFdr } from './harness/stats.mjs';
import { holm } from './preregStats.js';

export const LOCKBOX_END = '2026-08-21';
export const SEED = 20261104;
export const HORIZONS = [1, 2, 5, 10, 20, 60];
export const X_TRANSFORMS = { level: 'level', chg1: '1-day change', chg5: '5-day change', chg20: '20-day change', z60: 'z-score vs 60 days' };
export const BAR_D = 0.20;
export const MIN_OVERLAP = 750;
export const LABEL = 'Exploratory quick test, not pre-registered. Never written to the Evidence Book; to bank anything, claim a register row and pre-register a test on fresh data (research-protocol).';

// ── the series the server may load (whitelist) ──────────────────────────────────────────────────────────────────
const G8 = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'];
const FX_IDS = G8.flatMap((a, i) => G8.slice(i + 1).map(b => `${a}${b}`));
const OTHER = { GOLD: 'XAU_USD', SILVER: 'XAG_USD', NQ: 'NAS100_USD', SPX500: 'SPX500_USD', US30: 'US30_USD', US2000: 'US2000_USD', DE30: 'DE30_EUR', UK100: 'UK100_GBP', WTI: 'WTICO_USD', BRENT: 'BCO_USD', COPPER: 'XCU_USD', NATGAS: 'NATGAS_USD', EURNOK: 'EUR_NOK', EURSEK: 'EUR_SEK', USDNOK: 'USD_NOK', USDSEK: 'USD_SEK' };
const FRED = {
  DGS2: 'US 2-year Treasury yield', DGS5: 'US 5-year Treasury yield', DGS10: 'US 10-year Treasury yield', DGS30: 'US 30-year Treasury yield',
  DFII10: 'US 10-year real yield (TIPS)', DFII5: 'US 5-year real yield', T10YIE: 'US 10-year breakeven inflation', T10Y2Y: 'US 10y minus 2y',
  VIXCLS: 'VIX', VXVCLS: 'VIX 3-month', VXNCLS: 'Nasdaq VIX (VXN)', GVZCLS: 'Gold VIX (GVZ)', OVXCLS: 'Oil VIX (OVX)', EVZCLS: 'Euro FX VIX (EVZ, ended)',
  BAMLH0A0HYM2: 'US high-yield credit spread', BAMLC0A0CM: 'US investment-grade credit spread', DTWEXBGS: 'Broad dollar index (Fed)',
  SOFR: 'SOFR', WALCL: 'Fed balance sheet (weekly)', WTREGEN: 'Treasury General Account (weekly)', RRPONTSYD: 'Fed reverse repo', NFCI: 'Chicago Fed financial conditions (weekly)',
  THREEFYTP10: '10-year term premium (Kim-Wright)', DCOILWTICO: 'WTI crude (spot)',
};
const YIELDS = { DE2Y: 'Bund 2-year', DE10Y: 'Bund 10-year', GB5Y: 'Gilt 5-year', GB10Y: 'Gilt 10-year', JP2Y: 'JGB 2-year', JP10Y: 'JGB 10-year', CA2Y: 'Canada 2-year', CA10Y: 'Canada 10-year', AU2Y: 'Australia 2-year', AU10Y: 'Australia 10-year' };
/** id → { src, ref, label, kind } where kind 'price' (log changes) or 'rate' (differences). */
export const CATALOGUE = Object.fromEntries([
  ...FX_IDS.map(id => [`oanda:${id}`, { src: 'oanda', ref: `${id.slice(0, 3)}_${id.slice(3)}`, label: `${id.slice(0, 3)}/${id.slice(3)} (OANDA daily close)`, kind: 'price' }]),
  ...Object.entries(OTHER).map(([k, sym]) => [`oanda:${k}`, { src: 'oanda', ref: sym, label: `${k} (OANDA daily close)`, kind: 'price' }]),
  ...Object.entries(FRED).map(([k, label]) => [`fred:${k}`, { src: 'fred', ref: k, label: `${label} (FRED ${k})`, kind: /^(VIX|VXV|VXN|GVZ|OVX|EVZ|DTW|DCOIL|WALCL|WTRE|RRP)/.test(k) ? 'price' : 'rate' }]),
  ...Object.entries(YIELDS).map(([k, label]) => [`yield:${k}`, { src: 'yield', ref: k, label: `${label} (issuer feed)`, kind: 'rate' }]),
]);

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────
const fin = Number.isFinite;
const r4 = v => (fin(v) ? +v.toFixed(4) : null);
const DAY = 864e5;
const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const sd = a => { if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const corr = (a, b) => { const n = a.length; if (n < 3) return NaN; const ma = mean(a), mb = mean(b); let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; } return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : NaN; };
const quantile = (sorted, q) => { if (!sorted.length) return NaN; const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };
const clean = s => (s ?? []).filter(p => p && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && fin(p.value)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

/** Normalise and bound a request. Throws with a reason the form can show. */
export function normaliseSpec(spec = {}, { catalogue = CATALOGUE } = {}) {
  const x = String(spec.x ?? ''), y = String(spec.y ?? '');
  if (!catalogue[x]) throw new Error(`x: unknown series "${x}" (choose from the catalogue)`);
  if (!catalogue[y]) throw new Error(`y: unknown series "${y}" (choose from the catalogue)`);
  if (x === y) throw new Error('x and y are the same series');
  const horizons = [...new Set((Array.isArray(spec.horizons) ? spec.horizons : [1, 5, 20]).map(Number))].filter(h => HORIZONS.includes(h)).sort((a, b) => a - b).slice(0, 4);
  if (!horizons.length) throw new Error(`horizons: choose up to four of ${HORIZONS.join(', ')}`);
  const xTransform = X_TRANSFORMS[spec.xTransform] ? spec.xTransform : 'chg5';
  let condition = null;
  if (spec.condition?.series) {
    const c = spec.condition;
    if (!catalogue[c.series]) throw new Error(`condition: unknown series "${c.series}"`);
    const op = c.op === 'below' ? 'below' : 'above', pct = Math.min(95, Math.max(5, Math.round(Number(c.pct ?? 50))));
    condition = { series: c.series, transform: X_TRANSFORMS[c.transform] ? c.transform : 'level', op, pct };
  }
  return { x, y, horizons, xTransform, condition };
}
/** A stable id for a spec (the cache key). */
export function specId(s) {
  const t = JSON.stringify([s.x, s.y, s.horizons, s.xTransform, s.condition ? [s.condition.series, s.condition.transform, s.condition.op, s.condition.pct] : null]);
  let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `qt-${(h >>> 0).toString(36)}`;
}

/** Data quality of one series (dates ≤ the lockbox already). */
export function quality(series, { today = null } = {}) {
  const s = clean(series), n = s.length;
  if (!n) return { n: 0, ok: false, why: 'no data' };
  let maxGap = 0, gaps7 = 0, run = 1, staleRuns = 0;
  for (let i = 1; i < n; i++) {
    const g = (Date.parse(s[i].date) - Date.parse(s[i - 1].date)) / DAY; if (g > maxGap) maxGap = g; if (g > 7) gaps7++;
    if (s[i].value === s[i - 1].value) { run++; if (run === 5) staleRuns++; } else run = 1;
  }
  const span = (Date.parse(s.at(-1).date) - Date.parse(s[0].date)) / DAY, bizDays = Math.max(1, Math.round(span * 5 / 7));
  const coverage = Math.min(1, n / bizDays), staleDays = today ? Math.round((Date.parse(today) - Date.parse(s.at(-1).date)) / DAY) : null;
  return { n, from: s[0].date, to: s.at(-1).date, coverage: r4(coverage), maxGapDays: Math.round(maxGap), gapsOver7d: gaps7, staleRuns, daysSinceLast: staleDays, weekly: coverage < 0.4 };
}

/** As-of value of `src` on each spine date (latest dated ≤ it, at most `maxStale` days old). */
function asOf(spine, src, maxStale) {
  const out = new Array(spine.length).fill(NaN); let j = -1;
  for (let i = 0; i < spine.length; i++) { while (j + 1 < src.length && src[j + 1].date <= spine[i]) j++; if (j >= 0 && (Date.parse(spine[i]) - Date.parse(src[j].date)) / DAY <= maxStale) out[i] = src[j].value; }
  return out;
}
/** Transform a value array (aligned to a spine). Positive series change in logs, others in differences. */
export function transformValues(v, how, kind) {
  const d = (a, b) => (kind === 'price' && a > 0 && b > 0 ? Math.log(a / b) : a - b);
  const k = { chg1: 1, chg5: 5, chg20: 20 }[how];
  if (how === 'level') return v.slice();
  if (k) return v.map((x, i) => (i >= k && fin(x) && fin(v[i - k]) ? d(x, v[i - k]) : NaN));
  if (how === 'z60') return v.map((x, i) => { if (i < 60 || !fin(x)) return NaN; const w = v.slice(i - 60, i).filter(fin); if (w.length < 40) return NaN; const s = sd(w); return s > 0 ? (x - mean(w)) / s : NaN; });
  return v.slice();
}
/** Walk-forward percentile thresholds: for day i, the q-quantile of x over days before i (≥ minPast), refreshed every `every`. */
function walkQuantiles(x, qs, { minPast = 250, every = 21 } = {}) {
  const out = qs.map(() => new Array(x.length).fill(NaN));
  let cur = null;
  for (let i = 0; i < x.length; i++) {
    if (i >= minPast && (cur === null || i % every === 0)) { const past = x.slice(0, i).filter(fin).sort((a, b) => a - b); if (past.length >= minPast) cur = qs.map(q => quantile(past, q)); }
    if (cur) qs.forEach((_, k) => (out[k][i] = cur[k]));
  }
  return out;
}

/** The effect d on a set of rows { b: 'top'|'bot'|'mid', f } : (mean top − mean bottom) / SD of all forward values. */
function effect(rows) {
  const top = [], bot = [], all = [];
  for (const r of rows) { all.push(r.f); if (r.b === 'top') top.push(r.f); else if (r.b === 'bot') bot.push(r.f); }
  const s = sd(all); return top.length > 4 && bot.length > 4 && s > 0 ? (mean(top) - mean(bot)) / s : NaN;
}

/**
 * Run the quick test. x, y (and condition.data when a condition is set): ascending [{ date, value }].
 * spec: normaliseSpec output. kinds: { x, y, c } 'price' | 'rate'. Returns the full, storable result.
 */
export function runQuickTest({ spec, x, y, cData = null, kinds = {}, today = null, nBoot = 500, seed = SEED }) {
  const lockDrop = { x: (x ?? []).filter(p => p.date > LOCKBOX_END).length, y: (y ?? []).filter(p => p.date > LOCKBOX_END).length };
  const X = clean(x).filter(p => p.date <= LOCKBOX_END), Y = clean(y).filter(p => p.date <= LOCKBOX_END), C = cData ? clean(cData).filter(p => p.date <= LOCKBOX_END) : null;
  const qx = quality(X, { today: LOCKBOX_END }), qy = quality(Y, { today: LOCKBOX_END });
  const qLive = { x: quality(clean(x), { today }), y: quality(clean(y), { today }) };
  const base = { ok: true, exploratory: true, label: LABEL, spec, seed, nBoot, lockboxEnd: LOCKBOX_END, lockboxDropped: lockDrop, ranAt: new Date().toISOString() };
  // the spine is Y's own days; X (and C) as-of, at most 5 days stale (weekly series up to 8)
  const spine = Y.map(p => p.date), yv = Y.map(p => p.value);
  const xv = asOf(spine, X, qx.weekly ? 8 : 5), cv = C ? asOf(spine, C, quality(C).weekly ? 8 : 5) : null;
  const xs = transformValues(xv, spec.xTransform, kinds.x ?? 'rate'), cs = cv ? transformValues(cv, spec.condition.transform, kinds.c ?? 'rate') : null;
  const overlap = xs.filter(fin).length;
  const qualityOut = { x: { ...qx, live: qLive.x }, y: { ...qy, live: qLive.y }, overlapDays: overlap };
  if (overlap < MIN_OVERLAP) return { ...base, quality: qualityOut, horizons: [], leadLag: null, verdict: 'UNDERPOWERED', why: `only ${overlap} days where both series exist up to ${LOCKBOX_END} (need ${MIN_OVERLAP})` };
  const yKind = kinds.y ?? 'price', dY = (a, b) => (yKind === 'price' && a > 0 && b > 0 ? Math.log(a / b) : a - b);
  const r1 = yv.map((v, i) => (i >= 1 ? dY(v, yv[i - 1]) : NaN));   // Y's change on day i

  // lead/lag: corr(xs_t, r1_{t+k})
  const lags = [];
  for (let k = -10; k <= 10; k++) {
    const a = [], b = []; for (let t = 0; t < spine.length; t++) { const u = t + k; if (u < 0 || u >= spine.length) continue; if (fin(xs[t]) && fin(r1[u])) { a.push(xs[t]); b.push(r1[u]); } }
    lags.push({ k, r: r4(corr(a, b)), n: a.length });
  }
  const nLL = lags.find(l => l.k === 0)?.n ?? 0, band = r4(1.96 / Math.sqrt(Math.max(1, nLL)));
  const peak = lags.reduce((m, l) => (fin(l.r) && Math.abs(l.r) > Math.abs(m.r ?? 0) ? l : m), { k: null, r: 0 });
  const r0 = lags.find(l => l.k === 0)?.r ?? 0, sameDay = Math.abs(r0) > 2.58 / Math.sqrt(Math.max(1, nLL)) && Math.abs(r0) >= 0.10;

  // buckets (walk-forward quintiles) and the condition (walk-forward percentile)
  const [q20, q80] = walkQuantiles(xs, [0.2, 0.8]);
  const cThr = cs ? walkQuantiles(cs, [spec.condition.pct / 100])[0] : null;
  const usable = []; for (let t = 0; t < spine.length; t++) {
    if (!fin(xs[t]) || !fin(q20[t])) continue;
    if (cs && !(fin(cs[t]) && fin(cThr[t]) && (spec.condition.op === 'above' ? cs[t] > cThr[t] : cs[t] < cThr[t]))) continue;
    usable.push(t);
  }
  const cut = Math.floor(usable.length * 0.6);
  const cells = spec.horizons.map(h => {
    const rows = usable.filter(t => t + 1 + h < spine.length && fin(yv[t + 1 + h]) && fin(yv[t + 1])).map(t => ({ t, date: spine[t], b: xs[t] >= q80[t] ? 'top' : xs[t] <= q20[t] ? 'bot' : 'mid', f: dY(yv[t + 1 + h], yv[t + 1]) }));
    const cutDate = spine[usable[cut]] ?? spine.at(-1), IS = rows.filter(r => r.date < cutDate), OOS = rows.filter(r => r.date >= cutDate);
    // a split with too few top or bottom days (e.g. a trending level that leaves its own past quintiles) has no effect
    const boot = rs => {
      if (!fin(effect(rs))) return { ok: false, error: `too few days in the top or bottom quintile (${rs.filter(r => r.b === 'top').length} / ${rs.filter(r => r.b === 'bot').length})` };
      try { const b = clusteredBlockBootstrap(rs.map(r => [r]), effect, { meanBlock: Math.max(h, 20), nBoot, seed, minClusters: 30 }); return b.ok && fin(b.se) ? b : { ok: false, error: b.error ?? 'bootstrap failed' }; }
      catch (e) { return { ok: false, error: `bootstrap: ${e.message}` }; }
    };
    const bi = boot(IS), bo = boot(OOS);
    const side = (rs, k) => { const v = rs.filter(r => k === 'all' || r.b === k).map(r => r.f); return { n: v.length, mean: r4(mean(v) * 100) }; };
    const ic = (() => { const a = OOS.map(r => xs[r.t]), b = OOS.map(r => r.f); return r4(corr(a, b)); })();
    const se = bo.ok ? bo.se : NaN, mde = fin(se) ? r4(2.8 * se) : null;
    return { h, n: rows.length, splitDate: cutDate,
      is: bi.ok ? { n: IS.length, d: bi.obs, lo: bi.ci95[0], hi: bi.ci95[1], p: bi.pValue, top: side(IS, 'top'), bottom: side(IS, 'bot'), all: side(IS, 'all') } : { n: IS.length, error: bi.error },
      oos: bo.ok ? { n: OOS.length, d: bo.obs, lo: bo.ci95[0], hi: bo.ci95[1], p: bo.pValue, se: bo.se, mde, ic, top: side(OOS, 'top'), bottom: side(OOS, 'bot'), all: side(OOS, 'all') } : { n: OOS.length, error: bo.error },
      units: yKind === 'price' ? 'top/bottom/all means: % change of Y' : 'top/bottom/all means: change of Y ×100' };
  });
  const ps = cells.map(c => (fin(c.oos?.p) ? c.oos.p : 1)), H = holm(ps, 0.05), B = bhFdr(ps, 0.10);
  for (const [i, c] of cells.entries()) {
    c.holmP = r4(H.adjusted[i]); c.bhPass = B.pass[i];
    c.pass = !!(H.rejected[i] && fin(c.oos?.d) && Math.abs(c.oos.d) >= BAR_D && Math.sign(c.oos.d) === Math.sign(c.is?.d ?? 0) && (c.is?.p ?? 1) < 0.05);
    c.powered = fin(c.oos?.mde) && c.oos.mde <= BAR_D;
    c.verdict = c.pass ? 'VALIDATED' : c.powered ? 'NULL' : 'UNDERPOWERED';
  }
  const any = cells.find(c => c.pass);
  const verdict = any ? 'VALIDATED' : sameDay ? 'CONTEXT' : cells.every(c => c.powered) ? 'NULL' : 'UNDERPOWERED';
  const why = any ? `h=${any.h}: OOS effect ${any.oos.d} [${any.oos.lo}, ${any.oos.hi}], Holm p ${any.holmP}, same sign in-sample (p ${any.is.p}). Exploratory: a candidate for a prereg on fresh data, not a result.`
    : verdict === 'CONTEXT' ? `X and Y move together the same day (r ${r0}, n ${nLL}) but X does not lead Y at any horizon tried: attribution, not a forecast.`
      : verdict === 'NULL' ? `No horizon passes and every one could have found an effect of ${BAR_D} SD (MDE ${cells.map(c => c.oos.mde).join(' / ')}).`
        : `No horizon passes, and ${cells.filter(c => !c.powered).map(c => `h=${c.h}`).join(', ')} could not have found an effect of ${BAR_D} SD (MDE ${cells.map(c => c.oos?.mde ?? '–').join(' / ')}): an empty answer, not a no.`;
  return { ...base, quality: qualityOut, leadLag: { lags, band, peak: { k: peak.k, r: peak.r }, sameDay: { r: r0, significant: sameDay } }, horizons: cells, verdict, why };
}

/** A short summary row for lists. */
export const summaryOf = (id, res) => ({ id, at: res.ranAt, x: res.spec?.x, y: res.spec?.y, horizons: res.spec?.horizons, xTransform: res.spec?.xTransform, condition: res.spec?.condition ?? null, verdict: res.verdict, why: res.why, proposalIds: res.proposalIds ?? [], exploratory: true });

/** Store: { tests: { id: result }, order: [id newest first] }, capped. Re-running a spec replaces it and moves it to the front. */
export function storeResult(store, id, res, { cap = 120, proposalId = null } = {}) {
  const s = { tests: { ...(store?.tests ?? {}) }, order: [...(store?.order ?? [])] };
  const prev = s.tests[id];
  const links = new Set([...(prev?.proposalIds ?? []), ...(proposalId ? [proposalId] : [])]);
  s.tests[id] = { ...res, id, proposalIds: [...links] };
  s.order = [id, ...s.order.filter(x => x !== id)];
  for (const old of s.order.slice(cap)) delete s.tests[old];
  s.order = s.order.slice(0, cap);
  return s;
}
export const listOf = (store, { proposalId = null } = {}) => (store?.order ?? []).map(id => store.tests[id]).filter(Boolean).filter(t => !proposalId || (t.proposalIds ?? []).includes(proposalId)).map(t => summaryOf(t.id, t));

// ── suggesting a spec from a research-pod proposal ──────────────────────────────────────────────────────────────
const WORDS = [
  [/\bvix\b|implied vol|fear gauge/i, 'fred:VIXCLS'], [/\b(2y|2-year|two-year|front.end)\b/i, 'fred:DGS2'], [/\b(10y|10-year|ten-year)\b/i, 'fred:DGS10'],
  [/real yield|tips/i, 'fred:DFII10'], [/breakeven/i, 'fred:T10YIE'], [/high.yield|credit spread|\bhy\b|junk/i, 'fred:BAMLH0A0HYM2'], [/term premium/i, 'fred:THREEFYTP10'],
  [/\bdollar index|\bdxy\b|broad dollar/i, 'fred:DTWEXBGS'], [/balance sheet|qt\b|quantitative/i, 'fred:WALCL'], [/reverse repo|\brrp\b/i, 'fred:RRPONTSYD'], [/financial conditions|\bnfci\b/i, 'fred:NFCI'],
  [/curve|10y.?2y|steepen|flatten/i, 'fred:T10Y2Y'], [/\bgold\b/i, 'oanda:GOLD'], [/\boil\b|crude|wti/i, 'oanda:WTI'], [/copper/i, 'oanda:COPPER'], [/bund/i, 'yield:DE2Y'], [/\bjgb\b/i, 'yield:JP2Y'],
  [/nasdaq|\bnq\b/i, 'oanda:NQ'], [/s&p|\bspx\b|\bes\b/i, 'oanda:SPX500'],
];
/** A starting spec for a proposal: Y from its universe, X from the words in its signal, horizons from its horizon. */
export function suggestSpec(p, { catalogue = CATALOGUE } = {}) {
  const uni = (Array.isArray(p?.rules?.universe) ? p.rules.universe : [p?.rules?.universe]).filter(Boolean).map(u => String(u).toUpperCase().replace(/[^A-Z0-9]/g, ''));
  const y = uni.map(u => `oanda:${u}`).find(id => catalogue[id]) ?? null;
  const text = [p?.rules?.signal, p?.test?.variable, p?.thesis, p?.title].filter(Boolean).join(' ');
  const x = WORDS.map(([re, id]) => (re.test(text) && catalogue[id] && id !== y ? id : null)).find(Boolean) ?? null;
  const hz = String(p?.rules?.horizon ?? p?.test?.horizons ?? ''), nums = [...hz.matchAll(/(\d+)\s*(d|day|session|w|week|m|month)/gi)].map(m => Number(m[1]) * (/^w/i.test(m[2]) ? 5 : /^m/i.test(m[2]) ? 21 : 1));
  const horizons = [...new Set(nums.map(n => HORIZONS.reduce((b, h) => (Math.abs(h - n) < Math.abs(b - n) ? h : b), 1)))].slice(0, 4);
  return { x, y, horizons: horizons.length ? horizons : [1, 5, 20], xTransform: 'chg5' };
}
