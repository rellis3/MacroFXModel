// Telegram-v2 confidence engine — synthetic unit tests (no network).
//   node js/telegramV2.test.mjs
// Proves: (1) the confidence decision maps expectancy→grade correctly and skips
// unseen/low cells; (2) the LIVE cell key gradeLevelV2 builds equals the OFFLINE
// cell key perLineStrategy.extractTouches builds for the same ladder/touch (the
// live↔backtest parity that is the whole point); (3) direction/SL/TP geometry
// matches perLineStrategy.pnlFor; (4) the formatter + freeze helpers behave.

import { cellKey, directionFor, exitsFor, decide } from './levelConfidenceCore.js';
import { gradeLevelV2 } from './gradeLevelV2.js';
import { formatV2Entry } from './alertFormatterV2.js';
import { freezePolicy, isUsablePolicy } from './levelsV2Learn.js';
import { extractTouches } from './perLineStrategy.js';
import { buildRangeLadder } from './rangeLineAnalyser.js';
import { recordEntries, resolvePair, ledgerStats, refitFromLedger } from './entryLedgerV2.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const approx = (a, b, t = 1e-6) => Math.abs(a - b) <= t;

// ── 1. cellKey / directionFor / exitsFor ─────────────────────────────────────
console.log('[helpers]');
ok('cellKey format', cellKey({ name: 'A_1.5', side: 'up', condKey: 'spike' }) === 'A_1.5_up|spike');
ok('fade dn → long',  directionFor('fade', 'dn') === 'long');
ok('fade up → short', directionFor('fade', 'up') === 'short');
ok('follow up → long',  directionFor('follow', 'up') === 'long');
ok('follow dn → short', directionFor('follow', 'dn') === 'short');
{
  const e = exitsFor('fade', { level: 100, inner: 98, outer: 103 });
  ok('fade TP=inner SL=outer', e.tp === 98 && e.sl === 103);
  ok('fade rr = 2/3', approx(e.rr, +(2 / 3).toFixed(2)));
  const f = exitsFor('follow', { level: 100, inner: 98, outer: 103 });
  ok('follow TP=outer SL=inner', f.tp === 103 && f.sl === 98);
}

// ── 2. decide() grade banding + skips ────────────────────────────────────────
console.log('[decide]');
const baseTouch = { name: 'A_1.5', side: 'dn', condKey: 'spike', level: 100, inner: 96, outer: 102 };
// fade dn: TP=inner=96 (dist 4), SL=outer=102 (dist 2) → rr=2.0 → A+ eligible
ok('A+ on high edge + n + rr', decide(baseTouch,
  { 'A_1.5_dn|spike': { decision: 'fade', n: 80, expectancy: 0.20, revRate: 70 } }).grade === 'A+');
ok('A on mid edge', decide(baseTouch,
  { 'A_1.5_dn|spike': { decision: 'fade', n: 40, expectancy: 0.10, revRate: 60 } }).grade === 'A');
ok('B on low edge', decide(baseTouch,
  { 'A_1.5_dn|spike': { decision: 'fade', n: 40, expectancy: 0.04, revRate: 55 } }).grade === 'B');
ok('C on marginal edge', decide(baseTouch,
  { 'A_1.5_dn|spike': { decision: 'fade', n: 40, expectancy: 0.01, revRate: 52 } }).grade === 'C');
ok('skip when unseen', decide(baseTouch, {}).action === 'skip');
ok('skip when policy skips', decide(baseTouch,
  { 'A_1.5_dn|spike': { decision: 'skip', n: 5, reason: 'lowN' } }).grade === 'SKIP');
{
  // rr gate: high expectancy but rr<1 (inner far past, outer near) → demote from A+
  const poorRR = { name: 'A_1', side: 'dn', condKey: 'spike', level: 100, inner: 90, outer: 105 };
  // fade: TP=inner=90 (dist 10), SL=outer=105 (dist 5) → rr=2.0 (good). Flip to follow-poor:
  const followPoor = { name: 'A_1', side: 'up', condKey: 'spike', level: 100, inner: 99, outer: 101 };
  // follow up: TP=outer=101 (dist1), SL=inner=99 (dist1) rr=1 — fine. Construct genuine rr<1:
  const rrUnder1 = { name: 'A_1', side: 'dn', condKey: 'spike', level: 100, inner: 101, outer: 90 };
  // fade dn: TP=inner=101 (dist1), SL=outer=90 (dist10) → rr=0.1 → demote to B
  const d = decide(rrUnder1, { 'A_1_dn|spike': { decision: 'fade', n: 80, expectancy: 0.30, revRate: 75 } });
  ok('rr<floor demotes to B', d.grade === 'B' && d.warnings.some(w => w.includes('below floor')));
  void poorRR; void followPoor;
}
{
  // Fix #1: A+ must be reachable at rr≈1.0 (equidistant ladder neighbours).
  const rrOne = { name: 'A_1.5', side: 'dn', condKey: 'spike', level: 100, inner: 98, outer: 102 };
  const d = decide(rrOne, { 'A_1.5_dn|spike': { decision: 'fade', n: 80, expectancy: 0.20, revRate: 70 } });
  ok('A+ reachable at rr=1.0', d.rr === 1 && d.grade === 'A+');
}
{
  const d = decide(baseTouch, { 'A_1.5_dn|spike': { decision: 'fade', n: 80, expectancy: 0.20, revRate: 70 } });
  ok('direction fade dn → long', d.direction === 'long');
  ok('TP=inner SL=outer', d.tp === 96 && d.sl === 102);
  ok('verdict TAKE for A+', d.verdict === 'TAKE');
}

