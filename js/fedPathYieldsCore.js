/**
 * Fed path -> yields: the join the Desk Terminal review (gap #1) asked for. Pure: no fetch, no DOM, no clock.
 *
 * Question it answers, with this week's numbers and no forecast: "the priced Fed path moved; did the 2Y, the curve and the
 * 10Y move with it, and how much of the 2Y's move can the futures path account for?"
 *
 *   fedPathYields({ fp, board, tp, now })  ->  per window (1D / 5D / 20D) the priced rate after the December and June
 *                                              meetings now against the same strip that many days ago, the 2Y / 2s10s / 10Y
 *                                              changes over the SAME calendar span, the share of the 2Y's move the futures
 *                                              path accounts for, and a rule-built sentence.
 *   windowSentence(w)                      ->  the sentence for one window (also what the chain read is handed).
 *   atlantaWindows(fp)                     ->  the Atlanta Fed window odds (a 3-month AVERAGE over a forward WINDOW, not a meeting).
 *   chainLine(res, win)                    ->  the line for the chain snapshot / Chain tab.
 *
 * Inputs:  fp = /api/fed-path ({ ok, asOf, ageDays, windows, zq: { asOf, meetings, weekAgo, ago: { 1, 20 } } }),
 *          board = /api/rates-board (tenors / slopes carry chg1d / chg7d / chg28d in bp),
 *          tp = /api/term-premium (optional, 10Y term premium and its 20-day change).
 *
 * Window convention (the chain's pills): 1D, 5D, 20D are 1, 5 and 20 TRADING days. Calendar spans used here are 1, 7 and 28
 * days, and the strip lookback (fedwatch/pull_zq_path.py rungs_ago) and the yield changes (ratesBoardCore changeBp) use the
 * SAME spans, so a path change and a yield change always cover the same dates. A strip that is not there says "unavailable".
 *
 * Honest limits, all shown by the board: the futures strip is ~a year deep and reliable only for the first few meetings
 * (thin contracts are cut off and the last liquid rate is held flat); the 2Y spans two years, so "the path accounts for" is an
 * approximation; the per-meeting archive is only weeks old, so a longer lookback is often missing. Context, not a signal: the
 * 15-minute lead of the Fed path is a banked null (Evidence Book 'stir-wide-scan') and no daily direction claim is tested.
 */
import { reconcile, fedPathRows } from './terminal/ratesBoardCore.js';

