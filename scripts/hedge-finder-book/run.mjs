#!/usr/bin/env node
// hedge-finder-book: the one scored run. Prereg: forge/HEDGE_FINDER_BOOK_PREREG.md (committed 25f8f1a0 before this
// script existed). node scripts/hedge-finder-book/run.mjs -> analysis/output/hedge-finder-book/{results.json,arms.json}
//
// Arms on the same proxy book: U unhedged, F the finder's top Book-hedge row, C1 the exposure currency's own USD leg
// (DXY for USD), C2 DXY, P 200 random eligible candidates. Every hedge is chosen and sized from data <= t-1 with the live
// tab's own functions (corrMath.bookHedges / rankCandidates, window 60) and held over day t's return, with costs.
import fs from 'node:fs';
import * as M from '../../js/terminal/corrMath.js';
import { holm, benjaminiHochberg, chanceBaseline, pFromCI } from '../../js/preregStats.js';
import * as L from './lib.mjs';

const OUT = new URL('../../analysis/output/hedge-finder-book/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });
const B = 2000, NPLACEBO = 200, BLOCK = 21;
const fin = v => v != null && Number.isFinite(v);
const SYM = { WTI: 'WTICO_USD', BRENT: 'BCO_USD', NQ: 'NAS100_USD' };
const symOf = id => SYM[id] ?? id;
const OWN = { USD: 'DXY', EUR: 'EURUSD', GBP: 'GBPUSD', AUD: 'AUDUSD', NZD: 'NZDUSD', JPY: 'USDJPY', CAD: 'USDCAD', CHF: 'USDCHF' };
const DXY_LEGS = { EUR: 'EURUSD', JPY: 'USDJPY', GBP: 'GBPUSD', CAD: 'USDCAD', CHF: 'USDCHF' };
const t0 = Date.now();

// ── data, book, per-day finder rows ──
const P = L.loadPanel();
const PFX = L.loadPanel({ fxOnly: true });
const costFrac = L.makeCost(P.ff, P.dates);
const DXYW = Object.values(M.DXY_W).reduce((s, v) => s + v, 0);
const cost = (id, i) => (id === 'DXY' ? Object.entries(DXY_LEGS).reduce((s, [c, p]) => s + (M.DXY_W[c] / DXYW) * costFrac(p, i), 0) : costFrac(symOf(id), i));
const ret = id => L.candRet(P, symOf(id));
const book = L.buildBook(P, costFrac).filter(d => d.date >= L.SCORE_FROM);
const n = book.length;
console.log(`book ${n} days ${book[0].date} -> ${book.at(-1).date}`);

const days = book.map(d => {
  const big = M.biggestExposure(d.exposure);
  const fr = big ? L.finderRows(P.S, d.exposure, d.i) : null;
  const fx = big ? L.finderRows(PFX.S, d.exposure, d.i) : null;
  return { ...d, big, rows: fr?.rows ?? [], rowsFx: fx?.rows ?? [],
    c1: big ? L.fixedHedge(P.S, big, OWN[big.ccy], d.i) : null, c2: big ? L.fixedHedge(P.S, big, 'DXY', d.i) : null };
});
console.log(`rows built ${((Date.now() - t0) / 1000).toFixed(1)}s`);

/** Hedge return series from a per-day pick function -> { gross, cost } arrays (units map per day). */
function hedgeSeries(pick) {
  const g = new Float64Array(n), c = new Float64Array(n), picks = [];
  let prev = {};
  for (let t = 0; t < n; t++) {
    const d = days[t], row = pick(d, t), now = {};
    if (row && d.big) { const u = L.hedgeUnits(row) * Math.abs(d.big.net); if (u) now[row.id] = u; }
    for (const id of new Set([...Object.keys(now), ...Object.keys(prev)])) {
      const a = now[id] ?? 0, b = prev[id] ?? 0;
      g[t] += a * ret(id)[d.i];
      if (a !== b) c[t] += Math.abs(a - b) * 0.5 * cost(id, d.i);
    }
    picks.push(row ? row.id : null);
    prev = now;
  }
  return { g, c, picks };
}
const U = { g: Float64Array.from(book, d => d.gross), c: Float64Array.from(book, d => d.cost) };
const H = { F: hedgeSeries(d => d.rows[0] ?? null), C1: hedgeSeries(d => d.c1), C2: hedgeSeries(d => d.c2), Ffx: hedgeSeries(d => d.rowsFx[0] ?? null) };
function placebo(k) {
  const r = L.rng(L.SEED + 1 + k); let cur = null, lastTop = null;
  return hedgeSeries(d => {
    const top = d.rows[0]?.id ?? null;
    if (!d.rows.length) { lastTop = top; return null; }
    if (top !== lastTop || !cur || !d.rows.some(x => x.id === cur)) cur = d.rows[Math.floor(r() * d.rows.length)].id;
    lastTop = top;
    return d.rows.find(x => x.id === cur);
  });
}
const PL = Array.from({ length: NPLACEBO }, (_, k) => placebo(k));
console.log(`arms built ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const net = (h, cm = 1) => Array.from(U.g, (v, t) => v - cm * U.c[t] + (h ? h.g[t] - cm * h.c[t] : 0));
const gross = h => Array.from(U.g, (v, t) => v + (h ? h.g[t] : 0));
const S = {
  U: net(null), F: net(H.F), C1: net(H.C1), C2: net(H.C2), Ffx: net(H.Ffx),
  Ug: gross(null), Fg: gross(H.F), U2: net(null, 2), F2: net(H.F, 2),
};
const PLnet = PL.map(h => net(h));

// ── statistics ──
const STATS = { es: L.es, mdd: L.maxDD, sharpe: L.sharpe, ann: L.annRet, ddy: L.ddYear, es21: L.es21 };
const REL = new Set(['es', 'mdd', 'ddy', 'es21']);
const cmp = (k, a, b) => (REL.has(k) ? STATS[k](a) / STATS[k](b) - 1 : STATS[k](a) - STATS[k](b));
const PAIRS = [['F', 'U'], ['C1', 'U'], ['C2', 'U'], ['F', 'C1'], ['F', 'C2'], ['Ffx', 'U'], ['Fg', 'Ug'], ['F2', 'U2']];
const idx = L.blockIndex(n, { B, L: BLOCK, seed: L.SEED });
const halfAt = book.findIndex(d => d.date >= L.SPLIT);
const CCYS = M.CCY8;
const ccyOf = days.map(d => d.big?.ccy ?? null);
const boot = Object.fromEntries(PAIRS.map(([a, b]) => [`${a}-${b}`, Object.fromEntries(Object.keys(STATS).map(k => [k, []]))]));
const bootLevel = Object.fromEntries(['U', 'F', 'C1', 'C2'].map(a => [a, Object.fromEntries(Object.keys(STATS).map(k => [k, []]))]));
const bootCcy = Object.fromEntries(CCYS.map(c => [c, []]));
for (const ix of idx) {
  const tk = Object.fromEntries(Object.entries(S).map(([k, a]) => [k, L.take(a, ix)]));
  for (const [a, b] of PAIRS) for (const k of Object.keys(STATS)) boot[`${a}-${b}`][k].push(cmp(k, tk[a], tk[b]));
  for (const a of Object.keys(bootLevel)) for (const k of Object.keys(STATS)) bootLevel[a][k].push(STATS[k](tk[a]));
  for (const c of CCYS) { const sel = Array.from(ix).filter(j => ccyOf[j] === c); if (sel.length >= 100) bootCcy[c].push(L.es(sel.map(j => S.F[j])) / L.es(sel.map(j => S.U[j])) - 1); }
}
console.log(`bootstrap done ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const ci = a => [L.quantile(a, 0.025), L.quantile(a, 0.975)];
const cell = (a, b, k, sub = null) => {
  const xa = sub ? S[a].slice(...sub) : S[a], xb = sub ? S[b].slice(...sub) : S[b];
  const est = cmp(k, xa, xb);
  if (sub) return { est };
  const [lo, hi] = ci(boot[`${a}-${b}`][k]);
  return { est, lo, hi, se: L.sd(boot[`${a}-${b}`][k]) };
};
const level = Object.fromEntries(Object.keys(bootLevel).map(a => [a, Object.fromEntries(Object.keys(STATS).map(k => { const [lo, hi] = ci(bootLevel[a][k]); return [k, { est: STATS[k](S[a]), lo, hi }]; }))]));

// ── scored cells ──
const P1 = cell('F', 'U', 'es'), P2 = cell('F', 'U', 'mdd'), P3 = cell('F', 'U', 'sharpe');
const plEs = PLnet.map(a => L.es(a) / L.es(S.U) - 1), plMdd = PLnet.map(a => L.maxDD(a) / L.maxDD(S.U) - 1), plSh = PLnet.map(a => L.sharpe(a) - L.sharpe(S.U));
const pct = (arr, v) => (100 * arr.filter(x => x <= v).length) / arr.length;
const P4 = { est: P1.est, placeboPct: pct(plEs, P1.est), placeboMedian: L.quantile(plEs, 0.5), placeboP05: L.quantile(plEs, 0.05) };
const half1 = cell('F', 'U', 'es', [0, halfAt]), half2 = cell('F', 'U', 'es', [halfAt, n]);
const pass = {
  P1: P1.est <= -0.05 && P1.hi < 0,
  P2: P2.est <= -0.05 && P2.hi < 0,
  P3: P3.lo > -0.10,
  P4: P4.placeboPct <= 5,
  halves: half1.est < 0 && half2.est < 0,
};
let verdict, reason;
if (P1.lo > -0.05) { verdict = 'null'; reason = 'rule 1: P1 CI lower bound > -5% (a 5% ES cut ruled out)'; }
else if (P2.lo > -0.05) { verdict = 'null'; reason = 'rule 2: P2 CI lower bound > -5% (a 5% drawdown cut ruled out)'; }
else if (P3.hi < -0.10) { verdict = 'null'; reason = 'rule 3: P3 CI upper < -0.10 (Sharpe given up)'; }
else if (pass.P1 && !pass.P4) { verdict = 'context'; reason = 'rule 4: P1 passes, placebo fails'; }
else if (pass.P1 && pass.P2 && pass.P3 && pass.P4 && pass.halves) { verdict = 'validated'; reason = 'rule 5: gate holds'; }
else { verdict = 'underpowered'; reason = 'rule 6: neither ruled out nor passed'; }
// P1's own word (banked separately as hedge-finder-book-es if it differs)
const p1Word = P1.lo > -0.05 ? 'null' : pass.P1 ? (pass.P4 ? 'validated' : 'context') : 'underpowered';
const pP = [P1, P2].map(c => pFromCI({ est: c.est, lo: c.lo, hi: c.hi }));
const holmP = holm(pP, 0.05);

// ── descriptive ──
const ccyCells = CCYS.map(c => { const sel = days.map((d, t) => (d.big?.ccy === c ? t : -1)).filter(t => t >= 0); const a = bootCcy[c]; if (sel.length < 100 || a.length < 100) return { ccy: c, n: sel.length, est: null };
  const est = L.es(sel.map(t => S.F[t])) / L.es(sel.map(t => S.U[t])) - 1, [lo, hi] = ci(a); return { ccy: c, n: sel.length, est, lo, hi, p: pFromCI({ est, lo, hi }) }; });
const okCcy = ccyCells.filter(c => fin(c.est));
const bh = benjaminiHochberg(okCcy.map(c => c.p), 0.10);
okCcy.forEach((c, j) => { c.bh = bh.rejected[j]; c.bhAdj = bh.adjusted[j]; });
const count = a => a.reduce((m, x) => (m[x ?? 'none'] = (m[x ?? 'none'] ?? 0) + 1, m), {});
const top = (m, k = 8) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, k);
const meanOf = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const rowStats = days.filter(d => d.rows[0]);
const desc = {
  daysNoHedge: { F: days.filter(d => !d.rows.length).length, Ffx: days.filter(d => !d.rowsFx.length).length },
  picksF: top(count(H.F.picks)), picksFx: top(count(H.Ffx.picks)), exposureCcy: count(ccyOf),
  pickMeanAbsRho: meanOf(rowStats.map(d => Math.abs(d.rows[0].rho))), pickMeanShare: meanOf(rowStats.map(d => d.rows[0].share)), pickMeanRatio: meanOf(rowStats.map(d => d.rows[0].ratio)),
  switchesF: H.F.picks.filter((p, t) => t > 0 && p !== H.F.picks[t - 1]).length,
  costDragAnn: Object.fromEntries(Object.entries({ book: U, F: H.F, C1: H.C1, C2: H.C2 }).map(([k, h]) => [k, meanOf(Array.from(h.c)) * 252])),
  hedgeGrossAnn: Object.fromEntries(Object.entries({ F: H.F, C1: H.C1, C2: H.C2, Ffx: H.Ffx }).map(([k, h]) => [k, meanOf(Array.from(h.g)) * 252])),
  hedgeBookCorr: Object.fromEntries(Object.entries({ F: H.F, C1: H.C1, C2: H.C2 }).map(([k, h]) => { const a = Array.from(h.g), b = S.Ug, ma = meanOf(a), mb = meanOf(b); let sab = 0, saa = 0, sbb = 0; for (let t = 0; t < n; t++) { sab += (a[t] - ma) * (b[t] - mb); saa += (a[t] - ma) ** 2; sbb += (b[t] - mb) ** 2; } return [k, sab / Math.sqrt(saa * sbb)]; })),
  placebo: { esMedian: L.quantile(plEs, 0.5), esP05: L.quantile(plEs, 0.05), esP95: L.quantile(plEs, 0.95), mddMedian: L.quantile(plMdd, 0.5), mddPctOfF: pct(plMdd, P2.est), sharpeMedian: L.quantile(plSh, 0.5), sharpePctOfF: pct(plSh, P3.est) },
  halves: { split: L.SPLIT, es: [half1.est, half2.est], mdd: [cell('F', 'U', 'mdd', [0, halfAt]).est, cell('F', 'U', 'mdd', [halfAt, n]).est], sharpe: [cell('F', 'U', 'sharpe', [0, halfAt]).est, cell('F', 'U', 'sharpe', [halfAt, n]).est] },
};
const comparisons = Object.fromEntries(PAIRS.map(([a, b]) => [`${a}-${b}`, Object.fromEntries(Object.keys(STATS).map(k => [k, cell(a, b, k)]))]));

const results = {
  id: 'hedge-finder-book', verdict, reason, p1Word, ranAt: new Date().toISOString(), seed: L.SEED, B, block: BLOCK, nPlacebo: NPLACEBO,
  prereg: 'forge/HEDGE_FINDER_BOOK_PREREG.md', preregCommit: '25f8f1a0', branch: 'worktree-agent-a91c6673ee0e34bfa',
  sample: { from: book[0].date, to: book.at(-1).date, n, lockboxLast: L.LOCKBOX_LAST },
  cells: [
    { name: 'P1 ES5 F vs U (relative)', n, ...P1, mde: 0.031, bar: -0.05, p: pP[0], holmAdj: holmP.adjusted[0], holmReject: holmP.rejected[0], pass: pass.P1 },
    { name: 'P2 max drawdown F vs U (relative)', n, ...P2, mde: 'UNDERPOWERED by design (8-38pp)', bar: -0.05, p: pP[1], holmAdj: holmP.adjusted[1], holmReject: holmP.rejected[1], pass: pass.P2 },
    { name: 'P3 Sharpe F - U', n, ...P3, bar: -0.10, pass: pass.P3 },
    { name: 'P4 placebo percentile of F ES change', n: NPLACEBO, ...P4, bar: 5, pass: pass.P4 },
  ],
  pass, level, comparisons, perCurrencyEs: ccyCells, chance: chanceBaseline({ tests: okCcy.length, passes: okCcy.filter(c => c.bh).length, alpha: 0.10 }), desc,
};
fs.writeFileSync(new URL('results.json', OUT), JSON.stringify(results, null, 2));
// the daily arms, for the descriptive concentration read (concentration.mjs) and any audit
const r7 = v => +v.toPrecision(7);
fs.writeFileSync(new URL('arms.json', OUT), JSON.stringify({ dates: book.map(d => d.date), ccy: ccyOf, pickF: H.F.picks,
  U: S.U.map(r7), F: S.F.map(r7), C1: S.C1.map(r7), C2: S.C2.map(r7) }));
const pc = v => (fin(v) ? `${(v * 100).toFixed(1)}%` : '–');
console.log(`VERDICT ${verdict} (${reason}); P1 word ${p1Word}`);
console.log(`P1 ES ${pc(P1.est)} [${pc(P1.lo)}, ${pc(P1.hi)}]  P2 MDD ${pc(P2.est)} [${pc(P2.lo)}, ${pc(P2.hi)}]  P3 dSharpe ${P3.est.toFixed(3)} [${P3.lo.toFixed(3)}, ${P3.hi.toFixed(3)}]  P4 pct ${P4.placeboPct.toFixed(1)}`);
console.log(JSON.stringify({ halves: desc.halves, daysNoHedge: desc.daysNoHedge, picks: desc.picksF, corr: desc.hedgeBookCorr }, null, 0));
console.log(`done ${((Date.now() - t0) / 1000).toFixed(1)}s`);
