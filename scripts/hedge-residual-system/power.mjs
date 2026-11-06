// hedge-residual-system: power, from SYNTHETIC prices only (no real outcome is read).
// Prereg: forge/HEDGE_RESIDUAL_SYSTEM_PREREG.md §5.
//
// The real hour grid and session dates (timestamps only) carry synthetic currency paths: correlated Gaussian random
// walks (a common dollar factor, a European and a commodity bloc), hourly sd 0.6%/sqrt(24). The whole pipeline runs on
// them unchanged (finder selection, beta, the three signals, costs). Under the null the spread signals have no edge,
// so the spread of their Sharpes across paths is the SE the real test faces. A planted positive control adds an
// Ornstein-Uhlenbeck component (half-life 24 h) to every currency, which the MR cell must find.
//
// Usage: node scripts/hedge-residual-system/power.mjs [paths=24]
import fs from 'node:fs';
import * as L from './lib.mjs';
import { mdeFromCI } from '../../js/preregStats.js';

const NP = +(process.argv[2] ?? 24);
const h1 = JSON.parse(fs.readFileSync(new URL('../../data/hedge-residual-system/h1.json', import.meta.url)));
const d1 = JSON.parse(fs.readFileSync(new URL('../../data/hedge-residual-system/d1.json', import.meta.url)));
const tEnd = h1.t, nH = tEnd.length;
const dates = d1.d.filter(d => d <= L.LAST_DATE);
const rates = L.loadRates();
const rf = L.rateFn(rates);

function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const KEYS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'audjpy', 'cadjpy', 'eurjpy', 'gbpjpy', 'nzdjpy'];
const BLOC = { EUR: 'eu', GBP: 'eu', AUD: 'cm', NZD: 'cm', CAD: 'cm', JPY: 'jp' };
const START = { EUR: 1.1, GBP: 1.3, JPY: 1 / 110, AUD: 0.72, NZD: 0.67, CAD: 0.75 };

function synth(seed, { ou = 0 } = {}) {
  const r = L.rng(seed), sdH = 0.006 / Math.sqrt(24);
  const lv = Object.fromEntries(Object.keys(START).map(c => [c, new Float64Array(nH)]));
  const x = Object.fromEntries(Object.keys(START).map(c => [c, Math.log(START[c])]));
  const o = Object.fromEntries(Object.keys(START).map(c => [c, 0]));
  const phi = Math.pow(0.5, 1 / 24), ouSd = ou * 0.006;   // stationary OU sd = ou x daily sd
  for (let h = 0; h < nH; h++) {
    const F = gauss(r), G = { eu: gauss(r), cm: gauss(r), jp: gauss(r) };
    for (const c of Object.keys(START)) {
      x[c] += sdH * (0.6 * F + 0.5 * G[BLOC[c]] + 0.62 * gauss(r));
      if (ou) o[c] = phi * o[c] + ouSd * Math.sqrt(1 - phi * phi) * gauss(r);
      lv[c][h] = x[c] + o[c];
    }
  }
  const u = c => (c === 'USD' ? 1 : null);
  const val = (c, h) => (c === 'USD' ? 1 : Math.exp(lv[c][h]));
  const inst = { eurusd: h => val('EUR', h), gbpusd: h => val('GBP', h), usdjpy: h => 1 / val('JPY', h), audusd: h => val('AUD', h), nzdusd: h => val('NZD', h),
    audjpy: h => val('AUD', h) / val('JPY', h), cadjpy: h => val('CAD', h) / val('JPY', h), eurjpy: h => val('EUR', h) / val('JPY', h), gbpjpy: h => val('GBP', h) / val('JPY', h), nzdjpy: h => val('NZD', h) / val('JPY', h) };
  void u;
  const hourClose = Object.fromEntries(KEYS.map(k => [k, Array.from({ length: nH }, (_, h) => inst[k](h))]));
  // daily close = the last hour ending at or before 17:00 New York
  const close = dates.map(L.nyCloseEpoch);
  const dayClose = Object.fromEntries(KEYS.map(k => [k, []]));
  let h = -1;
  for (const c of close) { while (h + 1 < nH && tEnd[h + 1] <= c) h++; for (const k of KEYS) dayClose[k].push(h >= 0 ? hourClose[k][h] : null); }
  return L.assemble({ tEnd, hourClose, dates, dayClose, rates });
}

