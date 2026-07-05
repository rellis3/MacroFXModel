// Trade Decision Engine — the SLOW LOOP.
//
// Maintains one FeatureSnapshot per pair (ARCHITECTURE.md §2). ALL expensive
// math happens here, on its own cadence, by importing the existing bricks —
// the same σ math / regime / day-type / level sources the backtests run
// (Lego Principle 1: imported, never copied):
//
//   fetchD1            js/volBacktestEngine.js   OANDA D1 bars
//   volSigmaSeries     js/forecastCore.js        walk-forward σ (YZ30/GARCH/HV20)
//   classifyRegime     js/forecastCore.js        BULL/BEAR/RANGE
//   dayTypeScore       js/dayTypeCore.js         trend-day-ness T
//   collectLevels/clusterLevels  js/levelSources.js  the zone map
//   rollingPercentile  js/statsCore.js           σ percentile
//
// `buildSnapshot` itself is pure (data in → snapshot out) so it is unit-testable
// on synthetic bars with no network; only refreshPair/fetchCalendar do I/O.

import { fetchD1, fetchM1Range, londonMidnightSec } from '../js/volBacktestEngine.js';
import { volSigmaSeries, nextSigma, classifyRegime, computeBands } from '../js/forecastCore.js';
import { dayTypeScore } from '../js/dayTypeCore.js';
import { collectLevels, clusterLevels } from '../js/levelSources.js';
import { pipSize, assetClass, oandaSymbol, resolveKey } from '../js/instrumentRegistry.js';
import { rollingPercentile } from '../js/statsCore.js';
import { bodyRange } from '../js/barUtils.js';
import { buildRangeLadder } from '../js/rangeLineAnalyser.js';
import { detectConfluencesCore } from '../js/confluence-core.js';
import { CAP_DEFAULTS } from '../js/config.js';

// Per-instrument confluence thresholds — the live caps model's numbers, zero-copy
// (fx 2 pips; gold 200 gold-pips of $0.10 = $20; indices per-point ≈0.5% of px).
// KV-saved caps overrides are a dashboard concern; the engine mirrors the
// defaults so backfill and live agree (flagged in LEGO registry as the seam).
const _CAPS_KEY = { gold: 'gold', nq: 'nas100', spx: 'spx500', dax: 'de30', ftse: 'uk100', dow: 'us30', rut: 'us2000' };
export function confluenceCapsFor(pair) {
  const caps = CAP_DEFAULTS[_CAPS_KEY[safeKey(pair)] ?? 'fx'] ?? CAP_DEFAULTS.fx;
  return { confluencePips: caps.confluencePips ?? 2, mergeFactor: caps.mergeFactor ?? 0.30 };
}

// Level sources usable from D1 bars alone (incl. swing_fib — multi-swing fib
// clusters, so a "pulled fib" IS a first-class zone). volume_profile / vwap
// need an intraday feed — wired in later (ARCHITECTURE.md §9), not silently faked.
export const TDE_LEVEL_SOURCES = ['daily_open', 'prior_hilo', 'pivots', 'swing_sr', 'swing_fib', 'round_number'];
// Higher-timeframe trend lookback (trading days) for htf_align — the one
// survivor of the research arc (see decisionCore.HTF_FEATURES).
export const HTF_TREND_DAYS = 20;
export const TDE_DEFAULT_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'gold'];

