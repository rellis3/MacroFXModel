// LAYER 1 — data integrity report (plans/FORECASTER_SYSTEM_BLUEPRINT.md, plans/DATA_SPEC.md).
// Read-only. Checks the faults that have already corrupted higher layers once, so they are caught on purpose:
//   LIVE (production read-only APIs): per-instrument data source (OANDA vs Yahoo), stale forecasts, the HAR shadow
//     present, and session audits that were taken after the London session ended.
//   LOCAL (M1 research cache): coverage end, missing London weekdays, short days, NY-close stub sessions.
//   node scripts/data_integrity.mjs [--no-local]
// Writes analysis/output/data_integrity/REPORT.md and prints a one-line verdict per check.
import fs from 'fs';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { nyCloseDailyBars } from '../js/voteAtlasV4Lines.js';
import { bucketM1IntoSessions } from '../js/forecastAnalyser.js';

const BASE = 'https://macrofxmodel-production.up.railway.app';
const OUT = 'analysis/output/data_integrity';
const FX = ['audcad', 'audchf', 'audjpy', 'audnzd', 'audusd', 'cadchf', 'cadjpy', 'chfjpy', 'euraud', 'eurcad', 'eurchf', 'eurgbp',
  'eurjpy', 'eurnzd', 'eurusd', 'gbpaud', 'gbpcad', 'gbpchf', 'gbpjpy', 'gbpnzd', 'gbpusd', 'nzdcad', 'nzdjpy', 'nzdusd', 'usdcad', 'usdchf', 'usdjpy'];
const LOCAL = [...FX, 'gold', 'nq', 'spx500', 'us30', 'us2000', 'de30', 'uk100'];
const HOLIDAYS = new Set(['12-25', '01-01']);                 // FX/gold closed; other gaps are reported
const lines = [`# Data integrity report — ${new Date().toISOString()}`, '', 'Spec: plans/DATA_SPEC.md. Read-only checks.', ''];
const verdicts = [];
const say = (ok, check, detail) => { verdicts.push(`${ok ? 'OK  ' : 'FLAG'} ${check} — ${detail}`); };
const getJson = async path => { const r = await fetch(BASE + path, { signal: AbortSignal.timeout(90_000) }); if (!r.ok) throw new Error(`${path} HTTP ${r.status}`); const j = await r.json(); return j?.data ?? j; };

// ── LIVE ──────────────────────────────────────────────────────────────────────
try {
  const fc = await getJson('/api/vol-forecast');
  const inst = fc.instruments ?? {};
  const bySrc = {}, stale = [], noHar = [];
  for (const [k, v] of Object.entries(inst)) {
    (bySrc[v.data_source ?? 'unknown'] ??= []).push(k);
    if (v.stale) stale.push(k);
    if (!v.harLog) noHar.push(k);
  }
  lines.push('## Live forecast', '', `Session ${fc.session_date}, computed ${fc.computed_at}, ${Object.keys(inst).length} instruments.`, '');
  for (const [s, ks] of Object.entries(bySrc)) lines.push(`- **${s}** (${ks.length}): ${ks.join(', ')}`);
  lines.push('');
  const yahoo = bySrc.yahoo ?? [];
  say(yahoo.length === 0, 'live σ source', yahoo.length ? `${yahoo.length} instruments on Yahoo bars (${yahoo.join(', ')}): research/fits use OANDA M1, so their ladders are provisional` : 'all OANDA');
  say(stale.length === 0, 'stale forecasts', stale.length ? stale.join(', ') : 'none');
  say(noHar.length === 0, 'HAR shadow present', noHar.length ? `missing: ${noHar.join(', ')}` : `all ${Object.keys(inst).length}`);
} catch (e) { say(false, 'live forecast', `unreachable: ${e.message}`); }

try {
  const hs = await getJson('/api/har-shadow');
  const days = Object.entries(hs.days ?? {}).sort();
  const skipped = days.filter(([, d]) => d.skipped);
  lines.push('## Session audits (vol_session_<date>)', '', '| session | status |', '|---|---|',
    ...days.map(([k, d]) => `| ${k} | ${d.skipped ? 'NOT USABLE — ' + d.skipped : `ok, audited ${d.auditedAt ?? '?'}, ${d.rows.length} instruments`} |`), '');
  say(skipped.length === 0, 'session audits taken in time', `${days.length - skipped.length} usable / ${days.length} (late: ${skipped.map(([k]) => k).join(', ') || 'none'})`);
} catch (e) { say(false, 'session audits', `unreachable: ${e.message}`); }

// ── LOCAL ─────────────────────────────────────────────────────────────────────
if (!process.argv.includes('--no-local')) {
  lines.push('## Local M1 cache', '', '| instrument | first | last | missing weekdays | short days (<600 bars) | NY-close stubs (<60 bars) |', '|---|---|---|---|---|---|');
  const lastDates = [];
  for (const key of LOCAL) {
    let packed;
    try { packed = await loadM1ForPair(key); } catch (e) { lines.push(`| ${key} | load failed: ${e.message} ||||| `); continue; }
    const sessions = bucketM1IntoSessions(packed, 'Europe/London');
    const dates = [...sessions.keys()].sort();
    const have = new Set(dates);
    const missing = [];
    const d = new Date(dates[0] + 'T12:00:00Z'), end = new Date(dates.at(-1) + 'T12:00:00Z');
    for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      if ([0, 6].includes(d.getUTCDay()) || HOLIDAYS.has(iso.slice(5))) continue;
      if (!have.has(iso)) missing.push(iso);
    }
    const short = dates.filter(x => { const dw = new Date(x + 'T12:00:00Z').getUTCDay(); return dw > 0 && dw < 6 && sessions.get(x).length < 600; });
    const stubs = nyCloseDailyBars(packed).filter(b => b.n < 60).length;
    lastDates.push([key, dates.at(-1)]);
    lines.push(`| ${key} | ${dates[0]} | ${dates.at(-1)} | ${missing.length}${missing.length ? ' (latest ' + missing.slice(-3).join(', ') + ')' : ''} | ${short.length} | ${stubs} |`);
    console.log(key, dates.at(-1), 'missing', missing.length, 'short', short.length);
  }
  lines.push('');
  const newest = lastDates.map(x => x[1]).sort().at(-1);
  const behind = lastDates.filter(([, l]) => l < newest);
  const ageDays = newest ? Math.round((Date.now() - Date.parse(newest)) / 86400e3) : null;
  say(behind.length === 0, 'local M1 cache aligned', behind.length ? `behind newest (${newest}): ${behind.map(([k, l]) => `${k} ${l}`).join(', ')}` : `all end ${newest}`);
  say(ageDays != null && ageDays <= 7, 'local M1 cache fresh', `newest bar ${newest} (${ageDays} days old) — research results stop there`);
  say(true, 'daily bars for research', 'use NY-close bars from M1 (nyCloseDailyBars, n >= 60); *_d1.parquet are UTC days with Sunday stubs — do not use for σ');
}

lines.splice(4, 0, '## Verdicts', '', ...verdicts.map(v => `- ${v}`), '');
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/REPORT.md`, lines.join('\n') + '\n');
console.log('\n' + verdicts.join('\n') + `\n\nwrote ${OUT}/REPORT.md`);
