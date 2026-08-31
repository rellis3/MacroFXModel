// Book Health Check -- closes the loop between what the vote-margin book
// PREDICTED (the decision log's entered events: decision, margin, at the
// moment of entry) and what ACTUALLY HAPPENED in live/paper trading (the
// trade log's realized win/loss), then compares the REAL rate against what
// the same (decision, margin) cell showed in the original backtest. Same
// discipline as OI bot's hold-score calibration ("collecting N/M before
// trusting anything") -- this only ever REPORTS a comparison, it never
// auto-adjusts the book or the bot's config.
//
// Data sources (all live, fetched from the dashboard, not local files):
//   - volatility_bot_v2_decision_log -- entered events (pair, side, rung,
//     decision, margin, t)
//   - volatility_bot_v2_trade_log -- realized closed trades (key, zone_id,
//     open_price, close_price, profit, time_open, time_close, date)
// Joined by (pair, side, rung, closest time_open to the decision's own t,
// within JOIN_TOLERANCE_SECS) -- NOT by zone_id string equality, because
// the MT5 comment (which the trade log's zone_id is parsed from) only ever
// carries a SHORT tag (side+rung+instance, e.g. "upp50_2" -- see
// volatility_bot_v2.py's short_tag, 2026-08-31 MT5-comment-overflow fix),
// not the full zone_id the decision log keeps.
//
// The backtest comparison reuses the SAME cached real trades every other
// script this session validated against (analysis/output/level-atlas-vote-
// trades/{pair}-votetrades.json) -- one shared ground truth, not a second
// implementation of "what did the backtest say."
//
//   node analysis/book_health_check.mjs [--url https://your-dashboard]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, 'output', 'level-atlas-vote-trades');
const JOIN_TOLERANCE_SECS = 180;
const MIN_LIVE_SAMPLE = 20;   // don't claim ANYTHING about a cell below this -- matches OI bot's own calibration gate

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const BASE_URL = arg('url', process.env.DASHBOARD_URL || 'https://macrofxmodel-production.up.railway.app');

async function kvGet(key) {
  const r = await fetch(`${BASE_URL}/api/kv/get?key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`kv/get ${key} HTTP ${r.status}`);
  const j = await r.json();
  return j.miss ? null : j.data;
}

// trade_log's zone_id is the SHORT MT5-comment tag: "{side}{rung}_{instance}",
// e.g. "upp50_2", "downp75_1" -- parse it back into side/rung.
function parseShortTag(tag) {
  const m = /^(up|down)(p50|p75|p90)_(\d+)$/.exec(String(tag || ''));
  return m ? { side: m[1], rung: m[2], instance: +m[3] } : null;
}

async function main() {
  console.log(`Fetching decision log + trade log from ${BASE_URL} ...`);
  const [decLog, tradeLog] = await Promise.all([
    kvGet('volatility_bot_v2_decision_log').catch(() => null),
    kvGet('volatility_bot_v2_trade_log').catch(() => null),
  ]);
  const decisions = (decLog?.events || []).filter(e => e.status === 'entered');
  const trades = Array.isArray(tradeLog) ? tradeLog : [];
  console.log(`decision log: ${decLog?.events?.length ?? 0} total events, ${decisions.length} 'entered'`);
  console.log(`trade log: ${trades.length} closed trades`);

  // Join: for each closed trade, find the entered-decision with the same
  // (pair, side, rung) whose timestamp is closest to time_open, within
  // JOIN_TOLERANCE_SECS. Each decision event is consumed at most once
  // (a decision log entry maps to at most one real fill).
  const usedDecisionIdx = new Set();
  const matched = [];
  for (const t of trades) {
    const parsed = parseShortTag(t.zone_id);
    if (!parsed) continue;
    let best = null, bestDelta = Infinity, bestIdx = -1;
    decisions.forEach((d, idx) => {
      if (usedDecisionIdx.has(idx)) return;
      if (d.pair !== t.key || d.side !== parsed.side || d.rung !== parsed.rung) return;
      const delta = Math.abs(d.t - t.time_open);
      if (delta <= JOIN_TOLERANCE_SECS && delta < bestDelta) { best = d; bestDelta = delta; bestIdx = idx; }
    });
    if (best) {
      usedDecisionIdx.add(bestIdx);
      matched.push({ pair: t.key, side: parsed.side, rung: parsed.rung, decision: best.decision, margin: best.margin,
        win: t.profit > 0, profit: t.profit, date: t.date });
    }
  }
  console.log(`joined: ${matched.length} of ${trades.length} closed trades matched to a logged decision`
    + (trades.length - matched.length ? ` (${trades.length - matched.length} predate the decision log or fell outside the join window)` : ''));

  if (matched.length < MIN_LIVE_SAMPLE) {
    console.log(`\nCollecting ${matched.length}/${MIN_LIVE_SAMPLE} matched live trades -- too few to compare against the backtest yet.`);
    console.log(`Re-run this script periodically as paper trading accumulates; nothing below this line is trustworthy until then.`);
  }

  // Group live results by (pair, decision, margin) -- the SAME cell shape
  // the backtest itself can be sliced by.
  const liveGroups = {};
  for (const m of matched) {
    const key = `${m.pair}|${m.decision}|${m.margin}`;
    (liveGroups[key] ??= []).push(m);
  }

  console.log(`\n==== LIVE vs BACKTEST, per (pair, decision, margin) cell ====`);
  const rows = [];
  for (const [key, list] of Object.entries(liveGroups).sort()) {
    const [pair, decision, marginStr] = key.split('|');
    const margin = +marginStr;
    const liveWins = list.filter(m => m.win).length;
    const liveWinRate = +(liveWins / list.length * 100).toFixed(1);

    const file = path.join(DIR, `${pair}-votetrades.json`);
    let btWinRate = null, btN = 0;
    if (fs.existsSync(file)) {
      const d = JSON.parse(fs.readFileSync(file, 'utf8'));
      const cell = (d.trades || []).filter(t => t.decision === decision && t.margin === margin);
      btN = cell.length;
      if (btN) btWinRate = +(cell.filter(t => t.win).length / btN * 100).toFixed(1);
    }

    const flag = list.length >= MIN_LIVE_SAMPLE && btWinRate != null && Math.abs(liveWinRate - btWinRate) >= 20
      ? '  ⚠ DIVERGING' : (list.length < MIN_LIVE_SAMPLE ? '  (collecting)' : '');
    console.log(`  ${pair.toUpperCase()} ${decision} margin=${margin}: live n=${list.length} winRate=${liveWinRate}%`
      + (btWinRate != null ? `  |  backtest n=${btN} winRate=${btWinRate}%` : '  |  backtest: no cached comparison') + flag);
    rows.push({ pair, decision, margin, liveN: list.length, liveWinRate, backtestN: btN, backtestWinRate: btWinRate });
  }

  const OUT = path.join(__dirname, 'output', 'book_health_check.json');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), matchedCount: matched.length, rows }, null, 2));
  console.log(`\nWrote ${OUT}`);
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