// ── Intraday state (pure) — today's developing session, not more D1 ─────────
// bars: TODAY's chronological M1/M5 [{time,open,high,low,close,volume?}] up to
// "now" (live: since London midnight; backfill: up to the touch — no lookahead).
// sigmaAbs = daily σ in price units; hl50Abs = the forecaster's MEDIAN expected
// daily high–low range in price units (computeBands.hl50 × open) — so
// rangeUsed ≈ 1.0 on a median day, >1.25 = exhaustion territory.
export function computeIntradayState(bars, { sigmaAbs, hl50Abs, approachBars = 30 } = {}) {
  if (!Array.isArray(bars) || !bars.length || !(sigmaAbs > 0)) return null;
  let hi = -Infinity, lo = Infinity, cumTPV = 0, cumVol = 0;
  for (const b of bars) {
    if (b.high > hi) hi = b.high;
    if (b.low < lo) lo = b.low;
    const v = b.volume ?? 1;
    cumTPV += ((b.high + b.low + b.close) / 3) * v;
    cumVol += v;
  }
  const price = bars[bars.length - 1].close;
  const back = bars[Math.max(0, bars.length - 1 - approachBars)].close;
  const vwap = cumVol > 0 ? cumTPV / cumVol : null;
  return {
    sessionOpen: bars[0].open, high: hi, low: lo, price,
    rangeUsed: hl50Abs > 0 ? +((hi - lo) / hl50Abs).toFixed(3) : null,
    posInRange: hi > lo ? +((price - lo) / (hi - lo)).toFixed(3) : 0.5,
    vwap, vwapDistSigma: vwap != null ? +((price - vwap) / sigmaAbs).toFixed(3) : 0,
    approachSigma: +(Math.abs(price - back) / sigmaAbs).toFixed(3),
    bars: bars.length, asOf: bars[bars.length - 1].time,
  };
}

