#!/usr/bin/env node
/**
 * D1 -- does a crowded market (high CBOE dispersion) precede a wider week?
 * Design frozen in MD files/DISPERSION.md before this ran.
 *   python scratchpad/runstudy.py analysis/dispersion_study.mjs     (OANDA_KEY)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchD1Aligned } from '../js/volBacktestEngine.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output', 'dispersion.json');
const REPS = 1000, LOOK = 5, LOOK20 = 20, TRAIL = 756;
let seed = 20260923; const rnd = () => { seed += 0x6D2B79F5; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const mean = x => x.length ? x.reduce((s, v) => s + v, 0) / x.length : null;
const median = x => { if (!x.length) return null; const s = [...x].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r3 = v => v == null || !Number.isFinite(v) ? null : +v.toFixed(3);
const drawBlock = (x, block) => { const n = x.length, nb = Math.ceil(n / block), s = []; for (let q = 0; q < nb; q++) { const st = Math.floor(rnd() * (n - block + 1)); for (let i = 0; i < block && s.length < n; i++) s.push(x[st + i]); } return s; };
const bootDiff = (a, b, block = 10) => { if (a.length < 5 || b.length < block) return null; const out = []; for (let k = 0; k < REPS; k++) out.push(mean(drawBlock(a, Math.min(block, a.length))) - mean(drawBlock(b, block))); out.sort((p, q) => p - q); return { nA: a.length, nB: b.length, diff: r3(mean(a) - mean(b)), lo: r3(out[Math.floor(REPS * 0.025)]), hi: r3(out[Math.floor(REPS * 0.975)]) }; };
const wilson = (k, n) => { if (!n) return null; const p = k / n, z = 1.96; const d = 1 + z * z / n; const c = (p + z * z / (2 * n)) / d; const h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return { n, k, share: r3(p), lo: r3(c - h), hi: r3(c + h) }; };
const corr = (a, b) => { const ma = mean(a), mb = mean(b); let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return r3(sab / Math.sqrt(saa * sbb)); };

async function fredCsv(id) { const t = await (await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`)).text(); return t.trim().split('\n').slice(1).map(l => { const [d, v] = l.split(','); return { date: d, value: parseFloat(v) }; }).filter(o => Number.isFinite(o.value)); }
async function dspx() { const t = await (await fetch('https://cdn.cboe.com/api/global/us_indices/daily_prices/DSPX_History.csv')).text(); return t.trim().split('\n').slice(1).map(l => { const [d, v] = l.split(','); const m = String(d).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? { date: `${m[3]}-${m[1]}-${m[2]}`, value: parseFloat(v) } : null; }).filter(o => o && Number.isFinite(o.value)); }

const [D, vix] = await Promise.all([dspx(), fredCsv('VIXCLS')]);
const vixBy = new Map(vix.map(o => [o.date, o.value]));
console.log(`DSPX ${D[0].date} -> ${D.at(-1).date} (${D.length}); latest ${D.at(-1).value}`);

// the setup, on DSPX's own clock, with a ROLLING percentile (no look-ahead)
const rows = D.map((o, i) => ({ ...o, i }));
for (let i = 0; i < rows.length; i++) {
  const prior = rows.slice(Math.max(0, i - TRAIL), i).map(r => r.value);
  rows[i].pct = prior.length >= 250 ? prior.filter(v => v <= rows[i].value).length / prior.length : null;
  rows[i].d20 = i >= 20 ? rows[i].value - rows[i - 20].value : null;
  rows[i].vix = vixBy.get(rows[i].date) ?? null;
  const vPrior = rows.slice(Math.max(0, i - TRAIL), i).map(r => r.vix).filter(v => v != null);
  rows[i].vixBelowMed = (rows[i].vix != null && vPrior.length >= 250) ? rows[i].vix < median(vPrior) : null;
}
const setupAll = []; let last = -999;
for (const r of rows) { if (r.pct >= 0.8 && r.d20 > 0 && r.i - last > 20) { setupAll.push(r); last = r.i; } }
const setupCalm = setupAll.filter(r => r.vixBelowMed === true);
console.log(`setups: ${setupAll.length} (of which ${setupCalm.length} with the VIX below its own median)`);
const both = rows.filter(r => r.vix != null);
console.log(`corr(DSPX, VIX) = ${corr(both.map(r => r.value), both.map(r => r.vix))} on ${both.length} common days`);

const result = { ranAt: new Date().toISOString(), dspx: { from: D[0].date, to: D.at(-1).date, n: D.length, latest: D.at(-1).value },
  setups: setupAll.length, setupsCalmVix: setupCalm.length, corrDspxVix: corr(both.map(r => r.value), both.map(r => r.vix)), instruments: {} };

for (const [name, sym] of [['SPX500', 'SPX500_USD'], ['NQ', 'NAS100_USD']]) {
  let bars = []; try { bars = await fetchD1Aligned(sym, 5000, { dailyAlignment: 0, alignmentTimezone: 'Europe/London' }); } catch (e) { console.log(`  ${name}: ${e.message}`); continue; }
  const idx = new Map(bars.map((b, i) => [b.date, i]));
  const trailMed = i => { const s = bars.slice(Math.max(0, i - 20), i).map(b => (b.high - b.low) / b.close); return s.length >= 10 ? median(s) : null; };
  const fwd = (i, n) => { const m = trailMed(i); if (!m || i + n >= bars.length) return null; return mean(bars.slice(i + 1, i + 1 + n).map(b => (b.high - b.low) / b.close)) / m; };
  const tail = (i, n) => { const m = trailMed(i); if (!m || i + n >= bars.length) return null; return bars.slice(i + 1, i + 1 + n).some(b => (b.high - b.low) / b.close >= 2 * m); };
  const near = new Set();
  for (const r of setupAll) { const i = idx.get(r.date); if (i == null) continue; for (let k = i - 20; k <= i + 20; k++) near.add(k); }
  const pick = set => { const a5 = [], a20 = [], tl = []; for (const r of set) { const i = idx.get(r.date); if (i == null) continue; const f5 = fwd(i, LOOK), f20 = fwd(i, LOOK20), t = tail(i, LOOK); if (f5 != null) a5.push(f5); if (f20 != null) a20.push(f20); if (t != null) tl.push(t ? 1 : 0); } return { a5, a20, tl }; };
  const ev = pick(setupAll), evCalm = pick(setupCalm);
  const c5 = [], c20 = [], ctl = [];
  for (let i = 25; i < bars.length - LOOK20; i++) { if (near.has(i)) continue; const f5 = fwd(i, LOOK), f20 = fwd(i, LOOK20), t = tail(i, LOOK); if (f5 != null) c5.push(f5); if (f20 != null) c20.push(f20); if (t != null) ctl.push(t ? 1 : 0); }
  const r = { n: ev.a5.length, nCalm: evCalm.a5.length,
    d1a_5: bootDiff(ev.a5, c5), d1a_20: bootDiff(ev.a20, c20),
    d1b_calm_5: bootDiff(evCalm.a5, c5),
    // POST-HOC, stated as such: the 20-day window came back positive, so the
    // question becomes whether that survives with the VIX held down -- i.e.
    // whether dispersion is doing anything the VIX was not already saying.
    d1b_calm_20: bootDiff(evCalm.a20, c20),
    d1c_tail: { setup: wilson(ev.tl.filter(Boolean).length, ev.tl.length), control: wilson(ctl.filter(Boolean).length, ctl.length) },
    // Does the 20-day result rest on one episode? Split the sample in half by
    // date. A finding that lives entirely in 2020 or 2022 is an episode, not an
    // effect, and this is the cheapest way to tell.
    halves: (() => {
      const mid = bars[Math.floor(bars.length / 2)]?.date;
      const early = [], late = [];
      for (const r of setupAll) { const i = idx.get(r.date); if (i == null) continue; const f = fwd(i, LOOK20); if (f == null) continue; (r.date < mid ? early : late).push(f); }
      const cE = [], cL = [];
      for (let i = 25; i < bars.length - LOOK20; i++) { if (near.has(i)) continue; const f = fwd(i, LOOK20); if (f == null) continue; (bars[i].date < mid ? cE : cL).push(f); }
      return { splitAt: mid, early: bootDiff(early, cE), late: bootDiff(late, cL) };
    })(),
    meanSetup5: r3(mean(ev.a5)), meanControl5: r3(mean(c5)) };
  result.instruments[name] = r;
  const f = d => d ? `${d.diff >= 0 ? '+' : ''}${d.diff} [${d.lo}, ${d.hi}] (n ${d.nA} vs ${d.nB})` : 'n/a';
  const w = s => s ? `${Math.round(s.share * 100)}% [${Math.round(s.lo * 100)}-${Math.round(s.hi * 100)}] n=${s.n}` : 'n/a';
  console.log(`  ${name}: next-5 range ratio setup ${r.meanSetup5} vs control ${r.meanControl5}`);
  console.log(`    D1a  5d ${f(r.d1a_5)} | 20d ${f(r.d1a_20)}`);
  console.log(`    D1b  calm-VIX 5d ${f(r.d1b_calm_5)} | calm-VIX 20d (post-hoc) ${f(r.d1b_calm_20)}`);
  console.log(`    D1c  a 2x day within 5: setup ${w(r.d1c_tail.setup)} vs control ${w(r.d1c_tail.control)}`);
  console.log(`    halves (20d, split ${r.halves.splitAt}): early ${f(r.halves.early)} | late ${f(r.halves.late)}`);
}
fs.writeFileSync(OUT, JSON.stringify(result, null, 1)); console.log('written', OUT);
