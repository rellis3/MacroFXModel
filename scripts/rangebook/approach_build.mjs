// EURUSD Approach Book builder (forge/APPROACH_BOOK_EURUSD_PREREG.md).
// For every pass of the sequence book: how price ARRIVED — speed, acceleration,
// efficiency, bar size, WaveTrend 1m/15m/1h, VuManChu money flow, tick volume relative
// to the same clock minutes over the previous 20 days, VWAP distance. Bars before the
// pass bar only. Outcomes are carried over from <pair>_sequence.json.
//   node scripts/rangebook/approach_build.mjs [pair]
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { LINE_SIDE } from '../../js/voteAtlasV4Lines.js';
import { computeWaveTrend, computeMoneyFlowVMC } from '../../js/vumanchuCore.js';
import { createHtfContext, htfIdxAt } from '../../js/confluenceFeatures.js';
import { STATE_WT } from '../../js/vumanchuState.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { buildContext, scrambleFrom, passesOf } from './common.mjs';

const PAIR = (process.argv[2] ?? 'eurusd').toLowerCase(), SYM = PAIR.toUpperCase();
const OPTS = { sym: SYM, assetClass: assetClassFor(PAIR), tagFor: loadCalendarProxy()(SYM) };
const r4 = x => (x == null || !Number.isFinite(x)) ? null : Math.round(x * 1e4) / 1e4;

// Series-wide indicators, computed once per (possibly scrambled) series.
function derive(series) {
  const n = series.n;
  const bars = new Array(n);
  for (let i = 0; i < n; i++) bars[i] = { open: series.opens[i], high: series.highs[i], low: series.lows[i], close: series.closes[i] };
  const { wt1, wt2 } = computeWaveTrend(bars);
  const mf = computeMoneyFlowVMC(bars);
  const htf = createHtfContext(series);
  const htfS = createHtfContext(series, { wt: STATE_WT });   // live-page WaveTrend 9/12/3 (forge/FADE_CONTINUE_BOOK_SPEC.md)
  const volPre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) volPre[i + 1] = volPre[i] + (series.volumes[i] || 0);
  const idx = new Map(Array.from(series.times, (t, i) => [t, i]));
  return { series, wt1, wt2, mf, htf, htfS, volPre, idx };
}

function lowerBound(arr, t) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < t) lo = m + 1; else hi = m; } return lo; }
function volBetween(der, t0, t1) {                 // [t0, t1) in epoch seconds -> { vol, bars }
  const a = lowerBound(der.series.times, t0), b = lowerBound(der.series.times, t1);
  return { vol: der.volPre[b] - der.volPre[a], bars: b - a };
}

function featuresFor(der, ctx, di, p, prevPassTime) {
  const d = ctx.days[di], unit = d.sigmaFrac * d.open;
  const up = LINE_SIDE[p.line] === 'up', sg = up ? 1 : -1;
  const S = der.series, t = d.bars[p.k].time, gi = der.idx.get(t);
  const C = i => S.closes[i];
  const f = {};
  const mv = w => gi - 1 - w >= 0 ? (C(gi - 1) - C(gi - 1 - w)) / unit * sg : null;
  f.mv5 = mv(5); f.mv15 = mv(15); f.mv60 = mv(60);
  f.accel = f.mv5 != null && f.mv15 != null ? f.mv5 - f.mv15 / 3 : null;
  const er = w => { if (gi - 1 - w < 0) return null; let path = 0; for (let i = gi - w; i <= gi - 1; i++) path += Math.abs(C(i) - C(i - 1)); return path > 0 ? Math.abs(C(gi - 1) - C(gi - 1 - w)) / path : null; };
  f.er15 = er(15); f.er60 = er(60);
  const hl = (a, b) => { let s = 0; for (let i = a; i <= b; i++) s += S.highs[i] - S.lows[i]; return s / (b - a + 1); };
  f.barSize = gi >= 61 ? hl(gi - 5, gi - 1) / (hl(gi - 60, gi - 1) || NaN) : null;
  const j = gi - 1;
  f.wt1m = der.wt1[j] * sg; f.wtSlope = j >= 5 ? (der.wt1[j] - der.wt1[j - 5]) * sg : null;
  f.wtWith = (der.wt1[j] > der.wt2[j]) === up ? 1 : 0;
  let since = 0; const s0 = Math.sign(der.wt1[j] - der.wt2[j]);
  while (since < 120 && j - since - 1 >= 0 && Math.sign(der.wt1[j - since - 1] - der.wt2[j - since - 1]) === s0) since++;
  f.wtSinceCross = since;
  for (const tf of ['15m', '1h']) { const i = htfIdxAt(der.htf, tf, t); f['wt' + tf] = i >= 0 ? der.htf.byTf[tf].wt1[i] * sg : null; }
  f.mf = Number.isFinite(der.mf[j]) ? der.mf[j] * sg : null;
  // MTF stretch at the live pages' settings: last completed M15 AND H1 wt1 beyond ±53 in the touch direction.
  { const a = htfIdxAt(der.htfS, '15m', t), b = htfIdxAt(der.htfS, '1h', t);
    f.wtS15 = a >= 0 ? der.htfS.byTf['15m'].wt1[a] * sg : null; f.wtS1h = b >= 0 ? der.htfS.byTf['1h'].wt1[b] * sg : null;
    f.mtfStretch = f.wtS15 != null && f.wtS1h != null ? (f.wtS15 >= 53 && f.wtS1h >= 53 ? 1 : 0) : null; }
  // Relative tick volume: this window vs the same clock minutes on the previous 20 London days.
  const off = t - d.openSec;
  for (const w of [5, 15, 60]) {
    const now = volBetween(der, t - w * 60, t);
    const base = [];
    for (let q = di - 1; q >= Math.max(0, di - 20); q--) {
      const pd = ctx.days[q], v = volBetween(der, pd.openSec + off - w * 60, pd.openSec + off);
      if (v.bars >= w / 2) base.push(v.vol);
    }
    const m = base.length >= 10 ? base.reduce((a, b) => a + b, 0) / base.length : null;
    f['relVol' + w] = m && now.bars >= w / 2 ? now.vol / m : null;
  }
  f.volTrend = f.relVol5 != null && f.relVol60 ? f.relVol5 / f.relVol60 : null;
  // London-day VWAP to the bar before the pass; + = the line is beyond VWAP in its own direction.
  let pv = 0, vv = 0;
  for (let i = 0; i < p.k; i++) { const b = d.bars[i], v = b.volume || 1; pv += (b.high + b.low + b.close) / 3 * v; vv += v; }
  f.vwapDist = vv > 0 ? (p.level - pv / vv) / unit * sg : null;
  f.minsSincePrev = Math.round((t - (prevPassTime ?? d.openSec)) / 60);
  for (const k of Object.keys(f)) f[k] = r4(f[k]);
  return f;
}

