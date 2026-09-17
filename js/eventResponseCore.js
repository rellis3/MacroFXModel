/**
 * Event Response Core — Tier-1 brick: what an instrument did around a scheduled
 * release, CONDITIONED on what the rate market had already done INTO it.
 *
 * Why this exists rather than an extension of `macroRegimeFx.buildEventStudy`:
 * that study answers "how much bigger than a normal day does this pair move on
 * CPI, and did it go the surprise's way" from FRED noon-ET daily snapshots on
 * seven USD pairs. Both of its questions are unconditional, and its direction
 * cell is the one the platform's registered tests have repeatedly found empty
 * (`CB_SENTIMENT_PRICE_TEST.md`, `FOMC_SURPRISE_MAGNITUDE_TEST.md`: the FOMC
 * statement is priced inside thirty minutes and nothing survives to the daily
 * horizon). The open question those nulls left — named in that document's own
 * decision table — is PRE-POSITIONING: an identical hawkish print lands
 * differently in a market that has already sold the front end for a week than
 * in one that has not. That conditioning is what this brick measures, on M1
 * bars rather than noon snapshots, and it is the only new claim in
 * `MD files/EVENT_RESPONSE_BOOK.md`.
 *
 * Contract (pure — no network, no DOM, no file system, no asset knowledge):
 *   bars     `{ times: Int32Array|number[] (epoch SECONDS, ascending), closes }`
 *            — the packed shape `js/localM1Loader.js` already returns.
 *   yields   `[{ date: 'YYYY-MM-DD', y2, y10, y30 }]` ascending — daily closes.
 *            Daily is a deliberate limit, not an oversight: no intraday yield
 *            series exists offline in this repo, so the lead-up is measured on
 *            daily closes strictly BEFORE the event and the post-event yield
 *            reaction is left out rather than faked from a same-day close that
 *            straddles the release.
 *   families `[{ key, label, ccy, events: [{ ms, z }] }]` — `z` is the signed
 *            outcome, positive = economically strong for `ccy` (or hawkish for
 *            a central-bank meeting). `zSeriesFromReleases` builds it from a
 *            release archive using `econSurprise`'s parser and per-series
 *            dispersion, imported, never re-implemented (`parseFloat('1,250')`
 *            is 1, silently, which is why that parser exists).
 *
 * Everything this emits is DESCRIPTIVE. It carries `n` on every cell, omits
 * cells below `minCellObs`, and flags any cell whose sign flips between the
 * halves of its own sample. No p-value is computed anywhere: the R5 windows of
 * a monthly series overlap, and the honest statistics here are the sample size,
 * the split and the effect size. The one confirmatory test lives outside this
 * brick, in `analysis/event_response/`, as the pre-registration requires.
 */

import { scoreReleases, seriesKey } from './econSurprise.js';

export const ER_DEFAULTS = {
  minCellObs: 12,        // matches buildEventStudy — below this a cell is omitted, not greyed
  inlineZ: 0.25,         // |z| <= this is "in line"; frozen in EVENT_RESPONSE_BOOK.md §4.3
  leadSessions: 5,       // yield lookback, in yield-series sessions
  r0Minutes: 30,         // the instant-repricing window (matches the Stage-1 FOMC study)
  tolMinutes: 90,        // how far from a target clock a bar may sit and still count
  maxRollDays: 5,        // give-up point when rolling a target forward over a market gap
  baselineDays: 20,      // same-clock non-event days behind each event, for its size baseline
};

const MIN = 60, DAY = 86_400;

export const LEAD_STATES = ['priced-hawkish', 'flat', 'priced-dovish'];
export const OUTCOMES = ['beat', 'inline', 'miss'];

