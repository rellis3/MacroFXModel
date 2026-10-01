// Reaction trades (forge/REACTION_TRADES_PREREG.md).
//   node scripts/rangebook/reaction_trade_build.mjs [pair]
// A: fade after price is back inside >0.1σ at touch+5/15/30 min; stop = touch extreme + 0.05/0.15σ;
//    targets halfway to the line behind / the line behind / 1R / 2R; day-end exit; stop wins a same-bar tie.
// B: the book's follow trade held vs cut at touch+15 if back inside (B1), and also cut on a Cipher B divergence (B2).
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { LINE_SIDE } from '../../js/voteAtlasV4Lines.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { costForPair } from '../../js/perLineStrategy.js';
import { buildContext, scrambleFrom, passesOf, targets, race } from './common.mjs';

const PAIR = (process.argv[2] ?? 'eurusd').toLowerCase(), SYM = PAIR.toUpperCase();
const ASSET = assetClassFor(PAIR), COST = costForPair(PAIR, ASSET);
const OPTS = { sym: SYM, assetClass: ASSET, tagFor: loadCalendarProxy()(SYM) };
const r3 = x => (x == null || !Number.isFinite(x)) ? null : Math.round(x * 1000) / 1000;
const BUF = [0.05, 0.15], MINS = [5, 15, 30];
const vmcFile = `analysis/output/rangebook/${PAIR}_vmcdiv.json`;
const VMC = fs.existsSync(vmcFile) ? new Map(JSON.parse(fs.readFileSync(vmcFile, 'utf8')).rows.map(r => [r.key, r])) : new Map();

function fadeTrade(bars, kd, up, entry, stop, target, costPx) {
  const sg = up ? 1 : -1, risk = (stop - entry) * sg;
  for (let j = kd; j < bars.length; j++) {
    const b = bars[j];
    const sHit = up ? b.high >= stop : b.low <= stop, tHit = up ? b.low <= target : b.high >= target;
    if (sHit) return -1 - costPx / risk;
    if (tHit) return (entry - target) * sg / risk - costPx / risk;
  }
  return (entry - bars.at(-1).close) * sg / risk - costPx / risk;
}

function passRow(ctx, di, p) {
  const d = ctx.days[di], bars = d.bars, unit = d.sigmaFrac * d.open, up = LINE_SIDE[p.line] === 'up', sg = up ? 1 : -1;
  const tg = targets(d, p.line, p.level, p.hiB, p.loB); if (!tg) return null;
  const dc = Math.abs(tg.cont - p.level) / unit, df = Math.abs(p.level - tg.fade) / unit;
  if (!(dc > 0) || !(df > 0)) return null;
  const costPx = COST / 100 * d.open, c = costPx / unit, t = bars[p.k].time;
  const tr = race(bars, p.k, up, p.level, tg);
  const hold = (tr.outcome === 'cont' ? dc / df : tr.outcome === 'open' ? Math.max(-1, Math.min(dc / df, tr.lastMove / unit / df)) : -1) - c / df;
  const openAt = kd => tr.resolveK == null || tr.resolveK >= kd;                 // follow trade still open at bar kd's open
  const exitR = kd => (bars[kd].open - p.level) * sg / unit / df - c / df;
  const out = { hold: r3(hold) };
  // decision bars
  const kdOf = m => bars.findIndex(b => b.time >= t + m * 60);
  const back = {};
  for (const m of MINS) {
    const kd = kdOf(m);
    if (kd < 1 || !openAt(kd)) { back[m] = null; continue; }
    const now = (bars[kd - 1].close - p.level) * sg / unit;
    back[m] = { kd, now, trig: now < -0.1 };
  }
  // B1 / B2
  const k15 = back[15]?.trig ? back[15].kd : null;
  out.b1 = r3(k15 != null ? exitR(k15) : hold); out.trig15 = k15 != null ? 1 : 0;
  const v = VMC.get(`${d.date}|${p.line}|${p.pass}`);
  let kdiv = null;
  if (v && v.gp === 'div') { const kk = bars.findIndex(b => b.time >= t + v.mp * 60); if (kk > 0 && openAt(kk)) kdiv = kk; }
  const kcut = [k15, kdiv].filter(x => x != null).sort((a, b) => a - b)[0];
  out.b2 = v ? r3(kcut != null ? exitR(kcut) : hold) : null;
  // A
  for (const m of MINS) {
    const B = back[m]; out['a' + m] = null;
    if (!B?.trig) continue;
    const { kd } = B, entry = bars[kd].open;
    let ext = p.level; for (let q = p.k; q < kd; q++) ext = up ? Math.max(ext, bars[q].high) : Math.min(ext, bars[q].low);
    const dF = (entry - tg.fade) * sg; if (!(dF > 0)) continue;
    const cells = {};
    for (const b of BUF) {
      const stop = ext + sg * b * unit, risk = (stop - entry) * sg; if (!(risk > 0)) continue;
      cells[b] = [entry - sg * dF / 2, tg.fade, entry - sg * risk, entry - sg * 2 * risk].map(T => r3(fadeTrade(bars, kd, up, entry, stop, T, costPx)));
    }
    out['a' + m] = { risk: r3(((ext + sg * 0.05 * unit) - entry) * sg / unit), ...cells };
  }
  return out;
}

