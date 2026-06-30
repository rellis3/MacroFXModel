/**
 * Level Sources — the Tier-2 "snap-in" brick: pluggable modules that each emit a
 * list of price LEVELS a strategy / chart / confluence-scorer can consume. This
 * is the level the user builds strategies at ("plug in daily-open + pivots +
 * VAH/VAL/POC + S&R + round numbers"). It is built ON the Tier-1 primitives
 * (instrumentRegistry for pip size, barUtils for resampling) — never re-deriving
 * them — so a level source can't drift from the rest of the stack.
 *
 * WHY a uniform `levels()` contract
 *   The repo already proved the pluggable-module pattern in confluenceModules.js
 *   ({buildPairCache, buildDayState, check}) — but that interface answers only
 *   "is THIS price near a level?", so the levels are trapped inside the Asia-range
 *   engine. Here every module instead EMITS the levels:
 *
 *     LevelSource = { id, label, kind, defaultParams, levels(ctx) → Level[] }
 *     Level       = { price, kind, label, weight, meta }
 *     ctx         = { dailyBars, instrument, price?, intraday?, params? }
 *
 *   One level list, three consumers: a confluence scorer clusters it, the chart
 *   viewer renders it, a strategy trades off it. Add a module = add one registry
 *   entry; plug it into a strategy = pick its id.
 *
 * CONVENTIONS (no lookahead, horizon-agnostic)
 *   • `dailyBars` = chronological completed D1 bars [{time,open,high,low,close}]
 *     (time = UTC day epoch, seconds). The LAST element is the most recent
 *     COMPLETED day — i.e. "yesterday" relative to the session you're placing
 *     levels for. "Over past x days" = the last x elements. A module never reads
 *     beyond what it's given, so the caller controls the as-of point by slicing.
 *   • `intraday` (optional) = finer bars [{time,open,high,low,close}] used by the
 *     volume profile; if absent, that source returns [].
 *   • `instrument` = any symbol the instrumentRegistry knows (for pip size).
 *   • `price` (optional) = reference price for round numbers; defaults to the
 *     last daily close.
 *
 * Live bots are untouched: the Gold bot's Python copies (volume_profile.py,
 * session_engine.py) are the unification targets tracked in LEGO_MODULES.md, not
 * edited here.
 */

import { pipSize as pipSizeOf } from './instrumentRegistry.js';
import { resampleTo } from './barUtils.js';

// ── Small helpers ────────────────────────────────────────────────────────────
const lastN = (arr, n) => (n >= arr.length ? arr.slice() : arr.slice(arr.length - n));
const isoDay = epochSec => new Date(epochSec * 1000).toISOString().substring(0, 10);
const pipOf = ctx => {
  if (ctx.pipSize != null) return ctx.pipSize;       // explicit override (tests / unknown symbols)
  try { return pipSizeOf(ctx.instrument); } catch { return 0.0001; }
};
const L = (price, kind, label, weight, meta = {}) => ({ price, kind, label, weight, meta });

// ── 1) Daily opens (last x days) ─────────────────────────────────────────────
// One level per recent daily open. Most-recent gets the highest weight (today's
// reference is most-watched). params: { days = 5 }.
function dailyOpenLevels(ctx) {
  const { days = 5 } = ctx.params ?? {};
  const bars = lastN(ctx.dailyBars ?? [], days);
  const out = [];
  for (let i = 0; i < bars.length; i++) {
    const recency = (i + 1) / bars.length;                 // oldest→newest 0..1
    out.push(L(bars[i].open, 'daily_open', `Open ${isoDay(bars[i].time)}`, +(0.6 + 0.6 * recency).toFixed(3),
      { date: isoDay(bars[i].time), barsBack: bars.length - i }));
  }
  return out;
}

