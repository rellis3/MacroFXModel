// Forecast-line clusters + fade MFE/MAE at every book pass (forge/LINE_CLUSTER_MFE_PREREG.md).
//   node scripts/rangebook/cluster_mfe_build.mjs [pair]  -> analysis/output/rangebook/<pair>_clmfe.json
// Fade perspective: entry AT the line on the touch bar. MFE = furthest back inside, MAE = furthest beyond, in σ.
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { linesAtBar, LINE_SIDE, ALL_LINES } from '../../js/voteAtlasV4Lines.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { buildContext, scrambleFrom, passesOf } from './common.mjs';

const PAIR = (process.argv[2] ?? 'eurusd').toLowerCase(), SYM = PAIR.toUpperCase();
const OPTS = { sym: SYM, assetClass: assetClassFor(PAIR), tagFor: loadCalendarProxy()(SYM) };
const HZ = [15, 30, 60, 120], STOPS = [0.1, 0.2, 0.3];
const r3 = x => (x == null || !Number.isFinite(x)) ? null : Math.round(x * 1000) / 1000;

function passRow(d, p, runHi, runLo) {
  const bars = d.bars, unit = d.sigmaFrac * d.open, up = LINE_SIDE[p.line] === 'up', sg = up ? 1 : -1, L = p.level;
  // cluster: other lines on the same side within 0.05σ / 0.10σ, priced at the touch bar from bars before it
  const lv = linesAtBar(d, p.k, runHi, runLo);
  let c05 = 0, c10 = 0; const members = [];
  for (const name of ALL_LINES) {
    if (name === p.line || LINE_SIDE[name] !== LINE_SIDE[p.line] || lv[name] == null) continue;
    const dd = Math.abs(lv[name] - L) / unit;
    if (dd <= 0.05) { c05++; members.push(name); }
    if (dd <= 0.10) c10++;
  }
  // excursions from the touch bar onward (the touch bar itself counts: a fader at the line is filled during it)
  const t0 = bars[p.k].time, out = { c05, c10, members };
  let mfe = 0, mae = 0, h = 0;
  const stopHit = {}, mfeBeforeStop = {};
  for (const s of STOPS) { stopHit[s] = null; mfeBeforeStop[s] = 0; }
  for (let j = p.k; j < bars.length; j++) {
    const b = bars[j], mins = (b.time - t0) / 60;
    const back = (up ? L - b.low : b.high - L) / unit, beyond = (up ? b.high - L : L - b.low) / unit;
    while (h < HZ.length && mins >= HZ[h]) { out['mfe' + HZ[h]] = r3(mfe); out['mae' + HZ[h]] = r3(mae); h++; }
    for (const s of STOPS) {
      if (stopHit[s] != null) continue;
      if (beyond >= s) { stopHit[s] = j === p.k ? 0 : r3(mins); }       // stop first on a tie (conservative for the fader)
      else mfeBeforeStop[s] = Math.max(mfeBeforeStop[s], back);
    }
    mfe = Math.max(mfe, back); mae = Math.max(mae, beyond);
  }
  for (; h < HZ.length; h++) { out['mfe' + HZ[h]] = r3(mfe); out['mae' + HZ[h]] = r3(mae); }
  out.mfeDay = r3(mfe); out.maeDay = r3(mae);
  for (const s of STOPS) { out['mbs' + s] = r3(mfeBeforeStop[s]); out['hit' + s] = stopHit[s]; }
  out.pipsPerSig = r3(unit / (PAIR.endsWith('jpy') ? 0.01 : PAIR === 'gold' ? 0.1 : ['nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'].includes(PAIR) ? 1 : 0.0001));
  return out;
}

function dayRows(ctx, di, want) {
  const d = ctx.days[di], out = [];
  if (!(d.sigmaFrac * d.open > 0)) return out;
  // running extremes before each bar (as passesOf / linesAtBar use them)
  const runHi = [], runLo = []; let hi = d.open, lo = d.open;
  for (const b of d.bars) { runHi.push(hi); runLo.push(lo); if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
  for (const p of passesOf(d)) {
    const key = `${d.date}|${p.line}|${p.pass}`; if (!want.has(key)) continue;
    out.push({ key, ...passRow(d, p, runHi[p.k], runLo[p.k]) });
  }
  return out;
}

const S = await loadM1ForPair(PAIR);
const ctx = buildContext(S, OPTS);
const seq = JSON.parse(fs.readFileSync(`analysis/output/rangebook/${PAIR}_sequence.json`, 'utf8')).passes.filter(p => !p.sameBar);
const want = new Set(seq.map(p => `${p.date}|${p.line}|${p.pass}`)), dates = new Set(seq.map(p => p.date));
const rows = []; ctx.days.forEach((d, di) => { if (dates.has(d.date)) rows.push(...dayRows(ctx, di, want)); });
{ // self-check: the cluster count is decided before the touch bar -> unchanged when everything from the touch bar on is scrambled
  const idx = new Map(Array.from(S.times, (x, i) => [x, i])), byKey = new Map(rows.map(r => [r.key, r]));
  const picks = seq.filter((_, i) => i % Math.floor(seq.length / 6) === 2).slice(0, 6);
  for (const p of picks) {
    const c2 = buildContext(scrambleFrom(S, idx.get(p.time) + 1, 131), OPTS), key = `${p.date}|${p.line}|${p.pass}`;
    const g = dayRows(c2, c2.dayIdx.get(p.date), new Set([key]))[0], r = byKey.get(key);
    if (!g || g.c05 !== r.c05 || g.c10 !== r.c10) { console.error(`LOOK-AHEAD ${key}: ${r.c05}/${r.c10} vs ${g?.c05}/${g?.c10}`); process.exit(2); }
  }
  console.log(`self-check: ${picks.length} cluster counts identical under future-scramble`);
}
fs.writeFileSync(`analysis/output/rangebook/${PAIR}_clmfe.json`, JSON.stringify({ pair: SYM, rows }));
const c = k => [0, 1, 2].map(v => rows.filter(r => (v < 2 ? r[k] === v : r[k] >= 2)).length);
console.log(`${SYM}: ${rows.length} passes; lone/pair/cluster(2+) at 0.05σ ${c('c05')}, at 0.10σ ${c('c10')}`);
