#!/usr/bin/env node
/**
 * R2 -- the regime per currency and the pair as a regime differential.
 * Design frozen in MD files/REGIME.md (R2). Reuses the server's own fetchers
 * (extracted) so the study and the live page see the same series.
 *   node analysis/regime_pairs_study.mjs      (OANDA_KEY)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { regimeHistory, currencyRegime, yoy, monthEnd } from '../js/regimeCore.js';
import { onsSeries, statcanSeries, jsonStatSeries } from '../js/fredActuals.js';
import { fetchD1 } from '../js/volBacktestEngine.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..'); const OUT = path.join(__dirname, 'output', 'regime.json');
const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const a = src.indexOf('async function _fetchIntlSeries'), b = src.indexOf('let _fredFillWarned');
const fetchIntl = new Function('onsSeries', 'statcanSeries', 'jsonStatSeries', 'return ' + src.slice(a, b).replace(/_onsSeries|_statcanSeries|_jsonStatSeries/g, m => m.slice(1)))(onsSeries, statcanSeries, jsonStatSeries);
const c = src.indexOf('const _CCY_REGIME_SRC = {'), d = src.indexOf('};', c) + 2;
const SRC = new Function('return ' + src.slice(c, d).replace('const _CCY_REGIME_SRC = ', ''))();
const held = obs => obs.flatMap(o => { const dt = new Date(o.date); return [0, 1, 2].map(k => ({ date: new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + k, 1)).toISOString().slice(0, 10), value: o.value })); });
async function fredCsv(id) { const t = await (await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`)).text(); return t.trim().split('\n').slice(1).map(l => { const [dd, v] = l.split(','); return { date: dd, value: parseFloat(v) }; }).filter(o => Number.isFinite(o.value)); }
const REPS = 1000; let seed = 20260920; const rnd = () => { seed += 0x6D2B79F5; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const mean = x => x.length ? x.reduce((s, v) => s + v, 0) / x.length : null;
const boot = (x, y) => { const out = []; for (let k = 0; k < REPS; k++) { const sx = [], sy = []; for (let i = 0; i < x.length; i++) sx.push(x[Math.floor(rnd() * x.length)]); for (let i = 0; i < y.length; i++) sy.push(y[Math.floor(rnd() * y.length)]); out.push(mean(sx) - mean(sy)); } out.sort((p, q) => p - q); return { diff: +(mean(x) - mean(y)).toFixed(3), lo: +out[Math.floor(REPS * 0.025)].toFixed(3), hi: +out[Math.floor(REPS * 0.975)].toFixed(3) }; };

const [cfnai, claims, indpro, payems, corecpi, corepce, bei5] = await Promise.all(['CFNAI', 'ICSA', 'INDPRO', 'PAYEMS', 'CPILFESL', 'PCEPILFE', 'T5YIE'].map(fredCsv));
const hist = { USD: regimeHistory({ cfnai, claims, indpro, payems, corecpi, corepce, bei5 }) };
const raw = {}; for (const [k, spec] of Object.entries(SRC)) { try { const obs = await fetchIntl(spec); raw[k] = spec.quarterly ? held(obs) : obs.map(o => ({ date: o.date, value: o.value })); console.log(`  ${k.padEnd(10)} ${raw[k][0]?.date} → ${raw[k].at(-1)?.date} (${raw[k].length})`); } catch (e) { console.log(`  ${k} failed: ${e.message}`); } }
raw.ca_cpi_yoy = yoy(raw.ca_cpi ?? []);
for (const ccy of ['GBP', 'EUR', 'CAD']) { const h = currencyRegime(ccy, raw); if (h?.length) hist[ccy] = h; }
for (const [ccy, h] of Object.entries(hist)) { const share = {}; for (const r of h) share[r.regime] = (share[r.regime] ?? 0) + 1; console.log(`${ccy}: ${h[0].m} → ${h.at(-1).m}, ${h.length} months; now ${h.at(-1).regime}; ` + Object.entries(share).map(([k, n]) => `${k} ${Math.round(100 * n / h.length)}%`).join(' ')); }

// pairs
const PAIRS = { EURUSD: ['EUR', 'USD', 'EUR_USD'], GBPUSD: ['GBP', 'USD', 'GBP_USD'], USDCAD: ['USD', 'CAD', 'USD_CAD'], EURGBP: ['EUR', 'GBP', 'EUR_GBP'] };
const nextM = m => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7); };
const pairTable = {};
for (const [pair, [base, quote, sym]] of Object.entries(PAIRS)) {
  if (!hist[base] || !hist[quote]) continue;
  const bars = await fetchD1(sym, 5000); const by = new Map(); const rng = new Map();
  for (const bb of bars) { const m = bb.date.slice(0, 7); by.set(m, bb.close); const r = rng.get(m) ?? { hi: -Infinity, lo: Infinity }; r.hi = Math.max(r.hi, bb.high); r.lo = Math.min(r.lo, bb.low); rng.set(m, r); }
  const hb = new Map(hist[base].map(r => [r.m, r.regime])), hq = new Map(hist[quote].map(r => [r.m, r.regime]));
  const rows = [];
  for (const m of [...hb.keys()].filter(m => hq.has(m))) { const m1 = nextM(m); const c0 = by.get(m), c1 = by.get(m1), r = rng.get(m1); if (!c0 || !c1 || !r) continue; rows.push({ m, cell: `${hb.get(m)}|${hq.get(m)}`, aligned: hb.get(m) === hq.get(m), ret: Math.log(c1 / c0) * 100, range: (r.hi - r.lo) / c0 * 100 }); }
  const al = rows.filter(r => r.aligned), dv = rows.filter(r => !r.aligned);
  const cells = {}; for (const r of rows) (cells[r.cell] ??= []).push(r);
  pairTable[pair] = { base, quote, n: rows.length, from: rows[0]?.m, to: rows.at(-1)?.m,
    aligned: { n: al.length, ret: +mean(al.map(r => r.ret)).toFixed(2), range: +mean(al.map(r => r.range)).toFixed(2), up: +(al.filter(r => r.ret > 0).length / al.length).toFixed(2) },
    diverging: { n: dv.length, ret: +mean(dv.map(r => r.ret)).toFixed(2), range: +mean(dv.map(r => r.range)).toFixed(2), up: +(dv.filter(r => r.ret > 0).length / dv.length).toFixed(2) },
    rangeDiff: boot(dv.map(r => r.range), al.map(r => r.range)), retDiff: boot(dv.map(r => r.ret), al.map(r => r.ret)),
    cells: Object.fromEntries(Object.entries(cells).filter(([, v]) => v.length >= 8).map(([k, v]) => [k, { n: v.length, ret: +mean(v.map(r => r.ret)).toFixed(2), range: +mean(v.map(r => r.range)).toFixed(2), up: +(v.filter(r => r.ret > 0).length / v.length).toFixed(2) }])) };
  const t = pairTable[pair];
  console.log(`${pair}: n=${t.n} (${t.from}→${t.to}) aligned n=${t.aligned.n} range ${t.aligned.range}% ret ${t.aligned.ret}% | diverging n=${t.diverging.n} range ${t.diverging.range}% ret ${t.diverging.ret}% | range diff ${t.rangeDiff.diff} [${t.rangeDiff.lo}, ${t.rangeDiff.hi}] | ret diff ${t.retDiff.diff} [${t.retDiff.lo}, ${t.retDiff.hi}]`);
}
const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
prev.currencies = Object.fromEntries(Object.entries(hist).map(([c, h]) => [c, { from: h[0].m, to: h.at(-1).m, months: h.length, now: h.at(-1) }]));
prev.pairTable = pairTable; prev.r2RanAt = new Date().toISOString();
fs.writeFileSync(OUT, JSON.stringify(prev, null, 1)); console.log('written', OUT);
