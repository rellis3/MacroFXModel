// Confluence levels builder (forge/CONFLUENCE_LEVELS_PREREG.md).
// For every pass of the Fade/Continue Book: distance (σ) from the vol line to each retail
// level type — nearest at the line, and the first one in the continuation path — for the
// real levels and for a placebo copy shifted 0.15–0.5σ. Bars strictly before the pass bar only.
//   node scripts/rangebook/levels_build.mjs [pair]
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { LINE_SIDE } from '../../js/voteAtlasV4Lines.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { buildContext, scrambleFrom, passesOf } from './common.mjs';

const PAIR = (process.argv[2] ?? 'eurusd').toLowerCase(), SYM = PAIR.toUpperCase();
const OPTS = { sym: SYM, assetClass: assetClassFor(PAIR), tagFor: loadCalendarProxy()(SYM) };
export const TYPES = ['sessionOpens', 'prevDayOpen', 'weekOpen', 'pdhl', 'pwhl', 'prevClose', 'roundNum', 'fibGP', 'fibExt',
                      'poc', 'valueArea', 'nakedPOC', 'fvgM15', 'fvgH1'];
const STEP = PAIR === 'gold' ? 10 : PAIR.endsWith('jpy') ? 0.5 : 0.005;
const TOL = 0.05, FAR = 5, BLK = 256, DAY = 86400;
const r3 = x => (x == null || !Number.isFinite(x)) ? null : Math.round(x * 1000) / 1000;

// ── clocks ──
const lastSun = (y, m) => { const d = new Date(Date.UTC(y, m + 1, 0)); return d.getUTCDate() - d.getUTCDay(); };
const nthSun = (y, m, n) => { const f = new Date(Date.UTC(y, m, 1)).getUTCDay(); return 1 + ((7 - f) % 7) + 7 * (n - 1); };
function etOff(t) {                     // hours to add to UTC for New York local
  const y = new Date(t * 1000).getUTCFullYear();
  const a = Date.UTC(y, 2, nthSun(y, 2, 2), 7) / 1000, b = Date.UTC(y, 10, nthSun(y, 10, 1), 6) / 1000;
  return t >= a && t < b ? -4 : -5;
}
function ukMidnight(date) {             // epoch of 00:00 Europe/London on a YYYY-MM-DD
  const [y, m, d] = date.split('-').map(Number), u = Date.UTC(y, m - 1, d) / 1000;
  const a = Date.UTC(y, 2, lastSun(y, 2), 1) / 1000, b = Date.UTC(y, 9, lastSun(y, 9), 1) / 1000;
  return u >= a && u < b ? u - 3600 : u;
}
const etMidnight = date => { const u = Date.UTC(...date.split('-').map((v, i) => i === 1 ? v - 1 : +v)) / 1000; return u - etOff(u + 12 * 3600) * 3600; };
const mondayOf = key => { const d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
function hashU(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 1e6) / 1e6; }

function lowerBound(arr, t) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < t) lo = m + 1; else hi = m; } return lo; }

// ── series-wide structures (rebuilt on a scrambled copy for the self-check) ──
function makeEnv(S) {
  const ctx = buildContext(S, OPTS);
  // NY-close days with M1 index ranges (key / endSec exactly as nyCloseDailyBars).
  const ny = []; let cur = null;
  for (let i = 0; i < S.n; i++) {
    const t = S.times[i], off = etOff(t), key = new Date((t + (off + 7) * 3600) * 1000).toISOString().slice(0, 10);
    if (!cur || cur.key !== key) {
      if (cur) ny.push(cur);
      cur = { key, endSec: Date.parse(key + 'T00:00:00Z') / 1000 + DAY - (off + 7) * 3600, a: i, b: i, open: S.opens[i], high: -Infinity, low: Infinity, close: 0 };
    }
    cur.b = i; if (S.highs[i] > cur.high) cur.high = S.highs[i]; if (S.lows[i] < cur.low) cur.low = S.lows[i]; cur.close = S.closes[i];
  }
  if (cur) ny.push(cur);
  const full = ny.filter(x => x.b - x.a + 1 >= 60);
  // Block min/max for range queries.
  const nb = Math.ceil(S.n / BLK), bh = new Float64Array(nb).fill(-Infinity), bl = new Float64Array(nb).fill(Infinity);
  for (let i = 0; i < S.n; i++) { const q = (i / BLK) | 0; if (S.highs[i] > bh[q]) bh[q] = S.highs[i]; if (S.lows[i] < bl[q]) bl[q] = S.lows[i]; }
  const range = (a, b) => {                              // [a, b] inclusive -> {hi, lo}
    let hi = -Infinity, lo = Infinity, i = a;
    while (i <= b && i % BLK) { if (S.highs[i] > hi) hi = S.highs[i]; if (S.lows[i] < lo) lo = S.lows[i]; i++; }
    while (i + BLK - 1 <= b) { const q = i / BLK; if (bh[q] > hi) hi = bh[q]; if (bl[q] < lo) lo = bl[q]; i += BLK; }
    while (i <= b) { if (S.highs[i] > hi) hi = S.highs[i]; if (S.lows[i] < lo) lo = S.lows[i]; i++; }
    return { hi, lo };
  };
  const fvg = { m15: gaps(S, 900), h1: gaps(S, 3600) };
  const idx = new Map(Array.from(S.times, (t, i) => [t, i]));
  return { S, ctx, ny, nyKeys: ny.map(x => x.key), full, fullEnd: full.map(x => x.endSec), range, fvg, idx, profiles: new Map() };
}

