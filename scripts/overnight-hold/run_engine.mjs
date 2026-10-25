// overnight-hold: run js/overnightHoldEngine.js AS-IS (placeholder costs) and export the gross trades
// for the honest-cost scoring in honest.py. Prereg: forge/OVERNIGHT_HOLD_PREREG.md.
//
// R2 is switched off on purpose (loadM1ForPair would otherwise read R2 and write a decoded-snapshot
// cache back to production R2 - data-rules "never write to production R2"). It then reads the local
// VolRangeForecaster/data/m1 cache, which ends 2026-08-20 23:59 UTC; bars are also cut at the
// 2026-08-21 lockbox explicitly.
//
// Usage: node scripts/overnight-hold/run_engine.mjs [startISO]   (default: full overlap)
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

for (const k of Object.keys(process.env)) if (k.startsWith('R2_')) delete process.env[k];

const { loadM1ForPair } = await import('../../js/volBacktestM1Engine.js');
const eng = await import('../../js/overnightHoldEngine.js');

const OUT = path.join('analysis', 'output', 'overnight-hold');
mkdirSync(OUT, { recursive: true });
const LOCKBOX_END = Date.parse('2026-08-21T21:00:00Z') / 1000;   // 22:00 London on 2026-08-21
const START = process.argv[2] ? Date.parse(process.argv[2] + 'T00:00:00Z') / 1000 : 0;
const tag = process.argv[2] ? `from_${process.argv[2]}` : 'full';

function cut(p) {
  let lo = 0; while (lo < p.n && p.times[lo] < START) lo++;
  let hi = p.n; while (hi > lo && p.times[hi - 1] > LOCKBOX_END) hi--;
  const s = a => a.subarray(lo, hi);
  return { n: hi - lo, times: s(p.times), opens: s(p.opens), highs: s(p.highs), lows: s(p.lows), closes: s(p.closes), volumes: p.volumes ? s(p.volumes) : undefined };
}

const m1 = {};
for (const k of ['nq', 'gold']) {
  const p = await loadM1ForPair(k);
  if (!p?.n) throw new Error(`no M1 for ${k}`);
  m1[k] = cut(p);
  console.log(`${k}: ${m1[k].n.toLocaleString()} bars ${new Date(m1[k].times[0] * 1000).toISOString()} .. ${new Date(m1[k].times[m1[k].n - 1] * 1000).toISOString()}`);
}

const res = eng.runOvernightHoldBacktest(m1, { exitTimes: eng.DEFAULT_EXIT_TIMES, includeDailyBars: false });

const summary = { tag, generated: new Date().toISOString(), instruments: {} };
for (const [k, r] of Object.entries(res.instruments)) {
  const m = r.metrics;
  summary.instruments[k] = {
    window: r.overlapWindow, expectedTradingDays: r.expectedTradingDays, actualTrades: r.actualTrades,
    exceptionsByReason: r.exceptions.reduce((a, e) => (a[e.reason] = (a[e.reason] || 0) + 1, a), {}),
    timezoneGate: { peakUtcHour: r.timezoneGate.peakVolatilityUtcHour, within: r.timezoneGate.withinExpectedWindow, fridays: r.timezoneGate.fridaysChecked },
    mirrorTest: r.mirrorTest,
    gross_totalPct: m.grossTotalReturnPct, net_totalPct: m.totalReturnPct, net_cagrPct: m.cagrPct,
    net_sharpe: m.sharpe, net_maxDD: m.maxDrawdown.maxDDPct, winRatePct: m.winRatePct, profitFactor: m.profitFactor,
    exposure: m.exposure, correlationToBuyHold: m.correlationToBuyHold,
    buyHold_gross: m.benchmark,
    breakevenCostScale: r.costSweep?.breakevenScale, costSweepNote: r.costSweep?.note,
    propCheck_closedTrade: r.ruleCheck?.verdict, propCheck_detail: {
      dailyLossBreach: r.ruleCheck?.dailyLossBreach, trailingDD: r.ruleCheck?.trailingDrawdown,
      profitTargetHitDate: r.ruleCheck?.profitTargetHitDate, profitTargetTradingDays: r.ruleCheck?.profitTargetTradingDays,
      consistency: r.ruleCheck?.consistency },
    exitSweep_EXTRA_SEARCH: r.exitSweep?.points,
    weekday: r.weekday.map(w => ({ weekday: w.weekday, trades: w.trades, avgGrossPct: w.avgGrossPct, avgNetPct: w.avgNetPct })),
  };
  const lines = ['date,exitDate,entryEpoch,exitEpoch,entryPrice,exitPrice,grossPct,maePct,engineNetPct'];
  for (const t of r.trades) lines.push([t.date, t.exitDate, t.entryEpoch, t.exitEpoch, t.entryPrice, t.exitPrice, t.grossPct, t.maePct, t.netPct].join(','));
  writeFileSync(path.join(OUT, `trades_${k}_${tag}.csv`), lines.join('\n'));
}
if (res.combined) summary.combined = { ...res.combined.summary, equityCurve: undefined, propCheck_closedTrade: res.combined.ruleCheck?.verdict };
writeFileSync(path.join(OUT, `engine_asis_${tag}.json`), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, (k, v) => (k === 'exitSweep_EXTRA_SEARCH' || k === 'weekday' ? undefined : v), 2));
