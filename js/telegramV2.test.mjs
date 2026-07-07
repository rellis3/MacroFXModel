// Telegram-v2 confidence engine — synthetic unit tests (no network).
//   node js/telegramV2.test.mjs
// Proves: (1) the confidence decision maps expectancy→grade correctly and skips
// unseen/low cells; (2) the LIVE cell key gradeLevelV2 builds equals the OFFLINE
// cell key perLineStrategy.extractTouches builds for the same ladder/touch (the
// live↔backtest parity that is the whole point); (3) direction/SL + chandelier-
// trail geometry matches perLineStrategy.pnlHeld (RANGE_EXTENSION_GUIDE.md §13 —
// no fixed TP); (4) buildPolicy's pricer is pluggable (pnlFor vs pnlHeld) and
// learnAndFreeze/freezePolicy/flattenPolicy build the PER-INSTRUMENT artifact
// (§15 — no cross-pair pooling); (5) the formatter + ledger trailing-stop walk
// behave.

import { cellKey, directionFor, exitsFor, decide } from './levelConfidenceCore.js';
import { gradeLevelV2 } from './gradeLevelV2.js';
import { formatV2Entry } from './alertFormatterV2.js';
import { freezePolicy, isUsablePolicy, deriveBands, flattenPolicy, learnAndFreeze } from './levelsV2Learn.js';
import { extractTouches, buildPolicy, pnlFor, pnlHeld } from './perLineStrategy.js';
import { buildRangeLadder } from './rangeLineAnalyser.js';
import { recordEntries, resolvePair, ledgerStats, refitFromLedger } from './entryLedgerV2.js';
import { selectAlerts, alertKey, pruneCooldowns, GRADE_RANK } from './alertV2Core.js';
import { countWithin, confluenceBucket } from './confluenceCount.js';
import { mergeConfluence } from './confluenceTest.js';
import { swingFibLevels, LEVEL_SOURCES } from './levelSources.js';

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
  ok('fade SL=outer', e.sl === 103);
  ok('fade rung = |outer-level|', e.rung === 3);
  const f = exitsFor('follow', { level: 100, inner: 98, outer: 103 });
  ok('follow SL=inner', f.sl === 98);
  ok('follow rung = |outer-level|', f.rung === 3);
}

// ── 2. decide() grade banding + skips ────────────────────────────────────────
console.log('[decide]');
const baseTouch = { name: 'A_1.5', side: 'dn', condKey: 'spike', level: 100, inner: 96, outer: 102 };
ok('A+ on high edge + n', decide(baseTouch,
  { 'A_1.5_dn|spike': { decision: 'fade', n: 80, expectancy: 0.20, winRate: 70 } }).grade === 'A+');
ok('A on mid edge', decide(baseTouch,
  { 'A_1.5_dn|spike': { decision: 'fade', n: 40, expectancy: 0.10, winRate: 60 } }).grade === 'A');
ok('B on low edge', decide(baseTouch,
  { 'A_1.5_dn|spike': { decision: 'fade', n: 40, expectancy: 0.04, winRate: 55 } }).grade === 'B');
ok('C on marginal edge', decide(baseTouch,
  { 'A_1.5_dn|spike': { decision: 'fade', n: 40, expectancy: 0.01, winRate: 52 } }).grade === 'C');