// ── Session range ladders (pure) — the RANGE-LINE BOT's lines, time-valid ────
// Built with the bot's OWN brick (buildRangeLadder + bodyRange, the analyser's
// exact Asia/Monday derivation) so live, backfill and bot see identical lines:
//   asia   — first `asiaHrs` of the session, 5m bodies; VALID only after the
//            formation window closes (validFromSec — the analyser's
//            no-lookahead gate). Recomputed fresh each session.
//   monday — this week's Monday session, 15m bodies; never on Monday itself.
// These are DYNAMIC levels: they are kept out of the static zone map and merged
// at decide() time so a touch before Asia closes cannot see Asia lines.
// Only lines within `reachSigma` of the session open are carried — the bot's
// full ±10-extension grid would blanket the price axis and make "near a level"
// meaningless for confluence.
// prevAsiaBars (optional) = the PREVIOUS session's Asia window: its ladder is
// valid ALL day (formed yesterday), and — the signal the Asia engine keys on —
// today's lines are matched against yesterday's through the SAME
// detectConfluencesCore brick the dashboard/backtest/Pine export share:
// 2.0-pip threshold, tight at 10% of it, 0.3× cluster merge, session-range cap
// (asiaRangeEngine's live defaults). Aligned clusters come out as `asiaAlign`
// lines with count 2 — two independent sessions agreeing IS confluence.
// Both sessions need a ≥5-pip Asia body range (the engine's degenerate guard).
export function computeSessionLadders({ intradayBars = null, mondayBars = null, prevAsiaBars = null, prevMondayBars = null,
    asiaHrs = 6, sessionOpen = null, sigmaAbs = null, reachSigma = 1.5, pip = 0.0001,
    confluenceThreshPips = 2.0, tightPct = 10, mergeFactor = 0.30 } = {}) {
  const within = p => sessionOpen == null || sigmaAbs == null || Math.abs(p - sessionOpen) <= reachSigma * sigmaAbs;
  const minRange = pip * 5;
  const mkLines = (low, range, tag) => buildRangeLadder(low, range, tag)
    .map(l => ({ price: l.level, label: l.label, fib: l.fibL }));
  // the cross-session matcher — the SAME brick the dashboard/backtest/Pine use,
  // at the per-instrument caps thresholds passed in by the caller
  const alignLines = (curLines, prevLines, sessionRange, curTag, prevTag) => {
    const thresh = confluenceThreshPips * pip;
    return detectConfluencesCore(
      curLines.map(l => ({ price: l.price, fib: l.fib })),
      prevLines.map(l => ({ price: l.price, fib: l.fib })),
      { pipSize: pip, normalDistance: thresh, tightDistance: thresh * (tightPct / 100),
        mergeDistance: thresh * mergeFactor, sessionRange })
      .filter(c => within(c.price))
      .map(c => ({ price: c.price, label: `${curTag}${c.todayFib}×${prevTag}${c.yesterdayFib}`, tight: c.isTight === true }));
  };
  const out = { asia: null, monday: null, prevAsia: null, asiaAlign: null, mondayAlign: null };

  let asiaLines = null, ar = null;
  if (Array.isArray(intradayBars) && intradayBars.length >= 2) {
    const t0 = intradayBars[0].time;
    const asiaClose = t0 + asiaHrs * 3600;
    ar = bodyRange(intradayBars.filter(b => b.time < asiaClose), 5);
    if (ar && ar.range >= minRange) {
      asiaLines = mkLines(ar.low, ar.range, 'A');
      out.asia = { low: ar.low, high: ar.high, validFromSec: asiaClose, lines: asiaLines.filter(l => within(l.price)) };
    }
  }
  let mondayLines = null, mr = null;
  if (Array.isArray(mondayBars) && mondayBars.length >= 2) {
    mr = bodyRange(mondayBars, 15);
    if (mr && mr.range >= minRange) {
      mondayLines = mkLines(mr.low, mr.range, 'M');
      out.monday = { low: mr.low, high: mr.high,
        validFromSec: mondayBars[mondayBars.length - 1].time + 60,
        lines: mondayLines.filter(l => within(l.price)) };
    }
  }
  if (Array.isArray(prevAsiaBars) && prevAsiaBars.length >= 2) {
    const pr = bodyRange(prevAsiaBars, 5);
    if (pr && pr.range >= minRange) {
      const prevLines = mkLines(pr.low, pr.range, 'P');
      out.prevAsia = { low: pr.low, high: pr.high, validFromSec: 0, lines: prevLines.filter(l => within(l.price)) };
      if (asiaLines && ar) {
        const lines = alignLines(asiaLines, prevLines, ar.range, 'A', 'P');
        if (lines.length) out.asiaAlign = { validFromSec: out.asia?.validFromSec ?? 0, lines };
      }
    }
  }
  // Monday vs the PREVIOUS week's Monday — same mechanism, 15m bodies (the
  // asiaRangeEngine's mondayFibs × prevMondayFibs confluence). The prev-Monday
  // grid is NOT carried standalone (the engine only uses it for marking).
  if (mondayLines && mr && Array.isArray(prevMondayBars) && prevMondayBars.length >= 2) {
    const pm = bodyRange(prevMondayBars, 15);
    if (pm && pm.range >= minRange) {
      const lines = alignLines(mondayLines, mkLines(pm.low, pm.range, 'PM'), mr.range, 'M', 'PM');
      if (lines.length) out.mondayAlign = { validFromSec: out.monday.validFromSec, lines };
    }
  }
  return (out.asia?.lines?.length || out.monday?.lines?.length || out.prevAsia?.lines?.length) ? out : null;
}

