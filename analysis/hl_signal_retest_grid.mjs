// HL Signal Re-test Grid — 2026-09-09
//
// The corrected replacement for analysis/hl_early_reaction_tradeable_study.mjs's
// own CLI grid. That script has to redo the M1 walk (~25 min for 17 pairs) to
// print anything; this one reads the {pair}-hltouches.json files the walk already
// produced, so the whole checkpoint x band x direction grid costs a few seconds
// and can be re-run freely as the rule changes.
//
// ── WHY A RE-TEST AT ALL ─────────────────────────────────────────────────────
// The original study dropped every touch whose two-barrier race never resolved
// before the session closed, which is a look-ahead SELECTION filter (you cannot
// know that at the checkpoint) and removed the losing half of the population.
// js/hlSignalCore.js's header has the full account, including why the
// "beats fair two-barrier-race odds" finding it rested on was an artifact of
// benchmarking a session-truncated sample against an INFINITE-horizon null.
//
// So every prior verdict is void, not merely weakened, and nothing here inherits
// one: all four bands are priced in BOTH directions, including '35-60%' (which
// the old code refused to trade) and '>60%' (which it offered only as a
// discouraged toggle). The unconditional control — every eligible touch, one
// fixed direction, no band filter — answers the prior question the bands are
// only worth anything relative to: does the LEVEL itself do anything?
//
// Reuses costForPair (js/perLineStrategy.js), applyConcurrencyCap
// (js/levelAtlasVoteReview.js, maxConcurrent=1 per pair before pooling) and
// summarizeTrades (js/metricsCore.js) — the same bricks the portfolio route
// uses, so a row here is directly comparable to the page.
//
//   node analysis/hl_signal_retest_grid.mjs            # OOS (default)
//   LA_SEG=is  node analysis/hl_signal_retest_grid.mjs # in-sample
//   LA_SEG=all node analysis/hl_signal_retest_grid.mjs
//   LA_GROSS=1 node analysis/hl_signal_retest_grid.mjs # cost zeroed
//   LA_PAIRS=eurusd,gold node analysis/hl_signal_retest_grid.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { applyConcurrencyCap } from '../js/levelAtlasVoteReview.js';
import { summarizeTrades } from '../js/metricsCore.js';
import { BANDS, bandOf, CHECKPOINTS_MIN, priceTradeFromTouch, HL_TOUCH_SCHEMA } from '../js/hlSignalCore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, 'output', 'level-atlas-vote-trades');
const SEG = (process.env.LA_SEG || 'oos').toLowerCase();
const MIN_SAMPLE = 30;

const wanted = process.env.LA_PAIRS ? new Set(process.env.LA_PAIRS.split(',').map(s => s.trim().toLowerCase())) : null;
const files = fs.readdirSync(DIR).filter(f => f.endsWith('-hltouches.json'))
  .filter(f => !wanted || wanted.has(f.replace('-hltouches.json', '')));

const store = [];
const stale = [];
for (const f of files) {
  const pair = f.replace('-hltouches.json', '');
  const j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  // A schema-1 file has NO unresolved touches in it — pricing it would quietly
  // reproduce the withdrawn numbers with nothing saying so. Refuse, don't degrade.
  if ((j.schema ?? 1) < HL_TOUCH_SCHEMA) { stale.push(pair.toUpperCase()); continue; }
  // LA_GROSS=1 zeroes transaction cost. Not a claim about tradeability — it
  // separates "this level has no directional edge at all" from "it has one but
  // it is smaller than the spread", which are different findings with different
  // next steps, and a cost-inclusive table alone cannot tell them apart.
  const cost = process.env.LA_GROSS ? 0 : costForPair(pair, assetClassFor(pair));
  const rows = j.touches.filter(t => SEG === 'all' || (SEG === 'is' ? t.date < j.splitDate : t.date >= j.splitDate));
  store.push({ pair, sym: j.instrument, cost, rows });
}
if (stale.length) {
  console.error(`REFUSED (schema 1, silently excludes unresolved touches): ${stale.join(', ')}`);
  console.error('Rebuild with: node scripts/build_hl_touches.mjs\n');
}
if (!store.length) { console.error('no usable touch files'); process.exit(1); }

// Cap concurrency per pair (one open position per instrument), then pool —
// the same shape the live portfolio route uses.
function capPerPairThenPool(byPair) {
  const kept = [];
  for (const list of byPair) {
    const c = applyConcurrencyCap(list, { maxConcurrent: 1 });
    if (c?.kept?.length) kept.push(...c.kept);
  }
  return kept;
}

function build(cp, bet, bandKey) {
  const byPair = [];
  for (const { sym, cost, rows } of store) {
    const priced = [];
    for (const t of rows) {
      const snap = t.checks?.[cp];
      if (!snap) continue;
      if (bandKey && bandOf(snap.frac)?.key !== bandKey) continue;
      const p = priceTradeFromTouch({ ...t, instrument: sym }, cp, bet, cost);
      if (p) priced.push(p);
    }
    if (priced.length) byPair.push(priced);
  }
  return capPerPairThenPool(byPair);
}

function row(label, trades) {
  const n = trades.length;
  if (!n) return `${label.padEnd(30)}      —`;
  const pnls = trades.map(t => t.pnlPct), dates = trades.map(t => t.date);
  const st = summarizeTrades(pnls, dates);
  const mean = pnls.reduce((a, b) => a + b, 0) / n;
  const mix = {};
  for (const t of trades) mix[t.exitKind] = (mix[t.exitKind] ?? 0) + 1;
  const timeout = (100 * (mix.timeout ?? 0) / n).toFixed(0);
  // t-stat on mean pnl per trade — the only thing that says whether a positive
  // meanR is distinguishable from zero at this sample size.
  const sd = Math.sqrt(pnls.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  const t = sd > 0 ? mean / (sd / Math.sqrt(n)) : 0;
  return [
    label.padEnd(30),
    String(n).padStart(6),
    (st.winRate ?? 0).toFixed(1).padStart(7),   // summarizeTrades already returns a percentage
    mean.toFixed(4).padStart(9),
    (st.profitFactor ?? 0).toFixed(2).padStart(7),
    t.toFixed(2).padStart(7),
    (timeout + '%').padStart(9),
    n < MIN_SAMPLE ? '  [THIN]' : '',
  ].join('');
}

const HEAD = ['rule'.padEnd(30), 'n'.padStart(6), 'win%'.padStart(7), 'meanR'.padStart(9),
  'PF'.padStart(7), 't-stat'.padStart(7), 'timeout'.padStart(9)].join('');

console.log(`HL Signal Re-test Grid — segment=${SEG.toUpperCase()}, ${store.length} instruments, ` +
  (process.env.LA_GROSS ? 'COST ZEROED (gross edge only, NOT tradeable), ' : '') +
  `per-pair concurrency cap 1, unresolved touches marked out at the session close.\n` +
  `meanR is per-trade R (pnl / own stop distance). t-stat is on meanR — under ~2 the rule is not ` +
  `distinguishable from nothing, whatever PF says.\n`);

for (const cp of CHECKPOINTS_MIN) {
  console.log(`\n================ CHECKPOINT = ${cp}min ================`);
  console.log(HEAD);
  for (const b of BANDS) {
    for (const bet of ['continuation', 'reversal']) {
      console.log(row(`${b.key} ${bet}`, build(cp, bet, b.key)));
    }
  }
  console.log('  ' + '-'.repeat(70));
  for (const bet of ['continuation', 'reversal']) {
    console.log(row(`ALL BANDS ${bet} (control)`, build(cp, bet, null)));
  }
}
