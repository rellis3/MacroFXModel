#!/usr/bin/env node
/**
 * C1-C3 -- the 3-2-1 crack spread. Design frozen in MD files/CRACK_SPREAD.md.
 *   python scratchpad/runstudy.py analysis/crack_spread_study.mjs   (OANDA_KEY in env)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchD1Aligned } from '../js/volBacktestEngine.js';
import { crack321, crackHistory } from '../js/crackSpread.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output', 'crack_spread.json');
const W = 20, REPS = 1000;
let seed = 20260921; const rnd = () => { seed += 0x6D2B79F5; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const mean = x => x.length ? x.reduce((s, v) => s + v, 0) / x.length : null;
const median = x => { if (!x.length) return null; const s = [...x].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sd = x => { const m = mean(x); return Math.sqrt(mean(x.map(v => (v - m) ** 2))); };
const r3 = v => v == null || !Number.isFinite(v) ? null : +v.toFixed(3);
const drawBlock = (x, block) => { const n = x.length, nb = Math.ceil(n / block), s = []; for (let q = 0; q < nb; q++) { const st = Math.floor(rnd() * (n - block + 1)); for (let i = 0; i < block && s.length < n; i++) s.push(x[st + i]); } return s; };
const bootDiff = (a, b, block = 20) => { if (a.length < 5 || b.length < block) return null; const out = []; for (let k = 0; k < REPS; k++) out.push(mean(drawBlock(a, Math.min(block, a.length))) - mean(drawBlock(b, block))); out.sort((p, q) => p - q); return { nA: a.length, nB: b.length, diff: r3(mean(a) - mean(b)), lo: r3(out[Math.floor(REPS * 0.025)]), hi: r3(out[Math.floor(REPS * 0.975)]) }; };
const wilson = (k, n) => { if (!n) return null; const p = k / n, z = 1.96; const d = 1 + z * z / n; const c = (p + z * z / (2 * n)) / d; const h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return { n, share: r3(p), lo: r3(c - h), hi: r3(c + h) }; };
const corr = (a, b) => { const ma = mean(a), mb = mean(b); let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return sab / Math.sqrt(saa * sbb); };
const resid = (y, x) => { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; } const b = sxy / sxx; return y.map((v, i) => v - my - b * (x[i] - mx)); };
async function fredCsv(id) { const t = await (await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`)).text(); return t.trim().split('\n').slice(1).map(l => { const [d, v] = l.split(','); return { date: d, value: parseFloat(v) }; }).filter(o => Number.isFinite(o.value)); }

const [wti, gas, ho, bei] = await Promise.all(['DCOILWTICO', 'DGASNYH', 'DHOILNYH', 'T10YIE'].map(fredCsv));
const H = crackHistory({ wti, gasoline: gas, heatingOil: ho });   // [{date, wti, crack}]
console.log(`crack ${H[0].date} -> ${H.at(-1).date} (${H.length}); last ${H.at(-1).crack.toFixed(1)} $/bbl; median since 2010 ${median(H.filter(r => r.date >= '2010').map(r => r.crack)).toFixed(1)}`);
const beiBy = new Map(bei.map(o => [o.date, o.value]));
// 20-session windows
const rows = [];
for (let i = W; i < H.length; i++) {
  const a = H[i - W], b = H[i];
  rows.push({ i, date: b.date, dCrack: b.crack - a.crack, dOilPct: (b.wti / a.wti - 1) * 100, dBei: beiBy.has(a.date) && beiBy.has(b.date) ? (beiBy.get(b.date) - beiBy.get(a.date)) * 100 : null, crack: b.crack });
}
// z of the 20d crack change vs trailing 10y (~2520 sessions) of 20d changes
for (let k = 0; k < rows.length; k++) { const win = rows.slice(Math.max(0, k - 2520), k).map(r => r.dCrack); rows[k].z = win.length >= 500 ? (rows[k].dCrack - mean(win)) / sd(win) : null; }
for (const r of rows) { r.blow = r.z != null && r.z >= 2; r.disagree = r.dOilPct <= -5 && r.dCrack >= 5; r.agree = r.dOilPct <= -5 && r.dCrack <= -5; }
// first session of each blow-out episode (no re-fire inside 20 sessions)
const firsts = []; let last = -999; for (const r of rows) { if (r.blow && r.i - last > W) { firsts.push(r); last = r.i; } }
console.log(`blow-outs: ${firsts.length} episodes; disagreement windows ${rows.filter(r => r.disagree).length}, agreement ${rows.filter(r => r.agree).length}`);

// C1: next-20 realised range in ATR terms, per instrument
const c1 = {};
for (const [sym, name] of [['WTICO_USD', 'WTI'], ['USD_CAD', 'USDCAD'], ['XAU_USD', 'XAUUSD']]) {
  let bars = []; try { bars = await fetchD1Aligned(sym, 5000, { dailyAlignment: 0, alignmentTimezone: 'Europe/London' }); } catch (e) { console.log(`  ${name}: ${e.message}`); continue; }
  const idx = new Map(bars.map((b, i) => [b.date, i]));
  const atr = i => { const s = bars.slice(Math.max(0, i - 20), i); return s.length ? mean(s.map(b => b.high - b.low)) : null; };
  const fwd = i => { const a = atr(i); if (!a || i + W >= bars.length) return null; return bars.slice(i + 1, i + 1 + W).reduce((s, b) => s + (b.high - b.low), 0) / a / W; };   // mean daily range in ATRs
  const ev = [], ctl = [];
  const evDates = new Set(firsts.map(r => r.date));
  const blowIdx = new Set(); for (const r of firsts) { const i = idx.get(r.date); if (i != null) for (let k = i - W; k <= i + W; k++) blowIdx.add(k); }
  for (let i = 25; i < bars.length - W; i++) { const v = fwd(i); if (v == null) continue; if (evDates.has(bars[i].date)) ev.push(v); else if (!blowIdx.has(i)) ctl.push(v); }
  c1[name] = { n: ev.length, event: r3(mean(ev)), control: r3(mean(ctl)), diff: bootDiff(ev, ctl) };
  console.log(`  C1 ${name}: after ${ev.length} blow-outs mean daily range ${r3(mean(ev))} ATR vs control ${r3(mean(ctl))}; diff ${JSON.stringify(c1[name].diff)}`);
}
// C2: partial correlation of dBei with dCrack after dOil (block bootstrap over windows)
const R = rows.filter(r => r.dBei != null);
const pc = rs => { const y = resid(rs.map(r => r.dBei), rs.map(r => r.dOilPct)), x = resid(rs.map(r => r.dCrack), rs.map(r => r.dOilPct)); return corr(x, y); };
const raw = corr(R.map(r => r.dCrack), R.map(r => r.dBei)), oilBei = corr(R.map(r => r.dOilPct), R.map(r => r.dBei));
const pcs = []; for (let k = 0; k < REPS; k++) pcs.push(pc(drawBlock(R, 20))); pcs.sort((a, b) => a - b);
const dis = R.filter(r => r.disagree).map(r => r.dBei), agr = R.filter(r => r.agree).map(r => r.dBei);
const c2 = { n: R.length, from: R[0].date, corrOilBei: r3(oilBei), corrCrackBei: r3(raw), partial: r3(pc(R)), partialLo: r3(pcs[Math.floor(REPS * 0.025)]), partialHi: r3(pcs[Math.floor(REPS * 0.975)]), disagreeBei: { n: dis.length, median: r3(median(dis)) }, agreeBei: { n: agr.length, median: r3(median(agr)) }, disagreeVsAgree: bootDiff(dis, agr) };
console.log(`  C2: corr(oil,bei) ${c2.corrOilBei}, corr(crack,bei) ${c2.corrCrackBei}, partial(crack|oil) ${c2.partial} [${c2.partialLo}, ${c2.partialHi}]; disagreement windows dBei median ${c2.disagreeBei.median}bp (n=${dis.length}) vs agreement ${c2.agreeBei.median}bp (n=${agr.length}); diff ${JSON.stringify(c2.disagreeVsAgree)}`);
// C3: crude higher 20 sessions later, after disagreement / agreement / any
const nextUp = flag => { let k = 0, n = 0; let lastI = -999; for (const r of rows) { if (!flag(r) || r.i - lastI <= W || r.i + W >= H.length) continue; lastI = r.i; n++; if (H[r.i + W].wti > H[r.i].wti) k++; } return wilson(k, n); };
const c3 = { afterDisagree: nextUp(r => r.disagree), afterAgree: nextUp(r => r.agree), afterAnyOilDown5: nextUp(r => r.dOilPct <= -5), unconditional: nextUp(() => true) };
const w = s => s ? `${Math.round(s.share * 100)}% [${Math.round(s.lo * 100)}-${Math.round(s.hi * 100)}] n=${s.n}` : 'n/a';
console.log(`  C3 crude higher 20 sessions on: after disagreement ${w(c3.afterDisagree)} | after agreement ${w(c3.afterAgree)} | after any -5% ${w(c3.afterAnyOilDown5)} | unconditional ${w(c3.unconditional)}`);
const latest = H.at(-1); const since2010 = H.filter(r => r.date >= '2010').map(r => r.crack);
const q = (x, p) => { const s = [...x].sort((a, b) => a - b); return s[Math.floor(p * (s.length - 1))]; };
fs.writeFileSync(OUT, JSON.stringify({ ranAt: new Date().toISOString(), latest, normal: { p25: r3(q(since2010, 0.25)), median: r3(median(since2010)), p75: r3(q(since2010, 0.75)), p90: r3(q(since2010, 0.9)) }, episodes: firsts.length, c1, c2, c3, blowouts: firsts.slice(-12).map(r => ({ date: r.date, dCrack: r3(r.dCrack), z: r3(r.z), crack: r3(r.crack) })) }, null, 1));
console.log('written', OUT);
