import test from 'node:test'; import assert from 'node:assert/strict';
import { buildLadder, gammaScript, marketsWithOI, fmtPx, BINS } from './jarvisGammaCore.js';
const rows = []; for (let k = 90; k <= 130; k += 1) rows.push({ strike: k, callOI: k > 100 ? (k === 120 ? 900 : 100) : 5, putOI: k < 100 ? (k === 95 ? 700 : 80) : 3, netGex: (k - 100) * 2 });
const e = { pair: 'X', spot: 106, gexProfile: rows, gammaFlip: 100, callWall: 120, callWallOI: 900, putWall: 95, putWallOI: 700, maxPain: 108, dte: 3, ivSmile: { strikes: [90, 100, 110, 120], iv: [0.3, 0.2, 0.22, 0.28] } };
test('ladder bins hold the open interest and the walls', () => {
  const L = buildLadder(e); assert.equal(L.n, BINS); assert.equal(L.call.length, BINS);
  const inWin = f => rows.reduce((a, r) => a + (r.strike >= L.lo && r.strike < L.hi ? r[f] : 0), 0);
  assert.ok(Math.abs(L.call.reduce((a, b) => a + b, 0) - inWin('callOI')) < 1e-9);
  assert.equal(L.callWall.strike, 120); assert.equal(L.putWall.oi, 700); assert.ok(L.net.every(v => Math.abs(v) <= 1 + 1e-12));
  assert.equal(L.long, true); assert.ok(L.iv.some(v => v != null)); assert.ok(L.lo <= 95 && L.hi >= 120);
});
test('below the flip is short gamma; no profile is null', () => {
  assert.equal(buildLadder({ ...e, spot: 98 }).long, false); assert.equal(buildLadder({ spot: 1, gexProfile: [] }), null); assert.equal(buildLadder(null), null);
});
test('script is short, names both walls and the caveat, never a forecast word', () => {
  const t = gammaScript(buildLadder(e), 'NQ'); assert.ok(t.split(/\s+/).length <= 45, t); assert.match(t, /not a forecast/); assert.match(t, /call wall/); assert.match(t, /put wall/); assert.match(t, /net long gamma/);
  assert.doesNotMatch(t, /pull|pin|bounce|will /i); assert.equal(gammaScript(null, 'NQ'), null);
});
test('market list and price format', () => {
  assert.deepEqual(marketsWithOI({ NAS100_USD: { spot: 5, gexProfile: [{ strike: 5, callOI: 1, putOI: 0 }] }, 'EUR/USD': { spot: 1, gexProfile: [] } }).map(m => m.key), ['NQ']);
  assert.equal(fmtPx(27613.4), '27,613'); assert.equal(fmtPx(1.0997), '1.0997');
});