const DAY = 864e5;
const fin = v => v != null && Number.isFinite(+v);
const ts = d => Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`);
const iso = t => new Date(t).toISOString().slice(0, 10);

export const WINDOWS = [
  { win: 1, label: '1D', span: 1 },
  { win: 5, label: '5D', span: 7 },      // the strip's own "weekAgo"
  { win: 20, label: '20D', span: 28 },
];
/** A lookback strip is accepted when its own date sits within this many days of the nominal span (weekends, a missed pull). */
const SPAN_SLACK = 3;
/** The 2Y's horizon for the "priced policy over the next two years" average. */
const HORIZON_DAYS = 730;
/** Below this the 2Y did not move enough to split; the sentence says so instead of dividing noise. */
const MIN_2Y_BP = 2;
/** Past this many days the nightly laptop pull has missed at least a weekend. */
const STALE_DAYS = 4;

const meetingsOf = strip => (strip?.meetings ?? []).filter(m => m && fin(m.rAfter) && fin(m.rBefore) && m.meeting);

/** The lookback strip for a window, or null with a reason. */
export function lookbackFor(zq, w) {
  if (!zq?.meetings?.length) return { strip: null, reason: 'the per-meeting strip is not loaded' };
  const s = w.win === 5 ? zq.weekAgo : zq.ago?.[w.span];     // zq.ago is keyed by calendar days: { 1: strip, 28: strip }
  if (!s?.meetings?.length) return { strip: null, reason: w.win === 5 ? 'no week-ago strip in the pull' : `the archive does not serve a ${w.label} strip yet` };
  const lag = (ts(zq.asOf) - ts(s.asOf)) / DAY;
  if (!fin(lag) || Math.abs(lag - w.span) > SPAN_SLACK) return { strip: null, reason: `the earlier strip is ${fin(lag) ? Math.round(lag) : '?'} days back, not ~${w.span}` };
  return { strip: s, lagDays: Math.round(lag), reason: null };
}

/** Meetings up to (not including) the first thin one: the part of the strip worth trusting. Past it the rate is held flat. */
export function liquidPrefix(meetings) {
  const out = [];
  for (const m of meetings) { if (m.thin) break; out.push(m); }
  return out;
}

/**
 * The priced policy rate on a date, as a step function: the first meeting's rate before it is rBefore; after each liquid
 * meeting it is that meeting's rAfter (a decision on day D takes effect the next day); after the last liquid meeting it is held
 * flat. `liquid` = the meeting dates that may be used (decided from the NEW strip so both strips are cut at the same place).
 */
export function pricedRateOn(strip, date, liquidDates) {
  const ms = meetingsOf(strip).filter(m => liquidDates.has(m.meeting)).sort((a, b) => (a.meeting < b.meeting ? -1 : 1));
  const all = meetingsOf(strip).sort((a, b) => (a.meeting < b.meeting ? -1 : 1));
  if (!all.length) return null;
  let r = all[0].rBefore;
  for (const m of ms) { if (m.meeting < date) r = m.rAfter; else break; }
  return r;
}

/** Average priced policy rate over [from, from + days), daily steps. Both strips are averaged over the same dates. */
export function avgPricedRate(strip, from, liquidDates, days = HORIZON_DAYS) {
  let sum = 0, n = 0;
  for (let i = 0; i < days; i++) { const r = pricedRateOn(strip, iso(ts(from) + i * DAY), liquidDates); if (r == null) return null; sum += r; n++; }
  return n ? sum / n : null;
}

const pick = (arr, k) => arr?.find(x => x.k === k) ?? null;
const chgOf = (row, span) => (row ? (span === 1 ? row.chg1d : span === 7 ? row.chg7d : row.chg28d) ?? null : null);

/** The December and the June meeting on a strip, as the priced rate after them. */
function horizonRates(nowM, agoM, liquidDates) {
  const find = (mm) => nowM.find(m => m.meeting.slice(5, 7) === mm);
  return [['by December', find('12')], ['by June', find('06')]].filter(([, m]) => m).map(([label, m]) => {
    const a = agoM?.find(x => x.meeting === m.meeting) ?? null;
    const i = nowM.indexOf(m);
    const thin = nowM.slice(0, i + 1).some(x => x.thin);
    const cumBp = +((m.rAfter - nowM[0].rBefore) * 100).toFixed(1);
    return { label, meeting: m.meeting, rateAfter: +m.rAfter.toFixed(3), cumBp, steps: +(cumBp / 25).toFixed(2), thin,
      agoRateAfter: a ? +a.rAfter.toFixed(3) : null, dBp: a ? +((m.rAfter - a.rAfter) * 100).toFixed(1) : null };
  });
}

const sgn0 = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}bp`;
const WINDOW_WORD = { 1: 'on the day', 5: 'on the week', 20: 'over the month' };

/** The rule-built sentence for one window. No model, no direction claim: "priced", never "forecast". */
export function windowSentence(w) {
  if (!w || !w.available) return null;
  const { y2, path, remainder, label } = w;
  const when = WINDOW_WORD[w.win] ?? `over ${label}`;
  if (!fin(y2)) return null;
  if (Math.abs(y2) < MIN_2Y_BP) {
    return fin(path) ? `2Y barely moved ${when} (${sgn0(y2)}); the priced path moved ${sgn0(path)}.` : `2Y barely moved ${when} (${sgn0(y2)}).`;
  }
  if (!fin(path)) return `2Y ${sgn0(y2)} ${when}; the futures path was not available for the same span.`;
  const opposite = Math.sign(path) !== 0 && Math.sign(path) !== Math.sign(y2);
  if (opposite) return `2Y ${sgn0(y2)} ${when}; the futures path moved the other way (${sgn0(path)}), so the move is term premium / inflation compensation, not the priced policy path.`;
  if (Math.abs(path) > Math.abs(y2)) return `2Y ${sgn0(y2)} ${when}; the futures path alone is worth ${sgn0(path)}, more than the 2Y moved, so term premium / inflation compensation offset ${sgn0(remainder)}.`;
  return `2Y ${sgn0(y2)} ${when}; the futures path accounts for ${sgn0(path)}, the rest (${sgn0(remainder)}) is term premium / inflation compensation.`;
}

/**
 * The whole join. Returns { ok, asOf, ageDays, stale, windows: [...], proxy, horizonNote, notes[] }. Never throws; a missing input
 * gives ok:false with a reason, and a missing lookback gives that window available:false with its reason.
 */
