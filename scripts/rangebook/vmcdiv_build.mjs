// Cipher B WaveTrend divergence at the vol lines (forge/VMC_DIVERGENCE_INDICES_PREREG.md).
//   node scripts/rangebook/vmcdiv_build.mjs [pair]
// Pine f_findDivs on M5 wt2 (hlc3, 9/12/3): fractal top at i (wt2[i] > wt2[i±1], wt2[i±2]), qualifying if
// wt2[i] >= OB; bearish divergence = high[i] > high[prev qualifying top] and wt2[i] < wt2[prev]. Mirror for bottoms.
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { LINE_SIDE } from '../../js/voteAtlasV4Lines.js';
import { computeWaveTrend } from '../../js/vumanchuCore.js';
import { STATE_WT } from '../../js/vumanchuState.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { costForPair } from '../../js/perLineStrategy.js';
import { buildContext, scrambleFrom, passesOf, targets, race } from './common.mjs';

const PAIR = (process.argv[2] ?? 'nq').toLowerCase(), SYM = PAIR.toUpperCase();
const ASSET = assetClassFor(PAIR), COST = costForPair(PAIR, ASSET);
const OPTS = { sym: SYM, assetClass: ASSET, tagFor: loadCalendarProxy()(SYM) };
const LEVELS = { p: [45, -65], s: [25, -25] }, MAXBACK = 288;
const r3 = x => (x == null || !Number.isFinite(x)) ? null : Math.round(x * 1000) / 1000;
function lowerBound(arr, t) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < t) lo = m + 1; else hi = m; } return lo; }

function makeEnv(S) {
  const ctx = buildContext(S, OPTS), B = [];
  for (let i = 0; i < S.n; i++) {
    const s = Math.floor(S.times[i] / 300) * 300, h = B.at(-1);
    if (!h || h.s !== s) B.push({ s, open: S.opens[i], high: S.highs[i], low: S.lows[i], close: S.closes[i] });
    else { if (S.highs[i] > h.high) h.high = S.highs[i]; if (S.lows[i] < h.low) h.low = S.lows[i]; h.close = S.closes[i]; }
  }
  const { wt2 } = computeWaveTrend(B, STATE_WT);
  const isTop = i => i >= 2 && i + 2 < B.length && wt2[i] > wt2[i - 1] && wt2[i] > wt2[i - 2] && wt2[i] > wt2[i + 1] && wt2[i] > wt2[i + 2];
  const isBot = i => i >= 2 && i + 2 < B.length && wt2[i] < wt2[i - 1] && wt2[i] < wt2[i - 2] && wt2[i] < wt2[i + 1] && wt2[i] < wt2[i + 2];
  // Qualifying fractals per level set, with their previous qualifying fractal (within MAXBACK bars).
  const fr = {};
  for (const [k, [ob, os]] of Object.entries(LEVELS)) {
    for (const [side, test, ok, px] of [['top', isTop, i => wt2[i] >= ob, i => B[i].high], ['bot', isBot, i => wt2[i] <= os, i => B[i].low]]) {
      const idx = [], prev = new Map();
      for (let i = 2; i + 2 < B.length; i++) if (test(i) && ok(i)) { const p = idx.at(-1); if (p != null && i - p <= MAXBACK) prev.set(i, p); idx.push(i); }
      fr[k + side] = { idx, prev, px };
    }
  }
  return { S, ctx, B, wt2, fr, s: B.map(b => b.s) };
}

function raceFrom(d, kd, up, tg, unit) {
  if (kd >= d.bars.length) return null;
  const entry = d.bars[kd].open, sg = up ? 1 : -1;
  const dc = (tg.cont - entry) * sg / unit, df = (entry - tg.fade) * sg / unit;
  if (!(dc > 0.02) || !(df > 0.02)) return null;
  const rc = race(d.bars, kd - 1, up, entry, tg), lm = rc.lastMove / unit, c = COST / 100 * d.open / unit, o = rc.outcome;
  const fol = (o === 'cont' ? dc / df : o === 'open' ? Math.max(-1, Math.min(dc / df, lm / df)) : -1) - c / df;
  const fad = (o === 'fade' ? df / dc : o === 'open' ? Math.max(-1, Math.min(df / dc, -lm / dc)) : -1) - c / dc;
  return { o: o === 'both' ? 'fade' : o, fol: r3(fol), fad: r3(fad) };
}

