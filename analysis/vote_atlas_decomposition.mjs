// Vote Atlas Decomposition — 2026-09-10
//
// The vote atlas is the ONE engine in this family that survived the 2026-09-09
// look-ahead fix with its edge intact (5d5966f), so it is the thread worth
// pulling. This asks the question that killed the HL signal, applied here:
// is the edge actually coming from the VOTE, or from the barrier geometry the
// vote is bolted onto?
//
// For HL, the decisive test was an unconditional control -- every eligible touch,
// one fixed direction, no signal. The banded "signal" turned out to match it, and
// that was the end of it. The same control has never been run against the vote.
// Separate prior reason to run it: the conviction vote on the backtestSystem bot
// was found to be ANTI-predictive (see that bot's own review), so "the vote's
// margin carries information" is an assumption in this codebase, not a finding.
//
// ── THE DECOMPOSITION ────────────────────────────────────────────────────────
// A vote does two separable things. It picks WHICH touches to trade (margin >=
// minMargin) and it picks WHICH WAY to trade them. Those are tested apart,
// because a vote can easily be good at one and worthless at the other:
//
//   DIRECTION  on exactly the touches the vote admits, compare the vote's own
//              direction against follow-always, fade-always, a seeded coin
//              flip, and the vote INVERTED. If the vote's direction is worth
//              anything it must beat the better fixed direction; if `anti`
//              wins, the vote is actively backwards.
//   SELECTION  the vote's own direction on the admitted subset vs the same
//              policy applied with no margin gate at all. If the gate adds
//              nothing, minMargin is just shrinking the sample.
//   CONVICTION margin >= 1 / 2 / 3. A real conviction measure should order
//              monotonically. Reported with n, because margin>=3 gets thin
//              fast and a thin cell that looks good is the usual trap.
//
// Pricing is priceBarrierTrade (js/levelAtlasVoteReview.js) called directly with
// an explicit decision, so every policy is priced by the SAME production
// function on the SAME touch objects -- no reimplementation that could drift,
// and the timed-out population the 2026-09-09 fix restored is handled
// identically for all of them. Stats are summarizeTrades (js/metricsCore.js),
// the house per-trade battery. Nothing new is invented here.
//
// Read-only: this does NOT write {pair}-votetrades.json. Regenerating the
// canonical artifact is POST /api/level-atlas/run's job (runOne persists it);
// mixing an analysis script into that path risks an inconsistent artifact.
//
//   node analysis/vote_atlas_decomposition.mjs
//   LA_PAIRS=eurusd,gold node analysis/vote_atlas_decomposition.mjs
//   LA_REARM=0.3 node analysis/vote_atlas_decomposition.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook, splitAt } from '../js/levelAtlasReport.js';
import { voteDecision, priceBarrierTrade, applyConcurrencyCap } from '../js/levelAtlasVoteReview.js';
import { summarizeTrades } from '../js/metricsCore.js';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');
const REARM = Number(process.env.LA_REARM || 0.3);
const EXCLUDE_RUNGS = ['p90'];      // no outer rung, so 'follow' cannot be priced — same exclusion the engine applies

const ALL_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const PAIRS = process.env.LA_PAIRS
  ? process.env.LA_PAIRS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  : ALL_PAIRS;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pooled = {};   // policy -> { pnls:[], dates:[], timedOut, n }
function record(policy, trades) {
  const p = (pooled[policy] ??= { pnls: [], dates: [], timedOut: 0 });
  for (const t of trades) { p.pnls.push(t.pnlPct); p.dates.push(t.date); if (t.timedOut) p.timedOut++; }
}