export function fedPathYields({ fp, board, tp = null, now = Date.now() } = {}) {
  const zq = fp?.ok ? fp.zq : null;
  if (!board?.ok) return { ok: false, error: 'the Treasury curve is not loaded', windows: [] };
  const nowM = meetingsOf(zq).filter(m => m.meeting >= String(zq?.asOf ?? '').slice(0, 10));
  if (!zq || !nowM.length) return { ok: false, error: 'the per-meeting fed funds strip is not loaded (it is pulled nightly from the laptop)', windows: [] };
  const asOfDate = String(zq.asOf).slice(0, 10);
  const ageDays = Math.max(0, Math.floor((now - ts(asOfDate)) / DAY));
  const liquid = liquidPrefix(nowM), liquidDates = new Set(liquid.map(m => m.meeting));
  const t2 = pick(board.tenors, '2y'), t10 = pick(board.tenors, '10y'), s2s10 = pick(board.slopes, '2s10s');
  const anyThin = nowM.some(m => m.thin);
  const notes = [];
  if (ageDays > STALE_DAYS) notes.push(`the fed funds strip was last pulled ${ageDays} days ago (the nightly laptop pull missed)`);
  if (anyThin) notes.push('contracts past the first thin one traded almost nothing: the priced path is cut off there and held flat');

  const windows = WINDOWS.map(w => {
    const lb = lookbackFor(zq, w);
    const base = { win: w.win, label: w.label, span: w.span, y2: chgOf(t2, w.span), y10: chgOf(t10, w.span), s2s10: chgOf(s2s10, w.span) };
    if (!lb.strip) return { ...base, available: false, reason: lb.reason };
    const agoM = meetingsOf(lb.strip);
    const horizons = horizonRates(nowM, agoM, liquidDates);
    const aNow = avgPricedRate(zq, asOfDate, liquidDates), aAgo = avgPricedRate(lb.strip, asOfDate, liquidDates);
    const path = aNow != null && aAgo != null ? +((aNow - aAgo) * 100).toFixed(1) : null;
    const y2 = base.y2;
    const remainder = fin(y2) && fin(path) ? +(y2 - path).toFixed(1) : null;
    const w2 = { ...base, available: true, lagDays: lb.lagDays, agoAsOf: String(lb.strip.asOf).slice(0, 10), horizons, path, remainder,
      share: fin(y2) && fin(path) && Math.abs(y2) >= MIN_2Y_BP ? +(path / y2).toFixed(2) : null };
    return { ...w2, sentence: windowSentence(w2) };
  });

  const rec = reconcile(board, fedPathRows(zq, board));
  const gapSteps = rec.diff;
  const proxy = { ...rec,
    diverges: gapSteps != null && Math.abs(gapSteps) >= 1,
    note: gapSteps == null ? null : Math.abs(gapSteps) < 1 ? 'the 2Y and the futures strip price about the same amount of policy'
      : gapSteps > 0 ? 'the 2Y prices more policy than the futures strip: term premium, or a path beyond the front months'
        : 'the futures strip prices more near-term policy than the 2Y does: the 2Y expects it to unwind later or is carrying negative term premium' };
  const term = tp?.value != null ? { value: tp.value, chg20d: tp.chg20d ?? null, asOf: tp.asOf ?? null } : null;
  return { ok: true, asOf: asOfDate, ageDays, stale: ageDays > STALE_DAYS, windows, proxy, term, liquidMeetings: liquid.length, meetings: nowM.length, notes };
}

/** One table of the Atlanta Fed window odds: a 3-month AVERAGE over a forward WINDOW. Never labelled as a meeting. */
export function atlantaWindows(fp, { count = 4 } = {}) {
  const ws = fp?.ok && Array.isArray(fp.windows) ? fp.windows : [];
  if (!ws.length) return null;
  const d = (a, b) => (fin(a) && fin(b) ? +(a - b).toFixed(1) : null);
  return { asOf: fp.asOf ?? null, ageDays: fp.ageDays ?? null, currentRange: fp.currentRange ?? null, source: fp.source ?? 'Atlanta Fed Market Probability Tracker',
    rows: ws.slice(0, count).map(w => ({ ref: w.ref, hike: fin(w.hike) ? +w.hike : null, cut: fin(w.cut) ? +w.cut : null, mean: fin(w.mean) ? +w.mean : null,
      d1: d(w.hike, w.hikeAgo?.d1), w1: d(w.hike, w.hikeAgo?.w1), m1: d(w.hike, w.hikeAgo?.m1) })) };
}

/** The line the chain snapshot (and the Chain tab) carries for a window: the sentence, then the December and June levels. Null when nothing to say. */
export function chainLine(res, win) {
  if (!res?.ok || win === 'live') return null;
  const w = res.windows.find(x => x.win === win);
  if (!w?.available || !w.sentence) return null;
  const hz = (w.horizons ?? []).filter(x => !x.thin).map(x => `${x.label.replace('by ', '')} meeting: ${x.rateAfter.toFixed(2)}% priced${x.dBp != null ? ` (${sgn0(x.dBp)} vs ${w.agoAsOf})` : ''}`).join('; ');
  return `${w.sentence}${hz ? ` Priced fed funds after the ${hz}.` : ''} (fed funds futures; priced, not a forecast; context only)`;
}
