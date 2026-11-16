// node js/yield2y.test.mjs — the 2y yield parsers (js/yield2y.js), on snippets of each source's real format (2026-11-16),
// and the 5-business-day change the bias engine's policy fallback reads.
import assert from 'node:assert/strict';
import { parseEcbCsv, parseIadbCsv, parseMofCsv, parseSnbRendoeid, parseValetJson, parseRbaF2, parseFredGraphCsv, parseRbnzRows, yieldWeekChange, buildYield2yPayload } from './yield2y.js';

let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log('  ok ', name); };

await ok('ECB csvdata', () => {
  const t = 'KEY,FREQ,REF_AREA,TIME_PERIOD,OBS_VALUE,TITLE\nYC.B.U2,B,U2,2026-11-11,3.0452493418,"Euro area, AAA"\nYC.B.U2,B,U2,2026-11-12,3.0751415729,"Euro area, AAA"\n';
  assert.deepEqual(parseEcbCsv(t), [{ date: '2026-11-11', value: 3.0452493418 }, { date: '2026-11-12', value: 3.0751415729 }]);
});
await ok('BoE IADB', () => assert.deepEqual(parseIadbCsv('DATE,IUDSNPY\n10 Nov 2026,4.8471\n11 Nov 2026,4.8852\n'), [{ date: '2026-11-10', value: 4.8471 }, { date: '2026-11-11', value: 4.8852 }]));
await ok('MoF jgbcme: header row, the 2Y column, "-" skipped, footer ignored', () => {
  const t = 'Interest Rate (November 2026),,,,(Unit : %)\nDate,1Y,2Y,3Y\n2026/11/2,1.671,1.88,1.982\n2026/11/4,1.676,-,1.997\n2026/11/13,1.663,1.882,1.983\n,,,\n"If you cannot download",,,\n';
  assert.deepEqual(parseMofCsv(t), [{ date: '2026-11-02', value: 1.88 }, { date: '2026-11-13', value: 1.882 }]);
});
await ok('SNB rendoeid: interpolated to 2 years between the issues either side', () => {
  const t = '"CubeId";"rendoeid"\n\n"Date";"d0";"d1";"Value"\n"2026-10-30";"A";"R1";"0.10"\n"2026-10-30";"A";"LZ";"1.5"\n"2026-10-30";"B";"R1";"0.30"\n"2026-10-30";"B";"LZ";"2.5"\n"2026-10-30";"C";"R1";"0.9"\n"2026-10-30";"C";"LZ";"10"\n"2026-10-29";"A";"R1";"0.1"\n"2026-10-29";"A";"LZ";"1.5"\n';
  assert.deepEqual(parseSnbRendoeid(t), [{ date: '2026-10-30', value: 0.2 }]);   // 10-29 has no issue beyond 2y: skipped
});
await ok('BoC Valet JSON', () => assert.deepEqual(parseValetJson({ observations: [{ d: '2026-11-12', 'BD.CDN.2YR.DQ.YLD': { v: '3.33' } }, { d: '2026-11-10', 'BD.CDN.2YR.DQ.YLD': { v: '3.25' } }] }),
  [{ date: '2026-11-10', value: 3.25 }, { date: '2026-11-12', value: 3.33 }]));
await ok('RBA F2: the FCMYGBAG2D column after the Series ID row', () => {
  const t = 'F2 CAPITAL MARKET YIELDS\nTitle,Australian Government 2 year bond,Australian Government 3 year bond\nSeries ID,FCMYGBAG2D,FCMYGBAG3D\n20-May-2013,,3.2\n10-Nov-2026,4.744,4.666\n11-Nov-2026,4.808,4.733\n\n';
  assert.deepEqual(parseRbaF2(t), [{ date: '2026-11-10', value: 4.744 }, { date: '2026-11-11', value: 4.808 }]);
});
await ok('FRED fredgraph.csv: blanks skipped', () => assert.deepEqual(parseFredGraphCsv('observation_date,DGS2\n2026-11-10,4.73\n2026-11-11,\n2026-11-12,4.86\n'), [{ date: '2026-11-10', value: 4.73 }, { date: '2026-11-12', value: 4.86 }]));
await ok('RBNZ rows: the 2 year government bond column, Excel serial dates', () => {
  const rows = [['Series', 'Bank bill 90 days', 'Govt bond 1 year', 'Govt bond 2 year', 'Swap 2 year'], ['Unit', '%', '%', '%', '%'], ['Series Id', 'a', 'b', 'c', 'd'], [], [46336, 3.1, 3.2, 3.4, 3.6], [46337, 3.1, 3.2, 3.45, 3.6]];
  assert.deepEqual(parseRbnzRows(rows), [{ date: '2026-11-10', value: 3.4 }, { date: '2026-11-11', value: 3.45 }]);
});
await ok('week change: last 5 business days before the issue date, in bp; too short or gappy -> a reason', () => {
  const pts = ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'].map((date, i) => ({ date, value: 4.5 + i * 0.02 }));
  const w = yieldWeekChange(pts, '2026-11-13');   // the 13th is the issue day: not used
  assert.equal(w.ok, true); assert.equal(w.date, '2026-11-12'); assert.equal(w.fromDate, '2026-11-05'); assert.equal(w.weekBp, 10);
  assert.match(yieldWeekChange(pts.slice(0, 4), '2026-12-01').why, /only 4/);
  assert.match(yieldWeekChange([...pts.slice(0, 2), ...pts.slice(4).map(p => ({ ...p, date: p.date.replace('-11-', '-12-') }))], '2027-01-01').why, /gap/);
});
await ok('payload: a failed currency keeps its last good points and carries the error; nothing invented', async () => {
  const fail = async () => { throw new Error('HTTP 403'); };
  const prev = { byCcy: { GBP: { ok: true, points: [{ date: '2026-11-11', value: 4.88 }], last: { date: '2026-11-11', value: 4.88 } } } };
  const p = await buildYield2yPayload(prev, { fetchImpl: fail, fredObs: fail, loadXlsx: fail, now: Date.parse('2026-11-16T05:00:00Z') });
  assert.equal(p.byCcy.GBP.ok, false); assert.equal(p.byCcy.GBP.points.length, 1); assert.match(p.byCcy.GBP.error, /403/);
  assert.equal(p.byCcy.NZD.ok, false); assert.deepEqual(p.byCcy.NZD.points, []); assert.equal(p.byCcy.NZD.last, null);
});
console.log(`yield2y: ${n} tests passed`);
