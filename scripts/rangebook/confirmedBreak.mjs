// The "confirmed break" rule on the Close median (forge/CONFIRMED_BREAK_INDICES_PREREG.md):
// after the first touch, whichever comes first of a push F·D beyond the line or a pullback
// F·D inside (D = |Close p50 − open|); on a push, follow from the push level to Close p75
// with two stop variants. One function shared by the exploratory check and the test.
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { costForPair } from '../../js/perLineStrategy.js';
import { buildContext, touchSetups } from './common.mjs';

export async function confirmedBreakRows(pair, F = 0.25) {
  const SYM = pair.toUpperCase(), ASSET = assetClassFor(pair), COST = costForPair(pair, ASSET);
  const ctx = buildContext(await loadM1ForPair(pair), { sym: SYM, assetClass: ASSET, tagFor: loadCalendarProxy()(SYM) });
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
  return rows;
}
