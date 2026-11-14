// relationship-map (forge/RELATIONSHIP_MAP_PREREG.md): for 20 believed cross-market pairs, M1 together (same-day, by year),
// M2 lead (linear, forward windows), M3 after a big move (|z| >= 2, de-clustered) vs ordinary days, graded on the
// Evidence Book scale. Positive controls run first; if they fail, nothing real is scored.
//   node scripts/relationship-map/run.mjs            -> analysis/output/relationship-map/{results.json,RESULTS.md}
//   node scripts/relationship-map/run.mjs --control  -> the positive controls only
import fs from 'node:fs';

const SEED = 20261113, B = 2000, PLACEBO = 200, END = '2026-08-21', START = '2006-01-01';
const SESOI = 0.10, ZBIG = 2, DECLUSTER = 5, SIGMA_N = 250, HS = [1, 5, 20], H_PRIMARY = 5, MIN_EVENTS = 30, BHQ = 0.10;
const OUT = 'analysis/output/relationship-map';
const CACHE = 'analysis/output/yield_coupling', NEW = `${OUT}/data`;

// ── seeded RNG (mulberry32) ──
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ── loaders: { date: value }, weekdays only, START..END ──
const keep = d => d >= START && d <= END && ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay());
function csvCloses(path) {
  const m = new Map();
  for (const line of fs.readFileSync(path, 'utf8').trim().split(/\r?\n/).slice(1)) { const [d, v] = line.split(','); const x = Number(v); if (d && v !== '' && Number.isFinite(x) && x > 0 && keep(d.slice(0, 10))) m.set(d.slice(0, 10), x); }
  return m;
}
function yieldCol(col) {
  const lines = fs.readFileSync(`${CACHE}/yields.csv`, 'utf8').trim().split(/\r?\n/); const idx = lines[0].split(',').indexOf(col); const m = new Map();
  for (const l of lines.slice(1)) { const p = l.split(','); const x = p[idx] === '' ? NaN : Number(p[idx]); if (Number.isFinite(x) && keep(p[0])) m.set(p[0], x); }
  return m;
}
function vix() {
  const m = new Map();
  for (const l of fs.readFileSync('analysis/surfaces/cboe/VIX.csv', 'utf8').trim().split(/\r?\n/).slice(1)) { const p = l.split(','); const [mm, dd, yy] = p[0].split('/'); const d = `${yy}-${mm}-${dd}`; const x = Number(p[4]); if (Number.isFinite(x) && x > 0 && keep(d)) m.set(d, x); }
  return m;
}
const SERIES = {
  DXY: { load: () => csvCloses(`${NEW}/px_DXY.csv`), kind: 'price', label: 'DXY' },
  BRENT: { load: () => csvCloses(`${NEW}/px_BRENT.csv`), kind: 'price', label: 'Brent' },
  COPPER: { load: () => csvCloses(`${NEW}/px_COPPER.csv`), kind: 'price', label: 'Copper' },
  GOLD: { load: () => csvCloses(`${CACHE}/px_GOLD.csv`), kind: 'price', label: 'Gold' },
  SPX: { load: () => csvCloses(`${CACHE}/px_SPX.csv`), kind: 'price', label: 'S&P 500' },
  NDX: { load: () => csvCloses(`${CACHE}/px_NDX.csv`), kind: 'price', label: 'Nasdaq 100' },
  EURUSD: { load: () => csvCloses(`${CACHE}/px_EURUSD.csv`), kind: 'price', label: 'EURUSD' },
  USDJPY: { load: () => csvCloses(`${CACHE}/px_USDJPY.csv`), kind: 'price', label: 'USDJPY' },
  AUDUSD: { load: () => csvCloses(`${CACHE}/px_AUDUSD.csv`), kind: 'price', label: 'AUDUSD' },
  USDCAD: { load: () => csvCloses(`${CACHE}/px_USDCAD.csv`), kind: 'price', label: 'USDCAD' },
  US2Y: { load: () => yieldCol('y2'), kind: 'yield', label: 'US 2y yield' },
  US10Y: { load: () => yieldCol('y10'), kind: 'yield', label: 'US 10y yield' },
  REAL10: { load: () => yieldCol('real10'), kind: 'yield', label: 'US real 10y' },
  BE10: { load: () => yieldCol('be10'), kind: 'yield', label: '10y breakeven' },
  SLOPE: { load: () => yieldCol('slope'), kind: 'yield', label: '10y-2y slope' },
  VIX: { load: vix, kind: 'price', label: 'VIX' },
};
export const PAIRS = [
  ['P1', 'DXY', 'GOLD', -1, 'dollar sells, gold buys'], ['P2', 'DXY', 'SPX', -1, 'strong dollar hurts equities'], ['P3', 'DXY', 'COPPER', -1, 'dollar up, commodities down'],
  ['P4', 'US10Y', 'GOLD', -1, 'yields up, gold down'], ['P5', 'REAL10', 'GOLD', -1, 'real yields drive gold'], ['P6', 'US10Y', 'NDX', -1, 'rates up, tech down'],
  ['P7', 'US2Y', 'USDJPY', 1, 'front-end differential drives yen'], ['P8', 'US10Y', 'USDJPY', 1, 'long-end differential drives yen'], ['P9', 'US2Y', 'EURUSD', -1, 'US front end up, euro down'],
  ['P10', 'SLOPE', 'EURUSD', 0, 'steepening (10y up / 2y down) moves EURUSD'], ['P11', 'VIX', 'SPX', -1, 'fear up, stocks down'], ['P12', 'VIX', 'USDJPY', -1, 'risk-off, yen bid'],
  ['P13', 'VIX', 'AUDUSD', -1, 'risk-off, Aussie sold'], ['P14', 'VIX', 'GOLD', 1, 'fear, gold bid'], ['P15', 'SPX', 'AUDUSD', 1, 'risk-on Aussie'],
  ['P16', 'BRENT', 'USDCAD', -1, 'oil up, CAD up'], ['P17', 'BRENT', 'BE10', 1, 'oil drives inflation pricing'], ['P18', 'COPPER', 'AUDUSD', 1, 'Dr Copper, Aussie'],
  ['P19', 'COPPER', 'US10Y', 1, 'growth, yields'], ['P20', 'GOLD', 'AUDUSD', 1, 'gold, Aussie'],
].map(([id, a, b, sign, folk]) => ({ id, a, b, sign, folk }));

