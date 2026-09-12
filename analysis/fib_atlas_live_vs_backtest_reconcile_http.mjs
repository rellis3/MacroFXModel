#!/usr/bin/env node
/**
 * Fib Atlas live/demo vs. offline-backtest reconciliation — HTTP variant
 * (2026-09-12).
 *
 * Same purpose and matching logic as analysis/fib_atlas_live_vs_backtest_
 * reconcile.mjs, adapted for an environment that has network access to the
 * live Railway app but NOT local R2/OANDA credentials (this machine): reads
 * the backtest's own trades through the already-deployed
 * `/api/{asia|monday}-fib-atlas/vote-trades/:instrument` HTTP route instead
 * of `getJSON` against R2 directly, and does NOT call `runOne` locally (no
 * OANDA key here) — it assumes the backtest has ALREADY been regenerated on
 * Railway (via the real /run endpoint or the bot-config.html "Backtest Data
 * Refresh" button) for the pairs/dates being reconciled. Same three-way
 * comparison as the original: what the LIVE PLAN told the bot, what the bot
 * ACTUALLY did, and what the OFFLINE BACKTEST says should have happened.
 *
 * `minMargin=1` on the vote-trades fetch (not the route's own default of 2)
 * to get the full margin>=1 superset — same population the original
 * script's raw `stored.trades` read directly from R2.
 *
 * Usage (run from repo root, needs network to the dashboard only):
 *   node analysis/fib_atlas_live_vs_backtest_reconcile_http.mjs \
 *     --from=2026-09-07 --to=2026-09-13 \
 *     [--base=https://macrofxmodel-production.up.railway.app]
 */
const args = process.argv.slice(2);
const argVal = (name, dflt = null) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : dflt;
};
const FROM = argVal('from');
const TO = argVal('to');
const BASE = argVal('base', 'https://macrofxmodel-production.up.railway.app');

if (!FROM || !TO) {
  console.error('Usage: node analysis/fib_atlas_live_vs_backtest_reconcile_http.mjs --from=YYYY-MM-DD --to=YYYY-MM-DD [--base=URL]');
  process.exit(1);
}

const LADDER_ROUTE = { asia: 'asia-fib-atlas', monday: 'monday-fib-atlas' };

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (resp.ok || i === retries) return resp;
      console.error(`  (transient HTTP ${resp.status} on ${url}, retry ${i + 1}/${retries})`);
    } catch (e) {
      if (i === retries) throw e;
      console.error(`  (network error "${e.message}", retry ${i + 1}/${retries})`);
    }
    await new Promise(r => setTimeout(r, 3000 * (i + 1)));
  }
}

// ── 1. Pull the real trade + decision history ──────────────────────────────
console.log(`Fetching real trade/decision log for ${FROM}..${TO} from ${BASE} ...`);
const logResp = await fetchWithRetry(`${BASE}/api/fib-atlas-bot/trade-log?from=${FROM}&to=${TO}`);
if (!logResp.ok) {
  console.error(`trade-log fetch failed: HTTP ${logResp.status}`);
  process.exit(1);
}
const { trades: realTrades, decisions } = await logResp.json();
console.log(`Got ${realTrades.length} real closed trades, ${decisions.length} decision-log events in range.`);
if (!realTrades.length) {
  console.log('No real trades in this window yet — nothing to reconcile.');
  process.exit(0);
}

// ── 2. Match each real trade to its own live decision-log entry ────────────
function matchDecision(trade) {
  const candidates = decisions.filter(d =>
    d.status === 'entered' && d.ladder === trade.ladder && d.side === trade.side &&
    d.rung === trade.rung && d.pair && trade.key && d.pair.toLowerCase() === trade.key.toLowerCase() &&
    d.t <= (trade.time_open ?? Infinity) + 5);
  if (!candidates.length) return null;
  return candidates.reduce((best, d) => (trade.time_open - d.t) < (trade.time_open - best.t) ? d : best);
}

// ── 3. Fetch the already-regenerated offline backtest for every pair traded ─
const pairsTraded = [...new Set(realTrades.map(t => t.key).filter(Boolean))];
console.log(`Pairs actually traded: ${pairsTraded.join(', ') || '(none resolved — check trade.key)'}`);

