// global-read-untested-direction (forge/GLOBAL_READ_UNTESTED_DIRECTION_PREREG.md, A1). Run once.
//   node scripts/global-read-untested-direction/run.mjs <data dir>
// <data dir> holds D_<PAIR>.json and H_<PAIR>_<year>.json (/api/ohlc-range, London-midnight D and H1) and the FRED
// CSVs DGS10.csv, DTWEXBGS.csv, BAA10Y.csv, BAMLH0A0HYM2.csv. Writes analysis/output/global-read-untested-direction/.
import fs from 'node:fs';
import { fitHMM } from '../../hmm.js';
import { holm, benjaminiHochberg } from '../../js/preregStats.js';

const DIR = process.argv[2], OUT = 'analysis/output/global-read-untested-direction';
const SEED = 20261105, B = 2000, BLOCK = 21, FROM = '2016-01-04', TO = '2026-08-21', SPLIT = '2021-05-01', BAR = 0.05;
const PAIRS = { EURUSD: ['EUR', 'USD'], GBPUSD: ['GBP', 'USD'], USDJPY: ['USD', 'JPY'], AUDUSD: ['AUD', 'USD'], NZDUSD: ['NZD', 'USD'], USDCAD: ['USD', 'CAD'], USDCHF: ['USD', 'CHF'] };
const RISK_BETA = { AUDUSD: 1, NZDUSD: 1, USDCAD: -1, USDJPY: 1, USDCHF: 1, EURUSD: 0.5, GBPUSD: 0.5 };
const clip1 = v => Math.max(-1, Math.min(1, v));
const wk = d => ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay());
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

