// js/helixBundle.js: the pure half of Helix's server routes (js/helixRoutes.js; plans/HELIX_IMPROVEMENTS.md 3.1, 3.7, 3.9-3.11, 3.13):
//   - the morning bundle: which feeds go in, how each is trimmed, and the { asOf, source, stale, degraded } wrapper every block carries;
//   - the Helix daily record (helix/days/<date>.json): validation and the merge of one broadcast run into the day's file;
//   - the roll-health reader for rates-legs/_health.json (written by the IBKR roll lane; any shape tolerated, absence is not an error);
//   - the intraday MOVE / DXY stress line from archive/i15_<ID>/ (only with 10 or more days stored);
//   - the vol terrain's per-market daily ranges (/api/vol-terrain), the same maths the VOL view runs (jarvisVolCore.dailyRanges).
// No fetch, no R2, no clock unless passed: tested in js/helixBundle.test.mjs. DESCRIPTION ONLY: nothing here forecasts or calls a trade.
import { asOfOf, staleOf } from './terminal/helixFetch.js';
import { dailyRanges, VOL_MARKETS } from './terminal/jarvisVolCore.js';
import { HEAD_KEYS } from './terminal/broadcastHeadline.js';

const r = (v, d = 3) => (Number.isFinite(v) ? +v.toFixed(d) : null);
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o?.[k] !== undefined).map(k => [k, o[k]]));
const mapObj = (o, f) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).map(([k, v]) => [k, f(v, k)]).filter(([, v]) => v != null));

/** The headline's drill series (broadcastHeadline.js SERIES) and how far back it reads (40 closes for the spark). */
export const HEAD_DRILL_KEYS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdcad', 'usdchf', 'nzdusd', 'gold', 'nq', 'spx', 'r2k', 'de30', 'uk100', 'btc'];

/**
 * The bundle's self-fetched blocks. url: the route (fetched with the owner's cookie). trim(json): what the bundle keeps (null = the whole reply). prime: the client may put the
 * block into its loader cache under this url, because the block IS the route's full reply. maxBytes: a block bigger than this is dropped as degraded, not shipped.
 */
export const BUNDLE_FEEDS = [
  { id: 'morning', url: '/api/jarvis/morning', trim: j => pick(j, ['ok', 'date', 'events', 'summary', 'overnightAlerts']) },
  { id: 'drill', url: `/api/drill-series?keys=${HEAD_DRILL_KEYS.join(',')}&tail=60`, trim: null },
  { id: 'brief', url: '/api/daily-brief', trim: j => ({ ...pick(j, ['ok', 'generated_at', 'session_date']), instruments: mapObj(pick(j?.instruments, HEAD_KEYS), v => ({ levels: { hl_med: { pct: v?.levels?.hl_med?.pct ?? null } }, current_price: v?.current_price ?? null, stale: !!v?.stale, prev_day: v?.prev_day ? pick(v.prev_day, ['high', 'low', 'date']) : null })) }) },
  { id: 'sess', url: '/api/vol-forecast/session', trim: j => ({ ...pick(j, ['ok', 'session_date', 'fetched_at', 'fallback']), instruments: mapObj(j?.instruments, v => (v && !v.error ? { hl: v.hl ?? null } : null)) }) },
  { id: 'fc', url: '/api/vol-forecast', trim: j => ({ ...pick(j, ['ok', 'session_date', 'generated_at', 'fetched_at']), instruments: mapObj(j?.instruments, v => ({ hl_median: v?.hl_median ?? null })) }) },
  { id: 'mc', url: '/api/macro-changes', trim: null, prime: true },
  { id: 'asia', url: '/api/asia-today', trim: null, prime: true },
  { id: 'events', url: '/api/events', trim: null, prime: true, maxBytes: 60_000 },
  { id: 'wider', url: '/api/wider-market', trim: null, prime: true },
  { id: 'hitRates', url: '/api/vol-forecast/hit-rates', trim: j => ({ ...pick(j, ['ok', 'computed_at', 'lookback_days']), instruments: mapObj(j?.instruments, v => ({ days: v?.total_days ?? null, hit: mapObj(v?.levels, l => l?.hit_pct ?? null) })) }) },
  { id: 'qlike', url: '/api/vol-forecast/ladder-v2/qlike-today', trim: j => ({ ...pick(j, ['ok', 'track', 'session']), instruments: mapObj(j?.levels, v => ({ hl_p50: r(v?.hl_p50), hl_p75: r(v?.hl_p75), sigma: r(v?.sigma, 4), arm: v?.arms?.hl ?? null, asof: v?.asof ?? null })) }) },
  { id: 'xccy', url: '/api/xccy-basis', trim: null, prime: true },
  { id: 'cvol', url: '/api/cvol', trim: null, prime: true },
  { id: 'fxCarry', url: '/api/fx-carry', trim: j => ({ asOf: j?.financing?.asOf ?? j?.last ?? null, last: j?.last ?? null, current: j?.current ?? null, carry: (j?.haircut?.rows ?? []).map(x => pick(x, ['pair', 'ccy', 'interbankDiffPct', 'oandaCarryPct'])) }), maxBytes: 12_000 },
  { id: 'fundingRead', url: '/api/funding-read?spark=0', trim: j => ({ ...pick(j, ['ok', 'builtAt', 'flags', 'evidence', 'line']), items: (j?.items ?? []).map(x => pick(x, ['id', 'group', 'label', 'unit', 'state', 'text'])) }) },
  { id: 'eventImpact', url: '/api/vol-forecast/event-impact', trim: null, maxBytes: 40_000 },
  { id: 'releaseReactions', url: '/api/release-reactions', trim: j => ({ ok: j?.ok, at: j?.lastRun?.at ?? null, live: (j?.live ?? []).slice(-6).map(x => pick(x, ['key', 'country', 'ccy', 'event', 'at', 'surprise', 'label30', 'label240'])), recent: (j?.recent ?? []).slice(0, 8).map(x => pick(x, ['key', 'country', 'event', 'at', 'surprise', 'label30', 'label240'])) }) },
];
/** Blocks the server builds itself (no self-fetch): the new G10 and funding boards, roll health, the intraday stress line, the ICE dollar index. */
export const INTERNAL_BLOCKS = ['g10', 'funding', 'rollHealth', 'stress', 'dxyIce'];
const DEFAULT_MAX = 30_000;

