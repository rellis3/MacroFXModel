#!/usr/bin/env node
/**
 * "Cull the bad trades" — the owner's direct request (2026-08-30): analyse
 * every ±3σ developing-band touch's REALIZED trade outcome (not the touch
 * race/return proxy — the actual costed win/loss) against every context
 * dimension this study has built (session, volatility, VuManChu/WaveTrend,
 * momentum, band slope, PMO, RSI — everything), and report what survives
 * OOS-gated, checked against a permutation noise floor.
 *
 * Baseline trade: V0 fade (§16/§18's own baseline — no entry gates, so the
 * dimension scan isn't confounded by an already-applied filter), band=3
 * only, developing bands, TP=VWAP, SL=1.5×ATR15m — the same config already
 * tested null nine times over on ITS OWN, now examined trade-by-trade for
 * conditions that separate the winners from the losers within it.
 *
 * Multiple-testing discipline: ~29 dimensions scanned at once on one pooled
 * book — a permutation baseline (shuffle win/loss, rebuild, count survivors)
 * is run alongside the real book, matching this study's standing convention,
 * and any survivor is cross-checked on the 3 FX majors before being reported
 * as more than a single-instrument curiosity.
 *
 *   node scripts/run_fade_trade_conditions.mjs [pairs...] [--perms N]
 */

import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { fixedSigmaWalk } from '../js/vwapFixedSigmaEngine.js';
import { runStackedFade } from '../js/stackedFadeV1Engine.js';
import { buildTradeWinBook, extractHeldFindings, DIMENSIONS } from '../js/vwapFixedSigmaReport.js';
import { mulberry32 } from '../js/syntheticWalk.js';

const args = process.argv.slice(2);
const pairs = args.filter(a => !a.startsWith('-') && args[args.indexOf(a) - 1] !== '--perms');
const list = pairs.length ? pairs : ['gold', 'eurusd', 'gbpusd', 'usdjpy'];
const nPerms = args.includes('--perms') ? +args[args.indexOf('--perms') + 1] : 20;

async function buildRows(pair) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) return null;
  const costPct = pair === 'gold' ? 0.020 : 0.012;
  const { touches } = fixedSigmaWalk(packed, { instrument: pair, assetClass: pair === 'gold' ? 'commodity' : 'fx', sigmaMode: 'developing' });
  const { trades, meta } = runStackedFade(packed, touches, { bands: [3], costPct });

  // Join each realized trade back onto its originating touch (full context).
  // One trade per day (the engine's own cap) + band fixed at 3 -> (date,side)
  // uniquely identifies the touch. trade.side is 'BUY'/'SELL' (fade mapping:
  // dn-touch->BUY, up-touch->SELL) -- reconstruct the raw touch side from it.
  const byKey = new Map();
  for (const t of touches) if (t.ordinal === 1 && t.band === 3) byKey.set(`${t.date}|${t.side}`, t);
  const rows = [];
  for (const tr of trades) {
    const rawSide = tr.side === 'BUY' ? 'dn' : 'up';
    const touch = byKey.get(`${tr.date}|${rawSide}`);
    if (!touch) continue;
    rows.push({ ...touch, win: tr.netPct > 0, netPct: tr.netPct });
  }
  return { rows, poolSize: meta.pool, tradeCount: trades.length };
}

const allResults = {};
for (const pair of list) {
  console.log(`\n=== ${pair.toUpperCase()} ===`);
  const built = await buildRows(pair);
  if (!built) { console.log('  no M1 data'); continue; }
  const { rows, poolSize, tradeCount } = built;
  console.log(`  pool=${poolSize}  trades=${tradeCount}  rows joined=${rows.length}`);
  const wins = rows.filter(r => r.win).length;
  console.log(`  base win rate: ${(wins / rows.length * 100).toFixed(1)}%`);

  const book = buildTradeWinBook(rows, { cellKey: pair });
  const held = extractHeldFindings(book, { limit: 10000 });
  allResults[pair] = { rows, book, held };
  console.log(`  held findings (n>=30 both halves, |Δ|>=3pp both, same sign): ${held.length}`);
  for (const h of held.slice(0, 15)) {
    console.log(`    ${h.dimKey.padEnd(16)} ${h.bucket.padEnd(20)} IS win% ${String(h.outPctIS).padStart(5)} Δ${h.deltaOutIS > 0 ? '+' : ''}${h.deltaOutIS} (n=${h.n.is})  OOS win% ${String(h.outPctOOS).padStart(5)} Δ${h.deltaOutOOS > 0 ? '+' : ''}${h.deltaOutOOS} (n=${h.n.oos})`);
  }

  // Permutation baseline: shuffle win/loss labels, rebuild, count survivors.
  const rnd = mulberry32(4200);
  const counts = [];
  for (let p = 0; p < nPerms; p++) {
    const wins2 = rows.map(r => r.win);
    for (let i = wins2.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [wins2[i], wins2[j]] = [wins2[j], wins2[i]]; }
    const shuffled = rows.map((r, i) => ({ ...r, win: wins2[i] }));
    const shBook = buildTradeWinBook(shuffled, { cellKey: pair });
    counts.push(extractHeldFindings(shBook, { limit: 10000 }).length);
  }
  counts.sort((a, b) => a - b);
  const mean = counts.reduce((s, v) => s + v, 0) / counts.length;
  console.log(`  permutation survivors: mean ${mean.toFixed(1)}, range ${counts[0]}-${counts[counts.length - 1]} (${nPerms} shuffles)`);
}

// Cross-instrument check: any dimension×bucket that held on gold, does it
// hold (same direction) on the FX majors too?
if (allResults.gold && list.length > 1) {
  console.log('\n=== Cross-instrument check: gold survivors vs FX majors (same dim+bucket, OOS direction) ===');
  for (const h of allResults.gold.held) {
    const row = [h.dimKey + '=' + h.bucket];
    for (const pair of list.filter(p => p !== 'gold')) {
      const otherHeld = allResults[pair]?.held.find(x => x.dimKey === h.dimKey && x.bucket === h.bucket);
      row.push(pair + '=' + (otherHeld ? `Δ${otherHeld.deltaOutOOS > 0 ? '+' : ''}${otherHeld.deltaOutOOS}(n=${otherHeld.n.oos})` : 'not held'));
    }
    console.log(`  ${row.join('  ')}`);
  }
}