ok('skip when unseen', decide(baseTouch, {}).action === 'skip');
ok('skip when policy skips', decide(baseTouch,
  { 'A_1.5_dn|spike': { decision: 'skip', n: 5, reason: 'lowN' } }).grade === 'SKIP');
{
  // No rr-floor demotion any more (removed — expectancy is now priced directly off
  // the realized chandelier PnL, so a poor payoff already shows up as low/negative
  // expectancy). A+ must be reachable regardless of the inner/outer geometry.
  const anyGeom = { name: 'A_1', side: 'dn', condKey: 'spike', level: 100, inner: 101, outer: 90 };
  const d = decide(anyGeom, { 'A_1_dn|spike': { decision: 'fade', n: 80, expectancy: 0.30, winRate: 75 } });
  ok('A+ reachable regardless of geometry', d.grade === 'A+' && d.warnings.length === 0);
}
{
  const d = decide(baseTouch, { 'A_1.5_dn|spike': { decision: 'fade', n: 80, expectancy: 0.20, winRate: 70 } });
  ok('direction fade dn → long', d.direction === 'long');
  ok('SL=outer, rung set, no fixed tp/rr', d.sl === 102 && d.rung === 2 && d.tp === undefined && d.rr === undefined);
  ok('exit is chandelier', d.exit === 'chandelier' && d.trailFrac === 0.5);
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
    tf, condFields: ['approachVel'], policy: { [offlineCell]: { decision: 'fade', n: 80, expectancy: 0.2, winRate: 70 } },
  });
  ok('offline cell built', !!offlineCell, offlineCell);
  ok('live produced an entry for that cell', out.length === 1 && out[0].cell === offlineCell,
     `live=${out[0]?.cell} offline=${offlineCell}`);
  ok('live entry carries grade + trail geometry (no fixed tp)',
     out[0] && out[0].grade !== 'SKIP' && out[0].rung != null && out[0].sl != null && out[0].tp === undefined && out[0].direction === 'short',
     `grade=${out[0]?.grade} dir=${out[0]?.direction}`);
}

// ── 3b. Default (§14) NO-CONDITION parity — condFields=[] matches conditions:[] ─
console.log('[live↔offline parity, no condition]');
{
  const low = 100, range = 10, srcTag = 'M';
  const grid = buildRangeLadder(low, range, srcTag);
  const mid = low + range / 2;
  const target = grid.find(g => g.fibL === -1);   // a safely-interior dn line (has neighbours both sides)
  const prices = grid.map(g => g.level);
  let belowP = null, aboveP = null;
  for (const p of prices) { if (p < target.level - 1e-12) belowP = p; else if (p > target.level + 1e-12 && aboveP == null) aboveP = p; }
  const offlineRecord = {
    date: '2024-01-02', open: 104, realized: { close: 104 },
    lines: [{ name: target.label, side: 'dn', level: target.level,
              innerLvl: belowP, outerLvl: aboveP, decidedBy: 'barrier', firstTouchTime: 1, outcome: 'continued' }],
  };
  const offlineCell = extractTouches([offlineRecord], { conditions: [] })[0]?.cell;
  ok('no-condition offline cell has empty condKey', offlineCell?.endsWith('|'), offlineCell);

  const bars = [
    { time: 0, open: 104, high: 104.2, low: 103.8, close: 104 },
    { time: 60, open: 104, high: 104.1, low: target.level - 0.01, close: target.level },
  ];
  const out = gradeLevelV2({
    ladders: [{ srcTag, low, high: low + range }],
    bars, open: 104, sigma: 1, pip: 0.0001, price: target.level, proxDist: 1,
    policy: { [offlineCell]: { decision: 'follow', n: 60, expectancy: 0.09, winRate: 45 } },   // no tf, no condFields → default []
  });
  ok('live (no tf/condFields) still matches the no-condition offline cell',
     out.length === 1 && out[0].cell === offlineCell, `live=${out[0]?.cell} offline=${offlineCell}`);
}

