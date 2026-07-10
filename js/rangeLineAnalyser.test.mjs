// Synthetic end-to-end test for the range-line analyser (Forecast-Level Strategy
// applied to range levels, modules stripped). Proves the clean pipeline emits
// perLineStrategy-shaped records and runs through the proven policy engine.
//   node js/rangeLineAnalyser.test.mjs

import { analyseRangeWindow, runRangeLineAnalyser, runRangeLineBook, eRatioByCell, touchesForPair, runExitAB, runHeldPosition, runBadLevelScan, runZoneWalk, confluenceBucketAt, CONFLUENCE_SOURCES, runConfluenceFilter, intradayConfluenceAt, DAILY_CONFLUENCE_SOURCES, sessionConfluenceLevels } from './rangeLineAnalyser.js';
import { bucketM1IntoSessions } from './forecastAnalyser.js';
import { extractTouches, buildPolicy } from './perLineStrategy.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

// ── Synthetic packed M1: N days × an up-then-down intraday swing (so range lines
// get touched and revert/continue). Deterministic (no Math.random). ────────────
function makePacked(days, base0, seed) {
  const perDay = 90;                                   // 90 × 1-min bars (00:00–01:30 UTC) → same-day session
  const n = days * perDay;
  const times = new Float64Array(n), opens = new Float64Array(n), highs = new Float64Array(n),
        lows = new Float64Array(n), closes = new Float64Array(n), volumes = new Float64Array(n);
  const day0 = Date.UTC(2024, 0, 1) / 1000;
  let idx = 0, base = base0;
  for (let d = 0; d < days; d++) {
    const dayStart = day0 + d * 86400;                 // 00:00 UTC each day
    base *= 1 + 0.0009 * Math.sin((d + seed) / 5);     // slow drift in the base
    const amp = 0.006 + 0.002 * Math.sin((d + seed) / 3);
    for (let m = 0; m < perDay; m++) {
      const o = base * (1 + amp * Math.sin((m + seed) / 12));
      const c = base * (1 + amp * Math.sin((m + 1 + seed) / 12));
      times[idx] = dayStart + m * 60;
      opens[idx] = o; closes[idx] = c;
      highs[idx] = Math.max(o, c) * 1.0002; lows[idx] = Math.min(o, c) * 0.9998;
      volumes[idx] = 100 + (m % 11) + (d % 7);
      idx++;
    }
  }
  return { n, times, opens, highs, lows, closes, volumes };
}

console.log('[records shape — perLineStrategy compatible]');
const packed = makePacked(60, 1.1000, 0);
const sessions = bucketM1IntoSessions(packed, 22);
// asiaHrs 0.5 so the 90-min synthetic session has a post-formation window left
// to trade (the no-lookahead gate drops touches during range formation).
const records = runRangeLineAnalyser(sessions, 'fx', { sources: ['asia', 'monday'], minLookback: 20, minBarsPerSession: 30, asiaHrs: 0.5 });
ok('produces window records', records.length > 0, `${records.length} sessions`);
const allLines = records.flatMap(r => r.lines);
ok('lines have outcome reverted/continued', allLines.length > 0 && allLines.every(l => l.outcome === 'reverted' || l.outcome === 'continued'));
ok('lines carry triple-barrier geometry', allLines.every(l => Number.isFinite(l.innerLvl) && Number.isFinite(l.outerLvl) && Number.isFinite(l.level)));
ok('lines tagged decidedBy (barrier|close)', allLines.every(l => l.decidedBy === 'barrier' || l.decidedBy === 'close'));
ok('lines have approachVel (bucket or null)', allLines.every(l => 'approachVel' in l));
ok('lines carry MFE/MAE excursion (excMid/excAway ≥ 0)',
   allLines.every(l => Number.isFinite(l.excMid) && Number.isFinite(l.excAway) && l.excMid >= 0 && l.excAway >= 0));
ok('both Asia (A_) and Monday (M_) line sources present', allLines.some(l => l.name.startsWith('A_')) && allLines.some(l => l.name.startsWith('M_')));

console.log('[extractTouches consumes the records]');
const touches = extractTouches(records, { conditions: [] });   // cell = line only (dense, for the test)
ok('extractTouches yields decided touches', touches.length > 0, `${touches.length} touches`);
ok('touches have cell + barrier prices', touches.every(t => t.cell && Number.isFinite(t.innerLvl) && Number.isFinite(t.outerLvl)));

