// Study 1 — exits driven by the range book (forge/EXITS_PREREG.md).
// Entries: first OH/OL p50 touch (not same-bar), follow and fade. Exits: the pre-registered
// grid. The extreme-in probability comes from bookC_table.json (fitted on 2016-2022 only)
// and is read from bars BEFORE each checkpoint; checkpoint exits fill at that bar's open.
//   node scripts/rangebook/exit_build.mjs <pair>
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { costForPair } from '../../js/perLineStrategy.js';
import { buildContext, scrambleFrom, touchSetups } from './common.mjs';

const PAIR = (process.argv[2] ?? 'eurusd').toLowerCase(), SYM = PAIR.toUpperCase(), ASSET = assetClassFor(PAIR);
const COST = costForPair(PAIR, ASSET);
const OPTS = { sym: SYM, assetClass: ASSET, tagFor: loadCalendarProxy()(SYM) };
const TBL = JSON.parse(fs.readFileSync('analysis/output/rangebook/bookC_table.json', 'utf8'));
const CHECK_H = [7, 10, 13, 16];

// Same buckets and back-off as brier.py (MIN_N, Laplace), prefix keys "h|used|ext".
const bk = (v, edges, names) => { for (let i = 0; i < edges.length; i++) if (v < edges[i]) return names[i]; return names.at(-1); };
const USED = v => bk(v, TBL.usedEdges, ['<0.4', '0.4-0.7', '0.7-1', '>1']);
const EXTD = v => bk(v, TBL.extEdges, ['<0.1', '0.1-0.3', '0.3-0.6', '>0.6']);
function pExceeded(h, used, dist) {
  const full = [String(h), USED(used), EXTD(dist)];
  for (let i = full.length; i >= 0; i--) {
    const c = TBL.counts[full.slice(0, i).join('|')];
    if (c && c[1] >= TBL.minN) return (c[0] + 1) / (c[1] + 2);
  }
  const c = TBL.counts['']; return (c[0] + 1) / (c[1] + 2);
}

// Probability, at checkpoint bar kc, that the running extreme on side `extUp` (true = high)
// is exceeded later today. Bars BEFORE kc only.
function checkpointP(d, kc, h, extUp) {
  let hi = d.open, lo = d.open;
  for (let j = 0; j < kc; j++) { if (d.bars[j].high > hi) hi = d.bars[j].high; if (d.bars[j].low < lo) lo = d.bars[j].low; }
  const unit = d.sigmaFrac * d.open, px = d.bars[kc - 1].close;
  const used = (hi - lo) / d.open * 100 / d.ladder.hl.p50;
  return pExceeded(h, used, extUp ? (hi - px) / unit : (px - lo) / unit);
}
function checkpoints(d, k) {
  const out = [];
  for (const h of CHECK_H) { const kc = d.bars.findIndex(b => b.time >= d.openSec + h * 3600); if (kc > k) out.push({ h, kc }); }
  return out;
}

// One trade. dir +1 buy / -1 sell. Returns net R (risk = |entry − initial stop|).
function simulate(d, k, dir, entry, stop0, o = {}) {
  const bars = d.bars, unit = d.sigmaFrac * d.open, risk = Math.abs(entry - stop0);
  const cps = new Map((o.checkExit ? checkpoints(d, k) : []).map(c => [c.kc, c.h]));
  let stop = stop0, exit = null;
  let hi = d.open, lo = d.open; for (let j = 0; j <= k; j++) { if (bars[j].high > hi) hi = bars[j].high; if (bars[j].low < lo) lo = bars[j].low; }
  const r75 = d.ladder.hl.p75 / 100 * d.open;
  for (let j = k + 1; j < bars.length && exit == null; j++) {
    const b = bars[j];
    if (cps.has(j) && o.checkExit(checkpointP(d, j, cps.get(j), o.extUp))) { exit = b.open; break; }
    if (o.timeExitSec && b.time >= o.timeExitSec) { exit = b.open; break; }
    if (dir > 0 ? b.low <= stop : b.high >= stop) { exit = stop; break; }
    if (o.target != null && (dir > 0 ? b.high >= o.target : b.low <= o.target)) { exit = o.target; break; }
    if (o.rangeExit) {
      const nh = Math.max(hi, b.high), nl = Math.min(lo, b.low);
      if (nh - nl >= r75) { exit = b.high > hi ? lo + r75 : hi - r75; break; }   // the level where the range hit p75
    }
    if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low;
    if (o.beAt != null && (dir > 0 ? b.high - entry : entry - b.low) >= o.beAt * unit) stop = dir > 0 ? Math.max(stop, entry) : Math.min(stop, entry);
  }
  if (exit == null) exit = bars.at(-1).close;
  return dir * (exit - entry) / risk - COST / 100 * d.open / risk;
}

