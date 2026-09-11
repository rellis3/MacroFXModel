#!/usr/bin/env node
/**
 * freeze_expectation — write the `expect_<bot>` artifact a live book is ranked
 * against. Step 4 of MD files/LIVE_BACKTEST_ALIGNMENT.md.
 *
 *   node scripts/freeze_expectation.mjs --bot fib_atlas_bot_status [--supersede] [--dry-run]
 *   DASHBOARD_URL=https://macrofxmodel-production.up.railway.app
 *
 * WHAT IT WRITES. The backtest's daily return series under production config
 * (resolved server-side by /api/bot-audit/backtest-curve, so the params cannot
 * be assembled loosely here), plus a stationary-block bootstrap of the whole
 * series — 2,000 paths, mean block 5 days, the same construction the reference
 * terminal labels "4,000 paths · block 5d" — giving P1…P99 of every headline
 * metric. The daily series itself is kept in the artifact so the page can build
 * a horizon-matched cone for whatever length the live window turns out to be.
 *
 * WHAT IT REFUSES, on purpose:
 *   • A backtest the server's plausibility guard rejects. The guard exists
 *     because the one wired reference prints Sharpe 18 (FIB_ATLAS_BACKTEST_VS_LIVE.md);
 *     freezing that would put a "P0" badge on the live tiles every day forever.
 *     There is no --force. Fix the backtest, then freeze it.
 *   • Overwriting an existing expectation. An expectation is a prediction made
 *     BEFORE the live data existed; regenerating it after seeing live results
 *     destroys the test (T1 — the penalty-taker who already knows which way you
 *     dived). --supersede archives the old artifact under its own frozen_at and
 *     records `supersedes` on the new one, so the history of what was expected
 *     when is never lost.
 */
import { mulberry32, blockResample } from '../js/statsCore.js';
import { portfolioStats } from '../js/backtestStats.js';
import { execSync } from 'node:child_process';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) =>
  a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : []).filter(x => x.length));
const BOT = args.bot;
const BASE = (process.env.DASHBOARD_URL || '').replace(/\/$/, '');
if (!BOT || !BASE) { console.error('usage: DASHBOARD_URL=... node scripts/freeze_expectation.mjs --bot <status key> [--supersede] [--dry-run]'); process.exit(2); }

// Wrapped so a refusal can `return` and let the process drain its sockets.
// On Windows, process.exit() with an undici keep-alive socket still open dies
// with 0xC0000409 instead of the intended code — which a caller checking the
// exit status would read as a crash rather than a refusal.
async function main() {
const RUNS = 2000, BLOCK = 5;
const pct = (arr, ps) => { const s = [...arr].sort((a, b) => a - b); const o = {}; for (const p of ps) o['p' + p] = s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; return o; };
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };

const curve = await (await fetch(`${BASE}/api/bot-audit/backtest-curve?bot=${encodeURIComponent(BOT)}`)).json();
if (!curve.available) {
  console.error(`REFUSED — ${BOT}: ${curve.reason || curve.error}`);
  if (curve.scaleImplausible) console.error(`  reference Sharpe ${curve.refSharpe}, median day ${curve.medianDaily}%. See MD files/FIB_ATLAS_BACKTEST_VS_LIVE.md.`);
  process.exitCode = 1; return;
}
const rets = curve.daily.map(d => d.ret);
console.log(`${BOT}: ${curve.days} days ${curve.from} → ${curve.to} · ${curve.configLabel}`);

