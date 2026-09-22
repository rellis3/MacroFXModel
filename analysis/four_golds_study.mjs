#!/usr/bin/env node
/**
 * The four golds -- G1 (fear gold, base rate) and G2 (how often each gold trades).
 * Design frozen in MD files/FOUR_GOLDS.md before this ran.
 *   python scratchpad/runstudy.py analysis/four_golds_study.mjs   (OANDA_KEY in env)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchD1Aligned } from '../js/volBacktestEngine.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output', 'four_golds.json');
const REPS = 1000;
let seed = 20260921; const rnd = () => { seed += 0x6D2B79F5; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const mean = x => x.length ? x.reduce((s, v) => s + v, 0) / x.length : null;
const r3 = v => v == null || !Number.isFinite(v) ? null : +v.toFixed(3);
const drawBlock = (x, block) => { const n = x.length, nb = Math.ceil(n / block), s = []; for (let q = 0; q < nb; q++) { const st = Math.floor(rnd() * (n - block + 1)); for (let i = 0; i < block && s.length < n; i++) s.push(x[st + i]); } return s; };
const bootDiff = (a, b, block = 20) => { if (a.length < 5 || b.length < block) return null; const out = []; for (let k = 0; k < REPS; k++) out.push(mean(drawBlock(a, Math.min(block, a.length))) - mean(drawBlock(b, block))); out.sort((p, q) => p - q); return { nA: a.length, nB: b.length, diff: r3(mean(a) - mean(b)), lo: r3(out[Math.floor(REPS * 0.025)]), hi: r3(out[Math.floor(REPS * 0.975)]) }; };
const wilson = (k, n) => { if (!n) return null; const p = k / n, z = 1.96; const d = 1 + z * z / n; const c = (p + z * z / (2 * n)) / d; const h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return { n, share: r3(p), lo: r3(c - h), hi: r3(c + h) }; };
async function fredCsv(id) { const t = await (await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`)).text(); return t.trim().split('\n').slice(1).map(l => { const [d, v] = l.split(','); return { date: d, value: parseFloat(v) }; }).filter(o => Number.isFinite(o.value)); }

const [vix, real, dxy] = await Promise.all(['VIXCLS', 'DFII10', 'DTWEXBGS'].map(fredCsv));
const bars = await fetchD1Aligned('XAU_USD', 5000, { dailyAlignment: 0, alignmentTimezone: 'Europe/London' });
const gBy = new Map(bars.map(b => [b.date, b.close]));
const vBy = new Map(vix.map(o => [o.date, o.value]));
// sessions = gold bars with a VIX close (VIX is the clock for G1)
const S = bars.filter(b => vBy.has(b.date)).map(b => ({ date: b.date, gold: b.close, vix: vBy.get(b.date) }));
console.log(`sessions ${S[0].date} -> ${S.at(-1).date} (${S.length})`);

// ── G1: fear gold ──
const spikes = []; let last = -999;
for (let i = 5; i < S.length - 20; i++) { if (S[i].vix - S[i - 5].vix >= 5 && i - last > 20) { spikes.push(i); last = i; } }
const ret = (i, k) => Math.log(S[i + k].gold / S[i - 1].gold) * 100;
const ev5 = spikes.map(i => ret(i, 5)), ev20 = spikes.map(i => ret(i, 20));
const inWin = new Set(); for (const i of spikes) for (let k = i - 20; k <= i + 20; k++) inWin.add(k);
const ctl5 = [], ctl20 = []; for (let i = 25; i < S.length - 20; i++) if (!inWin.has(i)) { ctl5.push(ret(i, 5)); ctl20.push(ret(i, 20)); }
const gaveBack = spikes.filter(i => ret(i, 5) > 0 && ret(i, 20) <= ret(i, 5) / 2).length;
const upAt5 = spikes.filter(i => ret(i, 5) > 0).length;
const g1 = { n: spikes.length, excess5: bootDiff(ev5, ctl5), excess20: bootDiff(ev20, ctl20), mean5: r3(mean(ev5)), mean20: r3(mean(ev20)), ctl5: r3(mean(ctl5)), ctl20: r3(mean(ctl20)), upAt5: wilson(upAt5, spikes.length), upThenGaveBack: wilson(gaveBack, spikes.length), episodes: spikes.slice(-10).map(i => ({ date: S[i].date, dVix: r3(S[i].vix - S[i - 5].vix), g5: r3(ret(i, 5)), g20: r3(ret(i, 20)) })) };
console.log(`G1: ${spikes.length} VIX spikes. gold +5 sessions ${g1.mean5}% vs control ${g1.ctl5}% -> excess ${JSON.stringify(g1.excess5)}; +20 ${g1.mean20}% vs ${g1.ctl20}% -> ${JSON.stringify(g1.excess20)}; up at +5 ${JSON.stringify(g1.upAt5)}; up then gave back half by +20 ${JSON.stringify(g1.upThenGaveBack)}`);

// ── G2: how often each gold trades (rolling 60-session regressions) ──
const rBy = new Map(real.map(o => [o.date, o.value])), dBy = new Map(dxy.map(o => [o.date, o.value]));
const R = []; let prev = null;
for (const b of bars) { if (!rBy.has(b.date) || !dBy.has(b.date)) continue; if (prev) R.push({ date: b.date, g: Math.log(b.close / prev.close) * 100, dr: (rBy.get(b.date) - rBy.get(prev.date)) * 100, dd: Math.log(dBy.get(b.date) / dBy.get(prev.date)) * 100 }); prev = b; }
const ols2 = rows => { // g = a + b1*dr + b2*dd ; returns t-stats
  const n = rows.length; const X = rows.map(r => [1, r.dr, r.dd]), y = rows.map(r => r.g);
  const XtX = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], Xty = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) { Xty[a] += X[i][a] * y[i]; for (let b = 0; b < 3; b++) XtX[a][b] += X[i][a] * X[i][b]; }
  const inv = m => { const [[a, b, c], [d, e, f], [g, h, i]] = m; const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g); return [[(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det], [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det], [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det]]; };
  const Vi = inv(XtX); const beta = Vi.map(row => row.reduce((s, v, j) => s + v * Xty[j], 0));
  const res = y.map((v, i) => v - X[i].reduce((s, x, j) => s + x * beta[j], 0)); const s2 = res.reduce((s, v) => s + v * v, 0) / (n - 3);
  return { bReal: beta[1], tReal: beta[1] / Math.sqrt(s2 * Vi[1][1]), bDxy: beta[2], tDxy: beta[2] / Math.sqrt(s2 * Vi[2][2]) };
};
const labels = { rates: 0, dollar: 0, both: 0, neither: 0, wrongSign: 0 }; const series = [];
for (let i = 60; i <= R.length; i += 5) { const f = ols2(R.slice(i - 60, i)); const ratesOk = f.tReal <= -2, dollarOk = f.tDxy <= -2; const wrong = f.tReal >= 2 || f.tDxy >= 2; const lab = ratesOk && dollarOk ? 'both' : ratesOk ? 'rates' : dollarOk ? 'dollar' : wrong ? 'wrongSign' : 'neither'; labels[lab]++; series.push({ date: R[i - 1].date, lab, tReal: r3(f.tReal), tDxy: r3(f.tDxy) }); }
const tot = Object.values(labels).reduce((s, v) => s + v, 0);
const g2 = { windows: tot, from: R[0].date, to: R.at(-1).date, shares: Object.fromEntries(Object.entries(labels).map(([k, v]) => [k, r3(v / tot)])), byYear: (() => { const by = {}; for (const s of series) { const y = s.date.slice(0, 4); (by[y] ??= { rates: 0, dollar: 0, both: 0, neither: 0, wrongSign: 0, n: 0 }); by[y][s.lab]++; by[y].n++; } return Object.fromEntries(Object.entries(by).map(([y, o]) => [y, Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'n').map(([k, v]) => [k, r3(v / o.n)]))])); })(), latest: series.at(-1) };
console.log(`G2: ${tot} 60-session windows ${g2.from}->${g2.to}: rates gold ${g2.shares.rates}, dollar gold ${g2.shares.dollar}, both ${g2.shares.both}, neither ${g2.shares.neither}, wrong sign ${g2.shares.wrongSign}; latest ${JSON.stringify(g2.latest)}`);
for (const y of ['2014', '2015', '2022', '2024', '2025', '2026']) if (g2.byYear[y]) console.log(`  ${y}: ${JSON.stringify(g2.byYear[y])}`);
fs.writeFileSync(OUT, JSON.stringify({ ranAt: new Date().toISOString(), g1, g2 }, null, 1)); console.log('written', OUT);