// ── 3. LIVE↔OFFLINE cell parity (the point) ──────────────────────────────────
console.log('[live↔offline cell parity]');
{
  // Build a synthetic Asia ladder off low=100 range=10 → grid at 100 + 10×{...,1,1.5,2,...}.
  const low = 100, range = 10, srcTag = 'A';
  const grid = buildRangeLadder(low, range, srcTag);
  const mid = low + range / 2;                     // 105
  // Pick an interior up-line and its neighbours, mimic an offline record for it.
  const target = grid.find(g => g.level > mid + range * 0.4);   // some up line
  const prices = grid.map(g => g.level);
  let belowP = null, aboveP = null;
  for (const p of prices) { if (p < target.level - 1e-12) belowP = p; else if (p > target.level + 1e-12 && aboveP == null) aboveP = p; }
  const offlineRecord = {
    date: '2024-01-02', open: 104, realized: { close: 104 },
    lines: [{ name: target.label, side: 'up', level: target.level,
              innerLvl: belowP, outerLvl: aboveP, decidedBy: 'barrier',
              firstTouchTime: 1, outcome: 'reverted', approachVel: 'spike' }],
  };
  const offlineCell = extractTouches([offlineRecord], { conditions: ['approachVel'] })[0]?.cell;

  // LIVE: a fake touchFeatures that always buckets approachVel='spike', and bars
  // with the last bar sitting at the target level.
  const tf = {
    wtSeries: () => null,
    compute: () => ({ approachVel: { bucket: 'spike' } }),
  };
  const bars = [
    { time: 0, open: 104, high: 104.2, low: 103.8, close: 104 },
    { time: 60, open: 104, high: target.level + 0.01, low: 103.9, close: target.level },
  ];
  const out = gradeLevelV2({
    ladders: [{ srcTag, low, high: low + range }],
    bars, open: 104, sigma: 1, pip: 0.0001, price: target.level, proxDist: 1,
    tf, policy: { [offlineCell]: { decision: 'fade', n: 80, expectancy: 0.2, revRate: 70 } },
  });
  ok('offline cell built', !!offlineCell, offlineCell);
  ok('live produced an entry for that cell', out.length === 1 && out[0].cell === offlineCell,
     `live=${out[0]?.cell} offline=${offlineCell}`);
  ok('live entry carries grade + geometry',
     out[0] && out[0].grade !== 'SKIP' && out[0].tp != null && out[0].sl != null && out[0].direction === 'short',
     `grade=${out[0]?.grade} dir=${out[0]?.direction}`);
}

// ── 4. formatter + freeze ────────────────────────────────────────────────────
console.log('[formatter + freeze]');
{
  const entry = { price: 1.2345, direction: 'long', grade: 'A+', verdict: 'TAKE',
    expectancy: 0.2, n: 80, revRate: 70, rrRatio: 2.0, sl: 1.2300, tp: 1.2400,
    decision: 'fade', cell: 'A_1.5_dn|spike', confidence: 0.8, tags: ['Asia Fib 1.5', 'fade'], warnings: [] };
  const msg = formatV2Entry('EUR/USD', entry, { currentPrice: 1.2350, digits: 4, distPips: 5 });
  ok('msg has BUY + grade', msg.includes('BUY') && msg.includes('[A+]'));
  ok('msg leads with edge', msg.includes('+0.200%') && msg.includes('n=80'));
  ok('msg shows SL/TP/RR', msg.includes('SL 1.2300') && msg.includes('TP 1.2400') && msg.includes('1:2'));
}
{
  const book = { policy: { 'A_1.5_dn|spike': { decision: 'fade', n: 80, expectancy: 0.2 } },
                 splitDate: '2023-06-01', coverage: { fadeCells: 1, followCells: 0, skipCells: 0 } };
  const f = freezePolicy(book, { conditions: ['approachVel'], sources: ['asia', 'monday'], minN: 50 }, '2024-01-01T00:00:00Z');
  ok('freeze carries policy + meta', f.version === 2 && f.nCells === 1 && f.builtAt === '2024-01-01T00:00:00Z');
  ok('isUsablePolicy true', isUsablePolicy(f) === true);
  ok('isUsablePolicy false on empty', isUsablePolicy({ policy: {} }) === false);
}

