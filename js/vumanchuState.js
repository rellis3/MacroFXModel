/**
 * VuManChu State — the LIVE read, keyed identically to the offline panel.
 *
 * `vumanchuLab/` measured conditional probabilities over ten years and froze
 * them into `vumanchu_state_table.json`. This brick produces the CELL KEY that
 * table is indexed by, from live bars, so the live side can look up "what has
 * price done historically from a state like this" without recomputing anything.
 *
 * ── THE ONE THING THAT MATTERS ──────────────────────────────────────────────
 * The key produced here MUST equal the key `vumanchuLab/panel.py` +
 * `shapes.py::symbolic_codes` produced for the same bars. If they diverge, the
 * table gets queried with keys it was never built from and every probability
 * returned is meaningless — silently, since a missing key just falls back to a
 * coarser match level instead of erroring. `js/vumanchuState.test.mjs` pins the
 * encoding against vectors generated from the Python side.
 *
 * Definitions, mirroring the Python exactly:
 *   level   OB if wt1 >= 53, OS if wt1 <= -53, else mid
 *   form    from wt1 now / 5 bars back / 10 bars back:
 *             early = wt1[-5] - wt1[-10],  late = wt1[0] - wt1[-5]
 *             early<0 & late>0 -> 'Vup'   (turning up)
 *             early>0 & late<0 -> 'Vdn'   (turning down)
 *             late >= 0        -> 'rise'
 *             otherwise        -> 'fall'
 *   code    `${level}/${form}`
 *
 * ── CAUSALITY ───────────────────────────────────────────────────────────────
 * Each timeframe is read at its own LAST CLOSED bar. A forming bar is never
 * used: its high/low/close are still moving, so including it would make the
 * live read depend on information the historical panel never had at that point.
 * `dropForming` is on by default and callers should leave it on.
 *
 * WaveTrend params are the operator's TradingView setup (9/12/3), matching
 * `vumanchuLab` and `js/vumanchuChart.js` — NOT the vumanchuCore library
 * defaults (10/21/4), which would key into a different table entirely.
 *
 * Pure — no network, no DOM. Bars in, state out.
 */
import { computeWaveTrend } from './vumanchuCore.js';

// The operator's WaveTrend. Changing these invalidates the frozen table.
export const STATE_WT = { n1: 9, n2: 12, sp: 3 };

// Zone bands, matching `vumanchuLab/panel.py` OB/OS.
export const OB_LEVEL = 53;
export const OS_LEVEL = -53;

// Lookback for the `form` read, matching `shapes.py` FORM_LAG.
export const FORM_LAG = 10;

// Minimum bars before a timeframe's WaveTrend is trustworthy (EMA seeding).
export const MIN_BARS = 60;

/** OB / mid / OS for a WaveTrend value. */
export function zoneOf(wt1) {
  if (!Number.isFinite(wt1)) return null;
  return wt1 >= OB_LEVEL ? 'OB' : wt1 <= OS_LEVEL ? 'OS' : 'mid';
}

/**
 * `rise | fall | Vup | Vdn` from the last `FORM_LAG` bars of a WT series.
 * Returns null when there is not enough history — never a guess, because a
 * wrong form silently keys into the wrong cell.
 */
export function formOf(wt1Series, lag = FORM_LAG) {
  const n = wt1Series?.length ?? 0;
  if (n < lag + 1) return null;
  const now  = wt1Series[n - 1];
  const half = wt1Series[n - 1 - Math.floor(lag / 2)];
  const far  = wt1Series[n - 1 - lag];
  if (![now, half, far].every(Number.isFinite)) return null;
  const early = half - far;
  const late  = now - half;
  if (early < 0 && late > 0) return 'Vup';
  if (early > 0 && late < 0) return 'Vdn';
  return late >= 0 ? 'rise' : 'fall';
}

