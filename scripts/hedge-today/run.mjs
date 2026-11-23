#!/usr/bin/env node
// hedge-today: walk-forward session hedges. Prereg: forge/HEDGE_TODAY_PREREG.md (seed 20261123).
//   node scripts/hedge-today/run.mjs            positive control (§3.6), then H1/H3 (12 problems) and H2 (8 targets)
//   node scripts/hedge-today/run.mjs --control  the positive control only
// Needs analysis/output/hedge-today/panel.json from build.mjs. Every weight for session s uses data from sessions < s and daily bars with key < date(s).
import fs from 'node:fs';
import { wls, varOf, es5Of, rng } from '../hedge-method-comparison/lib.mjs';

const OUT = new URL('../../analysis/output/hedge-today/', import.meta.url);
const P = JSON.parse(fs.readFileSync(new URL('panel.json', OUT), 'utf8'));
const SEED = 20261123, B = 1000, BLOCK = 21, PLACEBO_DRAWS = 50, EVAL_START = '2017-01-02';
const NS = P.sessions.length, NH = 9;
const CONTROL_ONLY = process.argv.includes('--control');

// ── returns ──
const hr = {}, R = {};   // hr[k] = Float64Array(NS*9) hourly in-session returns (NaN missing); R[k] = Float64Array(NS) session return
for (const k of P.keys) {
  const g = P.px[k]; hr[k] = new Float64Array(NS * NH).fill(NaN); R[k] = new Float64Array(NS).fill(NaN);
  for (let s = 0; s < NS; s++) { const row = g[s]; for (let j = 0; j < NH; j++) if (row[j] > 0 && row[j + 1] > 0) hr[k][s * NH + j] = Math.log(row[j + 1] / row[j]); if (row[0] > 0 && row[9] > 0) R[k][s] = Math.log(row[9] / row[0]); }
}
const DW = { eurusd: -0.576, gbpusd: -0.119, usdjpy: 0.136, usdcad: 0.091, usdchf: 0.036 }, DWS = 0.958;
const synth = (len, get) => { const o = new Float64Array(len); for (let i = 0; i < len; i++) { let v = 0; for (const [k, w] of Object.entries(DW)) v += w * get(k, i); o[i] = v / DWS; } return o; };
hr.dxy = synth(NS * NH, (k, i) => hr[k][i]); R.dxy = synth(NS, (k, i) => R[k][i]);
const ND = P.daily.dates.length, dr = {};
for (const k of P.keys) { dr[k] = new Float64Array(ND).fill(NaN); for (let i = 1; i < ND; i++) dr[k][i] = Math.log(P.daily.close[k][i] / P.daily.close[k][i - 1]); }
dr.dxy = synth(ND, (k, i) => dr[k][i]);
// last daily index with key < session date
const dEnd = new Int32Array(NS); { let p = -1; for (let s = 0; s < NS; s++) { while (p + 1 < ND && P.daily.dates[p + 1] < P.sessions[s]) p++; dEnd[s] = p; } }
const CCY = k => (k === 'de30' ? ['EUR'] : /^[a-z]{6}$/.test(k) ? [k.slice(0, 3).toUpperCase(), k.slice(3).toUpperCase()] : ['USD']);
const evalStart = P.sessions.findIndex(d => d >= EVAL_START);

