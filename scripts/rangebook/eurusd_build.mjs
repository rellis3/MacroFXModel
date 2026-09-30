// EURUSD Range Book builder (forge/RANGE_BOOK_EURUSD_PREREG.md).
// One record per London day: pre-day regime, the export ladder, and the raw rows for
// Book A (reach from checkpoints), Book B (after the forecast range completes) and
// Book C (is the running extreme the day's). Aborts on a failed future-scramble check.
//   node scripts/rangebook/eurusd_build.mjs [pair]
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { STATIC_LINES } from '../../js/voteAtlasV4Lines.js';
import { buildContext as buildCtx, preDay } from './common.mjs';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';

const PAIR = (process.argv[2] ?? 'eurusd').toLowerCase(), SYM = PAIR.toUpperCase();
const ASSET = assetClassFor(PAIR);
const CHECKPOINTS = [3, 7, 10, 13, 16];            // London hours (open + h, DST days off by 1h)
const RANGE_RUNGS = ['p50', 'p75', 'p90'];
const B_LINES = ['Open', 'CloseUp_p50', 'CloseDn_p50', 'OH_p50', 'OL_p50', 'OH_p75', 'OL_p75'];
const tagFor = loadCalendarProxy()(SYM);
const r4 = x => (x == null || !Number.isFinite(x)) ? null : Math.round(x * 1e4) / 1e4;

const full = await loadM1ForPair(PAIR);

const buildContext = packed => buildCtx(packed, { sym: SYM, assetClass: ASSET, tagFor });

// ── Checkpoint state from bars[0..k-1] only ──────────────────────────────────
function stateAt(d, k) {
  let hi = d.open, lo = d.open;
  for (let j = 0; j < k; j++) { if (d.bars[j].high > hi) hi = d.bars[j].high; if (d.bars[j].low < lo) lo = d.bars[j].low; }
  return { hi, lo, px: d.bars[k - 1].close };
}

function dayRecord(ctx, di) {
  const d = ctx.days[di], bars = d.bars, open = d.open, sig = d.sigmaFrac, L = d.ladder;
  const unit = sig * open;                                    // 1σ in price
  const hlPct = r => L.hl?.[r];
  if (!hlPct('p50') || !(unit > 0) || bars.length < 200) return null;

  // First-touch bar of every static line, and first bar each range rung is reached.
  const first = {};
  const rangeAt = {};
  let hi = -Infinity, lo = Infinity, hiIdx = -1, loIdx = -1;
  const runHi = new Float64Array(bars.length), runLo = new Float64Array(bars.length);
  for (let k = 0; k < bars.length; k++) {
    const b = bars[k];
    if (b.high > hi) { hi = b.high; hiIdx = k; }
    if (b.low < lo) { lo = b.low; loIdx = k; }
    runHi[k] = hi; runLo[k] = lo;
    for (const [name, side] of STATIC_LINES) {
      if (first[name] != null) continue;
      const lv = d.static[name];
      if (lv != null && (side === 'up' ? b.high >= lv : b.low <= lv)) first[name] = k;
    }
    const rng = (hi - lo) / open * 100;
    for (const r of RANGE_RUNGS) if (rangeAt[r] == null && hlPct(r) && rng >= hlPct(r)) rangeAt[r] = k;
  }
  const dayHi = hi, dayLo = lo, lastClose = bars.at(-1).close;

  // ── Book A + C at checkpoints ──
  const A = [], C = [];
  for (const h of CHECKPOINTS) {
    const k = bars.findIndex(b => b.time >= d.openSec + h * 3600);
    if (k < 1) continue;
    const s = stateAt(d, k);
    const used = (s.hi - s.lo) / open * 100 / hlPct('p50');
    for (const [name, side] of STATIC_LINES) {
      const f = first[name];
      if (f != null && f < k) continue;                           // already touched
      A.push({ h, line: name, side, dist: r4(Math.abs(d.static[name] - s.px) / unit), used: r4(used), hit: f != null ? 1 : 0 });
    }
    const curRng = (s.hi - s.lo) / open * 100;
    for (const r of RANGE_RUNGS) {
      if (!hlPct(r) || curRng >= hlPct(r)) continue;
      const toGo = (hlPct(r) - curRng) / 100 * open / unit;
      A.push({ h, line: `Range_${r}`, side: null, dist: r4(toGo), used: r4(used), hit: rangeAt[r] != null && rangeAt[r] >= k ? 1 : 0 });
    }
    let hiLater = 0, loLater = 0;
    for (let j = k; j < bars.length; j++) { if (bars[j].high > s.hi) hiLater = 1; if (bars[j].low < s.lo) loLater = 1; if (hiLater && loLater) break; }
    C.push({ h, side: 'up', used: r4(used), dist: r4((s.hi - s.px) / unit), exceeded: hiLater });
    C.push({ h, side: 'dn', used: r4(used), dist: r4((s.px - s.lo) / unit), exceeded: loLater });
  }

  // ── Book B: the forecast range completes (running H-L >= hl p50) ──
  let B = null;
  const kc = rangeAt.p50;
  if (kc != null && kc >= 1) {
    const newLow = bars[kc].low < runLo[kc - 1], newHigh = bars[kc].high > runHi[kc - 1];
    if (newLow !== newHigh) {
      const dir = newLow ? 'down' : 'up';
      // bar index where the OPPOSITE extreme (as of completion) was set
      let opp = 0;
      for (let j = 0; j <= kc; j++) if (dir === 'down' ? bars[j].high === runHi[kc] : bars[j].low === runLo[kc]) { opp = j; break; }
      const ext = dir === 'down' ? runLo[kc] : runHi[kc];      // completion extreme
      const mid = (runHi[kc] + runLo[kc]) / 2;
      const rngAt = (runHi[kc] - runLo[kc]) / open * 100;
      let hi2 = runHi[kc], lo2 = runLo[kc], backOpen = 0, backMid = 0, maxExt = 0, maxRet = 0;
      const lineLv = { Open: open, ...d.static };
      const pending = B_LINES.filter(n => lineLv[n] != null && (lineLv[n] > bars[kc].close ? lineLv[n] > bars[kc].high : lineLv[n] < bars[kc].low));
      let next = 'none';
      for (let j = kc + 1; j < bars.length; j++) {
        const b = bars[j];
        if (b.high > hi2) hi2 = b.high; if (b.low < lo2) lo2 = b.low;
        if (dir === 'down') { if (b.high >= open) backOpen = 1; if (b.high >= mid) backMid = 1; maxExt = Math.max(maxExt, (ext - b.low) / unit); maxRet = Math.max(maxRet, (b.high - ext) / unit); }
        else { if (b.low <= open) backOpen = 1; if (b.low <= mid) backMid = 1; maxExt = Math.max(maxExt, (b.high - ext) / unit); maxRet = Math.max(maxRet, (ext - b.low) / unit); }
        if (next === 'none') {
          const hits = pending.filter(n => lineLv[n] > bars[kc].close ? b.high >= lineLv[n] : b.low <= lineLv[n]);
          if (hits.length) next = hits.length === 1 ? hits[0] : 'multi';
        }
      }
      const finalRng = (hi2 - lo2) / open * 100;
      B = {
        dir, k: kc, londonMin: Math.round((bars[kc].time - d.openSec) / 60),
        driveMin: Math.round((bars[kc].time - bars[opp].time) / 60),
        ext75: rngAt >= hlPct('p75') ? null : (finalRng >= hlPct('p75') ? 1 : 0),
        ext90: rngAt >= hlPct('p90') ? null : (finalRng >= hlPct('p90') ? 1 : 0),
        backOpen: (dir === 'down' ? bars[kc].high >= open : bars[kc].low <= open) ? null : backOpen,
        backMid, next, maxExt: r4(maxExt), maxRet: r4(maxRet),
      };
    }
  }

  return { date: d.date, sigmaPct: L.sigma_daily_pct, hl50: hlPct('p50'), pre: preDay(ctx, di),
           dayRange: r4((dayHi - dayLo) / open * 100 / hlPct('p50')), closeFromOpen: r4((lastClose - open) / unit),
           A, B, C };
}

