/**
 * Liquidity Levels — a Tier-2 level source for the intraday liquidity strategy.
 *
 * Emits levels that proxy where institutional liquidity pools form, based on
 * the education materials (see education/):
 *
 *   1. **Volume profile** (POC/VAH/VAL) — the price levels where most volume
 *      traded; natural support/resistance where institutional orders cluster.
 *      Reuses levelSources.volume_profile (already a shared brick).
 *
 *   2. **Naked prior extremes** — prior session highs/lows and POCs that price
 *      has NOT traded back through (retested = filled). Reuses nakedLevels brick.
 *
 *   3. **Session range alignment zones** — where today's Asia-range extension
 *      aligns with yesterday's within tolerance (the Range Extension Levels
 *      lesson's "highest-probability" zones). Uses detectConfluencesCore.
 *
 *   4. **OI walls** (FORWARD-ONLY / LIVE MODE) — CME options OI call/put walls
 *      and max pain. No historical data for spot FX, so this source returns []
 *      in backtest mode and reads the live KV `oi_store` in live mode.
 *
 * Pure + horizon-agnostic: takes ctx (dailyBars, intraday, instrument, price),
 * returns Level[]. No network. Designed to slot into the range-line analyser's
 * `sessionConfluenceLevels` as an additional confluence source, so the per-line
 * policy learns whether liquidity-backed levels trade better than bare fib lines.
 *
 * USAGE (in rangeLineAnalyser.sessionConfluenceLevels):
 *   sources = [...CONFLUENCE_SOURCES, 'liquidity_levels'];
 *
 * The OI forward-only mode is activated by passing an `oiLevels` array in ctx:
 *   ctx.oiLevels = [{price, type, tier}, ...]   // from KV oi_store
 * When absent (backtest), OI levels are omitted.
 */

import { pipSize as pipSizeOf } from './instrumentRegistry.js';
import { resampleTo } from './barUtils.js';
import { nakedLevels } from './nakedLevels.js';
import { detectConfluencesCore } from './confluence-core.js';

// ── Helpers ──────────────────────────────────────────────────────────────────────
const lastN = (arr, n) => (n >= arr.length ? arr.slice() : arr.slice(arr.length - n));
const pipOf = ctx => {
  if (ctx.pipSize != null) return ctx.pipSize;
  try { return pipSizeOf(ctx.instrument); } catch { return 0.0001; }
};
const L = (price, kind, label, weight, meta = {}) => ({ price, kind, label, weight, meta });

// ── 1) Volume profile POC/VAH/VAL (composite over lookback days) ─────────────────
// Replicates the volumeProfileLevels logic from levelSources.js inline so this
// module is self-contained and avoids a circular dependency risk. Same math.
function _volumeProfileLevels(bars, pip, lookbackDays = 5, binPips = 1, valueAreaPct = 0.70) {
  if (!bars || !bars.length) return [];
  const bin = Math.max(binPips, 1e-9) * pip;
  const since = bars[bars.length - 1].time - lookbackDays * 86400;
  const slice = bars.filter(b => b.time >= since);
  if (!slice.length) return [];

  const hist = new Map();
  let total = 0;
  for (const b of slice) {
    const vol = b.volume ?? 1;
    const key = Math.round((b.open + b.close) / 2 / bin);
    hist.set(key, (hist.get(key) ?? 0) + vol);
    total += vol;
  }
  if (!hist.size) return [];

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
  const poc = sorted[pocIdx][0] * bin;
  const vah = sorted[hi][0] * bin;
  const val = sorted[lo][0] * bin;
  return [
    L(poc, 'liq_poc', `Liq POC ${lookbackDays}d`, 1.2, { lookbackDays }),
    L(vah, 'liq_vah', `Liq VAH ${lookbackDays}d`, 1.0, { lookbackDays }),
    L(val, 'liq_val', `Liq VAL ${lookbackDays}d`, 1.0, { lookbackDays }),
  ];
}

// ── 2) Naked prior extremes (untested prior H/L and POCs) ────────────────────────
// Builds per-day session summaries from intraday bars and runs nakedLevels.
function _nakedLevels(intraday, pip, lookback = 30, bufferPips = 0) {
  if (!intraday || intraday.length < 2) return [];

  // Group intraday bars into daily sessions (UTC day boundaries).
  const byDay = new Map();
  for (const b of intraday) {
    const dayKey = b.time - (b.time % 86400);   // UTC midnight epoch
    if (!byDay.has(dayKey)) byDay.set(dayKey, []);
    byDay.get(dayKey).push(b);
  }
  const sessions = [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([date, bars]) => {
      let hi = -Infinity, lo = Infinity, sum = 0, count = 0;
      for (const b of bars) {
        if (b.high > hi) hi = b.high;
        if (b.low < lo) lo = b.low;
        sum += (b.open + b.close) / 2;
        count++;
      }
      return { date: new Date(date * 1000).toISOString().slice(0, 10), high: hi, low: lo, poc: sum / count };
    });

  if (sessions.length < 2) return [];
  const naked = nakedLevels(sessions, { lookback, pip, bufferPips, kinds: ['poc', 'high', 'low'] });
  return naked.map(lv => {
    const kind = lv.kind === 'npoc' ? 'liq_npoc' : lv.kind === 'naked_high' ? 'liq_naked_high' : 'liq_naked_low';
    const label = lv.kind === 'npoc' ? 'Naked POC' : lv.kind === 'naked_high' ? 'Naked High' : 'Naked Low';
    return L(lv.price, kind, label, 1.1, { date: lv.date });
  });
}

