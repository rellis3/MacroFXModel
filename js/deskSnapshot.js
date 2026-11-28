// js/deskSnapshot.js: the Desk Terminal "time machine" data layer, pure half. Nothing here fetches, reads a clock or touches storage.
//
// WHY. The terminal shows the desk's analysis as it stands now. To scrub a currency bias, a credit reading or a rate back and forward, the values have to
// have been kept as they were published then. Most of them cannot be rebuilt later (the desk's morning book, the stress tiles, the Fed-path strip, the
// regime read), so a snapshot is taken as the day goes and stored. This file decides WHAT is kept and HOW it is shaped; js/deskSnapshotStore.js does the
// capture, the KV and R2 writes and the reads; server.js wires the schedule and the routes. Plan and rules: plans/TIME_MACHINE.md.
//
// TWO TIERS
//   CORE  a compact record (about 8 KB gzipped or less) of only the parts that MOVE or cannot be rebuilt from stored prices. Every 5 minutes while the
//         FX week is open, every 30 minutes otherwise. One section per feed (`d.<id>`), each stamped with its own data date (`inputs.<id>.asOf`): a stale
//         input stays visibly stale and is never re-stamped with the capture time.
//   FULL  once a London day, every terminal feed in full EXCEPT the long histories that are already stored elsewhere (FULL_EXCLUDED, with the reason).
//
// POINT-IN-TIME RULE. A point is the value as the feed published it at `ts`. A figure the source later revises is NOT rewritten in an old point; the
// later point carries the revision. A feed that failed is a gap IN the point (`gaps`), never a silent carry of an old value. A feed that is slow to
// change (the desk book, the central-bank board) is carried between its refreshes WITH its original asOf and `src: 'carried'`.

import { londonDate } from './deskPack.js';
import { SUB_FEEDS as MACRO_SECTION_FEEDS } from './terminal/macroSubtabs.js';

export const CORE_VERSION = 1;
export const FULL_VERSION = 1;
/** Raw JSON budget for one CORE point: about 8 KB once gzipped (a point gzips about 5-6x; measured against the live feeds in plans/TIME_MACHINE.md). */
export const MAX_POINT_BYTES = 40_000;