console.log('[structural-confluence bucket — pure helper, known answers]');
// Two distinct sources within tol of 1.1000 → multi; one → single; none → none.
const cl = [{ price: 1.1001, source: 'pivots' }, { price: 1.1002, source: 'poc' }, { price: 1.2000, source: 'vwap' }];
ok('confluenceBucketAt: 2 distinct sources within tol → 3·multi', confluenceBucketAt(1.1000, cl, 0.0005) === '3·multi');
ok('confluenceBucketAt: 1 source within tol → 2·single', confluenceBucketAt(1.1000, [{ price: 1.1001, source: 'pivots' }], 0.0005) === '2·single');
ok('confluenceBucketAt: none within tol → 1·none', confluenceBucketAt(1.1000, cl, 0.00001) === '1·none');
ok('confluenceBucketAt: same source twice counts once (distinct)',
   confluenceBucketAt(1.1000, [{ price: 1.1001, source: 'pivots' }, { price: 1.1002, source: 'pivots' }], 0.0005) === '2·single');
ok('confluenceBucketAt: null when no levels / no tol', confluenceBucketAt(1.1000, [], 0.0005) === null && confluenceBucketAt(1.1000, cl, 0) === null);
ok('CONFLUENCE_SOURCES lists the fibs/pivots/HVN-POC-VAH-VAL/S&R/round/vwap brick ids',
   CONFLUENCE_SOURCES.includes('pivots') && CONFLUENCE_SOURCES.includes('volume_profile') && CONFLUENCE_SOURCES.includes('swing_fib'));

console.log('[confluence condition — end-to-end through the analyser + extractTouches]');
const confRecords = runRangeLineAnalyser(sessions, 'fx',
  { sources: ['asia', 'monday'], minLookback: 20, minBarsPerSession: 30, asiaHrs: 0.5, pip: 0.0001,
    confluence: { enabled: true, tolFrac: 0.2, lookbackDays: 5 } });
const confLines = confRecords.flatMap(r => r.lines);
ok('confluence-enabled lines carry a confluence bucket field', confLines.length > 0 && confLines.every(l => 'confluence' in l));
ok('confluence buckets are the expected labels (or null)',
   confLines.every(l => l.confluence == null || ['1·none', '2·single', '3·multi'].includes(l.confluence)),
   `sample=${[...new Set(confLines.map(l => l.confluence))].join(',')}`);
ok('at least some lines are backed by a structural confluence (bucket set)',
   confLines.some(l => l.confluence === '2·single' || l.confluence === '3·multi'));
const confTouches = extractTouches(confRecords, { conditions: ['confluence'] });
ok('extractTouches keys cells on the confluence bucket', confTouches.length > 0 && confTouches.every(t => /\|[123]·(none|single|multi)$/.test(t.cell)),
   `${confTouches.length} touches, e.g. ${confTouches[0]?.cell}`);
ok('default run (confluence off) leaves the bucket null → not conditionable',
   allLines.every(l => l.confluence == null || l.confluence === undefined));

console.log('[intradayConfluenceAt — running-swing fibs + VWAP, no lookahead]');
// Bars: low 100 rising to a running high; VWAP ~ mid. At idx=2 the running range is
// [100,104]; fibs project off it. A LATER high (idx=4=110) must NOT affect idx=2.
const ib = [
  { high: 101, low: 100, close: 100.5, volume: 1 },
  { high: 103, low: 100, close: 102,   volume: 1 },
  { high: 104, low: 100, close: 103,   volume: 1 },   // idx=2 → running range 100–104
  { high: 106, low: 103, close: 105,   volume: 1 },
  { high: 110, low: 105, close: 109,   volume: 1 },   // new high AFTER idx 2
];
const iat2 = intradayConfluenceAt(ib, 2);
ok('emits fib (swing_fib) + vwap sources', iat2.some(l => l.source === 'swing_fib') && iat2.some(l => l.source === 'vwap'));
ok('fibs anchored to running range 100–104 (0.5 → 102)', iat2.some(l => l.source === 'swing_fib' && Math.abs(l.price - 102) < 1e-6));
ok('NO lookahead — a later high (110) does not enter idx=2 (max fib ≤ 104)',
   Math.max(...iat2.filter(l => l.source === 'swing_fib').map(l => l.price)) <= 104 + 1e-9);
