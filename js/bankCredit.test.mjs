import assert from 'node:assert/strict';
import { parseBisCsv, growthSeries, shiftPeriod, regimeOf, buildBankCredit, bankCreditLine, indexRows } from './bankCredit.js';

const HEAD = 'FREQ,L_MEASURE,L_POSITION,L_INSTR,L_DENOM,L_CURR_TYPE,L_PARENT_CTY,L_REP_BANK_TYPE,L_REP_CTY,L_CP_SECTOR,L_CP_COUNTRY,L_POS_TYPE,DECIMALS,UNIT_MEASURE,UNIT_MULT,AVAILABILITY,TITLE_GRP,TIME_FORMAT,COLLECTION,ORG_VISIBILITY,TIME_PERIOD,OBS_VALUE,OBS_STATUS,OBS_CONF,OBS_PRE_BREAK';
const row = (m, d, s, c, t, v, p = '5J') => `Q,${m},C,A,${d},A,${p},A,5A,${s},${c},N,3,USD,6,K,,,S,E,${t},${v},A,F,`;

// shiftPeriod wraps years both ways
assert.equal(shiftPeriod('2026-Q1', -1), '2025-Q4');
assert.equal(shiftPeriod('2025-Q4', 1), '2026-Q1');
assert.equal(shiftPeriod('2026-Q1', -4), '2025-Q1');
assert.equal(shiftPeriod('2026-Q2', -20), '2021-Q2');

// regime bands are the fixed terciles from bank-credit-dollar
assert.equal(regimeOf(-1), 'contracting');
assert.equal(regimeOf(1), 'slow');
assert.equal(regimeOf(5), 'normal');
assert.equal(regimeOf(12.2), 'fast');
assert.equal(regimeOf(NaN), null);

// parser skips bad lines, keeps values in USD millions
const periods = ['2025-Q1', '2025-Q2', '2025-Q3', '2025-Q4', '2026-Q1'];
const lines = [HEAD];
for (const [i, t] of periods.entries()) {
  lines.push(row('S', 'TO1', 'A', '5J', t, 1000 + i * 30));
  lines.push(row('F', 'TO1', 'A', '5J', t, 25));
  lines.push(row('S', 'USD', 'A', '5J', t, 500 + i * 15));
  lines.push(row('F', 'USD', 'A', '5J', t, 15));
  lines.push(row('S', 'USD', 'A', 'US', t, 200));
  lines.push(row('S', 'JPY', 'A', '5J', t, 100));
  lines.push(row('F', 'JPY', 'A', '5J', t, 2));
  lines.push(row('S', 'JPY', 'A', 'JP', t, 60));
  lines.push(row('F', 'JPY', 'A', 'JP', t, 0));
  lines.push(row('S', 'USD', 'A', '5J', t, 120, 'JP'));
}
lines.push('garbage,line');
lines.push(row('S', 'TO1', 'A', '5J', '2026-Q1x', 1));
const rows = parseBisCsv(lines.join('\n'));
assert.equal(rows.length, periods.length * 10);
assert.equal(indexRows(rows).get('S|TO1|A|5J|5J').get('2026-Q1'), 1120);

// growth = 4 flows / stock 4 quarters back
const ix = indexRows(rows);
const g = growthSeries(ix.get('S|TO1|A|5J|5J'), ix.get('F|TO1|A|5J|5J'));
assert.deepEqual(g, [{ period: '2026-Q1', g: 10 }]);                    // 4 x 25 / 1000

const snap = buildBankCredit(rows, { firstSeen: { '2026-Q1': '2026-10-20' } });
assert.equal(snap.latest, '2026-Q1');
assert.equal(snap.firstSeen, '2026-10-20');
assert.equal(snap.headline.totalG, 10);
assert.equal(snap.headline.usdG, 12);                                     // 4 x 15 / 500
assert.equal(snap.headline.regime, 'fast');
assert.equal(snap.headline.usdOffshoreBn, +(0.56 - 0.2).toFixed(1));      // USD all minus USD claims on US residents
assert.equal(snap.headline.yenOffshoreG, 20);                             // (4x2 - 0) / (100 - 60)
assert.equal(snap.parents[0].code, 'JP');
assert.match(bankCreditLine(snap), /Regime context, not a forecast\.$/);
assert.throws(() => buildBankCredit([]), /total cross-border claims missing/);
console.log('bankCredit: all passed');