// ── 4. formatter + freeze ────────────────────────────────────────────────────
console.log('[formatter + freeze]');
{
  const entry = { price: 1.2345, direction: 'long', grade: 'A+', verdict: 'TAKE',
    expectancy: 0.2, n: 80, winRate: 70, sl: 1.2300, rung: 0.005, trailFrac: 0.5,
    decision: 'fade', cell: 'A_1.5_dn|', confidence: 0.8, tags: ['Asia Fib 1.5', 'fade'], warnings: [] };
  const msg = formatV2Entry('EUR/USD', entry, { currentPrice: 1.2350, digits: 4, distPips: 5 });
  ok('msg has BUY + grade', msg.includes('BUY') && msg.includes('[A+]'));
  ok('msg leads with edge', msg.includes('+0.200%') && msg.includes('n=80') && msg.includes('70% win'));
  ok('msg shows initial SL + trail, no fixed TP', msg.includes('Initial SL 1.2300') && msg.includes('trail 50% of a rung') && !msg.includes('TP '));
}
{
  const perInstrument = { eurusd: { policy: { 'A_1.5_dn|': { decision: 'fade', n: 80, expectancy: 0.2 } },
                                     splitDate: '2023-06-01', assetClass: 'fx' } };
  const f = freezePolicy(perInstrument, { conditions: [], sources: ['asia', 'monday'], minN: 50 }, '2024-01-01T00:00:00Z');
  ok('freeze carries per-instrument policy + meta', f.version === 3 && f.nCells === 1 && f.builtAt === '2024-01-01T00:00:00Z');
  ok('freeze coverage rolls up', f.coverage.fadeCells === 1 && f.coverage.followCells === 0);
  ok('isUsablePolicy true', isUsablePolicy(f) === true);
  ok('isUsablePolicy false on empty', isUsablePolicy({ perInstrument: {} }) === false);
  const flat = flattenPolicy(perInstrument);
  ok('flattenPolicy prefixes by instrument', flat['eurusd::A_1.5_dn|']?.decision === 'fade');
}
{
  // deriveBands: bands fit the policy's own scale; A+ reachable for the top cells.
  const pol = {};
  const exps = [0.051, 0.075, 0.080, 0.087, 0.089, 0.04, 0.06, 0.07];
  exps.forEach((e, i) => { pol[`A_${i}_dn|spike`] = { decision: 'fade', n: 60, expectancy: e, revRate: 60 }; });
  const b = deriveBands(pol);
  ok('bands ordered + fit scale', b && b.eB < b.eA && b.eA < b.eAplus && b.eAplus <= 0.089,
     `eB=${b?.eB} eA=${b?.eA} eA+=${b?.eAplus}`);
  // The best cell (0.089) should clear A+ under its own bands (n≥nFull).
  const top = decide({ name: 'A_4', side: 'dn', condKey: 'spike', level: 100, inner: 98, outer: 102 },
    { 'A_4_dn|spike': { decision: 'fade', n: 60, expectancy: 0.089, revRate: 70 } }, { bands: b });
  ok('top cell grades A+ under fitted bands', top.grade === 'A+', `grade=${top.grade}`);
  ok('deriveBands null on tiny policy', deriveBands({ a: { decision: 'fade', expectancy: 0.05 } }) === null);
  // Regression: a SMALL-edge policy (all sub-0.02%) must still spread across grades
  // — the old absolute 0.02 floor pushed every band above the data → everything C.
  const small = {};
  [0.002, 0.005, 0.008, 0.011, 0.014, 0.017, 0.019, 0.020].forEach((e, i) => { small[`A_${i}_dn|spike`] = { decision: 'fade', n: 60, expectancy: e, revRate: 60 }; });
  const sb = deriveBands(small);
  ok('small-edge bands fit the small scale', sb && sb.eB < 0.02 && sb.eB < sb.eA && sb.eA < sb.eAplus, `eB=${sb?.eB} eA=${sb?.eA} eA+=${sb?.eAplus}`);
  // top small cell (0.020) now reaches A+ instead of collapsing to C
  const topSmall = decide({ name: 'A_7', side: 'dn', condKey: 'spike', level: 100, inner: 98, outer: 102 },
    { 'A_7_dn|spike': { decision: 'fade', n: 60, expectancy: 0.020, revRate: 70 } }, { bands: sb });
  ok('top small-edge cell no longer stuck at C', topSmall.grade === 'A+' || topSmall.grade === 'A', `grade=${topSmall.grade}`);
}