/** One block: { asOf (ISO|null), source, stale, degraded, error?, ms, prime?, data }. A route that answers { ok: false } is degraded, kept with its error. */
export function wrapBlock(id, source, json, { error = null, ms = null, now = Date.now(), trim = null, maxBytes = DEFAULT_MAX, prime = null, staleUrl = source } = {}) {
  if (error || json == null) return { id, source, asOf: null, stale: true, degraded: true, error: error ?? 'no reply', ms, data: null };
  let data = json; try { data = trim ? trim(json) : json; } catch (e) { return { id, source, asOf: null, stale: true, degraded: true, error: `trim: ${e.message}`, ms, data: null }; }
  const bytes = JSON.stringify(data)?.length ?? 0;
  if (bytes > maxBytes) return { id, source, asOf: null, stale: true, degraded: true, error: `too large for the bundle (${Math.round(bytes / 1000)} KB)`, ms, data: null };
  const a = asOfOf(json) ?? asOfOf(data), bad = json?.ok === false;
  return { id, source, asOf: a != null ? new Date(a).toISOString() : null, stale: bad || staleOf(json, staleUrl, now), degraded: bad, ...(bad ? { error: String(json.error ?? 'not ok').slice(0, 160) } : {}), ms, ...(prime ? { prime } : {}), data };
}

/**
 * Build the bundle. fetchJson(url) -> Promise<json> (throws on HTTP errors and timeouts); internal: { id: async () => json }. Every block is independent: one failure marks
 * that block degraded and the rest carry on. Returns { ok, builtAt, blocks, degraded: [ids], partial }.
 */