// ── data ──
const fred = id => fs.readFileSync(`${DIR}/${id}.csv`, 'utf8').trim().split('\n').slice(1).map(l => l.split(',')).filter(([, v]) => v && v !== '.').map(([d, v]) => ({ date: d, value: +v }));
const F = { dgs10: fred('DGS10'), dxy: fred('DTWEXBGS'), baa: fred('BAA10Y'), hy: fred('BAMLH0A0HYM2') };
// the latest observation dated strictly before `cut`, and its 20-observations-earlier partner
function d20(series, cut) {
  let lo = 0, hi = series.length - 1, i = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (series[m].date < cut) { i = m; lo = m + 1; } else hi = m - 1; }
  return i >= 20 ? { last: series[i].value, prev: series[i - 20].value } : null;
}
const daily = {}, closes = {};
for (const p of Object.keys(PAIRS)) {
  const v = JSON.parse(fs.readFileSync(`${DIR}/D_${p}.json`)).values.map(x => ({ date: x.datetime.slice(0, 10), close: +x.close })).filter(x => wk(x.date) && x.close > 0);
  daily[p] = v; closes[p] = new Map(v.map(x => [x.date, x.close]));
}
// London hour of a UTC instant
const lonFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
const lon = ms => { const p = Object.fromEntries(lonFmt.formatToParts(new Date(ms)).map(x => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour }; };

// ── reads 1-4 (daily) ──
const rows = { 'hmm-trend': {}, 'us-yields': {}, 'dollar-tape': {}, 'risk-tone': {}, 'risk-tone-hy': {} };
let hmmFits = 0;
for (const [p, [base]] of Object.entries(PAIRS)) {
  const usdSide = base === 'USD' ? 1 : -1, v = daily[p];
  for (const k of Object.keys(rows)) rows[k][p] = [];
  for (let i = 201; i + 2 < v.length; i++) {
    const t = v[i].date, t1 = v[i + 1].date; if (t < FROM || t1 > TO) continue;
    const y = Math.log(v[i + 1].close / v[i].close), y2 = Math.log(v[i + 2].close / v[i + 1].close);
    const put = (k, s) => { if (Number.isFinite(s)) rows[k][p].push({ date: t, s, y, y2: v[i + 2].date <= TO ? y2 : NaN }); };
    // 1. HMM: 200 returns ending at t (201 closes), the live fit
    const rets = []; for (let j = i - 199; j <= i; j++) rets.push(Math.log(v[j].close / v[j - 1].close));
    const h = fitHMM(rets); hmmFits++;
    put('hmm-trend', !h?.trendDirConfident ? 0 : h.trendDir === 'BULL' ? 1 : h.trendDir === 'BEAR' ? -1 : 0);
    // FRED: point-in-time. Close of London day t is ~19:00 New York, so a series published the next business day is known
    // only for dates before t; the broad dollar (H.10, weekly) only for dates at least 7 days before t
    const us = d20(F.dgs10, t); if (us) put('us-yields', usdSide * clip1((us.last - us.prev) * 100 / 25));
    const dx = d20(F.dxy, addDays(t, -6)); if (dx) put('dollar-tape', usdSide * clip1(100 * (dx.last - dx.prev) / dx.prev / 2));
    const ba = d20(F.baa, t); if (ba) put('risk-tone', RISK_BETA[p] * clip1(-(ba.last - ba.prev) * 100 / 25));
    const hy = d20(F.hy, t); if (hy) put('risk-tone-hy', RISK_BETA[p] * clip1(-(hy.last - hy.prev) * 100 / 50));
  }
}

// ── read 5 (intraday): London 00:00 open, checkpoints 10/13/16, outcome to 21:00 ──
const tape = { 10: {}, 13: {}, 16: {} };
for (const p of Object.keys(PAIRS)) {
  const day = new Map();   // London date → { o (open of the 00:00 bar), c: {hour: close of the bar ending at that hour} }
  for (let y = 2016; y <= 2026; y++) {
    const f = `${DIR}/H_${p}_${y}.json`; if (!fs.existsSync(f)) continue;
    for (const b of JSON.parse(fs.readFileSync(f)).values) {
      const ms = b.t * 1000, L = lon(ms), d = day.get(L.date) ?? { o: null, c: {} }; day.set(L.date, d);
      if (L.hour === 0) d.o = +b.open;
      const E = lon(ms + 3600e3); if (E.date === L.date || E.hour === 0) (day.get(L.date).c)[E.hour === 0 ? 24 : E.hour] = +b.close;
    }
  }
  const dv = daily[p];
  for (const c of [10, 13, 16]) tape[c][p] = [];
  for (let i = 21; i < dv.length; i++) {
    const d = dv[i].date; if (d < FROM || d > TO) continue;
    const rec = day.get(d); if (!rec?.o || !rec.c[21]) continue;
    const r20 = []; for (let j = i - 20; j < i; j++) r20.push(Math.log(dv[j].close / dv[j - 1].close));
    const m = r20.reduce((a, b) => a + b, 0) / 20, sd = Math.sqrt(r20.reduce((a, b) => a + (b - m) ** 2, 0) / 19); if (!(sd > 0)) continue;
    for (const c of [10, 13, 16]) { const pc = rec.c[c]; if (!pc) continue; tape[c][p].push({ date: d, s: clip1(((pc - rec.o) / rec.o) / (0.6745 * sd)), y: Math.log(rec.c[21] / pc), y2: NaN }); }
  }
}

// ── statistics ──
const corr = (a, b) => { const n = a.length; if (n < 30) return NaN; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { const u = a[i] - ma, w = b[i] - mb; sab += u * w; saa += u * u; sbb += w * w; } return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : NaN; };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function cell(byPair, key = 'y', { boot = true } = {}) {
  const pairs = Object.keys(byPair).filter(p => byPair[p].length >= 30);
  const ic = (rowsOf, k = key) => { const v = pairs.map(p => { const r = rowsOf(p).filter(x => Number.isFinite(x[k])); return corr(r.map(x => x.s), r.map(x => x[k])); }).filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN; };
  const all = p => byPair[p], per = Object.fromEntries(pairs.map(p => [p, corr(byPair[p].map(x => x.s), byPair[p].map(x => x[key]))]));
  const out = { n: pairs.reduce((a, p) => a + byPair[p].length, 0), days: new Set(pairs.flatMap(p => byPair[p].map(x => x.date))).size, ic: ic(all), per,
    halves: [ic(p => byPair[p].filter(x => x.date < SPLIT)), ic(p => byPair[p].filter(x => x.date >= SPLIT))], nonzero: pairs.reduce((a, p) => a + byPair[p].filter(x => x.s !== 0).length, 0) };
  if (!boot) return out;
  // date-block bootstrap: the same resampled dates for every pair (they share the dollar)
  const dates = [...new Set(pairs.flatMap(p => byPair[p].map(x => x.date)))].sort(), idx = new Map(dates.map((d, i) => [d, i]));
  const at = Object.fromEntries(pairs.map(p => [p, byPair[p].map(x => [idx.get(x.date), x.s, x[key]])]));
  const byDate = Object.fromEntries(pairs.map(p => { const m = new Map(); for (const [i, s, y] of at[p]) m.set(i, [s, y]); return [p, m]; }));
  const R = rng(SEED), bs = [], bsP = Object.fromEntries(pairs.map(p => [p, []]));
  for (let b = 0; b < B; b++) {
    const pick = []; while (pick.length < dates.length) { const st = Math.floor(R() * dates.length); for (let k = 0; k < BLOCK && pick.length < dates.length; k++) pick.push((st + k) % dates.length); }
    const ics = [];
    for (const p of pairs) { const a = [], c = []; for (const i of pick) { const r = byDate[p].get(i); if (r && Number.isFinite(r[1]) && Number.isFinite(r[0])) { a.push(r[0]); c.push(r[1]); } } const v = corr(a, c); bsP[p].push(v); if (Number.isFinite(v)) ics.push(v); }
    bs.push(ics.reduce((x, y) => x + y, 0) / ics.length);
  }
  const se = sd(bs), pOf = arr => { const f = arr.filter(Number.isFinite), m = f.reduce((a, b) => a + b, 0) / f.length, s = sd(f); return 2 * (1 - nc(Math.abs(m) / s)); };
  const sorted = [...bs].sort((a, b) => a - b);
  return { ...out, se, t: out.ic / se, p: 2 * (1 - nc(Math.abs(out.ic) / se)), ci95: [sorted[Math.floor(0.025 * B)], sorted[Math.floor(0.975 * B)]], mde: 2.8 * se,
    perP: Object.fromEntries(pairs.map(p => [p, 2 * (1 - nc(Math.abs(per[p]) / sd(bsP[p].filter(Number.isFinite))))])) };
}
function sd(a) { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); }
function nc(z) { const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2); return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y); }

