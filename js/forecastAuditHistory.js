/**
 * Forecast Auditor, history mode — "re-test a line set over history". An EXPLORATORY BACKTEST, NOT A PRE-REGISTERED
 * TEST: it never banks a verdict, and the production widths were fitted on part of this history, so a good calibration
 * here is partly in-sample by construction.
 *
 * It replays what each line set would have drawn each morning, through the production builders (no copies):
 *   plain    buildLadder(forecastSigma(last 800 NY-close bars, the ladder's estimator), event tag)    js/forecastLadder.js
 *   persist  buildPersistLadder(...) on the plain ladder's σ_used (the chosen ★ forecast)             js/forecastLadderPersist.js
 *   ivadj    buildIvAdjLadder(...) (IV-only form: the VIX-curve extras are not replayed)              js/forecastLadderIvAdj.js
 *   har800   buildLadder(forecastSigma(last 800, 'har_rv_log'), HAR800 widths, no event multiplier)  forge/LOCKBOX_PROTOCOL.md
 * and scores each against the London 00:00-22:00 session from hourly bars with the scorecard's own scoreLadder, so a
 * history row and a forward row mean the same thing.
 *
 * Point in time: σ from NY-close bars that CLOSED before the session (bar date < session date, dates labelled by
 * trading day as volBacktestEngine.fetchD1 does); implied vol = the last close dated before the session (≤ 4 days old,
 * as the live CBOE rule); event tags from the calendar files, and a date the calendar does not cover is UNKNOWN
 * (tag null → ×1.0, exactly what the live ladder does when its feed is down), never 'none'.
 * Known differences from live, reported with every result:
 *   - implied vol history exists for VIX / VXN / GVZ only (FRED closes). The six USD majors' live IV (QuikStrike /
 *     CME ATM-30) has no server-side history, so the chosen ★ forecast runs its persistence form there (its own live
 *     fallback) and the IV-adjusted set covers indices + gold only;
 *   - the event tags come from calendar_events.csv (+ the Nasdaq continuation), a different taxonomy from the
 *     ForexFactory feed the multipliers were fitted on.
 * The window never runs past 2026-08-21 (the lockbox date), for every line set.
 *
 * Pure: no network, no clock.
 */
import { londonParts } from './intradayRange.js';
import { scoreLadder } from './forecastScorecard.js';
import { forecastSigma } from './forecastSigma.js';
import { buildLadder, paramsFor } from './forecastLadder.js';
import { buildPersistLadder } from './forecastLadderPersist.js';
import { PERSIST_PARAMS } from './forecastLadderPersistParams.js';
import { buildIvAdjLadder, IVADJ_ALIAS, CBOE_MAX_AGE_D } from './forecastLadderIvAdj.js';
import { IVADJ_PARAMS } from './forecastLadderIvAdjParamsNY.js';
import { HAR800_PARAMS } from './forecastLadderParamsHar800.js';
import { pairCurrencies } from './newsCalendar.js';
import { LOCKBOX_END, LINE_SETS, AUDIT_SEED, regimeOf, byDate, cellOf, calibrate, blockBootstrap, bootStats, rollingSeries, QS } from './forecastAudit.js';

export const HISTORY_SETS = ['plain', 'persist', 'ivadj', 'har800'];
export const HISTORY_DEFAULT = { from: '2020-10-01', to: LOCKBOX_END };
export const HISTORY_LABEL = 'Exploratory backtest, not a pre-registered test. Never banked.';
/** FRED close series for the implied-vol sources that have history. */
export const IV_FRED = { VIX: 'VIXCLS', VXN: 'VXNCLS', GVZ: 'GVZCLS' };
const BARS = 800;                                    // the live forecaster's NY-close window (volForecastScheduler OANDA_BAR_COUNT)
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ''));
const weekday = d => { const w = new Date(`${d}T12:00:00Z`).getUTCDay(); return w !== 0 && w !== 6; };
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/** The requested window, clamped to [2014-01-01, lockbox date]. */
export function clampWindow({ from, to } = {}) {
  let f = isDate(from) ? from : HISTORY_DEFAULT.from, t = isDate(to) ? to : HISTORY_DEFAULT.to;
  const clamped = t > LOCKBOX_END;
  if (clamped) t = LOCKBOX_END;
  if (f < '2014-01-01') f = '2014-01-01';
  if (f > t) f = t;
  return { from: f, to: t, clamped };
}