export async function buildHelixBundle({ fetchJson, internal = {}, now = () => Date.now(), feeds = BUNDLE_FEEDS } = {}) {
  const blocks = {}, t0 = now();
  await Promise.all([
    ...feeds.map(async f => {
      const s = now();
      try { blocks[f.id] = wrapBlock(f.id, f.url, await fetchJson(f.url), { ms: now() - s, now: now(), trim: f.trim, maxBytes: f.maxBytes ?? DEFAULT_MAX, prime: f.prime ? f.url : null }); }
      catch (e) { blocks[f.id] = wrapBlock(f.id, f.url, null, { error: e?.message ?? String(e), ms: now() - s }); }
    }),
    ...Object.entries(internal).map(async ([id, fn]) => {
      const s = now();
      try { const j = await fn(); blocks[id] = wrapBlock(id, `internal:${id}`, j, { ms: now() - s, now: now(), maxBytes: 60_000, staleUrl: `/api/${id === 'g10' ? 'g10-rates' : id === 'funding' ? 'funding-board' : id}` }); if (j?.absent) blocks[id].degraded = false; }
      catch (e) { blocks[id] = wrapBlock(id, `internal:${id}`, null, { error: e?.message ?? String(e), ms: now() - s }); }
    }),
  ]);
  const degraded = Object.values(blocks).filter(b => b.degraded).map(b => b.id).sort();
  return { ok: Object.values(blocks).some(b => !b.degraded), builtAt: new Date(now()).toISOString(), ms: now() - t0, blocks, degraded, partial: degraded.length > 0 };
}

// ── the daily record ───────────────────────────────────────────────────────────────────────────────────────────────
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const RECORD_MAX_BYTES = 400_000;
const clip = (s, n) => (s == null ? null : String(s).slice(0, n));
/** Validate and shape one broadcast run for the day record. Returns { ok, run } or { ok: false, error }. */
export function cleanRun(body, { now = Date.now() } = {}) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'no body' };
  const date = String(body.date ?? ''); if (!ISO.test(date)) return { ok: false, error: 'date must be YYYY-MM-DD' };
  const bytes = JSON.stringify(body).length; if (bytes > RECORD_MAX_BYTES) return { ok: false, error: `record too large (${Math.round(bytes / 1000)} KB, limit ${RECORD_MAX_BYTES / 1000} KB)` };
  const part = /^[a-z]{3,12}$/.test(String(body.part ?? '')) ? body.part : 'morning';
  const plan = (Array.isArray(body.plan) ? body.plan : []).slice(0, 200).map(x => ({ kind: clip(x?.kind, 24), id: clip(x?.id, 40), title: clip(x?.title, 120), view: clip(x?.view, 40), text: clip(x?.text, 2000) }));
  return { ok: true, date, part, run: { savedAt: new Date(now).toISOString(), mode: clip(body.mode, 16), part, headline: body.headline ?? null, inputs: body.inputs ?? null, plan, sceneCount: plan.length, degraded: Array.isArray(body.degraded) ? body.degraded.slice(0, 40) : [], watcher: body.watcher ?? null } };
}
/** Merge one run into the day's file: { date, updatedAt, runs: { <part>: latest run }, count: { <part>: n } }. Earlier parts of the day are kept. */
export function mergeDayRecord(prev, date, part, run) {
  const base = prev && prev.date === date ? prev : { date, runs: {}, count: {} };
  return { date, updatedAt: run.savedAt, runs: { ...base.runs, [part]: run }, count: { ...base.count, [part]: (base.count?.[part] ?? 0) + 1 } };
}
/** The watcher summary kept with the record: when it last looked and its last ten alerts. */
export const watcherSummary = w => (w && w.ok !== false ? { lastCheck: w.lastCheck ?? null, liveOk: w.liveOk ?? null, alerts: (w.lastAlerts ?? []).slice(0, 10).map(a => pick(a, ['at', 'level', 'kind', 'text', 'sent'])) } : null);

// ── roll health (rates-legs/_health.json) ──────────────────────────────────────────────────────────────────────────
/**
 * Normalise whatever the IBKR roll lane writes into { ok, absent, asOf, roots: [{ root, newestBar, ageDays, bdToRoll, front, next, flag, why }], flagged: [root] }.
 * Accepts { roots: {ROOT: {...}} }, { roots: [...] } or a bare { ROOT: {...} }. A missing file is { ok: false, absent: true } (not degraded: the job may not have run yet).
 */