// ── stats helpers ──
const mean = x => x.reduce((s, v) => s + v, 0) / x.length;
const sd = x => { const m = mean(x); return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1)); };
const q = (x, p) => { const s = [...x].sort((a, b) => a - b); const i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); };
const rank = x => { const idx = x.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = new Array(x.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2; i = j + 1; } return r; };
const pearson = (a, b) => { const ma = mean(a), mb = mean(b); let sab = 0, saa = 0, sbb = 0, qq = 0; for (let i = 0; i < a.length; i++) { const u = a[i] - ma, v = b[i] - mb; sab += u * v; saa += u * u; sbb += v * v; qq += u * u * v * v; } const den = Math.sqrt(saa * sbb); return { r: sab / den, se: Math.sqrt(qq) / den, n: a.length }; };
const spearman = (a, b) => pearson(rank(a), rank(b)).r;
function bh(ps, qv) { const o = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]); const m = ps.length; let k = -1; o.forEach(([p], i) => { if (p <= ((i + 1) / m) * qv) k = i; }); const out = new Array(m).fill(false); for (let i = 0; i <= k; i++) out[o[i][1]] = true; return out; }
const r3 = x => (Number.isFinite(x) ? +x.toFixed(3) : null);

// ── one pair on its joint calendar ──
// levels: { dates[], A[], B[] } (log for prices, raw for yields). Returns everything M1-M3 need.
function joint(sa, sb) {
  const dates = [...sa.m.keys()].filter(d => sb.m.has(d)).sort();
  const f = (s, v) => (s.kind === 'price' ? Math.log(v) : v);
  return { dates, A: dates.map(d => f(sa, sa.m.get(d))), B: dates.map(d => f(sb, sb.m.get(d))) };
}
function prep(J) {
  const n = J.dates.length, dA = new Array(n).fill(NaN), dB = new Array(n).fill(NaN);
  for (let t = 1; t < n; t++) { dA[t] = J.A[t] - J.A[t - 1]; dB[t] = J.B[t] - J.B[t - 1]; }
  // causal sigma over the PRIOR SIGMA_N changes (rolling sums)
  const sig = d => { const s = new Array(n).fill(NaN); let s1 = 0, s2 = 0; for (let t = 1; t < n; t++) { if (t - 1 >= 1) { s1 += d[t - 1]; s2 += d[t - 1] ** 2; } if (t - 1 - SIGMA_N >= 1) { s1 -= d[t - 1 - SIGMA_N]; s2 -= d[t - 1 - SIGMA_N] ** 2; } if (t - 1 >= SIGMA_N) { const m = s1 / SIGMA_N; s[t] = Math.sqrt(Math.max(0, (s2 - SIGMA_N * m * m) / (SIGMA_N - 1))); } } return s; };
  const sA = sig(dA), sB = sig(dB), zA = dA.map((v, t) => (sA[t] > 0 ? v / sA[t] : NaN));
  return { ...J, n, dA, dB, sA, sB, zA };
}
// Y_h(t) = sign * sign(dA_t) * (B[t+1+h] - B[t+1]) / (sB_t * sqrt(h))
const Y = (P, t, h, sign) => (t + 1 + h < P.n && P.sB[t] > 0 && Number.isFinite(P.zA[t]) && P.dA[t] !== 0 ? sign * Math.sign(P.dA[t]) * (P.B[t + 1 + h] - P.B[t + 1]) / (P.sB[t] * Math.sqrt(h)) : NaN);
function eventsOf(P, h) { const ev = []; let last = -1e9; for (let t = 1; t < P.n; t++) { if (Math.abs(P.zA[t]) >= ZBIG && t - last >= DECLUSTER) { last = t; if (t + 1 + h < P.n) ev.push(t); } } return ev; }

