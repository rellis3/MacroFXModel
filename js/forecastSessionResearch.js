/**
 * Forecast Session Research (v2 layer) — how the day's range is BUILT across the
 * Asia / London / New York sessions, and how predictable that structure is.
 *
 * Companion to volForecastResearchEngine.js (which studies the daily/5d/20d
 * range forecast). This one needs the intraday path (H1 or M1 bars) to split
 * each day into sessions. Session windows are London-local time, imported from
 * js/sessionStats.js (the same definition the forecast page's session block
 * uses) so the two never drift.
 *
 * Answers the brief's session questions (#5, #15, part of #6):
 *   • Contribution accuracy — each session's realized H-L (and O-C) as a % of the
 *     day's range vs its trailing-historical expectation (walk-forward, no
 *     lookahead). How often does a session deliver its expected share?
 *   • Sequencing — does Asia predict London? London predict NY? (correlation of
 *     contributions across days.)
 *   • Compensation — does a small Asia session lead to a bigger London (the day's
 *     range gets made later), or do quiet/active sessions cluster?
 *   • Dominance — which session most often exceeds its expected share.
 *
 * Pure + synthetic-testable: intraday bars in, aggregates out. No network/DOM.
 */

import { SESSIONS, _londonParts } from './sessionStats.js';

const SESS = ['asia', 'london', 'ny'];

// Accept a bar time as a Date, unix seconds, unix ms, or ISO string.
function _toDate(t) {
  if (t instanceof Date) return t;
  if (typeof t === 'number') return new Date(t < 1e12 ? t * 1000 : t);
  return new Date(String(t).replace(' ', 'T').replace(/Z?$/, 'Z'));
}

// ── Per-London-day session contributions ─────────────────────────────────────
// bars: intraday OHLC, each { time, open, high, low, close }. Returns, per day,
// each session's H-L and O-C as a % of the DAY's H-L range (contributions
// overlap-free by window but sum >100% only if sessions overlap — these windows
// don't). Mirrors sessionStats._computeStats exactly (same windows, same thresholds).
export function dailySessionContributions(bars, { minDayBars = 12, minSessBars = 3 } = {}) {
  const byDate = new Map();
  for (const b of bars) {
    const d = _toDate(b.time);
    const { date, hour } = _londonParts(d);
    if (!byDate.has(date)) byDate.set(date, { all: [], asia: [], london: [], ny: [] });
    const g = byDate.get(date);
    const bar = { open: b.open, high: b.high, low: b.low, close: b.close, _t: d.getTime() };
    g.all.push(bar);
    for (const [s, [h0, h1]] of Object.entries(SESSIONS)) if (hour >= h0 && hour < h1) g[s].push(bar);
  }

  const out = [];
  for (const [date, g] of byDate) {
    if (g.all.length < minDayBars) continue;
    const dailyHL = Math.max(...g.all.map(x => x.high)) - Math.min(...g.all.map(x => x.low));
    if (dailyHL < 1e-12) continue;
    const rec = { date, dailyHL };
    for (const s of SESS) {
      const sb = g[s].slice().sort((a, b) => a._t - b._t);
      if (sb.length < minSessBars) { rec[s] = null; continue; }
      const hl = Math.max(...sb.map(x => x.high)) - Math.min(...sb.map(x => x.low));
      const oc = Math.abs(sb.at(-1).close - sb[0].open);
      rec[s] = { hlPct: +(hl / dailyHL * 100).toFixed(3), ocPct: +(oc / dailyHL * 100).toFixed(3) };
    }
    out.push(rec);
  }
  out.sort((a, b) => a.date < b.date ? -1 : 1);
  return out;
}

