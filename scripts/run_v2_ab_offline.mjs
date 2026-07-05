#!/usr/bin/env node
/**
 * Offline re-run of the v2 adaptive-vs-fixed A/B suite — no OANDA required.
 *
 * The hosted suite (`runForecastV2Suite`) needs OANDA D1, which is unreachable
 * outside Railway. This runner rebuilds D1 sessions from the LOCAL M1 parquets
 * (VolRangeForecaster/data/m1) using OANDA's broker-day convention — a session
 * runs 22:00→22:00 UTC and is labelled with the ENDING calendar day, i.e.
 * session key = UTC date of (time + 2h). `m1ByDate` is keyed identically, so
 * every daily window walks exactly the M1 bars its D1 bar summarises (no
 * daily D1-fallback rows, the path the fill-bar-TP defect contaminated).
 *
 * Caveats vs the hosted card: history = whatever the parquets cover (2016→,
 * vs OANDA's ~2007→), session opens differ from OANDA mids by the first-M1-
 * tick convention, and NQ has no local parquet. Relative mode rankings are
 * comparable; absolute levels are not bit-identical to the OANDA-fed card.
 *
 * Usage: node scripts/run_v2_ab_offline.mjs [--horizon daily|weekly|monthly|all]
 *                                           [--pairs eurusd,gbpusd,...] [--json out.json]
 */
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { compareV2 } from '../js/volBacktestV2Engine.js';
import { writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

const DEFAULT_PAIRS = [
  ['EURUSD', 'fx'], ['GBPUSD', 'fx'], ['USDJPY', 'fx'], ['AUDUSD', 'fx'],
  ['NZDUSD', 'fx'], ['USDCAD', 'fx'], ['USDCHF', 'fx'], ['GBPJPY', 'fx'],
  ['GOLD', 'commodity'],   // NQ: no local M1 parquet — run it on Railway instead
];
const pairsArg = arg('--pairs', '');
const PAIRS = pairsArg
  ? pairsArg.split(',').map(s => [s.trim().toUpperCase(), s.trim().toLowerCase() === 'gold' ? 'commodity' : 'fx'])
  : DEFAULT_PAIRS;
const hzArg = arg('--horizon', 'all');
const HORIZONS_TO_RUN = hzArg === 'all' ? ['daily', 'weekly', 'monthly'] : [hzArg];

const MIN_BARS_PER_SESSION = 30;   // drop holiday fragments (counted in the log)

// Broker-day session builder: packed M1 → ({date,o,h,l,c}[], Map(date→m1Bars[])).
// Single-use glue for this runner (candidate brick if a second consumer appears).
function buildSessions(packed) {
  const { n, times, opens, highs, lows, closes } = packed;
  const d1 = []; const m1ByDate = new Map();
  let curDay = -1, cur = null, curBars = null, dropped = 0;
  const flush = () => {
    if (!cur) return;
    if (curBars.length >= MIN_BARS_PER_SESSION) { d1.push(cur); m1ByDate.set(cur.date, curBars); }
    else dropped++;
  };
  for (let i = 0; i < n; i++) {
    const t = times[i];
    const day = Math.floor((t + 7200) / 86400);          // 22:00 UTC boundary
    if (day !== curDay) {
      flush();
      curDay = day;
      cur = { date: new Date(day * 86400e3).toISOString().substring(0, 10),
              open: opens[i], high: highs[i], low: lows[i], close: closes[i] };
      curBars = [];
    } else {
      if (highs[i] > cur.high) cur.high = highs[i];
      if (lows[i]  < cur.low)  cur.low  = lows[i];
      cur.close = closes[i];
    }
    curBars.push({ time: t, open: opens[i], high: highs[i], low: lows[i], close: closes[i] });
  }
  flush();
  return { d1, m1ByDate, dropped };
}

// Same defaults as the vol-backtest-v2.html card.
const OPTS = { oosFrac: 0.4, slMult: 1.5, fadeMedMax: 0.30, fade75Max: 0.55, erWindow: 14 };
const MODES = ['adaptive', 'fade75', 'fadeMed', 'follow'];
const fmt = s => `${String(s.trades).padStart(4)}t win${s.winRate.toFixed(1)}% PF${s.profitFactor.toFixed(2)} exp${s.expectancy.toFixed(4)} Sh${s.sharpe.toFixed(2)} DD${s.maxDD.toFixed(1)}`;

const out = { source: 'local M1 parquets, broker-day (22:00 UTC) sessions', opts: OPTS, pairs: {} };

for (const [name, assetClass] of PAIRS) {
  const packed = await loadM1ForPair(name.toLowerCase());
  if (!packed?.n) { console.log(`${name}: NO LOCAL M1 — skipped`); continue; }
  const { d1, m1ByDate, dropped } = buildSessions(packed);
  console.log(`\n=== ${name} (${assetClass}) — ${packed.n} M1 bars → ${d1.length} sessions (${d1[0].date} → ${d1.at(-1).date}), ${dropped} fragments dropped`);

  const pair = { sessions: d1.length, from: d1[0].date, to: d1.at(-1).date, horizons: {} };
  for (const horizon of HORIZONS_TO_RUN) {
    const res = compareV2(d1, horizon === 'daily' ? m1ByDate : null, assetClass, { ...OPTS, horizon });
    pair.horizons[horizon] = res;

    console.log(`--- ${horizon} (OOS from ${res.adaptive.splitDate})`);
    for (const m of MODES) console.log(`  ${m.padEnd(8)} IS ${fmt(res[m].is)}   OOS ${fmt(res[m].oos)}`);
    const [bm, bs] = ['fade75', 'fadeMed', 'follow'].map(m => [m, res[m].oos.sharpe]).sort((a, b) => b[1] - a[1])[0];
    const a = res.adaptive.oos;
    const win = a.sharpe > bs && a.trades >= 30;
    console.log(`  verdict: adaptive OOS Sh ${a.sharpe.toFixed(2)} (${a.trades}t) vs best fixed ${bm} ${bs.toFixed(2)} → ${win ? 'ADAPTIVE WINS' : 'selector adds nothing'}`);
  }
  out.pairs[name] = pair;
}

const jsonPath = arg('--json', '');
if (jsonPath) { writeFileSync(jsonPath, JSON.stringify(out, null, 1)); console.log(`\nWrote ${jsonPath}`); }