// ── 2) Prior-period high/low (PDH/PDL, PWH/PWL, N-day extremes) ───────────────
// params: { prevDay = true, prevWeek = true, extremesDays = [20] }
// prevWeek uses the calendar week (Mon-anchored) immediately before the last bar.
function priorHighLowLevels(ctx) {
  const { prevDay = true, prevWeek = true, extremesDays = [20] } = ctx.params ?? {};
  const bars = ctx.dailyBars ?? [];
  if (!bars.length) return [];
  const out = [];

  if (prevDay) {
    const d = bars[bars.length - 1];
    out.push(L(d.high, 'pdh', `PDH ${isoDay(d.time)}`, 2.0, { date: isoDay(d.time) }));
    out.push(L(d.low,  'pdl', `PDL ${isoDay(d.time)}`, 2.0, { date: isoDay(d.time) }));
  }

  if (prevWeek) {
    // Group bars into Mon-anchored weeks via epoch math (Jan 1 1970 = Thu, day 4).
    const weekOf = t => { const ds = Math.floor(t / 86400); const dow = (ds + 4) % 7; const dToMon = dow === 0 ? 6 : dow - 1; return (ds - dToMon) * 86400; };
    const lastWeek = weekOf(bars[bars.length - 1].time);
    let ph = -Infinity, pl = Infinity, found = false;
    for (const b of bars) { if (weekOf(b.time) === lastWeek - 7 * 86400) { ph = Math.max(ph, b.high); pl = Math.min(pl, b.low); found = true; } }
    if (found) {
      out.push(L(ph, 'pwh', 'PWH', 1.5, {}));
      out.push(L(pl, 'pwl', 'PWL', 1.5, {}));
    }
  }

  for (const days of extremesDays) {
    const win = lastN(bars, days);
    if (!win.length) continue;
    let hi = -Infinity, lo = Infinity;
    for (const b of win) { hi = Math.max(hi, b.high); lo = Math.min(lo, b.low); }
    out.push(L(hi, 'range_high', `${days}d High`, 1.0, { days }));
    out.push(L(lo, 'range_low',  `${days}d Low`,  1.0, { days }));
  }
  return out;
}

// ── 3) Floor / Camarilla pivots (from the prior day H/L/C) ───────────────────
// params: { method = 'classic' | 'camarilla' }. Standard formulas — the Gold
// bot's session_engine.py variant is a separate unification target (see registry).
function pivotLevels(ctx) {
  const { method = 'classic' } = ctx.params ?? {};
  const bars = ctx.dailyBars ?? [];
  if (!bars.length) return [];
  const { high: H, low: Lo, close: C } = bars[bars.length - 1];
  const range = H - Lo;
  const out = [];
  if (method === 'camarilla') {
    const f = m => range * 1.1 / m;
    out.push(L(C + f(12), 'pivot_r', 'CamR1', 1.0, { lvl: 'R1' }), L(C - f(12), 'pivot_s', 'CamS1', 1.0, { lvl: 'S1' }));
    out.push(L(C + f(6),  'pivot_r', 'CamR2', 1.1, { lvl: 'R2' }), L(C - f(6),  'pivot_s', 'CamS2', 1.1, { lvl: 'S2' }));
    out.push(L(C + f(4),  'pivot_r', 'CamR3', 1.3, { lvl: 'R3' }), L(C - f(4),  'pivot_s', 'CamS3', 1.3, { lvl: 'S3' }));
    out.push(L(C + f(2),  'pivot_r', 'CamR4', 1.5, { lvl: 'R4' }), L(C - f(2),  'pivot_s', 'CamS4', 1.5, { lvl: 'S4' }));
  } else {
    const PP = (H + Lo + C) / 3;
    out.push(L(PP, 'pivot_pp', 'PP', 1.5, { lvl: 'PP' }));
    out.push(L(2 * PP - Lo,        'pivot_r', 'R1', 1.2, { lvl: 'R1' }), L(2 * PP - H,        'pivot_s', 'S1', 1.2, { lvl: 'S1' }));
    out.push(L(PP + range,         'pivot_r', 'R2', 1.0, { lvl: 'R2' }), L(PP - range,        'pivot_s', 'S2', 1.0, { lvl: 'S2' }));
    out.push(L(H + 2 * (PP - Lo),  'pivot_r', 'R3', 0.8, { lvl: 'R3' }), L(Lo - 2 * (H - PP), 'pivot_s', 'S3', 0.8, { lvl: 'S3' }));
  }
  return out;
}