// ── 4b. pnlHeld / buildPolicy(pricer) / learnAndFreeze (§12/§13/§15) ─────────
console.log('[held-chandelier pricer + per-instrument learn]');
{
  // pnlHeld reads fChand (follow) / fChandFade (fade), nets the same cost pnlFor does.
  const t = { fChand: 0.10, fChandFade: 0.05 };
  ok('pnlHeld follow uses fChand net of cost', approx(pnlHeld(t, 'follow', { costPct: 0.012, slipPct: 0.006 }), 0.10 - 0.018));
  ok('pnlHeld fade uses fChandFade net of cost (no slip)', approx(pnlHeld(t, 'fade', { costPct: 0.012, slipPct: 0.006 }), 0.05 - 0.012));
  ok('pnlHeld null when trail fields missing', pnlHeld({}, 'fade', {}) === null);
}
{
  // buildPolicy's pricer is pluggable — same touches, different exit model, can
  // pick a DIFFERENT winning decision (this is the whole §12 finding: the fixed
  // barrier and the chandelier trail don't have to agree on fade vs follow).
  const mkTouch = (date, reverted, fChand, fChandFade) => ({
    date, cell: 'A_1_dn|', reverted,
    level: 100, innerLvl: 102, outerLvl: 98, decidedBy: 'barrier', closePx: 100, open: 100,
    fChand, fChandFade, cost: 0.01, slip: 0.005,
  });
  // Alternating reverted/continued nets the FIXED barrier to ~0 (minus cost) →
  // skip; but the trail fields are consistently a strong fade → the chandelier
  // pricer finds a real edge the fixed barrier misses entirely (the §12 point:
  // the two exit models can disagree on whether there's ANY edge, not just which
  // side of it).
  const touches = [];
  for (let i = 0; i < 60; i++) touches.push(mkTouch(`2024-01-${String((i % 28) + 1).padStart(2, '0')}`, i % 2 === 0, -0.30, 0.20));
  const fixedPolicy = buildPolicy(touches, { minN: 50, pricer: pnlFor });
  const heldPolicy  = buildPolicy(touches, { minN: 50, pricer: pnlHeld });
  ok('fixed-barrier pricer finds no edge here (alternating win/loss nets ~0)', fixedPolicy['A_1_dn|'].decision === 'skip');
  ok('held-chandelier pricer finds the consistent fade edge the barrier misses',
     heldPolicy['A_1_dn|'].decision === 'fade' && heldPolicy['A_1_dn|'].expectancy > 0);
  ok('held policy exposes winRate (decision-aware)', heldPolicy['A_1_dn|'].winRate === 100);
}
{
  // learnAndFreeze: per-instrument, no pooling — one instrument's touches never
  // leak into another's policy, unlike the old cross-pair pooled book.
  // 100 touches spread over ~90 days so the 60% IS split alone clears minN=50.
  const eurusdTouches = [];
  for (let i = 0; i < 100; i++) {
    const d = new Date(Date.UTC(2024, 0, 1 + i));
    eurusdTouches.push({
      date: d.toISOString().slice(0, 10), cell: 'A_1_dn|',
      reverted: true, level: 100, innerLvl: 102, outerLvl: 98, decidedBy: 'barrier', closePx: 100, open: 100,
      fChand: -0.30, fChandFade: 0.20,
    });
  }
  const getTouches = async (pair) => (pair === 'eurusd' ? eurusdTouches : []);   // gbpusd has none
  const { frozen, perInstrument } = await learnAndFreeze(['eurusd', 'gbpusd'], getTouches, { minN: 50, splitFrac: 0.6 }, '2024-06-01T00:00:00Z');
  ok('only the instrument with tradeable touches survives', Object.keys(perInstrument).length === 1 && !!perInstrument.eurusd);
  ok('frozen is per-instrument (not pooled)', frozen.perInstrument.eurusd.policy['A_1_dn|'].decision === 'fade' && frozen.perInstrument.gbpusd === undefined);
  ok('frozen version bumped to 3', frozen.version === 3 && frozen.conditions.length === 0);
}

