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
  return {
    touched: true, firstIdx, retests: episodes,
    hour: _hourOf(bars[firstIdx]._t), session: _session(bars[firstIdx]._t),
    mfePips: +mfe.toFixed(1), maePips: +mae.toFixed(1),
    rev10: mae >= 10, rev20: mae >= 20, rev50: mae >= 50, outcome,
  };
}

// ── Main: walk-forward over London days ───────────────────────────────────────
export function evaluateIntraday(intraday, { assetClass = 'fx', pip = 0.0001, minLookback = 60 } = {}) {
  const lond = buildLondonDaily(intraday);
  if (lond.length < minLookback + 40) return { insufficient: true, nDays: lond.length };
  const dailyOHLC = lond.map(d => ({ date: d.date, open: d.open, high: d.high, low: d.low, close: d.close }));
  const closes = dailyOHLC.map(d => d.close);

  const expRows = [];                 // expansion timing per day
  const touchRows = { upMed: [], dnMed: [], upP75: [], dnP75: [] };
  let firstUpper = 0, firstLower = 0, eitherTouched = 0;

  for (let i = minLookback; i < lond.length; i++) {
    let fc; try { fc = computeForecast(dailyOHLC.slice(0, i), assetClass); } catch { continue; }
    const day = lond[i]; const bars = day.bars; if (!bars || bars.length < 6) continue;
    const open = day.open; if (!(open > 0)) continue;
    const regime = classifyRegime(closes, i, 20, 5, 0.002, 1.0);

    // Forecast levels (price). O-H/O-L are % of price; H-L median is the expected range.
    const expRange = open * (fc.hl_median ?? 0) / 100;
    const upMed = open * (1 + (fc.oh_median ?? 0) / 100), upP75 = open * (1 + (fc.oh_75 ?? 0) / 100);
    const dnMed = open * (1 - (fc.ol_median ?? 0) / 100), dnP75 = open * (1 - (fc.ol_75 ?? 0) / 100);
    const hyst = Math.max(pip, 0.15 * expRange);

    // ── Expansion timing ──
    if (expRange > 0) {
      let hi = -Infinity, lo = Infinity; const cross = { 25: null, 50: null, 75: null, 100: null };
      for (const b of bars) {
        if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low;
        const frac = (hi - lo) / expRange * 100;
        for (const p of [25, 50, 75, 100]) if (cross[p] == null && frac >= p) cross[p] = _hourOf(b._t);
      }
      const realizedHl = (hi - lo) / open * 100;
      expRows.push({ regime, cross, reached100: cross[100] != null, big: realizedHl > (fc.hl_median ?? 0),
        eff: (hi - lo) > 0 ? Math.min(1, Math.abs(bars.at(-1).close - open) / (hi - lo)) : null });
    }

    // ── Level touches ──
    const oUpMed = _levelOutcome(bars, upMed, +1, pip, hyst), oDnMed = _levelOutcome(bars, dnMed, -1, pip, hyst);
    const oUpP75 = _levelOutcome(bars, upP75, +1, pip, hyst), oDnP75 = _levelOutcome(bars, dnP75, -1, pip, hyst);
    if (oUpMed) touchRows.upMed.push({ ...oUpMed, regime });
    if (oDnMed) touchRows.dnMed.push({ ...oDnMed, regime });
    if (oUpP75) touchRows.upP75.push({ ...oUpP75, regime });
    if (oDnP75) touchRows.dnP75.push({ ...oDnP75, regime });
    // Direction: which median extension is hit first?
    if (oUpMed || oDnMed) {
      eitherTouched++;
      const uh = oUpMed ? oUpMed.firstIdx : Infinity, dh = oDnMed ? oDnMed.firstIdx : Infinity;
      if (uh < dh) firstUpper++; else if (dh < uh) firstLower++;
    }
  }

  return summarize(expRows, touchRows, { firstUpper, firstLower, eitherTouched }, lond);
}

// ── Aggregation ───────────────────────────────────────────────────────────────
function summarize(expRows, touchRows, dir, lond) {
  // Expansion: median hour to each completion fraction, + big vs small day split.
  const _hrs = (rows, p) => rows.map(r => r.cross[p]).filter(v => v != null);
  const expansion = {
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
  const totalDays = lond.length;
  const _byRegime = (rows) => {
    const out = {};
    for (const rg of ['BULL', 'BEAR', 'RANGE']) { const g = rows.filter(r => r.regime === rg); if (g.length >= 15) out[rg] = { n: g.length, continuePct: +(_rate(g.map(r => r.outcome === 'continue')) ?? 0).toFixed(1), reverse20Pct: +(_rate(g.map(r => r.rev20)) ?? 0).toFixed(1), meanMfePips: +_mean(g.map(r => r.mfePips)).toFixed(1) }; }
    return out;
  };
  const touches = {
    medianExtension: { ...(_touchStats(med, totalDays)), byRegime: _byRegime(med) },
    p75Extension:    { ...(_touchStats(p75, totalDays)), byRegime: _byRegime(p75) },
    direction: {
      eitherTouchedDays: dir.eitherTouched,
      firstUpperPct: dir.eitherTouched ? +(dir.firstUpper / dir.eitherTouched * 100).toFixed(1) : null,
      firstLowerPct: dir.eitherTouched ? +(dir.firstLower / dir.eitherTouched * 100).toFixed(1) : null,
    },
  };

  // ── Findings ──
  const findings = [];
  const add = (sev, text) => findings.push({ sev, text });
  if (expansion.n) add('info', `Expansion: the day reaches 50% of its expected range by ~${expansion.medianHourTo[50]}:00 London and 100% by ~${expansion.medianHourTo[100]}:00; ${expansion.reached100Pct}% of days complete the full forecast range. Big days hit the halfway mark earlier (${expansion.bigDayMedianTo50}:00 vs ${expansion.smallDayMedianTo50}:00 on quiet days).`);
  const M = touches.medianExtension;
  if (M.n) {
    add('info', `Median extension is touched ${M.touchRatePct}% of days; after the first touch price continues ${M.continuePct}% vs reverses ${M.reversePct}%. Pullback probability: ${M.reverse10Pct}% ≥10 pips, ${M.reverse20Pct}% ≥20, ${M.reverse50Pct}% ≥50.`);
    if (M.reverse20SingleTouchPct != null && M.reverse20ManyRetestPct != null && Math.abs(M.reverse20SingleTouchPct - M.reverse20ManyRetestPct) > 8)
      add('info', `Retest signal: single-touch days reverse ≥20 pips ${M.reverse20SingleTouchPct}% vs ${M.reverse20ManyRetestPct}% on heavily-retested days — ${M.reverse20SingleTouchPct > M.reverse20ManyRetestPct ? 'a clean first tap fades more often' : 'repeated retests precede the bigger fade'}.`);
  }
  if (touches.direction.firstUpperPct != null)
    add('info', `Direction: the upper median extension is hit first ${touches.direction.firstUpperPct}% of days vs the lower ${touches.direction.firstLowerPct}% (of ${touches.direction.eitherTouchedDays} days that reach either).`);
  const P = touches.p75Extension;
  if (P.n && M.n && P.continuePct < M.continuePct - 5)
    add('good', `Exhaustion at the extreme: the 75th extension continues only ${P.continuePct}% of the time vs ${M.continuePct}% at the median — deeper touches are more likely to be the day's turn.`);

  return { nDays: lond.length, dateFrom: lond[0].date, dateTo: lond.at(-1).date, expansion, touches, findings };
}
