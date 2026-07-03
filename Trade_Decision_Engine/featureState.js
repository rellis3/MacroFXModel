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

import { fetchD1 } from '../js/volBacktestEngine.js';
import { volSigmaSeries, nextSigma, classifyRegime } from '../js/forecastCore.js';
import { dayTypeScore } from '../js/dayTypeCore.js';
import { collectLevels, clusterLevels } from '../js/levelSources.js';
import { pipSize, assetClass, oandaSymbol, resolveKey } from '../js/instrumentRegistry.js';
import { rollingPercentile } from '../js/statsCore.js';

// Level sources usable from D1 bars alone (incl. swing_fib — multi-swing fib
// clusters, so a "pulled fib" IS a first-class zone). volume_profile / vwap
// need an intraday feed — wired in later (ARCHITECTURE.md §9), not silently faked.
export const TDE_LEVEL_SOURCES = ['daily_open', 'prior_hilo', 'pivots', 'swing_sr', 'swing_fib', 'round_number'];
export const TDE_DEFAULT_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'gold'];

// ── Pure snapshot builder ────────────────────────────────────────────────────
// dailyBars: chronological COMPLETED D1 [{time(sec), open, high, low, close}].
// calendar: [{ timeMs, impact, currency, title }].
// macro (optional, PRE-RESOLVED by the caller — buildSnapshot never parses FRED):
//   { regime: 'RISK_ON'|'NEUTRAL'|'RISK_OFF', riskSens: number, asOf: ms, stale?: bool }
//   Live: slow loop computes it from the KV `fred` mirror via macroCore
//   (fail-NEUTRAL + stale:true when the mirror is >48h old — macro is a
//   modifier, never a gate). Backfill: injected per day from obs-dated FRED
//   history. Direction resolution happens in the fast loop (decisionCore.macroState).
export function buildSnapshot({ pair, dailyBars, calendar = [], macro = null, nowMs = Date.now(), mode = 'live', price = null }) {
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

  const lastClose = closes[closes.length - 1];
  const refPrice = Number(price) || lastClose;
  const dayOpen = lastClose;   // completed-D1 approximation: next session opens ≈ last close

  // zone map: collect D1-derivable levels, cluster to confluence zones.
  // Tolerance scales with σ (≈0.08σ), clamped to a sane pip band.
  const pip = safePip(key);
  const tolPips = Math.max(5, Math.min(25, (0.08 * sigmaDaily * refPrice) / pip));
  const levels = collectLevels({ dailyBars, instrument: key, price: refPrice }, TDE_LEVEL_SOURCES);
  const zones = clusterLevels(levels, tolPips, pip)
    .map(({ price: p, score, count, sources, kinds }) => ({ price: p, score, count, sources, kinds }));

  // macro context: stamped only when well-formed — a malformed object becomes
  // null (feature resolves 0) rather than a silent wrong sign.
  const macroCtx = macro && typeof macro.regime === 'string' && Number.isFinite(macro.riskSens)
    ? { regime: macro.regime, riskSens: macro.riskSens, asOf: macro.asOf ?? null, stale: macro.stale === true }
    : null;

  return {
    pair: key, mode, builtAt: nowMs,
    price: refPrice, dayOpen,
    sigmaDaily, volPct, regime, T,
    zones, calendar, macro: macroCtx,
    meta: { bars: dailyBars.length, lastBarTime: dailyBars[dailyBars.length - 1].time, tolPips: +tolPips.toFixed(1), levelSources: TDE_LEVEL_SOURCES },
  };
}

// ── Synthetic mode (deterministic, no network — sandbox/demo/tests) ──────────
export function syntheticBars(pair, n = 320, seed = 42) {
  const key = safeKey(pair);
  const rand = mulberry32(seed + hashCode(key));
  let p = key === 'gold' ? 2400 : /jpy$/.test(key) ? 155 : 1.10;
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
    const snap = buildSnapshot({ pair: key, dailyBars: bars, calendar: cal, macro, nowMs, mode: 'live' });
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