// ── 5. entryLedgerV2 (daily-learning loop) ───────────────────────────────────
console.log('[entryLedgerV2]');
{
  // sl = initial protective stop (one rung away, same as before); rung/trailFrac
  // drive the chandelier walk — no more fixed tp.
  const mk = (cell, price, dir, sl, rung, grade) => ({ cell, price, direction: dir, decision: 'fade', grade, expectancy: 0.2, n: 80, sl, rung, trailFrac: 0.5 });
  const t0 = 1_000_000_000_000;
  // record + dedup
  let L = recordEntries([], 'EUR/USD', [mk('A_1.5_dn|', 1.10, 'long', 1.095, 0.005, 'A+')], t0);
  ok('records a signal', L.length === 1);
  L = recordEntries(L, 'EUR/USD', [mk('A_1.5_dn|', 1.10, 'long', 1.095, 0.005, 'A+')], t0 + 1000);
  ok('dedups standing level', L.length === 1);
  L = recordEntries(L, 'EUR/USD', [mk('A_1_up|', 1.12, 'short', 1.13, 0.01, 'B')], t0 + 2000);
  ok('records a second distinct cell', L.length === 2);

  // resolve: long@1.10 fills, trails up favourably, then the chandelier stop is
  // hit ABOVE entry → a win (not a fixed TP — the trail captured a runner).
  const bars = [
    { time: (t0/1000) + 60,  open: 1.100, high: 1.101, low: 1.099, close: 1.100 },  // touches 1.10 → fill
    { time: (t0/1000) + 120, open: 1.100, high: 1.108, low: 1.100, close: 1.108 },  // peak 1.108
    { time: (t0/1000) + 180, open: 1.108, high: 1.108, low: 1.104, close: 1.105 },  // pulls back, trail stops it out (still above entry)
  ];
  const now = t0 + 10 * 60_000;
  let R = resolvePair(L, 'EUR/USD', bars, now);
  const longRec = R.find(r => r.cell === 'A_1.5_dn|');
  ok('long fills + trails to a win above entry', longRec.outcome === 'win' && longRec.realizedPct > 0, `outcome=${longRec.outcome} pct=${longRec.realizedPct}`);

  // short@1.12 fills then price runs straight through the initial stop → loss
  // (no favourable excursion first, so the trail never tightens).
  const bars2 = [
    { time: (t0/1000) + 60,  open: 1.121, high: 1.121, low: 1.119, close: 1.120 }, // touches 1.12 → fill
    { time: (t0/1000) + 120, open: 1.120, high: 1.135, low: 1.120, close: 1.130 }, // runs straight up through the stop
  ];
  R = resolvePair(R, 'EUR/USD', bars2, now);
  const shortRec = R.find(r => r.cell === 'A_1_up|');
  ok('short fills + stopped at initial risk → loss', shortRec.outcome === 'loss' && shortRec.realizedPct < 0, `outcome=${shortRec.outcome}`);

  // never-touched → expired after maxAge (unaffected by the trail geometry —
  // it never even fills).
  let E = recordEntries([], 'GBP/USD', [mk('A_2_dn|', 1.30, 'long', 1.295, 0.005, 'A')], t0);
  E = resolvePair(E, 'GBP/USD', [{ time: (t0/1000) + 60, open: 1.32, high: 1.33, low: 1.315, close: 1.32 }], t0 + 4 * 86400_000);
  ok('untouched expires', E[0].outcome === 'expired');

  // a record missing trail geometry (pre-chandelier ledger entry) can't be
  // resolved honestly — it just waits to expire rather than guessing.
  let G = [{ id: 'x', sym: 'AUD/USD', cell: 'A_1_dn|', price: 0.65, direction: 'long', recordedAt: t0, filledAt: null, resolvedAt: null, outcome: null, realizedPct: null }];
  G = resolvePair(G, 'AUD/USD', [{ time: (t0/1000) + 60, open: 0.651, high: 0.652, low: 0.649, close: 0.650 }], now);
  ok('missing rung/sl stays open (not resolved) before maxAge', G[0].outcome === null);

  // stats + refit
  const st = ledgerStats(R);
  ok('stats count decided', st.decided === 2 && st.byGrade['A+']?.wins === 1 && st.byGrade['B']?.losses === 1);
  const many = [];
  for (let i = 0; i < 30; i++) many.push({ cell: 'A_1.5_dn|', outcome: i % 3 === 0 ? 'loss' : 'win', realizedPct: i % 3 === 0 ? -0.1 : 0.2, decision: 'fade' });
  const cand = refitFromLedger(many, { minN: 30 });
  ok('refit produces a candidate cell', cand['A_1.5_dn|']?.n === 30 && cand['A_1.5_dn|'].source === 'ledger-realized');
}