const iat4 = intradayConfluenceAt(ib, 4);
ok('by idx=4 the running high (110) DOES move the fibs (max fib > 104)',
   Math.max(...iat4.filter(l => l.source === 'swing_fib').map(l => l.price)) > 104);
ok('idx<1 / out-of-range → []', intradayConfluenceAt(ib, 0).length === 0 && intradayConfluenceAt(ib, 99).length === 0);
ok('DAILY_CONFLUENCE_SOURCES excludes the intraday-dynamic fib/vwap', !DAILY_CONFLUENCE_SOURCES.includes('vwap') && !DAILY_CONFLUENCE_SOURCES.includes('swing_fib') && !DAILY_CONFLUENCE_SOURCES.includes('fib15'));

console.log('[touch-time confluence mode — end to end]');
const touchRecords = runRangeLineAnalyser(sessions, 'fx',
  { sources: ['asia', 'monday'], minLookback: 20, minBarsPerSession: 30, asiaHrs: 0.5, pip: 0.0001,
    confluence: { enabled: true, mode: 'touch', tolFrac: 0.2, lookbackDays: 5 } });
const touchLines = touchRecords.flatMap(r => r.lines);
ok('touch-mode lines carry a confluence bucket', touchLines.length > 0 && touchLines.every(l => 'confluence' in l));
ok('touch-mode buckets are the expected labels (or null)',
   touchLines.every(l => l.confluence == null || ['1·none', '2·single', '3·multi'].includes(l.confluence)),
   `sample=${[...new Set(touchLines.map(l => l.confluence))].join(',')}`);

console.log('[confluence QUALITY FILTER — direction held, levels filtered]');
// Touches keyed on NONE (direction-agnostic policy) but carrying the confluence
// bucket — the shape the quality filter consumes.
const noneConfTouches = extractTouches(confRecords, { conditions: [] });
ok('none-condition touches still carry a confluence field', noneConfTouches.length > 0 && noneConfTouches.every(t => 'confluence' in t));
ok('cells are NOT split by confluence when condition=none', noneConfTouches.every(t => /\|$/.test(t.cell)));
const cfSplit = '2024-01-25';   // synthetic data runs 2024-01-01 … ~2024-03; split mid-window
const cfPolicy = buildPolicy(noneConfTouches.filter(t => t.date < cfSplit), { minN: 3, marginPct: 0 });
const cf = runConfluenceFilter({ eurusd: noneConfTouches }, { policy: cfPolicy, splitDate: cfSplit, costByPair: { eurusd: 0.008 } });
ok('runConfluenceFilter returns per-bucket expectancy + filter books', cf && Array.isArray(cf.bucketStats) && Array.isArray(cf.books) && cf.books.length === 3,
   `buckets=${cf?.bucketStats?.length} books=${cf?.books?.length}`);
ok('books are labelled all / confluent(≥1) / strong(≥2)',
   cf.books.map(b => b.filter).join(' | ') === 'all levels | confluent (≥1) | strong (≥2)');
ok('each filter book carries held-chandelier Sharpe @1/2/3× + trades', cf.books.every(b =>
   'sharpe2' in b.all && 'sharpe3' in b.all && Number.isFinite(b.all.trades)));
ok('filtering to stronger levels keeps ≤ the trades of "all"',
   (cf.books[2].all.trades ?? 0) <= (cf.books[0].all.trades ?? 0) && (cf.books[1].all.trades ?? 0) <= (cf.books[0].all.trades ?? 0),
   `all=${cf.books[0].all.trades} ≥1=${cf.books[1].all.trades} ≥2=${cf.books[2].all.trades}`);
ok('per-bucket rows carry expectancy + follow%', cf.bucketStats.every(r => 'expectancy' in r && 'followPct' in r));
ok('filter carries rigor (per-year + walk-forward on the ≥2 book)', cf.rigor && cf.rigor.minConf === 2 && Array.isArray(cf.rigor.perYear) && Array.isArray(cf.rigor.walkForward),
   `perYear=${cf.rigor?.perYear?.length} folds=${cf.rigor?.walkForward?.length}`);