function tradeRows(ctx, di) {
  const out = [];
  for (const s of touchSetups(ctx, di)) {
    if ((s.t.line !== 'OH_p50' && s.t.line !== 'OL_p50') || s.sameBar) continue;
    const { d, up, k, t, tg, unit } = s, sg = up ? 1 : -1, E = t.level;
    const at16 = d.openSec + 16 * 3600;
    const fol = sg, fad = -sg;                                  // trade directions
    const r = {
      X0: simulate(d, k, fol, E, tg.fade, { target: tg.cont }),
      X1: simulate(d, k, fol, E, tg.fade, {}),
      X2: simulate(d, k, fol, E, tg.fade, { rangeExit: true }),
      X3: simulate(d, k, fol, E, tg.fade, { checkExit: p => p < 0.35, extUp: up }),
      X5: simulate(d, k, fol, E, tg.fade, { beAt: 0.3 }),
      X6: simulate(d, k, fol, E, tg.fade, { timeExitSec: at16 }),
      F0: simulate(d, k, fad, E, tg.cont, { target: tg.fade }),
      F4: simulate(d, k, fad, E, E + sg * 0.4 * unit, { target: tg.fade }),
      F3: simulate(d, k, fad, E, tg.cont, { target: tg.fade, checkExit: p => p > 0.65, extUp: up }),
      F5: simulate(d, k, fad, E, tg.cont, { target: tg.fade, beAt: 0.3 }),
      F6: simulate(d, k, fad, E, tg.cont, { target: tg.fade, timeExitSec: at16 }),
    };
    for (const key of Object.keys(r)) r[key] = Math.round(r[key] * 1e4) / 1e4;
    out.push({ date: d.date, line: t.line, time: t.time, k, r });
  }
  return out;
}

const full = await loadM1ForPair(PAIR);
const ctx = buildContext(full, OPTS);
const rows = ctx.days.flatMap((_, di) => tradeRows(ctx, di));

// Self-check: the probability read at the first checkpoint after entry must not change when
// the checkpoint bar and everything after it are replaced.
{
  const idx = new Map(Array.from(full.times, (x, i) => [x, i]));
  let done = 0;
  for (const r of rows.filter((_, i) => i % Math.floor(rows.length / 8) === 4).slice(0, 8)) {
    const d = ctx.days[ctx.dayIdx.get(r.date)], cp = checkpoints(d, r.k)[0];
    if (!cp) continue;
    const up = r.line === 'OH_p50';
    const a = checkpointP(d, cp.kc, cp.h, up);
    const c2 = buildContext(scrambleFrom(full, idx.get(d.bars[cp.kc].time), 61), OPTS);
    const d2 = c2.days[c2.dayIdx.get(r.date)];
    const b = checkpointP(d2, cp.kc, cp.h, up);
    if (a !== b) { console.error(`LOOK-AHEAD checkpoint ${r.date} ${r.line} h${cp.h}: ${a} vs ${b}`); process.exit(2); }
    done++;
  }
  if (done < 4) { console.error(`self-check sampled too few trades (${done})`); process.exit(2); }
  console.log(`[${PAIR}] self-check: ${done} checkpoint probabilities identical under future-scramble`);
}
fs.writeFileSync(`analysis/output/rangebook/${PAIR}_exits.json`, JSON.stringify({ pair: SYM, rows }));
console.log(`[${PAIR}] ${rows.length} entries ${rows[0].date} -> ${rows.at(-1).date}`);
