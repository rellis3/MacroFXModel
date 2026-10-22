// H1 / H4 trend state at each book pass (forge/MACRO_TREND_WEEKDAY_PREREG.md section B).
//   node scripts/rangebook/htf_trend_build.mjs [pair]  -> analysis/output/rangebook/<pair>_htf.json
// Clock-aligned H1/H4 bars; EMA20/EMA50 of closes; state from the last bar COMPLETED before the pass bar:
// +1 = close > EMA20 > EMA50, -1 = close < EMA20 < EMA50, 0 otherwise.
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
const PAIR = (process.argv[2] ?? 'eurusd').toLowerCase();
function lowerBound(a, x) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; }
function tf(S, sec) {
  const s = [], c = [];
  for (let i = 0; i < S.n; i++) { const b = Math.floor(S.times[i] / sec) * sec; if (s.at(-1) !== b) { s.push(b); c.push(S.closes[i]); } else c[c.length - 1] = S.closes[i]; }
  const ema = n => { const k = 2 / (n + 1), o = new Float64Array(c.length); o[0] = c[0]; for (let i = 1; i < c.length; i++) o[i] = c[i] * k + o[i - 1] * (1 - k); return o; };
  const e20 = ema(20), e50 = ema(50);
  return { s, sec, state: i => i < 50 ? null : c[i] > e20[i] && e20[i] > e50[i] ? 1 : c[i] < e20[i] && e20[i] < e50[i] ? -1 : 0 };
}
const S = await loadM1ForPair(PAIR);
const H1 = tf(S, 3600), H4 = tf(S, 4 * 3600);
const at = (H, t) => { const i = lowerBound(H.s, t - H.sec + 1) - 1; return i >= 0 ? H.state(i) : null; };   // last bar with start + sec <= t
const seq = JSON.parse(fs.readFileSync(`analysis/output/rangebook/${PAIR}_sequence.json`, 'utf8')).passes.filter(p => !p.sameBar);
const rows = seq.map(p => ({ key: `${p.date}|${p.line}|${p.pass}`, h1: at(H1, p.time), h4: at(H4, p.time) }));
// self-check: a state uses only bars completed before the pass bar -> scrambling from the pass bar on cannot change it
{
  const idx = new Map(Array.from(S.times, (t, i) => [t, i]));
  const picks = seq.filter((_, i) => i % Math.floor(seq.length / 5) === 2).slice(0, 5);
  for (const p of picks) {
    const from = idx.get(p.time), q = { n: S.n, times: S.times, closes: Float64Array.from(S.closes) };
    for (let i = from; i < q.n; i++) q.closes[i] = S.closes[from - 1] * (1 + ((i * 7919) % 97 - 48) / 1000);
    const a = at(tf(q, 3600), p.time), b = at(tf(q, 4 * 3600), p.time), r = rows.find(x => x.key === `${p.date}|${p.line}|${p.pass}`);
    if (a !== r.h1 || b !== r.h4) { console.error(`LOOK-AHEAD ${r.key}: ${r.h1}/${r.h4} vs ${a}/${b}`); process.exit(2); }
  }
}
fs.writeFileSync(`analysis/output/rangebook/${PAIR}_htf.json`, JSON.stringify({ pair: PAIR, rows }));
const c = k => [1, 0, -1].map(v => rows.filter(r => r[k] === v).length);
console.log(`${PAIR.toUpperCase()}: ${rows.length} passes; H1 up/neutral/down ${c('h1')}; H4 ${c('h4')}; self-check ok`);
