// HAR Shadow — pure logic (no I/O). Route: js/harShadowRoutes.js. Page: har-shadow.html.
//
// Side-by-side forward test of the preferred LADDER CALIBRATION candidate (forge/LADDER_CALIBRATION_PREREG.md,
// variant 2) against the live forecast ladder. Nothing here feeds the live ladder, the exports or any bot.
//
//   LIVE   = the ladder the Vol Forecast already stores each day (fc.ladder / fc.ladder_flat: yz_10 / ewma σ,
//            fitted widths, event multiplier).
//   HAR    = the HAR-log σ the forecast ALSO already stores each day as a shadow (fc.harLog, since 2026-09-15:
//            HAR-log on the last 800 daily bars) × the widths in js/forecastLadderParamsHar800.js, which were fitted
//            on exactly that σ. No event multiplier (as tested).
//
// Why: the live ladder is calibrated on average but not by regime — after quiet spells its p75 is passed on ~30% of
// days, after busy spells ~19% (target 25%). In the pre-registered head-to-head (253 test days, 28 instruments)
// HAR cut that regime miss from 2.86pp to 1.41pp. This page checks whether that holds on live data.
//
// Regime here = live σ ÷ HAR σ for the same day. HAR carries a long-run anchor and the live σ does not, so a high
// ratio means the live σ is running hot versus its long-run level (the "busy" end), a low ratio the "quiet" end.

import { buildLadder, flattenLadder } from './forecastLadder.js';
import { HAR800_PARAMS } from './forecastLadderParamsHar800.js';

export const RUNG_TARGET = { p50: 0.50, p75: 0.25, p90: 0.10 };
export const SHADOW_START = '2026-09-15';          // first day fc.harLog was stored
const SQRT252 = Math.sqrt(252);
const r = (x, d = 3) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
const QS = ['hl', 'oh', 'ol', 'oc'], RS = ['p50', 'p75', 'p90'];

export function harParamsFor(sym) {
  return HAR800_PARAMS.pairs[String(sym).toUpperCase()] ?? null;
}

// HAR daily σ (%) as stored: fc.harLog.vol_annual already has the old one-sided news multiplier folded in when it was
// above 1 (forecastExport.harLogShadowFields); divide it back out so the candidate is the σ the widths were fitted on.
export function harSigmaDailyPct(fc) {
  const h = fc?.harLog;
  if (!(h?.vol_annual > 0)) return null;
  const nm = h.news_mult > 1 ? h.news_mult : 1;
  return h.vol_annual / SQRT252 / nm;
}

// The day's open, recovered from the live ladder's own levels (levels are open × (1 ± pct/100)).
export function openFrom(fc) {
  const L = fc?.ladder, lv = L?.levels;
  if (!lv || !(L?.oh?.p50 > 0) || !Number.isFinite(lv.oh_p50)) return null;
  return lv.oh_p50 / (1 + L.oh.p50 / 100);
}

// Both ladders for one instrument, flat percentages ({hl_p50: 0.61, ...}) plus price levels when the open is known.
export function ladders(sym, fc) {
  const live = fc?.ladder_flat ?? (fc?.ladder ? flattenLadder(fc.ladder) : null);
  const p = harParamsFor(sym), s = harSigmaDailyPct(fc);
  if (!live || !p || !(s > 0)) return null;
  const open = openFrom(fc);
  const L = buildLadder(s / 100, { instrument: sym, eventTag: 'none', ladderParams: HAR800_PARAMS,
                                   open: Number.isFinite(open) ? open : null });
  const liveSigma = fc.ladder?.sigma_daily_pct ?? null;
  return {
    sym, open: Number.isFinite(open) ? open : null,
    liveSigma, liveSigmaUsed: fc.ladder?.sigma_used_pct ?? null, event: fc.ladder?.event_tag ?? null,
    eventMult: fc.ladder?.event_mult ?? null, liveEstimator: fc.ladder?.estimator ?? null,
    harSigma: r(s, 4), ratio: liveSigma > 0 ? r(liveSigma / s) : null,
    live, har: flattenLadder(L),
    liveLevels: fc.ladder?.levels ?? null, harLevels: L.levels ?? null,
    provisional: p.provisional ?? null,
  };
}

