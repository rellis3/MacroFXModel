// Tight stop, far target at the forecast levels (forge/ASYMMETRIC_TRADES_PREREG.md).
//   node scripts/rangebook/asym_build.mjs [pair]
// HOLD: limit at a line on its first touch (00:00-10:00 London), fading it; BREAK: first close >= 0.05σ beyond a line,
// enter at the next open in the break direction; DOPEN: first return to the London day open after a >= 0.25σ excursion,
// entered back the way price went. Stop = level ± 0.1σ / 0.2σ; targets 5R, 10R, far OH/OL p75; exit day end.
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { linesAtBar, LINE_SIDE } from '../../js/voteAtlasV4Lines.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { costForPair } from '../../js/perLineStrategy.js';
import { buildContext, scrambleFrom, preDay } from './common.mjs';

const PAIR = (process.argv[2] ?? 'gold').toLowerCase(), SYM = PAIR.toUpperCase();
const ASSET = assetClassFor(PAIR), COST = costForPair(PAIR, ASSET);
const OPTS = { sym: SYM, assetClass: ASSET, tagFor: loadCalendarProxy()(SYM) };
const LINES = ['OH_p50', 'OH_p75', 'CloseUp_p50', 'CloseUp_p75', 'ProjH_p50', 'OL_p50', 'OL_p75', 'CloseDn_p50', 'CloseDn_p75', 'ProjL_p50'];
const STOPS = [0.1, 0.2], END_MIN = 600;
const r3 = x => (x == null || !Number.isFinite(x)) ? null : Math.round(x * 1000) / 1000;

function simulate(bars, k0, dir, entry, stop, target, costPx, includeEntryBarTarget) {
  const risk = (entry - stop) * dir;
  for (let j = k0; j < bars.length; j++) {
    const b = bars[j];
    if (dir > 0 ? b.low <= stop : b.high >= stop) return { R: -1 - costPx / risk, out: 'stop' };
    if ((j > k0 || includeEntryBarTarget) && (dir > 0 ? b.high >= target : b.low <= target)) return { R: (target - entry) * dir / risk - costPx / risk, out: 'target' };
  }
  return { R: (bars.at(-1).close - entry) * dir / risk - costPx / risk, out: 'end' };
}

function trades(ctx, di) {
  const d = ctx.days[di], bars = d.bars, unit = d.sigmaFrac * d.open, out = [];
  if (!(unit > 0) || !d.static.OH_p75 || !d.static.OL_p75) return out;
  const costPx = COST / 100 * d.open, reg = preDay(ctx, di).sigmaReg;
  const far = dir => dir > 0 ? d.static.OH_p75 : d.static.OL_p75;
  const add = (type, line, k, entryK, dir, entry, level, includeEntryBarTarget) => {
    const t = { date: d.date, type, line, k: entryK, min: Math.round((bars[entryK].time - d.openSec) / 60), dir, reg, entry: r3(entry / unit) };
    for (const s of STOPS) {
      const stop = level - dir * s * unit, risk = (entry - stop) * dir;
      if (!(risk > 0)) { t['s' + s] = null; continue; }
      const tg = { r5: entry + dir * 5 * risk, r10: entry + dir * 10 * risk, far: far(dir) };
      const res = {};
      for (const [name, T] of Object.entries(tg)) {
        if (name === 'far' && (T - entry) * dir / risk < 3) { res[name] = null; continue; }
        res[name] = simulate(bars, entryK, dir, entry, stop, T, costPx, includeEntryBarTarget);
        res[name].R = r3(res[name].R);
      }
      res.risk = r3(risk / unit); res.costR = r3(costPx / risk);
      t['s' + s] = res;
    }
    out.push(t);
  };
  let runHi = d.open, runLo = d.open;
  const holdDone = new Set(), brkDone = new Set(), dopenDone = new Set();
  for (let k = 0; k < bars.length; k++) {
    const b = bars[k], min = (b.time - d.openSec) / 60;
    if (min >= END_MIN) break;
    if (k > 0) {
      const lv = linesAtBar(d, k, runHi, runLo);
      for (const name of LINES) {
        const L = lv[name]; if (L == null) continue;
        const up = LINE_SIDE[name] === 'up';
        if (!holdDone.has(name) && (up ? b.high >= L : b.low <= L)) {                // first touch -> fade at the level
          holdDone.add(name); add('HOLD', name, k, k, up ? -1 : 1, L, L, false);
        }
        if (!brkDone.has(name) && (up ? b.close >= L + 0.05 * unit : b.close <= L - 0.05 * unit) && k + 1 < bars.length) {
          brkDone.add(name); add('BREAK', name, k, k + 1, up ? 1 : -1, bars[k + 1].open, L, true);
        }
      }
      // daily open retest
      for (const [side, moved, back] of [['up', runHi - d.open >= 0.25 * unit, b.low <= d.open], ['dn', d.open - runLo >= 0.25 * unit, b.high >= d.open]]) {
        if (!dopenDone.has(side) && moved && back) { dopenDone.add(side); add('DOPEN', 'dayOpen', k, k, side === 'up' ? 1 : -1, d.open, d.open, false); }
      }
    }
    if (b.high > runHi) runHi = b.high;
    if (b.low < runLo) runLo = b.low;
  }
  return out;
}

const S = await loadM1ForPair(PAIR);
const ctx = buildContext(S, OPTS);
const rows = ctx.days.flatMap((_, di) => trades(ctx, di));
{ // self-check: entry/stop/risk of sampled trades unchanged under a scramble from the bar after entry
  const idx = new Map(Array.from(S.times, (x, i) => [x, i]));
  const picks = rows.filter((_, i) => i % Math.floor(rows.length / 6) === 3).slice(0, 6);
  for (const t of picks) {
    const d = ctx.days[ctx.dayIdx.get(t.date)], gi = idx.get(d.bars[t.k].time);
    const c2 = buildContext(scrambleFrom(S, gi + 1, 109), OPTS);
    const g = trades(c2, c2.dayIdx.get(t.date)).find(x => x.type === t.type && x.line === t.line && x.dir === t.dir);
    const f = x => JSON.stringify([x.k, x.entry, x['s0.1']?.risk, x['s0.2']?.risk, x.reg]);
    if (!g || f(g) !== f(t)) { console.error(`LOOK-AHEAD ${t.date} ${t.type} ${t.line}\n ${f(t)}\n ${g && f(g)}`); process.exit(2); }
  }
  if (picks.length < 5) { console.error('self-check sampled too few'); process.exit(2); }
  console.log(`self-check: ${picks.length} trades' entry/stop/regime identical under future-scramble`);
}
fs.writeFileSync(`analysis/output/rangebook/${PAIR}_asym.json`, JSON.stringify({ pair: SYM, rows }));
const by = rows.reduce((a, t) => (a[t.type] = (a[t.type] ?? 0) + 1, a), {});
const m = (type, s, tg) => { const v = rows.filter(t => t.type === type && t['s' + s]?.[tg]).map(t => t['s' + s][tg].R); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(3) : '–'; };
console.log(`${SYM}: ${JSON.stringify(by)}; HOLD 0.1σ 10R ${m('HOLD', 0.1, 'r10')}, BREAK 0.1σ 10R ${m('BREAK', 0.1, 'r10')}, DOPEN 0.1σ far ${m('DOPEN', 0.1, 'far')}`);