function dayFeatures(der, ctx, di, want) {
  const d = ctx.days[di];
  if (!(d.sigmaFrac * d.open > 0)) return [];
  const all = passesOf(d).sort((a, b) => a.k - b.k);
  const out = [];
  // prevPassTime = time of the latest pass on an EARLIER bar of the day (null = none yet).
  let prevPassTime = null, curK = -1, curT = null;
  for (const p of all) {
    if (p.k !== curK) { if (curK >= 0) prevPassTime = curT; curK = p.k; curT = d.bars[p.k].time; }
    if (want.has(`${d.date}|${p.line}|${p.pass}`)) out.push({ key: `${d.date}|${p.line}|${p.pass}`, ...featuresFor(der, ctx, di, p, prevPassTime) });
  }
  return out;
}

const full = await loadM1ForPair(PAIR);
const ctx = buildContext(full, OPTS);
const der = derive(full);
const seq = JSON.parse(fs.readFileSync(`analysis/output/rangebook/${PAIR}_sequence.json`, 'utf8')).passes.filter(p => !p.sameBar);
const want = new Set(seq.map(p => `${p.date}|${p.line}|${p.pass}`));
const feats = new Map();
ctx.days.forEach((_, di) => { for (const f of dayFeatures(der, ctx, di, want)) feats.set(f.key, f); });
const rows = seq.map(p => ({ date: p.date, line: p.line, pass: p.pass, time: p.time, londonMin: p.londonMin, used: p.used,
  outcome: p.outcome, dc: p.dc, df: p.df, lastMove: p.lastMove, costSig: p.costSig, ...(feats.get(`${p.date}|${p.line}|${p.pass}`) ?? {}) }))
  .filter(r => r.mv5 !== undefined);
if (rows.length !== seq.length) { console.error(`feature rows ${rows.length} != sequence passes ${seq.length}`); process.exit(3); }

// Self-check: replace the pass bar and everything after it (volume included); every
// feature of that pass must be identical.
{
  const picks = rows.filter((_, i) => i % Math.floor(rows.length / 5) === 2).slice(0, 5);
  if (picks.length < 4) { console.error('self-check sampled too few rows'); process.exit(2); }
  for (const r of picks) {
    // From the bar AFTER the pass: the pass bar defines the pass (scrambling it can move the pass);
    // no feature reads it (all windows end at the bar before).
    const from = der.idx.get(r.time) + 1;
    const q = scrambleFrom(full, from, 53);
    q.volumes = Float64Array.from(full.volumes); for (let i = from; i < q.n; i++) q.volumes[i] = 1 + ((i * 2654435761) % 997);
    const c2 = buildContext(q, OPTS), d2 = derive(q);
    const got = dayFeatures(d2, c2, c2.dayIdx.get(r.date), new Set([`${r.date}|${r.line}|${r.pass}`]))[0];
    const { key, ...a } = got ?? {}; const b = Object.fromEntries(Object.keys(a).map(k => [k, r[k]]));
    if (!got || JSON.stringify(a) !== JSON.stringify(b)) { console.error(`LOOK-AHEAD ${r.date} ${r.line} #${r.pass}\n ${JSON.stringify(b)}\n ${JSON.stringify(a)}`); process.exit(2); }
  }
  console.log(`self-check: ${picks.length} passes' approach features identical under future-scramble (price + volume)`);
}

fs.writeFileSync(`analysis/output/rangebook/${PAIR}_approach.json`, JSON.stringify({ pair: SYM, rows }));
const nulls = Object.fromEntries(['mv60', 'wt15m', 'wt1h', 'relVol60', 'vwapDist'].map(k => [k, rows.filter(r => r[k] == null).length]));
console.log(`${SYM}: ${rows.length} passes with approach features; nulls ${JSON.stringify(nulls)}`);
