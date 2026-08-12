// DID THE LABELS HOLD? — score logged expectations against what price did.
//
//   node score_expectations.mjs                       score every resolvable row
//   node score_expectations.mjs --sensitivity         re-score across a threshold grid
//   node score_expectations.mjs --horizon 3           days of price to allow (default 2)
//
// THE ONLY QUESTION THAT MATTERS is not "how often did a Reject hold" but "how often
// did it hold COMPARED TO EVERY OTHER LEVEL". If call walls in calm bands hold 61% of
// the time and all levels hold 60%, the label carries nothing. So every tag is
// reported against the base rate over the same touched sample, and the report leads
// with the LIFT, not the raw percentage.
//
// DEFINITIONS ARE DECLARED HERE, NOT DISCOVERED. The thresholds below were chosen
// before any outcome was looked at, and are expressed in units of the level's own
// refMove so they mean the same thing on gold and on EUR/USD:
//
//   TOUCH      a bar's high/low comes within  tolK x refMove  of the level
//   BREAK      a bar CLOSES beyond the level by  throughK x refMove
//   REJECT     touched, then price moves  awayK x refMove  back the way it came,
//              and never breaks within the horizon
//   NEITHER    touched but did neither - counted, never silently dropped
//
// Picking these after seeing results is how the QMR free-hour artifact happened, so
// --sensitivity re-runs the whole scoring across a grid: if a conclusion only holds
// at one setting, it is not a conclusion.
import { readFileSync, existsSync } from 'fs';

const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf(n); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const has = n => { const i = argv.indexOf(n); if (i < 0) return false; argv.splice(i, 1); return true; };

const BASE    = flag('--base', 'https://macrofxmodel-production.up.railway.app');
const LOG     = flag('--log', 'oi_expect_log');
const HORIZON = parseInt(flag('--horizon', '2'), 10);      // days of price after the log
const GRAN    = flag('--gran', 'M15');
const sens    = has('--sensitivity');

const OANDA = { 'EUR/USD': 'EUR_USD', 'GBP/USD': 'GBP_USD', 'USD/JPY': 'USD_JPY',
  'AUD/USD': 'AUD_USD', 'USD/CAD': 'USD_CAD', 'USD/CHF': 'USD_CHF', 'XAU/USD': 'XAU_USD',
  'NAS100_USD': 'NAS100_USD', 'SPX500_USD': 'SPX500_USD', 'US30_USD': 'US30_USD',
  'US2000_USD': 'US2000_USD' };

const log = await (await fetch(`${BASE}/api/kv/get?key=${LOG}`)).json();
if (log.miss || !log.data || !Object.keys(log.data).length) {
  console.error(`\n${LOG} is empty - run log_expectations.mjs --write first.`);
  console.error('Nothing can be scored until at least one session has been logged AND');
  console.error(`${HORIZON} day(s) of price have passed since. This is a slow experiment by nature.\n`);
  process.exit(2);
}

const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const today = new Date().toISOString().slice(0, 10);

// Candle cache: one request per (pair, window), reused across every level.
const cache = new Map();
async function candles(pair, from, to) {
  const sym = OANDA[pair]; if (!sym) return null;
  const k = `${sym}|${from}|${to}`;
  if (cache.has(k)) return cache.get(k);
  try {
    const r = await fetch(`${BASE}/api/ohlc-range?symbol=${sym}&granularity=${GRAN}&from=${from}&to=${to}`);
    const j = await r.json();
    const v = (j.values || []).map(c => ({ h: +c.high, l: +c.low, c: +c.close })).filter(c => Number.isFinite(c.c));
    cache.set(k, v.length ? v : null);
    return cache.get(k);
  } catch { cache.set(k, null); return null; }
}

function classify(row, bars, { tolK, throughK, awayK }) {
  const ref = row.refMove;
  if (!(ref > 0) || !bars?.length) return null;
  const tol = tolK * ref, through = throughK * ref, away = awayK * ref;
  const p = row.price, from = row.spotAtLog;
  const approachFromBelow = from < p;

  let touchedAt = -1;
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].h >= p - tol && bars[i].l <= p + tol) { touchedAt = i; break; }
  }
  if (touchedAt < 0) return { outcome: 'untouched' };

  for (let i = touchedAt; i < bars.length; i++) {
    const b = bars[i];
    // BREAK first: a close beyond the level settles it, whatever happens after.
    if (approachFromBelow ? b.c > p + through : b.c < p - through) return { outcome: 'break' };
    // REJECT: pushed back the way it came, without having broken.
    if (approachFromBelow ? b.l < p - away : b.h > p + away) return { outcome: 'reject' };
  }
  return { outcome: 'neither' };
}

async function scoreAll(th) {
  const rows = [];
  for (const [date, list] of Object.entries(log.data)) {
    const to = addDays(date, HORIZON);
    if (to > today) continue;                       // not yet resolvable - never guess
    for (const row of list) {
      const bars = await candles(row.pair, date, to);
      const res = classify(row, bars, th);
      if (res) rows.push({ ...row, ...res });
    }
  }
  return rows;
}

function report(rows, th) {
  const touched = rows.filter(r => r.outcome !== 'untouched');
  if (!touched.length) { console.log('  no touched levels yet'); return; }
  const baseReject = touched.filter(r => r.outcome === 'reject').length / touched.length;

  const byTag = {};
  for (const r of touched) (byTag[r.tag] ||= []).push(r);

  console.log(`\n  tolK=${th.tolK} throughK=${th.throughK} awayK=${th.awayK}`
            + `  ·  ${rows.length} logged, ${touched.length} touched`);
  console.log(`  base rate: ${(baseReject * 100).toFixed(0)}% of ALL touched levels rejected\n`);
  console.log('  tag                        n   reject%   break%   lift vs base');
  for (const [tag, rs] of Object.entries(byTag).sort((a, b) => b[1].length - a[1].length)) {
    const rej = rs.filter(r => r.outcome === 'reject').length / rs.length;
    const brk = rs.filter(r => r.outcome === 'break').length / rs.length;
    const lift = ((rej - baseReject) * 100).toFixed(0);
    // n<20 is noise; say so rather than let a 2-sample 100% look like a finding.
    const note = rs.length < 20 ? '  (too few to read)' : '';
    console.log(`  ${tag.padEnd(24)} ${String(rs.length).padStart(3)}   ${(rej * 100).toFixed(0).padStart(6)}%  ${(brk * 100).toFixed(0).padStart(6)}%   `
      + `${lift >= 0 ? '+' : ''}${lift}pp${note}`);
  }
}

const DEFAULT = { tolK: 0.15, throughK: 0.25, awayK: 0.5 };
console.log(`\nEXPECTATION SCORING - ${Object.keys(log.data).length} logged session(s), horizon ${HORIZON}d, ${GRAN}`);

if (!sens) {
  report(await scoreAll(DEFAULT), DEFAULT);
} else {
  for (const tolK of [0.10, 0.15, 0.25]) {
    for (const throughK of [0.15, 0.25, 0.40]) {
      report(await scoreAll({ tolK, throughK, awayK: 0.5 }), { tolK, throughK, awayK: 0.5 });
    }
  }
  console.log('\n  A label that only beats the base rate at one setting has not been demonstrated.');
}
console.log('\n  Reject% is only meaningful against the base rate on the same sample.');
console.log('  A tag matching the base rate means the label adds nothing over "it is a level".');