function runOne(D) {
  const rebs = L.rebalances(D), blocks = L.planHours(D, rebs);
  const plan = blocks.map(b => ({ ...b, slots: L.finderPicks(D, b.e) }));
  const halfCost = L.makeHalfCost(D);
  const o = L.runEngine(D, plan, { halfCost, rf, accrual: false });
  const res = {};
  for (const s of L.SIGNALS) {
    const g = L.dailySeries(D, plan, o[s], { withAcc: false, withCost: false }), n = L.dailySeries(D, plan, o[s], { withAcc: false });
    const af = L.annFactor(g.dates);
    res[s] = { gross: L.sharpe(g.net, af), net: L.sharpe(n.net, af), trades: o[s].trades, days: g.net.length, series: g.net, af };
  }
  res.slots = L.mean(plan.map(p => p.slots.length));
  res.years = (Date.parse(plan.length ? dates.at(-1) : 0) - Date.parse(D.dates[plan[0].e])) / (365.25 * 86400e3);
  return res;
}

const nulls = [];
for (let p = 0; p < NP; p++) {
  const t0 = Date.now();
  const r = runOne(synth(L.SEED + 1000 + p));
  nulls.push(r);
  console.log(`null path ${p}: slots ${r.slots.toFixed(1)}, ` + L.SIGNALS.map(s => `${s} gross ${r[s].gross.toFixed(2)} net ${r[s].net.toFixed(2)} trades ${r[s].trades}`).join(' | ') + ` (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
const planted = [0.25, 0.5].map(ou => { const r = runOne(synth(L.SEED + 5000, { ou })); console.log(`planted OU ${ou}: ` + L.SIGNALS.map(s => `${s} gross ${r[s].gross.toFixed(2)} net ${r[s].net.toFixed(2)} trades ${r[s].trades}`).join(' | ')); return { ou, ...Object.fromEntries(L.SIGNALS.map(s => [s, { gross: r[s].gross, net: r[s].net, trades: r[s].trades }])) }; });

// block-bootstrap SE on null path 0, to compare with the Monte-Carlo SE (stats-defaults lesson 2026-11-04)
const bootSE = {};
const idx = L.blockIndex(nulls[0].MR.series.length, { B: 500 });
for (const s of L.SIGNALS) { const a = nulls[0][s].series, af = nulls[0][s].af; bootSE[s] = L.sd(idx.map(ix => L.sharpe(L.take(a, ix), af))); }

const z = { holm: 2.394, bar: 0.5 };   // Holm first step alpha 0.05/3 two-sided -> 2.394; 80% power -> +0.842
const out = { seed: L.SEED, paths: NP, years: nulls[0].years, meanSlots: L.mean(nulls.map(r => r.slots)), cells: {} };
for (const s of L.SIGNALS) {
  const mcSE = L.sd(nulls.map(r => r[s].gross)), se = Math.max(mcSE, bootSE[s]);
  const mde = (z.holm + 0.842) * se;
  out.cells[s] = { mcSE, bootSE: bootSE[s], seUsed: se, mdeHolm: mde, mde5: mdeFromCI({ lo: -1.96 * se, hi: 1.96 * se }), meanNullGross: L.mean(nulls.map(r => r[s].gross)), meanNullNet: L.mean(nulls.map(r => r[s].net)),
    trades: L.mean(nulls.map(r => r[s].trades)), ciHalfWidth: 1.96 * se, nullBarForNull: z.bar - 1.96 * se, verdict: mde <= z.bar ? 'POWERED' : 'UNDERPOWERED' };
}
out.planted = planted;
fs.mkdirSync(new URL('../../analysis/output/hedge-residual-system/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../../analysis/output/hedge-residual-system/power.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, planted }, null, 1));
