/**
 * Intraday Forecast Research (PR-D) — how the day RESOLVES relative to the
 * forecast, intrabar. Two studies the daily aggregates can't answer:
 *
 *   1. EXPANSION (brief Q6) — how quickly the day builds its range. For each
 *      London day, the time (London-hour) at which cumulative range crosses
 *      25 / 50 / 75 / 100% of the forecast's expected range. Do big days expand
 *      early? Do quiet days never finish?
 *
 *   2. LEVEL TOUCHES / PIP EXCURSIONS (the lead question) — treat each forecast
 *      extension line (open ± O-H/O-L median and 75th) as a level. Walk the
 *      intraday bars and record, per day: whether/when each level is touched,
 *      which side is hit first, how many retests, and — after the first touch —
 *      the pip excursion (MFE continuation / MAE pullback) and whether price
 *      reverses 10 / 20 / 50 pips or continues. Sliced by regime and session.
 *
 * Walk-forward, no lookahead: the forecast for day i is built from London days
 * strictly before i (computeForecast — the live-forecaster math), then day i's
 * OWN intraday bars are measured against those levels. Reuses buildLondonDaily
 * (the estimator-A/B brick) so the day boundary is London midnight, matching the
 * engine. Pure + synthetic-testable: intraday bars in, aggregates out.
 *
 * NOT built here (honest scope): per-touch outcome sequencing beyond first vs
 * heavily-retested, and macro/news conditioning — flagged for a later pass.
 */

import { computeForecast } from './volForecast.js';
import { buildLondonDaily } from './volEstimatorAB.js';
import { _londonParts } from './sessionStats.js';
import { SESSIONS } from './sessionStats.js';
import { classifyRegime } from './volBacktestEngine.js';

const _mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const _median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const _rate = a => a.length ? _mean(a.map(v => v ? 1 : 0)) * 100 : null;

// London session bucket for a timestamp (ms). Windows from sessionStats.SESSIONS.
function _session(tMs) {
  const h = _londonParts(new Date(tMs)).hour;
  for (const [s, [h0, h1]] of Object.entries(SESSIONS)) if (h >= h0 && h < h1) return s;
  return 'other';
}
function _hourOf(tMs) { const p = _londonParts(new Date(tMs)); return p.hour + (new Date(tMs).getUTCMinutes()) / 60; }

// ── One level's outcome within a day (post-first-touch pip excursion) ─────────
// dir: +1 for an UP level (touched when high ≥ level), −1 for a DOWN level.
// Returns null if never touched. pip = price units per pip.
export function _levelOutcome(bars, level, dir, pip, hyst) {
  let firstIdx = -1, episodes = 0, armed = true;
  for (let k = 0; k < bars.length; k++) {
    const at = dir > 0 ? bars[k].high >= level : bars[k].low <= level;
    if (at && armed) { episodes++; armed = false; if (firstIdx < 0) firstIdx = k; }
    if (!armed) { const away = dir > 0 ? bars[k].high < level - hyst : bars[k].low > level + hyst; if (away) armed = true; }
  }
  if (firstIdx < 0) return null;
  // Post-touch excursion over the remainder of the day, in pips from the level.
  let mfe = 0, mae = 0, contIdx = -1, revIdx = -1;
  const TH = 20;   // pip threshold for the reverse-vs-continue race
  for (let k = firstIdx; k < bars.length; k++) {
    const cont = dir > 0 ? (bars[k].high - level) / pip : (level - bars[k].low) / pip; // further in touch dir
    const pull = dir > 0 ? (level - bars[k].low) / pip : (bars[k].high - level) / pip;  // back toward open
    if (cont > mfe) mfe = cont;
    if (pull > mae) mae = pull;
    if (contIdx < 0 && cont >= TH) contIdx = k;
    if (revIdx < 0 && pull >= TH) revIdx = k;
  }
  const outcome = contIdx < 0 && revIdx < 0 ? 'stall'
    : revIdx < 0 ? 'continue' : contIdx < 0 ? 'reverse'
    : revIdx < contIdx ? 'reverse' : contIdx < revIdx ? 'continue' : 'ambig';
  // Hold-to-close fade PnL (G2): enter a FADE at the level (bet on reversion toward
  // the open), exit at the window close. +ve = price ended back toward open (win),
  // −ve = broke away (the short-gamma loss tail lives here).
  const lastClose = bars.at(-1).close;
  const closeFadePips = +(((dir > 0 ? (level - lastClose) : (lastClose - level)) / pip)).toFixed(1);
  return {
    touched: true, firstIdx, retests: episodes,
    hour: _hourOf(bars[firstIdx]._t), session: _session(bars[firstIdx]._t),
    mfePips: +mfe.toFixed(1), maePips: +mae.toFixed(1),
    rev10: mae >= 10, rev20: mae >= 20, rev50: mae >= 50, outcome, closeFadePips,
  };
}

