// node --test js/macroCapture.test.mjs : parsers on fixtures cut from the real responses (2026-11-27), plus the archive job on fakes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitCsv, parseSdmxCsv, parseRbaCsv, parseMofCsv, parseValet, parseNyFedRates, parseNyFedOps, parseOfr, parseAuctions, parseYahooIntraday, archiveMacro } from './macroCapture.js';

test('CSV split keeps quoted commas', () => {
  assert.deepEqual(splitCsv('a,"b, c",d'), ['a', 'b, c', 'd']);
  assert.deepEqual(splitCsv('B;10Y;2026-11-26;4.165', ';'), ['B', '10Y', '2026-11-26', '4.165']);
});

test('SDMX CSV (ECB, Norges Bank) reads TIME_PERIOD and OBS_VALUE by header', () => {
  const ecb = 'KEY,FREQ,TITLE,TIME_PERIOD,OBS_VALUE\nYC.B,B,"Yield curve, spot, 2-year",2026-11-24,2.97\nYC.B,B,"Yield curve, spot, 2-year",2026-11-25,2.9687\n';
  assert.deepEqual(parseSdmxCsv(ecb), [{ date: '2026-11-24', value: 2.97 }, { date: '2026-11-25', value: 2.9687 }]);
  const no = 'FREQ;Frequency;TENOR;Tenor;TIME_PERIOD;OBS_VALUE\nB;Business;10Y;10 years;2026-11-26;4.165\nB;Business;10Y;10 years;2026-11-27;\n';
  assert.deepEqual(parseSdmxCsv(no, ';'), [{ date: '2026-11-26', value: 4.165 }]);
  assert.deepEqual(parseSdmxCsv('no header'), []);
});

test('RBA table: series ids from the header block, DD-Mon-YYYY rows, blanks skipped', () => {
  const t = '﻿F2 CAPITAL MARKET YIELDS\nTitle,2y,10y\nSeries ID,FCMYGBAG2D,FCMYGBAG10D\n20-May-2013,,3.229\n25-Nov-2026,4.586,4.823\n';
  const r = parseRbaCsv(t);
  assert.deepEqual(r.FCMYGBAG2D, [{ date: '2026-11-25', value: 4.586 }]);
  assert.deepEqual(r.FCMYGBAG10D.map(p => p.date), ['2013-05-20', '2026-11-25']);
});

test('MoF JGB CSV: tenors by column, "-" is missing', () => {
  const t = 'Interest Rate,,,(Unit : %)\nDate,1Y,2Y,10Y\n1974/9/24,10.327,9.362,-\n2026/11/2,1.671,1.88,2.817\n';
  const r = parseMofCsv(t);
  assert.deepEqual(r['2Y'], [{ date: '1974-09-24', value: 9.362 }, { date: '2026-11-02', value: 1.88 }]);
  assert.deepEqual(r['10Y'], [{ date: '2026-11-02', value: 2.817 }]);
});

test('BoC Valet observations by series name', () => {
  const j = { observations: [{ d: '2026-11-25', 'BD.CDN.2YR.DQ.YLD': { v: '3.24' }, 'BD.CDN.10YR.DQ.YLD': { v: '3.65' } }, { d: '2026-11-26', 'BD.CDN.2YR.DQ.YLD': { v: '' } }] };
  const r = parseValet(j, ['BD.CDN.2YR.DQ.YLD', 'BD.CDN.10YR.DQ.YLD']);
  assert.deepEqual(r['BD.CDN.2YR.DQ.YLD'], [{ date: '2026-11-25', value: 3.24 }]);
  assert.equal(r['BD.CDN.10YR.DQ.YLD'].length, 1);
});

test('NY Fed rates: the rate, its percentiles and volume as separate series', () => {
  const j = { refRates: [{ effectiveDate: '2026-11-24', type: 'SOFR', percentRate: 3.94, percentPercentile1: 3.87, percentPercentile25: 3.92, percentPercentile75: 3.99, percentPercentile99: 4.02, volumeInBillions: 3158 }] };
  const r = parseNyFedRates(j, 'SOFR');
  assert.deepEqual(r.SOFR, [{ date: '2026-11-24', value: 3.94 }]);
  assert.equal(r.SOFR_P99[0].value, 4.02); assert.equal(r.SOFR_VOL[0].value, 3158);
});

test('NY Fed operations: $bn per day, several operations summed, other types ignored', () => {
  const j = { repo: { operations: [
    { operationDate: '2026-11-25', operationType: 'Reverse Repo', totalAmtAccepted: 300000000 },
    { operationDate: '2026-11-25', operationType: 'Reverse Repo', totalAmtAccepted: 1200000000 },
    { operationDate: '2026-11-24', operationType: 'Repo', totalAmtAccepted: 5e9 }] } };
  assert.deepEqual(parseNyFedOps(j, 'Reverse Repo'), [{ date: '2026-11-25', value: 1.5 }]);
  assert.equal(parseNyFedOps(j, null).length, 2);
});