// Score one finished day for one instrument: did each arm's rungs get passed? `sess` = vol_session instruments[sym].
export function scoreInstrument(sym, fc, sess) {
  const lad = ladders(sym, fc);
  if (!lad || !sess || sess.error || !Number.isFinite(sess.hl)) return null;
  // vol_session stores oc SIGNED (close - open); the ladder's oc rungs are for |close - open|.
  const real = { hl: sess.hl, oh: sess.oh, ol: sess.ol, oc: Number.isFinite(sess.oc) ? Math.abs(sess.oc) : null };
  const hit = arm => {
    const out = {};
    for (const q of QS) for (const p of RS) {
      const v = lad[arm][`${q}_${p}`];
      if (Number.isFinite(v) && Number.isFinite(real[q])) out[`${q}_${p}`] = real[q] > v ? 1 : 0;
    }
    return out;
  };
  return { sym, ratio: lad.ratio, event: lad.event, provisional: !!lad.provisional, complete: sess.complete ?? null,
           realised: { hl: sess.hl, oh: sess.oh, ol: sess.ol, oc: sess.oc == null ? null : Math.abs(sess.oc) },
           live: hit('live'), har: hit('har'),
           width: { live_hl_p75: lad.live.hl_p75, har_hl_p75: lad.har.hl_p75 } };
}

// A session audit is only usable if it was taken before that London date ended. Audits that ran after London
// midnight (seen 4 times in 12 sessions, 2026-09/10) captured the NEXT session's first minutes — ranges near zero.
export function auditUsable(sessionDate, auditedAt) {
  if (!auditedAt) return true;
  const london = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(auditedAt));
  return london <= sessionDate;
}

// Running scorecard over scored days: exceedance per rung per arm, the 12-rung mean miss, and the HL p75 / p90
// exceedance by regime tercile (ratio edges from the scored rows themselves). Instruments are pooled; `days` is
// the count of distinct dates, which is what limits precision (one USD move hits many pairs at once).
export function scorecard(days, { includeProvisional = false } = {}) {
  const rows = [];
  for (const [date, d] of Object.entries(days ?? {})) for (const x of d.rows ?? []) {
    if (x.provisional && !includeProvisional) continue;
    rows.push({ date, ...x });
  }
  const arms = ['live', 'har'];
  const rate = (sub, arm, k) => { const v = sub.map(x => x[arm][k]).filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const rungs = {};
  const miss = { live: [], har: [] };
  for (const q of QS) for (const p of RS) {
    const k = `${q}_${p}`;
    rungs[k] = { target: RUNG_TARGET[p] };
    for (const a of arms) { const v = rate(rows, a, k); rungs[k][a] = r(v); if (v != null) miss[a].push(Math.abs(v - RUNG_TARGET[p])); }
  }
  const ratios = rows.map(x => x.ratio).filter(Number.isFinite).sort((a, b) => a - b);
  const edges = ratios.length >= 9 ? [ratios[Math.floor(ratios.length / 3)], ratios[Math.floor(2 * ratios.length / 3)]] : null;
  const regime = edges ? ['quiet', 'middle', 'busy'].map((label, i) => {
    const sub = rows.filter(x => Number.isFinite(x.ratio) && (i === 0 ? x.ratio < edges[0] : i === 1 ? x.ratio >= edges[0] && x.ratio < edges[1] : x.ratio >= edges[1]));
    return { label, n: sub.length, live_hl_p75: r(rate(sub, 'live', 'hl_p75')), har_hl_p75: r(rate(sub, 'har', 'hl_p75')),
             live_hl_p90: r(rate(sub, 'live', 'hl_p90')), har_hl_p90: r(rate(sub, 'har', 'hl_p90')) };
  }) : null;
  const mean = a => (a.length ? r(a.reduce((x, y) => x + y, 0) / a.length * 100, 2) : null);
  return { n: rows.length, dates: new Set(rows.map(x => x.date)).size, rungs, regime, edges: edges?.map(e => r(e)),
           miss12: { live: mean(miss.live), har: mean(miss.har) } };
}

// ── Layer 5: remaining travel (R3, forge/REMAINING_TRAVEL_PREREG.md) ─────────────────────────────────────────
// At London checkpoints 01:00, 03:00 … 21:00: from the price at that moment, how far can price still travel up and
// down before the session ends? travel_q = R3 multiplier[class][hour][side][q] × HAR daily σ × open. Scored on hourly
// candles (an hour's high/low equal its minutes' extremes). 21:00 is flagged unreliable in the research.
import { REMAINING_TRAVEL_R3 } from './remainingTravelParamsR3.js';

export const CHECKPOINTS = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21];
const RT_MAJORS = new Set(['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']);
const RT_INDICES = new Set(['NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100']);
export function travelClass(sym) {
  const s = String(sym).toUpperCase();
  if (RT_INDICES.has(s)) return 'index';
  if (s === 'GOLD') return 'gold';
  if (RT_MAJORS.has(s)) return 'major';
  return /^[A-Z]{6}$/.test(s) ? 'cross' : null;
}