/** The implied-vol source a set uses for an instrument ('VIX' | 'VXN' | 'GVZ' | 'CME_ATM30' | 'LEGS' | null). */
export function ivSourceFor(set, instrument) {
  const name = String(instrument).toUpperCase();
  if (set === 'persist') return PERSIST_PARAMS.pairs?.[name]?.iv?.source ?? null;
  if (set === 'ivadj') return IVADJ_PARAMS.pairs?.[IVADJ_ALIAS[name] ?? name]?.iv_source ?? null;
  return null;
}

/** London sessions (00:00-22:00) from hourly bars {t, open, high, low}: date -> realised % of the open. */
export function londonSessions(h1, { minLastHour = 20, minBars = 8 } = {}) {
  const g = new Map();
  for (const b of h1 ?? []) {
    const p = londonParts(b.t);
    if (p.hour >= 22) continue;
    let s = g.get(p.date);
    if (!s) g.set(p.date, s = { open: +b.open, high: -Infinity, low: Infinity, n: 0, last: 0 });
    s.high = Math.max(s.high, +b.high); s.low = Math.min(s.low, +b.low); s.n += 1; s.last = p.hour;
  }
  const out = new Map();
  for (const [d, s] of g) {
    if (!weekday(d) || s.n < minBars || s.last < minLastHour || !(s.open > 0)) continue;   // complete sessions only
    out.set(d, { open: s.open, high: s.high, low: s.low, days: 1,
      hl: (s.high - s.low) / s.open * 100, oh: (s.high - s.open) / s.open * 100, ol: (s.open - s.low) / s.open * 100 });
  }
  return out;
}

const _nyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
/**
 * NY-close (17:00 New York) daily bars from hourly bars, labelled by trading day as volBacktestEngine.fetchD1 labels
 * OANDA's D candles (a bar opening Sunday 17:00 NY is Monday's). For runs without OANDA's own D feed; the server uses
 * the D feed.
 */
export function nyDailyFromH1(h1) {
  const g = new Map();
  for (const b of h1 ?? []) {
    const p = Object.fromEntries(_nyFmt.formatToParts(new Date(b.t * 1000)).map(x => [x.type, x.value]));
    let d = `${p.year}-${p.month}-${p.day}`;
    if (+p.hour >= 17) d = addDays(d, 1);
    let x = g.get(d);
    if (!x) g.set(d, x = { date: d, open: +b.open, high: -Infinity, low: Infinity, close: +b.close });
    x.high = Math.max(x.high, +b.high); x.low = Math.min(x.low, +b.low); x.close = +b.close;
  }
  return [...g.values()].filter(x => weekday(x.date)).sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ── event tags from the calendar files ──────────────────────────────────────────────────────────────────────────────
const RANK = { FOMC: 6, NFP: 5, CPI: 4, high: 3, holiday: 2, none: 1 };
function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}
/** Calendar CSV text (calendar_events.csv / calendar_events_nasdaq.csv) -> [{date (London), ccy, impact, event}] + its span. */
export function parseCalendar(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const rows = [];
  let lo = null, hi = null;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const f = splitCsv(lines[i]);
    if (f.length < 6 || !isDate(f[0])) continue;
    const raw = (f[1] || '').trim();
    let date = f[0];
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw)) date = londonParts(Date.parse(raw.replace(' ', 'T') + 'Z') / 1000).date;   // datetime_raw is UTC
    if (!lo || f[0] < lo) lo = f[0];
    if (!hi || f[0] > hi) hi = f[0];
    rows.push({ date, ccy: (f[3] || '').trim().toUpperCase(), impact: (f[4] || '').trim(), event: (f[5] || '').trim() });
  }
  return { rows, span: lo ? [lo, hi] : null };
}
/** One calendar row's tag for an instrument's currencies (null = not relevant). Mirrors volForecast.detectEventTagFor. */
export function rowTag(r) {
  const major = /^major$/i.test(r.impact) || /^high$/i.test(r.impact);
  if (/holiday/i.test(r.event)) return 'holiday';
  if (!major) return 'none';
  if (r.ccy === 'USD') {
    if (/fomc|fed interest rate decision|fed press conference|federal funds rate|interest rate decision/i.test(r.event)) return 'FOMC';
    if (/non ?-?farm payrolls|payroll jobs growth/i.test(r.event) && !/private|adp|weekly/i.test(r.event)) return 'NFP';
    if (/inflation rate|^(core )?cpi\b/i.test(r.event)) return 'CPI';
  }
  return 'high';
}
/**
 * A tagger over parsed calendars: (instrument, date) -> 'FOMC' | 'NFP' | 'CPI' | 'high' | 'holiday' | 'none', or null
 * when no calendar covers the date. `calendars` = [{ rows, span }].
 */