// ── small stats (kept local: one consumer, and statsCore has no median/upPct) ──
const _sorted = a => [...a].sort((x, y) => x - y);
export function median(values) {
  const a = _sorted(values.filter(Number.isFinite));
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
export function mean(values) {
  const a = values.filter(Number.isFinite);
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
}
const r1dp = (x, d = 1) => (x == null || !Number.isFinite(x) ? null : +x.toFixed(d));

/** A window's summary: how many, how big, how often up. No p-value — see header. */
export function summarize(values) {
  const a = values.filter(Number.isFinite);
  if (!a.length) return { n: 0, median: null, mean: null, upPct: null };
  return {
    n: a.length,
    median: r1dp(median(a)),
    mean: r1dp(mean(a)),
    upPct: r1dp((a.filter(v => v > 0).length / a.length) * 100),
  };
}

// ── bar access ────────────────────────────────────────────────────────────────

/** Index of the last bar at or before `tSec`, or −1. Binary search; times ascending. */
export function bisectAtOrBefore(times, tSec) {
  let lo = 0, hi = times.length - 1, best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= tSec) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return best;
}

/**
 * The close at or just before `ms`, provided a bar sits within `tolMinutes` of
 * it. The tolerance is what keeps a Friday-evening target from silently reading
 * a Friday-afternoon price as if it were Monday's: past the tolerance this
 * returns null and the window is dropped, never stretched.
 */
export function closeAt(bars, ms, tolMinutes = ER_DEFAULTS.tolMinutes) {
  const t = Math.floor(ms / 1000);
  const i = bisectAtOrBefore(bars.times, t);
  if (i < 0) return null;
  if (t - bars.times[i] > tolMinutes * MIN) return null;
  const px = bars.closes[i];
  return px > 0 ? { price: px, ms: bars.times[i] * 1000 } : null;
}

/**
 * Advance `ms` by `sessions` trading days at the same clock. A calendar day whose
 * same-clock slot has no bar (weekend, holiday) is rolled over without being
 * counted, so "5 trading days later" means five days the market was open — the
 * same convention the Stage-1 FOMC windows used. Returns null if the roll runs
 * past `maxRollDays` consecutive empty days, rather than returning a stale price.
 */
export function rollSessions(bars, ms, sessions, opts = {}) {
  const o = { ...ER_DEFAULTS, ...opts };
  let cur = ms, left = Math.abs(sessions);
  const step = Math.sign(sessions) * DAY * 1000;
  if (!left) return ms;
  let empties = 0;
  while (left > 0) {
    cur += step;
    if (closeAt(bars, cur, o.tolMinutes)) { left--; empties = 0; }
    else if (++empties > o.maxRollDays) return null;
  }
  return cur;
}

/**
 * The four frozen windows around an event, in basis points of log return.
 *   pre5 — 5 sessions before → 1 minute before  (what the pair did INTO it)
 *   r0   — 1 minute before → +30 minutes        (the instant repricing)
 *   r1   — +30 minutes → same clock next session (the day-after digestion)
 *   r5   — +30 minutes → same clock 5 sessions on (the unwind / drift)
 * Any window missing a leg comes back null. A null is reported as a dropped
 * window, never filled in from a neighbouring bar.
 */
export function eventWindows(bars, eventMs, opts = {}) {
  const o = { ...ER_DEFAULTS, ...opts };
  const bp = (a, b) => (a && b && a.price > 0 && b.price > 0 ? Math.log(b.price / a.price) * 1e4 : null);
  const pre = closeAt(bars, eventMs - MIN * 1000, o.tolMinutes);
  const post = closeAt(bars, eventMs + o.r0Minutes * MIN * 1000, o.tolMinutes);
  const preStartMs = rollSessions(bars, eventMs - MIN * 1000, -o.leadSessions, o);
  const preStart = preStartMs == null ? null : closeAt(bars, preStartMs, o.tolMinutes);
  const postMs = eventMs + o.r0Minutes * MIN * 1000;
  const d1Ms = rollSessions(bars, postMs, 1, o), d5Ms = rollSessions(bars, postMs, 5, o);
  const d1 = d1Ms == null ? null : closeAt(bars, d1Ms, o.tolMinutes);
  const d5 = d5Ms == null ? null : closeAt(bars, d5Ms, o.tolMinutes);
  return { pre5: bp(preStart, pre), r0: bp(pre, post), r1: bp(post, d1), r5: bp(post, d5) };
}

// ── the lead-up state (the conditioning variable) ─────────────────────────────

