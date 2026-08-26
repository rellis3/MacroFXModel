/**
 * VMC Triple-Timeframe Circle Engine (v1) — tests the trading-group pattern
 * from the owner's screenshots (`MD files/VMC_TRIPLE_TF_FINDINGS.md`): the
 * VuManChu Cipher B "buy circle" printed on 1m, 3m AND 5m together → buy;
 * mirrored for sells.
 *
 * Follow-up to `vumanchuLab/` (which mapped the zone/stack/shape terrain at
 * 1/5/15m — all-TF-oversold real but sub-cost; cross-mode MTF below chance;
 * Money Flow adds nothing, so it is deliberately NOT a condition here). The
 * genuinely untested piece is the circle EVENT (cross while beyond the band)
 * aligning across 1/3/5m — zone × event intersected.
 *
 * ── PINNED CALLS (minimal-DOF) ──────────────────────────────────────────────
 *   • Circle = on a CLOSED TF bar, WT1 crosses WT2 while WT2 is beyond ±53
 *     (classic Cipher B buy/sell circle; operator params 9/12/3 — the repo's
 *     standard, see vumanchuChart.js).
 *   • A circle stays "active" for 15 minutes after its TF bar CLOSES.
 *   • Episode = the first minute all three TFs are simultaneously active
 *     (rising edge). Entry at the NEXT M1 bar's open.
 *   • Trade: SL 1.5×ATR(15m), time exit 60 min mark-to-close, no target;
 *     non-overlapping (a signal during an open trade is an event, not a
 *     trade). Costs on.
 *
 * ── NO-LOOKAHEAD CONTRACT ───────────────────────────────────────────────────
 * A TF bar's WT values exist only from that bar's CLOSE (bar.time + tf·60);
 * activation, alignment, and entry all sit at/after that instant. ATR is
 * built from bars strictly before entry. Causality-tested in
 * vmcTripleTfEntryV1Engine.test.mjs.
 *
 * ── COMPOSES ────────────────────────────────────────────────────────────────
 * `computeWaveTrend` (vumanchuCore — never a WT copy), `extractBars`/
 * `resampleTo`/`bisect` (barUtils), `causalAtr` (vwapImpulseEntryV1Engine),
 * `walkBars` (forecastCore), `summarizeSplit` at the runner.
 *
 * Contract (pure): runVmcTripleTf(packed, cfg)
 *   -> { events: {buy:[],sell:[]}, records: {buy:[],sell:[]}, trades: {buy:[],sell:[]}, meta }
 */

import { computeWaveTrend } from './vumanchuCore.js';
import { extractBars, resampleTo, bisect } from './barUtils.js';
import { causalAtr } from './vwapImpulseEntryV1Engine.js';
import { walkBars } from './forecastCore.js';

const DAY = 86400;
const isoDay = e => new Date(e * 1000).toISOString().slice(0, 10);

export const DEFAULT_CFG = {
  tfs: [1, 3, 5],
  wt: { n1: 9, n2: 12, sp: 3 },     // the operator's Cipher B params
  obLevel: 53, osLevel: -53,        // the drawn bands (vumanchuChart standard)
  activeMins: 15,                   // circle stays active this long after its bar closes
  horizonsMin: [15, 30, 60, 120],   // event-study forward windows
  atrTfMin: 15, atrPeriod: 14, slAtrMult: 1.5, ctxLookbackDays: 2,
  timeExitMin: 60,
  costPct: 0.020,                   // commodity; pass 0.012 for FX
};

// All circle close-times per TF per side, causal by construction. Exported
// for unit tests (crafted paths) and any future viewer.
export function circleTimes(packed, tfMin, cfg = DEFAULT_CFG) {
  const raw = extractBars(packed, packed.times[0], packed.times[packed.n - 1] + 1);
  const bars = tfMin === 1 ? raw : resampleTo(raw, tfMin);
  const { wt1, wt2 } = computeWaveTrend(bars, cfg.wt);
  const buy = [], sell = [];
  for (let i = 1; i < bars.length; i++) {
    const closeT = bars[i].time + tfMin * 60;
    if (wt1[i] > wt2[i] && wt1[i - 1] <= wt2[i - 1] && wt2[i] <= cfg.osLevel) buy.push(closeT);
    if (wt1[i] < wt2[i] && wt1[i - 1] >= wt2[i - 1] && wt2[i] >= cfg.obLevel) sell.push(closeT);
  }
  return { buy, sell };
}