// Seeded PRNG for the deterministic placebo jitter (G1).
function _mulberry32(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ── Horizon config — daily / weekly (5d) / 20-day. Levels differ only by which
//    forecast fields feed them and the window length (Lego principle: never
//    hard-code "daily"). Expansion time is a London-hour for daily, a day-of-
//    window index for the multi-day horizons.
export const HORIZONS = {
  daily:  { windowDays: 1,  label: 'Daily',  timeUnit: 'hour', hl: 'hl_median', ohMed: 'oh_median', ohP75: 'oh_75',    olMed: 'ol_median', olP75: 'ol_75'    },
  weekly: { windowDays: 5,  label: 'Weekly', timeUnit: 'day',  hl: 'hl_5d',     ohMed: 'oh_5d',     ohP75: 'oh_5d_75', olMed: 'ol_5d',     olP75: 'ol_5d_75' },
  d20:    { windowDays: 20, label: '20-day', timeUnit: 'day',  hl: 'hl_20d',    ohMed: 'oh_20d',    ohP75: 'oh_20d_75',olMed: 'ol_20d',    olP75: 'ol_20d_75'},
};

// ── Walk-forward over London windows for ONE horizon (London days pre-built) ──
function _walkHorizon(lond, dailyOHLC, closes, { assetClass = 'fx', pip = 0.0001, minLookback = 60, horizon = 'daily' }) {
  const H = HORIZONS[horizon] || HORIZONS.daily;
  const W = H.windowDays;
  if (lond.length < minLookback + Math.max(40, W * 3)) return { insufficient: true, nDays: lond.length, horizon };

  const expRows = [];
  const touchRows = { upMed: [], dnMed: [], upP75: [], dnP75: [], plMed: [] };
  let firstUpper = 0, firstLower = 0, eitherTouched = 0;

  // Non-overlapping windows (step = W) — avoids autocorrelation inflation across
  // overlapping multi-day windows; for daily this is the original per-day walk.
  for (let i = minLookback; i + W <= lond.length; i += W) {
    let fc; try { fc = computeForecast(dailyOHLC.slice(0, i), assetClass); } catch { continue; }
    // Window intraday bars, tagged with a 0-based day index within the window.
    const bars = [];
    for (let d = 0; d < W; d++) { const day = lond[i + d]; if (!day.bars) continue; for (const b of day.bars) bars.push({ ...b, _day: d }); }
    if (bars.length < 6 * W) continue;
    bars.sort((a, b) => a._t - b._t);
    const open = lond[i].open; if (!(open > 0)) continue;
    const regime = classifyRegime(closes, i, 20, 5, 0.002, 1.0);

    // Horizon forecast levels (% of price → price). H-L median = expected window range.
    const expRange = open * (fc[H.hl] ?? 0) / 100;
    const upMed = open * (1 + (fc[H.ohMed] ?? 0) / 100), upP75 = open * (1 + (fc[H.ohP75] ?? 0) / 100);
    const dnMed = open * (1 - (fc[H.olMed] ?? 0) / 100), dnP75 = open * (1 - (fc[H.olP75] ?? 0) / 100);
    const hyst = Math.max(pip, 0.15 * expRange);
    const _time = b => H.timeUnit === 'hour' ? _hourOf(b._t) : b._day + 1;   // hour-of-day or day-of-window

    // ── Expansion timing (in hours for daily, in days-of-window otherwise) ──
    if (expRange > 0) {
      let hi = -Infinity, lo = Infinity; const cross = { 25: null, 50: null, 75: null, 100: null };
      for (const b of bars) {
        if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low;
        const frac = (hi - lo) / expRange * 100;
        for (const p of [25, 50, 75, 100]) if (cross[p] == null && frac >= p) cross[p] = _time(b);
      }
      const realizedHl = (hi - lo) / open * 100;
      expRows.push({ regime, cross, reached100: cross[100] != null, big: realizedHl > (fc[H.hl] ?? 0),
        eff: (hi - lo) > 0 ? Math.min(1, Math.abs(bars.at(-1).close - open) / (hi - lo)) : null });
    }

    // ── Level touches ──
    const oUpMed = _levelOutcome(bars, upMed, +1, pip, hyst), oDnMed = _levelOutcome(bars, dnMed, -1, pip, hyst);
    const oUpP75 = _levelOutcome(bars, upP75, +1, pip, hyst), oDnP75 = _levelOutcome(bars, dnP75, -1, pip, hyst);
    if (oUpMed) touchRows.upMed.push({ ...oUpMed, regime });
    if (oDnMed) touchRows.dnMed.push({ ...oDnMed, regime });
    if (oUpP75) touchRows.upP75.push({ ...oUpP75, regime });
    if (oDnP75) touchRows.dnP75.push({ ...oDnP75, regime });
    // ── G1 placebo: the median lines jittered by a seeded same-scale offset — a
    // control at a similar distance but NOT the forecast's exact prediction. If the
    // real level reverses no more than this, the forecast placement adds no edge.
    if (expRange > 0) {
      const rng = _mulberry32(7919 * i + 104729);
      const jit = expRange * (0.25 + 0.35 * rng());
      const oPlUp = _levelOutcome(bars, upMed + (rng() < 0.5 ? jit : -jit), +1, pip, hyst);
      const oPlDn = _levelOutcome(bars, dnMed + (rng() < 0.5 ? jit : -jit), -1, pip, hyst);
      if (oPlUp) touchRows.plMed.push({ ...oPlUp, regime });
      if (oPlDn) touchRows.plMed.push({ ...oPlDn, regime });
    }
    if (oUpMed || oDnMed) {
      eitherTouched++;
      const uh = oUpMed ? oUpMed.firstIdx : Infinity, dh = oDnMed ? oDnMed.firstIdx : Infinity;
      if (uh < dh) firstUpper++; else if (dh < uh) firstLower++;
    }
  }

  return summarize(expRows, touchRows, { firstUpper, firstLower, eitherTouched }, lond, H);
}

// Build the London daily series (with intraday sub-bars) once, for reuse.
function _prep(intraday) {
  const lond = buildLondonDaily(intraday);
  const dailyOHLC = lond.map(d => ({ date: d.date, open: d.open, high: d.high, low: d.low, close: d.close }));
  return { lond, dailyOHLC, closes: dailyOHLC.map(d => d.close) };
}

// ── Public: one horizon (back-compat) ─────────────────────────────────────────
export function evaluateIntraday(intraday, opts = {}) {
  const { lond, dailyOHLC, closes } = _prep(intraday);
  return _walkHorizon(lond, dailyOHLC, closes, { horizon: 'daily', ...opts });
}

// ── Public: all three horizons off ONE London-day build (≈3× faster than calling
//    evaluateIntraday per horizon — buildLondonDaily runs once, not three times) ──
export function evaluateIntradayAllHorizons(intraday, opts = {}) {
  const { lond, dailyOHLC, closes } = _prep(intraday);
  const run = h => _walkHorizon(lond, dailyOHLC, closes, { ...opts, horizon: h });
  return { nDays: lond.length, daily: run('daily'), weekly: run('weekly'), d20: run('d20') };
}

// ── Aggregation ───────────────────────────────────────────────────────────────
function summarize(expRows, touchRows, dir, lond, H) {
  const unit = H.timeUnit;   // 'hour' (daily) | 'day' (weekly / 20-day)
  // Expansion: median time to each completion fraction, + big vs small split.
  const _hrs = (rows, p) => rows.map(r => r.cross[p]).filter(v => v != null);
  const expansion = {
    timeUnit: unit,
    n: expRows.length,
    medianHourTo: Object.fromEntries([25, 50, 75, 100].map(p => [p, +(_median(_hrs(expRows, p))).toFixed(1)])),
    reached100Pct: +(_rate(expRows.map(r => r.reached100)) ?? 0).toFixed(1),
    bigDayMedianTo50:   +(_median(_hrs(expRows.filter(r => r.big), 50))).toFixed(1),
    smallDayMedianTo50: +(_median(_hrs(expRows.filter(r => !r.big), 50))).toFixed(1),
  };

  // Touch study — combine up+down median as "median extension", up+down 75th as "75th extension".
  const med = [...touchRows.upMed, ...touchRows.dnMed], p75 = [...touchRows.upP75, ...touchRows.dnP75];
  const _touchStats = (rows, totalDays) => {
    if (!rows.length) return { n: 0 };
    const bySession = {};
    for (const s of ['asia', 'london', 'ny', 'other']) { const g = rows.filter(r => r.session === s); if (g.length) bySession[s] = g.length; }
    const many = rows.filter(r => r.retests >= 3), one = rows.filter(r => r.retests === 1);
    return {
      n: rows.length,
      touchRatePct: +(rows.length / totalDays * 100).toFixed(1),
      meanMfePips: +_mean(rows.map(r => r.mfePips)).toFixed(1),
      meanMaePips: +_mean(rows.map(r => r.maePips)).toFixed(1),
      reverse10Pct: +(_rate(rows.map(r => r.rev10)) ?? 0).toFixed(1),
      reverse20Pct: +(_rate(rows.map(r => r.rev20)) ?? 0).toFixed(1),
      reverse50Pct: +(_rate(rows.map(r => r.rev50)) ?? 0).toFixed(1),
      continuePct: +(_rate(rows.map(r => r.outcome === 'continue')) ?? 0).toFixed(1),
      reversePct:  +(_rate(rows.map(r => r.outcome === 'reverse')) ?? 0).toFixed(1),
      meanRetests: +_mean(rows.map(r => r.retests)).toFixed(2),
      bySession,
      // Edge decay proxy: reversal rate on single-touch vs heavily-retested days.
      reverse20SingleTouchPct: one.length ? +(_rate(one.map(r => r.rev20))).toFixed(1) : null,
      reverse20ManyRetestPct:  many.length ? +(_rate(many.map(r => r.rev20))).toFixed(1) : null,
    };
  };
  const totalWindows = expRows.length || 1;   // denominator = evaluated windows, not calendar days
  const minReg = H.windowDays >= 20 ? 6 : 15;  // 20-day windows are scarce — lower the regime-cell floor
  const _byRegime = (rows) => {
    const out = {};
    for (const rg of ['BULL', 'BEAR', 'RANGE']) { const g = rows.filter(r => r.regime === rg); if (g.length >= minReg) out[rg] = { n: g.length, continuePct: +(_rate(g.map(r => r.outcome === 'continue')) ?? 0).toFixed(1), reverse20Pct: +(_rate(g.map(r => r.rev20)) ?? 0).toFixed(1), meanMfePips: +_mean(g.map(r => r.mfePips)).toFixed(1) }; }
    return out;
  };
  // ── G1 placebo (does the exact forecast placement beat a same-scale jittered
  //    level?) + G2 fade payoff shape (hold-to-close fade PnL distribution) ──
  const plMed = touchRows.plMed || [];
  const _pctl = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const i = p / 100 * (s.length - 1); const lo = Math.floor(i), hi = Math.ceil(i); return +(s[lo] + (s[hi] - s[lo]) * (i - lo)).toFixed(1); };
  const _skew = a => { if (a.length < 3) return null; const m = _mean(a); const sd = Math.sqrt(_mean(a.map(x => (x - m) ** 2))); if (!sd) return 0; return +(_mean(a.map(x => ((x - m) / sd) ** 3))).toFixed(2); };
  const _fadePayoff = rows => {
    const pnl = rows.map(r => r.closeFadePips).filter(v => v != null);
    if (pnl.length < 20) return { n: pnl.length };
    const wins = pnl.filter(v => v > 0), losses = pnl.filter(v => v < 0);
    const avgWin = wins.length ? _mean(wins) : 0, avgLoss = losses.length ? _mean(losses) : 0;
    return { n: pnl.length, meanPips: +_mean(pnl).toFixed(1), medianPips: +_median(pnl).toFixed(1), skew: _skew(pnl),
      p5: _pctl(pnl, 5), p95: _pctl(pnl, 95), worstPips: +Math.min(...pnl).toFixed(1),
      winRatePct: +(_rate(pnl.map(v => v > 0)) ?? 0).toFixed(1),
      avgWinPips: +avgWin.toFixed(1), avgLossPips: +avgLoss.toFixed(1),
      winLossRatio: avgLoss ? +(avgWin / -avgLoss).toFixed(2) : null };
  };
  const medRev = _rate(med.map(r => r.outcome === 'reverse'));
  const plRev  = _rate(plMed.map(r => r.outcome === 'reverse'));
  const touches = {
    medianExtension: { ...(_touchStats(med, totalWindows)), byRegime: _byRegime(med) },
    p75Extension:    { ...(_touchStats(p75, totalWindows)), byRegime: _byRegime(p75) },
    placebo: { n: plMed.length, reversePct: plRev == null ? null : +plRev.toFixed(1),
      realReversePct: medRev == null ? null : +medRev.toFixed(1),
      edgeVsPlaceboPp: (medRev != null && plRev != null) ? +(medRev - plRev).toFixed(1) : null },
    fadePayoff: _fadePayoff(med),
    direction: {
      eitherTouchedDays: dir.eitherTouched,
      firstUpperPct: dir.eitherTouched ? +(dir.firstUpper / dir.eitherTouched * 100).toFixed(1) : null,
      firstLowerPct: dir.eitherTouched ? +(dir.firstLower / dir.eitherTouched * 100).toFixed(1) : null,
    },
  };

  // ── Findings ── (unit-aware: hours for daily, days-of-window otherwise)
  const at = v => unit === 'hour' ? `~${v}:00 London` : `~day ${v}`;
  const per = unit === 'hour' ? 'days' : 'windows';
  const findings = [];
  const add = (sev, text) => findings.push({ sev, text });
  if (expansion.n) add('info', `Expansion (${H.label}): reaches 50% of its expected range by ${at(expansion.medianHourTo[50])} and 100% by ${at(expansion.medianHourTo[100])}; ${expansion.reached100Pct}% of ${per} complete the full forecast range. Big ${per} expand earlier (50% by ${at(expansion.bigDayMedianTo50)} vs ${at(expansion.smallDayMedianTo50)} on quiet ${per}).`);
  const M = touches.medianExtension;
  if (M.n) {
    add('info', `${H.label} median extension is touched ${M.touchRatePct}% of ${per}; after the first touch price continues ${M.continuePct}% vs reverses ${M.reversePct}%. Pullback probability: ${M.reverse10Pct}% ≥10 pips, ${M.reverse20Pct}% ≥20, ${M.reverse50Pct}% ≥50.`);
    if (M.reverse20SingleTouchPct != null && M.reverse20ManyRetestPct != null && Math.abs(M.reverse20SingleTouchPct - M.reverse20ManyRetestPct) > 8)
      add('info', `Retest signal: single-touch ${per} reverse ≥20 pips ${M.reverse20SingleTouchPct}% vs ${M.reverse20ManyRetestPct}% on heavily-retested ${per} — ${M.reverse20SingleTouchPct > M.reverse20ManyRetestPct ? 'a clean first tap fades more often' : 'repeated retests precede the bigger fade'}.`);
  }
  if (touches.direction.firstUpperPct != null)
    add('info', `Direction: the upper median extension is hit first ${touches.direction.firstUpperPct}% of ${per} vs the lower ${touches.direction.firstLowerPct}% (of ${touches.direction.eitherTouchedDays} ${per} that reach either).`);
  const P = touches.p75Extension;
  if (P.n && M.n && P.continuePct < M.continuePct - 5)
    add('good', `Exhaustion at the extreme: the 75th extension continues only ${P.continuePct}% of the time vs ${M.continuePct}% at the median — deeper touches are more likely to be the turn.`);

  return { horizon: H.label, timeUnit: unit, nDays: lond.length, dateFrom: lond[0].date, dateTo: lond.at(-1).date, expansion, touches, findings };
}
