// Size vs Outcome Bias Study — 2026-09-10
//
// Educator's question: do winning trades systematically carry a different
// position size than losing trades? Under this strategy's fixed-fractional
// sizing, lots = risk_amt / (stopPips * pip_value) -- size is driven ENTIRELY
// by stop distance, known at entry, with no knowledge of the outcome. So any
// correlation between size and win/loss can't be intentional -- it can only
// be a STRUCTURAL side effect of something else (e.g. fade's stop is the
// wide outer rung, follow's stop is the tight inner rung -- if fade/follow
// also have different win rates, that alone creates a real size/outcome
// correlation with no "look-ahead" involved at all).
//
// Position-size proxy: riskUnitPct = stopPips*pip/entry*100 (the trade's own
// 1R risk, in % of price -- the SAME quantity the Kelly script used). Size is
// INVERSELY proportional to this for a fixed risk_pct (tighter stop -> bigger
// position for the same % risk), so 1/riskUnitPct is a cross-pair-comparable
// "how big was this position" factor without needing to pick an actual
// risk_pct or touch pip_value at all.
//
// PURE ANALYSIS. Does not touch buildBarrierTrades, voteDecision, the live
// bot, or level-atlas-vote-portfolio.html.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook } from '../js/levelAtlasReport.js';
import { buildBarrierTrades, applyConcurrencyCap } from '../js/levelAtlasVoteReview.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { costForPair } from '../js/perLineStrategy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');
const DEFAULT_REARM = 0.3;

const ALL_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const PAIRS = process.env.LA_PAIRS ? process.env.LA_PAIRS.split(',') : ALL_PAIRS;

const perPairRows = {};

for (const pair of PAIRS) {
  console.log(`${pair.toUpperCase()}: loading M1...`);
  const packed = await loadM1ForPair(pair);
  const assetClass = assetClassFor(pair);
  const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [DEFAULT_REARM], pendingRearmFrac: DEFAULT_REARM });
  const book = buildAtlasBook(touches, { rearmFrac: DEFAULT_REARM });
  if (!book) { console.log('  no book -- skipping'); continue; }
  const cost = costForPair(pair, assetClass);
  const trades = buildBarrierTrades(touches, book, { rearmFrac: DEFAULT_REARM, cost, minMargin: 3 });
  const capped = applyConcurrencyCap(trades, { maxConcurrent: 1 }).kept;
  const rows = capped.map(t => {
    const riskUnitPct = (t.stopPips * t.pip / t.entry) * 100;
    return { pair: pair.toUpperCase(), decision: t.decision, win: t.win, timedOut: !!t.timedOut, riskUnitPct, sizeFactor: 1 / riskUnitPct };
  }).filter(r => r.riskUnitPct > 0);
  perPairRows[pair.toUpperCase()] = rows;
  console.log(`  ${rows.length} trades`);
}

const all = Object.values(perPairRows).flat();
console.log(`\nTotal trades: ${all.length}\n`);

function summarize(rows) {
  const n = rows.length;
  if (!n) return null;
  const mean = rows.reduce((a, r) => a + r.sizeFactor, 0) / n;
  const sorted = [...rows].sort((a, b) => a.sizeFactor - b.sizeFactor);
  const median = sorted[Math.floor(n / 2)].sizeFactor;
  return { n, meanSizeFactor: +mean.toFixed(4), medianSizeFactor: +median.toFixed(4) };
}

// ── Overall: winners vs losers (timed-out trades excluded from this specific
// cut -- they're not a clean win/loss, tested separately below) ──
const resolved = all.filter(r => !r.timedOut);
const winners = resolved.filter(r => r.win);
const losers = resolved.filter(r => !r.win);
const wSum = summarize(winners), lSum = summarize(losers);
console.log('=== OVERALL: winners vs losers (resolved trades only) ===');
console.log('winners:', JSON.stringify(wSum));
console.log('losers: ', JSON.stringify(lSum));
console.log(`ratio (winner size / loser size): ${(wSum.meanSizeFactor / lSum.meanSizeFactor).toFixed(3)}  (>1 = winners get BIGGER size, <1 = winners get SMALLER size)\n`);

// ── By decision (fade vs follow) -- the suspected mechanism ──
for (const decision of ['fade', 'follow']) {
  const sub = resolved.filter(r => r.decision === decision);
  const w = summarize(sub.filter(r => r.win));
  const l = summarize(sub.filter(r => !r.win));
  console.log(`=== ${decision.toUpperCase()} only ===`);
  console.log('  winners:', JSON.stringify(w));
  console.log('  losers: ', JSON.stringify(l));
  console.log(`  ratio: ${w && l ? (w.meanSizeFactor / l.meanSizeFactor).toFixed(3) : 'n/a'}`);
  console.log(`  win rate: ${(100 * sub.filter(r => r.win).length / sub.length).toFixed(1)}%  avg sizeFactor: ${summarize(sub).meanSizeFactor}`);
}

// ── Decision mix itself: does one decision type structurally get bigger size? ──
const fadeAll = resolved.filter(r => r.decision === 'fade');
const followAll = resolved.filter(r => r.decision === 'follow');
console.log(`\n=== Decision-type size comparison (the suspected structural mechanism) ===`);
console.log(`FADE:   n=${fadeAll.length}  winRate=${(100 * fadeAll.filter(r => r.win).length / fadeAll.length).toFixed(1)}%  avgSizeFactor=${summarize(fadeAll).meanSizeFactor}`);
console.log(`FOLLOW: n=${followAll.length}  winRate=${(100 * followAll.filter(r => r.win).length / followAll.length).toFixed(1)}%  avgSizeFactor=${summarize(followAll).meanSizeFactor}`);

// ── Per-pair consistency check: is the overall winner/loser ratio the SAME
// direction across most/all pairs, or is the pooled number an average of
// contradicting pairs? ──
console.log(`\n=== Per-pair consistency (winner size / loser size ratio) ===`);
let positiveCount = 0, negativeCount = 0;
for (const [pair, rows] of Object.entries(perPairRows)) {
  const res = rows.filter(r => !r.timedOut);
  const w = summarize(res.filter(r => r.win)), l = summarize(res.filter(r => !r.win));
  if (!w || !l) { console.log(`${pair}: insufficient data`); continue; }
  const ratio = w.meanSizeFactor / l.meanSizeFactor;
  if (ratio > 1) positiveCount++; else negativeCount++;
  console.log(`${pair.padEnd(8)} ratio=${ratio.toFixed(3)}  (winners n=${w.n}, losers n=${l.n})`);
}
console.log(`\n${positiveCount} of ${positiveCount + negativeCount} pairs show winners getting BIGGER size; ${negativeCount} show winners getting SMALLER size`);

fs.writeFileSync(path.join(OUT_DIR, 'size_vs_outcome_bias_study.json'), JSON.stringify({
  overall: { winners: wSum, losers: lSum },
  fade: { winners: summarize(fadeAll.filter(r => r.win)), losers: summarize(fadeAll.filter(r => !r.win)) },
  follow: { winners: summarize(followAll.filter(r => r.win)), losers: summarize(followAll.filter(r => !r.win)) },
  decisionMix: { fade: summarize(fadeAll), follow: summarize(followAll) },
}, null, 1));