/** Index yields by date once; every lookup below is a walk over that index. */
export function indexYields(rows = []) {
  const dates = [], y = { y2: [], y10: [], y30: [] };
  for (const r of rows) {
    if (!r?.date) continue;
    const v2 = Number(r.y2), v10 = Number(r.y10), v30 = Number(r.y30);
    if (!Number.isFinite(v2) && !Number.isFinite(v10) && !Number.isFinite(v30)) continue;
    dates.push(r.date);
    y.y2.push(Number.isFinite(v2) ? v2 : null);
    y.y10.push(Number.isFinite(v10) ? v10 : null);
    y.y30.push(Number.isFinite(v30) ? v30 : null);
  }
  return { dates, ...y };
}

/**
 * The move in each tenor over the `leadSessions` yield sessions ENDING ON THE
 * LAST CLOSE BEFORE the event, in bp. Strictly pre-event by construction: the
 * event day's own close is excluded, because for a 14:00 release that close
 * already contains the reaction, and including it would leak the answer into
 * the conditioning variable.
 */
export function leadUpFor(idx, eventMs, opts = {}) {
  const o = { ...ER_DEFAULTS, ...opts };
  const day = new Date(eventMs).toISOString().slice(0, 10);
  // last index strictly before the event day
  let end = -1;
  for (let i = 0; i < idx.dates.length; i++) { if (idx.dates[i] < day) end = i; else break; }
  const start = end - o.leadSessions;
  if (end < 0 || start < 0) return null;
  const d = key => {
    const a = idx[key][start], b = idx[key][end];
    return Number.isFinite(a) && Number.isFinite(b) ? (b - a) * 100 : null;   // pp → bp
  };
  const d2y = d('y2'), d10y = d('y10'), d30y = d('y30');
  return {
    d2y5: r1dp(d2y), d10y5: r1dp(d10y), d30y5: r1dp(d30y),
    dSlope5: d2y != null && d10y != null ? r1dp(d10y - d2y) : null,
    asOf: idx.dates[end],
  };
}

/**
 * The dead-zone that separates "the market moved into this" from "it didn't":
 * half the median absolute `leadSessions`-session move of the tenor itself.
 * Defined from the yield series ALONE — it never sees a return — so it cannot
 * be tuned, knowingly or otherwise, against the outcome it conditions.
 */
export function deadZoneBp(idx, key = 'y2', opts = {}) {
  const o = { ...ER_DEFAULTS, ...opts };
  const moves = [];
  for (let i = o.leadSessions; i < idx.dates.length; i++) {
    const a = idx[key][i - o.leadSessions], b = idx[key][i];
    if (Number.isFinite(a) && Number.isFinite(b)) moves.push(Math.abs(b - a) * 100);
  }
  const m = median(moves);
  return m == null ? null : r1dp(m * 0.5);
}

/** Three states, by the sign of the front-end move against that dead-zone. */
export function classifyLead(d2y5, deadBp) {
  if (d2y5 == null || deadBp == null) return null;
  if (d2y5 > deadBp) return 'priced-hawkish';
  if (d2y5 < -deadBp) return 'priced-dovish';
  return 'flat';
}

/** Three outcomes, in the releasing currency's own terms. */
export function outcomeBucket(z, inlineZ = ER_DEFAULTS.inlineZ) {
  if (z == null || !Number.isFinite(z)) return null;
  if (z > inlineZ) return 'beat';
  if (z < -inlineZ) return 'miss';
  return 'inline';
}

/**
 * Releases → `[{ ms, z }]` for one series, standardised by THAT series' own
 * surprise dispersion with the polarity sign applied (z > 0 = economically
 * strong for the currency, so unemployment and claims are already flipped).
 * Thin wrapper over `econSurprise.scoreReleases` — the sigma and the parser
 * have one home, and this is not it.
 */
export function zSeriesFromReleases(releases = [], country, title, opts = {}) {
  const key = seriesKey({ country, event: title });
  const { scored } = scoreReleases(releases, {
    impacts: ['high', 'medium'], maxAgeDays: 1e6, minSeriesObs: 6,
    now: opts.now ?? Date.now(), ...opts,
  });
  return scored.filter(s => s.series === key).map(s => ({ ms: s.ms, z: s.z })).sort((a, b) => a.ms - b.ms);
}

