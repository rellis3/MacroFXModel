// Line Touch CONTROL Study — 2026-09-10
//
// analysis/line_touch_response_report.mjs found the one positive result in this
// whole line of research: MFE - |MAE| in the continuation direction is positive
// for every line family and RISES MONOTONICALLY with rung depth (open-anchored
// ladder: +0.005 / +0.010 / +0.027 for p50/p75/p90, t ~ 3 on 17 instruments).
//
// That pattern has an innocent explanation which the response study cannot rule
// out on its own. Deep rungs are only reached on strongly directional days, and
// the SIDE of a touch is endogenous to that: a day that trends up generates
// mostly up-side touches. If intraday direction persists even weakly, then
// "touch the p90 and measure forward in the touch's own direction" inherits the
// day's character and shows a positive asymmetry with no help from the line at
// all. The tell is already visible -- EVERY family is positive, including the
// shallow ones nobody claims are special.
//
// So this measures the same quantity at points that are NOT line touches, and
// pairs each control with the touch it stands in for. Two controls, because
// there are two different questions:
//
//   A  RANDOM-TIME       a bar from a DIFFERENT randomly chosen session of the
//      (different day)   same instrument, matched on minutes-left-in-session
//                        (so runway and time-of-day are held fixed) and given
//                        the SAME side label as its touch.
//                        Asks: would a random moment have done as well?
//                        If A matches the touches, the lines carry nothing.
//
//   B  SAME-DAY          a random OTHER bar from the SAME session, same side,
//      (different time)  runway-matched loosely and kept >=15 min from the real
//                        touch so the forward paths are not the same window.
//                        Asks: is it the LINE or just the DAY?
//                        If B matches the touches, the day's direction is the
//                        signal and the line is only how you noticed it.
//
// Both are PAIRED: every control is tied to one touch, and the statistic is the
// mean of (touch edge - control edge) with a paired t-stat. Pairing removes the
// day-to-day and instrument-to-instrument variance that would otherwise swamp an
// effect this small, and it is the reason this can resolve a +0.02 difference at
// all. Distances are normalised by each point's OWN day's ex-ante expected range
// before differencing, so A never compares a quiet day against a wild one.
//
// Reads the touch list from analysis/output/line-touch-response/{pair}-response.json
// (so touch detection is not re-implemented and cannot drift) and re-walks M1 only
// to measure the control points.
//
//   node analysis/line_touch_control_study.mjs
//   LA_PAIRS=eurusd,gold node analysis/line_touch_control_study.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { bucketM1IntoSessions } from '../js/forecastAnalyser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESP_DIR = path.join(__dirname, 'output', 'line-touch-response');
const OUT_DIR = path.join(__dirname, 'output', 'line-touch-control');

const RUNWAY_TOL_A = 30;    // minutes; different-day control must match runway this closely
const RUNWAY_TOL_B = 120;   // same-day control: looser, or there is nowhere in the day to go
const MIN_GAP_B = 15;       // minutes; keep the same-day control away from the touch itself

const ALL_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const PAIRS = process.env.LA_PAIRS
  ? process.env.LA_PAIRS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  : ALL_PAIRS;

// Deterministic RNG — a control study that reshuffles its own answer on every
// run is not a control. Seeded per pair so results are reproducible.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rest-of-session MFE and MAE from bar k, signed so positive = the `dir` way. */
function excursion(bars, k, dir) {
  const n = bars.length;
  if (k + 1 >= n) return null;
  const entry = bars[k].close;
  if (!(entry > 0)) return null;
  let hi = -Infinity, lo = Infinity;
  for (let j = k + 1; j < n; j++) {
    const b = bars[j];
    const a = (b.high - entry) * dir, c = (b.low - entry) * dir;
    const fav = Math.max(a, c), adv = Math.min(a, c);
    if (fav > hi) hi = fav;
    if (adv < lo) lo = adv;
  }
  return Number.isFinite(hi) && Number.isFinite(lo) ? { mfe: hi, mae: lo } : null;
}

// Paired accumulator: mean and t-stat of (touch - control) without holding
// every difference in memory.
function acc() { return { n: 0, s: 0, ss: 0, tMfe: 0, tMae: 0, cMfe: 0, cMae: 0, pos: 0 }; }
// `pos` = where the control ENTERED relative to the touch, signed the trade's
// way and in expected-day-ranges. A touch sits at a local extreme in the
// continuation direction by definition, so a control drawn at a nearby time is
// usually BEHIND it (pos < 0) and therefore has more room left to run -- a
// structural advantage that has nothing to do with the line. Recording it makes
// that visible instead of leaving it as an assumption about why B looks the way
// it does.
function push(a, d, tM, tA, cM, cA, pos) { a.n++; a.s += d; a.ss += d * d; a.tMfe += tM; a.tMae += tA; a.cMfe += cM; a.cMae += cA; a.pos += (pos ?? 0); }
function stats(a) {
  if (a.n < 3) return null;
  const m = a.s / a.n;
  const v = (a.ss - a.n * m * m) / (a.n - 1);
  const sd = Math.sqrt(Math.max(0, v));
  return {
    n: a.n, meanDiff: m, t: sd > 0 ? m / (sd / Math.sqrt(a.n)) : null,
    touchEdge: (a.tMfe - a.tMae) / a.n, controlEdge: (a.cMfe - a.cMae) / a.n,
    touchMfe: a.tMfe / a.n, touchMae: a.tMae / a.n, controlMfe: a.cMfe / a.n, controlMae: a.cMae / a.n,
    controlEntryOffset: a.pos / a.n,
  };
}