// ── 4) Volume profile (POC / VAH / VAL over past x days) ──────────────────────
// Body-midpoint histogram with bar count as volume proxy (faithful to
// confluenceModules.vah_val), expanded to a `valueAreaPct` value area around the
// POC. Needs `intraday` bars. params: { lookbackDays = 5, valueAreaPct = 0.70,
// binPips = 1, mode = 'composite' | 'perDay' }.
function volumeProfileLevels(ctx) {
  const { lookbackDays = 5, valueAreaPct = 0.70, binPips = 1, mode = 'composite' } = ctx.params ?? {};
  const bars = ctx.intraday ?? [];
  if (!bars.length) return [];
  const pip = pipOf(ctx);
  const bin = Math.max(binPips, 1e-9) * pip;
  const lastTime = bars[bars.length - 1].time;
  const since = lastTime - lookbackDays * 86400;

  const profileOf = (slice) => {
    const hist = new Map();
    let total = 0;
    for (const b of slice) {
      const vol = b.volume ?? 1;                          // bar count proxy unless a volume field exists
      const key = Math.round((b.open + b.close) / 2 / bin);
      hist.set(key, (hist.get(key) ?? 0) + vol);
      total += vol;
    }
    if (!hist.size) return null;
    let pocKey = 0, pocCount = -1;
    for (const [k, c] of hist) if (c > pocCount) { pocCount = c; pocKey = k; }
    const sorted = [...hist.entries()].sort((a, b) => a[0] - b[0]);
    const target = total * valueAreaPct;
    let pocIdx = sorted.findIndex(([k]) => k === pocKey);
    if (pocIdx < 0) pocIdx = Math.floor(sorted.length / 2);
    let lo = pocIdx, hi = pocIdx, captured = pocCount;
    while (captured < target && (lo > 0 || hi < sorted.length - 1)) {
      const addLo = lo > 0 ? sorted[lo - 1][1] : -1;
      const addHi = hi < sorted.length - 1 ? sorted[hi + 1][1] : -1;
      if (addLo >= addHi && addLo > 0) { lo--; captured += addLo; }
      else if (addHi > 0) { hi++; captured += addHi; }
      else break;
    }
    return { poc: pocKey * bin, vah: sorted[hi][0] * bin, val: sorted[lo][0] * bin };
  };

  const emit = (p, tag, weight) => p ? [
    L(p.poc, 'poc', `POC${tag}`, weight + 0.5, {}),
    L(p.vah, 'vah', `VAH${tag}`, weight, {}),
    L(p.val, 'val', `VAL${tag}`, weight, {}),
  ] : [];

  if (mode === 'perDay') {
    const byDay = new Map();
    for (const b of bars) { if (b.time < since) continue; const d = b.time - (b.time % 86400); (byDay.get(d) ?? byDay.set(d, []).get(d)).push(b); }
    const out = [];
    for (const [d, slice] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) out.push(...emit(profileOf(slice), ` ${isoDay(d)}`, 1.4));
    return out;
  }
  return emit(profileOf(bars.filter(b => b.time >= since)), ` ${lookbackDays}d`, 1.5);
}

// ── 5) Swing support/resistance (N-bar pivots over past x days) ───────────────
// N-bar swing highs/lows (strict), clustered within a pip tolerance. Faithful to
// confluenceModules.sr_level (defaults N=5 on the given bars). params:
// { lookbackDays = 20, strength = 5, resampleMin = 0, clusterPips = 5 }.
// resampleMin>0 resamples `intraday` (or dailyBars) to that timeframe first.
function swingSRLevels(ctx) {
  const { lookbackDays = 20, strength = 5, resampleMin = 0, clusterPips = 5 } = ctx.params ?? {};
  let bars = (resampleMin > 0 ? (ctx.intraday ?? ctx.dailyBars) : ctx.dailyBars) ?? [];
  if (resampleMin > 0 && bars.length) bars = resampleTo(bars, resampleMin);
  if (bars.length) {
    const since = bars[bars.length - 1].time - lookbackDays * 86400;
    bars = bars.filter(b => b.time >= since);
  }
  const N = strength;
  if (bars.length < 2 * N + 1) return [];
  const raw = [];
  for (let i = N; i < bars.length - N; i++) {
    let isH = true, isL = true;
    for (let j = -N; j <= N; j++) {
      if (j === 0) continue;
      if (bars[i + j].high >= bars[i].high) isH = false;
      if (bars[i + j].low  <= bars[i].low)  isL = false;
    }
    if (isH) raw.push({ price: bars[i].high, kind: 'resistance' });
    if (isL) raw.push({ price: bars[i].low,  kind: 'support' });
  }
  // Cluster nearby pivots (touch count = strength of the level).
  const tol = clusterPips * pipOf(ctx);
  raw.sort((a, b) => a.price - b.price);
  const out = [];
  let bucket = [];
  const flush = () => {
    if (!bucket.length) return;
    const price = bucket.reduce((s, x) => s + x.price, 0) / bucket.length;
    const res = bucket.filter(x => x.kind === 'resistance').length;
    const kind = res >= bucket.length - res ? 'resistance' : 'support';
    out.push(L(price, kind, `Swing ${kind === 'resistance' ? 'R' : 'S'} (${bucket.length}×)`, +(0.8 + 0.2 * bucket.length).toFixed(3), { touches: bucket.length }));
    bucket = [];
  };
  for (const p of raw) {
    if (bucket.length && p.price - bucket[bucket.length - 1].price > tol) flush();
    bucket.push(p);
  }
  flush();
  return out;
}

