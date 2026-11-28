// node --test js/g10FreeCapture.test.mjs : parsers on fixtures cut from the real responses (2026-11-28), plus the archive job on fakes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodToDate, parseSdmxCsvSeries, parseSnbCube, snbYieldsAt, parseBojApi, parseTicMfh, parseGlcSpotRows, glcKind, normaliseTff,
  fetchTffMarket, archiveG10Free, _resetTffClock, ESTR_TYPES, TFF_MARKETS } from './g10FreeCapture.js';

test('SDMX periods become dates (month and quarter dated their first day)', () => {
  assert.equal(periodToDate('2026-11-26'), '2026-11-26');
  assert.equal(periodToDate('2026-10'), '2026-10-01');
  assert.equal(periodToDate('2026-Q4'), '2026-10-01');
  assert.equal(periodToDate('2012-Q1'), '2012-01-01');
  assert.equal(periodToDate('1999'), '1999-01-01');
  assert.equal(periodToDate('Date'), null);
});

test('ECB €STR: one response split by DATA_TYPE_EST', () => {
  const t = 'KEY,FREQ,BENCHMARK_ITEM,DATA_TYPE_EST,TIME_PERIOD,OBS_VALUE\n' +
    'EST.B.EU000A2X2A25.R25,B,EU000A2X2A25,R25,2026-11-26,2.42\nEST.B.EU000A2X2A25.TT,B,EU000A2X2A25,TT,2026-11-26,62376\n' +
    'EST.B.EU000A2X2A25.WT,B,EU000A2X2A25,WT,2026-11-25,2.444\nEST.B.EU000A2X2A25.WT,B,EU000A2X2A25,WT,2026-11-26,2.445\nEST.B.EU000A2X2A25.CM,B,EU000A2X2A25,CM,2026-11-26,0\n';
  const r = parseSdmxCsvSeries(t, row => ESTR_TYPES[row.DATA_TYPE_EST] ?? null);
  assert.deepEqual(r.ESTR, [{ date: '2026-11-25', value: 2.444 }, { date: '2026-11-26', value: 2.445 }]);
  assert.equal(r.ESTR_P25[0].value, 2.42); assert.equal(r.ESTR_VOL[0].value, 62376);
  assert.equal(r.CM, undefined, 'unmapped types are skipped');
});

test('ECB monthly BSI and quarterly BLS periods', () => {
  const m3 = 'KEY,FREQ,REF_AREA,TIME_PERIOD,OBS_VALUE\nBSI.M.U2.Y.V.M30.X.1.U2.2300.Z01.E,M,U2,2026-09,17700000\nBSI.M.U2.Y.V.M30.X.1.U2.2300.Z01.E,M,U2,2026-10,17764067\n';
  assert.deepEqual(parseSdmxCsvSeries(m3, () => 'x').x.map(p => p.date), ['2026-09-01', '2026-10-01']);
  const bls = 'KEY,FREQ,TIME_PERIOD,OBS_VALUE\nBLS.Q.U2.ALL.O.E.Z.B3.ST.S.WFNET,Q,2026-Q4,8.55228309538633\nBLS.Q.U2.ALL.O.E.Z.B3.ST.S.WFNET,Q,2023-Q1,\n';
  assert.deepEqual(parseSdmxCsvSeries(bls, () => 'x').x, [{ date: '2026-10-01', value: 8.55228309538633 }]);
});