// ── Aggregate + walk-forward accuracy + sequencing ────────────────────────────
export function evaluateSessions(bars, opts = {}) {
  const days = dailySessionContributions(bars, opts);
  if (days.length < 40) return { nDays: days.length, insufficient: true };

  const _mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
  const _pctl = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const i = p / 100 * (s.length - 1); const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
  const _corr = (xs, ys) => {
    const n = xs.length; if (n < 2) return 0;
    const mx = _mean(xs), my = _mean(ys); let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxx > 0 && syy > 0 ? +(sxy / Math.sqrt(sxx * syy)).toFixed(3) : 0;
  };

  // Realized contribution distribution + walk-forward accuracy per session.
  const perSession = {};
  for (const s of SESS) {
    const hl = days.map(d => d[s]?.hlPct).filter(v => v != null);
    const oc = days.map(d => d[s]?.ocPct).filter(v => v != null);
    // Walk-forward: expected = trailing median of prior days' contribution; the
    // session's realized share should exceed it ~50% of the time if stable.
    let exceed = 0, exN = 0, absErr = 0;
    const hist = [];
    for (const d of days) {
      const v = d[s]?.hlPct; if (v == null) continue;
      if (hist.length >= 30) { const exp = _pctl(hist.slice(-120), 50); exceed += v > exp ? 1 : 0; exN++; absErr += Math.abs(v - exp); }
      hist.push(v);
    }
    perSession[s] = {
      n: hl.length,
      hlMeanPct: +_mean(hl).toFixed(1), hlP50: +_pctl(hl, 50).toFixed(1), hlP75: +_pctl(hl, 75).toFixed(1),
      ocMeanPct: +_mean(oc).toFixed(1),
      exceedExpectedPct: exN ? +(exceed / exN * 100).toFixed(1) : null,  // target ~50
      mae: exN ? +(absErr / exN).toFixed(2) : null,
    };
  }

  // Sequencing / compensation — pairs of same-day session contributions.
  const paired = (a, b) => {
    const xs = [], ys = [];
    for (const d of days) if (d[a] && d[b]) { xs.push(d[a].hlPct); ys.push(d[b].hlPct); }
    return { xs, ys };
  };
  const al = paired('asia', 'london'), ln = paired('london', 'ny');
  const sequencing = {
    asiaLondonCorr: _corr(al.xs, al.ys),
    londonNyCorr:   _corr(ln.xs, ln.ys),
  };
  // Compensation: London contribution when Asia is in its bottom vs top tercile.
  const asiaVals = al.xs.slice().sort((a, b) => a - b);
  const aLo = asiaVals[Math.floor(asiaVals.length / 3)], aHi = asiaVals[Math.floor(2 * asiaVals.length / 3)];
  const lonSmallAsia = [], lonBigAsia = [];
  for (const d of days) if (d.asia && d.london) { (d.asia.hlPct <= aLo ? lonSmallAsia : d.asia.hlPct >= aHi ? lonBigAsia : null)?.push(d.london.hlPct); }
  const compensation = {
    londonAfterSmallAsia: +_mean(lonSmallAsia).toFixed(1),
    londonAfterBigAsia:   +_mean(lonBigAsia).toFixed(1),
  };

  // ── Findings ────────────────────────────────────────────────────────────────
  const findings = [];
  const add = (sev, text) => findings.push({ sev, text });
  const dom = SESS.slice().sort((a, b) => perSession[b].hlMeanPct - perSession[a].hlMeanPct);
  add('info', `Range is built mostly in ${dom[0].toUpperCase()} (${perSession[dom[0]].hlMeanPct}% of daily H-L on average), then ${dom[1].toUpperCase()} (${perSession[dom[1]].hlMeanPct}%), then ${dom[2].toUpperCase()} (${perSession[dom[2]].hlMeanPct}%).`);
  for (const s of SESS) {
    const e = perSession[s].exceedExpectedPct;
    if (e != null && Math.abs(e - 50) > 10) add('warn', `${s.toUpperCase()} contribution is drifting: it exceeds its trailing-expected share ${e}% of days (target 50%) — the session's role is changing over time.`);
  }
  if (Math.abs(sequencing.asiaLondonCorr) >= 0.2)
    add(sequencing.asiaLondonCorr > 0 ? 'good' : 'info', `Asia ${sequencing.asiaLondonCorr > 0 ? 'PREDICTS' : 'inversely relates to'} London: corr = ${sequencing.asiaLondonCorr} — ${sequencing.asiaLondonCorr > 0 ? 'active Asia → active London' : 'quiet Asia → active London (range made later)'}.`);
  else add('info', `Asia barely predicts London (corr ${sequencing.asiaLondonCorr}) — the sessions are largely independent.`);
  if (compensation.londonAfterSmallAsia - compensation.londonAfterBigAsia > 5)
    add('good', `Compensation: after a SMALL Asia, London contributes ${compensation.londonAfterSmallAsia}% vs ${compensation.londonAfterBigAsia}% after a big Asia — a quiet Asia tends to hand the day's range to London.`);

  return { nDays: days.length, dateFrom: days[0].date, dateTo: days.at(-1).date, perSession, sequencing, compensation, findings };
}
