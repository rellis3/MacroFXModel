// EURUSD Touch Book part 2 — entry timing (forge/ENTRY_TIMING_EURUSD_PREREG.md).
// For every first touch: fade limits x beyond the line and follow limits y back from
// it, each with stop s, simulated on the real M1 path. Writes <pair>_entries.json.
//   node scripts/rangebook/entry_build.mjs [pair]
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { costForPair } from '../../js/perLineStrategy.js';
import { buildContext, scrambleFrom, touchSetups } from './common.mjs';

const PAIR = (process.argv[2] ?? 'eurusd').toLowerCase(), SYM = PAIR.toUpperCase();
const ASSET = assetClassFor(PAIR), COST = costForPair(PAIR, ASSET);
const OPTS = { sym: SYM, assetClass: ASSET, tagFor: loadCalendarProxy()(SYM) };
const DEPTHS = [0, 0.1, 0.2, 0.3], STOPS = [0.25, 0.5];
export const VARIANTS = [];
for (const kind of ['fade', 'follow']) for (const x of DEPTHS) for (const s of STOPS) VARIANTS.push({ kind, x, s });
const r4 = x => (x == null || !Number.isFinite(x)) ? null : Math.round(x * 1e4) / 1e4;

// One order on the path after the touch bar. dir +1 = buy, -1 = sell.
// Returns null (never filled) or the gross R of the filled trade.
function simulate(bars, k, { entry, stop, target, dir, cancel, unitS }) {
  const fills = b => dir > 0 ? b.low <= entry : b.high >= entry;
  const stopped = b => dir > 0 ? b.low <= stop : b.high >= stop;
  const hitTarget = b => dir > 0 ? b.high >= target : b.low <= target;
  let j = k + 1;
  for (; j < bars.length; j++) {
    const b = bars[j];
    if (fills(b)) break;                                   // a fill takes priority over a same-bar cancel
    if (cancel(b)) return null;
  }
  if (j >= bars.length) return null;
  if (stopped(bars[j])) return -1;                         // fill bar may stop out, may not hit the target
  for (let i = j + 1; i < bars.length; i++) {
    const b = bars[i];
    if (stopped(b)) return -1;
    if (hitTarget(b)) return dir * (target - entry) / unitS;
  }
  return dir * (bars.at(-1).close - entry) / unitS;
}

function entryRows(ctx, di) {
  return touchSetups(ctx, di).map(({ d, t, up, k, tg, unit }) => {
    const sgUp = up ? 1 : -1;                              // +1: the continue direction is up
    const res = VARIANTS.map(({ kind, x, s }) => {
      if (kind === 'fade') {
        const entry = t.level + sgUp * x * unit;           // beyond the line
        return simulate(d.bars, k, { entry, stop: entry + sgUp * s * unit, target: tg.fade, dir: -sgUp, unitS: s * unit,
          cancel: b => up ? b.low <= tg.fade : b.high >= tg.fade });
      }
      const entry = t.level - sgUp * x * unit;             // back from the line
      return simulate(d.bars, k, { entry, stop: entry - sgUp * s * unit, target: tg.cont, dir: sgUp, unitS: s * unit,
        cancel: b => up ? b.high >= tg.cont : b.low <= tg.cont });
    });
    return { date: d.date, line: t.line, time: t.time, k, londonMin: Math.round((t.time - d.openSec) / 60),
             costSig: r4(COST / 100 * d.open / unit), r: res.map(r4) };
  });
}

const full = await loadM1ForPair(PAIR);
const ctx = buildContext(full, OPTS);
const part1 = new Set(JSON.parse(fs.readFileSync(`analysis/output/rangebook/${PAIR}_touches.json`, 'utf8')).rows
  .filter(r => !r.sameBar).map(r => `${r.date}|${r.line}`));
const rows = ctx.days.flatMap((_, di) => entryRows(ctx, di)).filter(r => part1.has(`${r.date}|${r.line}`));

// Self-check: order levels come from touchSetups; scramble after the touch bar and
// confirm the setup (level, targets, unit) is unchanged.
{
  const idx = new Map(Array.from(full.times, (x, i) => [x, i]));
  const picks = rows.filter((_, i) => i % Math.floor(rows.length / 6) === 2).slice(0, 6);
  for (const r of picks) {
    const setupOf = c => { const s = touchSetups(c, c.dayIdx.get(r.date)).find(x => x.t.line === r.line); return s && JSON.stringify([s.t.level, s.tg, s.unit, s.k]); };
    const a = setupOf(ctx), b = setupOf(buildContext(scrambleFrom(full, idx.get(r.time) + 1, 29), OPTS));
    if (a !== b) { console.error(`LOOK-AHEAD ${r.date} ${r.line}\n ${a}\n ${b}`); process.exit(2); }
  }
  console.log(`self-check: ${picks.length} order setups identical under future-scramble`);
}

fs.writeFileSync(`analysis/output/rangebook/${PAIR}_entries.json`, JSON.stringify({ pair: SYM, cost: COST, variants: VARIANTS, rows }));
console.log(`${SYM}: ${rows.length} touches (part 1 had ${part1.size}); fills per variant: ${VARIANTS.map((v, i) => rows.filter(r => r.r[i] != null).length).join(',')}`);