const SCORED = { 'hmm-trend': ['gr-hmm-trend-direction', rows['hmm-trend']], 'us-yields': ['gr-us-yields-direction', rows['us-yields']], 'dollar-tape': ['gr-dollar-tape-direction', rows['dollar-tape']], 'risk-tone': ['gr-risk-tone-direction', rows['risk-tone']], 'today-tape': ['gr-today-tape-direction', tape[13]] };
const res = {};
for (const [k, [id, byPair]] of Object.entries(SCORED)) { res[k] = { id, ...cell(byPair) }; if (k !== 'today-tape') res[k].timeShift = cell(byPair, 'y2', { boot: false }).ic; console.error(k, 'done'); }
const H = holm(Object.values(res).map(r => r.p), 0.05);
Object.values(res).forEach((r, i) => {
  r.holmP = H.adjusted[i];
  const pass = H.rejected[i] && r.ic >= BAR && r.halves.every(h => h > 0);
  r.powered = r.mde <= BAR;
  r.verdict = pass ? 'VALIDATED' : r.powered ? 'NULL' : 'UNDERPOWERED';
});
// descriptive cells
const desc = { 'risk-tone-hy (live input, 2023-11 on)': cell(rows['risk-tone-hy']), 'today-tape 10:00': cell(tape[10]), 'today-tape 16:00': cell(tape[16]) };
const dis = []; for (const [k, r] of Object.entries(res)) for (const [p, pv] of Object.entries(r.perP)) dis.push({ cell: k, pair: p, ic: r.per[p], p: pv });
for (const k of ['today-tape 10:00', 'today-tape 16:00']) for (const [p, pv] of Object.entries(desc[k].perP)) dis.push({ cell: k, pair: p, ic: desc[k].per[p], p: pv });
const bh = benjaminiHochberg(dis.map(d => d.p), 0.10); dis.forEach((d, i) => (d.bh = bh.pass?.[i] ?? bh.rejected?.[i] ?? false));
const out = { id: 'global-read-untested-direction', seed: SEED, B, block: BLOCK, window: [FROM, TO], split: SPLIT, bar: BAR, hmmFits, ranAt: new Date().toISOString(), scored: res, descriptive: desc, disaggregation: dis };
fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(out, null, 1));
for (const [k, r] of Object.entries(res)) console.log(`${k.padEnd(12)} IC ${r.ic.toFixed(4)} [${r.ci95[0].toFixed(4)}, ${r.ci95[1].toFixed(4)}] t ${r.t.toFixed(2)} p ${r.p.toFixed(4)} holm ${r.holmP.toFixed(4)} halves ${r.halves.map(h => h.toFixed(4)).join('/')} MDE ${r.mde.toFixed(3)} n ${r.n} nonzero ${r.nonzero} shift ${r.timeShift?.toFixed(4) ?? '-'} → ${r.verdict}`);
for (const [k, r] of Object.entries(desc)) console.log(`  desc ${k}: IC ${r.ic.toFixed(4)} [${r.ci95[0].toFixed(4)}, ${r.ci95[1].toFixed(4)}] halves ${r.halves.map(h => Number.isFinite(h) ? h.toFixed(4) : '-').join('/')} n ${r.n}`);
console.log('BH survivors:', dis.filter(d => d.bh).map(d => `${d.cell}/${d.pair} ${d.ic.toFixed(3)}`).join(', ') || 'none', `(of ${dis.length})`);
