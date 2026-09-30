// Theory-lab features at the levels (forge/THEORY_FEATURES_LEVELS_PREREG.md), EURUSD.
// For every approach-book pass: dollar-vs-euro split of the last 60 min, variance ratio VR(5),
// jump ratio (bipower), and CVOL skew oriented to the line. Bars before the pass bar only.
//   node scripts/rangebook/theory_build.mjs
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { LINE_SIDE } from '../../js/voteAtlasV4Lines.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { buildContext, scrambleFrom, passesOf } from './common.mjs';
import { partnerLog, dayBuckets, dayModel } from './relval.mjs';

const OPTS = { sym: 'EURUSD', assetClass: 'fx', tagFor: loadCalendarProxy()('EURUSD') };
const EX_EUR = [['gbpusd', 0.119, -1], ['usdjpy', 0.136, 1], ['usdcad', 0.091, 1], ['usdchf', 0.036, 1]];
const LOOKBACK = 20, r4 = x => (x == null || !Number.isFinite(x)) ? null : Math.round(x * 1e4) / 1e4;
const CV = JSON.parse(fs.readFileSync('js/data/cmeCvolEod.json', 'utf8')).series.EURUSD;
const CVD = CV.map(x => x.date);
const lowerBound = (a, v) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; } return lo; };

// 1-minute basket log price (same weights), for the 60-minute factor move.
function basketMinute(series) { return partnerLog(series, 60); }

function features(E, bmin, idx, d, p, model) {
  const up = LINE_SIDE[p.line] === 'up', sg = up ? 1 : -1, t = d.bars[p.k].time, gi = idx.get(t);
  const f = {};
  const C = i => E.closes[i], lr = i => Math.log(C(i) / C(i - 1));
  // 1. dollar vs euro, last 60 minutes (bars gi-61 .. gi-1)
  const bAt = tt => { for (let s = 0; s <= 5; s++) { const v = bmin.get(Math.floor(tt / 60) * 60 - s * 60); if (v != null) return v; } return null; };
  if (gi >= 61 && model) {
    const eMove = Math.log(C(gi - 1) / C(gi - 61)), b1 = bAt(E.times[gi - 1]), b0 = bAt(E.times[gi - 61]);
    if (b1 != null && b0 != null) {
      const factor = model.beta * (b1 - b0), own = eMove - factor;
      f.factorMove = factor / d.sigmaFrac * sg; f.ownMove = own / d.sigmaFrac * sg;
      f.ownShare = (Math.abs(own) + Math.abs(factor)) > 0 ? Math.abs(own) / (Math.abs(own) + Math.abs(factor)) : null;
    }
  }
  // 2. variance ratio VR(5) over the last 120 one-minute returns
  if (gi >= 121) {
    const r1 = []; for (let i = gi - 120; i <= gi - 1; i++) r1.push(lr(i));
    const r5 = []; for (let j = 0; j < 24; j++) r5.push(r1.slice(j * 5, j * 5 + 5).reduce((a, b) => a + b, 0));
    const v = xs => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1); };
    const v1 = v(r1); f.vr = v1 > 0 ? v(r5) / (5 * v1) : null;
  }
  // 3. jump ratio: max |1-min return| in the last 15 min / bipower sigma of the 120 min before
  if (gi >= 136) {
    let mx = 0; for (let i = gi - 15; i <= gi - 1; i++) mx = Math.max(mx, Math.abs(lr(i)));
    let bv = 0, n = 0; for (let i = gi - 134; i <= gi - 16; i++) { bv += Math.abs(lr(i)) * Math.abs(lr(i - 1)); n++; }
    const sig = Math.sqrt((Math.PI / 2) * bv / n); f.jump = sig > 0 ? mx / sig : null;
  }
  // 4. CVOL skew, latest settle dated before the London day, oriented to the line
  const ci = lowerBound(CVD, d.date) - 1;
  f.skew = ci >= 0 ? CV[ci].skew * sg : null;
  for (const k of Object.keys(f)) f[k] = r4(f[k]);
  return f;
}

function build(E, pairs, want) {
  const ctx = buildContext(E, OPTS);
  const series = pairs.map(([, w, s, p]) => ({ w, s, p }));
  const b5 = partnerLog(series), bmin = basketMinute(series);
  const idx = new Map(Array.from(E.times, (x, i) => [x, i]));
  const bks = ctx.days.map(d => dayBuckets(d, b5));
  const out = new Map();
  ctx.days.forEach((d, di) => {
    if (!(d.sigmaFrac > 0)) return;
    const model = di >= LOOKBACK ? dayModel(bks.slice(di - LOOKBACK, di)) : null;
    for (const p of passesOf(d)) {
      const key = `${d.date}|${p.line}|${p.pass}`;
      if (want && !want.has(key)) continue;
      out.set(key, { t: d.bars[p.k].time, ...features(E, bmin, idx, d, p, model) });
    }
  });
  return out;
}

const E = await loadM1ForPair('eurusd');
const pairs = []; for (const [k, w, s] of EX_EUR) pairs.push([k, w, s, await loadM1ForPair(k)]);
const appr = JSON.parse(fs.readFileSync('analysis/output/rangebook/eurusd_approach.json', 'utf8')).rows;
const want = new Set(appr.map(r => `${r.date}|${r.line}|${r.pass}`));
const feats = build(E, pairs, want);
if (feats.size !== want.size) { console.error(`matched ${feats.size} of ${want.size} passes`); process.exit(3); }

// Self-check: scramble EURUSD and every basket pair from the pass bar onward; features unchanged.
{
  const keys = [...feats.keys()].filter((_, i) => i % Math.floor(feats.size / 5) === 2).slice(0, 5);
  const cut = (pk, t, seed) => { let i = 0; while (i < pk.n && pk.times[i] < t) i++; return scrambleFrom(pk, i, seed); };
  for (const key of keys) {
    const { t, ...a } = feats.get(key);
    const again = build(cut(E, t, 101), pairs.map(([k, w, s, p], i) => [k, w, s, cut(p, t, 111 + i)]), new Set([key])).get(key);
    const { t: _t, ...b } = again ?? {};
    if (!again || JSON.stringify(a) !== JSON.stringify(b)) { console.error(`LOOK-AHEAD ${key}\n ${JSON.stringify(a)}\n ${JSON.stringify(b)}`); process.exit(2); }
  }
  console.log(`self-check: ${keys.length} passes' theory features identical under future-scramble (EURUSD + basket)`);
}
fs.writeFileSync('analysis/output/rangebook/eurusd_theory.json', JSON.stringify(Object.fromEntries([...feats].map(([k, { t, ...v }]) => [k, v]))));
const nn = k => [...feats.values()].filter(v => v[k] == null).length;
console.log(`EURUSD: ${feats.size} passes; nulls factor ${nn('ownShare')}, vr ${nn('vr')}, jump ${nn('jump')}, skew ${nn('skew')}`);
