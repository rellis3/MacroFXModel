// Study 2 — the rubber band (forge/RUBBER_BAND_PREREG.md). Every decision point at three
// speeds with its stretch z from fair value and the forward return of a fade held to the
// fixed exit. The scorer applies |z| >= 2 and one-open-trade-at-a-time.
//   node scripts/rangebook/band_build.mjs <pair>
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { costForPair } from '../../js/perLineStrategy.js';
import { buildContext, scrambleFrom, stretchZ } from './common.mjs';

const PAIR = (process.argv[2] ?? 'eurusd').toLowerCase(), SYM = PAIR.toUpperCase(), ASSET = assetClassFor(PAIR);
const COST = costForPair(PAIR, ASSET);
const OPTS = { sym: SYM, assetClass: ASSET, tagFor: loadCalendarProxy()(SYM) };
const r4 = x => Math.round(x * 1e4) / 1e4;
const firstAt = (bars, t) => bars.findIndex(b => b.time >= t);

// Decision state (fair value, z) from bars BEFORE bar k of day di only.
function stateS1(ctx, di, k) {
  const d = ctx.days[di]; let pv = 0, vv = 0;
  for (let j = 0; j < k; j++) { const b = d.bars[j], v = b.volume || 1; pv += (b.high + b.low + b.close) / 3 * v; vv += v; }
  const px = d.bars[k - 1].close, fv = pv / vv;
  return { fv, z: (px - fv) / (d.sigmaFrac * d.open) };
}
const stateSlow = stretchZ;

function dayRows(ctx, di) {
  const d = ctx.days[di], bars = d.bars, unit = d.sigmaFrac * d.open, costU = COST / 100 * d.open / unit;
  if (!(unit > 0) || bars.length < 200) return [];
  const out = [];
  const push = (speed, k, st, exitPx, exitTime) => {
    const entry = bars[k].open, dir = st.z > 0 ? -1 : 1;
    out.push({ s: speed, date: d.date, t: bars[k].time, xt: exitTime, z: r4(st.z),
               ret: r4(dir * (exitPx - entry) / unit - costU), fwd: r4((exitPx - entry) / unit) });
  };
  for (let h = 8; h <= 16; h++) {                                    // S1: hourly, 2-hour hold
    const k = firstAt(bars, d.openSec + h * 3600); if (k < 1) continue;
    let x = firstAt(bars, bars[k].time + 2 * 3600); const exitPx = x < 0 ? bars.at(-1).close : bars[x].open;
    push('S1', k, stateS1(ctx, di, k), exitPx, x < 0 ? bars.at(-1).time : bars[x].time);
  }
  const k7 = firstAt(bars, d.openSec + 7 * 3600);
  if (k7 >= 1) {
    const s2 = stateSlow(ctx, di, k7, 5, 1);                        // S2: 5-day mean, hold to the close
    if (s2) push('S2', k7, s2, bars.at(-1).close, bars.at(-1).time);
    const s3 = stateSlow(ctx, di, k7, 20, Math.sqrt(5));            // S3: 20-day mean, hold 5 London days
    const ex = ctx.days[di + 4];
    if (s3 && ex) push('S3', k7, s3, ex.bars.at(-1).close, ex.bars.at(-1).time);
  }
  return out;
}

const full = await loadM1ForPair(PAIR);
const ctx = buildContext(full, OPTS);
const rows = ctx.days.flatMap((_, di) => dayRows(ctx, di));

// Self-check: fair value + z unchanged when the decision bar onward is replaced; the entry
// price (the decision bar's open) unchanged when the bar AFTER it onward is replaced.
{
  const idx = new Map(Array.from(full.times, (x, i) => [x, i]));
  let n = 0;
  for (const s of ['S1', 'S2', 'S3']) {
    const rs = rows.filter(r => r.s === s);
    const NS = Number(process.env.BAND_CHECK_N ?? 3);
    for (const r of rs.filter((_, i) => i % Math.floor(rs.length / NS) === 1).slice(0, NS)) {
      const gi = idx.get(r.t);
      for (const [from, what] of [[gi, 'state'], [gi + 1, 'entry']]) {
        const c2 = buildContext(scrambleFrom(full, from, 71 + n), OPTS);
        const di = ctx.dayIdx.get(r.date), di2 = c2.dayIdx.get(r.date);
        const k = ctx.days[di].bars.findIndex(b => b.time === r.t), k2 = c2.days[di2].bars.findIndex(b => b.time === r.t);
        const st = (c, i, kk) => s === 'S1' ? stateS1(c, i, kk) : stateSlow(c, i, kk, s === 'S2' ? 5 : 20, s === 'S2' ? 1 : Math.sqrt(5));
        const a = what === 'state' ? JSON.stringify(st(ctx, di, k)) : String(ctx.days[di].bars[k].open);
        const b = what === 'state' ? JSON.stringify(st(c2, di2, k2)) : String(c2.days[di2].bars[k2].open);
        if (a !== b) { console.error(`LOOK-AHEAD ${s} ${what} ${r.date}\n ${a}\n ${b}`); process.exit(2); }
        n++;
      }
    }
  }
  if (n < 6 * Number(process.env.BAND_CHECK_N ?? 3)) { console.error(`self-check sampled too few (${n})`); process.exit(2); }
  console.log(`[${PAIR}] self-check: ${n} state/entry checks identical under future-scramble`);
}
fs.writeFileSync(`analysis/output/rangebook/${PAIR}_band.json`, JSON.stringify({ pair: SYM, rows }));
console.log(`[${PAIR}] ${rows.length} decisions (S1 ${rows.filter(r => r.s === 'S1').length}, S2 ${rows.filter(r => r.s === 'S2').length}, S3 ${rows.filter(r => r.s === 'S3').length})`);