// ── bootstrap ────────────────────────────────────────────────────────────────
const rng = mulberry32(0x9e3779b9);
const acc = { totalReturn: [], cagr: [], sharpe: [], sortino: [], maxDD: [], volAnn: [], calmar: [] };
const realised = portfolioStats(rets, { periodsPerYear: 252, mc: false });
const totalOf = r => (r.reduce((e, x) => e * (1 + x / 100), 1) - 1) * 100;
for (let i = 0; i < RUNS; i++) {
  const s = blockResample(rets, rng, BLOCK);
  const ps = portfolioStats(s, { periodsPerYear: 252, mc: false });
  acc.totalReturn.push(totalOf(s)); acc.cagr.push(ps.cagr); acc.sharpe.push(ps.sharpe);
  acc.sortino.push(ps.sortino ?? 0); acc.maxDD.push(ps.maxDD); acc.volAnn.push(ps.annVol);
  acc.calmar.push(ps.maxDD < 0 ? ps.cagr / Math.abs(ps.maxDD) : 0);
}
const P = [1, 5, 10, 25, 50, 75, 90, 95, 99];
const metrics = {};
for (const [k, v] of Object.entries(acc)) metrics[k] = { ...pct(v, P), mean: mean(v), sd: sd(v) };
metrics.totalReturn.realised = totalOf(rets); metrics.cagr.realised = realised.cagr; metrics.sharpe.realised = realised.sharpe;
metrics.sortino.realised = realised.sortino ?? 0; metrics.maxDD.realised = realised.maxDD; metrics.volAnn.realised = realised.annVol;
metrics.calmar.realised = realised.maxDD < 0 ? realised.cagr / Math.abs(realised.maxDD) : 0;

let commit = null; try { commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch (e) {}
const artifact = {
  version: 1, bot: BOT, frozen_at: new Date().toISOString(), engine_commit: commit,
  source: curve.source, configLabel: curve.configLabel, config: curve.config,
  window: { from: curve.from, to: curve.to, days: curve.days, trades: curve.trades },
  bootstrap: { runs: RUNS, block: BLOCK, method: 'stationary block bootstrap of the daily return series' },
  metrics, daily: curve.daily,
};

console.log('  realised  sharpe %s  cagr %s%%  maxDD %s%%  ·  expected P50 sharpe %s  (P5 %s … P95 %s)',
  metrics.sharpe.realised.toFixed(2), metrics.cagr.realised.toFixed(1), metrics.maxDD.realised.toFixed(1),
  metrics.sharpe.p50.toFixed(2), metrics.sharpe.p5.toFixed(2), metrics.sharpe.p95.toFixed(2));

// ── never overwrite silently ─────────────────────────────────────────────────
const key = `expect_${BOT}`;
const existing = await (await fetch(`${BASE}/api/kv/get?key=${encodeURIComponent(key)}`)).json();
const prior = existing && !existing.miss ? (existing.data ?? existing) : null;
if (prior && !args.supersede) {
  console.error(`REFUSED — ${key} already exists (frozen ${prior.frozen_at}, ${prior.window?.days} days). Re-freezing after seeing live results destroys the test.`);
  console.error(`  Pass --supersede to archive it as ${key}_${(prior.frozen_at || '').slice(0, 10)} and start a NEW expectation from today.`);
  process.exitCode = 1; return;
}
if (args['dry-run']) { console.log('dry run — not written. Artifact size %d bytes.', JSON.stringify(artifact).length); process.exitCode = 0; return; }

const put = async (k, data) => {
  const r = await fetch(`${BASE}/api/kv/set`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.KV_WRITE_SECRET ? { 'X-Auth-Token': process.env.KV_WRITE_SECRET } : {}) },
    body: JSON.stringify({ key: k, data, timestamp: Date.now() }) });
  if (!r.ok) throw new Error(`${k}: HTTP ${r.status} ${await r.text()}`);
};
if (prior) {
  const archiveKey = `${key}_${(prior.frozen_at || 'unknown').slice(0, 10)}`;
  await put(archiveKey, prior);
  artifact.supersedes = { key: archiveKey, frozen_at: prior.frozen_at, engine_commit: prior.engine_commit };
  console.log(`  archived prior expectation as ${archiveKey}`);
}
await put(key, artifact);
console.log(`WROTE ${key} · frozen_at ${artifact.frozen_at} · commit ${commit}`);

}
await main();
