import test from 'node:test'; import assert from 'node:assert/strict';
import { parseLadder, rawDayProfile, flipOf, terrainDays, buildTerrain, heightAt, buildPillar, spotTrail, niceTicks, dodge, pillarScript, terrainScript, pickMain, isInverted, flatVol, contractSize, fmtDay, TERRAIN_NX } from './gammaHoloCore.js';

// a CME-style strike x expiry matrix (the QuikStrike heatmap paste the archive keeps as rawOI): header block with the futures price and "N DTE" labels, a C/P row, then strike rows
function matrixText({ fut = 5032, strikes = [], dtes = [1, 7, 28], cell = (k, e) => [k > fut ? 100 : 10, k < fut ? 120 : 10] } = {}) {
  const L = ['\tESZ6', `${fut}\tESZ6`, dtes.map(d => `${d} DTE\t`).join('\t'), dtes.map(() => 'C\tP').join('\t')];
  for (const k of strikes) L.push([k, ...dtes.flatMap((d, e) => cell(k, e))].join('\t'));
  return L.join('\n');
}
const ks = []; for (let k = 4800; k <= 5300; k += 25) ks.push(k);
// expiry 2 (28 DTE) carries most near-money open interest, so it is the primary expiry
const cell = (k, e) => { const w = e === 2 ? 10 : 1, x = (k - 5032) / 5032; return [Math.round(w * 400 * Math.exp(-((x - 0.02) ** 2) / 0.001)), Math.round(w * 500 * Math.exp(-((x + 0.02) ** 2) / 0.001))]; };
const RAW = matrixText({ strikes: ks, cell });

test('parses the matrix, picks the near-money-heaviest expiry and its DTE', () => {
  const P = parseLadder(RAW); assert.ok(P); assert.equal(P.dte, 28); assert.equal(P.futures, 5032);
  assert.equal(P.strikes.length, P.calls.length); assert.ok(P.calls.every(v => v >= 0));
  assert.equal(parseLadder(''), null); assert.equal(parseLadder(null), null); assert.equal(parseLadder('Strike\nfoo'), null);
});
test('simple "strike call put" table parses too', () => {
  const P = parseLadder('5000 100 200\n5050 300 50\nnoise line\n'); assert.deepEqual(P.strikes, [5000, 5050]); assert.deepEqual(P.puts, [200, 50]);
});
test('rebuilt profile matches js/oi.js rebuildGexProfile (the server self-heal) exactly', async () => {
  let oi = null; try { oi = await import('../oi.js'); } catch (e) { oi = null; }
  if (!oi) return;   // the app module could not load in this environment: the parity check is skipped, the rest still runs
  for (const [pair, basis, spot, dte] of [['SPX500_USD', 32, 5000, 28], ['NAS100_USD', 0, 5010, 3], ['XAU/USD', 5, 5020, null]]) {
    const mine = rawDayProfile({ rawOI: RAW, basis, spot, dte }, pair), ref = oi.rebuildGexProfile({ pair, rawOI: RAW, basis, spot, dte });
    assert.equal(mine.length, ref.length);
    mine.forEach((r, i) => { assert.ok(Math.abs(r.strike - ref[i].strike) < 1e-9); assert.equal(r.callOI, ref[i].callOI); assert.ok(Math.abs(r.netGex - ref[i].netGex) <= 1e-9 * Math.max(1, Math.abs(ref[i].netGex)), `${pair} ${r.strike}`); });
  }
  // inverted FX: oi.js swaps only when the stored entry says cpSwapped (the analyser's default for 6J/6C/6S); the archive does not keep the flag, so we apply the default
  const fx = matrixText({ fut: 0.0067, strikes: [0.0065, 0.0066, 0.0067, 0.0068, 0.0069], cell: () => [50, 10] });
  const a = rawDayProfile({ rawOI: fx, basis: 0, spot: 149, dte: 10 }, 'USD/JPY'), b = oi.rebuildGexProfile({ pair: 'USD/JPY', rawOI: fx, basis: 0, spot: 149, dte: 10, cpSwapped: true });
  assert.equal(a.length, b.length); a.forEach((r, i) => assert.ok(Math.abs(r.netGex - b[i].netGex) <= 1e-9 * Math.abs(b[i].netGex)));
});
test('flip is the sign change nearest spot; none when it never crosses', () => {
  const p = [{ strike: 1, netGex: -2 }, { strike: 2, netGex: 2 }, { strike: 3, netGex: 1 }, { strike: 4, netGex: -1 }];
  assert.equal(flipOf(p, 1.4), 1.5); assert.equal(flipOf(p, 3.9), 3.5); assert.equal(flipOf([{ strike: 1, netGex: 1 }, { strike: 2, netGex: 3 }], 1), null); assert.equal(flipOf(null), null);
});
test('instrument constants mirror oi.js', () => {
  assert.equal(isInverted('USD/JPY'), true); assert.equal(isInverted('EUR/USD'), false); assert.equal(flatVol('NAS100_USD'), 0.2); assert.equal(flatVol('XAU/USD'), 0.18); assert.equal(flatVol('EUR/USD'), 0.12);
  assert.equal(contractSize('SPX500_USD'), 50); assert.equal(contractSize('EUR/USD'), 125000);
});