test('IMF COFER CSV: one series per indicator, currency and unit; trailing empty columns ignored', () => {
  const t = 'DATAFLOW,COUNTRY,INDICATOR,FXR_CURRENCY,TYPE_OF_TRANSFORMATION,FREQUENCY,TIME_PERIOD,OBS_VALUE,SCALE,PRECISION\n' +
    'IMF.STA:COFER(7.0.1),G001,AFXRA,CI_AUD,NV_USD,Q,2026-Q2,296748552566.111,,,,,\n' +
    'IMF.STA:COFER(7.0.1),G001,AFXRA,CI_USD,SHRO_PT,Q,2026-Q2,56.704761505127,,,,,\n' +
    'IMF.STA:COFER(7.0.1),G001,AFXRA,CI_USD,SHRO_PT,Q,1999-Q1,71.2,,,,,\n';
  const r = parseSdmxCsvSeries(t, row => `${row.INDICATOR}_${row.FXR_CURRENCY.replace(/^CI_/, '')}_${row.TYPE_OF_TRANSFORMATION}`);
  assert.deepEqual(r.AFXRA_USD_SHRO_PT.map(p => p.date), ['1999-01-01', '2026-04-01']);
  assert.equal(r.AFXRA_AUD_NV_USD[0].value, 296748552566.111);
});

test('SNB cubes: SARON from snbgwdzid; header rows skipped', () => {
  const t = '﻿"CubeId";"snbgwdzid"\n"PublishingDate";"2026-11-23 10:00"\n\n"Date";"D0";"Value"\n"2026-11-20";"LZ";"0"\n"2026-11-20";"SARON";"-0.04"\n"2004-05-03";"SARON";\n';
  const r = parseSnbCube(t);
  assert.deepEqual(r.SARON, [{ date: '2026-11-20', value: -0.04 }]);
  assert.deepEqual(r.LZ, [{ date: '2026-11-20', value: 0 }]);
});

test('SNB rendoeid: yields at 2/5/10y interpolated between the nearest bonds either side', () => {
  const t = '"CubeId";"rendoeid"\n\n"Date";"d0";"d1";"Value"\n' +
    '"2026-10-30";"V98_2";"R1";"0.199"\n"2026-10-30";"V98_2";"LZ";"1.43888889"\n"2026-10-30";"V16_1";"R1";"0.277"\n"2026-10-30";"V16_1";"LZ";"2.64444444"\n' +
    '"2026-10-30";"V11_2";"R1";"0.393"\n"2026-10-30";"V11_2";"LZ";"4.64444444"\n"2026-10-30";"V18_1";"R1";"0.41"\n"2026-10-30";"V18_1";"LZ";"5.65833333"\n' +
    '"2010-01-01";"V07_1";"R1";\n';
  const r = snbYieldsAt(t);
  const want2 = 0.199 + (0.277 - 0.199) * (2 - 1.43888889) / (2.64444444 - 1.43888889);
  assert.equal(r[2][0].value, Math.round(want2 * 1e4) / 1e4);
  assert.equal(r[5][0].date, '2026-10-30');
  assert.equal(r[10].length, 0, 'no bond near 10y in the fixture: no point');
});

test('BoJ API: YYYYMMDD survey dates, nulls (holidays) dropped', () => {
  const j = { STATUS: 200, RESULTSET: [{ SERIES_CODE: 'STRDCLUCON', VALUES: { SURVEY_DATES: [20261101, 20261102, 20261103], VALUES: [null, 1.227, null] } }] };
  assert.deepEqual(parseBojApi(j), { STRDCLUCON: [{ date: '2026-11-02', value: 1.227 }] });
  assert.deepEqual(parseBojApi({ STATUS: 400 }), {});
});