// ── Pure snapshot builder ────────────────────────────────────────────────────
// dailyBars: chronological COMPLETED D1 [{time(sec), open, high, low, close}].
// calendar: [{ timeMs, impact, currency, title }].
// macro (optional, PRE-RESOLVED by the caller — buildSnapshot never parses FRED):
//   { regime: 'RISK_ON'|'NEUTRAL'|'RISK_OFF', riskSens: number, asOf: ms, stale?: bool }
//   Live: slow loop computes it from the KV `fred` mirror via macroCore
//   (fail-NEUTRAL + stale:true when the mirror is >48h old — macro is a
//   modifier, never a gate). Backfill: injected per day from obs-dated FRED
//   history. Direction resolution happens in the fast loop (decisionCore.macroState).
// intradayBars (optional): TODAY's M1/M5 bars up to now → snapshot.intraday
// (range-used / position-in-range / session VWAP / approach) AND upgrades
// dayOpen to the TRUE session open (first bar). sessionOpen (optional number)
// sets the open without bars — the backfill uses it (per-touch intraday state
// travels on the decide REQUEST there, to stay lookahead-free within the day).
export function buildSnapshot({ pair, dailyBars, calendar = [], macro = null, intradayBars = null, mondayBars = null, prevAsiaBars = null, prevMondayBars = null, sessionOpen = null, nowMs = Date.now(), mode = 'live', price = null }) {
  const key = safeKey(pair);
  if (!Array.isArray(dailyBars) || dailyBars.length < 80) {
    throw new Error(`buildSnapshot(${key}): need ≥80 completed D1 bars, got ${dailyBars?.length ?? 0}`);
  }
  const closes = dailyBars.map(b => b.close);
  const cls = safeClass(key);

  // σ (fractional, daily) — the backtests' exact walk-forward math, one step
  // AHEAD: volSigmaSeries' last element predicts the last COMPLETED bar (i.e.
  // yesterday); nextSigma extends it to the upcoming session using data ≤ the
  // final bar (golden-tested identity in js/forecastCore.test.mjs). This
  // retires the honesty-box "σ lags one bar" caveat.
  const sigmaSeries = volSigmaSeries(dailyBars, cls);
  const sigmaNext = nextSigma(dailyBars, cls);
  const sigmaDaily = (Number.isFinite(sigmaNext) && sigmaNext > 0 ? sigmaNext : lastFinite(sigmaSeries)) ?? 0.005;

  // σ percentile vs trailing year (rollingPercentile returns 0–100)
  const pctArr = rollingPercentile(Array.from(sigmaSeries), Math.min(252, dailyBars.length - 1));
  const volPct = (lastFinite(pctArr) ?? 50) / 100;

  const regime = classifyRegime(closes, closes.length);
  const T = dayTypeScore(closes, closes.length);
  // higher-timeframe trend sign (trailing HTF_TREND_DAYS return) — the ONLY
  // feature that survived honest OOS+cost testing across the research arc:
  // touches taken WITH this trend are net-positive, against it are net-negative
  // (IS and OOS). Direction resolution happens in the fast loop (htf_align).
  const htfTrend = closes.length > HTF_TREND_DAYS
    ? Math.sign(Math.log(closes[closes.length - 1] / closes[closes.length - 1 - HTF_TREND_DAYS])) : 0;

  const lastClose = closes[closes.length - 1];
  const refPrice = Number(price) || lastClose;
  // true session open when we have it (today's first bar / backfill day open);
  // completed-D1 approximation (≈ last close) only as the fallback
  const dayOpen = Number(sessionOpen) || intradayBars?.[0]?.open || lastClose;

  // the forecaster's bands off the session open — the SAME computeBands ∘
  // volSigma math the volatility bot's daily plan lines are built from
  const bands = computeBands(dayOpen, sigmaDaily, cls);

  // zone map: D1-derivable level sources + the vol-band lines as a first-class
  // source (`vol_band`) — the lines the volatility bot trades ARE zones, so a
  // touch on a book line scores with the book line in its confluence, and
  // "level agrees with a vol band" is measurable by the fit like any source.
  // Tolerance scales with σ (≈0.08σ), clamped to a sane pip band.
  const pip = safePip(key);
  const tolPips = Math.max(5, Math.min(25, (0.08 * sigmaDaily * refPrice) / pip));
  const bandLevels = [
    ['up50', 'Proj H (median)', 1.6], ['dn50', 'Proj L (median)', 1.6],
    ['up75', 'Proj H (75th)', 1.3],   ['dn75', 'Proj L (75th)', 1.3],
    ['ocUp', 'Proj Close +', 1.0],    ['ocDn', 'Proj Close −', 1.0],
  ].map(([k, label, weight]) => ({ price: bands[k], kind: 'vol_band', label, weight, source: 'vol_band', meta: { band: k } }));
  const levels = [
    ...collectLevels({ dailyBars, instrument: key, price: refPrice }, TDE_LEVEL_SOURCES),
    ...bandLevels.filter(l => Number.isFinite(l.price) && l.price > 0),
  ];
  const zones = clusterLevels(levels, tolPips, pip)
    .map(({ price: p, score, count, sources, kinds }) => ({ price: p, score, count, sources, kinds }));

  // macro context: stamped only when well-formed — a malformed object becomes
  // null (feature resolves 0) rather than a silent wrong sign.
  const macroCtx = macro && typeof macro.regime === 'string' && Number.isFinite(macro.riskSens)
    ? { regime: macro.regime, riskSens: macro.riskSens, asOf: macro.asOf ?? null, stale: macro.stale === true }
    : null;

  // expected MEDIAN daily range (price units) — the rangeUsed denominator,
  // from the same bands as the vol_band zone lines (one source of truth)
  const hl50Abs = bands.hl50 * dayOpen;
  const sigmaAbs = sigmaDaily * dayOpen;
  const intraday = intradayBars ? computeIntradayState(intradayBars, { sigmaAbs, hl50Abs }) : null;

  // range-line bot ladders (time-valid dynamic levels — merged at decide() time)
  // with the per-instrument confluence thresholds from the live caps model
  const caps = confluenceCapsFor(key);
  const ladders = computeSessionLadders({ intradayBars, mondayBars, prevAsiaBars, prevMondayBars,
    sessionOpen: dayOpen, sigmaAbs, pip, confluenceThreshPips: caps.confluencePips, mergeFactor: caps.mergeFactor });

  return {
    pair: key, mode, builtAt: nowMs,
    price: refPrice, dayOpen,
    sigmaDaily, volPct, regime, T,
    zones, calendar, macro: macroCtx, intraday, ladders, htfTrend,
    meta: { bars: dailyBars.length, lastBarTime: dailyBars[dailyBars.length - 1].time, tolPips: +tolPips.toFixed(1), tolAbs: +(tolPips * pip).toFixed(8), hl50Abs: +hl50Abs.toFixed(6), levelSources: TDE_LEVEL_SOURCES },
  };
}

