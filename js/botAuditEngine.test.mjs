// Synthetic, no-network tests for the bot-audit engine.
//   node js/botAuditEngine.test.mjs
import {
  netOf, costOf, botsMissingCommission, normalizeTrades, equityByTrade,
  dailySeries, dailyEquity, monthlyReturns, rollingReturn, groupBy,
  excursions, exitMix, summarize, MIN_N_RATIOS,
} from './botAuditEngine.js';

let fail = 0;
const ok = (n, c, x = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${x ? '  ' + x : ''}`); if (!c) fail++; };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// A trade closing at a given UK-noon instant (noon avoids every DST edge).
let _pid = 1;
const tr = (dateIso, profit, extra = {}) => ({
  position_id: _pid++, bot_key: extra.bot || 'bot_status', symbol: extra.sym || 'EURUSD',
  direction: 'BUY', lots: 0.1, profit,
  swap: extra.swap ?? 0, commission: extra.commission,
  time_open:  Math.floor(new Date(dateIso + 'T09:00:00Z').getTime() / 1000),
  time_close: Math.floor(new Date(dateIso + 'T12:00:00Z').getTime() / 1000),
  tz_offset_sec: 0,
  ...extra,
});

console.log('\ncosts');
ok('net = profit+swap+commission', near(netOf({ profit: 20, swap: -0.4, commission: -3.5 }), 16.1));
ok('gross drops both costs',       near(netOf({ profit: 20, swap: -0.4, commission: -3.5 }, { gross: true }), 20));
ok('missing commission → 0, not NaN', near(netOf({ profit: 12, swap: 0 }), 12));
ok('null commission → 0, not NaN',    near(netOf({ profit: 5, swap: 0, commission: null }), 5));
ok('costOf sums swap+comm',        near(costOf({ profit: 9, swap: -1, commission: -2 }), -3));
// The case the dashboard used to score as a win.
ok('small win flips to net loss',  netOf({ profit: 2, swap: -0.1, commission: -3.5 }) < 0);

console.log('\nbotsMissingCommission');
ok('flags only the bot that never reports it', JSON.stringify(botsMissingCommission([
  tr('2026-09-01', 10, { bot: 'a', commission: -1 }),
  tr('2026-09-01', 10, { bot: 'b' }),
  tr('2026-09-02', 10, { bot: 'b' }),
])) === '["b"]');
ok('a bot with SOME commission rows is not flagged', JSON.stringify(botsMissingCommission([
  tr('2026-09-01', 10, { bot: 'c' }),
  tr('2026-09-02', 10, { bot: 'c', commission: -1 }),
])) === '[]');

console.log('\nnormalizeTrades');
{
  const dup = tr('2026-09-01', 5); const same = { ...dup };
  const r = normalizeTrades([dup, same, tr('2026-09-02', 3)]);
  ok('dedupes on bot+position_id', r.kept === 2, `kept ${r.kept}`);
  ok('reports the dupe count',     r.dupes === 1);
  ok('sorted by close time',       r.trades[0].day === '2026-09-01' && r.trades[1].day === '2026-09-02');
  ok('derives UK day',             r.trades[0].day === '2026-09-01');
  ok('derives hold seconds',       r.trades[0].holdSec === 3 * 3600);
}
{
  // Same ticket number, two different bots — must NOT collapse.
  const a = tr('2026-09-01', 5, { bot: 'x' }); const b = tr('2026-09-01', 7, { bot: 'y' });
  a.position_id = b.position_id = 999;
  ok('same ticket on two bots kept apart', normalizeTrades([a, b]).kept === 2);
}
{
  const noClose = tr('2026-09-01', 5); noClose.time_close = null;
  const r = normalizeTrades([noClose, tr('2026-09-02', 1)]);
  ok('drops rows with no close stamp', r.kept === 1);
  ok('REPORTS the drop (no silent filter)', r.droppedNoClose === 1);
}
{
  // Broker clock: +3h means a 01:00 broker stamp is 22:00 UTC the day BEFORE.
  const t = tr('2026-09-02', 5);
  t.time_close = Math.floor(new Date('2026-09-02T01:00:00Z').getTime() / 1000);
  t.tz_offset_sec = 3 * 3600;
  ok('broker offset shifts the day back', normalizeTrades([t]).trades[0].day === '2026-09-01');
}

console.log('\nequity + drawdown');
{
  const { trades } = normalizeTrades([tr('2026-09-01', 100), tr('2026-09-02', -40), tr('2026-09-03', 60)]);
  const eq = equityByTrade(trades, 1000);
  ok('equity compounds additively', near(eq[2].equity, 1120));
  ok('peak tracks the high-water mark', near(eq[1].peak, 1100));
  ok('drawdown in dollars', near(eq[1].ddAbs, -40));
  ok('drawdown in percent',  near(eq[1].ddPct, -40 / 1100 * 100));
  ok('recovery clears the drawdown', near(eq[2].ddAbs, 0));
  // With no capital the % is suppressed rather than dividing by a zero peak.
  const eq0 = equityByTrade(trades, 0);
  ok('no capital → cumulative P&L curve', near(eq0[2].equity, 120));
  ok('no capital → dd% not Infinity', isFinite(eq0[1].ddPct));
}

console.log('\ndaily + calendar gaps');
{
  const { trades } = normalizeTrades([tr('2026-09-01', 10), tr('2026-09-01', 5), tr('2026-09-04', -20)]);
  const d = dailySeries(trades);
  ok('same-day trades aggregate', d.length === 2 && near(d[0].pnl, 15) && d[0].n === 2);
  const de = dailyEquity(d, 1000);
  ok('fills the calendar gap', de.length === 4, `got ${de.length} days`);
  ok('flat days carry no pnl', near(de[1].pnl, 0) && de[1].n === 0);
  // The point of filling: a drawdown spanning quiet days is still counted.
  ok('equity flat across the gap', near(de[1].equity, de[2].equity));
  ok('final equity correct', near(de[3].equity, 995));
}

console.log('\nmonthly grid');
{
  const d = dailySeries(normalizeTrades([
    tr('2026-08-10', 100), tr('2026-09-11', -50), tr('2026-09-20', 25),
  ]).trades);
  const m = monthlyReturns(d, 0);
  const row = m.years.find(y => y.year === 2026);
  ok('months aggregate', near(row.months[7], 100) && near(row.months[8], -25));
  ok('untraded month is null, not zero', row.months[0] === null);
  ok('year total ignores nulls', near(row.total, 75));
  const mp = monthlyReturns(d, 1000);
  ok('capital switches cells to %', near(mp.years[0].months[7], 10) && mp.pct === true);
}

console.log('\nrolling return');
{
  const d  = dailySeries(normalizeTrades([tr('2026-09-01', 10), tr('2026-09-02', 10), tr('2026-09-03', 10), tr('2026-09-04', 10)]).trades);
  const de = dailyEquity(d, 100);
  const r  = rollingReturn(de, 2, 0);
  ok('warm-up window is null', r[0].value === null && r[1].value === null);
  ok('rolling delta correct', near(r[2].value, 20));
  ok('as % of capital', near(rollingReturn(de, 2, 100)[2].value, 20));
}

console.log('\nbreakdowns');
{
  const { trades } = normalizeTrades([
    tr('2026-09-01', 10, { sym: 'EURUSD', reason: 'tp' }),
    tr('2026-09-02', -5, { sym: 'EURUSD', reason: 'sl' }),
    tr('2026-09-03', 20, { sym: 'XAUUSD', reason: 'tp' }),
  ]);
  const byPair = groupBy(trades, t => t.symbol);
  ok('groups and sorts by net', byPair[0].key === 'XAUUSD' && near(byPair[0].net, 20));
  ok('win rate per group', near(byPair.find(r => r.key === 'EURUSD').winRate, 0.5));
  const mix = exitMix(trades);
  ok('exit mix counts barriers', mix.find(r => r.key === 'tp').n === 2 && mix.find(r => r.key === 'sl').n === 1);
}

console.log('\nexcursions');
{
  const { trades } = normalizeTrades([
    tr('2026-09-01', 10, { mfe_pips: 25, mae_pips: 4 }),
    tr('2026-09-02', -8, { mfe_pips: 3,  mae_pips: 20 }),
    tr('2026-09-03', 12, { mfe_pips: 35, mae_pips: 6 }),
    tr('2026-09-04', 5),                                    // no excursion data
  ]);
  const x = excursions(trades);
  ok('rows exclude the dataless trade', x.n === 3);
  ok('missing counted, not zeroed',     x.missing === 1);
  ok('median MFE on winners',           near(x.medMfeWin, 30));
  ok('median MAE on losers',            near(x.medMaeLoss, 20));
}

console.log('\nsummarize');
{
  const { trades } = normalizeTrades([
    tr('2026-09-01', 100, { swap: -1, commission: -3 }),
    tr('2026-09-02', -40, { swap: -1, commission: -3 }),
    tr('2026-09-03',  60, { swap: -1, commission: -3 }),
  ]);
  const s = summarize(trades, { capital: 0, bootRuns: 50, mcRuns: 50 });
  ok('n counted', s.n === 3);
  ok('net total after costs', near(s.scaleFree.totalPnl, 120 - 12));
  ok('gross total separate',  near(s.scaleFree.grossPnl, 120));
  ok('cost total',            near(s.scaleFree.totalCost, -12));
  ok('scale-free Sharpe present', typeof s.scaleFree.sharpe === 'number' && isFinite(s.scaleFree.sharpe));
  ok('max DD in dollars', s.scaleFree.maxDDAbs < 0);
  ok('NO scale-bound block without capital', s.scaleBound === null);
  ok('flags no capital', s.flags.noCapital === true);
  ok('flags thin sample', s.flags.thinSample === true && MIN_N_RATIOS === 30);

  const sc = summarize(trades, { capital: 1000, bootRuns: 50, mcRuns: 50 });
  ok('capital unlocks scale-bound', sc.scaleBound !== null);
  ok('total return %', near(sc.scaleBound.totalReturnPct, 108 / 1000 * 100));
  ok('time in drawdown is a percentage', sc.scaleBound.timeInDDPct >= 0 && sc.scaleBound.timeInDDPct <= 100);
  ok('Sharpe identical with/without capital (scale-free)', near(sc.scaleFree.sharpe, s.scaleFree.sharpe, 1e-9));

  // Gross vs net must actually differ — the whole point of the toggle.
  const sg = summarize(trades, { capital: 0, gross: true, bootRuns: 50, mcRuns: 50 });
  ok('gross view drops the costs', near(sg.scaleFree.totalPnl, 120));
}
{
  ok('empty book returns n=0 without throwing', summarize([], {}).n === 0);
}

console.log(fail ? `\n${fail} FAILED\n` : '\nAll passed\n');
process.exit(fail ? 1 : 0);