async function processPair(pair) {
  const respPath = path.join(RESP_DIR, `${pair}-response.json`);
  if (!fs.existsSync(respPath)) { console.log('  no response file, skipping'); return null; }
  const resp = JSON.parse(fs.readFileSync(respPath, 'utf8'));

  let packed;
  try { packed = await loadM1ForPair(pair); } catch (e) { console.log(`  M1 load failed: ${e.message}`); return null; }
  if (!packed?.n) { console.log('  no M1 data, skipping'); return null; }
  const sessions = bucketM1IntoSessions(packed, 'Europe/London');

  // Only days the response study actually kept, so the control draws from the
  // identical universe (same warmup cut, same sigma-validity filter).
  const days = resp.days.filter(d => d.dayScale > 0 && sessions.has(d.date));
  const byDate = new Map(days.map(d => [d.date, d]));
  const dateList = days.map(d => d.date);
  if (dateList.length < 20) { console.log('  too few days, skipping'); return null; }

  const rng = mulberry32(0x5eed ^ [...pair].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7));
  const A = {}, B = {};   // per family

  for (const day of days) {
    const bars = sessions.get(day.date);
    const n = bars.length;
    if (n < 60) continue;
    const endT = bars[n - 1].time;

    for (const t of day.touches) {
      if (t.maxExt == null || t.maxAdv == null) continue;
      const dir = t.side === 'up' ? 1 : -1;
      const touchMfe = t.maxExt / day.dayScale;
      const touchMae = Math.abs(t.maxAdv) / day.dayScale;
      const fam = t.family;

      // ── Control A — different day, runway-matched ──────────────────────────
      for (let attempt = 0; attempt < 12; attempt++) {
        const d2 = byDate.get(dateList[(rng() * dateList.length) | 0]);
        if (!d2 || d2.date === day.date) continue;
        const b2 = sessions.get(d2.date);
        if (!b2 || b2.length < 60) continue;
        const end2 = b2[b2.length - 1].time;
        // pick the bar whose minutes-left best matches this touch's
        const wantT = end2 - t.minsLeft * 60;
        let k = -1, best = Infinity;
        // bars are minute-spaced; a linear probe from a proportional guess is
        // plenty and avoids a full scan per control point
        const guess = Math.max(0, Math.min(b2.length - 2, Math.round((wantT - b2[0].time) / 60)));
        for (let j = Math.max(0, guess - 90); j < Math.min(b2.length - 1, guess + 90); j++) {
          const diff = Math.abs(b2[j].time - wantT);
          if (diff < best) { best = diff; k = j; }
        }
        if (k < 0 || best > RUNWAY_TOL_A * 60) continue;
        const e = excursion(b2, k, dir);
        if (!e) continue;
        const cM = e.mfe / d2.dayScale, cA = Math.abs(e.mae) / d2.dayScale;
        (A[fam] ??= acc());
        push(A[fam], (touchMfe - touchMae) - (cM - cA), touchMfe, touchMae, cM, cA, null);
        break;
      }

      // ── Control B — same day, different time ──────────────────────────────
      for (let attempt = 0; attempt < 12; attempt++) {
        const k = (rng() * (n - 1)) | 0;
        if (Math.abs(bars[k].time - t.t) < MIN_GAP_B * 60) continue;
        const mlLeft = Math.round((endT - bars[k].time) / 60);
        if (Math.abs(mlLeft - t.minsLeft) > RUNWAY_TOL_B) continue;
        const e = excursion(bars, k, dir);
        if (!e) continue;
        const cM = e.mfe / day.dayScale, cA = Math.abs(e.mae) / day.dayScale;
        (B[fam] ??= acc());
        const posOff = ((bars[k].close - t.entry) * dir) / day.dayScale;
        push(B[fam], (touchMfe - touchMae) - (cM - cA), touchMfe, touchMae, cM, cA, posOff);
        break;
      }
    }
  }

  const out = { pair, instrument: resp.instrument, generatedAt: new Date().toISOString(), A: {}, B: {} };
  for (const fam of Object.keys(A)) out.A[fam] = stats(A[fam]);
  for (const fam of Object.keys(B)) out.B[fam] = stats(B[fam]);
  const nA = Object.values(A).reduce((s, a) => s + a.n, 0);
  console.log(`  ${days.length} sessions, ${nA} paired controls`);
  return out;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let built = 0;
  for (const pair of PAIRS) {
    console.log(`${pair.toUpperCase()}:`);
    const r = await processPair(pair);
    if (!r) { console.log('  skipped'); continue; }
    fs.writeFileSync(path.join(OUT_DIR, `${pair}-control.json`), JSON.stringify(r));
    built++;
  }
  console.log(`\nBuilt ${built}/${PAIRS.length} -> ${OUT_DIR}`);
  console.log('Report with: node analysis/line_touch_control_report.mjs');
}

const __filename = fileURLToPath(import.meta.url);
if (path.resolve(process.argv[1] ?? '') === __filename) main();
