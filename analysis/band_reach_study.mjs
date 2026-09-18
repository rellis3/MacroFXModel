// T7 — the band read: reach-the-next-band odds by hour. Pre-registered in
// MD files/TECHNICAL_RANGE_TESTS.md#T7 (commit 9abf830) before running.
//   node --max-old-space-size=8192 analysis/band_reach_study.mjs
// Writes analysis/output/band_reach_study.json and js/bandReachParams.js.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { bucketM1IntoSessions } from '../js/forecastAnalyser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output', 'band_reach_study.json'); fs.mkdirSync(path.dirname(OUT), { recursive: true });
const PARAMS = path.join(__dirname, '..', 'js', 'bandReachParams.js');
const REPS = 600, MIN_N = 40, SEED = 20260918;
const INSTR = { EURUSD: 'eurusd', GBPUSD: 'gbpusd', USDJPY: 'usdjpy', AUDUSD: 'audusd', USDCAD: 'usdcad', GOLD: 'gold', NQ: 'nas100_usd', SPX500: 'spx500' };
const CHECKPOINTS = [['07:00', 420], ['08:00', 480], ['09:00', 540], ['10:30', 630], ['12:00', 720], ['13:30', 810], ['15:00', 900], ['16:30', 990]];
function mulberry32(a) { return function () { let t = (a += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pc = x => x == null ? 'n/a' : `${(x * 100).toFixed(0)}%`;
const log = (...a) => console.log(...a);
const londonHM = t => { const d = new Date(t * 1000); const s = d.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }); const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const hmStr = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const quant = (a, p) => { const v = [...a].sort((x, y) => x - y); return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * p))] : null; };
const bootShare = (bools, seed) => { const n = bools.length; if (!n) return { p: null, lo: null, hi: null, n: 0 }; const rnd = mulberry32(seed); const ps = []; for (let k = 0; k < REPS; k++) { let c = 0; for (let j = 0; j < n; j++) if (bools[Math.floor(rnd() * n)]) c++; ps.push(c / n); } ps.sort((a, b) => a - b); return { p: +(bools.filter(Boolean).length / n).toFixed(3), lo: +ps[Math.floor(REPS * 0.025)].toFixed(3), hi: +ps[Math.floor(REPS * 0.975)].toFixed(3), n }; };
const bootDiff = (a, b, seed) => { const rnd = mulberry32(seed); const ds = []; for (let k = 0; k < REPS; k++) { let ca = 0, cb = 0; for (let j = 0; j < a.length; j++) if (a[Math.floor(rnd() * a.length)]) ca++; for (let j = 0; j < b.length; j++) if (b[Math.floor(rnd() * b.length)]) cb++; ds.push(ca / a.length - cb / b.length); } ds.sort((x, y) => x - y); return { diff: a.filter(Boolean).length / a.length - b.filter(Boolean).length / b.length, lo: ds[Math.floor(REPS * 0.025)], hi: ds[Math.floor(REPS * 0.975)] }; };