const ctx = buildContext(full);
const records = ctx.days.map((_, di) => dayRecord(ctx, di)).filter(Boolean);

// ── Self-check: replace the checkpoint bar and everything after it with a different
// walk; pre-day features and checkpoint STATES (not outcomes) must not change.
{
  const idx = new Map(Array.from(full.times, (x, i) => [x, i]));
  let seed = 3; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const picks = records.filter((_, i) => i % Math.floor(records.length / 8) === 5).slice(0, 8);
  const stateOnly = rec => JSON.stringify({ pre: rec.pre, A: rec.A.filter(a => a.h === 10).map(({ hit, ...x }) => x), C: rec.C.filter(c => c.h === 10).map(({ exceeded, ...x }) => x) });
  for (const rec of picks) {
    const d = ctx.days[ctx.dayIdx.get(rec.date)];
    const k = d.bars.findIndex(b => b.time >= d.openSec + 10 * 3600);
    if (k < 1) continue;
    const from = idx.get(d.bars[k].time);
    const q = { n: full.n, times: full.times, opens: Float64Array.from(full.opens), highs: Float64Array.from(full.highs), lows: Float64Array.from(full.lows), closes: Float64Array.from(full.closes), volumes: full.volumes };
    let px = q.closes[from - 1];
    for (let i = from; i < q.n; i++) { const o = px; px *= 1 + (rnd() - 0.5) * 0.002; q.opens[i] = o; q.closes[i] = px; q.highs[i] = Math.max(o, px) * 1.0003; q.lows[i] = Math.min(o, px) * 0.9997; }
    const c2 = buildContext(q);
    const rec2 = dayRecord(c2, c2.dayIdx.get(rec.date));
    // A-rows from the checkpoint depend on which lines were touched BEFORE it, so line
    // lists must match too; only `hit` / `exceeded` may differ.
    if (stateOnly(rec) !== stateOnly(rec2)) { console.error(`LOOK-AHEAD ${rec.date}\n ${stateOnly(rec)}\n ${stateOnly(rec2)}`); process.exit(2); }
  }
  console.log(`self-check: ${picks.length} days, pre-day + 10:00 checkpoint state identical under future-scramble`);
}

fs.mkdirSync('analysis/output/rangebook', { recursive: true });
fs.writeFileSync(`analysis/output/rangebook/${PAIR}.json`, JSON.stringify({ pair: SYM, generatedAt: new Date().toISOString(), records }));
console.log(`${SYM}: ${records.length} days ${records[0].date} -> ${records.at(-1).date}; A rows ${records.reduce((a, r) => a + r.A.length, 0)}, B events ${records.filter(r => r.B).length}, C rows ${records.reduce((a, r) => a + r.C.length, 0)}`);