// Fair value gaps on a clock timeframe: zones + the M1 index of the full fill (Infinity = not within 5 days).
function gaps(S, tf) {
  const H = [];
  for (let i = 0; i < S.n; i++) {
    const s = Math.floor(S.times[i] / tf) * tf, h = H.at(-1);
    if (!h || h.s !== s) H.push({ s, a: i, b: i, high: S.highs[i], low: S.lows[i] });
    else { h.b = i; if (S.highs[i] > h.high) h.high = S.highs[i]; if (S.lows[i] < h.low) h.low = S.lows[i]; }
  }
  const out = [];
  for (let i = 2; i < H.length; i++) {
    const A = H[i - 2], C = H[i];
    let z = null;
    if (C.low > A.high) z = { lo: A.high, hi: C.low, bull: true };
    else if (C.high < A.low) z = { lo: C.high, hi: A.low, bull: false };
    if (!z) continue;
    z.formT = C.s + tf; z.fill = Infinity;
    const limit = z.formT + 5 * DAY;
    for (let j = i + 1; j < H.length && H[j].s < limit; j++) {
      if (z.bull ? H[j].low <= z.lo : H[j].high >= z.hi) {
        for (let m = H[j].a; m <= H[j].b; m++) if (z.bull ? S.lows[m] <= z.lo : S.highs[m] >= z.hi) { z.fill = m; break; }
        break;
      }
    }
    out.push(z);
  }
  return { zones: out, formT: out.map(z => z.formT) };
}

// Volume profile of a NY day (M1 tick volume spread evenly over each bar's range).
function profile(env, j, bin) {
  const key = j + '|' + bin, hit = env.profiles.get(key); if (hit) return hit;
  const S = env.S, D = env.full[j], base = D.low, nb = Math.max(1, Math.ceil((D.high - D.low) / bin) + 1), v = new Float64Array(nb);
  for (let i = D.a; i <= D.b; i++) {
    const a = Math.floor((S.lows[i] - base) / bin), b = Math.floor((S.highs[i] - base) / bin), w = (S.volumes[i] || 1) / (b - a + 1);
    for (let q = a; q <= b; q++) v[q] += w;
  }
  let poc = 0, tot = 0; for (let q = 0; q < nb; q++) { tot += v[q]; if (v[q] > v[poc]) poc = q; }
  let lo = poc, hi = poc, acc = v[poc];
  while (acc < 0.7 * tot && (lo > 0 || hi < nb - 1)) {
    const up = hi < nb - 1 ? v[hi + 1] : -1, dn = lo > 0 ? v[lo - 1] : -1;
    if (up >= dn) acc += v[++hi]; else acc += v[--lo];
  }
  const mid = q => base + (q + 0.5) * bin;
  const out = { poc: mid(poc), vah: base + (hi + 1) * bin, val: base + lo * bin };
  env.profiles.set(key, out);
  return out;
}