console.log('[analyseRangeWindow direct — inner toward mid, outer away]');
const oneDay = sessions.get([...sessions.keys()].sort()[30]);
const low = 1.10, high = 1.11, mid = 1.105;
const ladder = { low, high, levels: [
  { label: 'A_0', level: 1.10 }, { label: 'A_0.5', level: 1.105 }, { label: 'A_1', level: 1.11 },
] };
const lr = analyseRangeWindow({ open: oneDay[0].open, bars: oneDay }, [ladder], { sigma: 0.005, tf: null });
ok('direct analyse returns line records', Array.isArray(lr));
ok('no approachVel when tf=null (still has outcome geometry)', lr.every(l => l.approachVel == null && Number.isFinite(l.innerLvl)));

console.log('[no-lookahead gate — validFrom excludes formation-window touches]');
// Tiny session: price touches the MID level (which has both neighbours, so it's
// a valid trade) ONLY in the first 5 bars, then sits above it. With validFrom
// after those bars, the mid must NOT produce a trade; without it, it must.
const t0 = 1_700_000_000;
const synth = [];
for (let k = 0; k < 20; k++) {
  const px = k < 5 ? 1.1040 : 1.1080;   // dips to touch 1.105 only in the first 5 bars
  synth.push({ time: t0 + k * 60, open: px, high: px + 0.0001, low: px - 0.0001, close: px });
}
const lvls = [{ label: 'A_0', level: 1.10 }, { label: 'A_0.5', level: 1.105 }, { label: 'A_1', level: 1.11 }];
const gated = analyseRangeWindow({ open: 1.10, bars: synth },
  [{ low: 1.10, high: 1.11, validFrom: t0 + 10 * 60, levels: lvls }], { tf: null });
ok('A_0.5 dropped — its only touch was before validFrom', !gated.some(l => l.name === 'A_0.5'),
   `lines after gate: ${gated.map(l => l.name).join(',') || 'none'}`);
const ungated = analyseRangeWindow({ open: 1.10, bars: synth },
  [{ low: 1.10, high: 1.11, levels: lvls }], { tf: null });
ok('A_0.5 present without the gate (control)', ungated.some(l => l.name === 'A_0.5'));

console.log('[full book through the proven per-line engine]');
const book = runRangeLineBook(
  { eurusd: packed, gbpusd: makePacked(60, 1.2500, 3) },
  { sources: ['asia', 'monday'], conditions: [], minN: 3, splitFrac: 0.6, marginPct: 0, mcRuns: 30, bootRuns: 30, minLookback: 20, asiaHrs: 0.5 }
);
ok('book returns a policy', book && book.policy && Object.keys(book.policy).length > 0);
ok('book has per-pair OOS stats for both pairs', book.perPair.eurusd && book.perPair.gbpusd);
ok('book has aggregate stats + coverage', book.book && book.coverage &&
   Number.isFinite(book.coverage.fadeCells + book.coverage.followCells + book.coverage.skipCells));
ok('honest portfolio risk present (daily-aggregated Sharpe, not per-touch)',
   book.portfolio && Number.isFinite(book.portfolio.sharpe) && Number.isFinite(book.portfolio.avgTradesPerDay),
   `portSharpe=${book.portfolio?.sharpe} trades/day=${book.portfolio?.avgTradesPerDay}`);
ok('survivors block present (live universe re-aggregated)',
   book.survivors && Array.isArray(book.survivors.pairs) && book.survivors.portfolio,
   `kept=${book.survivors?.count}/${book.survivors?.total}`);
ok('policy cells decide fade/follow/skip', Object.values(book.policy).every(p => ['fade', 'follow', 'skip'].includes(p.decision)));
ok('nTrades is a count', Number.isFinite(book.nTrades) && book.nTrades >= 0, `nTrades=${book.nTrades}`);