test('OFR timeseries pairs', () => {
  assert.deepEqual(parseOfr([['2026-11-24', 3.95], ['2026-11-25', null], ['bad', 1]]), [{ date: '2026-11-24', value: 3.95 }]);
  assert.deepEqual(parseOfr('Invalid mnemonic'), []);
});

test('auctions: original term groups reopenings, bills keep their rate, shares of the competitive award', () => {
  const r = parseAuctions([
    { auctionDate: '2026-11-25T00:00:00', cusip: 'X', type: 'Note', securityType: 'Note', originalSecurityTerm: '7-Year', securityTerm: '7-Year', highYield: '4.708', bidToCoverRatio: '2.43', offeringAmount: '44000000000',
      indirectBiddersCompetitiveParAwarded: '25325938800', directBiddersCompetitiveParAwarded: '14445058100', primaryDealersCompetitiveParAwarded: '4229003100' },
    { auctionDate: '2026-10-07T00:00:00', type: 'Note', originalSecurityTerm: '10-Year', securityTerm: '9-Year 10-Month', reopening: 'Yes', highYield: '5.3' },
    { auctionDate: '2026-11-25T00:00:00', type: 'Bill', originalSecurityTerm: '17-Week', securityTerm: '17-Week', highRate: '4.115', investmentRate: '4.186', medianRate: '4.070' },
    { auctionDate: '' }]);
  assert.equal(r.length, 3);
  assert.equal(r[0].indirectShare, 0.5756); assert.equal(r[0].offeringBn, 44);
  assert.equal(r[1].term, '10-Year'); assert.equal(r[1].termLeft, '9-Year 10-Month'); assert.equal(r[1].reopening, true);
  assert.equal(r[2].highRate, 4.115); assert.equal(r[2].medianYield, 4.07); assert.equal(r[2].indirectShare, null);
});

test('Yahoo intraday: grouped by UTC date, empty bars dropped', () => {
  const t0 = Date.UTC(2026, 10, 25, 14, 30) / 1000;
  const p = { chart: { result: [{ timestamp: [t0, t0 + 900, t0 + 86400], indicators: { quote: [{ close: [99.61, null, 97.5] }] } }] } };
  const r = parseYahooIntraday(p);
  assert.deepEqual(r['2026-11-25'], { t: [t0], c: [99.61] });
  assert.deepEqual(r['2026-11-26'].c, [97.5]);
});

test('the archive job: every family written, a failing source recorded, a shorter intraday day never overwrites a fuller one', async () => {
  const wrote = [];
  const archive = { enabled: true,
    mergeSeries: async (f, id) => { wrote.push(`s:${f}/${id}`); return { wrote: true }; },
    mergeTable: async (f, id) => { wrote.push(`t:${f}/${id}`); return { wrote: true }; },
    snapshot: async (src, d) => { wrote.push(`d:${src}/${d}`); return { wrote: true }; } };
  const t0 = Date.UTC(2026, 10, 25, 15) / 1000;
  const fetchImpl = async url => {
    const ok = body => ({ ok: true, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
    if (url.includes('bankofcanada')) return ok({ observations: [{ d: '2026-11-25', 'BD.CDN.2YR.DQ.YLD': { v: '3.24' } }] });
    if (url.includes('newyorkfed') && url.includes('/rates/')) return ok({ refRates: [{ effectiveDate: '2026-11-24', percentRate: 3.9 }] });
    if (url.includes('treasurydirect') && url.includes('type=Note')) return ok([{ auctionDate: '2026-11-25', type: 'Note', originalSecurityTerm: '7-Year', highYield: '4.7' }]);
    if (url.includes('chart/%5EMOVE')) return ok({ chart: { result: [{ timestamp: [t0, t0 + 900], indicators: { quote: [{ close: [99, 98] }] } }] } });
    if (url.includes('chart/DX-Y.NYB')) return ok({ chart: { result: [{ timestamp: [t0], indicators: { quote: [{ close: [103.8] }] } }] } });
    return { ok: false, status: 503 };
  };
  const getJSON = async key => (key.includes('i15_DXY') ? { payload: { t: [1, 2, 3] } } : null);
  const r = await archiveMacro(archive, { fetchImpl, getJSON, log: {} });
  assert.equal(r.ok, true);
  assert.ok(wrote.includes('s:g10_yields/CA_2Y')); assert.ok(wrote.includes('s:nyfed/SOFR'));
  assert.ok(wrote.includes('t:ust_auctions/Note_7-Year'));
  assert.ok(wrote.includes('d:i15_MOVE/2026-11-25')); assert.ok(!wrote.some(w => w.startsWith('d:i15_DXY')), 'a fuller stored day is kept');
  assert.ok(r.failed.some(f => /rba/.test(f)), 'the failed source is named');
  assert.deepEqual(await archiveMacro({ enabled: false }), { ok: false, reason: 'R2 not configured' });
});