const num = v => (v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
const rd = (v, d = 2) => { const n = num(v); return n == null ? null : +n.toFixed(d); };
const str = (v, n = 80) => (v == null ? null : String(v).slice(0, n));
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

// ── when the FX week is open, and how often to capture ─────────────────────────────────────────────────────────────────────────
import { isFxOpen } from './marketClock.js';
export { isFxOpen };      // the wide capture rule now lives in js/marketClock.js beside the precise one used for display
export const CAPTURE_OPEN_MS = 5 * 60_000, CAPTURE_CLOSED_MS = 30 * 60_000;
export const captureIntervalMs = ms => (isFxOpen(ms) ? CAPTURE_OPEN_MS : CAPTURE_CLOSED_MS);

/** The UTC hour chunk a point belongs to: desk_snap_core_2026-11-14T17. */
export const CHUNK_PREFIX = 'desk_snap_core_';
export const chunkKey = ts => `${CHUNK_PREFIX}${new Date(ts).toISOString().slice(0, 13)}`;
export const FULL_PREFIX = 'desk_snap_full_';
export const fullKey = ld => `${FULL_PREFIX}${ld}`;
export const utcDate = ts => new Date(ts).toISOString().slice(0, 10);

// ── the CORE feeds: what each one contributes ──────────────────────────────────────────────────────────────────────────────────
// extract(json) -> { asOf, data } or null (nothing usable). `every` = minimum minutes between real fetches; in between the last good section is carried
// with its own asOf. Slow-moving feeds are fetched less often so a capture stays light on the server (the routes are cached in memory anyway).
const flagsOf = flags => Object.fromEntries((flags ?? []).filter(f => f?.key).map(f => [f.key, [f.on ? 1 : 0, rd(f.value, 2)]]));

export const CORE_FEEDS = [
  { id: 'stress', path: 'world-stress', every: 0, extract: j => (j?.tiles ? { asOf: j.at ?? null, data: { overall: j.overall ?? null, score: num(j.score), tiles: Object.fromEntries(j.tiles.map(t => [t.id, t.level])) } } : null) },
  { id: 'risk', path: 'risk-flags', every: 0, extract: j => (j?.flags ? { asOf: j.computed_at ?? null, data: { level: j.level ?? null, active: num(j.active), available: num(j.available), flags: flagsOf(j.flags), move: j.move ? { level: rd(j.move.level), pct1y: num(j.move.pct1y), chg5: rd(j.move.chg5, 1), chg20: rd(j.move.chg20, 1) } : null } } : null) },
  { id: 'em', path: 'em-gauges', every: 5, extract: j => (j?.pairs ? { asOf: j.fetchedAt ?? null, data: { z: rd(j.stress?.z), level: j.stress?.level ?? null, pairs: Object.fromEntries(Object.entries(j.pairs).filter(([, p]) => p?.ok !== false).map(([k, p]) => [k, { last: rd(p.last, 5), chg1d: rd(p.chg1d), z5: rd(p.z5, 1) }])) } } : null) },
  { id: 'strength', path: 'ccy-strength', every: 0, extract: j => (j?.horizons ? { asOf: j.builtAt ?? null, data: { closed: !!j.closed, dataAsOf: j.asOf ?? null,
    h: Object.fromEntries(Object.entries(j.horizons).map(([k, h]) => [k, h?.available ? { flat: !!h.flat, lead: h.leader ?? null, lag: h.laggard ?? null, spread: rd(h.spread), s: Object.fromEntries((h.scores ?? []).map(x => [x.ccy, rd(x.score)])) } : { na: str(h?.reason, 60) ?? 'unavailable' }])) } } : null) },
  { id: 'yields', path: 'global-yields', every: 15, extract: j => (j?.rows ? { asOf: j.fetchedAt ?? null, data: Object.fromEntries(j.rows.map(r => [r.ccy, { y2: rd(r.y2, 3), y10: rd(r.y10, 3), slope: rd(r.slope, 1), gap: rd(r.gapToUs, 1), asOf: r.asOf ?? null }])) } : null) },
  { id: 'credit', path: 'credit-liquidity', every: 30, extract: j => (j?.csi || j?.spread ? { asOf: j.builtAt ?? null, data: {
    csi: j.csi ? { v: rd(j.csi.value), asOf: j.csi.asOf ?? null, word: str(j.csi.word), comp: j.csi.components ?? null } : null,
    baa: j.spread ? { bp: rd(j.spread.bp, 0), chg20d: rd(j.spread.chg20d, 0), pct5y: num(j.spread.pct5y), asOf: j.spread.asOf ?? null, qualityBp: rd(j.spread.quality?.bp, 0) } : null,
    g4: j.g4 ? { level: rd(j.g4.level), impulse: rd(j.g4.impulse), phase: j.g4.phase ?? null, regime: j.g4.regime ?? null, asOf: j.g4.asOf ?? null } : null,
    net: j.net ? { last: rd(j.net.last, 1), chg4w: rd(j.net.chg4w, 1), impulse: j.net.impulse ?? null, tga: rd(j.net.tga, 1), rrp: rd(j.net.rrp, 1), asOf: j.net.asOf ?? null } : null,
    gateZ: j.gateZ ? { netliq: rd(j.gateZ.netliq), curve: rd(j.gateZ.curve), credit: rd(j.gateZ.credit), asOf: j.gateZ.asOf ?? null } : null } } : null) },
  { id: 'creditBoard', path: 'credit-board', every: 15, extract: j => (j?.rows ? { asOf: j.fetchedAt ?? null, data: { state: j.state ?? null, oas: Object.fromEntries(j.rows.map(r => [r.id, [rd(r.oas, 0), rd(r.z1y), rd(r.chg20d, 0), r.asOf ?? null]])) } } : null) },
  { id: 'liquidity', path: 'liquidity-board', every: 30, extract: j => (j?.items ? { asOf: j.fetchedAt ?? null, data: { state: j.state ?? null, items: j.items.map(i => [str(i.label, 40), rd(i.value, 1), rd(i.chg4w, 1), num(i.pctile), i.asOf ?? null]) } } : null) },
  { id: 'fed', path: 'fed-path', every: 10, extract: j => (j?.zq || j?.windows ? { asOf: j.zq?.asOf ?? j.asOf ?? null, data: { zqAsOf: j.zq?.asOf ?? null, mptAsOf: j.asOf ?? null, range: j.currentRange ?? null,
    meetings: (j.zq?.meetings ?? []).map(m => [m.meeting, rd(m.moveBp, 1), rd(m.probPct, 1), m.thin ? 1 : 0]),
    windows: (j.windows ?? []).map(w => [w.ref, rd(w.hike, 1), rd(w.cut, 1), rd(w.mean, 1)]) } } : null) },
  { id: 'regime', path: 'regime-board', every: 10, extract: j => (j?.frames ? { asOf: j.builtAt ?? null, data: { quadrant: j.quadrant?.cell ?? null, qName: j.quadrant?.name ?? null, overall: j.overall ? { met: num(j.overall.met), of: num(j.overall.of) } : null,
    corr: j.corr ? { state: j.corr.state ?? null, mean: rd(j.corr.mean), z: rd(j.corr.z) } : null, risk: j.risk?.level ?? null,
    vol: j.vol ? { hot: num(j.vol.hot), cold: num(j.vol.cold), n: num(j.vol.n) } : null, hmm: j.hmm ? { quiet: num(j.hmm.quiet), active: num(j.hmm.active), n: num(j.hmm.n) } : null,
    frames: Object.fromEntries(j.frames.map(f => [f.id, str(f.state, 40)])) } } : null) },
  { id: 'cb', path: 'cb-board', every: 30, extract: j => (j?.banks ? { asOf: j.asOf ?? null, data: Object.fromEntries(j.banks.filter(b => b?.read && b.id).map(b => [b.id, { ccy: b.ccy, score: rd(b.read.score), regime: b.read.regime ?? null, date: b.read.date ?? null, delta: rd(b.change?.delta), next: b.next?.date ?? null }])) } : null) },
  { id: 'macro', path: 'macro-scorecard', every: 30, extract: j => (j?.ranked ? { asOf: j.ranked.find(r => r.asOf)?.asOf ?? null, data: { composite: Object.fromEntries(j.ranked.map(r => [r.ccy, rd(r.composite)])), pair: j.pair ? { long: j.pair.long, short: j.pair.short, gap: rd(j.pair.gap) } : null, driver: j.driver?.key ?? null } } : null) },
  { id: 'releases', path: 'releases-board', every: 10, extract: j => (j?.positions ? { asOf: j.builtAt ?? null, data: { positions: j.positions.map(p => [p.ccy, num(p.pct), p.state ?? null]), ahead: (j.releases ?? []).length, cotDate: j.cotDate ?? null,
    frontEnds: (j.frontEnds?.rows ?? []).map(r => [str(r.label, 24), rd(r.d1, 1), rd(r.d5, 1)]) } } : null) },
  { id: 'watch', path: 'desk-watch', every: 5, extract: j => (j?.states ? { asOf: j.lastTick ?? null, data: { firing: j.states.filter(s => s.firing).map(s => s.id), n: j.states.length, gauges: Object.fromEntries((j.gauges ?? []).filter(g => g?.watchId).map(g => [g.watchId, g.stage ?? (g.firing ? 'firing' : 'idle')])) } } : null) },
  { id: 'desk', path: 'desk-run', every: 30, extract: j => {
    const b = j?.head?.book; if (!j?.ok || !j.head?.ok || !b) return null;
    return { asOf: j.finishedAt ?? j.packBuiltAt ?? null, data: { date: j.date ?? null, tone: b.global?.tone ?? null, label: str(j.label, 40),
      ccy: Object.fromEntries(Object.entries(b.currencies ?? {}).map(([k, v]) => [k, num(v?.bias)])),
      instruments: Object.fromEntries(Object.entries(b.instruments ?? {}).map(([k, v]) => [k, { rating: v?.rating ?? null, conviction: v?.conviction ?? null, size: num(v?.size) }])),
      exposure: b.exposure ? { cap: num(b.exposure.cap), after: b.exposure.after ?? null } : null, dq: j.dataQuality ? { decision: j.dataQuality.decision ?? null, share: rd(j.dataQuality.usableShare) } : null } };
  } },
  { id: 'deskLive', path: 'desk-update', every: 10, extract: j => (j && j.ok !== false ? { asOf: j.live?.at ?? j.date ?? null, data: { date: j.date ?? null, slots: Object.keys(j.slots ?? {}),
    live: j.live?.instruments ? Object.fromEntries(Object.entries(j.live.instruments).map(([k, v]) => [k, { rating: v?.rating ?? null, conviction: v?.conviction ?? null, size: num(v?.size) }])) : null } } : null) },
  { id: 'curve', path: 'curve-board', every: 30, extract: j => (j?.slopes ? { asOf: j.builtAt ?? null, data: { slopes: Object.fromEntries(j.slopes.map(s => [s.k, [rd(s.bp, 0), rd(s.chg1d, 0), rd(s.chg5d, 0), num(s.pct3y), s.asOf ?? null]])),
    y2: j.t2 ? { level: rd(j.t2.level, 3), chg5d: rd(j.t2.chg5d, 0) } : null, move: j.move ? Object.fromEntries(Object.entries(j.move).map(([k, v]) => [k, v?.key ?? null])) : null } } : null) },
  { id: 'vol', path: 'vol-board', every: 10, extract: j => (j?.gauges ? { asOf: j.builtAt ?? null, data: { gauges: Object.fromEntries(j.gauges.map(g => [g.id, [rd(g.last, 2), num(g.pct5y), rd(g.z5y), g.asOf ?? null]])), term: j.term ? { ratio: rd(j.term.ratio, 3), pct5y: num(j.term.pct5y), asOf: j.term.asOf ?? null } : null } } : null) },
  { id: 'market', path: 'wider-market', every: 10, extract: j => (j?.state ? { asOf: j.at ?? j.to ?? null, data: { name: j.state.name ?? null, quiet: !!j.state.quiet, broken: Array.isArray(j.brokenLinks) ? j.brokenLinks.length : null, lagging: num(j.boardFreshness?.lagging?.length) } } : null) },
  { id: 'termprem', path: 'term-premium', every: 30, extract: j => (num(j?.value) != null ? { asOf: j.fetchedAt ?? null, data: { value: rd(j.value, 3), chg20d: rd(j.chg20d, 0), pctile5y: num(j.pctile5y), asOf: j.asOf ?? null } } : null) },
];
export const CORE_IDS = CORE_FEEDS.map(f => f.id);

/** Turn one fetched feed into a section: { id, ok, src: 'live', asOf, data } or { id, ok: false, why }. `fetched` is { json, httpStatus, error, timedOut }. */
export function extractFeed(spec, fetched) {
  const f = fetched ?? {};
  if (f.timedOut) return { id: spec.id, ok: false, why: 'timeout' };
  if (f.error && f.json == null) return { id: spec.id, ok: false, why: `error: ${str(f.error, 80)}` };
  if (f.httpStatus != null && f.httpStatus >= 400) return { id: spec.id, ok: false, why: `HTTP ${f.httpStatus}` };
  if (f.json == null) return { id: spec.id, ok: false, why: 'empty' };
  if (f.json.ok === false) return { id: spec.id, ok: false, why: `not ok: ${str(f.json.error, 80) ?? 'no reason given'}` };
  try {
    const x = spec.extract(f.json);
    return x ? { id: spec.id, ok: true, src: 'live', asOf: x.asOf ?? null, data: x.data } : { id: spec.id, ok: false, why: 'empty' };
  } catch (e) { return { id: spec.id, ok: false, why: `extract: ${str(e?.message, 80)}` }; }
}

/** Which feeds are due a real fetch now: never fetched, or older than `every` minutes. last: { [id]: { at } }. */
export function dueFeeds(last, now, feeds = CORE_FEEDS) {
  return feeds.filter(f => { const l = last?.[f.id]; return !l || now - l.at >= f.every * 60_000 - 15_000; });
}

/**
 * One CORE point. entries: one per CORE feed, each the result of extractFeed (live), a carried section { id, ok: true, src: 'carried', asOf, data }, or a failure.
 * A failure leaves a hole and a line in `gaps`; nothing is filled in from an older point unless the entry itself says it is carried.
 */
export function buildCorePoint({ now, entries }) {
  const d = {}, inputs = {}, gaps = [];
  for (const e of entries) {
    if (!e) continue;
    if (e.ok) {
      d[e.id] = e.data; inputs[e.id] = { asOf: e.asOf ?? null, src: e.src ?? 'live' };
      if (e.failed) gaps.push({ id: e.id, why: e.failed, carried: true });   // a refresh failed: the last good section is shown, with its own asOf, and the failure is on the record
    } else gaps.push({ id: e.id, why: e.why ?? 'failed' });
  }
  return { v: CORE_VERSION, ts: now, ld: londonDate(now), open: isFxOpen(now), inputs, gaps, d };
}

/** Sections dropped first when a point is over budget, least valuable first. The desk book, stress tiles, strength, Fed path and regime are never dropped. */
export const TRIM_ORDER = ['em', 'market', 'vol', 'curve', 'macro', 'releases', 'creditBoard', 'liquidity', 'termprem', 'yields', 'cb', 'watch', 'credit'];
/** Keep a point inside its byte budget: drop whole sections in TRIM_ORDER, record what was dropped in `trimmed`. Never throws. */
export function trimPoint(point, maxBytes = MAX_POINT_BYTES) {
  const size = p => JSON.stringify(p).length;
  let bytes = size(point);
  if (bytes <= maxBytes) return { point, trimmed: [], bytes };
  const out = { ...point, d: { ...point.d }, inputs: { ...point.inputs } }, trimmed = [];
  for (const id of TRIM_ORDER) {
    if (bytes <= maxBytes) break;
    if (!(id in out.d)) continue;
    delete out.d[id]; delete out.inputs[id]; trimmed.push(id);
    out.trimmed = trimmed; bytes = size(out);
  }
  return { point: out, trimmed, bytes };
}

// ── reading a series back ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** Union two point lists by ts (the later list wins a clash), ascending. */
export function mergeByTs(a = [], b = []) {
  const by = new Map();
  for (const p of a) if (Number.isFinite(p?.ts)) by.set(p.ts, p);
  for (const p of b) if (Number.isFinite(p?.ts)) by.set(p.ts, p);
  return [...by.values()].sort((x, y) => x.ts - y.ts);
}
/** Keep the last point in each step-minute bucket; step <= the capture cadence keeps everything. */
export function downsample(points, stepMs) {
  if (!stepMs || stepMs <= 0) return points;
  const out = []; let cur = null;
  for (const p of points) { const b = Math.floor(p.ts / stepMs); if (cur !== null && b === cur) out[out.length - 1] = p; else { out.push(p); cur = b; } }
  return out;
}
/** Only the named sections ('desk,strength'), with their inputs and gaps. fields empty = the whole point. */
export function selectFields(point, fields) {
  if (!fields || !fields.length) return point;
  const want = new Set(fields);
  return { v: point.v, ts: point.ts, ld: point.ld, open: point.open,
    inputs: Object.fromEntries(Object.entries(point.inputs ?? {}).filter(([k]) => want.has(k))),
    gaps: (point.gaps ?? []).filter(g => want.has(g.id)),
    d: Object.fromEntries(Object.entries(point.d ?? {}).filter(([k]) => want.has(k))), ...(point.trimmed ? { trimmed: point.trimmed.filter(k => want.has(k)) } : {}) };
}
export const parseFields = s => [...new Set(String(s ?? '').split(',').map(x => x.trim()).filter(x => CORE_IDS.includes(x)))];

/** The step for a window: the requested one, widened so the answer holds at most `max` points. Always a multiple of the closed-hours cadence. */
export function chooseStep(rangeMs, requestedMin, max = 800) {
  const need = Math.ceil(rangeMs / max), req = Math.max(0, (num(requestedMin) ?? 0) * 60_000);
  const step = Math.max(need, req);
  return step <= CAPTURE_OPEN_MS ? 0 : Math.ceil(step / CAPTURE_OPEN_MS) * CAPTURE_OPEN_MS;
}

// ── the FULL snapshot ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// Every route the terminal loads (desk-terminal.html load() and loadEnrich()) plus the newer boards, EXCEPT FULL_EXCLUDED. A test keeps this list in step
// with the page: a route added to the terminal must be either captured here or excluded with a reason.
export const FULL_FEEDS = [
  'desk-score/record', 'desk-update', 'desk-quality', 'macro-scorecard', 'rate-diff', 'real-yield', 'cot-state', 'oanda-book/history', 'gpr', 'events', 'trade-watch', 'desk-weekly',
  'policy-rates', 'cb-expectations', 'desk-dayfc', 'pair-select',
  'risk-flags', 'em-gauges', 'world-rates', 'fed-path', 'funding-read?spark=0', 'nowcast', 'bank-credit', 'wider-market', 'chain-extra', 'hedging-summary', 'cot-extremes', 'global-yields',
  'credit-board', 'liquidity-board', 'term-premium', 'xccy-basis', 'world-stress',
  'fair-value', 'leading-indicators', 'commodity-fx', 'carry-vol', 'copper-gold', 'session-heat', 'options-skew', 'speech-drift', 'desk-alerts', 'release-surprises',
  'cb-board', 'macro-engines-board', 'rates-board', 'credit-liquidity', 'curve-board', 'regime-board', 'releases-board', 'vol-board', 'vol-clock', 'ccy-strength', 'desk-watch',
  'cb-path/boe',   // the Bank of England priced Bank Rate path (about 3 KB): the Bank publishes it daily and the card is built from today's curve, so a past view needs the day's copy
];
/** Long histories or whole books that are already stored somewhere durable, or can be rebuilt from stored prices. Each is left out of FULL, with the reason. */
export const FULL_EXCLUDED = [
  { path: 'earnings-reported', why: 'a 10-minute in-memory cache of reported big-company EPS/revenue (Finnhub, rebuilt on request); every reported item already enters the news wire' },
  { path: 'rates', why: 'about 230 KB of FRED history, rebuilt from FRED and already archived in R2 (archive/series/fred)' },
  { path: 'fx-fair-value', why: 'about 85 KB; the model re-runs from stored prices and keeps its own forward record (fx_fair_value_log_v1)' },
  { path: 'release-reactions', why: 'about 200 KB; every live reaction is already in release_reaction_log_v1' },
  { path: 'lead-lag', why: 'about 135 KB of statistics recomputed from stored prices' },
  { path: 'policy-extra', why: 'the FOMC clock and the priced path gap, rebuilt from the schedule and from cb-expectations (which the FULL snapshot already holds)' },
  { path: 'rates-extra', why: 'the JGB shock card, 5y5y and core PCE, fiscal events and Treasury auctions, rebuilt from their own stored feeds; auction results are kept by TreasuryDirect' },
  { path: 'markets-extra', why: 'connectedness, commodity coupling, range-line coverage, policy uncertainty, SKEW history, trend basket and option-wall distance, each rebuilt from daily series and bars held elsewhere' },
  { path: 'live-layer', why: 'an intraday overlay rebuilt from OANDA prices every 75 seconds (implied yields, index moves, range used); the CORE point already carries strength and yields, and a daily full copy of a minute-old overlay is not a record' },
  { path: 'autocorrelation', why: 'about 55 KB of statistics recomputed from stored prices' },
  { path: 'desk-news', why: 'about 75 KB wire window; each headline and its reaction is kept in desk_news_record_v1' },
  { path: 'state', why: 'about 350 KB market-state document; its history is archived by the state engine (archive/oi_summary, archive/series) and it is rebuilt from them' },
  { path: 'bias-engine', why: 'the bias engine issue is already kept for good, one write-once KV key a day (bias_engine_<date>, served by /api/bias-engine?date=), and scored forward on the bias scoreboard; an unstored live read is not a record' },
  { path: 'desk-bias-process', why: 'the Desk Bias Process issue is already kept for good, one write-once KV key a day (desk_bias_process_<date>, served by /api/desk-bias-process?date=), and scored forward head to head; a live read is not a record' },
  { path: 'bias-engine-v2/compare', why: 'the V2 shadow comparison is computed from the write-once KV records bias_engine_v2_<date> (kept for good) and the V1 issue; owner-only research, not desk state' },
  { path: 'desk-bias-process/rechecks', why: 'the intraday rechecks are already kept for good, write-once per slot in one KV key a day (desk_bias_process_rc_<date>, served by /api/desk-bias-process/rechecks?date=)' },
  { path: 'desk-bias-process/h2h', why: 'the head to head and the weekly review are computed on demand from the stored process issues (desk_bias_process_<date>), the bias scoreboard\'s same-day records in R2 and OANDA bars; a copy would only repeat what those records already rebuild' },
  { path: 'fundabias-log', why: 'the owner\'s FundaBias log is itself a write-once KV record per day (fundabias_log_<date>, served by /api/fundabias-log?date=)' },
  { path: 'desk-run', why: 'about 275 KB; the morning book is already kept for good, one key a day (desk_run_<date>); CORE carries its ratings, convictions and exposure' },
  // Helix data routes (js/helixRoutes.js, 2026-11-27): each is rebuilt from R2 records or OANDA bars that are already stored, so a daily copy would repeat them
  { path: 'g10-rates', why: 'rebuilt on request from the R2 archive series (archive/series/g10_yields, archive/series/fred), which are themselves the permanent record' },
  { path: 'funding-board', why: 'rebuilt on request from the R2 archive (archive/series/nyfed, ofr, fred, treasury and archive/tables/ust_auctions), already the permanent record' },
  { path: 'vol-terrain', why: 'the daily ranges the VOL view draws, recomputed from OANDA daily bars on request; nothing in it is not in the bars' },
  { path: 'helix/bundle', why: 'owner-only: the morning payload of the broadcast, a trimmed copy of other routes; the Helix record of the day is kept in R2 at helix/days/<date>.json' },
  { path: 'helix/record', why: 'owner-only: the Helix daily record itself, written once per broadcast run to R2 helix/days/<date>.json' },
  { path: 'helix/roll-health', why: 'a reader of rates-legs/_health.json in R2, which the IBKR roll job rewrites; the file is the record' },
  { path: 'helix/stress', why: 'rebuilt from the stored 15-minute bars in R2 (archive/i15_MOVE, archive/i15_DXY)' },
  // Helix memory (js/helixMemoryRoutes.js, 2026-11-28): owner-only readers of R2 records that are themselves the permanent record
  { path: 'helix/diary', why: 'owner-only: a reader of the stored Helix daily records (helix/days/<date>.json) and their scores; the R2 files are the record' },
  { path: 'helix/diary/search', why: 'owner-only: a keyword search over the stored Helix daily records in R2; nothing in it is not in those files' },
  { path: 'helix/scores', why: 'owner-only: a reader of helix/scores/<date>.json, written once a day by the helixScore job; the file is the record' },
  { path: 'helix/scorecard', why: 'owner-only: a reader of helix/scores/_summary.json, the rolling calibration the helixScore job rewrites; the file is the record' },
  { path: 'helix/score', why: 'owner-only POST that runs the evening scorer now; it writes helix/scores/<date>.json, nothing to snapshot' },
];
/** Feeds that carry trade levels or the owner's own record: stored in FULL for the owner, removed from a desk viewer's copy. */
export const OWNER_ONLY_FEEDS = ['trade-watch', 'pair-select', 'desk-alerts', 'desk-score/record', 'desk-quality'];

const emptyish = v => v == null || (Array.isArray(v) && !v.length) || (isObj(v) && !Object.keys(v).length);
/** One FULL snapshot. entries: [{ path, json, httpStatus, error, timedOut, ms }]. Failed or empty feeds are listed in `gaps`, and kept as { ok: false }. */
export function buildFullSnapshot({ now, entries, deskRunDate = null }) {
  const feeds = {}, gaps = [];
  for (const e of entries) {
    const bad = e.timedOut ? 'timeout' : (e.error && e.json == null) ? `error: ${str(e.error, 80)}` : (e.httpStatus != null && e.httpStatus >= 400) ? `HTTP ${e.httpStatus}` : e.json?.ok === false ? `not ok: ${str(e.json.error, 80) ?? ''}` : emptyish(e.json) ? 'empty' : null;
    if (bad) { gaps.push({ path: e.path, why: bad }); feeds[e.path] = { ok: false, why: bad }; continue; }
    feeds[e.path] = { ok: true, ms: e.ms ?? null, json: e.json };
  }
  return { v: FULL_VERSION, ts: now, ld: londonDate(now), deskRunDate, n: entries.length, okN: entries.length - gaps.length, gaps, ownerOnly: OWNER_ONLY_FEEDS, excluded: FULL_EXCLUDED, feeds };
}

/** Routes the terminal fetches, read from the page source: getJson('/api/x') calls plus the quoted names in the enrichment arrays. For the drift test. */
export function terminalRoutes(html) {
  const out = new Set();
  const loadAt = html.indexOf('async function load()'), enrichEnd = html.indexOf('function slot(sec, id)');
  const src = loadAt >= 0 && enrichEnd > loadAt ? html.slice(loadAt, enrichEnd) : '';
  for (const m of src.matchAll(/getJson\('\/api\/([a-z0-9/?=&-]+)'\)/g)) out.add(m[1]);
  for (const m of src.matchAll(/(?:const k = |for \(const x of )\[([^\]]+)\]/g)) for (const q of m[1].matchAll(/'([a-z0-9/?=&-]+)'/g)) out.add(q[1]);
  for (const list of Object.values(MACRO_SECTION_FEEDS)) for (const f of list) out.add(f);   // the Macro-only feeds load per section (js/terminal/macroSubtabs.js), not from the page-load lists above
  return [...out];
}