// ── the book ──────────────────────────────────────────────────────────────────

/**
 * Each event's own size baseline: the median |R1-shaped move| over the
 * `baselineDays` weekdays before it, at the SAME CLOCK, skipping days that sit
 * inside another event's window. Same-clock matching is the point — an 18:00
 * UTC FOMC window and a 13:30 UTC CPI window live in different parts of the
 * liquidity day, and comparing either to an all-day average would flatter it.
 */
export function baselineFor(bars, eventMs, eventMsSet, opts = {}) {
  const o = { ...ER_DEFAULTS, ...opts };
  const r0 = [], r1 = [];
  for (let k = 1; k <= o.baselineDays * 2 && r1.length < o.baselineDays; k++) {
    const day = eventMs - k * DAY * 1000;
    const dow = new Date(day).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    if (eventMsSet.some(m => Math.abs(m - day) < 1.5 * DAY * 1000)) continue;
    const w = eventWindows(bars, day, o);
    if (w.r0 != null) r0.push(Math.abs(w.r0));
    if (w.r1 != null) r1.push(Math.abs(w.r1));
  }
  return {
    absR0: r0.length >= 5 ? r1dp(median(r0)) : null,
    absR1: r1.length >= 5 ? r1dp(median(r1)) : null,
  };
}

/**
 * The book: for every family × instrument, the unconditional row and the
 * 3 × 3 conditional grid (lead-up state × outcome).
 *
 * `instruments` = { name: { bars, legs: [base, quote] } }. `legs` decides only
 * which side of the pair the releasing currency sits on — returns are always
 * reported in the INSTRUMENT's own terms ("EURUSD fell 11bp"), never flipped
 * into currency terms, because the panel that renders this talks about pairs.
 */