function m3(P, h, sign, rand, { placebo = true } = {}) {
  const s = sign || 1;
  const all = []; for (let t = 1; t < P.n; t++) { const y = Y(P, t, h, s); if (Number.isFinite(y)) all.push(t); }
  const yAll = all.map(t => Y(P, t, h, s)), base = mean(yAll);
  const ev = eventsOf(P, h).filter(t => Number.isFinite(Y(P, t, h, s)));
  if (ev.length < 5) return { n: ev.length };
  const yEv = ev.map(t => Y(P, t, h, s)), effect = mean(yEv) - base;
  // block bootstrap over calendar months
  const byMonth = new Map(); ev.forEach((t, i) => { const k = P.dates[t].slice(0, 7); (byMonth.get(k) ?? byMonth.set(k, []).get(k)).push(yEv[i]); });
  const months = [...byMonth.values()], boot = [];
  for (let b = 0; b < B; b++) { let sum = 0, cnt = 0; for (let i = 0; i < months.length; i++) { const g = months[Math.floor(rand() * months.length)]; for (const v of g) { sum += v; cnt++; } } boot.push(sum / cnt - base); }
  const lo = q(boot, 0.025), hi = q(boot, 0.975);
  const pOne = boot.filter(v => v <= 0).length / B, pTwo = Math.min(1, 2 * Math.min(pOne, 1 - pOne));
  const halfEff = (from, to) => { const e = ev.filter(t => P.dates[t] >= from && P.dates[t] <= to), a = all.filter(t => P.dates[t] >= from && P.dates[t] <= to); return e.length >= 5 ? { n: e.length, effect: r3(mean(e.map(t => Y(P, t, h, s))) - mean(a.map(t => Y(P, t, h, s)))) } : { n: e.length, effect: null }; };
  let plPct = null;
  if (placebo) { const pl = []; for (let k = 0; k < PLACEBO; k++) { let sum = 0; for (let i = 0; i < ev.length; i++) sum += yAll[Math.floor(rand() * yAll.length)]; pl.push(sum / ev.length - base); } plPct = r3(pl.filter(v => v < effect).length / PLACEBO * 100); }
  return { n: ev.length, effect: r3(effect), lo: r3(lo), hi: r3(hi), pOne: r3(pOne), pTwo: r3(pTwo), mde: r3(2.8 * sd(yEv) / Math.sqrt(ev.length)), base: r3(base),
    halves: [halfEff(START, '2015-12-31'), halfEff('2016-01-01', END)], placeboPct: plPct };
}
function m1(P) {
  const ok = []; for (let t = 1; t < P.n; t++) if (Number.isFinite(P.dA[t]) && Number.isFinite(P.dB[t])) ok.push(t);
  const r = spearman(ok.map(t => P.dA[t]), ok.map(t => P.dB[t]));
  const years = {}; for (const t of ok) (years[P.dates[t].slice(0, 4)] ??= []).push(t);
  const byYear = Object.fromEntries(Object.entries(years).filter(([, ts]) => ts.length >= 100).map(([y, ts]) => [y, r3(spearman(ts.map(t => P.dA[t]), ts.map(t => P.dB[t])))]));
  return { r: r3(r), n: ok.length, byYear };
}
function m2(P, h) {
  const a = [], b = []; for (let t = 1; t + 1 + h < P.n; t++) if (Number.isFinite(P.dA[t])) { a.push(P.dA[t]); b.push(h === 0 ? P.B[t + 1] - P.B[t] : P.B[t + 1 + h] - P.B[t + 1]); }
  const c = pearson(a, b); return { r: r3(c.r), z: r3(c.r / c.se), n: c.n };
}
function togetherLabel(sign, M1) {
  const ys = Object.values(M1.byYear), s = sign || Math.sign(M1.r) || 1, share = ys.filter(v => Math.sign(v) === s).length / ys.length;
  if (sign && Math.sign(M1.r) === -sign && Math.abs(M1.r) >= 0.10) return { label: 'opposite', share: r3(share) };
  if (Math.abs(M1.r) < 0.10) return { label: 'weak/none', share: r3(share) };
  if (Math.abs(M1.r) >= 0.20 && share >= 0.80) return { label: 'reliable', share: r3(share) };
  return { label: 'variable', share: r3(share) };
}
function grade(sign, c, passBH) {
  if (!c || c.n < MIN_EVENTS) return { grade: 'untested', why: `only ${c?.n ?? 0} events (< ${MIN_EVENTS})` };
  const two = sign === 0, eff = two ? Math.abs(c.effect) : c.effect, clear = two ? (c.lo > 0 || c.hi < 0) : c.lo > 0;
  const halvesOk = c.halves.every(hf => hf.effect != null && (two ? Math.sign(hf.effect) === Math.sign(c.effect) : hf.effect > 0));
  const shareBelieved = two ? null : (c.hi <= 0 ? 0 : c.lo >= 0 ? 1 : c.hi / (c.hi - c.lo));
  if (clear && passBH && halvesOk && (c.placeboPct ?? 0) >= 95) return { grade: 'leaning', why: 'CI clear of zero the believed way, survives BH, both halves agree, above the placebo 95th percentile' };
  if (!two && c.hi < 0) return { grade: 'against', why: 'CI clear of zero the WRONG way' };
  if (c.lo > -SESOI && c.hi < SESOI) return { grade: 'against', why: `CI inside +/-${SESOI} sigma: a small effect is ruled out` };
  if ((clear && eff > 0) || (!two && c.effect > 0 && shareBelieved >= 0.6)) return { grade: 'faint', why: clear ? 'CI clear of zero but fails BH, a half or the placebo' : 'estimate the believed way, CI includes zero' };
  return { grade: 'untested', why: `CI too wide to tell (MDE ${c.mde} sigma vs the ${SESOI} that matters)` };
}

