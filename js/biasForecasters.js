/**
 * The bias makers scored by the same-day ledger rows (forge/BIAS_SCOREBOARD_PREREG.md §3.3-3.4, bias-scoreboard).
 *
 * Each forecaster turns what was knowable into views: { model_id, model_version, inst, speaks, side, shift, knowable_ms,
 * conviction, inputs, flags, event_key }. js/directionLedger.js issueSameDay turns a view into rows with
 * p_up = clip(B0 + side * shift). Every shift below is fixed by the prereg and never refitted.
 *
 * Max Cole's signals are a paid group's content: a max-signals view carries the instrument, side, posted time and style
 * only. Never message text, entry, stop, target, lot or signal id.
 *
 * Pure: no fetch, no KV, no clock. Tested in js/biasForecasters.test.mjs.
 */
import { londonMs, londonDateOf, addWeekdays, SAMEDAY_INSTRUMENTS } from './directionLedger.js';
import { parseValue, releaseKey } from './surpriseReader.js';
import { polarityFor } from './econSurprise.js';

const V = id => `${id}-v1`;

// ── desk-rating ─────────────────────────────────────────────────────────────────────────────────────────────────
/** Ledger instrument -> desk book name (js/deskPack.js DESK_UNIVERSE). */
export const DESK_NAME = { nq: 'NQ', es: 'SPX500', gold: 'GOLD', us30: 'US30', eurusd: 'EURUSD', gbpusd: 'GBPUSD', usdjpy: 'USDJPY',
  audusd: 'AUDUSD', nzdusd: 'NZDUSD', usdcad: 'USDCAD', usdchf: 'USDCHF', gbpjpy: 'GBPJPY', eurjpy: 'EURJPY' };
export const DESK_CONVICTION_SHIFT = { low: 0.02, medium: 0.04, high: 0.06 };
export const DESK_STRONG_ADD = 0.02, DESK_SHIFT_CAP = 0.08;
const RATING_SIDE = { STRONG_LONG: 1, LONG: 1, SHORT: -1, STRONG_SHORT: -1 };

/** Views from the eligible desk book (run.head.book). FLAT, REVIEW or a missing card = no view. */
export function deskRating(book, { knowableMs, insts = Object.keys(SAMEDAY_INSTRUMENTS) } = {}) {
  const cards = book?.instruments ?? {};
  return insts.map(inst => {
    const c = cards[DESK_NAME[inst]], side = RATING_SIDE[c?.rating] ?? 0;
    const conv = DESK_CONVICTION_SHIFT[String(c?.conviction ?? '').toLowerCase()] != null ? String(c.conviction).toLowerCase() : 'medium';
    const shift = side ? Math.min(DESK_SHIFT_CAP, DESK_CONVICTION_SHIFT[conv] + (/^STRONG_/.test(c.rating) ? DESK_STRONG_ADD : 0)) : 0;
    return { model_id: 'desk-rating', model_version: V('desk-rating'), inst, speaks: !!side, side, shift, knowable_ms: knowableMs, conviction: side ? conv : null,
      inputs: { rating: c?.rating ?? null, conviction: c?.conviction ?? null, size: Number.isFinite(c?.size) ? c.size : null, missing: !c || !!c.missing } };
  });
}

// ── desk-ccy ────────────────────────────────────────────────────────────────────────────────────────────────────
export const FX_LEGS = { eurusd: ['EUR', 'USD'], gbpusd: ['GBP', 'USD'], usdjpy: ['USD', 'JPY'], audusd: ['AUD', 'USD'], nzdusd: ['NZD', 'USD'],
  usdcad: ['USD', 'CAD'], usdchf: ['USD', 'CHF'], gbpjpy: ['GBP', 'JPY'], eurjpy: ['EUR', 'JPY'] };
export const DESK_CCY_PER_POINT = 0.015, DESK_CCY_CAP = 0.06;

