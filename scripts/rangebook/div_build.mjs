// Divergence + reaction + new approach features (forge/DIVERGENCE_REACTION_PREREG.md).
//   node scripts/rangebook/div_build.mjs [pair]
// Per pass of the Fade/Continue Book:
//   D1  developing WaveTrend (9/12/3) divergence at the touch, M5 and M15, completed bars only
//   D2  confirmed M5 swing at/beyond the line within 60 min; divergence vs control; race from confirmation
//   R1  reaction 5/15/30 min after the touch; race from the decision bar
//   A2  ROC 240, M15 ATR vs same-time 20-day ATR, explosion, VWAP σ-band position
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { LINE_SIDE } from '../../js/voteAtlasV4Lines.js';
import { computeWaveTrend } from '../../js/vumanchuCore.js';
import { STATE_WT } from '../../js/vumanchuState.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { costForPair } from '../../js/perLineStrategy.js';
import { buildContext, scrambleFrom, passesOf, targets, race } from './common.mjs';

const PAIR = (process.argv[2] ?? 'eurusd').toLowerCase(), SYM = PAIR.toUpperCase();
const ASSET = assetClassFor(PAIR), COST = costForPair(PAIR, ASSET);
const OPTS = { sym: SYM, assetClass: ASSET, tagFor: loadCalendarProxy()(SYM) };
const r3 = x => (x == null || !Number.isFinite(x)) ? null : Math.round(x * 1000) / 1000;
const DIFF = 2, SW_L = 3, SW_R = 2, BACK_MIN = 3, BACK_MAX = 36;
function lowerBound(arr, t) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < t) lo = m + 1; else hi = m; } return lo; }

function htf(S, tf) {                                   // clock-aligned bars + WaveTrend 9/12/3 + ATR14
  const B = [];
  for (let i = 0; i < S.n; i++) {
    const s = Math.floor(S.times[i] / tf) * tf, h = B.at(-1);
    if (!h || h.s !== s) B.push({ s, a: i, b: i, open: S.opens[i], high: S.highs[i], low: S.lows[i], close: S.closes[i] });
    else { h.b = i; if (S.highs[i] > h.high) h.high = S.highs[i]; if (S.lows[i] < h.low) h.low = S.lows[i]; h.close = S.closes[i]; }
  }
  const { wt1 } = computeWaveTrend(B, STATE_WT);
  const atr = new Float64Array(B.length);
  for (let i = 0; i < B.length; i++) {
    const tr = i ? Math.max(B[i].high - B[i].low, Math.abs(B[i].high - B[i - 1].close), Math.abs(B[i].low - B[i - 1].close)) : B[i].high - B[i].low;
    atr[i] = i < 14 ? (i ? (atr[i - 1] * i + tr) / (i + 1) : tr) : (atr[i - 1] * 13 + tr) / 14;
  }
  const isHi = i => { for (let j = 1; j <= SW_L; j++) if (B[i - j].high >= B[i].high) return false; for (let j = 1; j <= SW_R; j++) if (B[i + j].high >= B[i].high) return false; return true; };
  const isLo = i => { for (let j = 1; j <= SW_L; j++) if (B[i - j].low <= B[i].low) return false; for (let j = 1; j <= SW_R; j++) if (B[i + j].low <= B[i].low) return false; return true; };
  return { B, tf, wt1, atr, s: B.map(b => b.s), isHi, isLo, byStart: new Map(B.map((b, i) => [b.s, i])) };
}

function makeEnv(S) {
  const ctx = buildContext(S, OPTS);
  return { S, ctx, m5: htf(S, 300), m15: htf(S, 900), idx: new Map(Array.from(S.times, (t, i) => [t, i])) };
}

// D1: developing divergence at time t (pass bar open), touch level `level`, up = line side.
function developing(env, H, gi, t, level, up) {
  const j = lowerBound(H.s, t - H.tf + 1) - 1;          // last bar with s + tf <= t (completed)
  if (j < BACK_MAX + SW_L + SW_R) return null;
  // last swing confirmed by bar j (swing bar i needs i + SW_R <= j), BACK_MIN..BACK_MAX bars back
  for (let i = j - SW_R; i >= j - BACK_MAX && i >= SW_L; i--) {
    if (j - i < BACK_MIN) continue;
    if (!(up ? H.isHi(i) : H.isLo(i))) continue;
    const swingPx = up ? H.B[i].high : H.B[i].low;
    let ext = level;                                     // price at the touch reaches the line
    for (let m = H.B[i].b + 1; m < gi; m++) ext = up ? Math.max(ext, env.S.highs[m]) : Math.min(ext, env.S.lows[m]);
    if (!(up ? ext > swingPx : ext < swingPx)) return 'noNewExt';
    const d = (H.wt1[j] - H.wt1[i]) * (up ? 1 : -1);    // + = oscillator confirms the new extreme
    return d <= -DIFF ? 'div' : 'newExtNoDiv';
  }
  return 'noSwing';
}