// ── Synthetic mode (deterministic, no network — sandbox/demo/tests) ──────────
const SYNTH_START_PX = { gold: 2400, nq: 20000, spx: 5500, dow: 40000, rut: 2200, ftse: 8000, dax: 18000 };
export function syntheticBars(pair, n = 320, seed = 42) {
  const key = safeKey(pair);
  const rand = mulberry32(seed + hashCode(key));
  let p = SYNTH_START_PX[key] ?? (/jpy$/.test(key) ? 155 : 1.10);
  const daySec = 86400;
  const t0 = Math.floor(Date.now() / 1000 / daySec) * daySec - n * daySec;
  const bars = [];
  for (let i = 0; i < n; i++) {
    // two vol states + a drift leg in the middle third → regimes/features vary
    const vol = (i % 97 < 55 ? 0.006 : 0.011) * (key === 'gold' ? 1.4 : 1);
    const drift = i > n / 3 && i < (2 * n) / 3 ? 0.0012 : 0;
    const r = drift + vol * gauss(rand);
    const open = p;
    const close = p * Math.exp(r);
    const high = Math.max(open, close) * (1 + vol * 0.6 * rand());
    const low = Math.min(open, close) * (1 - vol * 0.6 * rand());
    bars.push({ time: t0 + i * daySec, date: isoDay(t0 + i * daySec), open, high, low, close });
    p = close;
  }
  return bars;
}

export function syntheticSnapshot(pair, { seed = 42, nowMs = Date.now(), newsInMin = 180 } = {}) {
  const bars = syntheticBars(pair, 320, seed);
  const calendar = newsInMin == null ? [] : [{
    timeMs: nowMs + newsInMin * 60_000, impact: 'high', currency: 'USD',
    title: 'Synthetic high-impact event (demo)',
  }];
  return buildSnapshot({ pair, dailyBars: bars, calendar, nowMs, mode: 'synthetic' });
}

// ── Live state (in-memory, per pair) ─────────────────────────────────────────
const state = new Map();          // key → snapshot
const errors = new Map();         // key → last refresh error