// ── positive controls (prereg section 4) ──
function controls(loaded) {
  const rand = rng(SEED);
  const P0 = prep(joint(loaded.DXY, loaded.GOLD));
  const planted = drift => { const n = P0.n, B = new Array(n).fill(0), noise = new Array(n).fill(0).map(() => { let u = 0; for (let k = 0; k < 12; k++) u += rand(); return u - 6; });
    const extra = new Array(n).fill(0); let last = -1e9;
    for (let t = 1; t < n; t++) if (Math.abs(P0.zA[t]) >= ZBIG && t - last >= DECLUSTER) { last = t; for (let k = 2; k <= 6 && t + k < n; k++) extra[t + k] += drift * -1 * Math.sign(P0.dA[t]); }
    for (let t = 1; t < n; t++) B[t] = B[t - 1] + noise[t] + extra[t];
    return prep({ dates: P0.dates, A: P0.A, B }); };
  const want = 0.15 * 5 / Math.sqrt(5), REPS = 50;
  // amendment A1: one run's sampling error (~0.08 sigma at ~150 events) is wider than a 0.05 tolerance, so the bias check
  // is on the mean of 50 replications, and the power check is the share of replications whose CI clears zero (>= 80%)
  const reps = Array.from({ length: REPS }, () => m3(planted(0.15), 5, -1, rand, { placebo: false }));
  const withDrift = { effect: r3(mean(reps.map(r => r.effect))), lo: r3(mean(reps.map(r => r.lo))), hi: r3(mean(reps.map(r => r.hi))), clearShare: r3(reps.filter(r => r.lo > 0).length / REPS), n: reps[0].n };
  const nulls = Array.from({ length: REPS }, () => m3(planted(0), 5, -1, rand, { placebo: false }));
  const noDrift = { effect: r3(mean(nulls.map(r => r.effect))), lo: r3(mean(nulls.map(r => r.lo))), hi: r3(mean(nulls.map(r => r.hi))), falseClear: r3(nulls.filter(r => r.lo > 0 || r.hi < 0).length / REPS) };
  const P11 = prep(joint(loaded.VIX, loaded.SPX)), vixSpx = m1(P11).r;
  const pass1 = Math.abs(withDrift.effect - want) <= 0.05 && withDrift.clearShare >= 0.8, pass2 = Math.abs(noDrift.effect) <= 0.05 && noDrift.falseClear <= 0.15, pass3 = vixSpx <= -0.5;
  return { planted: { want: r3(want), got: withDrift, pass: pass1 }, null: { got: noDrift, pass: pass2 }, vixSpxSameDay: { r: vixSpx, pass: pass3 }, pass: pass1 && pass2 && pass3 };
}