test('TIC major foreign holders: current table and the yearly history blocks; footnotes and duplicate months', () => {
  const cur = 'Table 5: Major Foreign Holders of Treasury Securities\t\t\nBillions of dollars\t\t\n\t\t\n' +
    'Country\t2026-09\t2026-08\nJapan\t1063.1\t1068.3\nKorea, South\t139.9\t134.2\nGrand Total\t9241.2\t9316.7\nOf Which: Foreign Official\t3674.7\t3755.6\n\t\t\nNotes:\t\t\n';
  const r = parseTicMfh(cur);
  assert.deepEqual(r.map(x => x.date), ['2026-08-01', '2026-09-01']);
  assert.deepEqual(r[1], { date: '2026-09-01', JAPAN: 1063.1, KOREA: 139.9, TOTAL: 9241.2, FOREIGN_OFFICIAL: 3674.7 });
  const hist = '\t XIII\t XII\t\n\tJul\tJun\tJun\tMay\t\nCountry\t2011\t2011\t2011\t2011\t\n\t------\t------\t------\t------\t\n' +
    'United Kingdom 2/\t114.3\t125.2\t107.1\t117.5\t\n"China, Mainland"\t1173.5\t1165.5\t1159.8\t1159.8\t\nFor. Official\t3200\t3100\t3000\t2900\t\n';
  const h = parseTicMfh(hist);
  assert.deepEqual(h.map(x => x.date), ['2011-05-01', '2011-06-01', '2011-07-01']);
  assert.equal(h[1].UNITED_KINGDOM, 125.2, 'the first Jun column (the revised series) wins');
  assert.equal(h[2].CHINA_MAINLAND, 1173.5); assert.equal(h[2].FOREIGN_OFFICIAL, 3200);
});

test('BoE fitted curve sheet: tenors by the years: row, Excel serial dates', () => {
  const rows = [[null, 'UK nominal spot curve'], [], ['Maturity'], ['years:', 0.5, 1, 1.5, 2, 2.5, 3, 5, 10],
    [], [46328, 4.18, 4.33, null, 4.47, 4.55, 4.6, 4.8, 5.181], [46352, 4.11, 4.26, 4.4, 4.46, '', 4.57, 4.79, 5.13]];
  const r = parseGlcSpotRows(rows, [2, 10, 40]);
  assert.deepEqual(Object.keys(r).sort(), ['10', '2'], '40y is not in this sheet');
  assert.deepEqual(r[2], [{ date: '2026-11-02', value: 4.47 }, { date: '2026-11-26', value: 4.46 }]);
  assert.equal(r[10][0].value, 5.181);
  assert.deepEqual(parseGlcSpotRows([['no header']], [2]), {});
  assert.equal(glcKind('Root Entry/GLC Inflation daily data current month.xlsx'), 'INF');
  assert.equal(glcKind('GLC Real daily data_2016 to 2024.xlsx'), 'REAL');
  assert.equal(glcKind('GLC Nominal daily data_1979 to 1984.xlsx'), 'NOM');
  assert.equal(glcKind('Root Entry/OIS daily data current month.xlsx'), 'OIS');
});

test('TFF rows keep positions, spreads, trader counts and open interest; drop changes and percentages', () => {
  const r = normaliseTff([{ report_date_as_yyyy_mm_dd: '2026-11-17T00:00:00.000', market_and_exchange_names: 'EURO FX - CHICAGO MERCANTILE EXCHANGE', open_interest_all: '866032',
    dealer_positions_long_all: '48836', asset_mgr_positions_short: '337594', lev_money_positions_spread: '30456', traders_lev_money_long_all: '43',
    change_in_lev_money_long: '2442', pct_of_oi_lev_money_long: '13.5', conc_gross_le_4_tdr_long: '30' }]);
  assert.deepEqual(r, [{ date: '2026-11-17', open_interest_all: 866032, dealer_positions_long_all: 48836, asset_mgr_positions_short: 337594, lev_money_positions_spread: 30456, traders_lev_money_long_all: 43 }]);
});

