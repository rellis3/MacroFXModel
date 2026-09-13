// Daily-Open research (DailyOpenResearch/, PR #1440) → the STANDARD votetrades
// pipeline. The Python suite found exactly one cell with a stable, positive
// GROSS edge above its random-walk null: an impulse leg (>=0.12x trailing
// ADR, formed within 4h of the session open) whose pullback reaches 61.8% or
// 78.6% depth, entered there with the stop at the leg's own origin and the
// target at the 1.618 extension. This script re-walks that exact rule
// causally over the SAME M1 parquet DailyOpenResearch/data.py reads
// (VolRangeForecaster/data/m1/, via loadM1ForPair — one source of truth), but
// prices it with the house cost model (costForPair) instead of the flat
// round-trip constants the Python sims used, and persists trades in the
// SAME shape every other book in this repo uses (build_p90_votetrades.mjs's
// trade fields) so it drops straight into buildPortfolioDailySeries /
// riskAdjustTrades / portfolioStats and the leave-one-out tooling with zero
// new trade-shape handling.
//
// Day anchor: bucketM1IntoSessions(packed, 22) — the fixed 22:00 UTC boundary
// this codebase already calls "the NY/OANDA broker day" (js/forecastAnalyser.js).
// DailyOpenResearch/data.py's own anchor-comparison (section 1 of every
// REPORT.md) found this within noise of the DST-aware 17:00 NY anchor the
// Python suite used, so reusing the shared bucketer (rather than re-deriving
// a DST-aware NY key here) costs no accuracy and matches the house convention.
//
// OOS-only persistence, splitAt 60/40 by date — the SAME convention
// build_p90_votetrades.mjs and every level-atlas book already use, not a new
// lookahead-prone rule of its own.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { bucketM1IntoSessions } from '../js/forecastAnalyser.js';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { pipSize } from '../js/instrumentRegistry.js';
import { splitAt } from '../js/levelAtlasReport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_SUFFIX = process.env.DO_OUT_SUFFIX ? `-${process.env.DO_OUT_SUFFIX}` : '';
const APPLY_COST = process.env.DO_APPLY_COST !== '0';
const OUT_DIR = path.join(__dirname, '..', 'analysis', 'output', `daily-open-vote-trades${OUT_SUFFIX}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

const PAIRS = process.env.DO_PAIRS ? process.env.DO_PAIRS.split(',') : ['gold', 'nq', 'eurusd'];
const THETA_ADR = 0.12;          // same leg-size floor DailyOpenResearch/studies_fib.py used
const MAX_OPEN_MIN = 240;        // leg must become drawable within 4h of the session open
const MAX_FOLLOW_MIN = 600;      // same resolution horizon fib_study.py used
// The two cells DailyOpenResearch/FINDINGS.md #5 flagged as gross-positive:
// depth 0.618 (small edge on gold/NQ) and depth 0.786 (gold's best single fib
// cell, gross +0.11R, t=4.08) — both stop-at-origin, target the 1.618
// extension MEASURED FROM p1 (the leg's own extreme), not from the origin —
// p1 + sgn*0.618*leg, exactly buildBarrierTrades'-style "extension beyond the
// rung." Kept as separate rungs (p90votetrades.js's own convention for a
// second stop-fit) so either can be dropped without touching the other.
const RUNGS = [
  { rung: 'fib618', depth: 0.618, stopDepth: 1.0, extBeyond: 0.618 },
  { rung: 'fib786', depth: 0.786, stopDepth: 1.0, extBeyond: 0.618 },
];

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// First index k (>= from) with ms[k] > limit, or arr.length if none — a plain
// scan, not a clever one-liner, so the day-end/horizon fallback can't be
// silently wrong.
function firstIndexPast(ms, from, limit) {
  for (let k = from; k < ms.length; k++) if (ms[k] > limit) return k;
  return ms.length;
}

// Causal ATR-threshold zigzag + "drawable" event walk — a direct JS port of
// DailyOpenResearch/studies_fib.py's fib_events(): a leg opens the FIRST time
// price gives back >=23.6% of a confirmed >=theta swing, and nothing past
// that opening bar is used to define it.
function fibEvents(h, l, theta, maxOpenIdx) {
  const ev = [];
  const n = h.length;
  let dir = 0, extH = h[0], extL = l[0], ih = 0, il = 0, pivI = 0, pivP = null, armed = true;
  for (let k = 1; k < n; k++) {
    if (dir === 0) {
      if (h[k] > extH) { extH = h[k]; ih = k; }
      if (l[k] < extL) { extL = l[k]; il = k; }
      if (h[k] - extL >= theta) { dir = 1; pivI = il; pivP = extL; extH = h[k]; ih = k; armed = true; }
      else if (extH - l[k] >= theta) { dir = -1; pivI = ih; pivP = extH; extL = l[k]; il = k; armed = true; }
      continue;
    }
    if (dir === 1) {
      if (h[k] > extH) { extH = h[k]; ih = k; armed = true; }
      const leg = extH - pivP;
      if (armed && leg >= theta && (extH - l[k]) >= 0.236 * leg && k <= maxOpenIdx && ih < k) {
        ev.push({ i0: pivI, p0: pivP, i1: ih, p1: extH, up: true, kOpen: k }); armed = false;
      }
      if (extH - l[k] >= theta) { dir = -1; pivI = ih; pivP = extH; extL = l[k]; il = k; armed = true; }
    } else {
      if (l[k] < extL) { extL = l[k]; il = k; armed = true; }
      const leg = pivP - extL;
      if (armed && leg >= theta && (h[k] - extL) >= 0.236 * leg && k <= maxOpenIdx && il < k) {
        ev.push({ i0: pivI, p0: pivP, i1: il, p1: extL, up: false, kOpen: k }); armed = false;
      }
      if (h[k] - extL >= theta) { dir = 1; pivI = il; pivP = extL; extH = h[k]; ih = k; armed = true; }
    }
  }
  return ev;
}

async function buildPair(pair) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.log(`${pair}: no M1 data, skipping`); return null; }
  const sessions = bucketM1IntoSessions(packed, 22);
  const dates = [...sessions.keys()].sort().filter(d => (sessions.get(d)?.length ?? 0) >= 600);
  const cost = APPLY_COST ? costForPair(pair, assetClassFor(pair)) : 0;   // % of price, round-trip (0 = gross/no-cost comparison run)
  const pip = pipSize(pair) || 1;

  // trailing ADR20 (median of the PRIOR 20 sessions' range) — strictly causal.
  const ranges = dates.map(d => {
    const bars = sessions.get(d);
    let hi = -Infinity, lo = Infinity;
    for (const b of bars) { if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
    return hi - lo;
  });

  const trades = [];
  for (let di = 20; di < dates.length; di++) {
    const adr = median(ranges.slice(di - 20, di));
    if (!(adr > 0)) continue;
    const bars = sessions.get(dates[di]);
    const n = bars.length;
    const h = new Float64Array(n), l = new Float64Array(n), c = new Float64Array(n), ms = new Int32Array(n);
    const t0 = bars[0].time;
    for (let k = 0; k < n; k++) { h[k] = bars[k].high; l[k] = bars[k].low; c[k] = bars[k].close; ms[k] = Math.round((bars[k].time - t0) / 60); }

    const theta = THETA_ADR * adr;
    const maxOpenIdx = firstIndexPast(ms, 0, MAX_OPEN_MIN) - 1;   // last bar within the 4h drawable window
    if (maxOpenIdx < 2) continue;
    const events = fibEvents(h, l, theta, maxOpenIdx);
    // One signal per day per rung — the SAME "first leg of day only" cut
    // DailyOpenResearch/FINDINGS.md #5 already validated separately (similar
    // continuation rate to the pooled numbers), and the house convention
    // every live-sized book in this repo enforces its own way
    // (backtestSystem/config.py's levelReentry/tradeCooldownMins). Without
    // it a single volatile session can throw dozens of these tiny-leg
    // signals back-to-back, each priced as an independent 1%-risk trade —
    // a real overtrading bug, not a finding (one such day: 66 fires,
    // -35% that day alone). The research question ("does the PATTERN
    // repeat") tolerates that; a backtest that prices each fire as a real
    // trade does not.
    const firedRung = new Set();

    for (const ev of events) {
      const leg = Math.abs(ev.p1 - ev.p0);
      if (!(leg > 0)) continue;
      const sgn = ev.up ? 1 : -1;
      const kEnd = firstIndexPast(ms, ev.kOpen, ms[ev.kOpen] + MAX_FOLLOW_MIN);   // exclusive upper bound

      for (const { rung, depth, stopDepth, extBeyond } of RUNGS) {
        if (firedRung.has(rung)) continue;
        const entryPx = ev.p1 - sgn * depth * leg;
        const stopPx = ev.p1 - sgn * stopDepth * leg;             // stopDepth=1.0 → exactly the leg's own origin p0
        const targetPx = ev.p1 + sgn * extBeyond * leg;            // extension BEYOND p1, e.g. the 1.618 rung
        const risk = Math.abs(stopPx - entryPx);
        if (!(risk > 0)) continue;

        // first bar (after the leg's own extreme) whose range reaches this
        // depth, causal — a bar that has already gone beyond p1 again can't
        // retroactively "fill" this depth (that would be the NEXT leg's
        // pullback). The 600-min horizon gates ONLY this fill, matching
        // fib_study.py's own `hit[0] > end: continue` guard.
        let kFill = -1;
        for (let k = ev.i1 + 1; k < kEnd; k++) {
          const beyond = ev.up ? h[k] > ev.p1 : l[k] < ev.p1;
          if (beyond) break;
          const depthAtK = ev.up ? (ev.p1 - l[k]) / leg : (h[k] - ev.p1) / leg;
          if (depthAtK >= depth) { kFill = k; break; }
        }
        if (kFill < 0 || kFill >= n - 1) continue;   // no room left in the day to resolve a fill this late

        // race stop vs target from the bar AFTER fill to the END OF THE DAY —
        // fib_study.py's sims are NOT re-bounded by the 600-min horizon once
        // filled (`hh = h[k_open+e+1:]` runs to day-end unbounded); only the
        // fill itself was gated by the horizon, above. A same-bar tie goes to
        // the target — the same "continuation wins" tie-break fib_study.py uses.
        let exitPx, exitK = -1;
        for (let k = kFill + 1; k < n; k++) {
          const hitTarget = ev.up ? h[k] >= targetPx : l[k] <= targetPx;
          const hitStop = ev.up ? l[k] <= stopPx : h[k] >= stopPx;
          if (hitTarget) { exitPx = targetPx; exitK = k; break; }
          if (hitStop) { exitPx = stopPx; exitK = k; break; }
        }
        if (exitK < 0) { exitK = n - 1; exitPx = c[exitK]; }        // unresolved by day end → mark to last close

        const signedMove = (exitPx - entryPx) * sgn;               // >0 = profit, in price units
        const win = signedMove > 0;
        const targetPips = Math.abs(targetPx - entryPx) / pip;
        const stopPips = Math.abs(stopPx - entryPx) / pip;
        const grossPct = signedMove / entryPx * 100;

        firedRung.add(rung);
        trades.push({
          instrument: pair, date: dates[di], time: t0 + ms[kFill] * 60, resolveTime: t0 + ms[exitK] * 60,
          side: ev.up ? 'long' : 'short', rung, session: null, entry: +entryPx.toFixed(6), pip,
          decision: 'follow', margin: depth,
          targetPips: +targetPips.toFixed(2), stopPips: +stopPips.toFixed(2),
          mfePips: null, maePips: null,
          win, pnlPct: +(grossPct - cost).toFixed(4),
        });
      }
    }
  }

  const { split, is: isT, oos: oosT } = splitAt(trades, 0.6);
  const out = { instrument: pair, splitDate: split, cost, rungs: RUNGS.map(r => r.rung), generatedAt: new Date().toISOString(), trades: oosT };
  fs.writeFileSync(path.join(OUT_DIR, `${pair}-votetrades.json`), JSON.stringify(out));
  const isWin = isT.length ? +(100 * isT.filter(t => t.win).length / isT.length).toFixed(1) : null;
  const oosWin = oosT.length ? +(100 * oosT.filter(t => t.win).length / oosT.length).toFixed(1) : null;
  console.log(`${pair}: cost=${cost}%  split=${split}  IS ${isT.length} trades (win ${isWin}%)  OOS ${oosT.length} trades (win ${oosWin}%) persisted`);
  return out;
}

for (const pair of PAIRS) {
  try { await buildPair(pair); } catch (e) { console.log(`${pair}: FAILED — ${e.message}\n${e.stack}`); }
}
console.log(`\nWrote votetrades to ${OUT_DIR}`);