console.log('[exit trail sim — hand-crafted path, known answer]');
// Ladder rung = 0.0030 (30 pips). Entry line A_1 = 1.1000 (up side). Path: runs to
// peak 1.1090 (= +3 rungs), then closes 1.1040. Structural trail should exit one
// rung below the peak (1.1060 = +2 rungs); chandelier (½ rung=15p) exits 1.1075.
const mk = (o,h,l,c,t) => ({ time: t, open: o, high: h, low: l, close: c });
const path = [
  mk(1.1000,1.1005,1.0985,1.1003,0),   // entry bar, dips to 1.0985 (no SL at 1.0970)
  mk(1.1003,1.1035,1.1000,1.1032,60),  // reach 1.1030 (rung1)
  mk(1.1032,1.1065,1.1030,1.1060,120), // reach 1.1060 (rung2)
  mk(1.1060,1.1092,1.1058,1.1088,180), // peak 1.1092 (>=1.1090 rung3)
  mk(1.1088,1.1090,1.1038,1.1040,240), // pull back, low 1.1038 → crosses struct stop 1.1060
];
const lad = { low: 1.0970, high: 1.1000, validFrom: -Infinity, levels: [
  { label:'A_0.5', level:1.0970 }, { label:'A_1', level:1.1000 }, { label:'A_1.5', level:1.1030 },
  { label:'A_2', level:1.1060 }, { label:'A_2.5', level:1.1090 }, { label:'A_3', level:1.1120 } ] };
const arr = analyseRangeWindow({ open: 1.1000, bars: path }, [lad], { tf: null });
const a1 = arr.find(l => l.name === 'A_1');
ok('A_1 line present with trail PnLs', a1 && Number.isFinite(a1.fStruct) && Number.isFinite(a1.fChand),
   `fStruct=${a1?.fStruct} fChand=${a1?.fChand}`);
// structural: exits at 1.1060 → (1.1060-1.1000)/1.1000*100 ≈ 0.5455%
ok('structural trail exits ~one rung below peak (+2 rungs)', Math.abs(a1.fStruct - 0.5455) < 0.02, `fStruct=${a1.fStruct}`);
ok('chandelier gives back less than structural (tighter)', a1.fChand >= a1.fStruct - 1e-6, `fChand=${a1.fChand} fStruct=${a1.fStruct}`);

console.log('[exit A/B book]');
const abPol = { 'A_1_up|': { decision: 'follow', n: 99 } };
const ab = runExitAB({ p: arr.map(l => ({ ...l, date:'2020-01-02', open:1.1000, cell:`${l.name}_${l.side}|`, level:l.level,
  innerLvl:l.innerLvl, outerLvl:l.outerLvl, reverted: l.outcome==='reverted', decidedBy:l.decidedBy,
  closePx:1.1040, fStruct:l.fStruct, fChand:l.fChand })) },
  { policy: abPol, splitDate: '2020-01-01', costByPair: { p: 0.008 } });
ok('runExitAB returns all four modes', ab && ab.fixed && ab.struct && ab.chand && ab.scale,
   `fixed=${ab?.fixed?.trades} struct=${ab?.struct?.trades}`);
ok('exit modes carry cost-stress', Array.isArray(ab.struct.costStress) && ab.struct.costStress.length === 3);

console.log('[held-position model — collapses same-direction follow touches]');
// Three follow touches, same day/side/source (Monday up). Per-touch A/B = 3 trades;
// held model suppresses re-entry → 1 trade (the earliest by fillTime).
const T = (cell, name, fillTime, fStruct) => ({
  date:'2022-03-01', open:1.10, side:'up', name, cell,
  level:1.10, innerLvl:1.097, outerLvl:1.103, reverted:false, decidedBy:'barrier', closePx:1.104,
  fillTime, fStruct, fChand:+(fStruct+0.05).toFixed(5),
});
const hpTouches = { p: [ T('M_1_up|','M_1',180,0.30), T('M_1.5_up|','M_1.5',60,0.50), T('M_2_up|','M_2',120,0.40) ] };
const hpPol = { 'M_1_up|':{decision:'follow'}, 'M_1.5_up|':{decision:'follow'}, 'M_2_up|':{decision:'follow'} };
const held = runHeldPosition(hpTouches, { policy: hpPol, splitDate:'2022-01-01', costByPair:{ p:0.008 } });
const abSame = runExitAB(hpTouches, { policy: hpPol, splitDate:'2022-01-01', costByPair:{ p:0.008 } });
ok('held model collapses 3 follow touches → 1 trade', held.struct.trades === 1 && held.fixedHeld.trades === 1,
   `held struct=${held.struct.trades} fixedHeld=${held.fixedHeld.trades}`);
