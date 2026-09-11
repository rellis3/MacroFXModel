// Synthetic, no-network tests for the bot-audit engine.
//   node js/botAuditEngine.test.mjs
import {
  netOf, costOf, botsMissingCommission, normalizeTrades, equityByTrade,
  dailySeries, dailyEquity, monthlyReturns, rollingReturn, groupBy,
  excursions, exitMix, summarize, MIN_N_RATIOS,
  cumFromDaily, liveGrowthPct, growthCone, conePercentile, clipDaily,
  distributions, DIST_METRICS, METRIC_READING,
  rollingEdge, breakdowns, hourWeekdayGrid, ukClock,
  dailyByGroup, correlationMatrix, effectiveBets, coincidentLoss, worstJointDays, symEigen,
  legsOf, netLegs, openAt, exposureSeries, drawdownEpisodes, concentration, projectPaths,
  windowDist, rankAgainst, riskPerTrade,
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


console.log('\nportfolio structure');
{
  // Two bots: A and B move TOGETHER on every day; C moves opposite to A.
  const rows = [];
  for (let i = 0; i < 40; i++) {
    const d = new Date(Date.UTC(2026, 2, 2) + i * 86400000);
    if (d.getUTCDay() % 6 === 0) continue;
    const iso = d.toISOString().slice(0, 10), v = (i % 3 === 0 ? -20 : 15) + (i % 5);
    rows.push(tr(iso, v, { bot: 'A' }), tr(iso, v * 0.8, { bot: 'B' }), tr(iso, -v, { bot: 'C' }));
  }
  const { trades } = normalizeTrades(rows);
  const dbg = dailyByGroup(trades, t => t.bot_key);
  ok('one series per group on a shared calendar', dbg.keys.length === 3 && Object.values(dbg.series).every(s => s.length === dbg.days.length));
  ok('calendar has no weekends', dbg.days.every(d => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return w !== 0 && w !== 6; }));
  ok('active days counted', dbg.activeDays.A === dbg.days.length);
  const C = correlationMatrix(dbg);
  const ix = k => C.keys.indexOf(k);
  ok('A~B strongly positive', C.rho[ix('A')][ix('B')] > 0.95, C.rho[ix('A')][ix('B')].toFixed(3));
  ok('A~C strongly negative', C.rho[ix('A')][ix('C')] < -0.95, C.rho[ix('A')][ix('C')].toFixed(3));
  ok('diagonal is 1', C.rho[0][0] === 1);
  ok('both-active days recorded', C.both[ix('A')][ix('B')] === dbg.days.length);
  const E = effectiveBets(dbg, C);
  ok('three perfectly dependent streams -> ~1 effective bet', E.nEff < 1.2, E.nEff.toFixed(2));
  // C is −A, so the PORTFOLIO barely moves while each leg moves a lot: the
  // diversification ratio is HIGH here (hedged) even though nEff says one
  // factor. Both numbers are right; they answer different questions.
  ok('hedged book: divRatio high while nEff ~1', E.divRatio > 3 && E.nEff < 1.2, `div ${E.divRatio?.toFixed(2)} nEff ${E.nEff.toFixed(2)}`);
  const cl = coincidentLoss(dbg);
  ok('P(B loses | A loses) = 1 when they move together', cl[ix('A')][ix('B')].p === 1);
  ok('P(C loses | A loses) = 0 when opposite', cl[ix('A')][ix('C')].p === 0);
  const wj = worstJointDays(dbg, 3);
  ok('worst joint day found', wj.length === 3 && wj[0].losers >= 1);
}
{
  // Independent streams -> nEff near N.
  const rows = []; let s3 = 11; const r3 = () => ((s3 = (s3 * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 40;
  for (let i = 0; i < 300; i++) {
    const d = new Date(Date.UTC(2025, 0, 6) + i * 86400000);
    if (d.getUTCDay() % 6 === 0) continue;
    const iso = d.toISOString().slice(0, 10);
    for (const b of ['X', 'Y', 'Z', 'W']) rows.push(tr(iso, r3(), { bot: b }));
  }
  const { trades } = normalizeTrades(rows);
  const dbg = dailyByGroup(trades, t => t.bot_key);
  const E = effectiveBets(dbg, correlationMatrix(dbg));
  ok('four independent streams -> nEff near 4', E.nEff > 3.4, E.nEff.toFixed(2));
  ok('divRatio near 2 (=√4) for independent', E.divRatio > 1.7 && E.divRatio < 2.3, E.divRatio.toFixed(2));
}
{
  const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  ok('eigen of identity = 1,1,1', symEigen(I).every(v => near(v, 1, 1e-9)));
  const P = [[1, 1, 1], [1, 1, 1], [1, 1, 1]];
  const e = symEigen(P);
  ok('eigen of all-ones = 3,0,0', near(e[0], 3, 1e-9) && near(e[1], 0, 1e-9) && near(e[2], 0, 1e-9));
  ok('nulls treated as 0, no throw', symEigen([[1, null], [null, 1]]).length === 2);
}

console.log('\ncurrency legs');
{
  const reg = sym => ({ EURUSD: { assetClass: 'fx', display: 'EUR/USD' }, USDJPY: { assetClass: 'fx', display: 'USD/JPY' },
                        XAUUSD: { assetClass: 'commodity', display: 'XAU/USD' }, NAS100: { assetClass: 'index', display: 'NAS100_USD' } })[sym] || (() => { throw new Error('unknown'); })();
  const L = legsOf('EURUSD', 'BUY', 0.5, reg);
  ok('long EURUSD = +EUR, −USD', L.find(l => l.ccy === 'EUR').lots === 0.5 && L.find(l => l.ccy === 'USD').lots === -0.5);
  const S = legsOf('USDJPY', 'SELL', 0.2, reg);
  ok('short USDJPY = −USD, +JPY', S.find(l => l.ccy === 'USD').lots === -0.2 && S.find(l => l.ccy === 'JPY').lots === 0.2);
  const G = legsOf('XAUUSD', 'BUY', 1, reg);
  ok('gold is ONE leg, no invented USD notional', G.length === 1 && G[0].ccy === 'XAU' && G[0].kind === 'commodity');
  const N = legsOf('NAS100', 'SELL', 2, reg);
  ok('index is one leg, named', N.length === 1 && N[0].ccy === 'NAS100' && N[0].lots === -2);
  ok('unknown symbol -> own leg flagged unknown, no throw', legsOf('WIBBLE', 'BUY', 1, reg)[0].kind === 'unknown');
  ok('zero lots -> no legs', legsOf('EURUSD', 'BUY', 0, reg).length === 0);

  // Long EURUSD + short USDJPY: USD legs cancel? No — both are SHORT USD. +EUR, −USD ×2, +JPY.
  const net = netLegs([{ symbol: 'EURUSD', direction: 'BUY', lots: 0.5 }, { symbol: 'USDJPY', direction: 'SELL', lots: 0.5 }], reg);
  ok('USD leg nets across pairs', near(net.find(l => l.ccy === 'USD').lots, -1.0));
  ok('a real hedge nets to zero', near(netLegs([{ symbol: 'EURUSD', direction: 'BUY', lots: 1 }, { symbol: 'EURUSD', direction: 'SELL', lots: 1 }], reg).find(l => l.ccy === 'EUR').lots, 0));

  const mk = (openIso, closeIso, sym, dir, lots) => ({ symbol: sym, direction: dir, lots,
    utcOpen: Math.floor(new Date(openIso).getTime() / 1000), utcClose: Math.floor(new Date(closeIso).getTime() / 1000),
    day: closeIso.slice(0, 10) });
  const book = [mk('2026-06-01T08:00Z', '2026-06-03T16:00Z', 'EURUSD', 'BUY', 1), mk('2026-06-02T08:00Z', '2026-06-02T12:00Z', 'XAUUSD', 'SELL', 0.3)];
  book.sort((a, b) => a.utcClose - b.utcClose);
  const at = Math.floor(new Date('2026-06-02T10:00Z').getTime() / 1000);
  ok('openAt finds both positions mid-day 2', openAt(book, at).length === 2);
  ok('openAt excludes closed at boundary', openAt(book, Math.floor(new Date('2026-06-02T12:00Z').getTime() / 1000)).length === 1);
  const ex = exposureSeries(book, reg);
  ok('exposure series has EUR/USD legs', ex.legs.includes('EUR') && ex.legs.includes('USD'));
  ok('day-1 EOD carries +1 EUR', near(ex.series.EUR[0], 1));
  ok('max concurrent = 1 at EOD (gold closed intraday)', ex.maxConcurrent === 1);
}

console.log('\nrisk');
{
  const { trades } = normalizeTrades([
    tr('2026-09-01', 100), tr('2026-09-02', -40), tr('2026-09-03', -30), tr('2026-09-04', 80), tr('2026-09-07', -10),
  ]);
  const dEq = dailyEquity(dailySeries(trades), 1000);
  const eps = drawdownEpisodes(dEq);
  ok('two episodes found', eps.length === 2, String(eps.length));
  ok('deepest first', eps[0].depth <= eps[1].depth);
  ok('first episode −70 over 2 days, recovered', near(eps[0].depth, -70) && eps[0].recovered === true);
  ok('open episode flagged not recovered', eps[1].recovered === false && eps[1].end === null);
  ok('depth % against the peak', near(eps[0].depthPct, -70 / 1100 * 100));

  const c = concentration(trades);
  ok('top-1 share of gross profit', near(c.top1Share, 100 / 180));
  ok('without top 5 = total minus top 5 (all five here -> 0)', near(c.withoutTop5, 0));
  ok('tail ratio positive', c.tailRatio > 0);
}

console.log('\nprojection');
{
  const up = new Array(60).fill(50);         // +$50 every day
  const P = projectPaths(up, { horizon: 30, runs: 300, capital: 10000, targetPct: 10, maxDDPct: 10, dailyLossPct: 5 });
  ok('a book that only wins passes with certainty', P.pPass === 1 && P.pBustDD === 0);
  ok('passes on day 20 exactly (1000/50)', P.medianDaysToPass === 20);
  const down = new Array(60).fill(-600);
  const Q = projectPaths(down, { horizon: 30, runs: 300, capital: 10000, targetPct: 10, maxDDPct: 10, dailyLossPct: 5 });
  ok('a −6%/day book busts on the DAILY rule first', Q.pBustDaily === 1 && Q.pBustDD === 0);
  const slow = new Array(60).fill(-300);
  const R = projectPaths(slow, { horizon: 30, runs: 300, capital: 10000, targetPct: 10, maxDDPct: 10, dailyLossPct: 5 });
  ok('a −3%/day book busts on the DRAWDOWN rule', R.pBustDD === 1 && R.pBustDaily === 0);
  ok('fan has horizon+1 rows, ordered', P.fan.length === 31 && P.fan.every(f => f.p5 <= f.p50 && f.p50 <= f.p95));
  ok('no capital -> null, never a fake denominator', projectPaths(up, { capital: 0 }) === null);
  ok('too few days -> null', projectPaths([1, 2, 3], { capital: 1000 }) === null);
  const P2 = projectPaths(up, { horizon: 30, runs: 300, capital: 10000 });
  ok('deterministic', P2.pPass === P.pPass && P2.finalPct.p50 === P.finalPct.p50);
}


console.log('\nexpectation windows');
{
  const flat = new Array(300).fill(0.1);                  // +0.1% every day
  const w = windowDist(flat, 60);
  ok('one entry per 60-day window', w.n === 241 && w.horizon === 60);
  ok('constant series -> zero sd -> sharpe 0 (guarded), no NaN', w.sharpe.every(v => v === 0));
  ok('total return of a 60-day window', near(w.totalReturn[0], (Math.pow(1.001, 60) - 1) * 100, 1e-9));
  ok('no drawdown on a monotone series', w.maxDD.every(v => v === 0));
  ok('too short a horizon -> empty', windowDist(flat, 3).n === 0);
  ok('horizon clamps to series length', windowDist(flat.slice(0, 30), 90).horizon === 30);

  let s4 = 9; const r4 = () => ((s4 = (s4 * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 2;
  const noisy = Array.from({ length: 500 }, r4);
  const wn = windowDist(noisy, 63);
  ok('drawdowns negative on a noisy series', wn.maxDD.every(v => v <= 0) && wn.maxDD.some(v => v < -1));
  ok('calmar defined where drawdown is', wn.calmar.length === wn.n);
  const rk = rankAgainst(wn.sharpe, 99);
  ok('a sharpe of 99 ranks P100 with P5/P50/P95 reported', rk.rank === 100 && rk.p5 <= rk.p50 && rk.p50 <= rk.p95 && rk.n === wn.n);
  ok('the median itself ranks ~P50', Math.abs(rankAgainst(wn.sharpe, rk.p50).rank - 50) <= 2);
  ok('nothing to rank against -> null, never 50', rankAgainst([], 1) === null && rankAgainst(wn.sharpe, null) === null);
}


console.log('\nrisk per trade');
{
  // +1R that made $50 => risked $50. -1R that lost $50 => risked $50. +2R for $100 => $50.
  const { trades } = normalizeTrades([
    tr('2026-09-01',  50, { r: 1.0 }), tr('2026-09-02', -50, { r: -1.0 }), tr('2026-09-03', 100, { r: 2.0 }),
    tr('2026-09-04',  20, { r: 0.5 }),                       // $40 risked
    tr('2026-09-05',  30),                                    // no R
    tr('2026-09-06',   0, { r: 0 }),                          // R = 0, no denominator
    tr('2026-09-07', -10, { r: 0.5 }),                        // profit and R disagree in sign
  ]);
  const k = riskPerTrade(trades, { capital: 10000 });
  ok('usable rows counted', k.n === 4);
  ok('no-R, zero-R and inconsistent all REPORTED', k.noR === 1 && k.zeroR === 1 && k.inconsistent === 1);
  ok('median risk amount', near(k.medianAmount, 50));
  ok('as % of capital', near(k.medianPct, 0.5));
  ok('spread p90/p10', k.spread > 1 && k.spread < 1.6, String(k.spread));
  ok('no capital -> amounts but no %', riskPerTrade(trades).medianPct === null && riskPerTrade(trades).medianAmount === 50);
  ok('empty -> n 0, nulls, no throw', riskPerTrade([]).n === 0 && riskPerTrade([]).medianAmount === null);
}

console.log(fail ? `\n${fail} FAILED\n` : '\nAll passed\n');
process.exit(fail ? 1 : 0);