export function buildEventResponseBook({ instruments = {}, families = [], yields = [], opts = {} } = {}) {
  const o = { ...ER_DEFAULTS, ...opts };
  const idx = indexYields(yields);
  const deadBp = deadZoneBp(idx, 'y2', o);
  const out = { families: {}, meta: { deadZoneBp: deadBp, ...pickOpts(o) } };

  for (const fam of families) {
    const evAll = (fam.events ?? []).filter(e => e && Number.isFinite(e.ms)).sort((a, b) => a.ms - b.ms);
    const msList = evAll.map(e => e.ms);
    const famOut = { label: fam.label ?? fam.key, ccy: fam.ccy ?? null, instruments: {},
      events: evAll.length, from: evAll.length ? isoDay(evAll[0].ms) : null, to: evAll.length ? isoDay(evAll.at(-1).ms) : null };

    for (const [name, inst] of Object.entries(instruments)) {
      const bars = inst?.bars;
      if (!bars?.times?.length) continue;
      const side = !fam.ccy ? 0 : inst.legs?.[0] === fam.ccy ? 1 : inst.legs?.[1] === fam.ccy ? -1 : 0;
      if (!side) continue;                                  // this release does not touch this instrument

      const rows = [];
      for (const ev of evAll) {
        const w = eventWindows(bars, ev.ms, o);
        if (w.r0 == null && w.r1 == null) continue;          // outside this instrument's data
        const lead = leadUpFor(idx, ev.ms, o);
        const base = baselineFor(bars, ev.ms, msList, o);
        rows.push({
          ms: ev.ms, z: ev.z ?? null, ...w,
          lead: lead?.d2y5 ?? null, leadState: classifyLead(lead?.d2y5 ?? null, deadBp),
          outcome: outcomeBucket(ev.z ?? null, o.inlineZ),
          base: base.absR1, base0: base.absR0,
        });
      }
      if (!rows.length) continue;

      const mult = rows.map(r => (r.base > 0 && r.r1 != null ? Math.abs(r.r1) / r.base : null)).filter(Number.isFinite);
      const spike = rows.map(r => (r.base0 > 0 && r.r0 != null ? Math.abs(r.r0) / r.base0 : null)).filter(Number.isFinite);
      const spikeRatio = spike.length ? +(median(spike)).toFixed(2) : null;
      const all = {
        n: rows.length,
        pre5: summarize(rows.map(r => r.pre5)), r0: summarize(rows.map(r => r.r0)),
        r1: summarize(rows.map(r => r.r1)), r5: summarize(rows.map(r => r.r5)),
        absR1Median: r1dp(median(rows.map(r => (r.r1 == null ? null : Math.abs(r.r1))))),
        baselineAbsR1Median: r1dp(median(rows.map(r => r.base))),
        moveMultiple: mult.length ? +(median(mult)).toFixed(2) : null,
        // Join proof, in the Stage-1 FOMC study's shape: the 30-minute window
        // around a correctly-timed release should dwarf the same clock on
        // ordinary days. A ratio near 1 does not mean "the event did nothing" —
        // it means the timestamp is probably wrong, and the row must be read as
        // suspect rather than as a finding.
        joinProof: { spikeRatioR0: spikeRatio, pass: spikeRatio != null ? spikeRatio >= 2 : null },
        side,
      };

      const cells = {};
      for (const st of LEAD_STATES) {
        for (const oc of OUTCOMES) {
          const sub = rows.filter(r => r.leadState === st && r.outcome === oc);
          if (sub.length < o.minCellObs) continue;            // omitted, not greyed — see header
          cells[`${st}|${oc}`] = { leadState: st, outcome: oc, ...cellStats(sub) };
        }
      }
      // The two MARGINALS, each with ~3x the sample of a joint cell. A 3x3 grid
      // on a 110-print series leaves ~12 per cell, which is the regime where
      // noise wins; the marginals are the same data cut once instead of twice
      // and are the honest first read. They also give the comparison the joint
      // cells have to beat: if `priced-hawkish + beat` says nothing that
      // `priced-hawkish` alone does not, the interaction is adding nothing.
      // A family with no outcome score (e.g. a Beige Book release, where the
      // text score is server-side only) still fills `leadCells`.
      const leadCells = {}, outcomeCells = {};
      for (const st of LEAD_STATES) {
        const sub = rows.filter(r => r.leadState === st);
        if (sub.length >= o.minCellObs) leadCells[st] = { leadState: st, ...cellStats(sub) };
      }
      for (const oc of OUTCOMES) {
        const sub = rows.filter(r => r.outcome === oc);
        if (sub.length >= o.minCellObs) outcomeCells[oc] = { outcome: oc, ...cellStats(sub) };
      }
      famOut.instruments[name] = { all, cells, leadCells, outcomeCells, cellsOmitted: 9 - Object.keys(cells).length };
    }
    out.families[fam.key] = famOut;
  }
  return out;
}

/** One cell: the three horizons, plus the half-split that decides if it is noise. */
function cellStats(sub) {
  const half = Math.floor(sub.length / 2);
  const early = sub.slice(0, half), late = sub.slice(half);
  const med = (a, k) => median(a.map(r => r[k]));
  const flip = k => {
    const e = med(early, k), l = med(late, k);
    return e == null || l == null ? null : Math.sign(e) !== Math.sign(l);
  };
  return {
    n: sub.length,
    pre5: summarize(sub.map(r => r.pre5)), r0: summarize(sub.map(r => r.r0)),
    r1: summarize(sub.map(r => r.r1)), r5: summarize(sub.map(r => r.r5)),
    leadMedianBp: r1dp(median(sub.map(r => r.lead))),
    halves: {
      earlyN: early.length, lateN: late.length,
      earlyR1Median: r1dp(med(early, 'r1')), lateR1Median: r1dp(med(late, 'r1')),
    },
    // Unstable = the sign did not survive its own sample's halves. The renderer
    // must say so however large the median looks (same rule as regimePrecedent).
    unstable: { r0: flip('r0'), r1: flip('r1'), r5: flip('r5') },
  };
}

const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
const pickOpts = o => ({
  minCellObs: o.minCellObs, inlineZ: o.inlineZ, leadSessions: o.leadSessions,
  r0Minutes: o.r0Minutes, tolMinutes: o.tolMinutes, baselineDays: o.baselineDays,
});