// ── 6. alertV2Core (proximity + grade + cooldown selection) ──────────────────
console.log('[alertV2Core]');
{
  const sym = 'EUR/USD', pip = 0.0001, cur = 1.1000, now = 1_000_000_000_000;
  const entries = [
    { price: 1.1003, direction: 'short', grade: 'A',  cell: 'c1' },  // 3p away, A
    { price: 1.0997, direction: 'long',  grade: 'B',  cell: 'c2' },  // 3p away, B
    { price: 1.1050, direction: 'short', grade: 'A+', cell: 'c3' },  // 50p away, far
  ];
  const cfg = { enabled: true, minGrade: 'A', cooldownMin: 120, proxPips: { default: 10 }, pairs: [] };
  const r1 = selectAlerts({ sym, entries, currentPrice: cur, pip, cfg, cooldowns: {}, now });
  ok('fires near A, skips B + far', r1.alerts.length === 1 && r1.alerts[0].entry.cell === 'c1', `n=${r1.alerts.length}`);
  ok('cooldown stamped', r1.cooldowns[alertKey(sym, 1.1003, 'short')] === now);
  const r2 = selectAlerts({ sym, entries, currentPrice: cur, pip, cfg, cooldowns: r1.cooldowns, now: now + 60_000 });
  ok('cooldown suppresses re-alert', r2.alerts.length === 0);
  const r3 = selectAlerts({ sym, entries, currentPrice: cur, pip, cfg, cooldowns: r1.cooldowns, now: now + 121 * 60_000 });
  ok('re-alerts after cooldown', r3.alerts.length === 1);
  const off = selectAlerts({ sym, entries, currentPrice: cur, pip, cfg: { ...cfg, enabled: false }, cooldowns: {}, now });
  ok('disabled → nothing', off.alerts.length === 0);
  const filtered = selectAlerts({ sym, entries, currentPrice: cur, pip, cfg: { ...cfg, pairs: ['GBP/USD'] }, cooldowns: {}, now });
  ok('pair filter excludes', filtered.alerts.length === 0);
  const bGrade = selectAlerts({ sym, entries, currentPrice: cur, pip, cfg: { ...cfg, minGrade: 'B' }, cooldowns: {}, now });
  ok('minGrade B includes the B zone', bGrade.alerts.length === 2);
  ok('prune drops stale', Object.keys(pruneCooldowns({ old: now - 25 * 3600_000, fresh: now }, now)).length === 1);
  // GRADE_RANK exported + ordered (the alert-diag readout ranks zones by it)
  ok('GRADE_RANK ordered A+ > A > B > C > SKIP',
    GRADE_RANK['A+'] > GRADE_RANK.A && GRADE_RANK.A > GRADE_RANK.B && GRADE_RANK.B > GRADE_RANK.C && GRADE_RANK.C > GRADE_RANK.SKIP);
}

