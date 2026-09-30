// DESCRIPTIVE check (not pre-registered) of an outside finding: after the FIRST touch of
// the Close median, does a push of 0.25 × the Close-median distance BEYOND the line
// (vs a 0.25× pullback first) predict reaching the Close 75th that day — and does
// entering on the push, targeting the 75th, beat the spread?
//   node scripts/rangebook/confirmed_break_check.mjs eurusd|gold|nq
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { costForPair } from '../../js/perLineStrategy.js';
import { buildContext, touchSetups } from './common.mjs';

const PAIR = process.argv[2] ?? 'eurusd', SYM = PAIR.toUpperCase(), ASSET = assetClassFor(PAIR), COST = costForPair(PAIR, ASSET);
const ctx = buildContext(await loadM1ForPair(PAIR), { sym: SYM, assetClass: ASSET, tagFor: loadCalendarProxy()(SYM) });
const SPLIT = '2023-01-01', F = 0.25;
const rows = [];
ctx.days.forEach((_, di) => {
  for (const s of touchSetups(ctx, di)) {
    if (!s.t.line.startsWith('Close') || !s.t.line.endsWith('_p50') || s.sameBar) continue;
    const { d, up, k, t } = s, bars = d.bars, sg = up ? 1 : -1;
    const D = Math.abs(t.level - d.open), push = t.level + sg * F * D, pull = t.level - sg * F * D, p75 = s.tg.cont;
    let first = null, fk = null;
    for (let j = k + 1; j < bars.length && !first; j++) {
      const b = bars[j], hp = up ? b.high >= push : b.low <= push, hb = up ? b.low <= pull : b.high >= pull;
      if (hp && hb) first = 'both'; else if (hp) { first = 'push'; fk = j; } else if (hb) first = 'pull';
    }
    if (!first) first = 'neither';
    let reach75 = 0; for (let j = k + 1; j < bars.length; j++) if (up ? bars[j].high >= p75 : bars[j].low <= p75) { reach75 = 1; break; }
    // Trade on the push: enter at `push`, target the Close 75th; two stops (back at the line, or at the pullback level).
    const trades = {};
    if (first === 'push') for (const [name, stop] of [['stopAtLine', t.level], ['stopAtPull', pull]]) {
      const risk = Math.abs(push - stop), reward = Math.abs(p75 - push);
      let r = null;
      if (bars[fk][up ? 'low' : 'high'] * sg <= stop * sg) r = -1;               // fill bar may stop, not target
      for (let j = fk + 1; j < bars.length && r == null; j++) {
        const b = bars[j];
        if (up ? b.low <= stop : b.high >= stop) r = -1;
        else if (up ? b.high >= p75 : b.low <= p75) r = reward / risk;
      }
      if (r == null) r = Math.max(-1, sg * (bars.at(-1).close - push) / risk);
      trades[name] = { r: r - (COST / 100 * d.open) / risk, be: risk / (risk + reward) };
    }
    rows.push({ date: d.date, first, reach75, trades });
  }
});
const pct = x => `${(100 * x).toFixed(0)}%`;
const st = xs => { const n = xs.length, m = xs.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)); return { m, t: m / sd * Math.sqrt(n), n }; };
console.log(`\n${SYM} — first touches of the Close median (${rows.length}), ${rows[0].date} → ${rows.at(-1).date}`);
for (const [lab, sel] of [['2016–22', r => r.date < SPLIT], ['2023–26', r => r.date >= SPLIT]]) {
  const R = rows.filter(sel);
  const line = f => { const x = R.filter(r => r.first === f); return `${f.padEnd(8)} ${pct(x.length / R.length).padStart(4)} of touches → reach 75th later: ${pct(x.reduce((a, r) => a + r.reach75, 0) / (x.length || 1))} (n ${x.length})`; };
  console.log(` ${lab}:\n   ${line('push')}\n   ${line('pull')}\n   ${line('neither')}`);
  for (const name of ['stopAtLine', 'stopAtPull']) {
    const tr = R.filter(r => r.trades[name]).map(r => r.trades[name]);
    const s = st(tr.map(x => x.r)), be = tr.reduce((a, x) => a + x.be, 0) / tr.length;
    console.log(`   trade on push, ${name === 'stopAtLine' ? 'stop back at the line   ' : 'stop at the pullback lvl'}: n ${s.n}, win ${pct(tr.filter(x => x.r > 0).length / tr.length)} vs break-even ${pct(be)}, net ${s.m >= 0 ? '+' : ''}${s.m.toFixed(3)}R (t ${s.t.toFixed(1)})`);
  }
}