ok('per-touch A/B keeps all 3 (the over-count held fixes)', abSame.struct.trades === 3,
   `abSame struct=${abSame.struct.trades}`);
ok('held trades < per-touch trades (breadth deflated)', held.struct.trades < abSame.struct.trades);

console.log('[bad-level scan — IS-learned veto, OOS impact]');
// pair p1: cell A always loses (IS exp negative) → should be vetoed and dropped OOS.
// pair p2: cell B always wins → kept. minN small for the synthetic.
const blT = (cell, date, pnlSign) => ({ date, open:1.10, side:'up', name:cell.startsWith('A')?'A_x':'M_x', cell,
  level:1.10, innerLvl:1.097, outerLvl:1.103, reverted: pnlSign<0, decidedBy:'barrier', closePx: pnlSign>0?1.104:1.096 });
const mkSeq = (cell, sign, n, fromIS) => Array.from({length:n}, (_,i) => blT(cell, fromIS ? `2021-0${1+(i%9)}-01` : `2023-0${1+(i%9)}-01`, sign));
const blTouches = { p1: [...mkSeq('M_1_up|', -1, 8, true), ...mkSeq('M_1_up|', -1, 8, false)],   // loser, IS+OOS
                    p2: [...mkSeq('M_1_up|', +1, 8, true), ...mkSeq('M_1_up|', +1, 8, false)] }; // winner
const blPol = { 'M_1_up|': { decision: 'follow' } };
const bl = runBadLevelScan(blTouches, { policy: blPol, splitDate:'2022-01-01', costByPair:{ p1:0.0, p2:0.0 }, minN: 5 });
ok('bad-level scan returns cells + baseline/withVeto + worst list', bl && Array.isArray(bl.worstOOS) && bl.baseline && bl.withVeto,
   `nCells=${bl?.nCells} vetoed=${bl?.nVetoed}`);
ok('veto drops the IS-losing (pair×level) → fewer kept trades', bl.withVeto.trades < bl.baseline.trades,
   `base=${bl.baseline.trades} veto=${bl.withVeto.trades}`);
ok('veto keeps the winning pair, removes the loser', bl.nVetoed >= 1);

console.log('[held — chandelier now runs on FADE via the fade-direction trail]');
const fadeT = { date:'2023-05-01', open:1.10, side:'up', name:'M_2', cell:'M_2_up|',
  level:1.11, innerLvl:1.107, outerLvl:1.113, reverted:true, decidedBy:'barrier', closePx:1.104,
  fillTime:10, fStruct:0.20, fChand:0.25, fStructFade:0.35, fChandFade:0.40 };
const fadeHeld = runHeldPosition({ p:[fadeT] }, { policy:{ 'M_2_up|':{decision:'fade'} },
  splitDate:'2023-01-01', costByPair:{ p:0.01 }, slipByPair:{ p:0.005 } });
// chand fade → fChandFade - (cost+slip) = 0.40 - 0.015 = 0.385
ok('held chandelier prices a FADE with fChandFade (0.40 - 0.015 = 0.385)',
   Math.abs(fadeHeld.chand.expectancy - 0.385) < 0.01, `exp=${fadeHeld.chand?.expectancy}`);
ok('held fixedHeld still uses the fixed barrier for fade', Number.isFinite(fadeHeld.fixedHeld.expectancy));

console.log('[zone-walk — policy as exit oracle, known-answer path]');
// Monday ladder, mid=fib0.5. Enter FOLLOW at M_1 (1.10, up); hold through M_1.5
// (follow, up); CLOSE at M_2 which is FADE (above mid → expects down = reversal).
// gross = (1.11-1.10)/1.10*100 = 0.9091%. Then re-enter at M_2.5 (follow up) and
// mark to close 1.108 → loss. So 2 trades.
const zt = (name, level, ft) => ({ date:'2023-04-01', open:1.10, name, cell:`${name}_up|`,
  level, fillTime: ft, closePx: 1.108 });