export function getState(pair) { return state.get(safeKey(pair)) ?? null; }
export function putState(snapshot) { state.set(snapshot.pair, snapshot); }
export function lastError(pair) { return errors.get(safeKey(pair)) ?? null; }
export function stateSummary() {
  return [...state.values()].map(s => ({
    pair: s.pair, mode: s.mode, builtAt: s.builtAt, age_ms: Date.now() - s.builtAt,
    regime: s.regime, T: +s.T.toFixed(3), vol_pct: +s.volPct.toFixed(3),
    zones: s.zones.length, calendar_events: s.calendar.length,
    error: errors.get(s.pair) ?? null,
  }));
}

// Refresh one pair from OANDA (+ optional Finnhub calendar). Throws on failure
// and records the error — the fast loop then fails closed on staleness.
// `macro` is passed through to buildSnapshot — the caller (server slow loop)
// resolves it from the KV `fred` mirror via macroCore; absent ⇒ macro-neutral.
export async function refreshPair(pair, { nowMs = Date.now(), calendar = null, macro = null } = {}) {
  const key = safeKey(pair);
  try {
    const raw = await fetchD1(oandaSymbol(key), 400);
    const bars = raw.map(b => ({ ...b, time: b.time ?? Math.floor(Date.parse(`${b.date}T00:00:00Z`) / 1000) }));
    const cal = calendar ?? await fetchCalendar().catch(() => []);
    // today's M1 since London midnight (the repo's canonical session anchor) →
    // intraday state + true session open. Optional: a failed fetch degrades to
    // the D1-only snapshot (intraday features resolve 0) rather than aborting.
    const nowSec = Math.floor(nowMs / 1000);
    const dayStartSec = londonMidnightSec(new Date(nowMs));
    const intradayBars = await fetchM1Range(oandaSymbol(key), dayStartSec, nowSec)
      .catch(e => { console.warn(`[trade-decision] ${key} intraday fetch failed (D1-only snapshot):`, e.message ?? e); return null; });
    const mondayBars = await fetchMondayBars(key, dayStartSec)
      .catch(() => null);
    const prevAsiaBars = await fetchPrevAsiaBars(key, dayStartSec)
      .catch(() => null);
    // previous week's Monday: same fetcher shifted one week back (cached weekly)
    const prevMondayBars = await fetchMondayBars(key, dayStartSec - 7 * 86400)
      .catch(() => null);
    const snap = buildSnapshot({ pair: key, dailyBars: bars, calendar: cal, macro, intradayBars, mondayBars, prevAsiaBars, prevMondayBars, nowMs, mode: 'live' });
    state.set(key, snap);
    errors.delete(key);
    return snap;
  } catch (e) {
    errors.set(key, String(e.message ?? e));
    throw e;
  }
}

// Background refresher — opt-in (env TDE_PAIRS in server.js). Overlap-guarded.
let refresherTimer = null, refreshing = false;
export function startRefresher(pairs = TDE_DEFAULT_PAIRS, intervalMs = 5 * 60_000, log = console.log) {
  if (refresherTimer) clearInterval(refresherTimer);
  const tick = async () => {
    if (refreshing) return;
    refreshing = true;
    for (const p of pairs) {
      try { await refreshPair(p); }
      catch (e) { log(`[trade-decision] refresh ${p} failed: ${e.message ?? e}`); }
    }
    refreshing = false;
  };
  tick();
  refresherTimer = setInterval(tick, intervalMs);
  log(`[trade-decision] slow loop started: ${pairs.join(', ')} every ${Math.round(intervalMs / 1000)}s`);
  return () => { clearInterval(refresherTimer); refresherTimer = null; };
}