// ── 5. entryLedgerV2 (daily-learning loop) ───────────────────────────────────
console.log('[entryLedgerV2]');
{
  const mk = (cell, price, dir, sl, tp, grade) => ({ cell, price, direction: dir, decision: 'fade', grade, expectancy: 0.2, n: 80, sl, tp });
  const t0 = 1_000_000_000_000;
  // record + dedup
  let L = recordEntries([], 'EUR/USD', [mk('A_1.5_dn|spike', 1.10, 'long', 1.09, 1.11, 'A+')], t0);
  ok('records a signal', L.length === 1);
  L = recordEntries(L, 'EUR/USD', [mk('A_1.5_dn|spike', 1.10, 'long', 1.09, 1.11, 'A+')], t0 + 1000);
  ok('dedups standing level', L.length === 1);
  L = recordEntries(L, 'EUR/USD', [mk('A_1_up|grind', 1.12, 'short', 1.13, 1.11, 'B')], t0 + 2000);
  ok('records a second distinct cell', L.length === 2);

  // resolve: long@1.10 fills then TP@1.11 → win
  const bars = [
    { time: (t0/1000) + 60, open: 1.105, high: 1.106, low: 1.099, close: 1.10 },  // touches 1.10 → fill
    { time: (t0/1000) + 120, open: 1.10, high: 1.111, low: 1.10, close: 1.111 },  // hits TP 1.11
  ];
  const now = t0 + 10 * 60_000;
  let R = resolvePair(L, 'EUR/USD', bars, now);
  const longRec = R.find(r => r.cell === 'A_1.5_dn|spike');
  ok('long fills + wins at TP', longRec.outcome === 'win' && longRec.realizedPct > 0, `outcome=${longRec.outcome}`);

  // short@1.12 fills then SL@1.13 → loss
  const bars2 = [
    { time: (t0/1000) + 60, open: 1.121, high: 1.121, low: 1.119, close: 1.12 }, // touches 1.12 → fill
    { time: (t0/1000) + 120, open: 1.12, high: 1.131, low: 1.12, close: 1.13 },  // hits SL 1.13
  ];
  R = resolvePair(R, 'EUR/USD', bars2, now);
  const shortRec = R.find(r => r.cell === 'A_1_up|grind');
  ok('short fills + loses at SL', shortRec.outcome === 'loss' && shortRec.realizedPct < 0, `outcome=${shortRec.outcome}`);

  // never-touched → expired after maxAge
  let E = recordEntries([], 'GBP/USD', [mk('A_2_dn|spike', 1.30, 'long', 1.29, 1.31, 'A')], t0);
  E = resolvePair(E, 'GBP/USD', [{ time: (t0/1000) + 60, open: 1.32, high: 1.33, low: 1.315, close: 1.32 }], t0 + 4 * 86400_000);
  ok('untouched expires', E[0].outcome === 'expired');

  // stats + refit
  const st = ledgerStats(R);
  ok('stats count decided', st.decided === 2 && st.byGrade['A+']?.wins === 1 && st.byGrade['B']?.losses === 1);
  const many = [];
  for (let i = 0; i < 30; i++) many.push({ cell: 'A_1.5_dn|spike', outcome: i % 3 === 0 ? 'loss' : 'win', realizedPct: i % 3 === 0 ? -0.1 : 0.2, decision: 'fade' });
  const cand = refitFromLedger(many, { minN: 30 });
  ok('refit produces a candidate cell', cand['A_1.5_dn|spike']?.n === 30 && cand['A_1.5_dn|spike'].source === 'ledger-realized');
}

console.log(`\n${failures === 0 ? '✅ all passed' : `❌ ${failures} failed`}`);
process.exit(failures === 0 ? 0 : 1);
