// THE COME-HOME REPORT — did the unattended fortnight actually work?
//
//   node audit_holiday.mjs                    coverage + health since the first run
//   node audit_holiday.mjs --from 2026-08-04  only from a date
//
// Answers, in order, the three questions that decide whether the automated feed is
// trustworthy — and deliberately answers them SEPARATELY, because they fail in
// different ways and a single "it worked" would hide two of them:
//
//   1. DID IT RUN?          every night, or did it stop and nobody was there to see
//   2. DID IT CAPTURE?      a run that exits 0 having built 3 of 11 pairs is not a
//                           success; completeness is the failure mode, not crashes
//   3. WAS IT RIGHT?        levels logged per session, and whether price respected
//                           them — that last part is `score_expectations.mjs`, which
//                           this points you at rather than duplicating
//
// A MISSING NIGHT IS NOT RECOVERABLE. CME serves no options history, so a night that
// did not run is a permanently missing sample, not a gap to backfill later. That is
// why gaps are reported as loudly as failures rather than folded into a percentage.
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf(n); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };

const BASE = flag('--base', 'https://macrofxmodel-production.up.railway.app');
const FROM = flag('--from', null);
const JOURNAL = join(process.cwd(), 'logs', 'run_journal.jsonl');

const kvGet = async (key) => {
  try {
    const j = await (await fetch(`${BASE}/api/kv/get?key=${key}`)).json();
    return (j.miss || !j.data) ? null : j.data;
  } catch { return null; }
};

const day = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const t = new Date(s + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return day(t); };
// CME publishes no weekend settlement, so a Saturday/Sunday with no run is expected,
// not a gap. Counting them as misses would manufacture a ~29% failure rate.
const isWeekend = s => [0, 6].includes(new Date(s + 'T00:00:00Z').getUTCDay());

console.log('\n════════ UNATTENDED OI SWEEP — COME-HOME REPORT ════════');

// ── 1. DID IT RUN ────────────────────────────────────────────────────────────
let runs = [];
if (existsSync(JOURNAL)) {
  runs = readFileSync(JOURNAL, 'utf8').split(/\r?\n/).filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    .filter(r => !FROM || r.day >= FROM);
}

if (!runs.length) {
  console.log('\n  NO RUNS RECORDED.');
  console.log('  Either the scheduled task never fired, or it fired on a build without');
  console.log('  the journal. Check Task Scheduler history and oi_recon/logs/.');
} else {
  const byDay = new Map();
  for (const r of runs) byDay.set(r.day, r);        // last run of a day wins
  const days = [...byDay.keys()].sort();
  const first = days[0], last = days[days.length - 1];

  // THE WINDOW ENDS TODAY, NOT AT THE LAST RUN. Bounding it by `last` made the
  // one failure this report exists to catch invisible: when the task stopped
  // firing on 11 Aug and the machine slept for eight days, the window simply
  // ended on the 11th and the report said "0 never ran". A scheduler that stops
  // silently produces no failed runs, no logs and no journal lines - the only
  // evidence it was ever supposed to run is the calendar.
  const today = day(new Date());
  const end = last > today ? last : today;
  const expected = [];
  for (let d = first; d <= end; d = addDays(d, 1)) if (!isWeekend(d)) expected.push(d);
  const missing = expected.filter(d => !byDay.has(d));
  const failedDays = days.filter(d => !byDay.get(d).ok);

  console.log(`\n1. DID IT RUN?   ${first} → ${last}`);
  console.log(`   ${byDay.size} run(s) recorded · ${expected.length} weekday(s) in the window`);
  console.log(`   ${expected.length - missing.length} ran · ${missing.length} never ran · ${failedDays.length} ran but failed`);
  if (missing.length) {
    console.log(`\n   MISSED (unrecoverable — CME serves no history):`);
    for (const d of missing) console.log(`     ${d}`);
  }
  if (failedDays.length) {
    console.log(`\n   FAILED:`);
    for (const d of failedDays) console.log(`     ${d}  ${(byDay.get(d).failed || []).join(', ') || 'unknown stage'}`);
  }

  // ── 2. DID IT CAPTURE ──────────────────────────────────────────────────────
  console.log(`\n2. DID IT CAPTURE?`);
  console.log(`   day          target        ingest`);
  for (const d of days) {
    const r = byDay.get(d);
    const ing = (r.stages?.ingest || '').replace(/\s+/g, ' ').trim();
    console.log(`   ${d}   ${String(r.target || '?').padEnd(12)}  ${r.ok ? '' : '[FAILED] '}${ing}`);
  }
  const targets = new Set(days.map(d => byDay.get(d).target).filter(Boolean));
  if (targets.size > 1) {
    console.log(`\n   NOTE: the write target changed mid-window (${[...targets].join(' → ')}).`);
    console.log('   Sessions before and after the switch are not the same experiment.');
  }
}

// ── heartbeat: the check that survives the journal itself going missing ───────
const hb = await kvGet('oi_sweep_last');
if (hb?.at) {
  const ageH = (Date.now() - new Date(hb.at).getTime()) / 3_600_000;
  console.log(`\n   last heartbeat: ${new Date(hb.at).toLocaleString('en-GB')} `
    + `(${ageH < 48 ? ageH.toFixed(0) + 'h ago' : (ageH / 24).toFixed(0) + 'd ago'})`
    + `${hb.ok ? '' : '  ← last run reported FAILURE'}`);
} else {
  console.log('\n   last heartbeat: none recorded');
}

// ── 3. WAS IT RIGHT ──────────────────────────────────────────────────────────
const log = await kvGet('oi_expect_log');
console.log(`\n3. WAS IT RIGHT?`);
if (!log || !Object.keys(log).length) {
  console.log('   oi_expect_log is empty — nothing was logged, so nothing can be scored.');
  console.log('   Without it the fortnight produced captures but no forward record.');
} else {
  const sessions = Object.keys(log).filter(d => !FROM || d >= FROM).sort();
  const totals = sessions.map(d => (log[d] || []).length);
  const pairs = new Set(sessions.flatMap(d => (log[d] || []).map(r => r.pair)));
  console.log(`   ${sessions.length} session(s) logged · ${totals.reduce((a, b) => a + b, 0)} level claims · ${pairs.size} pair(s)`);
  if (sessions.length) console.log(`   ${sessions[0]} → ${sessions[sessions.length - 1]}`);

  // A session that logged far fewer levels than its neighbours captured a thinner
  // book — worth seeing, because it is invisible in a pass/fail exit code.
  const med = [...totals].sort((a, b) => a - b)[Math.floor(totals.length / 2)] || 0;
  const thin = sessions.filter((d, i) => med > 0 && totals[i] < med * 0.5);
  if (thin.length) {
    console.log(`\n   THIN sessions (under half the median ${med} levels) — check these captures:`);
    for (const d of thin) console.log(`     ${d}  ${(log[d] || []).length} levels`);
  }

  const tags = {};
  for (const d of sessions) for (const r of log[d] || []) tags[r.tag] = (tags[r.tag] || 0) + 1;
  console.log('\n   claims by tag:');
  for (const [t, n] of Object.entries(tags).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${String(n).padStart(4)}  ${t}`);
  }
  console.log('\n   → Now score them:  node score_expectations.mjs --sensitivity');
  console.log('     (a tag that only beats the base rate at one threshold has not been shown)');
}

console.log('\n════════════════════════════════════════════════════════\n');
