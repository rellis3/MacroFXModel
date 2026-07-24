/**
 * rangeExtEngine.js — Asia Range-Extension strategy with a CONFIDENCE BRAIN.
 *
 * The strategy the education points to, built the honest way:
 *   • Levels  — Asia session (00:00–06:00) range projected as extension multiples
 *               (fibProjection ladder), the "range extension levels" framework.
 *   • Brain   — rangeExtConfidence ranks the day's ~14 candidate levels on market
 *               STATE (vol regime, day-type, Asia-range wideness, two-session
 *               alignment, extension multiple) and picks the top-N. This is the
 *               anti-noise selector: 14 candidates → 2–3 trades.
 *   • Fade/FOLLOW — direction is CHOSEN from state, not assumed. Fade the
 *               extension on a reversion day; follow the break on a trend/high-vol
 *               day. (The lever the in-house POI test never pulled.)
 *   • Exit    — vol-anchored SL (Asia-range multiple, floored) + structural or
 *               fixed-R TP. Costs on (round-trip % of price + stop slippage).
 *
 * A/B DISCIPLINE (why this file exists): the base "trade every level" fade is the
 * documented loser (POI backtest: −0.016 R/trade, Sharpe −3.43). So the engine
 * runs BOTH arms through identical geometry/exits and reports the delta on
 * per-trade expectancy and OOS — never on frequency-flattered Sharpe.
 *
 * LEGO: imports the baseplate — never copies. Session ranges (sessionRanges),
 * fib ladder (fibProjection), M1 hot path (barUtils), fill walker
 * (forecastCore.walkBars), day-type (dayTypeCore), ATR/percentile (indicatorCore/
 * statsCore), metrics (metricsCore), pip/class (instrumentRegistry). The only new
 * logic is the selection policy (rangeExtConfidence) + this wiring.
 */

import { loadM1ForPair, BT_M1_DIR } from './volBacktestM1Engine.js';
import { extractBars, resampleTo, bodyRange, calcATR } from './barUtils.js';
import { FIB_LEVELS, KEY_LEVELS, calcFibs } from './fibProjection.js';
import {
  dayStartEpoch, isoDate, eachDate,
  buildAsiaSessions, prevSession,
  buildMondayRanges, mondayForDay, prevMonday,
} from './sessionRanges.js';
import { dayContext, scoreLevel, selectLevels, DEFAULT_WEIGHTS } from './rangeExtConfidence.js';
import { walkBars } from './forecastCore.js';
import { dayTypeScore } from './dayTypeCore.js';
import { atrWilder } from './indicatorCore.js';
import { rollingPercentile } from './statsCore.js';
import { summarizeTrades } from './metricsCore.js';
import { instrument } from './instrumentRegistry.js';

export const RANGE_EXT_INSTRUMENTS = [
  'eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf', 'gbpjpy',
  'eurjpy', 'eurgbp', 'euraud', 'eurcad', 'eurchf', 'eurnzd',
  'audjpy', 'audnzd', 'audcad', 'audchf',
  'gbpaud', 'gbpcad', 'gbpchf', 'gbpnzd',
  'cadjpy', 'chfjpy', 'nzdjpy', 'gold',
];

// Round-trip frictions as % of price (matches forecastCore / the POI baseline's
// cost basis so the comparison is apples-to-apples). slip added for stop entries.
const COST_PCT = { fx: 0.012, commodity: 0.020, index: 0.010 };
const SLIP_PCT = { fx: 0.006, commodity: 0.012, index: 0.008 };

// Per-pair cache: packed M1 + derived sessions/daily (so a multi-config sweep
// loads + derives each pair ONCE). Cleared with clearRangeExtCache().
const _pairCache = new Map();
export function clearRangeExtCache(pairKey) {
  if (pairKey) _pairCache.delete(pairKey); else _pairCache.clear();
}