// ── This week's Monday session bars (for the Monday ladder) ──────────────────
// Weekly-static → cached per pair+monday-date. Null on Monday itself (the
// analyser's rule: Monday levels never trade on Monday) and on fetch failure.
const _mondayCache = new Map();   // `${pair}|${mondayDate}` → bars | null
export async function fetchMondayBars(pair, dayStartSec) {
  const mid = new Date((dayStartSec + 12 * 3600) * 1000);
  const dow = mid.getUTCDay();
  if (dow === 1 || dow === 0 || dow === 6) return null;   // Monday itself / weekend
  const monStart = londonMidnightSec(new Date((dayStartSec - ((dow + 6) % 7) * 86400) * 1000));
  const cacheKey = `${pair}|${monStart}`;
  if (_mondayCache.has(cacheKey)) return _mondayCache.get(cacheKey);
  const bars = await fetchM1Range(oandaSymbol(pair), monStart, monStart + 25 * 3600)
    .catch(() => null);
  _mondayCache.set(cacheKey, bars?.length ? bars : null);
  if (_mondayCache.size > 200) _mondayCache.delete(_mondayCache.keys().next().value);
  return _mondayCache.get(cacheKey);
}

// ── Previous session's Asia window (for the prev-Asia ladder + 2-pip align) ──
// Scans back up to 4 calendar days for the most recent session with ≥10 Asia
// bars (the asiaRangeEngine's _prevAsia semantics over weekends). Cached.
const _prevAsiaCache = new Map();
export async function fetchPrevAsiaBars(pair, dayStartSec) {
  for (let d = 1; d <= 4; d++) {
    const prevStart = londonMidnightSec(new Date((dayStartSec - d * 86400 + 3600) * 1000));
    const ck = `${pair}|${prevStart}`;
    if (!_prevAsiaCache.has(ck)) {
      _prevAsiaCache.set(ck, await fetchM1Range(oandaSymbol(pair), prevStart, prevStart + 6 * 3600).catch(() => null));
      if (_prevAsiaCache.size > 300) _prevAsiaCache.delete(_prevAsiaCache.keys().next().value);
    }
    const bars = _prevAsiaCache.get(ck);
    if (bars?.length >= 10) return bars;
  }
  return null;
}

// ── Finnhub economic calendar → engine event shape (optional feed) ───────────
const FINNHUB_CCY = { US: 'USD', EA: 'EUR', EU: 'EUR', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', GB: 'GBP', UK: 'GBP', JP: 'JPY', AU: 'AUD', NZ: 'NZD', CA: 'CAD', CH: 'CHF', CN: 'CNY' };
export async function fetchCalendar(days = 2) {
  const keyEnv = process.env.FINNHUB_KEY ?? process.env.FINHUB_KEY;
  if (!keyEnv) return [];
  const from = new Date().toISOString().substring(0, 10);
  const to = new Date(Date.now() + days * 86400_000).toISOString().substring(0, 10);
  const r = await fetch(`https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${keyEnv}`,
    { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`Finnhub calendar HTTP ${r.status}`);
  const d = await r.json();
  return (d.economicCalendar ?? []).map(e => ({
    timeMs: Date.parse(String(e.time ?? '').replace(' ', 'T') + 'Z') || null,
    impact: String(e.impact ?? '').toLowerCase(),
    currency: FINNHUB_CCY[String(e.country ?? '').toUpperCase()] ?? String(e.country ?? '').toUpperCase(),
    title: e.event ?? 'event',
  })).filter(e => Number.isFinite(e.timeMs));
}

// ── Small helpers ────────────────────────────────────────────────────────────
function safeKey(pair) { try { return resolveKey(pair); } catch { return String(pair).toLowerCase(); } }
function safeClass(key) { try { return assetClass(key); } catch { return 'fx'; } }
function safePip(key) { try { return pipSize(key); } catch { return 0.0001; } }
function lastFinite(arr) { for (let i = arr.length - 1; i >= 0; i--) { if (Number.isFinite(arr[i]) && arr[i] > 0) return arr[i]; } return null; }
function isoDay(sec) { return new Date(sec * 1000).toISOString().substring(0, 10); }
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(rand) { let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function hashCode(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return Math.abs(h); }