const results = { ranAt: new Date().toISOString(), checkpoints: CHECKPOINTS.map(c => c[0]), instruments: {} };
const params = {};
for (const [inst, key] of Object.entries(INSTR)) {
  let packed; try { packed = await loadM1ForPair(key); } catch (e) { log(`  ${inst}: ${e.message}`); continue; }
  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const dates = [...sessions.keys()].sort().filter(d => (sessions.get(d)?.length ?? 0) >= 300);
  // daily table for the trailing quantiles and ATR
  const day = dates.map(date => { const b = sessions.get(date); let hi = -Infinity, lo = Infinity; for (const x of b) { if (x.high > hi) hi = x.high; if (x.low < lo) lo = x.low; } return { date, o: b[0].open, h: hi, l: lo, c: b[b.length - 1].close }; });
  for (let i = 1; i < day.length; i++) day[i].tr = Math.max(day[i].h - day[i].l, Math.abs(day[i].h - day[i - 1].c), Math.abs(day[i].l - day[i - 1].c));
  for (let i = 14; i < day.length; i++) { let s = 0; for (let k = i - 13; k <= i; k++) s += day[k].tr; day[i].atr = s / 14; }
  const rec = [];   // one per usable session
  for (let i = 250; i < day.length; i++) {
    const d = day[i], prev = day.slice(i - 250, i);
    const upQ = q => quant(prev.map(x => (x.h - x.o) / x.o), q), dnQ = q => quant(prev.map(x => (x.o - x.l) / x.o), q);
    const bands = { upMed: d.o * (1 + upQ(0.5)), up75: d.o * (1 + upQ(0.75)), up90: d.o * (1 + upQ(0.9)), dnMed: d.o * (1 - dnQ(0.5)), dn75: d.o * (1 - dnQ(0.75)), dn90: d.o * (1 - dnQ(0.9)) };
    const bars = sessions.get(d.date); const hm = bars.map(b => londonHM(b.time));
    // first-touch times (minutes) per band; running max/min at each checkpoint; Asia range
    const first = {}; let runHi = -Infinity, runLo = Infinity; const atCp = {};
    let asiaHi = -Infinity, asiaLo = Infinity;
    let cpIdx = 0;
    for (let k = 0; k < bars.length; k++) {
      const b = bars[k], m = hm[k];
      if (m < 420) { if (b.high > asiaHi) asiaHi = b.high; if (b.low < asiaLo) asiaLo = b.low; }
      while (cpIdx < CHECKPOINTS.length && m >= CHECKPOINTS[cpIdx][1]) { atCp[CHECKPOINTS[cpIdx][0]] = { hi: runHi, lo: runLo }; cpIdx++; }
      if (b.high > runHi) runHi = b.high; if (b.low < runLo) runLo = b.low;
      for (const [nm, lv] of [['upMed', bands.upMed], ['up75', bands.up75], ['up90', bands.up90]]) if (first[nm] == null && b.high >= lv) first[nm] = m;
      for (const [nm, lv] of [['dnMed', bands.dnMed], ['dn75', bands.dn75], ['dn90', bands.dn90]]) if (first[nm] == null && b.low <= lv) first[nm] = m;
    }
    while (cpIdx < CHECKPOINTS.length) { atCp[CHECKPOINTS[cpIdx][0]] = { hi: runHi, lo: runLo }; cpIdx++; }
    const atrPrev = day[i - 1].atr; if (!atrPrev) continue;
    rec.push({ date: d.date, o: d.o, h: d.h, l: d.l, bands, first, atCp, asiaAtr: (asiaHi > -Infinity && asiaLo < Infinity) ? (asiaHi - asiaLo) / atrPrev : null,
      stallUpMed: first.upMed != null ? d.h <= bands.upMed + 0.2 * (bands.up75 - bands.upMed) : null, stallUp75: first.up75 != null ? d.h <= bands.up75 + 0.2 * (bands.up90 - bands.up75) : null,
      stallDnMed: first.dnMed != null ? d.l >= bands.dnMed - 0.2 * (bands.dnMed - bands.dn75) : null, stallDn75: first.dn75 != null ? d.l >= bands.dn75 - 0.2 * (bands.dn75 - bands.dn90) : null });
  }
  log(`\n═══ ${inst}: ${rec.length} sessions ═══`);
  const out = { n: rec.length, byCheckpoint: {}, clock: {}, asia: {} };
  // 3. clock
  for (const nm of ['upMed', 'up75', 'up90', 'dnMed', 'dn75', 'dn90']) { const t = rec.map(r => r.first[nm]).filter(x => x != null); out.clock[nm] = { hit: +(t.length / rec.length).toFixed(3), p25: hmStr(quant(t, .25)), med: hmStr(quant(t, .5)), p75: hmStr(quant(t, .75)) }; }
  log(`  clock: ${['upMed', 'up75', 'up90', 'dnMed', 'dn75', 'dn90'].map(k => `${k} hit ${pc(out.clock[k].hit)} · ${out.clock[k].p25}/${out.clock[k].med}/${out.clock[k].p75}`).join(' | ')}`);
  // 1 + 2 by checkpoint
  log(`  checkpoint  n(med,not75)  P(75|med)      n(not med)  P(med|not)    P(75|not med)   stall@med   stall@75`);
  for (const [cp, mins] of CHECKPOINTS) {
    const row = {};
    for (const side of ['up', 'dn']) {
      const med = side + 'Med', b75 = side + '75';
      const reachedBy = (r, nm) => r.first[nm] != null && r.first[nm] < mins;
      const reachedAfter = (r, nm) => r.first[nm] != null && r.first[nm] >= mins;
      const A = rec.filter(r => reachedBy(r, med) && !reachedBy(r, b75));        // med reached, 75 not yet
      const B = rec.filter(r => !reachedBy(r, med));                              // nothing yet
      const p75givenMed = bootShare(A.map(r => reachedAfter(r, b75)), SEED + mins), pMedGivenNot = bootShare(B.map(r => reachedAfter(r, med)), SEED + mins + 1), p75givenNot = bootShare(B.map(r => reachedAfter(r, b75)), SEED + mins + 2);
      const stallMed = bootShare(rec.filter(r => reachedBy(r, med)).map(r => r[side === 'up' ? 'stallUpMed' : 'stallDnMed']), SEED + mins + 3), stall75 = bootShare(rec.filter(r => reachedBy(r, b75)).map(r => r[side === 'up' ? 'stallUp75' : 'stallDn75']), SEED + mins + 4);
      row[side] = { p75givenMed, pMedGivenNot, p75givenNot, stallMed, stall75 };
      if (side === 'up') log(`  ${cp}      ${String(A.length).padStart(5)}        ${pc(p75givenMed.p)} [${pc(p75givenMed.lo)},${pc(p75givenMed.hi)}]   ${String(B.length).padStart(5)}      ${pc(pMedGivenNot.p)} [${pc(pMedGivenNot.lo)},${pc(pMedGivenNot.hi)}]   ${pc(p75givenNot.p)}          ${pc(stallMed.p)} (n=${stallMed.n})  ${pc(stall75.p)} (n=${stall75.n})`);
    }
    out.byCheckpoint[cp] = row;
  }
  // 4. Asia
  const withAsia = rec.filter(r => r.asiaAtr != null); const q1 = quant(withAsia.map(r => r.asiaAtr), 1 / 3), q2 = quant(withAsia.map(r => r.asiaAtr), 2 / 3);
  const lowA = withAsia.filter(r => r.asiaAtr < q1), highA = withAsia.filter(r => r.asiaAtr >= q2);
  const after7 = (r, nm) => r.first[nm] != null && r.first[nm] >= 420;
  for (const nm of ['upMed', 'up75', 'dnMed', 'dn75']) { const d = bootDiff(highA.map(r => after7(r, nm)), lowA.map(r => after7(r, nm)), SEED + 9); out.asia[nm] = { lowAsia: bootShare(lowA.map(r => after7(r, nm)), SEED + 10), highAsia: bootShare(highA.map(r => after7(r, nm)), SEED + 11), diff: d, finding: Math.abs(d.diff) >= 0.15 && (d.lo > 0 || d.hi < 0) }; }
  log(`  Asia (range/ATR terciles, cut ${q1.toFixed(2)} / ${q2.toFixed(2)}): after 07:00, reach upMed narrow ${pc(out.asia.upMed.lowAsia.p)} vs wide ${pc(out.asia.upMed.highAsia.p)} (diff ${(out.asia.upMed.diff.diff * 100).toFixed(0)}pp [${(out.asia.upMed.diff.lo * 100).toFixed(0)},${(out.asia.upMed.diff.hi * 100).toFixed(0)}]${out.asia.upMed.finding ? ' FINDING' : ''}); up75 ${pc(out.asia.up75.lowAsia.p)} vs ${pc(out.asia.up75.highAsia.p)}${out.asia.up75.finding ? ' FINDING' : ''}; dnMed ${pc(out.asia.dnMed.lowAsia.p)} vs ${pc(out.asia.dnMed.highAsia.p)}${out.asia.dnMed.finding ? ' FINDING' : ''}`);
  results.instruments[inst] = out;
  params[inst] = { n: rec.length, clock: out.clock, byCheckpoint: Object.fromEntries(Object.entries(out.byCheckpoint).map(([cp, r]) => [cp, { up: { p75givenMed: r.up.p75givenMed, pMedGivenNot: r.up.pMedGivenNot, p75givenNot: r.up.p75givenNot, stallMed: r.up.stallMed, stall75: r.up.stall75 }, dn: { p75givenMed: r.dn.p75givenMed, pMedGivenNot: r.dn.pMedGivenNot, p75givenNot: r.dn.p75givenNot, stallMed: r.dn.stallMed, stall75: r.dn.stall75 } }])), asia: Object.fromEntries(Object.entries(out.asia).map(([k, v]) => [k, { low: v.lowAsia.p, high: v.highAsia.p, finding: v.finding }])) };
}
fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
fs.writeFileSync(PARAMS, `// GENERATED by analysis/band_reach_study.mjs (T7, ${results.ranAt}). Do not edit by hand.
// Per instrument: band clock (hit rate, p25/median/p75 UK time of first touch), and at each
// checkpoint the odds of reaching the next band before the close given the state so far,
// with bootstrap intervals and n; the stall rate (the band was within 20% of the next gap
// of being the session extreme); and the Asia-range conditioner. Bands are trailing-250-
// session empirical p50/p75/p90 of open-to-high and open-to-low -- the quantities the vol
// forecaster's O-H / O-L bands estimate. Base rates, never entries.
export const BAND_REACH_CHECKPOINTS = ${JSON.stringify(CHECKPOINTS)};
export const BAND_REACH_PARAMS = ${JSON.stringify(params)};
`);
log(`\nwrote ${path.relative(process.cwd(), OUT)} and js/bandReachParams.js`);
