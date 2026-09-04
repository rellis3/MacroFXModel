// Follow-up to fib_atlas_whiplash_analysis.mjs's headline finding (2026-09-03):
// pooled across 26 pairs, the FASTEST repeat touches of a rung (<30min since
// its own prior touch) win far more than slow, "clean" retests (>8h) — the
// opposite of the naive "whiplash is bad" worry that started this thread.
// Owner's own follow-up: "try pair by pair [to check it's not a pooled
// artifact skewed by a couple of pairs], and any other idea to help this
// theory out, do it" — three checks, same discipline as every other lever
// validated in this project:
//
//   1. PER-PAIR sign-consistency on the gap effect (the same check that
//      validated prevOutcomeSameDay/sessionHandoff as real dimensions,
//      LEGO_MODULES.md §1aq) — does <30m beat 30min+ on MOST pairs
//      individually, or is the pooled number a few dominant pairs?
//   2. COST STRESS (1x/2x/3x) on the pooled short-gap vs long-gap buckets —
//      this project's own "always check before trusting a 'too good'
//      result" rule; PF 5.37/12.06 on the <30m bucket is exactly the kind
//      of number that demands it.
//   3. Is "gap" doing NEW work, or just re-deriving something already
//      known? Cross-tab short-gap touches against `churn` (Asia's own
//      chop-vs-driven measure) and `prevOutcomeSameDay` (did the rung's
//      OWN prior touch this session resolve back/out) — if the short-gap
//      edge only shows up inside "driven" days or a specific prior
//      outcome, it's redundant with an existing signal, not a new one.
//
//   node analysis/fib_atlas_whiplash_gap_deepdive.mjs
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { asiaFibAtlasWalk } from '../js/asiaFibAtlasEngine.js';
import { mondayFibAtlasWalk } from '../js/mondayFibAtlasEngine.js';
import { buildAsiaFibAtlasBook } from '../js/asiaFibAtlasReport.js';
import { voteDecision, priceBarrierTrade } from '../js/asiaFibAtlasVoteReview.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { costForPair } from '../js/perLineStrategy.js';

const PAIRS = [
  'nzdusd', 'usdjpy', 'gbpjpy', 'euraud', 'eurgbp', 'gbpusd', 'audusd', 'eurjpy',
  'usdchf', 'eurusd', 'usdcad', 'eurnzd', 'audnzd', 'audchf', 'audcad', 'gbpcad',
  'gbpnzd', 'cadjpy', 'gbpaud', 'audjpy', 'gbpchf', 'nzdjpy', 'eurchf', 'eurcad',
  'chfjpy', 'gold',
];
const DEFAULT_REARM = 0.3;
const MIN_MARGIN = 2;
const MIN_CELL_N = 30;
const SHORT_GAP_MAX_MIN = 30;   // "whiplash" bucket, matches the first script
const LONG_GAP_MIN_MIN = 480;   // ">8h", the weak "clean retest" bucket

function summarize(rows) {
  const n = rows.length;
  if (!n) return { n: 0 };
  const wins = rows.filter(r => r.win).length;
  const grossWin = rows.filter(r => r.win).reduce((a, r) => a + r.pnlPct, 0);
  const grossLoss = -rows.filter(r => !r.win).reduce((a, r) => a + r.pnlPct, 0);
  return { n, winRate: +(wins / n * 100).toFixed(1), pf: grossLoss > 0 ? +(grossWin / grossLoss).toFixed(3) : (grossWin > 0 ? Infinity : 0) };
}
function fmt(s) { if (!s || !s.n) return 'n=0'; return `n=${s.n} winRate=${s.winRate}% PF=${s.pf === Infinity ? 'inf' : s.pf}${s.n < MIN_CELL_N ? ' (thin)' : ''}`; }
function stressPnl(pnlPct, cost, mult) { return +(pnlPct + cost - mult * cost).toFixed(4); }

async function ladderRows(pair, ladder, packed, assetClass, cost) {
  const walk = ladder === 'asia' ? asiaFibAtlasWalk : mondayFibAtlasWalk;
  const { touches } = walk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [DEFAULT_REARM] });
  if (!touches?.length) return [];
  const book = buildAsiaFibAtlasBook(touches, { rearmFrac: DEFAULT_REARM });
  if (!book) return [];

  const oos = touches.filter(t => t.rearmFrac === DEFAULT_REARM && t.date >= book.splitDate && t.outcome !== 'neither');
  if (!oos.length) return [];
  const sessionField = ladder === 'asia' ? 'date' : 'mondayDate';

  const groups = new Map();
  for (const t of oos) {
    const k = `${t.side}|${t.level}|${t[sessionField]}`;
    (groups.get(k) ?? groups.set(k, []).get(k)).push(t);
  }

  const rows = [];
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.time - b.time);
    arr.forEach((t, idx) => {
      if (idx === 0) return;   // gap analysis is repeat-touches only, same as the first script
      const vd = voteDecision(book, t);
      if (!vd || vd.margin < MIN_MARGIN) return;
      const priced = priceBarrierTrade(t, vd.decision, cost);
      if (!priced) return;
      const gapMin = +((t.time - arr[idx - 1].time) / 60).toFixed(1);
      rows.push({
        pair, ladder, win: priced.win, pnlPct: priced.pnlPct, cost, gapMin,
        churn: t.churn ?? null, prevOutcomeSameDay: t.prevOutcomeSameDay ?? null,
      });
    });
  }
  return rows;
}