// Every level of every type for a pass at bar gi (time t) in London day d. -> {type: {pts:[], zones:[[lo,hi]]}}
function levelsAt(env, d, gi, t) {
  const S = env.S, unit = d.sigmaFrac * d.open, L = {};
  for (const ty of TYPES) L[ty] = { pts: [], zones: [] };
  const j = lowerBound(env.fullEnd, t + 1) - 1;          // last full NY day closed at or before t
  if (j < 25) return null;
  const P = env.full[j];
  const sOpen = T => { const i = lowerBound(S.times, T); return i < gi && S.times[i] < T + 3 * 3600 ? S.opens[i] : null; };
  const lm = ukMidnight(d.date), em = etMidnight(d.date);
  for (const T of [lm + 7 * 3600, lm + 8 * 3600, em, em + 8 * 3600]) { const o = sOpen(T); if (o != null) L.sessionOpens.pts.push(o); }
  L.prevDayOpen.pts.push(P.open); L.prevClose.pts.push(P.close); L.pdhl.pts.push(P.high, P.low);
  // Current NY day = the one containing t; its week's first NY day open.
  const off = etOff(t), curKey = new Date((t + (off + 7) * 3600) * 1000).toISOString().slice(0, 10), mon = mondayOf(curKey);
  const wi = lowerBound(env.nyKeys, mon), wk = env.ny[wi] && mondayOf(env.ny[wi].key) === mon && env.ny[wi].a < gi ? env.ny[wi] : null;
  if (wk) L.weekOpen.pts.push(wk.open);
  const prevMon = mondayOf(new Date(Date.parse(mon + 'T12:00:00Z') - 7 * DAY * 1000).toISOString().slice(0, 10));
  let wh = -Infinity, wl = Infinity;
  for (let q = j; q >= 0 && q > j - 12; q--) { const x = env.full[q]; if (mondayOf(x.key) === prevMon) { wh = Math.max(wh, x.high); wl = Math.min(wl, x.low); } }
  if (wh > -Infinity) L.pwhl.pts.push(wh, wl);
  const R = P.high - P.low;
  L.fibGP.zones.push([P.high - 0.65 * R, P.high - 0.618 * R], [P.low + 0.618 * R, P.low + 0.65 * R]);
  L.fibExt.pts.push(P.high + 0.272 * R, P.high + 0.618 * R, P.low - 0.272 * R, P.low - 0.618 * R);
  const bin = 0.02 * unit, pf = profile(env, j, bin);
  L.poc.pts.push(pf.poc); L.valueArea.pts.push(pf.vah, pf.val);
  // Naked POCs: segment [end of day q + 1, gi − 1] grows backwards one day at a time.
  let seg = gi - 1 >= P.b + 1 ? env.range(P.b + 1, gi - 1) : { hi: -Infinity, lo: Infinity };
  for (let q = j; q > j - 20 && q >= 0; q--) {
    if (q < j) { const r = env.range(env.full[q].b + 1, env.full[q + 1].b); seg = { hi: Math.max(seg.hi, r.hi), lo: Math.min(seg.lo, r.lo) }; }
    const p = profile(env, q, bin).poc;
    if (!(seg.lo <= p && p <= seg.hi)) L.nakedPOC.pts.push(p);
  }
  for (const [ty, g] of [['fvgM15', env.fvg.m15], ['fvgH1', env.fvg.h1]]) {
    for (let i = lowerBound(g.formT, t - 5 * DAY); i < g.formT.length && g.formT[i] <= t; i++) {
      const z = g.zones[i]; if (z.fill >= gi) L[ty].zones.push([z.lo, z.hi]);
    }
  }
  return L;
}

function dist(lv, line, sg, unit, shift, round) {        // -> [near, ahead] in σ
  let near = Infinity, ahead = Infinity;
  const pt = x => { x += shift; const s = (x - line) * sg / unit; near = Math.min(near, Math.abs(s)); if (s > TOL && s < ahead) ahead = s; };
  if (round) { const b = Math.floor((line - shift) / STEP); for (let q = b - 3; q <= b + 4; q++) pt(q * STEP); }
  for (const x of lv.pts) pt(x);
  for (const [lo0, hi0] of lv.zones) {
    const lo = lo0 + shift, hi = hi0 + shift;
    const a = (lo - line) * sg / unit, b = (hi - line) * sg / unit, sNear = Math.min(a, b), sFar = Math.max(a, b);
    if (sNear <= 0 && sFar >= 0) near = 0; else near = Math.min(near, Math.min(Math.abs(a), Math.abs(b)));
    if (sNear > TOL && sNear < ahead) ahead = sNear;          // a zone already at the line is not 'in the way'
  }
  const c = v => v > FAR ? null : r3(v);
  return [c(near), c(ahead)];
}