/**
 * Resample M1 bars to `minutes`, left-labelled/left-closed so a bar stamped t
 * covers [t, t+tf) — the same convention `panel.py::resample` uses, so the
 * higher-timeframe reads line up bar-for-bar with the offline panel.
 *
 * `dropForming` removes the final bucket unless it is provably complete, which
 * is the live-vs-backtest difference that would otherwise poison every read.
 */
export function resampleBars(bars, minutes, { dropForming = true, nowSec = null } = {}) {
  if (minutes <= 1) return bars.slice();
  const sec = minutes * 60;
  const out = [];
  let cur = null;
  for (const b of bars) {
    const t = barSeconds(b);
    if (t == null) continue;
    const bucket = Math.floor(t / sec) * sec;
    if (!cur || cur.t !== bucket) {
      if (cur) out.push(cur);
      cur = { t: bucket, open: b.open, high: b.high, low: b.low, close: b.close,
              volume: b.volume ?? 0 };
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume ?? 0;
    }
  }
  if (cur) out.push(cur);
  if (dropForming && out.length) {
    const last = out[out.length - 1];
    const closesAt = last.t + sec;
    const now = nowSec ?? Math.floor(Date.now() / 1000);
    if (now < closesAt) out.pop();      // still forming — not knowable yet
  }
  return out;
}

function barSeconds(b) {
  if (b == null) return null;
  if (typeof b.t === 'number') return b.t > 1e11 ? Math.floor(b.t / 1000) : b.t;
  const s = b.time ?? b.datetime;
  if (s == null) return null;
  const v = Date.parse(String(s).replace(' ', 'T') + (/[Zz+]/.test(String(s)) ? '' : 'Z'));
  return Number.isFinite(v) ? Math.floor(v / 1000) : null;
}

/**
 * The full multi-timeframe state from one array of M1 bars.
 *
 * Returns per-timeframe `{ wt1, wt2, level, form, code }` plus the derived
 * stack reads the frozen table is keyed on. `timeframes` must match the table's
 * (1/5/15) or the keys will not resolve.
 */
export function computeState(m1Bars, { timeframes = [1, 5, 15], nowSec = null,
                                       dropForming = true } = {}) {
  const per = {};
  const warnings = [];
  for (const tf of timeframes) {
    const bars = resampleBars(m1Bars, tf, { dropForming, nowSec });
    if (bars.length < MIN_BARS) {
      per[tf] = { bars: bars.length, level: null, form: null, code: null };
      warnings.push(`tf${tf}: only ${bars.length} closed bars (need >= ${MIN_BARS})`);
      continue;
    }
    const { wt1, wt2 } = computeWaveTrend(bars, STATE_WT);
    const last = wt1[wt1.length - 1];
    const level = zoneOf(last);
    const form = formOf(wt1);
    per[tf] = {
      bars: bars.length,
      barTime: bars[bars.length - 1].t ?? null,
      wt1: Number.isFinite(last) ? +last.toFixed(3) : null,
      wt2: Number.isFinite(wt2[wt2.length - 1]) ? +wt2[wt2.length - 1].toFixed(3) : null,
      level, form,
      code: level && form ? `${level}/${form}` : null,
    };
  }

  const levels = timeframes.map(tf => per[tf].level);
  const complete = levels.every(Boolean);
  // stackZone: +1 all overbought, -1 all oversold, 0 anything else.
  // This is the cell the lab found carries the signal; `0` is ~67% of bars and
  // is a genuine "no read", not a weak read.
  const stackZone = !complete ? null
    : levels.every(l => l === 'OB') ? 1
    : levels.every(l => l === 'OS') ? -1 : 0;

  return {
    timeframes, per, warnings,
    stackZone,
    aligned: stackZone === 1 ? 'OB' : stackZone === -1 ? 'OS' : null,
    // The keys the frozen table is indexed by, tightest first. `null` entries
    // are skipped by the lookup, which then falls back to a coarser level.
    keys: {
      L1: complete && timeframes.every(tf => per[tf].code)
        ? timeframes.map(tf => per[tf].code).join('|') : null,
      L2: complete ? levels.join('|') : null,
      L3: per[timeframes[0]].level && per[timeframes[timeframes.length - 1]].level
        ? `${per[timeframes[0]].level}|${per[timeframes[timeframes.length - 1]].level}` : null,
      L4: per[timeframes[0]].level ?? null,
    },
  };
}