// ── 5b) Swing-Fibonacci clusters (multi-swing confluence incl. golden pocket) ─
// The user's thesis: price reacts where fib projections from *several different*
// swing pairs agree — e.g. a 0.618/0.65 "golden pocket" from one high/low that
// also lands on a 0.5 from a different, older swing. This source projects the
// standard retracement ratios from every recent swing-high↔swing-low pair (both
// directions) and emits a level ONLY where ≥ minConfluence DISTINCT swing pairs
// land within clusterPips of each other. The confluence count is the signal.
//
// Mirrors structural-fibs.js intent (N-bar pivots, golden pocket 0.618–0.65) but
// is PURE and horizon-agnostic: works off whatever bars it's given. Distinct
// pairs are counted by their (hi,lo) identity so two ratios from the SAME swing
// pair can't fake confluence (the density confound the confluence test exposed).
// params: { lookbackDays = 60, strength = 3, topK = 6, clusterPips = 8,
//           minConfluence = 2, ratios = [0.382,0.5,0.618,0.65,0.786,0.886] }.
function swingFibLevels(ctx) {
  const {
    lookbackDays = 60, strength = 3, topK = 6, clusterPips = 8, minConfluence = 2,
    ratios = [0.382, 0.5, 0.618, 0.65, 0.786, 0.886],
  } = ctx.params ?? {};
  let bars = ctx.dailyBars ?? [];
  if (bars.length) {
    const since = bars[bars.length - 1].time - lookbackDays * 86400;
    bars = bars.filter(b => b.time >= since);
  }
  const N = strength;
  if (bars.length < 2 * N + 1) return [];

  // N-bar strict swing pivots (same test as swingSRLevels).
  const highs = [], lows = [];
  for (let i = N; i < bars.length - N; i++) {
    let isH = true, isL = true;
    for (let j = -N; j <= N; j++) {
      if (j === 0) continue;
      if (bars[i + j].high >= bars[i].high) isH = false;
      if (bars[i + j].low  <= bars[i].low)  isL = false;
    }
    if (isH) highs.push({ price: bars[i].high, time: bars[i].time, i });
    if (isL) lows.push({ price: bars[i].low,  time: bars[i].time, i });
  }
  // Always include the range extremes (the dominant anchors structural-fibs uses).
  let rHi = bars[0], rLo = bars[0];
  for (const b of bars) { if (b.high > rHi.high) rHi = b; if (b.low < rLo.low) rLo = b; }
  highs.push({ price: rHi.high, time: rHi.time, i: -1 });
  lows.push({ price: rLo.low, time: rLo.time, i: -2 });

  // Keep the most prominent K of each (highest highs / lowest lows), de-duped.
  const dedupe = arr => { const seen = new Set(); return arr.filter(x => { const k = Math.round(x.price / pipOf(ctx)); if (seen.has(k)) return false; seen.add(k); return true; }); };
  const topHighs = dedupe(highs.slice().sort((a, b) => b.price - a.price)).slice(0, topK);
  const topLows  = dedupe(lows.slice().sort((a, b) => a.price - b.price)).slice(0, topK);
  if (!topHighs.length || !topLows.length) return [];

  // Project each ratio from every (hi,lo) pair, BOTH directions. Tag each
  // projection with the originating pair id so confluence = distinct pairs.
  const projections = [];
  for (const hi of topHighs) {
    for (const lo of topLows) {
      if (hi.price <= lo.price) continue;                 // need a real range
      const range = hi.price - lo.price;
      const pairId = `${hi.i}|${lo.i}`;
      for (const r of ratios) {
        projections.push({ price: hi.price - range * r, pairId });   // retrace down from high
        projections.push({ price: lo.price + range * r, pairId });   // retrace up from low
      }
    }
  }

  // Cluster projections by price; a cluster is real confluence only if ≥
  // minConfluence DISTINCT pairs contribute.
  const tol = clusterPips * pipOf(ctx);
  projections.sort((a, b) => a.price - b.price);
  const out = [];
  let bucket = [];
  const flush = () => {
    if (!bucket.length) return;
    const pairs = new Set(bucket.map(x => x.pairId));
    if (pairs.size >= minConfluence) {
      const price = bucket.reduce((s, x) => s + x.price, 0) / bucket.length;
      out.push(L(price, 'fib_cluster', `Fib×${pairs.size}`, +(0.8 + 0.3 * pairs.size).toFixed(3),
        { confluence: pairs.size, hits: bucket.length }));
    }
    bucket = [];
  };
  for (const p of projections) {
    if (bucket.length && p.price - bucket[bucket.length - 1].price > tol) flush();
    bucket.push(p);
  }
  flush();
  return out;
}