const zTouches = { p: [ zt('M_1',1.10,10), zt('M_1.5',1.105,20), zt('M_2',1.11,30), zt('M_2.5',1.115,40) ] };
const zPol = { 'M_1_up|':{decision:'follow'}, 'M_1.5_up|':{decision:'follow'},
               'M_2_up|':{decision:'fade'},   'M_2.5_up|':{decision:'follow'} };
const zw = runZoneWalk(zTouches, { policy: zPol, splitDate:'2023-01-01', costByPair:{ p:0 }, slipByPair:{ p:0 } });
ok('zone-walk: follow rides M_1→M_2, closes at the fade zone (+0.909%)',
   zw && zw.trades === 2, `trades=${zw?.trades}`);
// trade1 = (1.11-1.10)/1.10*100 = +0.909%; trade2 (re-entry M_2.5→close) = -0.636%; mean ≈ +0.136%.
ok('zone-walk mean ≈ +0.136% (runner +0.909, re-entry loss -0.636)', Math.abs(zw.expectancy - 0.1364) < 0.01, `exp=${zw.expectancy}`);
ok('zone-walk carries cost-stress', Array.isArray(zw.costStress) && zw.costStress.length === 3);

console.log('[E-ratio exit study]');
const erTouches = { eurusd: touchesForPair(packed, 'fx', { sources: ['asia','monday'], conditions: [], minLookback: 20, asiaHrs: 0.5 }) };
const er = eRatioByCell(erTouches, book.policy);
ok('eRatioByCell returns overall + per-cell rows', er && Array.isArray(er.cells),
   `overall=${er.overall} cells=${er.cells?.length} n=${er.n}`);
ok('E-ratio cells have MFE/MAE/eRatio + decision', er.cells.every(c =>
   Number.isFinite(c.mfe) && Number.isFinite(c.mae) && (c.eRatio == null || Number.isFinite(c.eRatio)) &&
   (c.decision === 'fade' || c.decision === 'follow')));

console.log('\n[naked-levels confluence source — untested prior H/L add a distinct source]');
{
  // Daily bars oldest→newest. d0 SPIKE high 1.30 is never revisited (d1/d2 stay
  // below) → naked. d0 low 1.20 and d1 high 1.25 ARE traded through by a later
  // session → filled (not naked). Most-recent session's own extremes are naked.
  const dailyBars = [
    { date: '2024-01-01', time: Date.UTC(2024, 0, 1) / 1000, open: 1.22, high: 1.30, low: 1.20, close: 1.24 },
    { date: '2024-01-02', time: Date.UTC(2024, 0, 2) / 1000, open: 1.24, high: 1.25, low: 1.19, close: 1.23 },
    { date: '2024-01-03', time: Date.UTC(2024, 0, 3) / 1000, open: 1.23, high: 1.26, low: 1.18, close: 1.22 },
  ];
  const rank = { '1·none': 0, '2·single': 1, '3·multi': 2 };
  const src = ['prior_hilo'];
  const base = sessionConfluenceLevels({ dailyBars, intraday: [], pip: 0.0001, price: 1.22, sources: src, fib15: false });
  const withNaked = sessionConfluenceLevels({ dailyBars, intraday: [], pip: 0.0001, price: 1.22, sources: src, fib15: false, naked: true, nakedLookback: 30 });
  const nk = withNaked.filter(l => l.source === 'naked_hilo').map(l => +l.price.toFixed(4)).sort((a, b) => a - b);
  ok('naked=false emits no naked_hilo', base.every(l => l.source !== 'naked_hilo'));
  ok('naked=true adds naked_hilo levels', nk.length > 0, `naked=${JSON.stringify(nk)}`);
  ok('untested spike high 1.30 is naked; filled 1.25/1.20 are NOT',
     nk.includes(1.30) && !nk.includes(1.25) && !nk.includes(1.20), `naked=${JSON.stringify(nk)}`);
  // A range level on the untested 1.30 gains the extra distinct source → bucket rank rises.
  const tol = 0.1 * 0.02;
  ok('naked lifts the untested-high level by ≥1 bucket',
     rank[confluenceBucketAt(1.30, withNaked, tol)] > rank[confluenceBucketAt(1.30, base, tol)],
     `base=${confluenceBucketAt(1.30, base, tol)} naked=${confluenceBucketAt(1.30, withNaked, tol)}`);
}

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