// ── 7. confluence helpers ────────────────────────────────────────────────────
console.log('[confluence]');
{
  ok('countWithin counts in-tol partners', countWithin(1.1000, [1.1001, 1.1004, 1.0980], 0.0005) === 2);
  ok('countWithin tol boundary inclusive', countWithin(1.1000, [1.1005], 0.0005) === 1);
  ok('countWithin ignores NaN/zero tol', countWithin(1.1, [NaN, 1.1], 0) === 0);
  ok('bucket solo/pair/triple', confluenceBucket(0) === '0·solo' && confluenceBucket(1) === '1·pair' && confluenceBucket(3) === '2·triple+');
  // mergeConfluence: pools raw cell accumulators (n / sumBounce / reverted / sumFade) across pairs
  const merged = mergeConfluence([
    { cells: { 'core(≤1) · plain(<2)': { n: 10, sumBounce: 1.0, reverted: 5, sumFade: 0.0 } } },
    { cells: { 'core(≤1) · plain(<2)': { n: 30, sumBounce: 6.0, reverted: 18, sumFade: 0.6 } } },
  ]);
  const cell = merged.find(b => b.key === 'core(≤1) · plain(<2)');
  ok('merge pools n', cell.n === 40);
  ok('merge means bounce', cell.bounce === +((1.0 + 6.0) / 40).toFixed(4));
  ok('merge reversion%', cell.revRate === +((5 + 18) / 40 * 100).toFixed(1));
  ok('merge fade edge', cell.fadeExp === +((0.0 + 0.6) / 40).toFixed(4));
  ok('row carries band+conf', cell.band === 'core(≤1)' && cell.conf === 'plain(<2)');
  // three-way split: a fib(cluster) cell pools + parses independently of plain/confluent
  const merged3 = mergeConfluence([
    { cells: { 'core(≤1) · fib(cluster)': { n: 20, sumBounce: 4.0, reverted: 12, sumFade: 0.2 } } },
    { cells: { 'core(≤1) · fib(cluster)': { n: 30, sumBounce: 9.0, reverted: 21, sumFade: 0.3 } } },
  ]);
  const fib = merged3.find(b => b.key === 'core(≤1) · fib(cluster)');
  ok('fib cell pools + parses', fib.n === 50 && fib.conf === 'fib(cluster)' && fib.band === 'core(≤1)');
}

// ── 8. swing-fib cluster level source ────────────────────────────────────────
console.log('[swing_fib]');
{
  // Zig-zag with 2 strict swing highs + 2 strict swing lows (strength 1).
  const bar = (i, hi, lo) => ({ time: i * 86400, open: (hi + lo) / 2, high: hi, low: lo, close: (hi + lo) / 2 });
  const bars = [
    bar(0, 1.1000, 1.0990), bar(1, 1.1050, 1.1040), bar(2, 1.1020, 1.0980),
    bar(3, 1.1060, 1.1010), bar(4, 1.1015, 1.0970), bar(5, 1.1005, 1.0995),
  ];
  const ctx = { dailyBars: bars, pipSize: 0.0001 };
  // Big tolerance → distinct-pair projections pool, proving multi-swing confluence.
  const wide = swingFibLevels({ ...ctx, params: { strength: 1, clusterPips: 100000, minConfluence: 2 } });
  ok('emits fib_cluster levels', wide.length > 0 && wide.every(l => l.kind === 'fib_cluster'));
  ok('every level meets minConfluence', wide.every(l => l.meta.confluence >= 2));
  ok('confluence counts DISTINCT pairs', wide.some(l => l.meta.confluence >= 2));
  // minConfluence above any possible pair count → no clusters survive.
  const strict = swingFibLevels({ ...ctx, params: { strength: 1, clusterPips: 100000, minConfluence: 999 } });
  ok('distinct-pair guard suppresses fakes', strict.length === 0);
  // too few bars → empty, never throws.
  ok('short series returns []', swingFibLevels({ dailyBars: bars.slice(0, 2), pipSize: 0.0001, params: { strength: 3 } }).length === 0);
  ok('registered in LEVEL_SOURCES', LEVEL_SOURCES.swing_fib?.levels === swingFibLevels);
}

console.log(`\n${failures === 0 ? '✅ all passed' : `❌ ${failures} failed`}`);
process.exit(failures === 0 ? 0 : 1);