function passFeatures(env, di, p) {
  const d = env.ctx.days[di], unit = d.sigmaFrac * d.open, t = d.bars[p.k].time, gi = env.idx.get(t);
  const lv = levelsAt(env, d, gi, t); if (!lv) return null;
  const sg = LINE_SIDE[p.line] === 'up' ? 1 : -1, out = {};
  for (const ty of TYPES) {
    const u = hashU(d.date + '|' + ty), shift = (u < 0.5 ? -1 : 1) * (0.15 + 0.35 * hashU(ty + '|' + d.date + '|m')) * unit;
    const round = ty === 'roundNum';
    [out[ty], out[ty + 'A']] = dist(lv[ty], p.level, sg, unit, 0, round);
    [out[ty + '_p'], out[ty + 'A_p']] = dist(lv[ty], p.level, sg, unit, shift, round);
  }
  const j = lowerBound(env.fullEnd, t + 1) - 1, c0 = env.full[j].close, c5 = env.full[j - 5].close;
  out.trend = r3((c0 - c5) / (unit * Math.sqrt(5)));
  return out;
}

const COLS = ['trend', ...TYPES.flatMap(t => [t, t + 'A', t + '_p', t + 'A_p'])];

function dayRows(env, di, want) {
  const d = env.ctx.days[di], out = [];
  if (!(d.sigmaFrac * d.open > 0)) return out;
  for (const p of passesOf(d)) {
    const key = `${d.date}|${p.line}|${p.pass}`;
    if (!want.has(key)) continue;
    const f = passFeatures(env, di, p);
    if (f) out.push({ key, f });
  }
  return out;
}

const S = await loadM1ForPair(PAIR);
const env = makeEnv(S);
const seq = JSON.parse(fs.readFileSync(`analysis/output/rangebook/${PAIR}_sequence.json`, 'utf8')).passes.filter(p => !p.sameBar);
const want = new Set(seq.map(p => `${p.date}|${p.line}|${p.pass}`));
const byKey = new Map();
const dates = new Set(seq.map(p => p.date));
env.ctx.days.forEach((d, di) => { if (dates.has(d.date)) for (const r of dayRows(env, di, want)) byKey.set(r.key, r.f); });
const rows = [];
for (const p of seq) { const f = byKey.get(`${p.date}|${p.line}|${p.pass}`); if (f) rows.push([p.date, p.line, p.pass, ...COLS.map(c => f[c])]); }
const cover = rows.length / seq.length;
if (cover < 0.95) { console.error(`only ${(cover * 100).toFixed(1)}% of passes got levels`); process.exit(3); }

// Self-check: scramble from the bar AFTER the pass (price + volume); every level distance must be identical.
{
  const picks = seq.filter((_, i) => i % Math.floor(seq.length / 6) === 4).slice(0, 6);
  if (picks.length < 5) { console.error('self-check sampled too few rows'); process.exit(2); }
  for (const p of picks) {
    const from = env.idx.get(p.time) + 1;
    const q = scrambleFrom(S, from, 61);
    q.volumes = Float64Array.from(S.volumes); for (let i = from; i < q.n; i++) q.volumes[i] = 1 + ((i * 2654435761) % 997);
    const e2 = makeEnv(q), key = `${p.date}|${p.line}|${p.pass}`;
    const got = dayRows(e2, e2.ctx.dayIdx.get(p.date), new Set([key]))[0];
    const a = JSON.stringify(COLS.map(c => got?.f[c])), b = JSON.stringify(COLS.map(c => byKey.get(key)?.[c]));
    if (!got || a !== b) { console.error(`LOOK-AHEAD ${key}\n ${b}\n ${a}`); process.exit(2); }
  }
  console.log(`self-check: ${picks.length} passes' level distances identical under future-scramble (price + volume)`);
}

fs.writeFileSync(`analysis/output/rangebook/${PAIR}_levels.json`, JSON.stringify({ pair: SYM, cols: ['date', 'line', 'pass', ...COLS], rows }));
const share = Object.fromEntries(TYPES.map(ty => { const i = 3 + COLS.indexOf(ty); return [ty, Math.round(rows.filter(r => r[i] != null && r[i] <= TOL).length / rows.length * 1000) / 10]; }));
console.log(`${SYM}: ${rows.length}/${seq.length} passes; % at the line (≤${TOL}σ): ${JSON.stringify(share)}`);
