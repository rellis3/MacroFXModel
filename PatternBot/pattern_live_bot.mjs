#!/usr/bin/env node
/**
 * Live chart-pattern scanner. Polls live OANDA candles (via server.js's
 * /api/pattern-lab/live-candles route) across a fixed pair × timeframe grid,
 * runs the exact same detection engine (js/patternEngine.js) validated in
 * Pattern Lab, and Telegram-alerts on every NEWLY confirmed instance — a
 * pattern that just broke out, not one merely forming (see PatternBot README
 * for why: this reuses the already-validated confirmed-instance detection
 * unchanged, rather than needing a new candidate/pre-breakout detection mode).
 *
 * Deliberately reuses existing repo infrastructure instead of building new:
 *   - Live candles: /api/pattern-lab/live-candles (OANDA, extracted into
 *     js/oandaIntraday.js) — NOT the static M1 parquet, which isn't live.
 *   - Telegram: POST /api/telegram — the dashboard already holds whichever
 *     bot token/chat ID is configured (shared with every other bot in this
 *     repo); this script never touches credentials directly.
 *   - Historical stats attached to each alert come from the precomputed
 *     /api/pattern-lab/scan cache (hit rate, played-out rate, avg return for
 *     THIS exact pattern/pair/timeframe) — the whole point of alerting is to
 *     say what similar setups have actually done, not generic pattern lore.
 *   - Dedup / crash-restart state and status live in the KV store other bots
 *     already use (pattern_bot_state / pattern_bot_status), via the same
 *     /api/kv/get + /api/kv/set routes.
 *
 * Run via `node PatternBot/pattern_live_bot.mjs` — wired into start.sh as a
 * restart-on-crash background loop alongside the Python bots.
 */

import { runPatternScan } from '../js/patternEngine.js';

const DASHBOARD_URL = process.env.DASHBOARD_URL || `http://localhost:${process.env.PORT || 3000}`;
const POLL_MS = parseInt(process.env.PATTERN_BOT_POLL_MS, 10) || 10 * 60_000; // 10 min default
const REQUEST_PACE_MS = 250; // be polite to OANDA/the dashboard between requests

// Same 26-instrument set the historical study covers (M1_DRIVE_IDS + gold).
const LIVE_PAIRS = [
  'eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf', 'gbpjpy',
  'eurjpy', 'eurgbp', 'euraud', 'eurcad', 'eurchf', 'eurnzd',
  'audjpy', 'audnzd', 'audcad', 'audchf',
  'gbpaud', 'gbpcad', 'gbpchf', 'gbpnzd',
  'cadjpy', 'chfjpy', 'nzdjpy', 'gold',
];

// 1m/5m excluded — too noisy to alert on live (per the historical confidence-
// bucket study, hit rate barely clears the lower timeframes' noise floor).
// 1d excluded from v1 — moves too slowly for a 10-minute poll to matter.
const TIMEFRAMES = ['15m', '30m', '1h', '4h'];