async function processPair(pair) {
  const sym = pair.toUpperCase();
  let packed;
  try { packed = await loadM1ForPair(pair); } catch (e) { console.log(`  M1 load failed: ${e.message}`); return null; }
  if (!packed?.n) { console.log('  no M1 data'); return null; }
  const assetClass = assetClassFor(pair);
  const cost = costForPair(pair, assetClass);

  const { touches } = atlasWalk(packed, { instrument: sym, assetClass, rearmFracs: [REARM], pendingRearmFrac: REARM });
  if (!touches?.length) { console.log('  no touches'); return null; }

  // TWO books, because the production one leaks (2026-09-10).
  //
  // LEAKY = what runOne/the live page actually build: buildAtlasBook over ALL
  // touches. Its annotateHolds sets holdsOOS by requiring the dimension's lift
  // to have the SAME SIGN and enough magnitude in the OOS segment, and
  // matchLiveContext (js/levelAtlasReport.js:364) then counts ONLY holdsOOS
  // dimensions. So the vote's constituents are selected BECAUSE they worked in
  // the test period, and the "OOS" backtest scores them on that same period.
  // That is a look-ahead leak at the feature-selection layer -- one level deeper
  // than the outcome:'neither' population bug fixed in 5d5966f.
  //
  // HONEST = the book built from IS touches ONLY. buildAtlasBook splits whatever
  // it is handed, so giving it just the in-sample block makes holdsOOS a genuine
  // validation check on a slice INSIDE training, leaving the real OOS untouched.
  // Then the same vote is evaluated on the real OOS. Any edge that survives here
  // is a real edge; any edge that only exists in LEAKY was never there.
  const allAtRearm = touches.filter(t => t.rearmFrac === REARM);
  const { split: realSplit } = splitAt(allAtRearm);
  const isOnly = allAtRearm.filter(t => t.date < realSplit);
  const leakyBook = buildAtlasBook(touches, { rearmFrac: REARM });
  const honestBook = buildAtlasBook(isOnly, { rearmFrac: REARM });
  if (!leakyBook || !honestBook) { console.log('  no book'); return null; }
  const book = leakyBook;

  // ── Population audit. The HL post-mortem's lesson was that the fake edge
  // lived in what got silently excluded, so every gate is counted, not just
  // the headline trade count.
  const audit = { allTouches: touches.length, atRearm: 0, oos: 0, afterRungExcl: 0, votable: 0, margin1: 0, margin2: 0, margin3: 0, priceable: 0, timedOut: 0 };
  const rng = mulberry32(0xa71a5 ^ [...pair].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 11));

  const admitted = [];   // touches the LEAKY vote gate admits
  const admittedH = [];  // same touches under the HONEST book's vote
  const allOos = [];     // every priceable OOS touch, vote or not
  for (const t of touches) {
    if (t.rearmFrac !== REARM) continue;
    audit.atRearm++;
    // The REAL split, identical for both books, so leaky and honest are scored
    // on exactly the same trades and the difference is only the book.
    if (!(t.date >= realSplit)) continue;
    audit.oos++;
    if (EXCLUDE_RUNGS.includes(t.rung)) continue;
    audit.afterRungExcl++;
    const vd = voteDecision(book, t);
    if (vd) audit.votable++;
    // Priceability is decision-independent for non-p90 rungs, but check with a
    // fixed decision so `allOos` and `admitted` share one definition.
    if (!priceBarrierTrade(t, 'follow', cost)) continue;
    audit.priceable++;
    if (t.outcome === 'neither') audit.timedOut++;
    allOos.push({ t, vd });
    if (vd && vd.margin >= 1) {
      audit.margin1++;
      if (vd.margin >= 2) audit.margin2++;
      if (vd.margin >= 3) audit.margin3++;
      admitted.push({ t, vd });
    }
    const vdH = voteDecision(honestBook, t);
    if (vdH && vdH.margin >= 1) admittedH.push({ t, vd: vdH });
  }
  audit.honestVoted = admittedH.length;
  if (!admitted.length) { console.log('  no admitted touches'); return null; }

  // ── Build one trade list per policy, all priced by the same production fn.
  const build = (rows, decide) => {
    const out = [];
    for (const { t, vd } of rows) {
      const decision = decide(t, vd);
      if (!decision) continue;
      const priced = priceBarrierTrade(t, decision, cost);
      if (!priced) continue;
      out.push({ instrument: sym, date: t.date, time: t.time, resolveTime: t.resolveTime ?? t.sessionCloseTime,
        pnlPct: priced.pnlPct, win: priced.win, timedOut: !!priced.timedOut });
    }
    // Same per-pair concurrency cap the portfolio path applies, so policies are
    // compared under the constraint they'd actually be traded under.
    const capped = applyConcurrencyCap(out, { maxConcurrent: 1 });
    return capped?.kept ?? out;
  };

  const policies = {
    'vote (m>=1)': build(admitted, (t, vd) => vd.decision),
    'vote (m>=2)': build(admitted.filter(r => r.vd.margin >= 2), (t, vd) => vd.decision),
    'vote (m>=3)': build(admitted.filter(r => r.vd.margin >= 3), (t, vd) => vd.decision),
    'anti-vote': build(admitted, (t, vd) => (vd.decision === 'fade' ? 'follow' : 'fade')),
    'always follow': build(admitted, () => 'follow'),
    'always fade': build(admitted, () => 'fade'),
    'coin flip': build(admitted, () => (rng() < 0.5 ? 'fade' : 'follow')),
    'NO GATE always fade': build(allOos, () => 'fade'),
    'HONEST vote (m>=1)': build(admittedH, (t, vd) => vd.decision),
    'HONEST vote (m>=2)': build(admittedH.filter(r => r.vd.margin >= 2), (t, vd) => vd.decision),
    'HONEST vote (m>=3)': build(admittedH.filter(r => r.vd.margin >= 3), (t, vd) => vd.decision),
    'HONEST anti-vote': build(admittedH, (t, vd) => (vd.decision === 'fade' ? 'follow' : 'fade')),
  };
  for (const [k, v] of Object.entries(policies)) record(k, v);

  console.log(`  ${audit.allTouches} touches -> ${audit.oos} OOS -> ${audit.afterRungExcl} non-p90 -> ${audit.priceable} priceable` +
    ` -> ${audit.margin1} voted (m2 ${audit.margin2}, m3 ${audit.margin3}); timedOut ${(100 * audit.timedOut / Math.max(1, audit.priceable)).toFixed(0)}%`);
  return { sym, audit, counts: Object.fromEntries(Object.entries(policies).map(([k, v]) => [k, v.length])) };
}