// bars: [{t (epoch sec, bar START), o, h, l, c}] for one London session, ascending. openSec = that London midnight.
// Returns one row per checkpoint reached: price at the checkpoint, travel still to come, and the R3 thresholds.
export function travelRows(sym, bars, openSec, sigmaDailyPct) {
  const cls = travelClass(sym), M = REMAINING_TRAVEL_R3.classes[cls];
  if (!M || !(sigmaDailyPct > 0) || !bars?.length) return [];
  const o = bars[0].o, unit = sigmaDailyPct / 100 * o, out = [];
  for (const h of CHECKPOINTS) {
    const cut = openSec + h * 3600;
    const before = bars.filter(b => b.t < cut), after = bars.filter(b => b.t >= cut);
    if (!before.length || !after.length) continue;
    const P = before[before.length - 1].c;
    const hi = Math.max(...after.map(b => b.h)), lo = Math.min(...after.map(b => b.l));
    const m = M[String(h)];
    out.push({ h, P, up: (hi - P) / unit, down: (P - lo) / unit, thr: m, flagged: REMAINING_TRAVEL_R3.flagged_hours.includes(h) });
  }
  return out;
}

// Today's remaining-travel levels from the latest checkpoint already passed (price levels and σ distances).
export function travelLevels(sym, P, open, sigmaDailyPct, h) {
  const M = REMAINING_TRAVEL_R3.classes[travelClass(sym)]?.[String(h)];
  if (!M || !(P > 0) || !(sigmaDailyPct > 0)) return null;
  const unit = sigmaDailyPct / 100 * open, lv = {};
  for (const q of ['p50', 'p75', 'p90']) { lv[`up_${q}`] = P + M.up[q] * unit; lv[`down_${q}`] = P - M.down[q] * unit; }
  return { h, P, mult: M, levels: lv, flagged: REMAINING_TRAVEL_R3.flagged_hours.includes(h) };
}

// Exceedance of each rung by checkpoint band, pooled over instruments and sessions. Target: p50 50%, p75 25%, p90 10%.
export const TRAVEL_BANDS = { 1: '01-05', 3: '01-05', 5: '01-05', 7: '07-11', 9: '07-11', 11: '07-11', 13: '13-15', 15: '13-15', 17: '17-19', 19: '17-19', 21: '21' };
export function travelScorecard(days) {
  const acc = {};
  let n = 0; const dates = new Set();
  for (const [date, d] of Object.entries(days ?? {})) for (const row of d.travel ?? []) {
    n++; dates.add(date);
    for (const band of [TRAVEL_BANDS[row.h], 'all']) {
      const a = (acc[band] ??= { n: 0 });
      a.n++;
      for (const s of ['up', 'down']) for (const q of ['p50', 'p75', 'p90']) {
        const k = `${s}_${q}`; a[k] = (a[k] ?? 0) + (row[s] > row.thr[s][q] ? 1 : 0);
      }
    }
  }
  for (const a of Object.values(acc)) for (const k of Object.keys(a)) if (k !== 'n') a[k] = r(a[k] / a.n);
  return { n, dates: dates.size, bands: acc };
}