test('TFF: old and renamed contracts stitched; the newer name wins a shared date; every market has a name', async () => {
  const seen = [];
  const fetchImpl = async url => {
    const name = new URL(url).searchParams.get('market_and_exchange_names'); seen.push(name);
    const rows = name.startsWith('2-YEAR') ? [{ report_date_as_yyyy_mm_dd: '2006-06-13T00:00:00.000', open_interest_all: '1' }, { report_date_as_yyyy_mm_dd: '2022-02-01T00:00:00.000', open_interest_all: '2' }]
      : [{ report_date_as_yyyy_mm_dd: '2022-02-01T00:00:00.000', open_interest_all: '3' }, { report_date_as_yyyy_mm_dd: '2022-02-08T00:00:00.000', open_interest_all: '4' }];
    return { ok: true, headers: new Map(), json: async () => rows };
  };
  const r = await fetchTffMarket(TFF_MARKETS.find(m => m.sym === 'TU'), { fetchImpl });
  assert.deepEqual(r.map(x => [x.date, x.open_interest_all]), [['2006-06-13', 1], ['2022-02-01', 3], ['2022-02-08', 4]]);
  assert.equal(seen.length, 2);
  assert.ok(TFF_MARKETS.every(m => m.sym && m.names.length));
  assert.equal(new Set(TFF_MARKETS.map(m => m.sym)).size, TFF_MARKETS.length);
});

test('the archive job: families written, failures recorded not thrown, TFF weekly', async () => {
  _resetTffClock();
  const wrote = [];
  const archive = { enabled: true,
    mergeSeries: async (f, id) => { wrote.push(`s:${f}/${id}`); return { wrote: true }; },
    mergeTable: async (f, id) => { wrote.push(`t:${f}/${id}`); return { wrote: true }; } };
  const ok = (body, text) => ({ ok: true, headers: new Map(), json: async () => body, text: async () => text ?? JSON.stringify(body) });
  const fetchImpl = async url => {
    if (url.includes('stat-search.boj')) return ok({ RESULTSET: [{ SERIES_CODE: new URL(url).searchParams.get('code'), VALUES: { SURVEY_DATES: [20261125], VALUES: [1.227] } }] });
    if (url.includes('snbgwdzid')) return ok(null, '"Date";"D0";"Value"\n"2026-11-20";"SARON";"-0.04"\n');
    if (url.includes('data-api.ecb') && url.includes('/EST/')) return ok(null, 'KEY,DATA_TYPE_EST,TIME_PERIOD,OBS_VALUE\nX,WT,2026-11-26,2.445\n');
    if (url.includes('slt_table5')) return ok(null, 'Country\t2026-09\nJapan\t1063.1\n');
    if (url.includes('publicreporting.cftc')) return ok([{ report_date_as_yyyy_mm_dd: '2026-11-17T00:00:00.000', open_interest_all: '5' }]);
    return { ok: false, status: 503, headers: new Map() };
  };
  const fetchBoe = async id => { if (id === 'BOE_RPWB56A') return [{ date: '2026-11-18', value: 646914 }]; throw new Error('BoE down'); };
  const xlsx = { CFB: { read: () => { throw new Error('bad zip'); } } };
  const t = 1e12;
  const r = await archiveG10Free(archive, { fetchImpl, fetchBoe, xlsx, log: {}, now: () => t, wait: async () => {} });
  assert.equal(r.ok, true);
  for (const k of ['s:boe/RESERVES', 's:overnight/TONA', 's:overnight/SARON', 's:ecb/ESTR', 't:tic/major_foreign_holders', 't:cftc_tff/EUR', 't:cftc_tff/TU'])
    assert.ok(wrote.includes(k), `${k} written`);
  assert.equal(r.tff, TFF_MARKETS.length);
  assert.ok(r.failed.some(f => /boe IUDSNZC/.test(f)), 'a failed BoE code is named');
  assert.ok(r.failed.some(f => /glc/.test(f)) && r.failed.some(f => /cofer/.test(f)) && r.failed.some(f => /rendoeid/.test(f)));
  // a second run the same week skips TFF
  wrote.length = 0;
  const r2 = await archiveG10Free(archive, { fetchImpl, fetchBoe, xlsx, log: {}, now: () => t + 864e5, wait: async () => {} });
  assert.equal(r2.tff, 0); assert.ok(!wrote.some(w => w.startsWith('t:cftc_tff')));
  assert.deepEqual(await archiveG10Free({ enabled: false }), { ok: false, reason: 'R2 not configured' });
});