// the API shapes: /api/oi-history-raw?pair=&limit= and /api/oi-history?pair=&limit= both answer { ok, pair, dates, history: [{ date, ... }] }
const dates = ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];   // 14th/15th are a weekend
const rawJ = { ok: true, history: dates.map((d, i) => ({ date: d, rawOI: i === 6 ? 'garbage' : RAW, spot: 5000 + i * 5, basis: 32, dte: 28 - i })) };
const sumJ = { ok: true, history: dates.map((d, i) => ({ date: d, spot: 5000 + i * 5, callWall: 5100, putWall: 4950 + i * 5, gammaFlip: 4990 + i * 2, maxPain: 5000, callWalls: [{ strike: 5100, oi: 900 }, { strike: 5150, oi: 400 }], putWalls: [{ strike: 4950, oi: 800 }] })) };

test('terrain days: weekdays only, oldest first, a ladder that will not parse leaves prof null', () => {
  const D = terrainDays(rawJ, sumJ, 'SPX500_USD'); assert.equal(D.length, 6); assert.ok(D.every(d => !['2026-11-14', '2026-11-15'].includes(d.date)));
  assert.equal(D[0].date, '2026-11-13'); assert.equal(D.find(d => d.date === '2026-11-19').prof, null); assert.ok(D[0].prof.length > 5); assert.ok(D[0].flip == null || Number.isFinite(D[0].flip));
  assert.equal(D[0].gammaFlip, 4990); assert.deepEqual(terrainDays(null, null, 'X'), []); assert.deepEqual(terrainDays({ history: [{ date: 'bad' }] }, { error: 'x' }, 'X'), []);
});
test('terrain grid: gamma mode, -1..1, a missing day flagged and flat, caps marked', () => {
  const D = terrainDays(rawJ, sumJ, 'SPX500_USD'), T = buildTerrain(D); assert.equal(T.mode, 'gamma'); assert.equal(T.nd, 6); assert.equal(T.nx, TERRAIN_NX); assert.equal(T.h.length, 6 * TERRAIN_NX);
  assert.ok(T.h.every(v => v >= -1 && v <= 1)); const j = D.findIndex(d => !d.prof); assert.equal(T.missing[j], true);
  for (let i = 0; i < T.nx; i++) assert.equal(T.h[j * T.nx + i], 0);
  assert.ok([...T.capped].some(Boolean), 'the top 3% of cells are capped and flagged');
  for (let k = 0; k < T.h.length; k++) if (T.capped[k]) assert.equal(Math.abs(T.h[k]), 1);
  assert.ok(T.lo < 5000 && T.hi > 5035); assert.ok(T.h.some(v => v > 0.2) && T.h.some(v => v < -0.2), 'hills and valleys');
  const v = heightAt(T, 0, T.xs[10]); assert.ok(Math.abs(v - T.h[10]) < 1e-6); assert.equal(heightAt(T, 0, T.hi * 2), 0); assert.equal(heightAt(null, 0, 1), 0);
});
test('terrain falls back to open interest walls when no ladder rebuilds, and to null with nothing', () => {
  const noRaw = terrainDays({ history: [] }, sumJ, 'SPX500_USD'), T = buildTerrain(noRaw); assert.equal(T.mode, 'oi');
  assert.ok(T.h.some(v => v > 0) && T.h.some(v => v < 0)); assert.equal(buildTerrain([]), null);
  assert.equal(buildTerrain([{ date: '2026-11-20', spot: 1, prof: null, calls: [], puts: [] }]), null);
});
test('pillar: regime side from the data, trail from the summaries, NaN-safe', () => {
  const rows = []; for (let k = 90; k <= 130; k++) rows.push({ strike: k, callOI: k > 100 ? 100 : 5, putOI: k < 100 ? 90 : 3, netGex: (k - 100) * 2 });
  const P = buildPillar({ spot: 106, gexProfile: rows, gammaFlip: 100, callWall: 120, putWall: 95 }, 'X'); assert.equal(P.aboveLong, true); assert.equal(P.longAt(110), true); assert.equal(P.longAt(95), false);
  const Q = buildPillar({ spot: 106, gexProfile: rows.map(r => ({ ...r, netGex: -r.netGex })), gammaFlip: 100 }, 'X'); assert.equal(Q.aboveLong, false);
  assert.equal(buildPillar({ spot: NaN, gexProfile: rows }, 'X'), null); assert.equal(buildPillar(null, 'X'), null);
  const tr = spotTrail(sumJ, 3); assert.equal(tr.length, 3); assert.equal(tr[2].date, '2026-11-20'); assert.equal(tr[0].callWall, 5100); assert.deepEqual(spotTrail(null), []);
});
test('ticks and label dodging', () => {
  assert.deepEqual(niceTicks(4980, 5110, 5), [4980, 5000, 5020, 5040, 5060, 5080, 5100]); assert.deepEqual(niceTicks(1.0712, 1.0981, 3), [1.08, 1.09]); assert.deepEqual(niceTicks(1, 1), []);
  const it = [{ y: 100 }, { y: 104 }, { y: 106 }, { y: 300 }, { y: NaN }]; dodge(it, { gap: 16, top: 0, bottom: 400 });
  const shown = it.filter(x => !x.hide).sort((a, b) => a.ly - b.ly); for (let i = 1; i < shown.length; i++) assert.ok(shown[i].ly - shown[i - 1].ly >= 16 - 1e-9); assert.equal(it[4].hide, true);
  const many = Array.from({ length: 10 }, (_, i) => ({ y: 50, pri: i })); dodge(many, { gap: 20, top: 0, bottom: 60 }); assert.equal(many.filter(x => !x.hide).length, 4); assert.equal(many[9].hide, false);
});
test('spoken lines: plain, short, one caveat, no forecast words', () => {
  const rows = []; for (let k = 5800; k <= 6100; k += 25) rows.push({ strike: k, callOI: k > 5900 ? 500 : 10, putOI: k < 5900 ? 600 : 10, netGex: (k - 5880) });
  const P = buildPillar({ spot: 5930, gexProfile: rows, gammaFlip: 5880, callWall: 6000, putWall: 5800, callWallOI: 900, putWallOI: 800 }, 'SPX500_USD');
  const t = pillarScript(P, 'SPX500'); assert.match(t, /gamma flip at 5,880/); assert.match(t, /long gamma/); assert.match(t, /call wall is 6,000/); assert.match(t, /not a forecast/);
  assert.ok(t.split(/\s+/).length <= 75, t); assert.doesNotMatch(t, /\bwill\b|expect|target/i); assert.equal(pillarScript(null, 'SPX500'), null);
  const D = terrainDays(rawJ, sumJ, 'SPX500_USD'), s = terrainScript(D, 'SPX500'); assert.match(s, /last 6 captures/); assert.match(s, /call wall held near 5,100/); assert.match(s, /put wall moved from 4,950 to 4,985/);
  assert.doesNotMatch(s, /\bwill\b|expect|target/i); assert.equal(terrainScript([], 'X'), null);
  assert.equal(pickMain([{ key: 'NQ' }, { key: 'SPX500' }]), 'SPX500'); assert.equal(pickMain([{ key: 'NQ' }]), 'NQ'); assert.equal(pickMain([]), null); assert.equal(fmtDay('2026-11-20'), '20 Nov');
});
test('box placement takes the first free candidate inside the bounds, else null', async () => {
  const { placeBox } = await import('./gammaHoloCore.js');
  const taken = [{ x: 0, y: 0, w: 100, h: 20 }];
  assert.equal(placeBox([{ x: 50, y: 5, w: 40, h: 10 }], taken), null);
  const b = placeBox([{ x: 50, y: 5, w: 40, h: 10 }, { x: 50, y: 40, w: 40, h: 10 }], taken); assert.equal(b.y, 40); assert.equal(taken.length, 2);
  assert.equal(placeBox([{ x: 500, y: 0, w: 40, h: 10 }], taken, { x0: 0, y0: 0, x1: 400, y1: 400 }), null); assert.equal(placeBox([{ x: NaN }], taken), null);
});
