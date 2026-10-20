// range-edge-limit-fade — POST-HOC, DESCRIPTIVE ONLY (results already seen; not a test).
//
// Why does a real location effect at the Asia edges (range-ladder-placebo-confirm:
// +3 pp reversion, 15/15 instruments) not survive as a trade? Split the book's own
// race (analyseRangeWindow, mid prices, unedited) at A_0/A_1 by the cost of trading it:
// spread at validFrom ÷ R (R = 0.5 × Asia range), against K = 4 shifted placebo ladders.
//
//   node scripts/range-edge-limit-fade/explain_by_cost.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { buildRangeLadder, analyseRangeWindow } = await import('../../js/rangeLineAnalyser.js');
const { bodyRange } = await import('../../js/barUtils.js');
const { mulberry32 } = await import('../../js/rangeLevelCore.js');

const SEED = 20261020, K = 4, U_MIN = 0.10, U_MAX = 0.40, END = '2026-08-20', MIN_BARS = 30, MIN_LOOKBACK = 20;
const COLS = ['open', 'high', 'low', 'close', 'bid_o', 'bid_h', 'bid_l', 'bid_c', 'ask_o', 'ask_h', 'ask_l', 'ask_c'];
const BUCKETS = [[0, 0.10, '≤ 0.10 (placed by the rule)'], [0.10, 0.20, '0.10–0.20'], [0.20, 0.40, '0.20–0.40'], [0.40, Infinity, '> 0.40']];
const keys = fs.readdirSync(path.join(ROOT, 'data', 'm1_bidask_bin')).map(f => f.replace('.bin', '')).sort();

function load(key) {
  const buf = fs.readFileSync(path.join(ROOT, 'data', 'm1_bidask_bin', `${key}.bin`));
  const n = buf.readInt32LE(0), ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const time = new Int32Array(ab, 4, n), base = 4 + 4 * n, c = {};
  COLS.forEach((name, j) => { c[name] = new Float64Array(ab.slice(base + 8 * n * j, base + 8 * n * (j + 1))); });
  return { n, time, ...c };
}
const ymd = s => new Date(s * 1000).toISOString().slice(0, 10);
const dowOf = d => new Date(d + 'T00:00:00Z').getUTCDay();

const tally = BUCKETS.map(() => ({ rN: 0, rY: 0, pN: 0, pY: 0, sess: 0 }));
const rng = mulberry32(SEED);
for (const key of keys) {
  const d = load(key);
  const sess = [];
  for (let k = 0; k < d.n;) {
    const day = Math.floor(d.time[k] / 86400); let j = k;
    while (j < d.n && Math.floor(d.time[j] / 86400) === day) j++;
    const date = ymd(day * 86400);
    if (j - k >= MIN_BARS && dowOf(date) % 6 !== 0 && date <= END) sess.push([k, j]);
    k = j;
  }
  for (let s = MIN_LOOKBACK; s < sess.length; s++) {
    const [i0, i1] = sess[s], validFrom = d.time[i0] + 6 * 3600;
    const bars = [];
    for (let k = i0; k < i1; k++) bars.push({ time: d.time[k], open: d.open[k], high: d.high[k], low: d.low[k], close: d.close[k] });
    const ar = bodyRange(bars.filter(b => b.time < validFrom), 5);
    const shifts = Array.from({ length: K }, () => (U_MIN + rng() * (U_MAX - U_MIN)) * (rng() < 0.5 ? -1 : 1));
    let pre = -1; for (let k = i0; k < i1 && d.time[k] < validFrom; k++) pre = k;
    if (!ar || pre < 0 || pre === i1 - 1) continue;
    const ratio = (d.ask_c[pre] - d.bid_c[pre]) / (0.5 * ar.range);
    const b = BUCKETS.findIndex(([lo, hi]) => ratio > lo - 1e-12 && ratio <= hi);
    if (b < 0) continue;
    tally[b].sess++;
    const lad = { low: ar.low, high: ar.high, validFrom, levels: buildRangeLadder(ar.low, ar.range, 'A') };
    for (const ln of analyseRangeWindow({ open: bars[0].open, bars }, [lad], {}))
      if (ln.name === 'A_0' || ln.name === 'A_1') { tally[b].rN++; tally[b].rY += ln.outcome === 'reverted' ? 1 : 0; }
    for (const u of shifts) {
      const sh = u * ar.range;
      const pl = { low: ar.low + sh, high: ar.high + sh, validFrom, levels: lad.levels.map(l => ({ ...l, level: l.level + sh })) };
      for (const ln of analyseRangeWindow({ open: bars[0].open, bars }, [pl], {}))
        if (ln.name === 'A_0' || ln.name === 'A_1') { tally[b].pN++; tally[b].pY += ln.outcome === 'reverted' ? 1 : 0; }
    }
  }
  process.stdout.write(`${key} `);
}
const rows = BUCKETS.map(([, , label], i) => {
  const t = tally[i], r = 100 * t.rY / t.rN, p = 100 * t.pY / t.pN;
  return { bucket: label, sessions: t.sess, realTouches: t.rN, realRevertPct: +r.toFixed(2), placeboRevertPct: +p.toFixed(2), deltaPP: +(r - p).toFixed(2) };
});
const OUT = path.join(ROOT, 'analysis', 'output', 'range-edge-limit-fade');
fs.writeFileSync(path.join(OUT, 'explain_by_cost.json'), JSON.stringify({ note: 'POST-HOC descriptive, not a test', seed: SEED, rows }, null, 1));
console.log('\n'); console.table(rows);