export function eventTagger(calendars) {
  const byDay = new Map();
  for (const c of calendars ?? []) for (const r of c.rows ?? []) {
    const t = rowTag(r);
    if (!byDay.has(r.date)) byDay.set(r.date, []);
    byDay.get(r.date).push([r.ccy, t]);
  }
  const spans = (calendars ?? []).map(c => c.span).filter(Boolean);
  return (instrument, date) => {
    if (!spans.some(([a, b]) => date >= a && date <= b)) return null;
    const ccys = pairCurrencies(instrument);
    let best = 'none';
    for (const [ccy, t] of byDay.get(date) ?? []) if (ccys.has(ccy) && RANK[t] > RANK[best]) best = t;
    return best;
  };
}

/** The implied vol (annual %) known before `date`: the last close dated before it, at most CBOE_MAX_AGE_D days old. */
export function ivBefore(series, date) {
  if (!series?.length) return null;
  let lo = 0, hi = series.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (series[m][0] < date) lo = m + 1; else hi = m; }
  const x = series[lo - 1];
  if (!x || !(x[1] > 0)) return null;
  return (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${x[0]}T12:00:00Z`)) / 86400_000 <= CBOE_MAX_AGE_D ? x[1] : null;
}

/**
 * Replay one instrument. nyBars: NY-close daily bars [{date, open, high, low, close}] ascending (trading-day labels);
 * h1: hourly bars [{t, open, high, low}]; iv: { VIX: [[date, value], ...] ascending, ... }; tagFor: eventTagger().
 * Returns { rows, counts, forms }.
 */
export function historyRows({ instrument, assetClass = 'fx', nyBars, h1, sessions = null, from, to, sets = HISTORY_SETS, iv = {}, tagFor = () => null }) {
  const W = clampWindow({ from, to });
  const name = String(instrument).toUpperCase();
  const sess = sessions ?? londonSessions(h1);
  const est = paramsFor(name, assetClass).estimator ?? 'yz_30';
  const want = new Set(sets);
  const harOk = want.has('har800') && paramsFor(name, assetClass, HAR800_PARAMS).source === 'fitted';
  const src = { persist: ivSourceFor('persist', name), ivadj: ivSourceFor('ivadj', name) };
  const ivOf = s => (IV_FRED[s] ? iv?.[s] : null);
  const rows = [], counts = Object.fromEntries(HISTORY_SETS.map(s => [s, 0])), forms = {};
  const dates = [...sess.keys()].filter(d => d >= W.from && d <= W.to).sort();
  const bars = (nyBars ?? []).filter(b => isDate(b.date) && b.open > 0 && b.high >= b.low).sort((a, b) => (a.date < b.date ? -1 : 1));
  let k = 0;
  for (const D of dates) {
    while (k < bars.length && bars[k].date < D) k++;
    if (k < 60) continue;
    if ((Date.parse(`${D}T12:00:00Z`) - Date.parse(`${bars[k - 1].date}T12:00:00Z`)) / 86400_000 > 5) continue;   // a gap in the σ bars
    const slice = bars.slice(Math.max(0, k - BARS), k);
    const real = sess.get(D);
    const tag = tagFor(name, D);
    const sigma = forecastSigma(slice, est);
    if (!(sigma > 0)) continue;
    const plain = buildLadder(sigma, { instrument: name, assetClass, eventTag: tag, horizon: 'daily' });
    const s = {};
    if (want.has('plain')) s.plain = scoreLadder(plain, real);
    if (want.has('persist')) {
      const ivPct = ivBefore(ivOf(src.persist), D);
      const L = buildPersistLadder(slice, { instrument: name, assetClass, sessionDate: D, sigmaUsedPct: plain.sigma_used_pct,
        eventTag: tag, eventMult: plain.event_mult, ivAnnualPct: ivPct });
      if (L) { s.persist = scoreLadder(L, real); forms[L.form] = (forms[L.form] ?? 0) + 1; }
    }
    if (want.has('ivadj') && IV_FRED[src.ivadj]) {
      const ivPct = ivBefore(ivOf(src.ivadj), D);
      const L = ivPct ? buildIvAdjLadder(slice, { instrument: name, ivAnnualPct: ivPct, assetClass, eventTag: tag }) : null;
      if (L) s.ivadj = scoreLadder(L, real);
    }
    if (harOk && D <= LOCKBOX_END) {
      const hs = forecastSigma(slice, 'har_rv_log');
      if (hs > 0) s.har800 = scoreLadder(buildLadder(hs, { instrument: name, assetClass, eventTag: 'none', ladderParams: HAR800_PARAMS }), real);
    }
    for (const k2 of Object.keys(s)) if (s[k2]) counts[k2] += 1; else delete s[k2];
    if (!Object.keys(s).length) continue;
    rows.push({ date: D, inst: name, regime: regimeOf(slice, est)?.regime ?? null, event: tag, s });
  }
  return { rows, counts, forms, window: W };
}

/**
 * The backtest's result: per line set the pooled calibration table with date-block bootstrap 95% intervals (B, block
 * 20, seeded), the pinball ratio vs plain with its interval, and the splits (instrument, regime, event, year).
 */
export function summariseHistory(rows, sets = HISTORY_SETS, { seed = AUDIT_SEED, nBoot = 2000, meanBlock = 20 } = {}) {
  const out = {};
  for (const set of sets) {
    const L = LINE_SETS[set], base = L?.base;
    const days = byDate(rows, set, base);
    const pooled = cellOf(days);
    if (!pooled) { out[set] = { label: L?.label ?? set, empty: true }; continue; }
    const ci = blockBootstrap(days, bootStats, { nBoot, meanBlock, seed });
    if (ci) {
      QS.forEach((q, qi) => pooled[q].forEach((c, i) => { if (c) c.ci = ci[qi * 3 + i]; }));
      if (pooled.ratio != null) pooled.ratioCi = ci[9];
    }
    const full = calibrate(rows, set);
    const years = [...new Set(days.map(d => d.date.slice(0, 4)))];
    out[set] = { label: L.label, base: base ?? null, pooled, byInst: full.byInst, regime: full.regime, event: full.event,
      byYear: Object.fromEntries(years.map(y => [y, cellOf(byDate(rows, set, base, r => r.date.startsWith(y)))])),
      rolling: Object.fromEntries(QS.map(q => [q, rollingSeries(rows, set, { window: 60, every: 5, q })])) };
  }
  return out;
}