// ── weights for one problem: target series a, legs hs (keys or synthetic objects {hr, R, dr}) ──
const ser = x => (typeof x === 'string' ? { hr: hr[x], R: R[x], dr: dr[x], ccy: CCY(x) } : x);
export function weightsFor(aK, hK, methods) {
  const A = ser(aK), H = hK.map(ser), k = H.length;
  const usable = []; for (let s = 0; s < NS; s++) if (Number.isFinite(A.R[s]) && H.every(h => Number.isFinite(h.R[s]))) usable.push(s);
  const ccys = new Set([...(A.ccy ?? []), ...H.flatMap(h => h.ccy ?? [])]);
  const isEvent = s => [...ccys].some(c => P.event[c]?.[s]);
  // hourly obs flattened over usable sessions: oA, oH[j], start[p] (obs start for usable position p)
  const oA = [], oH = H.map(() => []), start = [0];
  for (const s of usable) { for (let j = 0; j < NH; j++) { const i = s * NH + j, a = A.hr[i]; if (!Number.isFinite(a) || !H.every(h => Number.isFinite(h.hr[i]))) continue; oA.push(a); H.forEach((h, q) => oH[q].push(h.hr[i])); } start.push(oA.length); }
  const sA = usable.map(s => A.R[s]), sH = H.map(h => usable.map(s => h.R[s]));
  const range = (a, b) => { const o = []; for (let i = a; i < b; i++) o.push(i); return o; };
  const out = {}; for (const m of methods) out[m] = [];
  const evalPos = []; for (let p = 0; p < usable.length; p++) if (usable[p] >= evalStart) evalPos.push(p);
  const last = {};
  for (const p of evalPos) {
    const s = usable[p], e = dEnd[s];
    for (const m of methods) {
      let w = null;
      if (m === 'B1') w = e >= 60 ? wls(A.dr, H.map(h => h.dr), range(e - 59, e + 1)) : null;
      else if (m === 'B2') { const L = Math.min(250, e); if (L >= 200) { const idx = range(e - L + 1, e + 1); w = wls(A.dr, H.map(h => h.dr), idx, idx.map(i => Math.pow(0.97, e - i))); } }
      else if (m === 'S1') w = p >= 60 ? wls(sA, sH, range(p - 60, p)) : null;
      else if (m === 'S2') w = p >= 20 ? wls(oA, oH, range(start[p - 20], start[p])) : null;
      else if (m === 'S3') { if (p >= 120) { const idx = [], om = []; for (let q = p - 120; q < p; q++) for (let o = start[q]; o < start[q + 1]; o++) { idx.push(o); om.push(Math.pow(0.95, p - 1 - q)); } w = wls(oA, oH, idx, om); } }
      else if (m === 'C1') {
        const ev = isEvent(s), pick = [];
        for (let q = p - 1; q >= Math.max(0, p - 500) && pick.length < 20; q--) if (isEvent(usable[q]) === ev) pick.push(q);
        const qs = pick.length >= 10 ? pick : (p >= 20 ? range(p - 20, p) : []);
        const idx = []; for (const q of qs) for (let o = start[q]; o < start[q + 1]; o++) idx.push(o);
        w = idx.length ? wls(oA, oH, idx) : null;
      }
      if (!(w && w.every(Number.isFinite))) w = last[m] ?? new Array(k).fill(0);
      last[m] = w; out[m].push(w);
    }
  }
  const evalS = evalPos.map(p => usable[p]);
  const hedgedOf = m => evalS.map((s, i) => { let v = A.R[s]; for (let q = 0; q < k; q++) v -= out[m][i][q] * H[q].R[s]; return v; });
  return { evalS, rA: evalS.map(s => A.R[s]), W: out, hedgedOf, event: evalS.map(isEvent) };
}

