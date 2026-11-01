// CBOE INTRADAY LOG — shaping and diffing the 15-minute chain snapshots.
// Pins: the window around spot, the expiry horizon, expired and empty contracts dropped, the key from Cboe's own
// timestamp, volume between two snapshots (new contracts count from zero, drops ignored), and the strike flow.
//   node js/cboeIntraday.test.mjs
import { slimSnapshot, volumeBetween, flowByStrike, parseOcc, cboeTsMs } from './cboeIntraday.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  → ' + e : ''}`); if (!c) fails++; };

const code = (root, ymd, cp, K) => `${root}${ymd}${cp}${String(Math.round(K * 1000)).padStart(8, '0')}`;
const opt = (root, ymd, cp, K, o) => ({ option: code(root, ymd, cp, K), bid: 1, ask: 1.2, open_interest: 0, volume: 0, iv: 0.2, gamma: 0.01, ...o });
const chain = (ts, spot, options) => ({ timestamp: ts, data: { current_price: spot, options } });
const T1 = '2026-10-30 14:00:00', T2 = '2026-10-30 14:15:00';

const a = slimSnapshot(chain(T1, 7000, [
  opt('SPXW', '261030', 'C', 7000, { open_interest: 100, volume: 10 }),
  opt('SPXW', '261030', 'P', 7000, { open_interest: 100, volume: 20 }),
  opt('SPXW', '261030', 'C', 8000, { open_interest: 900, volume: 5 }),     // 14% away: outside ±8%
  opt('SPXW', '261230', 'C', 7000, { open_interest: 900, volume: 5 }),     // 61 days out: outside 45
  opt('SPXW', '261029', 'C', 7000, { open_interest: 50, volume: 2 }),      // expired yesterday
  opt('SPXW', '261030', 'C', 7010, { open_interest: 0, volume: 0 }),       // empty
]));
ok('keeps only near-spot, near-dated, live contracts', a.rows.length === 2, JSON.stringify(a.rows.map(r => r[0])));
ok('key comes from Cboe\'s own timestamp', a.day === '2026-10-30' && a.hhmmss === '140000' && a.tMs === cboeTsMs(T1));
ok('columns are option, bid, ask, volume, oi, iv, gamma', a.rows[0].length === 7 && a.rows[0][3] === 10 && a.rows[0][4] === 100);
ok('bad input gives null', slimSnapshot(null) === null && slimSnapshot(chain('nope', 7000, [])) === null && slimSnapshot(chain(T1, 7000, [])) === null);

const b = slimSnapshot(chain(T2, 7005, [
  opt('SPXW', '261030', 'C', 7000, { open_interest: 100, volume: 40, gamma: 0.02 }),   // +30
  opt('SPXW', '261030', 'P', 7000, { open_interest: 100, volume: 18 }),                // volume went DOWN: ignored
  opt('SPXW', '261030', 'C', 7020, { open_interest: 10, volume: 7 }),                  // new: counts from zero
]));
const d = volumeBetween(a, b);
ok('volume between snapshots: rises only, new contracts from zero, sorted', d.length === 2 && d[0].dVol === 30 && d[1].dVol === 7 && d[0].K === 7000 && d[1].K === 7020, JSON.stringify(d.map(x => [x.K, x.dVol])));
ok('a drop in cumulative volume is never negative flow', !d.some(x => x.dVol <= 0 || x.cp === 'P'));
const f = flowByStrike(d, 7005);
ok('flow by strike splits calls and puts and weights by gamma', f.length === 2 && f[0].callVol === 30 && f[0].putVol === 0 && f[0].callGex > f[1].callGex / 3);
ok('OCC parser', parseOcc('SPXW261030C07000000')?.K === 7000 && parseOcc('SPXW261030C07000000')?.cp === 'C' && parseOcc('junk') === null);

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
