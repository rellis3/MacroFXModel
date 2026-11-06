// hedge-residual-system: the scored run. Prereg: forge/HEDGE_RESIDUAL_SYSTEM_PREREG.md (run once, after it was committed).
//
// Usage: node scripts/hedge-residual-system/run.mjs [placeboDraws=200] [B=2000]
// Writes analysis/output/hedge-residual-system/results.json (+ daily.json, the daily net series of every arm).
import fs from 'node:fs';
import * as L from './lib.mjs';
import { pFromCI, holm, benjaminiHochberg, chanceBaseline } from '../../js/preregStats.js';

const NPL = +(process.argv[2] ?? 200), B = +(process.argv[3] ?? 2000);
const OUT = new URL('../../analysis/output/hedge-residual-system/', import.meta.url);
const power = JSON.parse(fs.readFileSync(new URL('power.json', OUT)));
const CELLS = ['MR', 'MOM', 'CARRY'];
const BAR = 0.5;

const D = L.loadReal();
const rf = L.rateFn(D.rates);
const halfCost = L.makeHalfCost(D), halfCost2 = L.makeHalfCost(D, 2);
const rebs = L.rebalances(D), blocks = L.planHours(D, rebs);
const t0 = Date.now();
const plan = blocks.map(b => ({ ...b, slots: L.finderPicks(D, b.e) }));
console.log(`selection: ${plan.length} months, mean slots ${L.mean(plan.map(p => p.slots.length)).toFixed(1)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

const real = L.runEngine(D, plan, { halfCost, rf });
const real2 = L.runEngine(D, plan, { halfCost: halfCost2, rf });
const ser = (o, opt) => L.dailySeries(D, plan, o, opt);
const base = ser(real.HOLD, {});
const dates = base.dates, n = dates.length, af = L.annFactor(dates);
const half = dates.map(d => (d < L.SPLIT ? 0 : 1));
const sub = (a, k) => a.filter((_, i) => half[i] === k);
const idx = L.blockIndex(n, { B, L: 21, seed: L.SEED });

function summary(a) {
  const est = L.sharpe(a, af), bs = idx.map(ix => L.sharpe(L.take(a, ix), af));
  const lo = L.quantile(bs, 0.025), hi = L.quantile(bs, 0.975);
  return { est, lo, hi, p: pFromCI({ est, lo, hi }), h1: L.sharpe(sub(a, 0), af), h2: L.sharpe(sub(a, 1), af), annRet: L.mean(a) * af, annVol: L.sd(a) * Math.sqrt(af) };
}

const arms = {};
const daily = { dates };
for (const s of L.SIGNALS) {
  const net = ser(real[s], {}).net, gross = ser(real[s], { withCost: false }).net, spot = ser(real[s], { withAcc: false, withCost: false }).net;
  const accOnly = gross.map((g, i) => g - spot[i]);
  const net2 = ser(real2[s], {}).net;
  daily[s] = net;
  const costDrag = L.mean(gross) * af - L.mean(net) * af;
  arms[s] = { net: summary(net), gross: summary(gross), spotGross: summary(spot), accrualOnly: { est: L.sharpe(accOnly, af), ann: L.mean(accOnly) * af }, costs2x: summary(net2), trades: real[s].trades, costDragAnn: costDrag };
  console.log(s, 'net', arms[s].net.est.toFixed(3), `[${arms[s].net.lo.toFixed(3)}, ${arms[s].net.hi.toFixed(3)}]`, 'gross', arms[s].gross.est.toFixed(3), 'trades', real[s].trades);
}

// ── placebo: same X slots, a uniformly drawn partner, same beta method and signals ──
const plac = Object.fromEntries(L.SIGNALS.map(s => [s, { net: [], gross: [] }]));
for (let k = 1; k <= NPL; k++) {
  const r = L.rng(L.SEED + k);
  const pp = plan.map(b => ({ ...b, slots: b.slots.map(sl => { const c = L.PAIRS.filter(p => p !== sl.x); return { x: sl.x, y: c[Math.floor(r() * c.length)] }; }) }));
  const o = L.runEngine(D, pp, { halfCost, rf });
  for (const s of L.SIGNALS) { plac[s].net.push(L.sharpe(ser(o[s], {}).net, af)); plac[s].gross.push(L.sharpe(ser(o[s], { withCost: false }).net, af)); }
  if (k % 20 === 0) console.log(`placebo ${k}/${NPL} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
const pct = (a, v) => 100 * a.filter(x => x < v).length / a.length;

// ── MR per-trade component: gross residual P&L of each MR trade vs its cost (bp of X notional) ──
// rebuilt from the hourly engine: each entry's P&L until the next exit, per unit of w
function mrTrades() {
  const out = [];
  for (const blk of plan) for (const { x, y } of blk.slots) {
    const one = L.runEngine(D, [{ ...blk, slots: [{ x, y }] }], { halfCost, rf, accrual: false }).MR;
    // trade boundaries: entries in `one.entries`; attribute each hour's gross to the latest entry before it
    const ent = one.entries.map(e => e.h);
    for (let j = 0; j < ent.length; j++) {
      const a = ent[j] + 1, b = j + 1 < ent.length ? ent[j + 1] : blk.to + 1;
      let g = 0, c = 0; for (let h = a; h <= b && h < D.nH; h++) { g += one.gross[h]; c += one.cost[h]; }
      const P = L.slotParams(D, x, y, D.kOf[ent[j]]);
      out.push({ month: D.dates[D.kOf[ent[j]]].slice(0, 7), gbp: 1e4 * g / P.w, cbp: 1e4 * c / P.w });
    }
  }
  return out;
}
const tr = mrTrades();
function clusterBoot(rows, f) {
  const months = [...new Set(rows.map(r => r.month))], by = new Map(months.map(m => [m, rows.filter(r => r.month === m)]));
  const r = L.rng(L.SEED + 777), bs = [];
  for (let b = 0; b < 1000; b++) { const pick = []; for (let i = 0; i < months.length; i++) pick.push(...by.get(months[Math.floor(r() * months.length)])); bs.push(f(pick)); }
  return { est: f(rows), lo: L.quantile(bs, 0.025), hi: L.quantile(bs, 0.975) };
}
const mrGrossPerTrade = clusterBoot(tr, a => L.mean(a.map(t => t.gbp)));
const mrCostPerTrade = L.mean(tr.map(t => t.cbp));

// ── scored cells, verdicts ──
const pv = CELLS.map(s => arms[s].net.p);
const H = holm(pv, 0.05);
const cells = CELLS.map((s, i) => {
  const a = arms[s], seMC = power.cells[s].seUsed;
  const placeboPct = pct(plac[s].net, a.net.est);
  const g = { sharpe: a.net.est >= BAR, holm: H.rejected[i] && a.net.est > 0, halves: a.net.h1 > 0 && a.net.h2 > 0, placebo: placeboPct >= 95 };
  let verdict;
  if (a.net.hi < BAR && a.net.est + 1.96 * seMC < BAR) verdict = 'null';
  else if (g.sharpe && g.holm && g.halves && g.placebo) verdict = 'validated';
  else if (g.sharpe && g.holm && g.halves && !g.placebo) verdict = 'context';
  else verdict = 'underpowered';
  return { name: s, n: n, trades: a.trades, est: a.net.est, lo: a.net.lo, hi: a.net.hi, h1: a.net.h1, h2: a.net.h2, p: a.net.p, holmAdj: H.adjusted[i], mde: power.cells[s].mdeHolm, seMC,
    placeboPct, placeboMedian: L.quantile(plac[s].net, 0.5), placeboP95: L.quantile(plac[s].net, 0.95), gates: g, verdict };
});

// ── decomposition (prereg §4 D-cells), BH q = 0.10 ──
const comps = [];
for (const s of CELLS) {
  const a = arms[s].gross, pp = pct(plac[s].gross, a.est);
  comps.push({ name: `${s} gross Sharpe`, est: a.est, lo: a.lo, hi: a.hi, p: a.p, h1: a.h1, h2: a.h2, placeboPct: pp });
}
comps.push({ name: 'MR gross bp per trade', est: mrGrossPerTrade.est, lo: mrGrossPerTrade.lo, hi: mrGrossPerTrade.hi, p: pFromCI(mrGrossPerTrade), costBp: mrCostPerTrade, trades: tr.length });
comps.push({ name: 'CARRY spot-only gross Sharpe', est: arms.CARRY.spotGross.est, lo: arms.CARRY.spotGross.lo, hi: arms.CARRY.spotGross.hi, p: arms.CARRY.spotGross.p, h1: arms.CARRY.spotGross.h1, h2: arms.CARRY.spotGross.h2 });
const bh = benjaminiHochberg(comps.map(c => c.p), 0.10);
comps.forEach((c, i) => { c.bh = bh.rejected[i]; c.candidate = bh.rejected[i] && c.est > 0 && (c.h1 == null || (c.h1 > 0 && c.h2 > 0)) && (c.placeboPct == null || c.placeboPct >= 95); });

// ── disaggregation: net Sharpe by target X (21 x 3), BH q = 0.10 ──
const byX = [];
for (const s of CELLS) for (const x of L.PAIRS) {
  const arr = real[s].byX[x]; if (!arr) continue;
  const dm = L.toDaily(D, arr, plan[0].from, plan.at(-1).to);
  const a = base.sess.map(ss => dm.get(ss) ?? 0);
  if (a.every(v => v === 0)) continue;
  const est = L.sharpe(a, af), bs = idx.slice(0, 500).map(ix => L.sharpe(L.take(a, ix), af));
  const lo = L.quantile(bs, 0.025), hi = L.quantile(bs, 0.975);
  byX.push({ cell: s, x, est, lo, hi, p: pFromCI({ est, lo, hi }), months: plan.filter(b => b.slots.some(sl => sl.x === x)).length });
}
const bhX = benjaminiHochberg(byX.map(r => r.p), 0.10);
byX.forEach((r, i) => { r.bh = bhX.rejected[i]; });
const passX = byX.filter(r => r.bh).length;

// ── concentration: net Sharpe by calendar year ──
const years = [...new Set(dates.map(d => d.slice(0, 4)))];
const byYear = Object.fromEntries(L.SIGNALS.map(s => [s, Object.fromEntries(years.map(y => { const a = daily[s].filter((_, i) => dates[i].startsWith(y)); return [y, { sharpe: L.sharpe(a, af), ann: L.mean(a) * af }]; }))]));

// picks
const pickCount = {};
for (const b of plan) for (const sl of b.slots) { const k = `${sl.x}/${sl.y}`; pickCount[k] = (pickCount[k] ?? 0) + 1; }
const topPicks = Object.entries(pickCount).sort((a, b) => b[1] - a[1]).slice(0, 15);

const res = {
  id: 'hedge-residual-system', ranAt: new Date().toISOString(), seed: L.SEED, B, placeboDraws: NPL,
  prereg: 'forge/HEDGE_RESIDUAL_SYSTEM_PREREG.md', branch: 'worktree-agent-a4107183ccffa1412',
  sample: { first: dates[0], last: dates.at(-1), days: n, years: (Date.parse(dates.at(-1)) - Date.parse(dates[0])) / (365.25 * 86400e3), annFactor: af, months: plan.length, meanSlots: L.mean(plan.map(p => p.slots.length)) },
  cells, arms, placebo: Object.fromEntries(L.SIGNALS.map(s => [s, { netMedian: L.quantile(plac[s].net, 0.5), netP05: L.quantile(plac[s].net, 0.05), netP95: L.quantile(plac[s].net, 0.95), grossMedian: L.quantile(plac[s].gross, 0.5), grossP95: L.quantile(plac[s].gross, 0.95), realNetPct: pct(plac[s].net, arms[s].net.est), realGrossPct: pct(plac[s].gross, arms[s].gross.est) }])),
  components: comps, byX: { rows: byX, bhPasses: passX, tests: byX.length, chance: chanceBaseline({ tests: byX.length, passes: passX }) },
  byYear, topPicks,
};
fs.writeFileSync(new URL('results.json', OUT), JSON.stringify(res, null, 1));
fs.writeFileSync(new URL('daily.json', OUT), JSON.stringify(daily));
console.log(JSON.stringify({ cells, placebo: res.placebo, components: comps, byX: { passes: passX, tests: byX.length } }, null, 1));