const backtestByPairLadder = {};
for (const pair of pairsTraded) {
  for (const ladder of ['asia', 'monday']) {
    if (!realTrades.some(t => t.key === pair && t.ladder === ladder)) continue;
    const bt = `${pair}|${ladder}`;
    try {
      const resp = await fetchWithRetry(`${BASE}/api/${LADDER_ROUTE[ladder]}/vote-trades/${pair.toUpperCase()}?minMargin=1`);
      if (!resp.ok) { console.error(`  ${bt}: HTTP ${resp.status} — no backtest data`); backtestByPairLadder[bt] = []; continue; }
      const j = await resp.json();
      backtestByPairLadder[bt] = j.trades ?? [];
      console.log(`  ${bt}: ${j.trades?.length ?? 0} backtest trades (generatedAt ${j.generatedAt})`);
    } catch (e) {
      console.error(`  could not load ${bt}'s backtest: ${e.message}`);
      backtestByPairLadder[bt] = [];
    }
  }
}

function matchBacktest(trade) {
  const bt = backtestByPairLadder[`${trade.key}|${trade.ladder}`] || [];
  const candidates = bt.filter(t => t.side === trade.side && t.rung === trade.rung && t.date === trade.date);
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  return candidates.reduce((best, t) => Math.abs((t.time ?? 0) - trade.time_open) < Math.abs((best.time ?? 0) - trade.time_open) ? t : best);
}

// ── 4. Report, trade by trade ───────────────────────────────────────────────
console.log('\n=== Per-trade reconciliation ===');
console.log(['pair', 'ladder', 'side', 'rung', 'date', 'live_decision', 'bt_decision', 'decision_match',
  'live_entry', 'bt_entry', 'entry_diff_pips', 'live_pnl$', 'bt_pnl%', 'bt_timedOut'].join('\t'));

let decisionMatches = 0, decisionMismatches = 0, noBacktestMatch = 0, noDecisionMatch = 0;
const entryDiffs = [];
for (const trade of realTrades) {
  const dec = matchDecision(trade);
  const bt = matchBacktest(trade);
  if (!dec) noDecisionMatch++;
  if (!bt) { noBacktestMatch++; continue; }
  const decisionMatch = dec ? (dec.decision === bt.decision ? 'YES' : 'NO') : '?';
  if (dec) { if (decisionMatch === 'YES') decisionMatches++; else decisionMismatches++; }
  const liveEntry = dec?.entry ?? trade.open_price;
  const entryDiffPips = (liveEntry != null && bt.entry != null) ? Math.abs(liveEntry - bt.entry) / (bt.pip ?? 0.0001) : null;
  if (entryDiffPips != null) entryDiffs.push(entryDiffPips);
  console.log([trade.key, trade.ladder, trade.side, trade.rung, trade.date,
    dec?.decision ?? '(no decision-log match)', bt.decision, decisionMatch,
    liveEntry?.toFixed(5) ?? '—', bt.entry?.toFixed(5) ?? '—',
    entryDiffPips?.toFixed(1) ?? '—', trade.profit?.toFixed(2) ?? '—', bt.pnlPct?.toFixed(3) ?? '—',
    bt.timedOut ? 'YES' : 'no',
  ].join('\t'));
}

console.log('\n=== Summary ===');
console.log(`real trades: ${realTrades.length}`);
console.log(`matched to a backtest touch: ${realTrades.length - noBacktestMatch} (${noBacktestMatch} had no matching offline touch — worth investigating each one individually)`);
console.log(`matched to a live decision-log entry: ${realTrades.length - noDecisionMatch}`);
console.log(`decision (fade/follow) agreement: ${decisionMatches} match / ${decisionMismatches} mismatch`);
if (entryDiffs.length) {
  const mean = entryDiffs.reduce((a, b) => a + b, 0) / entryDiffs.length;
  console.log(`entry price diff (live plan vs offline backtest), pips: mean=${mean.toFixed(2)}, max=${Math.max(...entryDiffs).toFixed(2)}`);
}
console.log('\nA handful of unmatched trades or a few pips of entry drift is expected (real-time poll vs M1-bar-close timing, spread).');
console.log('A cluster of decision MISMATCHES, or unmatched trades that are NOT explained by that, is the signal worth digging into.');
