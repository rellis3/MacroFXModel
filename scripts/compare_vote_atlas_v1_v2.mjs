#!/usr/bin/env node
/**
 * Vote Atlas v1 (Yang-Zhang) vs v2 (HAR-RV log) — the actual portfolio-level
 * comparison, via the REAL /api/level-atlas/vote-portfolio route (not a
 * reimplementation of its concurrency-cap/sizing/portfolioStats logic, which
 * would risk silently drifting from what the real page shows). Starts the
 * server itself, hits the route twice (once per `ladder` value) with the
 * SAME pairs/config, and prints both `stats` blocks + the delta.
 *
 *   node scripts/compare_vote_atlas_v1_v2.mjs [--pairs=eurusd,gbpusd,...] [--minMargin=3] [--maxConcurrent=1]
 */
import { spawn } from 'child_process';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? 'true'];
}));

const ALL_26_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurjpy', 'eurgbp', 'euraud', 'eurcad', 'eurchf', 'eurnzd', 'gbpjpy', 'gbpaud', 'gbpcad',
  'gbpchf', 'gbpnzd', 'audjpy', 'audnzd', 'audcad', 'audchf', 'cadjpy', 'chfjpy', 'nzdjpy', 'gold'];

const pairs = args.pairs ? args.pairs.split(',') : ALL_26_PAIRS;
const minMargin = args.minMargin || '3';
const maxConcurrent = args.maxConcurrent || '1';
const PORT = args.port || '3999';

function startServer() {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PORT };
    const proc = spawn(process.execPath, ['server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let ready = false;
    const onData = (d) => {
      const s = d.toString();
      if (!ready && s.includes('MacroFX Server')) { ready = true; setTimeout(() => resolve(proc), 1500); }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', reject);
    setTimeout(() => { if (!ready) reject(new Error('server did not start within 60s')); }, 60000);
  });
}

async function fetchPortfolio(ladder) {
  const params = new URLSearchParams({ pairs: pairs.join(','), minMargin, maxConcurrent, ladder });
  const res = await fetch(`http://localhost:${PORT}/api/level-atlas/vote-portfolio?${params}`);
  return res.json();
}

function fmt(v, d = 3) { return typeof v === 'number' ? v.toFixed(d) : String(v); }

async function main() {
  console.log(`Starting server on :${PORT} ...`);
  const proc = await startServer();
  console.log(`Server ready. Comparing ${pairs.length} pairs, minMargin=${minMargin}, maxConcurrent=${maxConcurrent}\n`);
  try {
    const [v1, v2] = await Promise.all([fetchPortfolio('v1'), fetchPortfolio('v2')]);
    if (!v1.ok) { console.error('v1 FAILED:', v1.error); }
    if (!v2.ok) { console.error('v2 FAILED:', v2.error); }
    if (!v1.ok || !v2.ok) { proc.kill(); process.exit(1); }

    console.log(`v1 missing: ${v1.missing?.join(',') || '(none)'}`);
    console.log(`v2 missing: ${v2.missing?.join(',') || '(none)'}\n`);

    const keys = ['sharpe', 'cagr', 'maxDD', 'calmar', 'sortino', 'winRate', 'profitFactor', 'annVol', 'skew', 'excessKurt', 'var95', 'cvar95', 'days'];
    console.log(`${'metric'.padEnd(12)} ${'v1 (YZ)'.padStart(12)} ${'v2 (HAR-log)'.padStart(14)} ${'delta'.padStart(10)}`);
    for (const k of keys) {
      const a = v1.stats?.[k], b = v2.stats?.[k];
      if (a == null && b == null) continue;
      const delta = (typeof a === 'number' && typeof b === 'number') ? fmt(b - a) : '—';
      console.log(`${k.padEnd(12)} ${fmt(a).padStart(12)} ${fmt(b).padStart(14)} ${delta.padStart(10)}`);
    }

    console.log('\n-- per-pair standalone Sharpe --');
    console.log(`${'pair'.padEnd(9)} ${'v1'.padStart(8)} ${'v2'.padStart(8)} ${'winner'.padStart(8)}`);
    const v1pp = v1.perPair || {}, v2pp = v2.perPair || {};
    let v1wins = 0, v2wins = 0;
    for (const p of Object.keys(v1pp)) {
      const a = v1pp[p]?.ownSharpe, b = v2pp[p]?.ownSharpe;
      if (typeof a !== 'number' || typeof b !== 'number') continue;
      const w = b > a ? 'v2' : 'v1';
      if (w === 'v2') v2wins++; else v1wins++;
      console.log(`${p.padEnd(9)} ${fmt(a).padStart(8)} ${fmt(b).padStart(8)} ${w.padStart(8)}`);
    }
    console.log(`\nv1 wins ${v1wins}, v2 wins ${v2wins} (standalone per-pair Sharpe)`);
  } finally {
    proc.kill();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