// Pure alignment scan: given each TF's sorted circle close-times, return the
// M1 bar indices where all lists are simultaneously active (rising edges
// only). Exported so the alignment logic is unit-testable with hand-built
// lists, independent of WaveTrend's nonlinearity.
export function alignmentEpisodes(lists, times, activeMins) {
  const ptr = lists.map(() => 0);
  const out = [];
  let prevAll = false;
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    let all = lists.length > 0;
    for (let k = 0; k < lists.length; k++) {
      const L = lists[k];
      while (ptr[k] < L.length - 1 && L[ptr[k] + 1] <= t) ptr[k]++;
      const ct = L[ptr[k]];
      if (!(ct != null && ct <= t && t < ct + activeMins * 60)) { all = false; break; }
    }
    if (all && !prevAll) out.push(i);
    prevAll = all;
  }
  return out;
}

export function runVmcTripleTf(packed, cfg = {}) {
  const c = { ...DEFAULT_CFG, ...cfg };
  if (!packed?.n) return { events: { buy: [], sell: [] }, records: { buy: [], sell: [] }, trades: { buy: [], sell: [] }, meta: { note: 'no data' } };

  const circles = c.tfs.map(tf => circleTimes(packed, tf, c));

  const events = { buy: [], sell: [] }, records = { buy: [], sell: [] }, trades = { buy: [], sell: [] };
  const counts = { buy: circles.map(x => x.buy.length), sell: circles.map(x => x.sell.length) };

  for (const side of ['buy', 'sell']) {
    const isBuy = side === 'buy';
    const lists = circles.map(x => x[side]);
    let lastExit = -Infinity;

    for (const i of alignmentEpisodes(lists, packed.times, c.activeMins)) {
      {
        // Rising edge: episode. Enter at the NEXT M1 bar's open.
        if (i + 1 < packed.n) {
          const entryIdx = i + 1;
          const entry = packed.opens[entryIdx];
          const entryT = packed.times[entryIdx];

          // Event study: oriented forward returns at each horizon (M1 closes).
          const fwd = {};
          for (const h of c.horizonsMin) {
            const j = bisect(packed.times, entryT + h * 60 + 1) - 1;
            fwd[`h${h}`] = j > entryIdx ? +(((packed.closes[j] - entry) * (isBuy ? 1 : -1)) / entry * 100).toFixed(5) : null;
          }
          events[side].push({ date: isoDay(entryT), entryT, entry: +entry.toFixed(5), ...fwd });

          // Trade: non-overlapping, SL 1.5×ATR15, 60-min mark-to-close.
          if (entryT >= lastExit) {
            const dayStart = entryT - (entryT % DAY);
            const atr = causalAtr(packed, dayStart, entryT, c);
            if (atr) {
              const sl = isBuy ? entry - c.slAtrMult * atr : entry + c.slAtrMult * atr;
              const tp = isBuy ? Infinity : -Infinity;
              const endIdx = Math.min(packed.n, entryIdx + c.timeExitMin);
              const win = [];
              for (let m = entryIdx; m < endIdx; m++) {
                win.push({ time: packed.times[m], open: packed.opens[m], high: packed.highs[m],
                           low: packed.lows[m], close: packed.closes[m] });
              }
              const r = win.length ? walkBars(win, entry, tp, sl, isBuy, 'stop', entry) : null;
              if (r?.filled) {
                lastExit = r.exitTime ?? win[win.length - 1].time;
                const net = +(r.pnlPct - c.costPct).toFixed(5);
                records[side].push({ date: isoDay(entryT), filled: true, pnl_pct: net });
                trades[side].push({ date: isoDay(entryT), side: side.toUpperCase(),
                  entry: +entry.toFixed(5), sl: +sl.toFixed(5), outcome: r.outcome,
                  netPct: net, fillTime: r.fillTime, exitTime: r.exitTime });
              }
            }
          }
        }
      }
    }
  }

  return { events, records, trades,
           meta: { circleCounts: counts, cfg: { tfs: c.tfs, activeMins: c.activeMins, osLevel: c.osLevel, obLevel: c.obLevel } } };
}