// Race from day bar kd (decision) with the touch's targets; R from the decision bar's open.
function raceFrom(d, kd, up, tg, unit) {
  if (kd >= d.bars.length) return null;
  const entry = d.bars[kd].open, sg = up ? 1 : -1;
  const dc = (tg.cont - entry) * sg / unit, df = (entry - tg.fade) * sg / unit;
  if (!(dc > 0.02) || !(df > 0.02)) return null;
  const rc = race(d.bars, kd - 1, up, entry, tg);
  const lm = rc.lastMove / unit, c = COST / 100 * d.open / unit, o = rc.outcome;
  const fol = (o === 'cont' ? dc / df : o === 'open' ? Math.max(-1, Math.min(dc / df, lm / df)) : -1) - c / df;
  const fad = (o === 'fade' ? df / dc : o === 'open' ? Math.max(-1, Math.min(df / dc, -lm / dc)) : -1) - c / dc;
  return { o: o === 'both' ? 'fade' : o, fol: r3(fol), fad: r3(fad) };
}

function passRow(env, di, p) {
  const d = env.ctx.days[di], bars = d.bars, unit = d.sigmaFrac * d.open, S = env.S;
  const up = LINE_SIDE[p.line] === 'up', sg = up ? 1 : -1, t = bars[p.k].time, gi = env.idx.get(t);
  const tg = targets(d, p.line, p.level, p.hiB, p.loB); if (!tg) return null;
  const out = { d1m5: developing(env, env.m5, gi, t, p.level, up), d1m15: developing(env, env.m15, gi, t, p.level, up) };
  const touchRace = race(bars, p.k, up, p.level, tg);
  const resolvedBy = kd => touchRace.resolveK != null && touchRace.resolveK < kd;

  // D2: first M5 swing at/beyond the line confirmed within 60 min of the touch.
  const H = env.m5, j0 = lowerBound(H.s, Math.floor(t / 300) * 300);
  out.d2 = 'noTurn'; out.d2race = null;
  for (let i = j0; i + SW_R < H.B.length && H.s[i + SW_R] + 300 <= t + 3600; i++) {
    if (i < SW_L) continue;
    if (!(up ? H.isHi(i) && H.B[i].high >= p.level : H.isLo(i) && H.B[i].low <= p.level)) continue;
    const confirmT = H.s[i + SW_R] + 300;
    const kd = bars.findIndex(b => b.time >= confirmT);
    if (kd < 0) break;
    if (resolvedBy(kd)) { out.d2 = 'resolvedFirst'; break; }
    let g = 'noPrior';
    for (let i0 = i - BACK_MIN; i0 >= i - BACK_MAX && i0 >= SW_L; i0--) {
      if (!(up ? H.isHi(i0) : H.isLo(i0))) continue;
      const higher = up ? H.B[i].high > H.B[i0].high : H.B[i].low < H.B[i0].low;
      g = !higher ? 'lowerExt' : (H.wt1[i] - H.wt1[i0]) * sg <= -DIFF ? 'div' : 'noDiv';
      break;
    }
    out.d2 = g; out.d2min = Math.round((confirmT - t) / 60); out.d2race = raceFrom(d, kd, up, tg, unit);
    break;
  }

  // R1: reaction at +5/15/30 minutes.
  for (const m of [5, 15, 30]) {
    const kd = bars.findIndex(b => b.time >= t + m * 60);
    if (kd < 0 || resolvedBy(kd)) { out['r' + m] = null; continue; }
    let ext = 0, extK = p.k;
    for (let q = p.k; q < kd; q++) { const e = (up ? bars[q].high - p.level : p.level - bars[q].low) / unit; if (e > ext) { ext = e; extK = q; } }
    const now = (bars[kd - 1].close - p.level) * sg / unit;
    const mins = Math.max(1, (bars[kd - 1].time - bars[extK].time) / 60 + 1);
    out['r' + m] = { ext: r3(ext), now: r3(now), speed: r3((ext - now) / mins), race: raceFrom(d, kd, up, tg, unit) };
  }

  // A2
  out.roc240 = gi >= 241 ? r3((S.closes[gi - 1] - S.closes[gi - 241]) / unit * sg) : null;
  { const M = env.m15, j = lowerBound(M.s, t - 900 + 1) - 1; const base = [];
    for (let q = 1; q <= 28 && base.length < 20; q++) { const i = M.byStart.get(M.s[j] - q * 86400); if (i != null) base.push(M.atr[i]); }
    out.atrRatio = base.length >= 10 ? r3(M.atr[j] / (base.reduce((a, b) => a + b, 0) / base.length)) : null; }
  if (gi >= 61) { const rg = []; for (let q = gi - 60; q < gi; q++) rg.push(S.highs[q] - S.lows[q]);
    const med = [...rg].sort((a, b) => a - b)[30]; out.explosion = med > 0 ? r3(Math.max(...rg.slice(-15)) / med) : null; } else out.explosion = null;
  { let pv = 0, vv = 0, pv2 = 0;
    for (let q = 0; q < p.k; q++) { const b = bars[q], v = b.volume || 1, tp = (b.high + b.low + b.close) / 3; pv += tp * v; vv += v; pv2 += tp * tp * v; }
    const vw = pv / vv, sd = Math.sqrt(Math.max(0, pv2 / vv - vw * vw));
    out.vwapBand = p.k >= 30 && sd > 0 ? r3((p.level - vw) * sg / sd) : null; }
  return out;
}

