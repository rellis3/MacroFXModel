#!/usr/bin/env node
/**
 * P1 -- does repo stress (SOFR 99th percentile >= 10bp over the floor) precede
 * a wider week? Design frozen in MD files/PLUMBING.md.
 *   node analysis/plumbing_study.mjs        (needs OANDA_KEY)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchD1 } from '../js/volBacktestEngine.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output', 'plumbing_study.json');
const REPS = 1000, SEED = 20260920, THRESH_BP = 10, GAP = 10, H = 5;
function mulberry32(a) { return function () { let t = (a += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const fmt = (x, dp = 3) => x == null ? 'n/a' : `${x >= 0 ? '+' : ''}${x.toFixed(dp)}`;
async function fredCsv(id) { const t = await (await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`)).text(); return t.trim().split('\n').slice(1).map(l => { const [d, v] = l.split(','); return { date: d, value: parseFloat(v) }; }).filter(o => Number.isFinite(o.value)); }

const sofr = (await (await fetch(`https://markets.newyorkfed.org/api/rates/secured/sofr/search.json?startDate=2018-04-01&endDate=${new Date().toISOString().slice(0, 10)}`)).json()).refRates.map(r => ({ date: r.effectiveDate, p99: +r.percentPercentile99, med: +r.percentRate })).sort((a, b) => a.date < b.date ? -1 : 1);
const ioer = await fredCsv('IOER'), iorb = await fredCsv('IORB'); const dxy = await fredCsv('DTWEXBGS');
const floorMap = new Map([...ioer, ...iorb].map(o => [o.date, o.value])); let lastF = null;
const stress = sofr.map(s => { if (floorMap.has(s.date)) lastF = floorMap.get(s.date); return lastF == null ? null : { date: s.date, bp: Math.round((s.p99 - lastF) * 100), medBp: Math.round((s.med - lastF) * 100) }; }).filter(Boolean);
console.log(`SOFR 99th vs floor: ${stress[0].date} → ${stress.at(-1).date}, ${stress.length} sessions; days >= ${THRESH_BP}bp: ${stress.filter(s => s.bp >= THRESH_BP).length}`);
// setups: first session of an episode
const setups = []; let lastIdx = -Infinity;
stress.forEach((s, i) => { if (s.bp >= THRESH_BP && i - lastIdx > GAP) { setups.push(s); lastIdx = i; } else if (s.bp >= THRESH_BP) lastIdx = i; });
console.log(`episodes (first session, gap > ${GAP}): ${setups.length}: ${setups.map(s => `${s.date} (+${s.bp}bp)`).join(', ')}`);

const results = { ranAt: new Date().toISOString(), spec: 'MD files/PLUMBING.md#P1', episodes: setups, instruments: {} };
const rnd = mulberry32(SEED);
for (const [name, sym] of [['SPX500', 'SPX500_USD'], ['EURUSD', 'EUR_USD'], ['USDJPY', 'USD_JPY']]) {
  const bars = (await fetchD1(sym, 5000)).filter(b => b.close > 0); const idx = new Map(bars.map((b, i) => [b.date, i]));
  const tr = bars.map((b, i) => i ? Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close)) : b.high - b.low);
  const atr = tr.map((_, i) => i >= 14 ? mean(tr.slice(i - 13, i + 1)) : null);
  const atrPct = atr.map((a, i) => { if (a == null || i < 250) return null; const w = atr.slice(i - 250, i).filter(x => x != null); return w.filter(x => x <= a).length / w.length; });
  const fwd = i => { if (i + H >= bars.length || atr[i] == null) return null; const hi = Math.max(...bars.slice(i + 1, i + 1 + H).map(b => b.high)), lo = Math.min(...bars.slice(i + 1, i + 1 + H).map(b => b.low)); return (hi - lo) / atr[i]; };
  const rows = [];
  for (const s of setups) { let i = idx.get(s.date); if (i == null) { const later = bars.findIndex(b => b.date > s.date); if (later < 0) continue; i = later; } const f = fwd(i); if (f == null || atrPct[i] == null) continue; rows.push({ date: s.date, i, f, q: Math.floor(atrPct[i] * 5) }); }
  const setupSet = new Set(rows.map(r => r.i));
  const pool = q => bars.map((_, i) => i).filter(i => atrPct[i] != null && Math.floor(atrPct[i] * 5) === q && !setupSet.has(i) && !rows.some(r => Math.abs(r.i - i) <= GAP) && fwd(i) != null);
  const diffs = rows.map(r => { const p = pool(r.q); const c = p[Math.floor(rnd() * p.length)]; return { d: r.f - fwd(c), f: r.f, c: fwd(c) }; });
  const boot = []; for (let k = 0; k < REPS; k++) { const s = []; for (let i = 0; i < diffs.length; i++) s.push(diffs[Math.floor(rnd() * diffs.length)].d); boot.push(mean(s)); } boot.sort((a, b) => a - b);
  const res = { n: rows.length, setupMean: +mean(diffs.map(x => x.f)).toFixed(3), controlMean: +mean(diffs.map(x => x.c)).toFixed(3), diff: +mean(diffs.map(x => x.d)).toFixed(3), lo: +boot[Math.floor(REPS * 0.025)].toFixed(3), hi: +boot[Math.floor(REPS * 0.975)].toFixed(3) };
  res.pass = res.n >= 40 && res.diff >= 0.10 && res.lo > 0; res.verdict = res.n < 40 ? `base rate (n=${res.n} under the bar)` : res.pass ? 'PASS' : 'NULL';
  console.log(`  ${name.padEnd(7)} n=${res.n}  next-${H} range ${res.setupMean} vs control ${res.controlMean} ATR  diff ${fmt(res.diff)} [${fmt(res.lo)}, ${fmt(res.hi)}]  → ${res.verdict}`);
  results.instruments[name] = res;
}
// the dollar: 5-day |change| in the broad index vs its unconditional
const dIdx = new Map(dxy.map((o, i) => [o.date, i])); const dAbs = i => i + H < dxy.length ? Math.abs(dxy[i + H].value / dxy[i].value - 1) * 100 : null;
const dS = setups.map(s => { let i = dIdx.get(s.date); if (i == null) i = dxy.findIndex(o => o.date > s.date); return i >= 0 ? dAbs(i) : null; }).filter(x => x != null);
const dAll = dxy.map((_, i) => dAbs(i)).filter(x => x != null);
results.dollar = { n: dS.length, setupMean: +mean(dS).toFixed(3), unconditionalMean: +mean(dAll).toFixed(3) };
console.log(`  dollar  n=${dS.length}  |5-day change| ${results.dollar.setupMean}% vs unconditional ${results.dollar.unconditionalMean}%`);
fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(results, null, 1)); console.log('written', OUT);
