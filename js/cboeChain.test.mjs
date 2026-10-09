// CBOE CHAIN — the free delayed Cboe index-options feed → strike ladder + levels.
// Pins: contract-code parsing, trading-day DTE, expired/empty contracts dropped, the
// $-per-1% GEX formula on Cboe's own gamma, gamma vs OI walls, the flip scan, OTM
// smiles, and the DJX ×100 scale onto the US30 CFD.
//   node js/cboeChain.test.mjs
import { parseCboeChain, cboeLadder, cboeSnapshotRow, CBOE_PAIRS } from './cboeChain.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  → ' + e : ''}`); if (!c) fails++; };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= Math.max(tol, Math.abs(b) * 1e-4);

const code = (root, ymd, cp, K) => `${root}${ymd}${cp}${String(Math.round(K * 1000)).padStart(8, '0')}`;
const opt = (root, ymd, cp, K, o) => ({ option: code(root, ymd, cp, K), open_interest: 0, volume: 0, iv: 0.2, gamma: 0, delta: 0, ...o });
// Friday 2026-10-09 15:00 UTC, spot 7800.
const chain = (spot = 7800, extra = []) => ({ timestamp: '2026-10-09 15:00:00', data: { current_price: spot, options: [
  opt('SPXW', '261009', 'C', 7800, { open_interest: 1000, volume: 500, gamma: 0.01, delta: 0.5 }),
  opt('SPXW', '261009', 'P', 7800, { open_interest: 400,  volume: 300, gamma: 0.01, delta: -0.5 }),
  opt('SPXW', '261009', 'C', 7850, { open_interest: 3000, gamma: 0.004, delta: 0.2, iv: 0.15 }),
  opt('SPXW', '261009', 'P', 7700, { open_interest: 2500, gamma: 0.003, delta: -0.15, iv: 0.25 }),
  opt('SPXW', '261012', 'C', 7800, { open_interest: 800, gamma: 0.006, delta: 0.5 }),
  opt('SPXW', '261012', 'P', 7750, { open_interest: 900, gamma: 0.005, delta: -0.35 }),
  opt('SPX',  '261016', 'C', 8000, { open_interest: 9000, gamma: 0.001, delta: 0.1 }),
  opt('SPX',  '261016', 'P', 7500, { open_interest: 8000, gamma: 0.001, delta: -0.08 }),
  opt('SPXW', '261008', 'C', 7800, { open_interest: 5000, gamma: 0.02 }),        // expired yesterday
  opt('SPXW', '261009', 'C', 7900, {}),                                            // no OI, no volume
  ...extra ] } });

console.log('[parse]');
{
  const p = parseCboeChain(chain());
  ok('spot + UTC timestamp read', p.spot === 7800 && p.asOfMs === Date.UTC(2026, 9, 9, 15));
  ok('expired and empty contracts dropped', p.contracts.length === 8, String(p.contracts.length));
  const mon = p.contracts.find(c => c.exp === '2026-10-12');
  ok('Friday → Monday is 1 trading-day DTE (not 3)', mon.dte === 1, String(mon.dte));
  ok('same-day weekly is 0 DTE with ~5h to the 20:00 UTC close', p.contracts[0].dte === 0 && near(p.contracts[0].T * 365 * 24, 5, 1e-6));
  ok('AM-settled monthly root expires at the open', p.contracts.find(c => c.root === 'SPX').expMs === Date.UTC(2026, 9, 16, 13, 30));
  ok('garbage → null', parseCboeChain({}) === null && parseCboeChain({ data: { current_price: 0, options: [] } }) === null);
}

console.log('[ladder + levels]');
{
  const b = cboeLadder(parseCboeChain(chain()), { maxSeries: 2 });
  const L = b.ladder, i = L.strikes.indexOf(7800), s0 = L.series[0];
  const d = 7800 * 7800 * 0.01 * 100;
  ok('0-DTE call GEX = OI·γ·100·S²·1% (Cboe gamma)', near(s0.call[i], 1000 * 0.01 * d), `${s0.call[i]}`);
  ok('net = call − put', near(s0.net[i], (1000 - 400) * 0.01 * d));
  ok('dex = Σ delta·OI·100', near(s0.dex[i], (0.5 * 1000 - 0.5 * 400) * 100));
  ok('series nearest first, rest folded', L.series.map(s => s.label).join('|') === '0 DTE|1 DTE|later (1)', L.series.map(s => s.label).join('|'));
  ok('units flagged $ per 1%', b.units === 'usd1pct' && L.units === 'usd1pct');
  ok('gamma call wall = most near-dated call gamma: 7800 (1000·0.01 + 800·0.006), not 7850 or the 8000 monthly', b.levels.callWallGamma === 7800, String(b.levels.callWallGamma));
  ok('OI call wall = most call contracts, any expiry (8000)', b.levels.callWallOI === 8000);
  ok('max pain from the nearest expiry', Number.isFinite(b.levels.maxPain) && b.levels.maxPainExpiry === '2026-10-09');
  ok('regime follows net GEX sign', b.levels.regime === (b.levels.netGex > 0 ? 'PIN' : 'BREAKOUT'));
  ok('volume gamma split by side', b.ladder.vol.split && b.ladder.vol.volume[i] === 800 && b.ladder.vol.call[i] > 0 && b.ladder.vol.put[i] > 0);
  const sm = b.smiles.find(x => x.code === '2026-10-09');
  ok('0-DTE smile uses the OTM side: calls at/above spot, puts below', sm && sm.strikes.join(',') === '7700,7800,7850' && sm.iv.join(',') === '0.25,0.2,0.15', sm && sm.strikes.join(','));
}

console.log('[flip]');
{
  // Put-heavy below spot, call-heavy above → net gamma crosses zero between them.
  const extra = [opt('SPXW', '261012', 'P', 7600, { open_interest: 60000, iv: 0.2, gamma: 0.001 }),
                 opt('SPXW', '261012', 'C', 8000, { open_interest: 60000, iv: 0.2, gamma: 0.001 })];
  const b = cboeLadder(parseCboeChain(chain(7800, extra)));
  ok('a flip is found inside the scan', Number.isFinite(b.levels.gexFlip) && b.levels.flips.length >= 1, JSON.stringify(b.levels.flips));
  ok('flip directions are labelled', b.levels.flips.every(f => f.dir === 'long->short' || f.dir === 'short->long'));
}

console.log('[DJX scale → US30]');
{
  const dj = { timestamp: '2026-10-09 15:00:00', data: { current_price: 516, options: [
    opt('DJXW', '261009', 'C', 516, { open_interest: 100, gamma: 0.05 }), opt('DJXW', '261009', 'P', 510, { open_interest: 100, gamma: 0.04 }),
    opt('DJXW', '261012', 'C', 520, { open_interest: 50, gamma: 0.03 }) ] } };
  const b = cboeLadder(parseCboeChain(dj), { scale: CBOE_PAIRS.US30_USD.scale });
  ok('strikes and spot ×100 into Dow points', b.spot === 51600 && b.ladder.strikes.includes(51600) && b.levels.callWallGamma === 51600);
}

console.log('[snapshot row]');
{
  const b = cboeLadder(parseCboeChain(chain()));
  const row = cboeSnapshotRow(b, { spot: 7801, basis: 14, callWall: 7900, putWall: 7700, gexFlip: 7750, maxPain: 7800, exposures: { gex: -5 } });
  ok('row carries Cboe levels and the CME levels side by side', row.levels.callWallGamma === b.levels.callWallGamma && row.cme.callWall === 7900 && row.cme.gex === -5);
  ok('top strikes capped at 10', row.topStrikes.length <= 10);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