// ── 6) Round numbers / psychological levels ──────────────────────────────────
// Big figures (every `bigPips` = 100 pips, the "00" levels) and half figures
// (every `halfPips` = 50 pips) within ±`spanPips` of the reference price. N pips
// = N × pipSize, so for EUR/USD bigPips 100 → 0.0100 grid (…1.2300, 1.2400…).
// params: { spanPips = 200, bigPips = 100, halfPips = 50, halves = true }.
function roundNumberLevels(ctx) {
  const { spanPips = 200, bigPips = 100, halfPips = 50, halves = true } = ctx.params ?? {};
  const bars = ctx.dailyBars ?? [];
  const price = ctx.price ?? (bars.length ? bars[bars.length - 1].close : null);
  if (price == null) return [];
  const pip = pipOf(ctx);
  const big = bigPips * pip, half = halfPips * pip, span = spanPips * pip;
  const snap = lv => Math.round(lv / pip) * pip;          // kill float drift
  const out = [];
  for (let lv = Math.ceil((price - span) / big) * big; lv <= price + span + 1e-12; lv += big) {
    const p = snap(lv);
    out.push(L(p, 'round_big', `Big ${p.toFixed(5)}`, 1.2, {}));
  }
  if (halves) {
    for (let lv = Math.ceil((price - span) / half) * half; lv <= price + span + 1e-12; lv += half) {
      if (Math.abs(lv / big - Math.round(lv / big)) < 1e-9) continue;   // skip levels already emitted as big
      const p = snap(lv);
      out.push(L(p, 'round_half', `Half ${p.toFixed(5)}`, 0.8, {}));
    }
  }
  return out;
}

// ── 7) VWAP / session anchors (over past x days) ─────────────────────────────
// One session VWAP per day (tp = hlc3, volume proxy = volume||1), emitted as an
// anchor level — the institutional reference the Gold bot tracks. The most
// recent day's VWAP is the live anchor (highest weight). Needs `intraday`.
// params: { lookbackDays = 5 }.
function vwapAnchorLevels(ctx) {
  const { lookbackDays = 5 } = ctx.params ?? {};
  const bars = ctx.intraday ?? [];
  if (!bars.length) return [];
  const since = bars[bars.length - 1].time - lookbackDays * 86400;
  const byDay = new Map();
  for (const b of bars) { if (b.time < since) continue; const d = b.time - (b.time % 86400); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(b); }
  const days = [...byDay.keys()].sort((a, b) => a - b);
  const out = [];
  days.forEach((d, idx) => {
    let cumTpv = 0, cumVol = 0;
    for (const b of byDay.get(d)) { const tp = (b.high + b.low + b.close) / 3; const vol = b.volume ?? 1; cumTpv += tp * vol; cumVol += vol; }
    if (cumVol <= 0) return;
    const vwap = cumTpv / cumVol;
    const recent = idx === days.length - 1;
    out.push(L(vwap, recent ? 'vwap' : 'vwap_anchor', recent ? 'VWAP (today)' : `VWAP ${isoDay(d)}`,
      recent ? 1.8 : +(1.2 + 0.06 * idx).toFixed(3), { date: isoDay(d), recent }));
  });
  return out;
}

