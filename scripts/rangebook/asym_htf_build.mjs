// H1 / H4 trend state at each BREAK signal of asym_build (forge/STACK_RICHIV_TREND_PREREG.md).
//   node scripts/rangebook/asym_htf_build.mjs [pair]  -> analysis/output/rangebook/<pair>_asym_htf.json
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
const PAIR = (process.argv[2] ?? 'gold').toLowerCase();
function lowerBound(a, x) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; }
function tf(S, sec) {
  const s = [], c = [];
  for (let i = 0; i < S.n; i++) { const b = Math.floor(S.times[i] / sec) * sec; if (s.at(-1) !== b) { s.push(b); c.push(S.closes[i]); } else c[c.length - 1] = S.closes[i]; }
  const ema = n => { const k = 2 / (n + 1), o = new Float64Array(c.length); o[0] = c[0]; for (let i = 1; i < c.length; i++) o[i] = c[i] * k + o[i - 1] * (1 - k); return o; };
  const e20 = ema(20), e50 = ema(50);
  return { s, sec, state: i => i < 50 ? null : c[i] > e20[i] && e20[i] > e50[i] ? 1 : c[i] < e20[i] && e20[i] < e50[i] ? -1 : 0 };
}
const lastSun = (y, m) => { const d = new Date(Date.UTC(y, m + 1, 0)); return d.getUTCDate() - d.getUTCDay(); };
function ukMidnight(date) {              // epoch of 00:00 Europe/London
  const [y, m, d] = date.split('-').map(Number), u = Date.UTC(y, m - 1, d) / 1000;
  const a = Date.UTC(y, 2, lastSun(y, 2), 1) / 1000, b = Date.UTC(y, 9, lastSun(y, 9), 1) / 1000;
  return u >= a && u < b ? u - 3600 : u;
}
const S = await loadM1ForPair(PAIR);
const H1 = tf(S, 3600), H4 = tf(S, 4 * 3600);
const at = (H, t) => { const i = lowerBound(H.s, t - H.sec + 1) - 1; return i >= 0 ? H.state(i) : null; };
const rows = JSON.parse(fs.readFileSync(`analysis/output/rangebook/${PAIR}_asym.json`, 'utf8')).rows.filter(r => r.type === 'BREAK')
  .map(r => { const t = ukMidnight(r.date) + r.min * 60; return { date: r.date, line: r.line, dir: r.dir, min: r.min, h1: at(H1, t), h4: at(H4, t) }; });
fs.writeFileSync(`analysis/output/rangebook/${PAIR}_asym_htf.json`, JSON.stringify({ pair: PAIR, rows }));
const c = k => [1, 0, -1].map(v => rows.filter(r => r[k] === v).length);
console.log(`${PAIR.toUpperCase()}: ${rows.length} breaks; H1 up/neutral/down ${c('h1')}; H4 ${c('h4')}`);