export function readRollHealth(json, { now = Date.now() } = {}) {
  if (json == null) return { ok: false, absent: true, roots: [], flagged: [], note: 'rates-legs/_health.json not written yet (the IBKR roll job writes it).' };
  const src = json.roots ?? json.health ?? json, list = Array.isArray(src) ? src : Object.entries(src).filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v)).map(([k, v]) => ({ root: k, ...v }));
  const roots = list.map(x => {
    const newest = x.newestBar ?? x.newest_bar ?? x.lastBar ?? x.last_bar ?? x.newest ?? null, ms = newest != null ? (typeof newest === 'number' ? (newest > 1e12 ? newest : newest * 1000) : Date.parse(newest)) : null;
    const age = Number.isFinite(ms) ? r((now - ms) / 864e5, 1) : null, bd = x.bdToRoll ?? x.bd_to_roll ?? x.businessDaysToRoll ?? x.days_to_roll ?? null;
    const flag = !!(x.flag ?? x.flagged ?? (x.ok === false)), why = x.why ?? x.reason ?? (Array.isArray(x.flags) ? x.flags.join('; ') : null);
    return { root: String(x.root ?? x.symbol ?? '?'), newestBar: Number.isFinite(ms) ? new Date(ms).toISOString() : null, ageDays: age, bdToRoll: Number.isFinite(+bd) && bd !== null ? +bd : null, front: x.front ?? null, next: x.next ?? null, flag, why: why ? String(why).slice(0, 200) : null };
  }).sort((a, b) => (a.root < b.root ? -1 : 1));
  const asOf = json.asOf ?? json.generatedAt ?? json.writtenAt ?? json.at ?? null;
  return { ok: roots.length > 0, absent: false, asOf, roots, flagged: roots.filter(x => x.flag).map(x => x.root), inRollWindow: roots.filter(x => x.bdToRoll != null && x.bdToRoll <= 3).map(x => x.root) };
}

// ── intraday stress line (archive/i15_MOVE, archive/i15_DXY) ───────────────────────────────────────────────────────
export const STRESS_IDS = ['MOVE', 'DXY'], STRESS_MIN_DAYS = 10;
const median = a => { const s = a.filter(Number.isFinite).slice().sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
/**
 * days: { ID: [{ date, t: [epoch s], c: [close] }] } oldest first (from archive/i15_<ID>/<YYYY>/<date>.json payloads). Per series: the newest day's open-to-last change and
 * high-low range (percent), and that range against the median range of the previous days. null rows until STRESS_MIN_DAYS days exist. Description: how far each moved today.
 */
export function buildStress(days, { minDays = STRESS_MIN_DAYS, spark = 120 } = {}) {
  const out = {};
  for (const id of STRESS_IDS) {
    const a = (days?.[id] ?? []).filter(d => Array.isArray(d?.c) && d.c.length >= 4).sort((x, y) => (x.date < y.date ? -1 : 1));
    if (a.length < minDays) { out[id] = { ok: false, days: a.length, need: minDays, why: `only ${a.length} days of 15-minute bars stored; the line starts at ${minDays}` }; continue; }
    const rng = d => { const hi = Math.max(...d.c), lo = Math.min(...d.c); return lo > 0 ? ((hi - lo) / lo) * 100 : null; };
    const last = a[a.length - 1], first = last.c[0], now = last.c[last.c.length - 1], prior = a.slice(-21, -1).map(rng), med = median(prior), rg = rng(last);
    const tail = a.slice(-3), t = tail.flatMap(d => d.t).slice(-spark), c = tail.flatMap(d => d.c).slice(-spark);
    out[id] = { ok: true, days: a.length, date: last.date, last: r(now, 3), chgPct: r(((now - first) / first) * 100, 2), rangePct: r(rg, 2), rangeVsMedian: med ? r(rg / med, 2) : null, priorDays: prior.length, t, c };
  }
  return { ok: STRESS_IDS.some(id => out[id].ok), series: out, label: 'How far the MOVE index and the dollar index moved today in 15-minute bars, against their own recent days. Description, not a signal.' };
}

// ── vol terrain (/api/vol-terrain) ─────────────────────────────────────────────────────────────────────────────────
/** The markets and OANDA symbols the VOL view draws. */
export const TERRAIN_MARKETS = VOL_MARKETS.map(m => ({ key: m.key, oanda: m.oanda }));
/** barsByKey: { KEY: OANDA daily candles ({ datetime, high, low } as /api/ohlc-range values) } -> { KEY: [[date, rangePct]] } (completed weekdays only, the VOL view's own rule). */
export function terrainRanges(barsByKey, todayIso) {
  const markets = {}, missing = [];
  for (const m of TERRAIN_MARKETS) {
    const d = dailyRanges({ values: barsByKey?.[m.key] ?? [] }, todayIso);
    if (d.length) markets[m.key] = d.map(x => [x.date, r(x.r, 4)]); else missing.push(m.key);
  }
  return { markets, missing };
}
