// EURUSD Touch Book builder (forge/TOUCH_BOOK_EURUSD_PREREG.md).
// Every first touch of every export line: the continue-vs-fade race against its
// neighbouring lines, the excursions on the way, and the situation at the touch.
//   node scripts/rangebook/touch_build.mjs [pair]
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { costForPair } from '../../js/perLineStrategy.js';
import { pipSize } from '../../js/instrumentRegistry.js';
import { buildContext, scrambleFrom, touchSetups } from './common.mjs';

const PAIR = (process.argv[2] ?? 'eurusd').toLowerCase(), SYM = PAIR.toUpperCase();
const ASSET = assetClassFor(PAIR), COST = costForPair(PAIR, ASSET), PIP = pipSize(SYM);
const tagFor = loadCalendarProxy()(SYM);
const OPTS = { sym: SYM, assetClass: ASSET, tagFor };
const r4 = x => (x == null || !Number.isFinite(x)) ? null : Math.round(x * 1e4) / 1e4;

function touchRows(ctx, di) {
  return touchSetups(ctx, di).map(({ d, t, up, k, tg, unit, dc, df, sameBar, sit, pre }) => {
    const bars = d.bars;
    const beyond = b => up ? b.high - t.level : t.level - b.low;       // + = in the continue direction
    const back = b => up ? t.level - b.low : b.high - t.level;         // + = toward the fade side
    const contHit = b => up ? b.high >= tg.cont : b.low <= tg.cont;
    const fadeHit = b => up ? b.low <= tg.fade : b.high >= tg.fade;
    let outcome = 'open', resolveK = null, mb = 0, mk = 0, dayB = 0, dayK = 0;
    for (let j = k + 1; j < bars.length; j++) {
      const b = bars[j];
      dayB = Math.max(dayB, beyond(b)); dayK = Math.max(dayK, back(b));
      if (outcome === 'open') {
        mb = Math.max(mb, beyond(b)); mk = Math.max(mk, back(b));
        const c = contHit(b), f = fadeHit(b);
        if (c || f) { outcome = c && f ? 'both' : c ? 'cont' : 'fade'; resolveK = j; }
      }
    }
    const lastMove = (up ? bars.at(-1).close - t.level : t.level - bars.at(-1).close) / unit;   // + = continue side
    return {
      date: d.date, line: t.line, k, time: t.time, sameBar: sameBar ? 1 : 0,
      dc: r4(dc), df: r4(df), outcome, mins: resolveK == null ? null : Math.round((bars[resolveK].time - t.time) / 60),
      beyondBefore: r4(mb / unit), backBefore: r4(mk / unit), dayBeyond: r4(dayB / unit), dayBack: r4(dayK / unit),
      lastMove: r4(lastMove), costSig: r4(COST / 100 * d.open / unit), pipsPerSig: r4(unit / PIP),
      ...sit, ...pre,
    };
  });
}

const full = await loadM1ForPair(PAIR);
const ctx = buildContext(full, OPTS);
const rows = ctx.days.flatMap((_, di) => touchRows(ctx, di));

// ── Self-check: replace everything AFTER the touch bar; the touch, its situation and
// its targets must not change (only the outcome/excursions may).
{
  const idx = new Map(Array.from(full.times, (x, i) => [x, i]));
  const keep = r => JSON.stringify({ line: r.line, k: r.k, dc: r.dc, df: r.df, sameBar: r.sameBar, londonMin: r.londonMin, used: r.used,
    linesBefore: r.linesBefore, mom60: r.mom60, sigmaReg: r.sigmaReg, hmm: r.hmm, yRange: r.yRange, event: r.event });
  const picks = rows.filter((_, i) => i % Math.floor(rows.length / 8) === 3).slice(0, 8);
  for (const r of picks) {
    const c2 = buildContext(scrambleFrom(full, idx.get(r.time) + 1, 17), OPTS);
    const again = touchRows(c2, c2.dayIdx.get(r.date)).find(x => x.line === r.line);
    if (!again || keep(again) !== keep(r)) { console.error(`LOOK-AHEAD ${r.date} ${r.line}\n ${keep(r)}\n ${again && keep(again)}`); process.exit(2); }
  }
  console.log(`self-check: ${picks.length} touches identical under future-scramble`);
}

fs.mkdirSync('analysis/output/rangebook', { recursive: true });
fs.writeFileSync(`analysis/output/rangebook/${PAIR}_touches.json`, JSON.stringify({ pair: SYM, cost: COST, rows }));
const oc = rows.reduce((a, r) => (a[r.outcome] = (a[r.outcome] ?? 0) + 1, a), {});
console.log(`${SYM}: ${rows.length} touches (${rows.filter(r => r.sameBar).length} same-bar) ${rows[0].date} -> ${rows.at(-1).date}; outcomes ${JSON.stringify(oc)}`);
