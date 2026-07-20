/**
 * coneForwardTrack unit tests — synthetic, no network.
 * Run: node js/coneForwardTrack.test.mjs
 */
import assert from 'node:assert/strict';
import {
  makeClaim, shouldRecord, resolveClaims, pruneStale, summarizeForward,
  CONE_FWD_HORIZON_SEC,
} from './coneForwardTrack.js';

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };

const T0 = 1_700_000_000;   // fixed epoch (no Date.now in the module)

// makeClaim
{
  const c = makeClaim('EURUSD', { anchor: 1.10, p75Lo: 1.095, p75Hi: 1.105, driftBp: 3 }, T0);
  ok(c && c.pair === 'EURUSD' && c.horizonEndSec === T0 + CONE_FWD_HORIZON_SEC, 'claim built with horizon');
  ok(!c.resolved && c.p75Lo === 1.095, 'claim fields set, unresolved');
  ok(makeClaim('X', { p75Lo: null }, T0) === null, 'null when no P75 band');
}

// shouldRecord dedupe
{
  const log = [{ pair: 'EURUSD', at: T0 }];
  ok(shouldRecord(log, 'EURUSD', T0 + 3600) === true, 'record after an hour');
  ok(shouldRecord(log, 'EURUSD', T0 + 600) === false, 'no record within the gap');
  ok(shouldRecord(log, 'GBPUSD', T0 + 60) === true, 'other pair records');
}

// resolveClaims — build a window that stays inside P75, path touches, dir up.
{
  const at = T0, hEnd = at + CONE_FWD_HORIZON_SEC;
  const claim = makeClaim('EURUSD', { anchor: 1.10, p75Lo: 1.098, p75Hi: 1.102, driftBp: 5 }, at);
  // bars covering the window: close ends at 1.101 (inside P75, up vs anchor),
  // but a wick pokes to 1.1025 (touches beyond P75Hi).
  const bars = [];
  for (let t = at; t <= hEnd + 900; t += 900) {
    bars.push({ time: t, high: 1.1005, low: 1.0995, close: 1.1005 });
  }
  bars[3].high = 1.1025;                 // intrabar poke beyond P75Hi
  bars[bars.length - 2].close = 1.101;   // final in-window close (inside band, up)
  const { log, resolved } = resolveClaims([claim], { EURUSD: bars }, hEnd + 1000);
  ok(resolved === 1 && log[0].resolved, 'claim resolved once matured + covered');
  ok(log[0].closeIn75 === true, 'close inside P75 band');
  ok(log[0].touch75 === true, 'intrabar path touched beyond P75');
  ok(log[0].dirHit === true, 'drift direction (up) matched');

  // Not resolved before maturity or without coverage.
  const fresh = makeClaim('EURUSD', { anchor: 1.1, p75Lo: 1.09, p75Hi: 1.11, driftBp: 1 }, hEnd);
  const r2 = resolveClaims([fresh], { EURUSD: bars }, hEnd + 100);   // window in the future
  ok(r2.resolved === 0 && !fresh.resolved, 'immature claim not resolved');
}

// pruneStale
{
  const keep = { resolved: true, at: T0 - 30 * 86400 };
  const stale = { resolved: false, at: T0 - 8 * 86400 };
  const recent = { resolved: false, at: T0 - 3600 };
  const out = pruneStale([keep, stale, recent], T0);
  ok(out.includes(keep) && out.includes(recent) && !out.includes(stale), 'drops only stale unresolved');
}

// summarizeForward
{
  const log = [
    { pair: 'EURUSD', resolved: true, closeIn75: true,  touch75: true,  dirHit: true },
    { pair: 'EURUSD', resolved: true, closeIn75: false, touch75: true,  dirHit: false },
    { pair: 'GOLD',   resolved: true, closeIn75: true,  touch75: false, dirHit: null },
    { pair: 'GOLD',   resolved: false },
  ];
  const s = summarizeForward(log, { trackingStart: '2026-07-01' });
  ok(s.total === 4 && s.resolved === 3 && s.pending === 1, 'counts right');
  ok(Math.abs(s.closeIn75 - 2 / 3) < 1e-3, 'aggregate close-in-75');
  ok(Math.abs(s.dirHit - 0.5) < 1e-6, 'dir hit over the 2 with a direction');
  ok(s.perPair.EURUSD.n === 2 && s.perPair.GOLD.n === 1, 'per-pair counts');
  ok(s.perPair.GOLD.dirHit === null, 'gold dir null (no directional claim resolved)');
  ok(s.claims.closeIn75 === 0.75 && s.claims.dirHit === 0.5, 'claims stated');
  ok(summarizeForward([]).resolved === 0, 'empty tolerated');
}

console.log(`coneForwardTrack.test.mjs — all assertions passed (${passed} checks)`);