const S = await loadM1ForPair(PAIR);
const ctx = buildContext(S, OPTS);
const seq = JSON.parse(fs.readFileSync(`analysis/output/rangebook/${PAIR}_sequence.json`, 'utf8')).passes.filter(p => !p.sameBar);
const want = new Set(seq.map(p => `${p.date}|${p.line}|${p.pass}`)), dates = new Set(seq.map(p => p.date));
function dayRows(c2, di, w) {
  const d = c2.days[di], out = [];
  if (!(d.sigmaFrac * d.open > 0)) return out;
  for (const p of passesOf(d)) { const key = `${d.date}|${p.line}|${p.pass}`; if (w.has(key)) { const r = passRow(c2, di, p); if (r) out.push({ key, r }); } }
  return out;
}
const byKey = new Map();
ctx.days.forEach((d, di) => { if (dates.has(d.date)) for (const x of dayRows(ctx, di, want)) byKey.set(x.key, x.r); });
const rows = seq.map(p => { const k = `${p.date}|${p.line}|${p.pass}`; return byKey.has(k) ? { key: k, date: p.date, londonMin: p.londonMin, ...byKey.get(k) } : null; }).filter(Boolean);
if (rows.length < 0.98 * seq.length) { console.error(`only ${rows.length}/${seq.length}`); process.exit(3); }
{ // self-check: B1 trigger and A15 entry risk use bars before the decision bar plus its OPEN (tradeable then); scramble from the bar after
  const lb = (a, x) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; };
  const cand = seq.filter(p => byKey.get(`${p.date}|${p.line}|${p.pass}`)?.a15);
  const picks = cand.filter((_, i) => i % Math.max(1, Math.floor(cand.length / 5)) === 3).slice(0, 5);
  if (picks.length < 4) { console.error('self-check sampled too few'); process.exit(2); }
  for (const p of picks) {
    const key = `${p.date}|${p.line}|${p.pass}`, r = byKey.get(key);
    const c2 = buildContext(scrambleFrom(S, lb(S.times, p.time + 15 * 60) + 1, 101), OPTS);
    const g = dayRows(c2, c2.dayIdx.get(p.date), new Set([key]))[0];
    const f = x => JSON.stringify([x.trig15, x.a15?.risk]);
    if (!g || f(g.r) !== f(r)) { console.error(`LOOK-AHEAD ${key}\n ${f(r)}\n ${g && f(g.r)}`); process.exit(2); }
  }
  console.log(`self-check: ${picks.length} triggers + entry risks identical under future-scramble from the decision bar`);
}
fs.writeFileSync(`analysis/output/rangebook/${PAIR}_reaction.json`, JSON.stringify({ pair: SYM, rows }));
const m = k => rows.reduce((a, r) => a + (r[k] ?? 0), 0) / rows.filter(r => r[k] != null).length;
console.log(`${SYM}: ${rows.length} passes; hold ${m('hold').toFixed(4)} b1 ${m('b1').toFixed(4)} b2 ${VMC.size ? m('b2').toFixed(4) : '–'}; A15 trades ${rows.filter(r => r.a15).length}`);