/**
 * Look a state up in the frozen table, walking levels tightest-first and
 * REPORTING which one matched.
 *
 * A number from L4 with n=50,000 and one from L1 with n=90 are different
 * objects; the caller must be able to tell them apart, so `level` and `n` are
 * always returned alongside the probability.
 */
export function lookupState(state, table, { instrument, horizon = 60, minN = 300 } = {}) {
  const inst = table?.instruments?.[instrument];
  const block = inst?.[String(horizon)];
  if (!block) return { matched: null, reason: `no table for ${instrument} @ ${horizon}m` };

  for (const id of ['L1', 'L2', 'L3', 'L4']) {
    const key = state.keys[id];
    if (!key) continue;
    const rows = block.levels?.[id];
    if (!rows) continue;
    const hit = rows.find(r => r.cell === key);
    if (hit && hit.n >= minN) {
      return {
        matched: id, cell: key, n: hit.n,
        pRevert: hit.p_revert, baseline: hit.baseline, deltaPP: hit.delta_pp,
        years: hit.years, yearsSameSign: hit.years_same_sign,
        yearMinPP: hit.year_min_pp, yearMaxPP: hit.year_max_pp,
        uncond: block.uncond_p_revert,
      };
    }
  }
  return { matched: null, reason: 'no cell met the sample floor', uncond: block.uncond_p_revert };
}

/**
 * Turn a lookup into the three fields the UI and the logger both consume.
 *
 * `read` is deliberately trinary and deliberately biased toward NONE. The lab's
 * most reliable finding is that ~2/3 of bars carry no signal, so a surface that
 * always produces an opinion would misrepresent the engine.
 */
export function interpret(state, hit, { minDeltaPP = 0.5, minStability = 0.6 } = {}) {
  if (!hit || hit.matched == null) {
    return { read: 'NONE', why: hit?.reason || 'no match', ...hit };
  }
  const d = hit.deltaPP;
  if (!Number.isFinite(d) || Math.abs(d) < minDeltaPP) {
    return { read: 'NONE', why: `delta ${d?.toFixed?.(2) ?? '?'}pp is inside the noise band`, ...hit };
  }
  // STABILITY GATE. The lab's central caveat is that the SIGN of these effects
  // is durable while the MAGNITUDE is regime-dependent — so a big delta from a
  // cell whose sign flipped in half the years is noise wearing a large number.
  // Without this, the tight shape cells (n in the hundreds) produce confident,
  // contradictory reads: `mid|OB|mid` scored FOLLOW at −2.49pp (n=1668, 5/6
  // years) and FADE at +4.27pp (n=345, 2/5 years) thirty minutes apart, from
  // the same zone state. Requiring the sign to have held in most years removes
  // exactly those and restores the ~2/3 "no read" rate the lab measured.
  if (Number.isFinite(hit.years) && hit.years >= 3) {
    const stability = (hit.yearsSameSign ?? 0) / hit.years;
    if (stability < minStability) {
      return {
        read: 'NONE',
        why: `sign held in only ${hit.yearsSameSign}/${hit.years} years — not stable enough to read`,
        ...hit,
      };
    }
  }
  // delta > 0 means price REVERTED its prior move more often than a matched
  // bar. The stack tells you which way the prior move was stretched.
  return {
    read: d > 0 ? 'FADE' : 'FOLLOW',
    why: d > 0
      ? `reverts ${d.toFixed(2)}pp more often than a matched bar`
      : `continues ${Math.abs(d).toFixed(2)}pp more often than a matched bar`,
    ...hit,
  };
}