/** Pair view from the desk's currency biases (-2..+2): score = bias[base] - bias[quote]. FX pairs only. */
export function deskCcy(book, { knowableMs, insts = Object.keys(SAMEDAY_INSTRUMENTS) } = {}) {
  const ccy = book?.currencies ?? {};
  return insts.filter(i => FX_LEGS[i]).map(inst => {
    const [b, q] = FX_LEGS[inst], bb = ccy[b]?.bias, bq = ccy[q]?.bias;
    const score = Number.isFinite(bb) && Number.isFinite(bq) ? bb - bq : null, side = score ? Math.sign(score) : 0;
    return { model_id: 'desk-ccy', model_version: V('desk-ccy'), inst, speaks: !!side, side, shift: side ? Math.min(DESK_CCY_CAP, DESK_CCY_PER_POINT * Math.abs(score)) : 0,
      knowable_ms: knowableMs, conviction: score == null ? null : Math.abs(score), inputs: { base: b, quote: q, bias_base: bb ?? null, bias_quote: bq ?? null, score } };
  });
}

// ── max-signals ─────────────────────────────────────────────────────────────────────────────────────────────────
export const MAX_SHIFT = 0.05;
/** Signal Copier symbol (after parser aliases) -> ledger instrument. Anything else is not covered. */
export const MAX_SYMBOL = { NAS100: 'nq', SP500: 'es', XAUUSD: 'gold', US30: 'us30', EURUSD: 'eurusd', GBPUSD: 'gbpusd', USDJPY: 'usdjpy',
  AUDUSD: 'audusd', NZDUSD: 'nzdusd', USDCAD: 'usdcad', USDCHF: 'usdchf', GBPJPY: 'gbpjpy', EURJPY: 'eurjpy' };
const MAX_ALIAS = { US500: 'SP500', SPX500: 'SP500', SPX: 'SP500', US500CASH: 'SP500', SPX500CASH: 'SP500', NAS: 'NAS100', NASDAQ: 'NAS100', NDX: 'NAS100',
  USTEC: 'NAS100', US100: 'NAS100', USTECH100: 'NAS100', GOLD: 'XAUUSD', DJI30: 'US30', DJ30: 'US30', DJI: 'US30', DJIA: 'US30', DOW: 'US30', DOW30: 'US30',
  WALLST: 'US30', WS30: 'US30', US30CASH: 'US30' };