const vr = (h, a) => 1 - varOf(h) / varOf(a);
const median = x => { const s = [...x].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

// ── positive control (§3.6): synthetic target on the real EURUSD path, session beta 1.0, out-of-session 0.2 ──
function positiveControl() {
  const g = rng(SEED + 1), gauss = () => { let u = 0, v = 0; while (!u) u = g(); v = g(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const eh = hr.eurusd, sdH = Math.sqrt(varOf([...eh].filter(Number.isFinite)));
  const thr = new Float64Array(NS * NH).fill(NaN), tR = new Float64Array(NS).fill(NaN), noiseSum = new Float64Array(NS);
  for (let s = 0; s < NS; s++) for (let j = 0; j < NH; j++) { const e = gauss() * sdH; noiseSum[s] += e; const i = s * NH + j; if (Number.isFinite(eh[i])) thr[i] = eh[i] + e; }
  for (let s = 0; s < NS; s++) if (Number.isFinite(R.eurusd[s])) tR[s] = R.eurusd[s] + noiseSum[s];
  // daily: in-session part (beta 1) + out-of-session part (beta 0.2) + noise
  const sIdxOf = new Map(P.sessions.map((d, i) => [d, i])), outPart = new Float64Array(ND).fill(NaN);
  for (let i = 1; i < ND; i++) { const s = sIdxOf.get(P.daily.dates[i]); if (s != null && Number.isFinite(R.eurusd[s])) outPart[i] = dr.eurusd[i] - R.eurusd[s]; }
  const sdOut = Math.sqrt(varOf([...outPart].filter(Number.isFinite)));
  const tdr = new Float64Array(ND).fill(NaN);
  for (let i = 1; i < ND; i++) { const s = sIdxOf.get(P.daily.dates[i]); const inS = s != null && Number.isFinite(R.eurusd[s]) ? R.eurusd[s] + noiseSum[s] : 0; const o = Number.isFinite(outPart[i]) ? outPart[i] : dr.eurusd[i]; tdr[i] = inS + 0.2 * o + gauss() * sdOut; }
  const T = { hr: thr, R: tR, dr: tdr, ccy: ['EUR', 'USD'] };
  const r = weightsFor(T, ['eurusd'], ['B1', 'S2']);
  const medS2 = median(r.W.S2.map(w => w[0])), medB1 = median(r.W.B1.map(w => w[0]));
  const vrS2 = vr(r.hedgedOf('S2'), r.rA), vrB1 = vr(r.hedgedOf('B1'), r.rA);
  const pass = Math.abs(medS2 - 1) <= 0.05 && vrS2 > vrB1;
  return { known: 1.0, medianWeightS2: medS2, medianWeightB1: medB1, vrS2, vrB1, sessions: r.evalS.length, pass };
}
const PC = positiveControl();
console.log('positive control', JSON.stringify(PC));
if (!PC.pass) { console.error('POSITIVE CONTROL FAILED: fix the pipeline before scoring (prereg §3.6)'); process.exit(2); }
if (CONTROL_ONLY) process.exit(0);

// ── bootstrap machinery: blocks of 21 calendar sessions over the evaluation range; per series, block sums of x and x² ──
const nBlocks = Math.ceil((NS - evalStart) / BLOCK), blockOf = s => Math.floor((s - evalStart) / BLOCK);
const rnd = rng(SEED), draws = Array.from({ length: B }, () => Array.from({ length: nBlocks }, () => Math.floor(rnd() * nBlocks)));
function blockStats(evalS, x) { const n = new Float64Array(nBlocks), s1 = new Float64Array(nBlocks), s2 = new Float64Array(nBlocks); evalS.forEach((s, i) => { const b = blockOf(s); n[b]++; s1[b] += x[i]; s2[b] += x[i] * x[i]; }); return { n, s1, s2 }; }
const varFrom = (st, d) => { let n = 0, a = 0, q = 0; for (const b of d) { n += st.n[b]; a += st.s1[b]; q += st.s2[b]; } const m = a / n; return q / n - m * m; };
const bootVR = (stH, stA) => draws.map(d => 1 - varFrom(stH, d) / varFrom(stA, d));
const ci = x => { const s = [...x].sort((a, b) => a - b); return [s[Math.floor(0.025 * s.length)], s[Math.floor(0.975 * s.length) - 1]]; };
const pBoot = x => { const lo = x.filter(v => v <= 0).length / x.length, hi = x.filter(v => v >= 0).length / x.length; return Math.min(1, 2 * Math.min(lo, hi)); };
const pp = x => +(100 * x).toFixed(2);

// ── H1 / H3: the 12 problems ──
const PROBLEMS = [['gold', ['dxy']], ['gold', ['dxy', 'nq']], ['nq', ['gold', 'usdjpy']], ['nq', ['us2000']], ['us2000', ['gold']], ['us30', ['gold', 'usdjpy']],
  ['eurusd', ['usdchf']], ['gbpusd', ['eurusd', 'usdjpy']], ['audusd', ['nq']], ['audusd', ['nq', 'gold']], ['usdjpy', ['nq']], ['de30', ['nq', 'eurusd']]]
  .map(([a, h], i) => ({ id: i + 1, a, h, name: `${a.toUpperCase()} <- ${h.map(x => x.toUpperCase()).join(', ')}` }));
const METHODS = ['B1', 'B2', 'S1', 'S2', 'S3', 'C1'];
const ALL = [...P.keys, 'dxy'], prand = rng(SEED + 2);
const res = { seed: SEED, B, block: BLOCK, positiveControl: PC, problems: [] };
const boot = {};   // boot[problemId][method] = VR draws ; boot[id].N
let t0 = Date.now();
for (const Pr of PROBLEMS) {
  const r = weightsFor(Pr.a, Pr.h, METHODS), half = Math.floor(r.evalS.length / 2);
  const stA = blockStats(r.evalS, r.rA); boot[Pr.id] = {};
  const row = { id: Pr.id, name: Pr.name, sessions: r.evalS.length, eventSessions: r.event.filter(Boolean).length, methods: {} };
  const es0 = es5Of(r.rA), evI = r.event.map((e, i) => (e ? i : -1)).filter(i => i >= 0), qI = r.event.map((e, i) => (e ? -1 : i)).filter(i => i >= 0), pick = (x, I) => I.map(i => x[i]);
  for (const m of ['N', ...METHODS]) {
    const h = m === 'N' ? r.rA : r.hedgedOf(m);
    row.methods[m] = { vr: vr(h, r.rA), vr1: vr(h.slice(0, half), r.rA.slice(0, half)), vr2: vr(h.slice(half), r.rA.slice(half)), es5Cut: 1 - es5Of(h) / es0,
      vrEvent: evI.length > 30 ? vr(pick(h, evI), pick(r.rA, evI)) : null, vrQuiet: vr(pick(h, qI), pick(r.rA, qI)),
      meanAbsW: m === 'N' ? 0 : r.W[m].reduce((t, w) => t + w.reduce((u, x) => u + Math.abs(x), 0), 0) / r.W[m].length / Pr.h.length };
    if (m !== 'N') boot[Pr.id][m] = bootVR(blockStats(r.evalS, h), stA);
  }
  // placebo: S2 on random partners outside the problem's set
  const pool = ALL.filter(k => k !== Pr.a && !Pr.h.includes(k)), pv = [];
  for (let d = 0; d < PLACEBO_DRAWS; d++) { const bag = [...pool], pk = Pr.h.map(() => bag.splice(Math.floor(prand() * bag.length), 1)[0]); const q = weightsFor(Pr.a, pk, ['S2']); pv.push(vr(q.hedgedOf('S2'), q.rA)); }
  row.placeboVR = median(pv);
  res.problems.push(row);
  console.log(`P${Pr.id} ${Pr.name} n=${row.sessions} ev=${row.eventSessions} ` + METHODS.map(m => `${m} ${pp(row.methods[m].vr)}`).join(' ') + ` placebo ${pp(row.placeboVR)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
function gate(diffPer, diffBoot, nNeed, halves) {
  const mean = diffPer.reduce((a, b) => a + b, 0) / diffPer.length, [lo, hi] = ci(diffBoot), p = pBoot(diffBoot);
  const better = diffPer.filter(x => x > 0).length, worse = diffPer.filter(x => x < 0).length;
  const pass = mean > 0.01 && lo > 0 && halves.every(x => x > 0) && better >= nNeed;
  const mirror = mean < -0.01 && hi < 0 && halves.every(x => x < 0) && worse >= nNeed;
  const verdict = pass ? 'VALIDATED' : lo >= -0.01 && hi <= 0.01 ? 'NULL' : 'UNDERPOWERED';
  return { meanDeltaPP: pp(mean), ciPP: [pp(lo), pp(hi)], halfWidthPP: pp((hi - lo) / 2), p, halvesPP: halves.map(pp), better, worse, n: diffPer.length, pass, mirror, verdict };
}
const pooledBoot = (fn) => draws.map((_, b) => PROBLEMS.reduce((t, Pr) => t + fn(Pr.id, b), 0) / PROBLEMS.length);
res.H1 = {};
for (const m of ['B2', 'S1', 'S2', 'S3', 'C1']) {
  const per = res.problems.map(r => r.methods[m].vr - r.methods.B1.vr);
  const halves = [1, 2].map(k => res.problems.reduce((t, r) => t + r.methods[m]['vr' + k] - r.methods.B1['vr' + k], 0) / PROBLEMS.length);
  const g = gate(per, pooledBoot((id, b) => boot[id][m][b] - boot[id].B1[b]), 8, halves);
  const pooledVR = res.problems.reduce((t, r) => t + r.methods[m].vr, 0) / PROBLEMS.length, placebo = res.problems.reduce((t, r) => t + r.placeboVR, 0) / PROBLEMS.length;
  g.pooledVRpp = pp(pooledVR); g.placeboVRpp = pp(placebo); g.beatsPlacebo = pooledVR > placebo; if (!g.beatsPlacebo) { g.pass = false; if (g.verdict === 'VALIDATED') g.verdict = 'UNDERPOWERED'; }
  res.H1[m] = g;
}
// BH q = 0.10 across the five
{ const ms = Object.keys(res.H1).sort((a, b) => res.H1[a].p - res.H1[b].p); let kmax = -1; ms.forEach((m, i) => { if (res.H1[m].p <= 0.10 * (i + 1) / ms.length) kmax = i; });
  ms.forEach((m, i) => { res.H1[m].bhSurvives = i <= kmax; if (!res.H1[m].bhSurvives && res.H1[m].verdict === 'VALIDATED') { res.H1[m].verdict = 'UNDERPOWERED'; res.H1[m].pass = false; } }); }
res.H3 = gate(res.problems.map(r => r.methods.C1.vr - r.methods.S2.vr), pooledBoot((id, b) => boot[id].C1[b] - boot[id].S2[b]), 8,
  [1, 2].map(k => res.problems.reduce((t, r) => t + r.methods.C1['vr' + k] - r.methods.S2['vr' + k], 0) / PROBLEMS.length));
console.log('H1', JSON.stringify(res.H1)); console.log('H3', JSON.stringify(res.H3));

// ── H2: picking the partner, 8 targets (prefix sums so each window is O(1)) ──
const TARGETS = ['eurusd', 'gbpusd', 'audusd', 'usdjpy', 'gold', 'nq', 'us30', 'de30'];
function pairStats(a, c) {
  // daily prefix sums (pairwise finite)
  const D = { n: new Float64Array(ND + 1), x: new Float64Array(ND + 1), y: new Float64Array(ND + 1), xx: new Float64Array(ND + 1), yy: new Float64Array(ND + 1), xy: new Float64Array(ND + 1) };
  for (let i = 0; i < ND; i++) { const x = dr[a][i], y = dr[c][i], ok = Number.isFinite(x) && Number.isFinite(y); D.n[i + 1] = D.n[i] + (ok ? 1 : 0); D.x[i + 1] = D.x[i] + (ok ? x : 0); D.y[i + 1] = D.y[i] + (ok ? y : 0); D.xx[i + 1] = D.xx[i] + (ok ? x * x : 0); D.yy[i + 1] = D.yy[i] + (ok ? y * y : 0); D.xy[i + 1] = D.xy[i] + (ok ? x * y : 0); }
  // hourly per session sums -> prefix over usable pair sessions
  const us = []; for (let s = 0; s < NS; s++) if (Number.isFinite(R[a][s]) && Number.isFinite(R[c][s])) us.push(s);
  const H = { n: [0], x: [0], y: [0], xx: [0], yy: [0], xy: [0] };
  for (const s of us) { let n = 0, X = 0, Y = 0, XX = 0, YY = 0, XY = 0; for (let j = 0; j < NH; j++) { const x = hr[a][s * NH + j], y = hr[c][s * NH + j]; if (!Number.isFinite(x) || !Number.isFinite(y)) continue; n++; X += x; Y += y; XX += x * x; YY += y * y; XY += x * y; }
    for (const [k, v] of Object.entries({ n, x: X, y: Y, xx: XX, yy: YY, xy: XY })) H[k].push(H[k].at(-1) + v); }
  const posOf = new Int32Array(NS).fill(-1); us.forEach((s, p) => { posOf[s] = p; });
  // number of usable pair sessions before s
  const before = new Int32Array(NS + 1); { let q = 0; for (let s = 0; s < NS; s++) { before[s] = q; if (posOf[s] >= 0) q++; } }
  return { D, H, before };
}
const win = (S, a, b) => { const n = S.n[b] - S.n[a]; if (n < 10) return null; const mx = (S.x[b] - S.x[a]) / n, my = (S.y[b] - S.y[a]) / n; const vx = (S.xx[b] - S.xx[a]) / n - mx * mx, vy = (S.yy[b] - S.yy[a]) / n - my * my, cv = (S.xy[b] - S.xy[a]) / n - mx * my; return vx > 0 && vy > 0 ? { rho: cv / Math.sqrt(vx * vy), beta: cv / vy } : null; };
const scoreOf = (now, vals) => (now && vals.length >= 5 ? Math.abs(now.rho) * vals.filter(v => Math.sign(v) === Math.sign(now.rho)).length / vals.length : null);
res.H2 = { targets: [] };
const h2boot = { PS: [], PD: [] }, h2rows = [];
for (const a of TARGETS) {
  const cands = ALL.filter(c => c !== a), st = Object.fromEntries(cands.map(c => [c, pairStats(a, c)]));
  const evalS = [], rA = [], arms = { PD: [], PS: [], DS: [], SD: [] }, picks = { PD: {}, PS: {} }; let noD = 0, noS = 0;
  for (let s = evalStart; s < NS; s++) {
    if (!Number.isFinite(R[a][s])) continue;
    const e = dEnd[s]; let bestD = null, bestS = null;
    for (const c of cands) {
      const S = st[c];
      // daily: 60d corr ending e (indices e-59..e -> prefix [e-59, e+1)), share over windows ending every 5th day back 250
      const nowD = e >= 60 ? win(S.D, e - 59, e + 1) : null;
      if (nowD && Math.abs(nowD.rho) >= 0.1) { const v = []; for (let q = e; q >= Math.max(59, e - 250); q -= 5) { const w = win(S.D, q - 59, q + 1); if (w) v.push(w.rho); } const sc = scoreOf(nowD, v); if (sc != null && (!bestD || sc > bestD.sc)) bestD = { c, sc, bD: nowD.beta }; }
      // session: hourly corr over the last 20 usable pair sessions; share over windows ending every 5th session back 120
      const p = S.before[s];
      const nowS = p >= 20 ? win(S.H, p - 20, p) : null;
      if (nowS && Math.abs(nowS.rho) >= 0.1) { const v = []; for (let q = p; q >= Math.max(20, p - 120); q -= 5) { const w = win(S.H, q - 20, q); if (w) v.push(w.rho); } const sc = scoreOf(nowS, v); if (sc != null && (!bestS || sc > bestS.sc)) bestS = { c, sc }; }
    }
    const betaS2 = c => { const p = st[c].before[s]; return p >= 20 ? win(st[c].H, p - 20, p)?.beta ?? 0 : 0; };
    const betaB1 = c => { const w = e >= 60 ? win(st[c].D, e - 59, e + 1) : null; return w?.beta ?? 0; };
    const hed = (c, b) => (c && Number.isFinite(R[c][s]) ? R[a][s] - b * R[c][s] : R[a][s]);
    if (!bestD) noD++; if (!bestS) noS++;
    evalS.push(s); rA.push(R[a][s]);
    arms.PD.push(hed(bestD?.c, bestD ? betaB1(bestD.c) : 0)); arms.PS.push(hed(bestS?.c, bestS ? betaS2(bestS.c) : 0));
    arms.DS.push(hed(bestD?.c, bestD ? betaS2(bestD.c) : 0)); arms.SD.push(hed(bestS?.c, bestS ? betaB1(bestS.c) : 0));
    if (bestD) picks.PD[bestD.c] = (picks.PD[bestD.c] ?? 0) + 1; if (bestS) picks.PS[bestS.c] = (picks.PS[bestS.c] ?? 0) + 1;
  }
  const half = Math.floor(evalS.length / 2), stA = blockStats(evalS, rA);
  const row = { target: a, sessions: evalS.length, noPickD: noD, noPickS: noS, picksD: picks.PD, picksS: picks.PS, samePickShare: null };
  for (const k of Object.keys(arms)) row[k] = { vr: vr(arms[k], rA), vr1: vr(arms[k].slice(0, half), rA.slice(0, half)), vr2: vr(arms[k].slice(half), rA.slice(half)), es5Cut: 1 - es5Of(arms[k]) / es5Of(rA) };
  h2boot.PS.push(bootVR(blockStats(evalS, arms.PS), stA)); h2boot.PD.push(bootVR(blockStats(evalS, arms.PD), stA));
  h2rows.push(row); console.log(`H2 ${a} n=${row.sessions} PD ${pp(row.PD.vr)} PS ${pp(row.PS.vr)} DS ${pp(row.DS.vr)} SD ${pp(row.SD.vr)} picksD ${JSON.stringify(picks.PD)} picksS ${JSON.stringify(picks.PS)}`);
}
res.H2.targets = h2rows;
res.H2.gate = gate(h2rows.map(r => r.PS.vr - r.PD.vr), draws.map((_, b) => h2rows.reduce((t, _r, i) => t + h2boot.PS[i][b] - h2boot.PD[i][b], 0) / h2rows.length), 6,
  [1, 2].map(k => h2rows.reduce((t, r) => t + r.PS['vr' + k] - r.PD['vr' + k], 0) / h2rows.length));
console.log('H2', JSON.stringify(res.H2.gate));
res.builtAt = new Date().toISOString(); res.panelBuiltAt = P.builtAt;
fs.writeFileSync(new URL('results.json', OUT), JSON.stringify(res, null, 1));
console.log('wrote results.json');
process.exit(0);