const PATTERN_LABELS = {
  bull_flag: 'Bull Flag', bear_flag: 'Bear Flag', bull_pennant: 'Bull Pennant', bear_pennant: 'Bear Pennant',
  head_shoulders: 'Head & Shoulders', inverse_head_shoulders: 'Inverse Head & Shoulders',
  double_top: 'Double Top', double_bottom: 'Double Bottom', triple_top: 'Triple Top', triple_bottom: 'Triple Bottom',
  ascending_triangle: 'Ascending Triangle', descending_triangle: 'Descending Triangle', symmetrical_triangle: 'Symmetrical Triangle',
  channel_up: 'Channel Up', channel_down: 'Channel Down', rising_wedge: 'Rising Wedge', falling_wedge: 'Falling Wedge',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function apiGet(path) {
  const r = await fetch(`${DASHBOARD_URL}${path}`, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${path}`);
  return r.json();
}

async function apiPost(path, body) {
  const r = await fetch(`${DASHBOARD_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  return r.json().catch(() => ({ ok: false, error: 'non-JSON response' }));
}

async function kvGet(key) {
  const res = await apiGet(`/api/kv/get?key=${encodeURIComponent(key)}`);
  return res?.miss ? null : (res?.data ?? null);
}

async function kvPut(key, data) {
  return apiPost('/api/kv/set', { key, data, timestamp: Date.now() });
}

async function fetchLiveBars(pair, tf) {
  const res = await apiGet(`/api/pattern-lab/live-candles/${pair}?tf=${tf}&count=500`);
  if (!res.ok) throw new Error(res.error || 'live-candles fetch failed');
  return res.candles;
}

// Historical stats for this exact pattern type on this pair/timeframe, from
// the same cache Pattern Lab's dashboard reads — this is what makes the
// alert say something more useful than "a shape formed".
async function fetchHistoricalStat(pair, tf, type) {
  try {
    const res = await apiGet(`/api/pattern-lab/scan/${pair}?tf=${tf}`);
    if (!res.ok) return null;
    return (res.stats || []).find(s => s.type === type) || null;
  } catch {
    return null;
  }
}

function fmtPct(x) { return x == null ? 'n/a' : `${x >= 0 ? '+' : ''}${x.toFixed(2)}%`; }
function fmt1(x) { return x == null ? 'n/a' : Number(x).toFixed(1); }

function buildAlertMessage(pair, tf, inst, stat) {
  const label = PATTERN_LABELS[inst.type] || inst.type;
  const arrow = inst.direction === 'up' ? '🔼' : '🔽';
  const expectNote = inst.expectedDirection == null
    ? ''
    : inst.playedOut
      ? '\n✅ Broke as the pattern implies'
      : `\n⚠️ Failed/reversed — expected ${inst.expectedDirection}, broke ${inst.direction} instead`;

  const lines = [
    `${arrow} <b>${label}</b> — ${pair.toUpperCase()} ${tf}`,
    `Confirmed: ${new Date(inst.confirmTime * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    `Entry ${inst.outcome.entry.toFixed(5)} · Target ${inst.outcome.target.toFixed(5)} · Stop ${inst.outcome.stop.toFixed(5)}`,
    `Confidence: ${inst.confidence.total}/100${expectNote}`,
  ];

  if (stat) {
    lines.push('');
    lines.push(`<i>Historical (${stat.count} instances, this pair/timeframe):</i>`);
    lines.push(`Hit rate ${fmt1(stat.hitRatePct)}% · Avg return ${fmtPct(stat.avgForwardReturnPct)} · Avg duration ${fmt1(stat.avgDurationBars)} bars`);
    if (stat.playedOutRatePct != null) lines.push(`Plays out as expected ${fmt1(stat.playedOutRatePct)}% of the time`);
  } else {
    lines.push('');
    lines.push('<i>No historical baseline cached yet for this pair/timeframe — treat with extra caution.</i>');
  }

  return lines.join('\n');
}

async function scanPairTimeframe(pair, tf, state, alerts) {
  const bars = await fetchLiveBars(pair, tf);
  if (!bars || bars.length < 50) return null;

  const { instances } = runPatternScan(bars, {});
  const key = `${pair}:${tf}`;
  const lastSeen = state[key] ?? null;
  const isFirstRun = lastSeen == null;

  const newOnes = isFirstRun ? [] : instances.filter(i => i.confirmTime > lastSeen).sort((a, b) => a.confirmTime - b.confirmTime);
  const latestConfirm = instances.length ? Math.max(...instances.map(i => i.confirmTime)) : (lastSeen ?? Math.floor(Date.now() / 1000));

  for (const inst of newOnes) {
    const stat = await fetchHistoricalStat(pair, tf, inst.type);
    const message = buildAlertMessage(pair, tf, inst, stat);
    const res = await apiPost('/api/telegram', { message, parseMode: 'HTML' });
    if (res.ok) alerts.sent++;
    else { alerts.failed++; console.warn(`[pattern-bot] telegram send failed for ${key} ${inst.type}: ${res.error}`); }
    await sleep(500); // pace Telegram sends
  }

  return latestConfirm;
}

async function scanOnce() {
  const state = (await kvGet('pattern_bot_state')) || {};
  const newState = { ...state };
  const alerts = { sent: 0, failed: 0 };
  let errors = 0;

  for (const pair of LIVE_PAIRS) {
    for (const tf of TIMEFRAMES) {
      const key = `${pair}:${tf}`;
      try {
        const latestConfirm = await scanPairTimeframe(pair, tf, state, alerts);
        if (latestConfirm != null) newState[key] = latestConfirm;
      } catch (e) {
        errors++;
        console.warn(`[pattern-bot] ${key} failed: ${e.message}`);
      }
      await sleep(REQUEST_PACE_MS);
    }
  }

  await kvPut('pattern_bot_state', newState).catch(e => console.warn('[pattern-bot] state save failed:', e.message));
  await kvPut('pattern_bot_status', {
    lastRunAt: new Date().toISOString(),
    pairsScanned: LIVE_PAIRS.length,
    timeframesScanned: TIMEFRAMES.length,
    alertsSent: alerts.sent,
    alertsFailed: alerts.failed,
    errors,
  }).catch(e => console.warn('[pattern-bot] status save failed:', e.message));

  console.log(`[pattern-bot] cycle done: ${alerts.sent} alerts sent, ${alerts.failed} failed, ${errors} scan errors`);
}

async function main() {
  console.log(`[pattern-bot] starting — ${LIVE_PAIRS.length} pairs × ${TIMEFRAMES.length} timeframes, poll every ${Math.round(POLL_MS / 60000)}min, dashboard=${DASHBOARD_URL}`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await scanOnce();
    } catch (e) {
      console.error('[pattern-bot] cycle crashed:', e.message);
    }
    await sleep(POLL_MS);
  }
}

main();
