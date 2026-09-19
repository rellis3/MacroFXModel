#!/usr/bin/env node
/**
 * The regime table on this desk's data. Design frozen in MD files/REGIME.md.
 *   node analysis/regime_study.mjs        (OANDA_KEY for the asset series)
 * Output analysis/output/regime.json: the monthly regime history, time in each,
 * spells, next-month asset returns and ranges by regime with block-bootstrap
 * intervals, transitions.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { regimeHistory, spells, regimeNow, TRANSITIONS } from '../js/regimeCore.js';
import { fetchD1 } from '../js/volBacktestEngine.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output', 'regime.json');
const REPS = 1000, SEED = 20260919;
function mulberry32(a) { return function () { let t = (a += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
async function fred(id) { const t = await (await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`)).text(); return t.trim().split('\n').slice(1).map(l => { const [d, v] = l.split(','); return { date: d, value: parseFloat(v) }; }).filter(o => Number.isFinite(o.value)); }

const [cfnai, claims, indpro, payems, corecpi, corepce, bei5, dxy, wti] = await Promise.all(['CFNAI', 'ICSA', 'INDPRO', 'PAYEMS', 'CPILFESL', 'PCEPILFE', 'T5YIE', 'DTWEXBGS', 'DCOILWTICO'].map(fred));
const hist = regimeHistory({ cfnai, claims, indpro, payems, corecpi, corepce, bei5 });
console.log(`regime history ${hist[0].m} → ${hist[hist.length - 1].m}, ${hist.length} months`);
const sp = spells(hist);
const share = {}; for (const r of hist) share[r.regime] = (share[r.regime] ?? 0) + 1;
console.log('time in each:', Object.entries(share).map(([k, n]) => `${k} ${(100 * n / hist.length).toFixed(0)}%`).join('  '), '| spells', sp.length, 'median length', median(sp.map(s => s.months)), 'under 3 months', sp.filter(s => s.months < 3).length);

// assets: month-end closes and monthly ranges
const monthly = (bars, key = 'close') => { const by = new Map(); const rng = new Map(); for (const b of bars) { const m = b.date.slice(0, 7); by.set(m, b[key]); const r = rng.get(m) ?? { hi: -Infinity, lo: Infinity, atr: [] }; r.hi = Math.max(r.hi, b.high ?? b[key]); r.lo = Math.min(r.lo, b.low ?? b[key]); rng.set(m, r); } return { close: by, rng }; };
const assets = {};
const oanda = { SPX500: 'SPX500_USD', NQ: 'NAS100_USD', GOLD: 'XAU_USD', US10Y: 'USB10Y_USD', COPPER: 'XCU_USD', EURUSD: 'EUR_USD', USDJPY: 'USD_JPY', AUDUSD: 'AUD_USD' };
for (const [name, sym] of Object.entries(oanda)) { try { const bars = await fetchD1(sym, 5000); assets[name] = monthly(bars); console.log(`  ${name} ${bars[0]?.date} → ${bars.at(-1)?.date}`); } catch (e) { console.log(`  ${name} failed: ${e.message}`); } }
assets.DXY = monthly(dxy.map(o => ({ date: o.date, close: o.value })), 'close');
assets.WTI = monthly(wti.map(o => ({ date: o.date, close: o.value })), 'close');

// next-month return by regime label (label known at month m end -> return over m+1)
const months = hist.map(h => h.m);
const nextM = m => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo, 1)); return d.toISOString().slice(0, 7); };
const table = {};
const rnd = mulberry32(SEED);
const boot = (rows) => { const vals = rows.map(r => r.ret); const out = []; for (let k = 0; k < REPS; k++) { const s = []; for (let i = 0; i < vals.length; i++) s.push(vals[Math.floor(rnd() * vals.length)]); out.push(mean(s)); } out.sort((a, b) => a - b); return { lo: out[Math.floor(REPS * 0.025)], hi: out[Math.floor(REPS * 0.975)] }; };
for (const [name, a] of Object.entries(assets)) {
  table[name] = {};
  const rows = [];
  for (const h of hist) { const m1 = nextM(h.m); const c0 = a.close.get(h.m), c1 = a.close.get(m1); const r = a.rng.get(m1); if (c0 && c1) rows.push({ regime: h.regime, ret: Math.log(c1 / c0) * 100, range: r && Number.isFinite(r.hi) ? (r.hi - r.lo) / c0 * 100 : null }); }
  for (const reg of ['goldilocks', 'reflation', 'stagflation', 'deflation']) {
    const rs = rows.filter(r => r.regime === reg); if (rs.length < 12) { table[name][reg] = { n: rs.length }; continue; }
    const b = boot(rs); const rng = rs.map(r => r.range).filter(x => x != null);
    table[name][reg] = { n: rs.length, mean: +mean(rs.map(r => r.ret)).toFixed(2), median: +median(rs.map(r => r.ret)).toFixed(2), lo: +b.lo.toFixed(2), hi: +b.hi.toFixed(2), posShare: +(rs.filter(r => r.ret > 0).length / rs.length).toFixed(2), range: rng.length ? +mean(rng).toFixed(2) : null, tilt: b.lo > 0 ? 'up' : b.hi < 0 ? 'down' : 'none' };
  }
  table[name].all = { n: rows.length, mean: +mean(rows.map(r => r.ret)).toFixed(2), range: +mean(rows.map(r => r.range).filter(x => x != null)).toFixed(2) };
  console.log(`  ${name.padEnd(7)}`, ['goldilocks', 'reflation', 'stagflation', 'deflation'].map(reg => { const c = table[name][reg]; return `${reg.slice(0, 5)} ${c.mean != null ? `${c.mean >= 0 ? '+' : ''}${c.mean}% [${c.lo},${c.hi}] n=${c.n} rng ${c.range}%` : `n=${c.n}`}`; }).join(' | '));
}
// transitions observed
const trans = TRANSITIONS.map(t => { let n = 0; const lens = []; for (let i = 1; i < sp.length; i++) if (sp[i - 1].regime === t.from && sp[i].regime === t.to) { n++; lens.push(sp[i - 1].months); } return { ...t, observed: n, medianSpellBefore: median(lens) }; });
console.log('transitions:', trans.map(t => `${t.from}→${t.to} ${t.observed}× (prior spell median ${t.medianSpellBefore}m)`).join(' | '));
const now = regimeNow(hist);
console.log('now:', now.label, `${now.months} month(s) since ${now.since}`, 'growth', now.scores.growth, 'inflation', now.scores.inflation);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ ranAt: new Date().toISOString(), spec: 'MD files/REGIME.md', history: hist, spells: sp, share, table, transitions: trans, now }, null, 1));
console.log('written', OUT);
