#!/usr/bin/env node
/**
 * Y1-Y3 -- the non-US yield legs (gilts, JGBs, bunds) against Treasuries.
 * Design frozen in MD files/NONUS_YIELDS.md before this ran.
 *   python scratchpad/runstudy.py analysis/nonus_yields_study.mjs   (OANDA_KEY in env)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchD1Aligned } from '../js/volBacktestEngine.js';
import { INTL_YIELDS } from '../js/intlYields.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output', 'nonus_yields.json');

const LEGS = {
  GBP: { key: 'gb10y', pair: 'GBP_USD', sign: +1, T: 5, big: 8, fredMonthly: 'IRLTLT01GBM156N' },
  EUR: { key: 'de10y', pair: 'EUR_USD', sign: +1, T: 5, big: 8, fredMonthly: 'IRLTLT01DEM156N' },
  JPY: { key: 'jp10y', pair: 'USD_JPY', sign: -1, T: 3, big: 5, fredMonthly: 'IRLTLT01JPM156N' },
};
const FROM = '2008-01-01', REPS = 1000;
let seed = 20260920; const rnd = () => { seed += 0x6D2B79F5; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const mean = x => x.length ? x.reduce((s, v) => s + v, 0) / x.length : null;
const median = x => { if (!x.length) return null; const s = [...x].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (x, q) => { const s = [...x].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const r3 = v => v == null ? null : +v.toFixed(3);
// plain bootstrap of a share (tail days are sparse, effectively independent)
const bootShare = (flags, base) => { const n = flags.length; if (!n) return null; const out = []; for (let k = 0; k < REPS; k++) { let c = 0; for (let i = 0; i < n; i++) c += flags[Math.floor(rnd() * n)]; out.push(c / n / base); } out.sort((a, b) => a - b); return { n, share: r3(mean(flags)), base: r3(base), ratio: r3(mean(flags) / base), lo: r3(out[Math.floor(REPS * 0.025)]), hi: r3(out[Math.floor(REPS * 0.975)]) }; };
// block bootstrap of a mean ratio (ranges are autocorrelated)
const bootBlockMean = (x, block = 10) => { const n = x.length; if (n < block) return null; const out = []; const nb = Math.ceil(n / block); for (let k = 0; k < REPS; k++) { const s = []; for (let b = 0; b < nb; b++) { const st = Math.floor(rnd() * (n - block + 1)); for (let i = 0; i < block && s.length < n; i++) s.push(x[st + i]); } out.push(mean(s)); } out.sort((a, b) => a - b); return { n, mean: r3(mean(x)), lo: r3(out[Math.floor(REPS * 0.025)]), hi: r3(out[Math.floor(REPS * 0.975)]) }; };
const wilson = (k, n) => { if (!n) return null; const p = k / n, z = 1.96; const d = 1 + z * z / n; const c = (p + z * z / (2 * n)) / d; const h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return { n, share: r3(p), lo: r3(c - h), hi: r3(c + h) }; };

async function fredCsv(id) { const t = await (await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`)).text(); return t.trim().split('\n').slice(1).map(l => { const [d, v] = l.split(','); return { date: d, value: parseFloat(v) }; }).filter(o => Number.isFinite(o.value)); }

const ust = await fredCsv('DGS10'); const ustBy = new Map(ust.map(o => [o.date, o.value]));
console.log(`DGS10 ${ust[0].date} -> ${ust.at(-1).date} (${ust.length})`);
const result = { ranAt: new Date().toISOString(), from: FROM, legs: {} };

for (const [ccy, L] of Object.entries(LEGS)) {
  const yld = (await INTL_YIELDS[L.key].fetch()).filter(o => o.date >= FROM);
  // validation: monthly mean of the daily series vs FRED's monthly mirror, last 6 complete months FRED has
  const fm = await fredCsv(L.fredMonthly); const byM = {}; for (const o of yld) (byM[o.date.slice(0, 7)] ??= []).push(o.value);
  const val = fm.slice(-8).map(o => { const m = o.date.slice(0, 7); const ours = byM[m] ? mean(byM[m]) : null; return { m, fred: o.value, ours: r3(ours), diffBp: ours == null ? null : Math.round((ours - o.value) * 100) }; }).filter(v => v.ours != null);
  console.log(`${ccy}: ${L.key} ${yld[0].date} -> ${yld.at(-1).date} (${yld.length}); vs FRED monthly: ${val.map(v => `${v.m} ${v.diffBp}bp`).join(', ')}`);
  const bars = await fetchD1Aligned(L.pair, 5000, { dailyAlignment: 0, alignmentTimezone: 'Europe/London' });
  const barBy = new Map(bars.map(b => [b.date, b]));
  // one row per common date: yields, gap, pair
  const rows = [];
  for (const o of yld) { const u = ustBy.get(o.date), b = barBy.get(o.date); if (u == null || !b) continue; rows.push({ date: o.date, f: o.value, u, gap: (o.value - u) * 100, close: b.close, range: (b.high - b.low) / b.close }); }
  for (let i = 1; i < rows.length; i++) { const p = rows[i - 1], r = rows[i]; r.dF = (r.f - p.f) * 100; r.dU = (r.u - p.u) * 100; r.dGap = r.gap - p.gap; r.ret = Math.log(r.close / p.close); }
  const R = rows.slice(1);
  for (const r of R) { r.ledRise = r.dF >= L.T && r.dGap >= L.T; r.ledFall = r.dF <= -L.T && r.dGap <= -L.T; r.bigGap = Math.abs(r.dGap) >= L.big; }
  const baseRise = mean(R.map(r => +r.ledRise)), baseFall = mean(R.map(r => +r.ledFall));
  const lo5 = pct(R.map(r => r.ret), 0.05), hi5 = pct(R.map(r => r.ret), 0.95);
  const worst = R.filter(r => r.ret <= lo5), best = R.filter(r => r.ret >= hi5);
  // Y1: the label on the tails
  const y1 = {
    worstDays: { ledRise: bootShare(worst.map(r => +r.ledRise), baseRise), ledFall: bootShare(worst.map(r => +r.ledFall), baseFall) },
    bestDays:  { ledRise: bootShare(best.map(r => +r.ledRise), baseRise),  ledFall: bootShare(best.map(r => +r.ledFall), baseFall) },
    sameDayCorr: r3((() => { const a = R.map(r => r.dGap), b = R.map(r => r.ret); const ma = mean(a), mb = mean(b); let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return sab / Math.sqrt(saa * sbb); })()),
    episodes: worst.filter(r => r.ledRise).map(r => `${r.date} gap ${r.dGap.toFixed(0)}bp ret ${(r.ret * 100).toFixed(2)}%`).slice(-8),
  };
  // Y2: next-session range after a big gap day / a foreign-led rise, vs trailing 20-session median
  const ratioAfter = flag => { const x = []; for (let i = 20; i < R.length - 1; i++) { if (!flag(R[i])) continue; const med = median(R.slice(i - 20, i).map(r => r.range)); if (med > 0) x.push(R[i + 1].range / med); } return bootBlockMean(x); };
  const y2 = { bigGap: ratioAfter(r => r.bigGap), ledRise: ratioAfter(r => r.ledRise), ledFall: ratioAfter(r => r.ledFall), control: ratioAfter(r => !r.bigGap) };
  // POST-HOC (added after the first run, stated in the MD): the next/trailing-median
  // ratio sits above 1 on ordinary days too (skew), so "excludes 1" was the wrong bar.
  // The honest bar is the DIFFERENCE against the control, and against a US-led
  // control (a big Treasury day with no divergence) to see whether the foreign
  // leg adds anything beyond vol clustering.
  const samples = flag => { const x = []; for (let i = 20; i < R.length - 1; i++) { if (!flag(R[i])) continue; const med = median(R.slice(i - 20, i).map(r => r.range)); if (med > 0) x.push(R[i + 1].range / med); } return x; };
  const bootDiff = (a, b, block = 10) => { if (a.length < block || b.length < block) return null; const draw = x => { const n = x.length, nb = Math.ceil(n / block), s = []; for (let q = 0; q < nb; q++) { const st = Math.floor(rnd() * (n - block + 1)); for (let i = 0; i < block && s.length < n; i++) s.push(x[st + i]); } return mean(s); }; const out = []; for (let k = 0; k < REPS; k++) out.push(draw(a) - draw(b)); out.sort((p, q) => p - q); return { nA: a.length, nB: b.length, diff: r3(mean(a) - mean(b)), lo: r3(out[Math.floor(REPS * 0.025)]), hi: r3(out[Math.floor(REPS * 0.975)]) }; };
  const usLed = r => Math.abs(r.dU) >= L.big && !r.bigGap;
  y2.posthoc = { bigGapVsControl: bootDiff(samples(r => r.bigGap), samples(r => !r.bigGap)), ledRiseVsControl: bootDiff(samples(r => r.ledRise), samples(r => !r.bigGap)), ledFallVsControl: bootDiff(samples(r => r.ledFall), samples(r => !r.bigGap)), usLed: bootBlockMean(samples(usLed)), bigGapVsUsLed: bootDiff(samples(r => r.bigGap), samples(usLed)) };
  // Y3: direction base rates
  const nextTextbook = flag => { let k = 0, n = 0; for (let i = 0; i < R.length - 1; i++) { if (!flag(R[i])) continue; const want = L.sign * Math.sign(R[i].dGap); if (R[i + 1].ret === 0) continue; n++; if (Math.sign(R[i + 1].ret) === want) k++; } return wilson(k, n); };
  const win20 = (() => { let k = 0, n = 0; for (let i = 20; i < R.length; i += 20) { const dg = R[i].gap - R[i - 20].gap, dr = Math.log(R[i].close / R[i - 20].close); if (Math.abs(dg) < 10 || dr === 0) continue; n++; if (Math.sign(dg) * Math.sign(dr) === L.sign) k++; } return wilson(k, n); })();
  const y3 = { nextAfterLedRise: nextTextbook(r => r.ledRise), nextAfterLedFall: nextTextbook(r => r.ledFall), window20Agree: win20 };
  result.legs[ccy] = { ...L, n: R.length, from: R[0].date, to: R.at(-1).date, validation: val, baseRates: { ledRise: r3(baseRise), ledFall: r3(baseFall), bigGap: r3(mean(R.map(r => +r.bigGap))) }, y1, y2, y3 };
  const f = s => s ? `${s.share} vs base ${s.base} -> x${s.ratio} [${s.lo}, ${s.hi}] n=${s.n}` : 'n/a';
  const g = s => s ? `x${s.mean} [${s.lo}, ${s.hi}] n=${s.n}` : 'n/a';
  const w = s => s ? `${Math.round(s.share * 100)}% [${Math.round(s.lo * 100)}-${Math.round(s.hi * 100)}] n=${s.n}` : 'n/a';
  console.log(`  n=${R.length} ${R[0].date}->${R.at(-1).date}; same-day corr(dGap, ret) ${y1.sameDayCorr}`);
  console.log(`  Y1 worst-5% days: led-rise ${f(y1.worstDays.ledRise)} | led-fall ${f(y1.worstDays.ledFall)}`);
  console.log(`  Y1 best-5% days:  led-rise ${f(y1.bestDays.ledRise)} | led-fall ${f(y1.bestDays.ledFall)}`);
  console.log(`  Y2 next range: big gap ${g(y2.bigGap)} | led-rise ${g(y2.ledRise)} | led-fall ${g(y2.ledFall)} | control ${g(y2.control)}`);
  const h = d => d ? `${d.diff >= 0 ? '+' : ''}${d.diff} [${d.lo}, ${d.hi}] (n ${d.nA} vs ${d.nB})` : 'n/a';
  console.log(`  Y2 post-hoc: big gap - control ${h(y2.posthoc.bigGapVsControl)} | led-rise - control ${h(y2.posthoc.ledRiseVsControl)} | led-fall - control ${h(y2.posthoc.ledFallVsControl)} | US-led ${g(y2.posthoc.usLed)} | big gap - US-led ${h(y2.posthoc.bigGapVsUsLed)}`);
  console.log(`  Y3 next-day textbook: after led-rise ${w(y3.nextAfterLedRise)} | after led-fall ${w(y3.nextAfterLedFall)} | 20d windows agree ${w(y3.window20Agree)}`);
}
fs.writeFileSync(OUT, JSON.stringify(result, null, 1)); console.log('written', OUT);