function passRow(env, di, p) {
  const d = env.ctx.days[di], bars = d.bars, unit = d.sigmaFrac * d.open, up = LINE_SIDE[p.line] === 'up';
  const tg = targets(d, p.line, p.level, p.hiB, p.loB); if (!tg) return null;
  const t = bars[p.k].time, tr = race(bars, p.k, up, p.level, tg), out = {};
  const j0 = lowerBound(env.s, Math.floor(t / 300) * 300);
  for (const k of Object.keys(LEVELS)) {
    const F = env.fr[k + (up ? 'top' : 'bot')];
    out['g' + k] = null; out['m' + k] = null; out['r' + k] = null;
    for (let q = lowerBound(F.idx, j0); q < F.idx.length; q++) {
      const i = F.idx[q], confirmT = env.s[i + 2] + 300;
      if (confirmT > t + 3600) break;
      if (!(up ? env.B[i].high >= p.level : env.B[i].low <= p.level)) continue;
      const kd = bars.findIndex(b => b.time >= confirmT);
      if (kd < 0) break;
      if (tr.resolveK != null && tr.resolveK < kd) { out['g' + k] = 'resolvedFirst'; break; }
      const pi = F.prev.get(i);
      const div = pi != null && (up ? env.B[i].high > env.B[pi].high && env.wt2[i] < env.wt2[pi] : env.B[i].low < env.B[pi].low && env.wt2[i] > env.wt2[pi]);
      out['g' + k] = div ? 'div' : 'noDiv'; out['m' + k] = Math.round((confirmT - t) / 60);
      out['gap' + k] = pi != null ? r3(Math.abs(env.wt2[i] - env.wt2[pi])) : null; out['bars' + k] = pi != null ? i - pi : null;
      out['r' + k] = raceFrom(d, kd, up, tg, unit);
      break;
    }
  }
  return out;
}

const S = await loadM1ForPair(PAIR);
const env = makeEnv(S);
const seq = JSON.parse(fs.readFileSync(`analysis/output/rangebook/${PAIR}_sequence.json`, 'utf8')).passes.filter(p => !p.sameBar);
const want = new Set(seq.map(p => `${p.date}|${p.line}|${p.pass}`)), dates = new Set(seq.map(p => p.date));
function dayRows(e, di, w) {
  const d = e.ctx.days[di], out = [];
  if (!(d.sigmaFrac * d.open > 0)) return out;
  for (const p of passesOf(d)) { const key = `${d.date}|${p.line}|${p.pass}`; if (w.has(key)) { const r = passRow(e, di, p); if (r) out.push({ key, r }); } }
  return out;
}
const byKey = new Map();
env.ctx.days.forEach((d, di) => { if (dates.has(d.date)) for (const x of dayRows(env, di, want)) byKey.set(x.key, x.r); });
const rows = seq.map(p => { const k = `${p.date}|${p.line}|${p.pass}`; return byKey.has(k) ? { key: k, ...byKey.get(k) } : null; }).filter(Boolean);
if (rows.length < 0.98 * seq.length) { console.error(`only ${rows.length}/${seq.length}`); process.exit(3); }
{ // self-check: scramble from the first M1 at the confirmation; group + timing must not move
  const cand = seq.filter(p => ['div', 'noDiv'].includes(byKey.get(`${p.date}|${p.line}|${p.pass}`)?.gp));
  const picks = cand.filter((_, i) => i % Math.max(1, Math.floor(cand.length / 5)) === 2).slice(0, 5);
  if (picks.length < 4) { console.error('self-check sampled too few'); process.exit(2); }
  const f = x => JSON.stringify([x.gp, x.mp, x.gapp, x.barsp]);
  for (const p of picks) {
    const key = `${p.date}|${p.line}|${p.pass}`, r = byKey.get(key);
    const e2 = makeEnv(scrambleFrom(S, lowerBound(S.times, p.time + r.mp * 60), 97));
    const g = dayRows(e2, e2.ctx.dayIdx.get(p.date), new Set([key]))[0];
    if (!g || f(g.r) !== f(r)) { console.error(`LOOK-AHEAD ${key}\n ${f(r)}\n ${g && f(g.r)}`); process.exit(2); }
  }
  console.log(`self-check: ${picks.length} divergence groups identical under future-scramble from the confirmation bar`);
}
fs.writeFileSync(`analysis/output/rangebook/${PAIR}_vmcdiv.json`, JSON.stringify({ pair: SYM, rows }));
const cnt = k => rows.reduce((a, r) => (a[r[k]] = (a[r[k]] ?? 0) + 1, a), {});
console.log(`${SYM}: ${rows.length} passes; OB45 ${JSON.stringify(cnt('gp'))}; OB25 ${JSON.stringify(cnt('gs'))}`);