async function main() {
  const all = [];
  const perPair = [];   // {pair, ladder, short, long}
  for (const pair of PAIRS) {
    console.log(`\n=== ${pair.toUpperCase()} ===`);
    const packed = await loadM1ForPair(pair);
    if (!packed?.n) { console.log('  no M1 data'); continue; }
    const assetClass = assetClassFor(pair);
    const cost = costForPair(pair, assetClass);
    for (const ladder of ['asia', 'monday']) {
      const rows = await ladderRows(pair, ladder, packed, assetClass, cost);
      all.push(...rows);
      const short = summarize(rows.filter(r => r.gapMin < SHORT_GAP_MAX_MIN));
      const long = summarize(rows.filter(r => r.gapMin >= LONG_GAP_MIN_MIN));
      perPair.push({ pair, ladder, short, long });
      console.log(`  ${ladder}: short(<30m) ${fmt(short)}  |  long(>8h) ${fmt(long)}`);
    }
  }

  console.log('\n\n════ 1. PER-PAIR SIGN CONSISTENCY (<30m PF vs >8h PF, both cells n>=30) ════');
  for (const ladder of ['asia', 'monday']) {
    const cells = perPair.filter(p => p.ladder === ladder && p.short.n >= MIN_CELL_N && p.long.n >= MIN_CELL_N);
    const agree = cells.filter(p => p.short.pf > p.long.pf);
    console.log(`\n${ladder.toUpperCase()}: ${cells.length}/${perPair.filter(p => p.ladder === ladder).length} pairs have enough data in BOTH cells to judge`);
    console.log(`  short-gap PF > long-gap PF on ${agree.length}/${cells.length} pairs`);
    for (const p of cells) {
      const sign = p.short.pf > p.long.pf ? 'AGREE' : 'DISAGREE';
      console.log(`    ${sign.padEnd(8)} ${p.pair.padEnd(8)} short=${p.short.pf}(n${p.short.n}) long=${p.long.pf}(n${p.long.n})`);
    }
  }

  console.log('\n\n════ 2. COST STRESS on the pooled short(<30m) vs long(>8h) buckets ════');
  for (const ladder of ['asia', 'monday']) {
    const shortRows = all.filter(r => r.ladder === ladder && r.gapMin < SHORT_GAP_MAX_MIN);
    const longRows = all.filter(r => r.ladder === ladder && r.gapMin >= LONG_GAP_MIN_MIN);
    console.log(`\n${ladder.toUpperCase()}:`);
    for (const mult of [1, 2, 3]) {
      const s = summarize(shortRows.map(r => ({ win: r.win, pnlPct: stressPnl(r.pnlPct, r.cost, mult) })));
      const l = summarize(longRows.map(r => ({ win: r.win, pnlPct: stressPnl(r.pnlPct, r.cost, mult) })));
      console.log(`  ${mult}x cost: short ${fmt(s)}  |  long ${fmt(l)}`);
    }
  }

  console.log('\n\n════ 3a. Is the short-gap edge just re-deriving `churn` (Asia only — Monday has no churn field)? ════');
  const asiaShort = all.filter(r => r.ladder === 'asia' && r.gapMin < SHORT_GAP_MAX_MIN);
  for (const c of ['1·churned', '2·mixed', '3·driven']) {
    console.log(`  churn=${c}: ${fmt(summarize(asiaShort.filter(r => r.churn === c)))}`);
  }

  console.log('\n\n════ 3b. Is the short-gap edge conditional on what the rung\'s OWN prior touch resolved (prevOutcomeSameDay)? ════');
  for (const ladder of ['asia', 'monday']) {
    const shortRows = all.filter(r => r.ladder === ladder && r.gapMin < SHORT_GAP_MAX_MIN);
    console.log(`\n${ladder.toUpperCase()}:`);
    for (const o of ['back', 'out']) {
      console.log(`  prevOutcomeSameDay=${o}: ${fmt(summarize(shortRows.filter(r => r.prevOutcomeSameDay === o)))}`);
    }
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