function median(arr) {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ── Daily bars from packed M1 (UTC calendar days) ─────────────────────────────
// Used for the day-type score and the ATR-percentile regime. Built once/pair.
function buildDailyBars(packed) {
  const out = [];
  eachDate(packed, (ds) => {
    const start = dayStartEpoch(ds, 'utc');
    const bars = extractBars(packed, start, start + 86400);
    if (!bars.length) return;
    let hi = -Infinity, lo = Infinity;
    for (const b of bars) { if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
    out.push({ date: ds, epoch: start, open: bars[0].open, high: hi, low: lo, close: bars[bars.length - 1].close });
  });
  return out;
}

// Per-date state features (all computed from data STRICTLY BEFORE that date):
//   volRegimePct — percentile of yesterday's ATR vs its trailing 252-day history
//   dayTypeT     — dayTypeScore on daily closes through yesterday
function buildDailyFeatures(daily, { atrPeriod = 14, regimeWindow = 252, dtWindow = 14 } = {}) {
  const atr = atrWilder(daily, atrPeriod);                 // aligned to `daily`
  const atrPct = rollingPercentile(atr, regimeWindow);     // aligned, NaN until warm
  const closes = daily.map((d) => d.close);
  const feat = new Map();
  for (let i = 0; i < daily.length; i++) {
    // features for trading day i use index i-1 (no lookahead onto day i).
    // rollingPercentile returns 0–100 → rescale to the [0,1] the brain expects.
    const j = i - 1;
    const volRegimePct = j >= 0 && Number.isFinite(atrPct[j]) ? atrPct[j] / 100 : 0.5;
    const dayTypeT = j >= dtWindow ? (dayTypeScore(closes, j, dtWindow) ?? 0) : 0;
    feat.set(daily[i].date, { volRegimePct, dayTypeT });
  }
  return feat;
}

// ── Candidate levels for one day ──────────────────────────────────────────────
// Builds the extension ladder off the Asia range, annotates each level with the
// features the brain needs (mult, zone, isKey, two-session alignment), and caps
// the TRADEABLE ladder to |mult| ≤ maxTradeMult (a 4× Asia extension already ≈ a
// full expected daily range; beyond that is un-hittable intraday noise — and
// dropping it is the first cut of the "14 levels is too many" problem).
// Build the extension ladder off ONE range (`rng`), tagged with `source`, with
// two-session alignment vs the prior same-source range (`prevRng`). Each cand
// carries `srcRange` so the caller can scale its stop to the range it came from
// (Monday-weekly ranges are far bigger than daily Asia — a shared stop would be
// unfair). Emits only genuine extensions (outside the range), |mult| in window.
function buildLadder(rng, prevRng, pip, source, opts) {
  const { maxTradeMult = 4.0, alignTolPips = 2.0, tightPct = 10.0, fibLevels = FIB_LEVELS } = opts;
  if (!rng || !(rng.range > pip * 5)) return [];
  const above = rng.high + pip, below = rng.low - pip;
  const tol = alignTolPips * pip;
  const tightTol = tol * (tightPct / 100);
  const prevPrices = prevRng ? fibLevels.map((lv) => prevRng.low + prevRng.range * lv) : [];

  const cands = [];
  for (const f of calcFibs(rng.low, rng.range, fibLevels)) {
    const mult = Math.abs(f.level);
    if (mult < 0.25 || mult > maxTradeMult) continue;   // tradeable window only
    const price = f.price;
    const zone = price >= above ? 'above' : price <= below ? 'below' : 'inside';
    if (zone === 'inside') continue;                     // extensions only

    // two-session alignment (this level vs nearest prior same-source level)
    let alignment = 'none', alignDistPips = null;
    if (prevPrices.length) {
      let best = Infinity;
      for (const pp of prevPrices) { const d = Math.abs(price - pp); if (d < best) best = d; }
      alignDistPips = +(best / pip).toFixed(2);
      alignment = best <= tightTol ? 'tight' : best <= tol ? 'strong' : 'none';
    }
    cands.push({ level: f.level, mult, price, zone, isKey: f.isKey, alignment, alignDistPips,
                 source, srcRange: rng.range });
  }
  return cands;
}

// Orchestrate the requested level source(s). `levelSource` = 'asia' | 'monday' |
// 'both'. Asia levels align vs the previous Asia session; Monday levels vs the
// previous Monday.
function buildCandidates(sources, pip, opts) {
  const { levelSource = 'asia' } = opts;
  const out = [];
  if (levelSource === 'asia' || levelSource === 'both')
    out.push(...buildLadder(sources.asia, sources.prevAsia, pip, 'asia', opts));
  if ((levelSource === 'monday' || levelSource === 'both') && sources.monday)
    out.push(...buildLadder(sources.monday, sources.prevMonday, pip, 'monday', opts));
  return out;
}

// ── Build one trade's order geometry (fade or follow) ─────────────────────────
// fade  : limit AT the level, back toward the range. above→SELL, below→BUY.
//         SL beyond the level; TP = structural (next level toward mid) or R.
// follow: stop THROUGH the level (continuation). above→BUY stop, below→SELL stop.
//         SL back inside; TP = next extension level out or R.
function buildOrder(cand, direction, ctx) {
  const { asia, slDist, pip, tpMode, tpR, tpBufPix, ladderPrices } = ctx;
  const price = cand.price;
  const above = cand.zone === 'above';
  let side, entry, sl, entryType, isBuy;

  if (direction === 'fade') {
    entryType = 'limit';
    if (above) { side = 'SELL'; isBuy = false; entry = price; sl = price + slDist; }
    else       { side = 'BUY';  isBuy = true;  entry = price; sl = price - slDist; }
  } else { // follow — break continues in the extension's direction
    entryType = 'stop';
    if (above) { side = 'BUY';  isBuy = true;  entry = price; sl = price - slDist; }
    else       { side = 'SELL'; isBuy = false; entry = price; sl = price + slDist; }
  }

  // Target
  let tp;
  const buf = tpBufPix;
  if (tpMode === 'rr') {
    tp = isBuy ? entry + slDist * tpR : entry - slDist * tpR;
  } else { // structural — nearest ladder level in the profit direction
    if (isBuy) {
      const ups = ladderPrices.filter((p) => p > entry + buf);
      tp = ups.length ? ups[0] - buf : entry + slDist * tpR;
    } else {
      const dns = ladderPrices.filter((p) => p < entry - buf);
      tp = dns.length ? dns[dns.length - 1] + buf : entry - slDist * tpR;
    }
  }
  // sanity
  if (isBuy && (tp <= entry || sl >= entry)) return null;
  if (!isBuy && (tp >= entry || sl <= entry)) return null;
  return { side, entry, sl, tp, entryType, isBuy, riskDist: slDist };
}

// ── One pair backtest ─────────────────────────────────────────────────────────
export async function runPairRangeExt(pairKey, opts = {}, m1Dir = BT_M1_DIR) {
  const {
    dateFrom = '', dateTo = '',
    mode = 'gated',            // 'gated' (brain: top-N + fade/follow) | 'all' (baseline: every level, fade)
    direction = 'auto',        // 'auto' (day-type selector) | 'fade' | 'follow'  (mode='gated')
    topN = 3, minConfidence = 0.5,
    slMult = 0.75, minSlPips = 5,
    tpMode = 'structural', tpR = 1.5, tpBufPips = 3,
    tradeHourFrom = 6, tradeHourTo = 20,
    walkTfMin = 5,
    maxTradeMult = 4.0,
    alignTolPips = null,       // default per-instrument below
    tightPct = 10.0,
    levelSource = 'asia',      // 'asia' | 'monday' | 'both'
    holdDays = 1,              // 1 = intraday (single session); >1 = multi-day swing hold
    mondayTfMin = 15,
    weights = DEFAULT_WEIGHTS,
    sessionTz = 'utc',
    progressCb = null,
  } = opts;

  const cached = _pairCache.get(pairKey);
  let packed, asiaSessions, daily, dailyFeat, mondayRanges;
  if (cached && opts._reuse !== false) {
    ({ packed, asiaSessions, daily, dailyFeat, mondayRanges } = cached);
  } else {
    packed = await loadM1ForPair(pairKey, m1Dir);
    if (!packed) throw new Error(`No M1 data for ${pairKey}`);
    asiaSessions = buildAsiaSessions(packed, sessionTz, 6, 5);
    mondayRanges = buildMondayRanges(packed, sessionTz, mondayTfMin);
    daily = buildDailyBars(packed);
    dailyFeat = buildDailyFeatures(daily);
    _pairCache.set(pairKey, { packed, asiaSessions, daily, dailyFeat, mondayRanges });
  }

  const inst = instrument(pairKey);
  const pip = inst?.pip ?? 0.0001;
  const cls = inst?.assetClass ?? 'fx';
  const costPct = COST_PCT[cls] ?? COST_PCT.fx;
  const slipPct = SLIP_PCT[cls] ?? SLIP_PCT.fx;
  const alignTol = alignTolPips != null ? alignTolPips : (cls === 'commodity' ? 200 : 2.0);

  // trailing median Asia range (strictly prior K sessions) for the wideness feature
  const RANGE_LOOKBACK = 20;

  const trades = [];
  let processed = 0;
  for (let si = 0; si < asiaSessions.length; si++) {
    const asia = asiaSessions[si];
    if (dateFrom && asia.date < dateFrom) { processed++; continue; }
    if (dateTo && asia.date > dateTo) { processed++; continue; }
    if (!(asia.range > pip * 5)) { processed++; continue; }

    const prevAsia = prevSession(asiaSessions, asia.epoch);

    // asiaRangeRatio vs trailing median (no lookahead: uses sessions before this)
    const priorRanges = [];
    for (let k = si - 1; k >= 0 && priorRanges.length < RANGE_LOOKBACK; k--) priorRanges.push(asiaSessions[k].range);
    const medRange = median(priorRanges);
    const asiaRangeRatio = medRange > 0 ? asia.range / medRange : 1.0;

    const df = dailyFeat.get(asia.date) ?? { volRegimePct: 0.5, dayTypeT: 0 };
    const dayFeat = { volRegimePct: df.volRegimePct, dayTypeT: df.dayTypeT, asiaRangeRatio };

    // Monday-weekly range for this day (this week's Monday; prev-Monday for its
    // alignment). Only used when levelSource includes 'monday'. For a MULTI-DAY
    // hold we must form each weekly level set ONCE (on its Monday) and hold it
    // forward — otherwise Tue–Fri each re-generate the identical week's levels and
    // trade them 5× with overlapping windows. Intraday (holdDays=1) keeps the
    // platform's behaviour (Tue–Fri trade this week's Monday range each day).
    let monday = (levelSource !== 'asia') ? mondayForDay(mondayRanges, asia.epoch) : null;
    if (holdDays > 1 && monday && monday.date !== asia.date) monday = null;
    const prevMon = monday ? prevMonday(mondayRanges, monday.epoch) : null;

    // Candidate levels (Asia and/or Monday), each tagged with its source + range
    const cands = buildCandidates(
      { asia, prevAsia, monday, prevMonday: prevMon }, pip,
      { levelSource, maxTradeMult, alignTolPips: alignTol, tightPct });
    if (!cands.length) { processed++; continue; }

    // ── SELECTION ──────────────────────────────────────────────────────────
    let chosen;      // [{ ...cand, confidence, direction }]
    const ctx = dayContext(dayFeat, weights);
    if (mode === 'all') {
      // baseline: every level, framework-default fade, NO selection — but still
      // annotate each with its fade-confidence so post-hoc top-N/threshold
      // policies can be evaluated as a filter on this full universe.
      const useCtx = { trendiness: ctx.trendiness, direction: 'fade' };
      chosen = cands.map((c) => ({ ...c, ...scoreLevel(c, useCtx, weights), direction: 'fade' }));
    } else {
      const dayDir = direction === 'auto' ? ctx.direction : direction;
      const useCtx = { trendiness: ctx.trendiness, direction: dayDir };
      const scored = cands.map((c) => {
        const s = scoreLevel(c, useCtx, weights);
        return { ...c, confidence: s.confidence, direction: s.direction, contrib: s.contributions };
      });
      chosen = selectLevels(scored, { topN, minConfidence });
    }
    if (!chosen.length) { processed++; continue; }

    // ── Geometry (SL + ladder for structural TP), per source ─────────────────
    // Each trade's stop scales to the range it came from (Monday-weekly ≫ daily
    // Asia), so R is comparable across sources. Structural TP targets the next
    // level from the SAME source's ladder.
    const ladderBySource = {};
    for (const c of cands) (ladderBySource[c.source] ??= []).push(c.price);
    for (const k in ladderBySource) ladderBySource[k].sort((a, b) => a - b);

    // ── Trade window bars (resampled) ────────────────────────────────────────
    // holdDays > 1 = a MULTI-DAY SWING hold: the window spans `holdDays` calendar
    // days from the trade start, so a level can be reached and resolve over days
    // (the honest way to test swing-timeframe / weekly levels — an intraday
    // window structurally can't). holdDays = 1 keeps the original single-session
    // window (06:00→tradeHourTo). Carry/swap on multi-day FX holds is NOT modelled
    // (no rates in-sandbox) — a small optimism flagged in the findings.
    const from = asia.epoch + tradeHourFrom * 3600;
    const to = holdDays > 1 ? from + holdDays * 86400 : asia.epoch + tradeHourTo * 3600;
    const m1win = extractBars(packed, from, to);
    if (m1win.length < 5) { processed++; continue; }
    const win = walkTfMin > 1 ? resampleTo(m1win, walkTfMin) : m1win;
    if (win.length < 3) { processed++; continue; }
    const refOpen = win[0].open;

    for (const c of chosen) {
      const slDist = Math.max((c.srcRange ?? asia.range) * slMult, minSlPips * pip);
      const ladderPrices = ladderBySource[c.source] ?? [];
      const ord = buildOrder(c, c.direction, { asia, slDist, pip, tpMode, tpR, tpBufPix: tpBufPips * pip, ladderPrices });
      if (!ord) continue;
      const res = walkBars(win, ord.entry, ord.tp, ord.sl, ord.isBuy, ord.entryType, refOpen);
      if (!res || !res.filled) continue;

      // pnl in R: gross price move / risk, minus cost (round-trip + stop slip)
      const grossMove = (res.pnlPct / 100) * refOpen;   // signed price move
      const rGross = grossMove / slDist;
      const costPrice = (costPct / 100) * ord.entry + (ord.entryType === 'stop' ? (slipPct / 100) * ord.entry : 0);
      const rNet = rGross - costPrice / slDist;

      // MAE/MFE in R from the realised path (honest per-trade tail, not close-only)
      let mae = 0, mfe = 0, filled = false;
      for (const b of win) {
        const hit = ord.isBuy
          ? (ord.entryType === 'stop' ? b.high >= ord.entry : b.low <= ord.entry)
          : (ord.entryType === 'stop' ? b.low <= ord.entry : b.high >= ord.entry);
        if (!filled && hit) filled = true;
        if (filled) {
          const adverse = ord.isBuy ? ord.entry - b.low : b.high - ord.entry;
          const favor = ord.isBuy ? b.high - ord.entry : ord.entry - b.low;
          if (adverse > mae) mae = adverse;
          if (favor > mfe) mfe = favor;
        }
      }

      trades.push({
        instrument: pairKey.toUpperCase(),
        date: asia.date,
        side: ord.side,
        strategy_dir: c.direction,
        outcome: res.outcome,
        source: c.source,
        src_range_pips: +((c.srcRange ?? asia.range) / pip).toFixed(1),
        fib_level: c.level,
        mult: +c.mult.toFixed(3),
        is_key: c.isKey,
        zone: c.zone,
        alignment: c.alignment,
        align_dist_pips: c.alignDistPips,
        confidence: +(c.confidence ?? 0).toFixed(4),
        vol_regime_pct: +df.volRegimePct.toFixed(3),
        day_type_t: +df.dayTypeT.toFixed(4),
        asia_range_ratio: +asiaRangeRatio.toFixed(3),
        entry_price: +ord.entry.toFixed(6),
        sl_price: +ord.sl.toFixed(6),
        tp_price: +ord.tp.toFixed(6),
        r: +rNet.toFixed(4),
        r_gross: +rGross.toFixed(4),
        mae_r: +(mae / slDist).toFixed(3),
        mfe_r: +(mfe / slDist).toFixed(3),
        sl_dist_price: +slDist.toFixed(6),
        asia_range_pips: +(asia.range / pip).toFixed(1),
      });
    }
    processed++;
    if (progressCb && processed % 200 === 0) progressCb(processed, asiaSessions.length);
  }

  return { trades };
}

// ── Aggregate stats: expectancy + IS/OOS split (chronological) ────────────────
export function summarizeRangeExt(trades, { oosFrac = 0.4 } = {}) {
  const filled = trades.filter((t) => t.outcome !== undefined && Number.isFinite(t.r));
  if (!filled.length) return { trades: 0 };
  const sorted = [...filled].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const rs = sorted.map((t) => t.r);
  const dates = sorted.map((t) => t.date);
  const full = summarizeTrades(rs, dates);

  const cut = Math.floor(sorted.length * (1 - oosFrac));
  const isPart = sorted.slice(0, cut);
  const oosPart = sorted.slice(cut);
  const IS = summarizeTrades(isPart.map((t) => t.r), isPart.map((t) => t.date));
  const OOS = summarizeTrades(oosPart.map((t) => t.r), oosPart.map((t) => t.date));
  return { trades: filled.length, full, IS, OOS };
}

// ── Multi-pair run ────────────────────────────────────────────────────────────
export async function runRangeExtBacktest(opts = {}, pairs = RANGE_EXT_INSTRUMENTS, m1Dir = BT_M1_DIR) {
  const { onProgress = null } = opts;
  const all = [];
  const log = [];
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    if (onProgress) onProgress({ pair: p, i, total: pairs.length });
    try {
      const { trades } = await runPairRangeExt(p, opts, m1Dir);
      all.push(...trades);
      log.push(`${p}: ${trades.length} trades`);
    } catch (e) {
      log.push(`${p}: ERROR ${e?.message || e}`);
    }
  }
  return { trades: all, log };
}

export const _test = { buildLadder, buildCandidates, buildOrder, buildDailyFeatures, buildDailyBars, median };