// ── main ──
const loaded = Object.fromEntries(Object.entries(SERIES).map(([k, s]) => [k, { ...s, m: s.load() }]));
for (const [k, s] of Object.entries(loaded)) if (s.m.size < 2000) { console.error(`series ${k}: only ${s.m.size} rows`); process.exit(1); }
const ctl = controls(loaded);
console.log('POSITIVE CONTROLS', JSON.stringify({ planted: { want: ctl.planted.want, ...ctl.planted.got, pass: ctl.planted.pass }, null: { ...ctl.null.got, pass: ctl.null.pass }, vixSpx: ctl.vixSpxSameDay }));
if (!ctl.pass) { console.error('Positive controls FAILED: no real pair is scored. Fix the code first.'); process.exit(2); }
if (process.argv.includes('--control')) process.exit(0);

// power first (A only, no outcome)
const preps = Object.fromEntries(PAIRS.map(p => [p.id, prep(joint(loaded[p.a], loaded[p.b]))]));
console.log('\nEVENTS PER PAIR (from A only):', PAIRS.map(p => `${p.id} ${eventsOf(preps[p.id], H_PRIMARY).length}`).join(' · '));

const rand = rng(SEED + 1);
const rows = PAIRS.map(p => {
  const P = preps[p.id], M1 = m1(P);
  const M3 = Object.fromEntries(HS.map(h => [h, m3(P, h, p.sign, rand)]));
  return { ...p, la: loaded[p.a].label, lb: loaded[p.b].label, from: P.dates[0], to: P.dates.at(-1), days: P.n,
    together: { ...M1, ...togetherLabel(p.sign, M1) }, lead: { next: m2(P, 0), h5: m2(P, 5), h20: m2(P, 20) }, after: M3 };
});
// BH over the 20 primary cells (one-sided believed way; two-sided for P10), and within each secondary family
const pv = h => rows.map(r => (r.sign === 0 ? r.after[h].pTwo : r.after[h].pOne) ?? 1);
const bhP = bh(pv(H_PRIMARY), BHQ), bh1 = bh(pv(1), BHQ), bh20 = bh(pv(20), BHQ);
rows.forEach((r, i) => {
  r.after[H_PRIMARY].bh = bhP[i]; r.after[1].bh = bh1[i]; r.after[20].bh = bh20[i];
  r.grade = grade(r.sign, r.after[H_PRIMARY], bhP[i]);
  const sec = [1, 20].map(h => grade(r.sign, r.after[h], h === 1 ? bh1[i] : bh20[i]));
  r.secondary = { h1: sec[0].grade === 'leaning' ? 'faint' : sec[0].grade, h20: sec[1].grade === 'leaning' ? 'faint' : sec[1].grade };   // secondaries never above Faint
});

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ slug: 'relationship-map', seed: SEED, window: [START, END], params: { SESOI, ZBIG, DECLUSTER, SIGMA_N, HS, H_PRIMARY, B, PLACEBO, BHQ }, controls: ctl, rows }, null, 1));
console.log('\nPAIR  together(r, label, yrs)   after big move h5: effect [CI] n  BH  halves  placebo  -> GRADE');
for (const r of rows) { const c = r.after[H_PRIMARY]; console.log(`${r.id.padEnd(4)} ${r.la} -> ${r.lb}: ${r.together.r} ${r.together.label} ${r.together.share} | ${c.effect} [${c.lo}, ${c.hi}] n${c.n} mde${c.mde} ${c.bh ? 'BH' : '--'} ${c.halves.map(h => h.effect).join('/')} pl${c.placeboPct} -> ${r.grade.grade.toUpperCase()} (h1 ${r.secondary.h1}, h20 ${r.secondary.h20}) | lead5 r${r.lead.h5.r} z${r.lead.h5.z}`); }
