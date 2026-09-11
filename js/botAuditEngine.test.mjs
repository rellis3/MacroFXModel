// Synthetic, no-network tests for the bot-audit engine.
//   node js/botAuditEngine.test.mjs
import {
  netOf, costOf, botsMissingCommission, normalizeTrades, equityByTrade,
  dailySeries, dailyEquity, monthlyReturns, rollingReturn, groupBy,
  excursions, exitMix, summarize, MIN_N_RATIOS,
  cumFromDaily, liveGrowthPct, growthCone, conePercentile, clipDaily,
  distributions, DIST_METRICS, METRIC_READING,
  rollingEdge, breakdowns, hourWeekdayGrid, ukClock,
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


console.log('\nbacktest overlay');
{
  ok('cumFromDaily compounds', near(cumFromDaily([10, 10])[1], 21, 1e-9));
  ok('cumFromDaily first point', near(cumFromDaily([5, -5])[0], 5, 1e-9));
  ok('a gain then an equal loss is NOT flat (compounding)', near(cumFromDaily([10, -10])[1], -1, 1e-9));
}
{
  const d  = dailySeries(normalizeTrades([tr('2026-09-01', 100), tr('2026-09-02', -50)]).trades);
  const de = dailyEquity(d, 10000);
  const g  = liveGrowthPct(de, 10000);
  ok('live growth is % of capital from 0', near(g[0].cum, 1) && near(g[1].cum, 0.5));
  ok('no capital -> no overlay series (never a fake denominator)', liveGrowthPct(de, 0).length === 0);
}
{
  // Deterministic ladder: every day +1%. Every window of a given length gives
  // the same compounded return, so the cone must collapse to a line.
  const flat = new Array(50).fill(1);
  const cone = growthCone(flat, 5);
  ok('one cone row per horizon', cone.length === 5);
  ok('constant series -> zero-width cone', near(cone[4].p5, cone[4].p95, 1e-9));
  ok('cone value = compounded horizon return', near(cone[4].p50, (Math.pow(1.01, 5) - 1) * 100, 1e-9));
  ok('window count shrinks as horizon grows', cone[0].n > cone[4].n);
  ok('horizon clamps to series length', growthCone(flat, 500).length === 50);
  ok('empty series -> empty cone', growthCone([], 10).length === 0);
}
{
  let s2 = 7; const rnd = () => ((s2 = (s2 * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 4;
  const rets = Array.from({ length: 400 }, rnd);
  const cone = growthCone(rets, 60);
  ok('percentiles ordered at every horizon', cone.every(r => r.p5 <= r.p50 && r.p50 <= r.p95));
  ok('cone widens with horizon', (cone[59].p95 - cone[59].p5) > (cone[4].p95 - cone[4].p5));
}
{
  const flat = new Array(40).fill(1);
  const exact = (Math.pow(1.01, 10) - 1) * 100;
  ok('beating every window ranks 100', conePercentile(flat, 10, exact + 5).pct === 100);
  ok('lagging every window ranks 0',   conePercentile(flat, 10, exact - 5).pct === 0);
  ok('reports how many windows backed it', conePercentile(flat, 10, 0).windows === 31);
  ok('unknown ranks null, NOT 50', conePercentile([], 10, 5) === null && conePercentile(flat, 10, null) === null);
}
{
  const daily = [{ date: '2026-08-30', ret: 1 }, { date: '2026-09-01', ret: 2 }, { date: '2026-09-05', ret: 3 }];
  ok('clipDaily keeps the window', clipDaily(daily, '2026-09-01', '2026-09-04').length === 1);
  ok('clipDaily is inclusive at both ends', clipDaily(daily, '2026-08-30', '2026-09-05').length === 3);
}


console.log('\ndistribution battery');
{
  const rows = [];
  let sd = 5; const rr = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 160; i++) {
    const d = new Date(Date.UTC(2026, 2, 2) + i * 86400000);
    if (d.getUTCDay() % 6 === 0) continue;
    rows.push(tr(d.toISOString().slice(0, 10), rr() > .44 ? 10 + rr() * 50 : -(8 + rr() * 40), { commission: -1, swap: -0.2 }));
  }
  const { trades } = normalizeTrades(rows);
  const D = distributions(trades, { capital: 100000, runs: 300 });

  ok('one entry per declared metric', Object.keys(D.metrics).length === DIST_METRICS.length);
  ok('reports the run count', D.runs === 300);
  ok('percentiles ordered', DIST_METRICS.every(m => {
    const x = D.metrics[m.key];
    return !x.available || (x.p[1] <= x.p[50] && x.p[50] <= x.p[99]);
  }));
  ok('rank is 0-100', DIST_METRICS.every(m => !D.metrics[m.key].available || (D.metrics[m.key].rank >= 0 && D.metrics[m.key].rank <= 100)));
  // A realised figure resampled from its own book should land near the middle.
  // Far from P50 would mean the resampling is not centred on the sample.
  ok('realised win rate sits mid-distribution', Math.abs(D.metrics.winRate.rank - 50) < 25, `P${D.metrics.winRate.rank}`);
  ok('realised sharpe sits mid-distribution',   Math.abs(D.metrics.sharpe.rank - 50) < 30, `P${D.metrics.sharpe.rank}`);
  ok('every metric carries a plain-English reading', DIST_METRICS.every(m => typeof METRIC_READING[m.key] === 'string' && METRIC_READING[m.key].length > 20));

  // Seeded: the same book must reproduce the same bands, or a "rank" that
  // changes on refresh is not something anyone can act on.
  const again = distributions(trades, { capital: 100000, runs: 300 });
  ok('deterministic across runs', again.metrics.sharpe.rank === D.metrics.sharpe.rank
    && near(again.metrics.maxDD.mean, D.metrics.maxDD.mean, 1e-9));

  // The capital gate reaches here too — no denominator, no scale-bound metric.
  const noCap = distributions(trades, { capital: 0, runs: 100 });
  ok('capital-bound metrics withheld without capital',
     !noCap.metrics.cagr.available && !noCap.metrics.volAnn.available && !noCap.metrics.returnPct.available);
  ok('scale-free metrics survive without capital',
     noCap.metrics.sharpe.available && noCap.metrics.winRate.available && noCap.metrics.maxDD.available);

  // Basis matters: win rate is a property of TRADES, Sharpe of DAYS. If both
  // were resampled the same way the day-based spread would be wrong.
  ok('trade-basis and day-basis metrics both populated',
     D.metrics.profitFactor.values.length > 0 && D.metrics.dailyHitRate.values.length > 0);
  ok('drawdown is negative or zero', D.metrics.maxDD.realised <= 0);
  ok('time in drawdown is a percentage', D.metrics.timeInDD.realised >= 0 && D.metrics.timeInDD.realised <= 100);
  ok('empty book returns null', distributions([], {}) === null);
}


console.log('\nrolling edge');
{
  // 30 trades: first 20 all winners (+10), last 10 all losers (-10). The final
  // 20-window holds 10W/10L = 50%, the full sample is 20/30 = 66.7%.
  const rows = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(Date.UTC(2026, 0, 5) + i * 86400000);
    rows.push(tr(d.toISOString().slice(0, 10), i < 20 ? 10 : -10));
  }
  const { trades } = normalizeTrades(rows);
  const e = rollingEdge(trades, { window: 20, runs: 300 });
  ok('enough trades for the window', e.enough === true);
  ok('one row per completed window', e.rows.length === 11);
  ok('first window is all winners', near(e.rows[0].winRate, 100));
  ok('last window is 50/50', near(e.last.winRate, 50));
  ok('full-sample win rate is 66.7%', near(e.full.winRate, 200 / 3, 1e-6));
  ok('full-sample expectancy from whole book, not last window', near(e.full.expectancy, (200 - 100) / 30, 1e-9));
  ok('last-window expectancy is 0', near(e.last.expectancy, 0));
  ok('band percentiles ordered', e.band.winRate.p5 <= e.band.winRate.p50 && e.band.winRate.p50 <= e.band.winRate.p95);
  ok('a 50% window ranks LOW against a 67% book', e.read.winRateRank < 30, `P${e.read.winRateRank}`);
  ok('too few trades -> enough:false, no throw', rollingEdge(trades.slice(0, 5), { window: 20 }).enough === false);
  const again = rollingEdge(trades, { window: 20, runs: 300 });
  ok('deterministic band', near(again.band.winRate.p5, e.band.winRate.p5, 1e-12));
}

console.log('\nbreakdowns');
{
  // Opens at fixed UTC hours in mid-summer (BST, UTC+1) so UK clock = UTC + 1.
  const at = (dateIso, hourUtc, profit, extra = {}) => {
    const t = tr(dateIso, profit, extra);
    t.time_open = Math.floor(new Date(`${dateIso}T${String(hourUtc).padStart(2, '0')}:00:00Z`).getTime() / 1000);
    t.time_close = t.time_open + 3600;
    return t;
  };
  const { trades } = normalizeTrades([
    at('2026-07-06', 2, 10, { sym: 'EURUSD', direction: 'BUY' }),    // Mon 03:00 UK -> Asia
    at('2026-07-07', 8, -5, { sym: 'EURUSD', direction: 'SELL' }),   // Tue 09:00 UK -> London
    at('2026-07-08', 13, 20, { sym: 'XAUUSD', direction: 'BUY' }),   // Wed 14:00 UK -> LN/NY
    at('2026-07-10', 20, -8, { sym: 'XAUUSD', direction: 'BUY' }),   // Fri 21:00 UK -> NY
  ]);
  const b = breakdowns(trades);
  ok('sessions bucketed on UK open hour', b.bySession.map(r => r.key).join('|') === 'Asia (00–08 UK)|London (08–13 UK)|LN/NY (13–18 UK)|NY (18–22 UK)');
  ok('sessions in chronological order, not by P&L', b.bySession[0].key.startsWith('Asia'));
  ok('weekday bucketed', b.byDow.map(r => r.key).join('|') === 'Mon|Tue|Wed|Fri');
  ok('hour bucketed and sorted', b.byHour[0].key === '03:00' && b.byHour[3].key === '21:00');
  ok('direction split', b.byDir.find(r => r.key === 'BUY').n === 3 && b.byDir.find(r => r.key === 'SELL').n === 1);
  ok('bot×pair key', b.byBotPair.some(r => r.key === 'bot_status|XAUUSD' && r.n === 2));
  ok('expectancy on every row', b.byPair.every(r => typeof r.expectancy === 'number'));
  ok('EURUSD expectancy = net/n', near(b.byPair.find(r => r.key === 'EURUSD').expectancy, 2.5));
  ok('reports rows with no open time', b.noOpenTime === 0);

  const g = hourWeekdayGrid(trades);
  ok('grid is 7×24', g.grid.length === 7 && g.grid.every(r => r.length === 24));
  ok('Mon 03:00 UK holds the first trade', g.grid[0][3].n === 1 && near(g.grid[0][3].net, 10));
  ok('Fri 21:00 UK holds the last', g.grid[4][21].n === 1 && near(g.grid[4][21].net, -8));
  ok('maxAbs is the biggest cell', near(g.maxAbs, 20));
  ok('nothing skipped when all have open times', g.skipped === 0);

  const noOpen = { ...trades[0], utcOpen: null };
  ok('missing open time is counted, not zeroed into 00:00 Monday', hourWeekdayGrid([noOpen]).skipped === 1 && hourWeekdayGrid([noOpen]).grid[0][0].n === 0);
}
{
  ok('ukClock: BST summer 12:00Z -> 13 UK', ukClock(Math.floor(Date.UTC(2026, 6, 1, 12) / 1000)).hour === 13);
  ok('ukClock: GMT winter 12:00Z -> 12 UK', ukClock(Math.floor(Date.UTC(2026, 0, 14, 12) / 1000)).hour === 12);
  ok('ukClock: Monday index 0', ukClock(Math.floor(Date.UTC(2026, 6, 6, 12) / 1000)).dow === 0);
  ok('ukClock: Sunday index 6', ukClock(Math.floor(Date.UTC(2026, 6, 5, 12) / 1000)).dow === 6);
  ok('ukClock: 23:30Z summer rolls to next UK day', ukClock(Math.floor(Date.UTC(2026, 6, 6, 23, 30) / 1000)).dow === 1);
}

console.log(fail ? `\n${fail} FAILED\n` : '\nAll passed\n');
process.exit(fail ? 1 : 0);