// ── Registry ─────────────────────────────────────────────────────────────────
// Plug a source into a strategy/chart by id. defaultParams document the knobs.
export const LEVEL_SOURCES = {
  daily_open:     { id: 'daily_open',     label: 'Daily Opens',        kind: 'daily_open', defaultParams: { days: 5 },                                        levels: dailyOpenLevels },
  prior_hilo:     { id: 'prior_hilo',     label: 'Prior High/Low',     kind: 'extreme',    defaultParams: { prevDay: true, prevWeek: true, extremesDays: [20] }, levels: priorHighLowLevels },
  pivots:         { id: 'pivots',         label: 'Pivots',             kind: 'pivot',      defaultParams: { method: 'classic' },                              levels: pivotLevels },
  volume_profile: { id: 'volume_profile', label: 'Volume Profile',     kind: 'profile',    defaultParams: { lookbackDays: 5, valueAreaPct: 0.70, binPips: 1, mode: 'composite' }, levels: volumeProfileLevels },
  swing_sr:       { id: 'swing_sr',       label: 'Swing S&R',          kind: 'sr',         defaultParams: { lookbackDays: 20, strength: 5, clusterPips: 5 },   levels: swingSRLevels },
  swing_fib:      { id: 'swing_fib',      label: 'Swing-Fib Clusters', kind: 'fib_cluster',defaultParams: { lookbackDays: 60, strength: 3, topK: 6, clusterPips: 8, minConfluence: 2 }, levels: swingFibLevels },
  round_number:   { id: 'round_number',   label: 'Round Numbers',      kind: 'round',      defaultParams: { spanPips: 200, halves: true },                    levels: roundNumberLevels },
  vwap:           { id: 'vwap',           label: 'VWAP Anchors',       kind: 'vwap',       defaultParams: { lookbackDays: 5 },                                levels: vwapAnchorLevels },
};

export {
  dailyOpenLevels, priorHighLowLevels, pivotLevels,
  volumeProfileLevels, swingSRLevels, swingFibLevels, roundNumberLevels, vwapAnchorLevels,
};

// ── Aggregator ───────────────────────────────────────────────────────────────
// Run a set of sources (by id, or 'all') and return one flat, sorted Level[].
// `perSourceParams` overrides defaultParams per source id. Each level is tagged
// with `source` so a consumer can filter/colour by origin.
export function collectLevels(ctx, sourceIds = Object.keys(LEVEL_SOURCES), perSourceParams = {}) {
  const ids = sourceIds === 'all' ? Object.keys(LEVEL_SOURCES) : sourceIds;
  const out = [];
  for (const id of ids) {
    const src = LEVEL_SOURCES[id];
    if (!src) continue;
    const params = { ...src.defaultParams, ...(ctx.params ?? {}), ...(perSourceParams[id] ?? {}) };
    let levels = [];
    try { levels = src.levels({ ...ctx, params }) ?? []; } catch { levels = []; }
    for (const lv of levels) if (Number.isFinite(lv.price)) out.push({ ...lv, source: id });
  }
  return out.sort((a, b) => a.price - b.price);
}

// ── Simple clusterer ─────────────────────────────────────────────────────────
// Merge levels within `tolerancePips` into confluence zones (price = weighted
// mean, score = Σweight, sources = contributing ids). For the richer Asia/Monday
// cross-session clustering, use confluence-core.js instead.
export function clusterLevels(levels, tolerancePips, instrumentOrPip) {
  const pip = typeof instrumentOrPip === 'number' ? instrumentOrPip : (() => { try { return pipSizeOf(instrumentOrPip); } catch { return 0.0001; } })();
  const tol = tolerancePips * pip;
  const sorted = levels.slice().sort((a, b) => a.price - b.price);
  const zones = [];
  let bucket = [];
  const flush = () => {
    if (!bucket.length) return;
    const wsum = bucket.reduce((s, x) => s + (x.weight ?? 1), 0) || 1;
    const price = bucket.reduce((s, x) => s + x.price * (x.weight ?? 1), 0) / wsum;
    zones.push({
      price, score: +bucket.reduce((s, x) => s + (x.weight ?? 1), 0).toFixed(3),
      count: bucket.length,
      sources: [...new Set(bucket.map(x => x.source).filter(Boolean))],
      kinds: [...new Set(bucket.map(x => x.kind))],
      members: bucket,
    });
    bucket = [];
  };
  for (const lv of sorted) {
    if (bucket.length && lv.price - bucket[bucket.length - 1].price > tol) flush();
    bucket.push(lv);
  }
  flush();
  return zones.sort((a, b) => b.score - a.score);
}
