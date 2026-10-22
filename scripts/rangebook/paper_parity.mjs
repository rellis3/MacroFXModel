// Parity: the live paper-record core (MacroFXModel-paper/js/paperRecordCore.js) must reproduce asym_build.mjs's BREAK trades.
//   node scripts/rangebook/paper_parity.mjs gold
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { costForPair } from '../../js/perLineStrategy.js';
import { buildContext } from './common.mjs';
const core = await import(pathToFileURL(path.resolve('../MacroFXModel-paper/js/paperRecordCore.js')).href);
const PAIR = process.argv[2] ?? 'gold', SYM = PAIR.toUpperCase(), ASSET = assetClassFor(PAIR), COST = costForPair(PAIR, ASSET);
const ctx = buildContext(await loadM1ForPair(PAIR), { sym: SYM, assetClass: ASSET, tagFor: loadCalendarProxy()(SYM) });
const ref = JSON.parse(fs.readFileSync(`analysis/output/rangebook/${PAIR}_asym.json`, 'utf8')).rows.filter(r => r.type === 'BREAK');
const refK = new Map(ref.map(r => [`${r.date}|${r.line}`, r]));
let n = 0, bad = 0, missing = 0, extra = 0;
for (const d of ctx.days) {
  const unit = d.sigmaFrac * d.open; if (!(unit > 0) || !d.static.OH_p75 || !d.static.OL_p75) continue;
  for (const b of core.detectBreaks(d, d.bars)) {
    const r = refK.get(`${d.date}|${b.line}`); if (!r) { extra++; continue; }
    const s = core.scoreTrade(d, d.bars, b, COST / 100 * d.open, true);
    const mine = [b.entryK, b.dir, ...['0.1σ/5R', '0.1σ/10R', '0.2σ/5R', '0.2σ/10R'].map(k => s.variants[k]?.R)];
    const theirs = [r.k, r.dir, r['s0.1']?.r5?.R, r['s0.1']?.r10?.R, r['s0.2']?.r5?.R, r['s0.2']?.r10?.R];
    const same = mine.every((v, i) => v === theirs[i] || (v != null && theirs[i] != null && Math.abs(v - theirs[i]) < 0.0015));
    n++; if (!same && bad++ < 3) console.log('DIFF', d.date, b.line, mine, theirs);
    refK.delete(`${d.date}|${b.line}`);
  }
}
missing = refK.size;
console.log(`${SYM}: ${n} matched trades, ${bad} differ, ${missing} in backtest not found, ${extra} extra`);