// ── 3) Session range alignment zones ─────────────────────────────────────────────
// Where today's Asia-range extension aligns with yesterday's within tolerance
// (the Range Extension Levels lesson's "highest-probability" zones).
// Input: an array of {level, source} from prior sessions' extensions.
// Tolerance = `alignPips` × pip (default 2 pips for EUR/USD, the lesson's value).
function _sessionAlignment(priorLevels, pip, alignPips = 2) {
  if (!priorLevels || !priorLevels.length || !(pip > 0)) return [];
  const tol = alignPips * pip;
  // Use the confluence-core's clustering to find aligned groups.
  const clustered = detectConfluencesCore(priorLevels, tol);
  return (clustered || []).map(c => {
    const n = c.count ?? 2;          // number of levels that aligned here
    const price = c.price ?? c.mean ?? (c.levels?.[0]?.price ?? 0);
    return L(price, 'liq_alignment', `Align ${n}×`, Math.min(1.0 + n * 0.15, 1.6), { count: n });
  });
}

// LEVELS from daily + prior intraday for the liquidity strategy.
// ctx: { dailyBars, intraday, instrument, price?, pipSize?, params? }
// params: { vpLookback=5, nakedLookback=30, nakedBufferPips=0,
//           alignPips=2, oiLevels=null }
export function liquidityLevels(ctx) {
  const { dailyBars = [], intraday = [] } = ctx;
  const pip = pipOf(ctx);
  const p = ctx.params ?? {};
  const vpLookback = p.vpLookback ?? 5;
  const nakedLookback = p.nakedLookback ?? 30;
  const nakedBufferPips = p.nakedBufferPips ?? 0;
  const alignPips = p.alignPips ?? 2;       // lesson default: 2 pips

  const out = [];

  // 1) Volume profile levels from intraday bars
  if (intraday.length) {
    out.push(..._volumeProfileLevels(intraday, pip, vpLookback));
  }

  // 2) Naked prior extremes from intraday bars
  if (intraday.length) {
    out.push(..._nakedLevels(intraday, pip, nakedLookback, nakedBufferPips));
  }

  // 3) Session range alignment zones
  // Build prior session extension levels from dailyBars for the alignment scan.
  // Each prior day's range is projected as a 1x extension above/below.
  if (dailyBars.length >= 2 && pip > 0) {
    const priorLevels = [];
    for (let i = Math.max(0, dailyBars.length - 10); i < dailyBars.length - 1; i++) {
      const d = dailyBars[i];
      const range = d.high - d.low;
      if (range > pip * 10) {   // skip trivial ranges
        priorLevels.push({ price: d.high + range, source: 'ext_high', date: d.time });
        priorLevels.push({ price: d.low - range,  source: 'ext_low',  date: d.time });
      }
    }
    if (priorLevels.length >= 2) {
      out.push(..._sessionAlignment(priorLevels, pip, alignPips));
    }
  }

  // 4) OI walls (forward-only / live mode)
  // In backtest mode, no oiLevels → skip. In live mode, pass parsed OI levels.
  const oiLevels = Array.isArray(p.oiLevels) ? p.oiLevels : null;
  if (oiLevels) {
    for (const oi of oiLevels) {
      const price = Number(oi.price) || 0;
      if (!(price > 0)) continue;
      const type = (oi.type || '').toLowerCase();
      const tier = oi.tier ?? '';
      const label = type === 'call_wall' ? `Call Wall ${tier}`
                  : type === 'put_wall'  ? `Put Wall ${tier}`
                  : type === 'max_pain'  ? 'Max Pain'
                  : type === 'gamma_flip' ? 'Gamma Flip'
                  : `OI ${type}`;
      const kind = type === 'call_wall'  ? 'liq_oi_call'
                 : type === 'put_wall'   ? 'liq_oi_put'
                 : type === 'max_pain'   ? 'liq_oi_mp'
                 : type === 'gamma_flip' ? 'liq_oi_gf'
                 : 'liq_oi';
      const weight = tier === 'strong'   ? 1.5
                   : tier === 'moderate' ? 1.2
                   : tier === 'weak'     ? 0.8
                   : 1.0;
      out.push(L(price, kind, label, weight, { oiType: type, tier }));
    }
  }

  return out;
}

// Registry entry for levelSources.js — shape: { id, label, kind, defaultParams, levels(ctx) }.
export const LIQUIDITY_LEVEL_SOURCE = {
  id: 'liquidity_levels',
  label: 'Liquidity (vol profile + naked + alignment + OI)',
  kind: 'liquidity_levels',
  defaultParams: { vpLookback: 5, nakedLookback: 30, nakedBufferPips: 0, alignPips: 2, oiLevels: null },
  levels: liquidityLevels,
};