export const maxInst = sym => { const s = String(sym ?? '').toUpperCase(); return MAX_SYMBOL[MAX_ALIAS[s] ?? s] ?? null; };
/** Ledger instrument for a market name: the desk's names (NQ, SPX500, GOLD, ...) first, then any Signal Copier spelling. */
export const instOfMarket = name => { const s = String(name ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return Object.keys(DESK_NAME).find(k => DESK_NAME[k] === s) ?? maxInst(s); };
const tsMs = t => (Number.isFinite(t) ? (t > 1e12 ? t : t * 1000) : null);

/** The window for D: [22:00 UK on the previous London weekday, 16:00 London on D]. */
export const maxWindow = date => ({ fromMs: londonMs(addWeekdays(date, -1), 22), toMs: londonMs(date, 16) });

/**
 * The first Signal Copier record of D per instrument (market, limit or stop alike). `records` = signal_copier_signals
 * records. Instruments with no signal in the window get a no-view row. A later opposite side sets flag `conflict`.
 */
export function maxSignals(records, date, { insts = Object.keys(SAMEDAY_INSTRUMENTS) } = {}) {
  const { fromMs, toMs } = maxWindow(date), first = {}, conflict = new Set();
  const sigs = (records || []).map(r => ({ inst: maxInst(r?.symbol), ms: tsMs(r?.posted_ts), side: /^buy/i.test(r?.side) ? 1 : /^sell/i.test(r?.side) ? -1 : 0, style: r?.style || 'single' }))
    .filter(s => s.inst && s.side && s.ms != null && s.ms >= fromMs && s.ms <= toMs).sort((a, b) => a.ms - b.ms);
  for (const s of sigs) { if (!first[s.inst]) first[s.inst] = s; else if (s.side !== first[s.inst].side) conflict.add(s.inst); }
  return insts.map(inst => {
    const s = first[inst];
    if (!s) return { model_id: 'max-signals', model_version: V('max-signals'), inst, speaks: false, side: 0, shift: 0, knowable_ms: londonMs(date, 7), inputs: {} };
    return { model_id: 'max-signals', model_version: V('max-signals'), inst, speaks: true, side: s.side, shift: MAX_SHIFT, knowable_ms: s.ms, conviction: s.style,
      inputs: { side: s.side > 0 ? 'BUY' : 'SELL', posted_ts: new Date(s.ms).toISOString(), style: s.style }, flags: conflict.has(inst) ? ['conflict'] : [] };
  });
}

// ── surprise-rule ───────────────────────────────────────────────────────────────────────────────────────────────
/** Tier-1 US releases, matched on the calendar title; `core` marks the print that wins when a pair prints together. */
export const TIER1_US = [
  { re: /^non-?farm (employment change|payrolls)/i, family: 'nfp' },
  { re: /^core cpi m\/m/i, family: 'cpi', core: true },
  { re: /^cpi m\/m/i, family: 'cpi' },
  { re: /^core ppi m\/m/i, family: 'ppi', core: true },
  { re: /^ppi m\/m/i, family: 'ppi' },
  { re: /^federal funds rate/i, family: 'fomc' },
];
export const tier1Of = ev => (String(ev?.country ?? '').toUpperCase() === 'US' ? TIER1_US.find(t => t.re.test(String(ev?.event ?? '').trim())) ?? null : null);
/** +1 = the long-USD side. Indices and the JPY crosses: no view. */
export const USD_SIGN = { usdjpy: 1, usdcad: 1, usdchf: 1, eurusd: -1, gbpusd: -1, audusd: -1, nzdusd: -1, gold: -1 };
export const SURPRISE_MIN_Z = 0.5, SURPRISE_SHIFT = { small: 0.03, large: 0.05 };

/** z of a stored release against its own series' earlier surprises (>= 6), polarity applied (+ = USD-positive). */
export function releaseZ(store, ev) {
  const a = parseValue(ev.actual), e = parseValue(ev.estimate);
  if (!a || !e) return null;
  const key = String(ev.event ?? '').trim().toLowerCase();
  const hist = (store || []).filter(x => String(x.country).toUpperCase() === 'US' && String(x.event ?? '').trim().toLowerCase() === key && x.ms < ev.ms)
    .map(x => { const xa = parseValue(x.actual), xe = parseValue(x.estimate); return xa && xe ? xa.v - xe.v : NaN; }).filter(Number.isFinite);
  if (hist.length < 6) return null;
  const m = hist.reduce((s, x) => s + x, 0) / hist.length, sd = Math.sqrt(hist.reduce((s, x) => s + (x - m) ** 2, 0) / (hist.length - 1));
  if (!(sd > 0)) return null;
  return ((a.v - e.v) / sd) * polarityFor(ev.event).sign;
}

/**
 * State at 07:00 London on D. `store` = econ_surprise_v1 rows, `calendar` = the week's events as known at 07:00.
 * No view on a London date with a tier-1 US release scheduled; otherwise the latest tier-1 release before 07:00 on D
 * (core print when two print together) speaks if |z| >= 0.5, carried until the next release replaces it.
 */
export function surpriseRule(store, calendar, date, { insts = Object.keys(SAMEDAY_INSTRUMENTS) } = {}) {
  const at = londonMs(date, 7), scope = insts.filter(i => USD_SIGN[i]);
  const silent = inputs => scope.map(inst => ({ model_id: 'surprise-rule', model_version: V('surprise-rule'), inst, speaks: false, side: 0, shift: 0, knowable_ms: at, inputs }));
  const today = [...(calendar || []), ...(store || [])].filter(e => tier1Of(e) && Number.isFinite(e.ms) && londonDateOf(e.ms) === date);
  if (today.length) return silent({ state: 'release day', release: today[0].event });
  const past = (store || []).filter(e => tier1Of(e) && Number.isFinite(e.ms) && e.ms < at);
  if (!past.length) return silent({ state: 'no tier-1 release on record' });
  const lastMs = Math.max(...past.map(e => e.ms)), group = past.filter(e => e.ms === lastMs);
  const ev = group.find(e => tier1Of(e).core) ?? group[0];
  const z = releaseZ(store, ev), key = releaseKey(ev);
  const base = { release: ev.event, release_ts: new Date(ev.ms).toISOString(), z: z == null ? null : +z.toFixed(3) };
  if (z == null || Math.abs(z) < SURPRISE_MIN_Z) return silent({ ...base, state: z == null ? 'z unknown' : 'in line' });
  const shift = Math.abs(z) >= 1 ? SURPRISE_SHIFT.large : SURPRISE_SHIFT.small;
  return scope.map(inst => ({ model_id: 'surprise-rule', model_version: V('surprise-rule'), inst, speaks: true, side: USD_SIGN[inst] * Math.sign(z), shift,
    knowable_ms: at, conviction: Math.abs(z), event_key: key, inputs: { ...base, state: 'carried' } }));
}

// ── h4-trend (Amendment A1, PRE-RESULTS 2026-11-14) ─────────────────────────────────────────────────────────────
// Sign of the 4h EMA20 slope at 07:00 London, rebuilt exactly as scripts/max-bias-reverse/analyze.py: H1 bars that
// closed at or before T (the last 320), 4h closes = the last H1 close in each bucket aligned to 00/04/08 UTC (the
// latest bucket may be partial), EMA20 seeded with the first value; slope = EMA20(all) - EMA20(all but the last 3).
// The exploratory look found Max's side agrees with it on 84% of instrument-days; this row shows whether he adds anything.
export const H4_SHIFT = 0.04;
const emaOf = (xs, n) => { const k = 2 / (n + 1); let e = null; for (const x of xs) e = e == null ? x : e + k * (x - e); return e; };
/** `h1` = [{t: bar open (s, UTC), c}] oldest first. Returns +1 / -1 / 0 (or null with too little history). */
export function h4Slope(h1, Tsec) {
  const closed = (h1 || []).filter(b => Number.isFinite(b.c) && b.t + 3600 <= Tsec).slice(-320), out = [];
  let cur = null;
  for (const b of closed) { const k = Math.floor(b.t / 14400); if (k !== cur) { out.push(b.c); cur = k; } else out[out.length - 1] = b.c; }
  if (out.length < 24) return null;
  const d = emaOf(out, 20) - emaOf(out.slice(0, -3), 20);
  return d > 0 ? 1 : d < 0 ? -1 : 0;
}
/** `h1ByInst` = { inst: H1 bars } as fetched at 07:00 London on D. */
export function h4Trend(h1ByInst, date, { insts = Object.keys(SAMEDAY_INSTRUMENTS) } = {}) {
  const at = londonMs(date, 7);
  return insts.map(inst => {
    const s = h4Slope(h1ByInst?.[inst], at / 1000), side = s === 1 || s === -1 ? s : 0;
    return { model_id: 'h4-trend', model_version: V('h4-trend'), inst, speaks: !!side, side, shift: side ? H4_SHIFT : 0, knowable_ms: at,
      inputs: { h4_ema20_slope_sign: s, source: 'OANDA H1 mid, closed bars only' } };
  });
}

// ── fundabias (prereg §3.3 mapping; enabled forward by amendment A4, 2026-11-17) ─────────────────────────────────
// The owner (or anyone with the owner login) logs FundaBias's published reading per market on the day: direction and
// score n/10 (POST /api/fundabias-log, write-once per market per day, server time-stamped, KV fundabias_log_<date>).
// Mapping frozen in §3.3: s = 0.01 × (score − 5), cap 0.06, sign from its direction; s <= 0 (score 5 or less) or
// NEUTRAL = no view. Knowable at the log's server timestamp, so a reading logged after 16:00 London is not a row for D.
export const FUNDABIAS_ENABLED = true;
export const FUNDABIAS_PER_POINT = 0.01, FUNDABIAS_CAP = 0.06;
/** `logs` = the day's log rows [{ market, dir, score10, loggedAt }]. Markets by any name maxInst() knows (XAUUSD, GOLD, NAS100, ...). */
export function fundabias(logs = [], date = null, { insts = Object.keys(SAMEDAY_INSTRUMENTS) } = {}) {
  const by = {};
  for (const r of logs || []) { const inst = instOfMarket(r?.market); if (inst && !by[inst]) by[inst] = r; }   // first log per market wins (write-once anyway)
  if (!(logs || []).length) return [];
  return insts.map(inst => {
    const r = by[inst], side = ENGINE_SIDE[r?.dir] ?? 0, score = Number.isFinite(r?.score10) ? r.score10 : null;
    const s = side && score != null ? Math.min(FUNDABIAS_CAP, +(FUNDABIAS_PER_POINT * (score - 5)).toFixed(4)) : 0, speaks = !!side && s > 0;
    const ms = Date.parse(r?.loggedAt ?? '');
    return { model_id: 'fundabias', model_version: V('fundabias'), inst, speaks, side: speaks ? side : 0, shift: speaks ? s : 0,
      knowable_ms: Number.isFinite(ms) ? ms : (date ? londonMs(date, 7) : null), conviction: score, inputs: { dir: r?.dir ?? null, score10: score, logged_at: r?.loggedAt ?? null, missing: !r } };
  });
}

// ── bias-engine (plans/BIAS_ENGINE_SPEC.md; prereg amendment A3: added forward from its first issue date, no back-issue) ──
// The stored morning issue of js/biasEngine.js (KV bias_engine_<D>, written 07:00-07:30 London). Side = the market's
// direction (BULLISH +1, BEARISH -1); NEUTRAL or a missing market = no view. p_up = clip(p0 ± 0.01 × strength), so the
// shift runs 0.03 (strength 3, the weakest that is not Neutral) to 0.10. Knowable at the record's issue time.
export const ENGINE_SHIFT_PER_STRENGTH = 0.01;
const ENGINE_SIDE = { BULLISH: 1, BEARISH: -1 };
/** `rec` = a stored bias-engine record ({ asOf, version, weights, markets }). Markets by the desk's names (DESK_NAME). */
export function biasEngine(rec, { knowableMs = Date.parse(rec?.asOf ?? ''), insts = Object.keys(SAMEDAY_INSTRUMENTS) } = {}) {
  return insts.map(inst => {
    const m = rec?.markets?.[DESK_NAME[inst]], side = ENGINE_SIDE[m?.dir] ?? 0, strength = Number.isFinite(m?.strength) ? m.strength : 0;
    const speaks = !!side && strength > 0;
    return { model_id: 'bias-engine', model_version: V('bias-engine'), inst, speaks, side: speaks ? side : 0, shift: speaks ? +(ENGINE_SHIFT_PER_STRENGTH * strength).toFixed(4) : 0,
      knowable_ms: knowableMs, conviction: m ? strength : null,
      inputs: { dir: m?.dir ?? null, strength: m ? strength : null, score: m?.score ?? null, coverage: m?.coverage ?? null, engine: rec?.version ?? null, weights: rec?.weights ?? null, missing: !m } };
  });
}

// ── process-ai / process-system (plans/DESK_BIAS_PROCESS_SPEC.md; prereg amendment A4: forward from the first issue) ──
// The stored morning issue of the Desk Bias Process (KV desk_bias_process_<D>, written 07:30-08:00 London). process-ai
// is the published call (the AI analyst's, or the system's when the AI failed); process-system is the rules alone.
// Side = dir (BULLISH +1, BEARISH -1); NEUTRAL or a missing market = no view. p_up = clip(p0 ± 0.02 × conviction), so s
// runs 0.02 (conviction 1) to 0.10 (conviction 5). Knowable at the record's issuedAt.
export const PROCESS_SHIFT_PER_CONVICTION = 0.02;
function processViews(rec, which, { knowableMs, insts }) {
  const id = which === 'call' ? 'process-ai' : 'process-system';
  return insts.map(inst => {
    const card = rec?.markets?.[DESK_NAME[inst]], c = card?.[which], side = ENGINE_SIDE[c?.dir] ?? 0, conv = Number.isFinite(c?.conviction) ? c.conviction : null;
    const speaks = !!side && conv != null && conv > 0;
    return { model_id: id, model_version: V(id), inst, speaks, side: speaks ? side : 0, shift: speaks ? +(PROCESS_SHIFT_PER_CONVICTION * Math.min(5, conv)).toFixed(4) : 0,
      knowable_ms: knowableMs, conviction: conv, inputs: { dir: c?.dir ?? null, conviction: conv, by: which === 'call' ? card?.call?.by ?? null : 'system', invalidation: c?.invalidation ?? null,
        process: rec?.version ?? null, prompt: rec?.prompt ?? null, missing: !card } };
  });
}
/** `rec` = a stored desk-bias-process record ({ issuedAt, version, prompt, markets: { NAME: { call, system } } }). */
export function processAi(rec, { knowableMs = Date.parse(rec?.issuedAt ?? rec?.asOf ?? ''), insts = Object.keys(SAMEDAY_INSTRUMENTS) } = {}) { return processViews(rec, 'call', { knowableMs, insts }); }
export function processSystem(rec, { knowableMs = Date.parse(rec?.issuedAt ?? rec?.asOf ?? ''), insts = Object.keys(SAMEDAY_INSTRUMENTS) } = {}) { return processViews(rec, 'system', { knowableMs, insts }); }