const S = await loadM1ForPair(PAIR);
const env = makeEnv(S);
const seq = JSON.parse(fs.readFileSync(`analysis/output/rangebook/${PAIR}_sequence.json`, 'utf8')).passes.filter(p => !p.sameBar);
const want = new Set(seq.map(p => `${p.date}|${p.line}|${p.pass}`)), dates = new Set(seq.map(p => p.date));
function dayRows(e, di, wantSet) {
  const d = e.ctx.days[di], out = [];
  if (!(d.sigmaFrac * d.open > 0)) return out;
  for (const p of passesOf(d)) { const key = `${d.date}|${p.line}|${p.pass}`; if (wantSet.has(key)) { const r = passRow(e, di, p); if (r) out.push({ key, r }); } }
  return out;
}
const byKey = new Map();
env.ctx.days.forEach((d, di) => { if (dates.has(d.date)) for (const x of dayRows(env, di, want)) byKey.set(x.key, x.r); });
const rows = seq.map(p => { const k = `${p.date}|${p.line}|${p.pass}`; return byKey.has(k) ? { key: k, ...byKey.get(k) } : null; }).filter(Boolean);
if (rows.length < 0.98 * seq.length) { console.error(`only ${rows.length}/${seq.length} rows`); process.exit(3); }

// Self-check. Touch-time features (D1, A2): scramble from the bar after the pass bar.
// Post-touch features (D2 group, R1 ext/now/speed): scramble from that decision bar — they must not move.
{
  const touchF = r => JSON.stringify([r.d1m5, r.d1m15, r.roc240, r.atrRatio, r.explosion, r.vwapBand]);
  const picks = seq.filter((_, i) => i % Math.floor(seq.length / 4) === 5).slice(0, 4);
  for (const p of picks) {
    const key = `${p.date}|${p.line}|${p.pass}`, r = byKey.get(key);
    const e2 = makeEnv(scrambleFrom(S, env.idx.get(p.time) + 1, 83));
    const g = dayRows(e2, e2.ctx.dayIdx.get(p.date), new Set([key]))[0];
    if (!g || touchF(g.r) !== touchF(r)) { console.error(`LOOK-AHEAD (touch) ${key}\n ${touchF(r)}\n ${g && touchF(g.r)}`); process.exit(2); }
  }
  const withD2 = seq.filter(p => ['div', 'noDiv'].includes(byKey.get(`${p.date}|${p.line}|${p.pass}`)?.d2));
  const p2 = withD2.filter((_, i) => i % Math.floor(withD2.length / 3) === 1).slice(0, 3);
  for (const p of p2) {
    const key = `${p.date}|${p.line}|${p.pass}`, r = byKey.get(key);
    // D2 group/timing: everything up to the confirmation bar; scramble from the first M1 at confirmation.
    for (const [from, f] of [[lowerBound(S.times, p.time + r.d2min * 60), x => JSON.stringify([x.d2, x.d2min])],
                             [lowerBound(S.times, p.time + 15 * 60), x => JSON.stringify(x.r15 && [x.r15.ext, x.r15.now, x.r15.speed])]]) {
      const e2 = makeEnv(scrambleFrom(S, from, 89));
      const g = dayRows(e2, e2.ctx.dayIdx.get(p.date), new Set([key]))[0];
      if (!g || f(g.r) !== f(r)) { console.error(`LOOK-AHEAD (post-touch) ${key}
 ${f(r)}
 ${g && f(g.r)}`); process.exit(2); }
    }
  }
  if (picks.length < 4 || p2.length < 3) { console.error('self-check sampled too few'); process.exit(2); }
  console.log(`self-check: ${picks.length} touch-time + ${p2.length} post-touch feature sets identical under future-scramble`);
}
fs.writeFileSync(`analysis/output/rangebook/${PAIR}_div.json`, JSON.stringify({ pair: SYM, rows }));
const cnt = k => rows.reduce((a, r) => (a[r[k]] = (a[r[k]] ?? 0) + 1, a), {});
console.log(`${SYM}: ${rows.length}/${seq.length}; d1m5 ${JSON.stringify(cnt('d1m5'))}; d2 ${JSON.stringify(cnt('d2'))}`);
