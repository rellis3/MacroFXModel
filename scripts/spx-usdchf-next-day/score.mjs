// spx-usdchf-next-day scorer (forge/SPX_USDCHF_NEXT_DAY_PREREG.md). Needs OANDA_KEY.
//   node scripts/spx-usdchf-next-day/score.mjs            counts the usable sessions; prints the result only when the
//                                                         prereg allows (the futility look at 500, the judgement at 765)
// Writes analysis/output/spx-usdchf-next-day/results.json once a look is due. Nothing is printed or saved earlier, so
// running it to check the count does not peek.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fetchD1 } from '../../js/volBacktestEngine.js';
import { aligned, score, gate, rule, WINDOW_START, N_FUTILITY } from './lib.mjs';

const OUT = 'analysis/output/spx-usdchf-next-day';
const [spx, chf, dow] = await Promise.all(['SPX500_USD', 'USD_CHF', 'US30_USD'].map(s => fetchD1(s, 5000)));
const rows = aligned(spx, chf), inWindow = rows.filter(r => r.date >= WINDOW_START).length;
if (inWindow - 1 < N_FUTILITY) {
  console.log(`spx-usdchf-next-day: ${inWindow} common sessions since ${WINDOW_START}; the first look is at ${N_FUTILITY}. Nothing computed.`);
  process.exit(0);
}
const s = score(rows), g = gate(s), dowS = score(aligned(dow, chf)), tr = rule(rows);
const out = { id: 'spx-usdchf-next-day', seed: 20261105, ranAt: new Date().toISOString(), window: { from: s.from, to: s.to, n: s.n }, h1: s, gate: g, replicationDow: dowS, tradeCell: tr };
mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/results.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ stage: g.stage, verdict: g.verdict, why: g.why, r: s.r, n: s.n }, null, 2));