function row(label, p) {
  if (!p || p.pnls.length < 30) return `${label.padEnd(22)}${String(p?.pnls.length ?? 0).padStart(7)}   [thin]`;
  const s = summarizeTrades(p.pnls, p.dates);
  const n = p.pnls.length;
  const m = p.pnls.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(p.pnls.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1));
  const t = sd > 0 ? m / (sd / Math.sqrt(n)) : 0;
  return label.padEnd(22) + String(n).padStart(7) +
    (s.winRate ?? 0).toFixed(1).padStart(8) +
    ((m >= 0 ? '+' : '') + m.toFixed(4)).padStart(10) +
    (s.profitFactor ?? 0).toFixed(2).padStart(7) +
    (s.sharpe ?? 0).toFixed(2).padStart(8) +
    ('t' + t.toFixed(2)).padStart(8) +
    (100 * p.timedOut / n).toFixed(0).padStart(9) + '%';
}

async function main() {
  const perPair = [];
  for (const pair of PAIRS) {
    console.log(`${pair.toUpperCase()}:`);
    const r = await processPair(pair);
    if (r) perPair.push(r); else console.log('  skipped');
  }
  console.log(`\n${'='.repeat(88)}`);
  console.log(`VOTE ATLAS DECOMPOSITION — ${perPair.length} instruments, rearm ${REARM}, real per-pair cost,`);
  console.log('per-pair concurrency cap 1, unresolved touches marked out at the session close (post-fix).');
  console.log('='.repeat(88));
  console.log('policy                      n    win%   meanPct     PF  sharpe   t-stat  timedOut');
  console.log('-- on the touches the vote gate ADMITS (direction test) ' + '-'.repeat(25));
  for (const k of ['vote (m>=1)', 'vote (m>=2)', 'vote (m>=3)', 'anti-vote', 'always follow', 'always fade', 'coin flip']) {
    console.log(row(k, pooled[k]));
  }
  console.log('-- no margin gate (baseline) ' + '-'.repeat(52));
  console.log(row('NO GATE always fade', pooled['NO GATE always fade']));
  console.log('-- SAME trades, but the book built from IS ONLY (no OOS leak) ' + '-'.repeat(20));
  for (const k of ['HONEST vote (m>=1)', 'HONEST vote (m>=2)', 'HONEST vote (m>=3)', 'HONEST anti-vote']) {
    console.log(row(k, pooled[k]));
  }

  console.log('\nHOW TO READ IT');
  console.log('  The vote earns its place only if "vote (m>=1)" beats the better of always-follow /');

  console.log('  always-fade on the SAME touches. If it merely beats the coin flip, that is the');
  console.log('  geometry, not the signal. If "anti-vote" wins, the vote is backwards.');
  console.log('  If "NO GATE vote-dir" matches "vote (m>=1)", the margin gate only shrinks the sample.');
  console.log('  Margin 1/2/3 should order monotonically if margin is really conviction.');

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = {
    generatedAt: new Date().toISOString(), rearmFrac: REARM, excludeRungs: EXCLUDE_RUNGS,
    perPair, pooled: Object.fromEntries(Object.entries(pooled).map(([k, p]) => {
      const s = p.pnls.length >= 30 ? summarizeTrades(p.pnls, p.dates) : null;
      return [k, { n: p.pnls.length, timedOutPct: +(100 * p.timedOut / Math.max(1, p.pnls.length)).toFixed(1), stats: s }];
    })),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'vote_atlas_decomposition.json'), JSON.stringify(out, null, 0));
  console.log(`\nWrote ${OUT_DIR}/vote_atlas_decomposition.json`);
}

const __filename = fileURLToPath(import.meta.url);
if (path.resolve(process.argv[1] ?? '') === __filename) main();
