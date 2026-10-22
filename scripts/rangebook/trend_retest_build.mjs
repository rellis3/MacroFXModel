// Trend-day filter + acceptance-retest entry (forge/TRENDDAY_RETEST_PREREG.md). Uses the live paper-record core
// (parity-checked against asym_build) for the break signals and base scoring.
//   node scripts/rangebook/trend_retest_build.mjs [pair]
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { costForPair } from '../../js/perLineStrategy.js';
import { buildContext, scrambleFrom } from './common.mjs';
const core = await import(pathToFileURL(path.resolve('../MacroFXModel-paper/js/paperRecordCore.js')).href);

const PAIR = (process.argv[2] ?? 'gold').toLowerCase(), SYM = PAIR.toUpperCase(), ASSET = assetClassFor(PAIR), COST = costForPair(PAIR, ASSET);
const OPTS = { sym: SYM, assetClass: ASSET, tagFor: loadCalendarProxy()(SYM) };
const ACCEPT = 5, RETEST_WIN = 120, RETEST_TOL = 0.02;
const r4 = x => (x == null || !Number.isFinite(x)) ? null : Math.round(x * 1e4) / 1e4;
const minOf = (d, b) => (b.time - d.openSec) / 60;

function asiaRange(d) {
  let hi = -Infinity, lo = Infinity;
  for (const b of d.bars) { if (minOf(d, b) >= 420) break; hi = Math.max(hi, b.high); lo = Math.min(lo, b.low); }
  return hi > lo ? { hi, lo } : null;
}

function retest(d, brk, costPx) {
  const bars = d.bars, unit = d.sigmaFrac * d.open, L = brk.level, dir = brk.dir, k = brk.signalK;
  for (let j = k + 1; j <= k + ACCEPT; j++) {
    if (j >= bars.length) return { status: 'noData' };
    if ((bars[j].close - L) * dir <= 0) return { status: 'rejected' };
  }
  const px = L + dir * RETEST_TOL * unit;
  for (let j = k + ACCEPT + 1; j < bars.length && j <= k + ACCEPT + RETEST_WIN; j++) {
    const b = bars[j];
    if (dir > 0 ? b.low <= px : b.high >= px) {
      const entry = dir > 0 ? Math.min(b.open, px) : Math.max(b.open, px);
      const out = { status: 'filled', fillK: j, entry, variants: {} };
      for (const s of core.STOPS) {
        const stop = L - dir * s * unit, risk = (entry - stop) * dir;
        if (!(risk > 0)) { out.status = 'gapPastStop'; return out; }
        for (const t of core.TARGETS) out.variants[`${s}|${t}`] = core.simulate(bars, j, dir, entry, stop, entry + dir * t * risk, costPx, true).R;
      }
      out.R = r4(Object.values(out.variants).reduce((a, v) => a + v, 0) / 4);
      return out;
    }
  }
  return { status: 'noRetest' };
}

function dayRows(ctx, di, asiaHist) {
  const d = ctx.days[di], out = [], unit = d.sigmaFrac * d.open;
  if (!(unit > 0) || !d.static.OH_p75 || !d.static.OL_p75) return out;
  const costPx = COST / 100 * d.open, asia = asiaRange(d);
  const prior = asiaHist.slice(-20), med = prior.length >= 10 ? [...prior].sort((a, b) => a - b)[Math.floor(prior.length / 2)] : null;
  for (const brk of core.detectBreaks(d, d.bars)) {
    const base = core.scoreTrade(d, d.bars, brk, costPx, true);
    const sigMin = minOf(d, d.bars[brk.signalK]);
    let asiaBreakWith = null;
    if (sigMin >= 420 && asia) {
      asiaBreakWith = false;
      for (let j = 0; j < brk.signalK; j++) {
        const b = d.bars[j]; if (minOf(d, b) < 420) continue;
        if (brk.dir > 0 ? b.close > asia.hi : b.close < asia.lo) { asiaBreakWith = true; break; }
      }
    }
    const rt = retest(d, brk, costPx);
    out.push({ date: d.date, line: brk.line, dir: brk.dir, sigMin: Math.round(sigMin), signalK: brk.signalK, baseR: base.R,
               asiaBreakWith, narrowAsia: asia && med ? (asia.hi - asia.lo) / d.open < med : null,
               rt: { status: rt.status, R: rt.R ?? null, fillK: rt.fillK ?? null, entry: rt.entry ?? null } });
  }
  return out;
}

const S = await loadM1ForPair(PAIR);
const ctx = buildContext(S, OPTS);
const asiaHist = [], rows = [];
ctx.days.forEach((d, di) => { rows.push(...dayRows(ctx, di, asiaHist)); const a = asiaRange(d); if (a) asiaHist.push((a.hi - a.lo) / d.open); });

{ // self-check: asiaBreakWith (decided at the signal bar) and the retest fill (decided at the fill bar)
  const idx = new Map(Array.from(S.times, (t, i) => [t, i]));
  const histTo = di => { const h = []; for (let q = 0; q < di; q++) { const a = asiaRange(ctx.days[q]); if (a) h.push((a.hi - a.lo) / ctx.days[q].open); } return h; };
  const picks = rows.filter(r => r.rt.status === 'filled' && r.asiaBreakWith != null).filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 4)) === 1).slice(0, 4);
  if (picks.length < 3) { console.error('self-check sampled too few'); process.exit(2); }
  for (const r of picks) {
    const di = ctx.dayIdx.get(r.date), d = ctx.days[di];
    for (const [from, f] of [[idx.get(d.bars[r.signalK].time) + 1, x => x.asiaBreakWith], [idx.get(d.bars[r.rt.fillK].time) + 1, x => JSON.stringify([x.rt.fillK, x.rt.entry])]]) {
      const c2 = buildContext(scrambleFrom(S, from, 113), OPTS);
      const g = dayRows(c2, c2.dayIdx.get(r.date), histTo(di)).find(x => x.line === r.line);
      if (!g || f(g) !== f(r)) { console.error(`LOOK-AHEAD ${r.date} ${r.line}: ${f(r)} vs ${g && f(g)}`); process.exit(2); }
    }
  }
  console.log(`self-check: ${picks.length} trend flags + retest fills identical under future-scramble`);
}
fs.writeFileSync(`analysis/output/rangebook/${PAIR}_trendretest.json`, JSON.stringify({ pair: SYM, rows }));
const c = s => rows.filter(r => r.rt.status === s).length;
console.log(`${SYM}: ${rows.length} breaks; retest filled ${c('filled')}, rejected ${c('rejected')}, no retest ${c('noRetest')}; asiaBreakWith defined ${rows.filter(r => r.asiaBreakWith != null).length}`);
