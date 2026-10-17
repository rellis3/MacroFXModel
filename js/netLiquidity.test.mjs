// node js/netLiquidity.test.mjs — pins net liquidity to FRED's real units.
import { netLiquidityBn, netLiquiditySeriesBn, netLiqUnitWarnings, NET_LIQ_FRED_UNITS } from './netLiquidity.js';

let fail = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!cond) fail++; };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// Real FRED prints (fredgraph CSV, fetched 2026-10-17).
const W = 6_755_639, T = 883_373, R = 0.1;
ok('Oct-2026 real prints: 6,755.639 − 883.373 − 0.1 = 5,872.166 $bn', near(netLiquidityBn(W, T, R), 5872.166, 1e-3), String(netLiquidityBn(W, T, R)));

// Late-2022 shape: RRP near its peak must move the answer by ~$2.2T, not ~$2bn.
const nl22 = netLiquidityBn(8_600_000, 400_000, 2_200);
ok('RRP in $bn is subtracted at full weight', near(nl22, 8600 - 400 - 2200), String(nl22));

// The two historical bugs, reproduced, must NOT equal the correct value.
const julyFix = W / 1000 - T - R;           // WALCL→$B, TGA left in $M
const raw     = W - T - R;                  // RRP in $B subtracted from $M
ok('the 2026-07-02 "fix" formula is wrong (≈ −TGA)', julyFix < 0 && !near(julyFix, netLiquidityBn(W, T, R), 1));
ok('the raw formula drops RRP (2022 case off by ~$2.2T)', !near((8_600_000 - 400_000 - 2_200) / 1000, nl22, 100));

ok('NaN when any input missing', Number.isNaN(netLiquidityBn(W, NaN, R)) && Number.isNaN(netLiquidityBn(W, T, null)));
const s = netLiquiditySeriesBn([W, W], [T, NaN], [R, R]);
ok('series is element-wise', near(s[0], 5872.166, 1e-3) && Number.isNaN(s[1]));

ok('sentinel quiet on real units', netLiqUnitWarnings({ walcl: [W], tga: [T], rrp: [R, 2550] }).length === 0);
ok('sentinel flags TGA delivered in $bn', netLiqUnitWarnings({ walcl: [W], tga: [883.373], rrp: [R] }).some(m => m.startsWith('WTREGEN')));
ok('sentinel flags WALCL delivered in $bn', netLiqUnitWarnings({ walcl: [6755.6], tga: [T], rrp: [R] }).some(m => m.startsWith('WALCL')));
ok('sentinel flags RRP delivered in $M', netLiqUnitWarnings({ walcl: [W], tga: [T], rrp: [2_550_000] }).some(m => m.startsWith('RRPONTSYD')));
ok('units table frozen', Object.isFrozen(NET_LIQ_FRED_UNITS) && NET_LIQ_FRED_UNITS.WTREGEN === 'millions');

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
