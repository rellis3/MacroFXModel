// js/boePath.test.mjs: the BoE priced Bank Rate path: parsing real file excerpts (tests/fixtures/boe_*), the curve arithmetic, the probability reading, the
// look-back ticks, the document the route serves and the fetchers (with fakes). No network, no clock: every "now" is passed in.
// node js/boePath.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  MPC_DATES, parseForwardRows, pickForwardSheet, parseBankRateCsv, bankRateOn, parseMpcPage, forwardAt, windowMean, readStep, pricedPath, mergeHistory,
  snapOnOrBefore, ticksFor, compactRates, buildDocument, excelSerialToISO, bankRateCsvUrl, fetchLatestCurve, fetchMpcDates, fetchBankRates, fetchArchiveSince, rowsFromWorkbook,
} from './boePath.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fx = f => fs.readFileSync(path.join(root, 'tests/fixtures', f), 'utf8');
const CUR = JSON.parse(fx('boe_ois_rows_current.json')), ARC = JSON.parse(fx('boe_ois_rows_archive_tail.json'));
const RATES = parseBankRateCsv(fx('boe_bankrate.csv'));
let n = 0; const t = async (name, fn) => { try { await fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (tol ${tol})`);

await t('Excel date serials convert to ISO dates', () => { assert.equal(excelSerialToISO(46339), '2026-11-13'); assert.equal(excelSerialToISO(25569), '1970-01-01'); });

await t('the current-month fixture parses: 1..60 months, ten business days, the last is 2026-11-13', () => {
  const p = parseForwardRows(CUR);
  assert.equal(p.months.length, 60); assert.equal(p.months[0], 1); assert.equal(p.months[59], 60);
  assert.equal(p.snaps.length, 10);
  assert.equal(p.snaps[0].d, '2026-11-02'); assert.equal(p.snaps.at(-1).d, '2026-11-13');
  assert.ok(p.snaps.every(s => s.f.length === 60 && s.f.every(v => v > 0 && v < 10)));
  near(p.snaps.at(-1).f[0], 4.056, 0.002, '1-month forward on 13 Nov');
});

await t('the archive fixture parses and ends 2026-10-30 (the archive file stops at the month end)', () => {
  const p = parseForwardRows(ARC);
  assert.equal(p.snaps.at(-1).d, '2026-10-30');
  assert.ok(p.snaps.some(s => s.d === '2026-10-16'));
});

await t('a sheet with no months header, short maturities or no dated rows is an error, never a guess', () => {
  assert.throws(() => parseForwardRows([[null, 'x'], [46334, 1, 2]]), /no "months:" header/);
  assert.throws(() => parseForwardRows([['months:', 1, 2, 3]]), /too short/);
  const hdr = CUR[0];
  assert.throws(() => parseForwardRows([hdr]), /no dated curve rows/);
  const partial = [hdr, [46334, 4.0, 4.1]];   // only two of sixty points: not a curve
  assert.throws(() => parseForwardRows(partial), /no dated curve rows/);
});

await t('the short-end forward sheet is picked by name, not by position', () => {
  assert.equal(pickForwardSheet(['info', '1. fwds, short end', '2. fwd curve', '3. spot, short end']), '1. fwds, short end');
  assert.equal(pickForwardSheet(['info', 'sheet2']), null);
});

await t('the Bank Rate CSV: 3.75 to 4 on 5 Nov 2026; the rate in force on a date is the last published on or before it', () => {
  assert.equal(bankRateOn(RATES, '2026-11-04'), 3.75); assert.equal(bankRateOn(RATES, '2026-11-05'), 4); assert.equal(bankRateOn(RATES, '2026-11-08'), 4);
  assert.equal(bankRateOn(RATES, '2026-08-01'), null);
  assert.throws(() => parseBankRateCsv('<html>blocked</html>'), /no rows/);
  assert.match(bankRateCsvUrl('2026-09-01'), /Datefrom=01\/Sep\/2026&Dateto=now&SeriesCodes=IUDBEDR/);
});

await t('compactRates keeps the change points and the last row, and the rate in force is unchanged by it', () => {
  const c = compactRates(RATES);
  assert.ok(c.length < RATES.length && c.length >= 3);
  assert.deepEqual(c.at(-1), RATES.at(-1));
  for (const d of ['2026-09-10', '2026-11-04', '2026-11-05', '2026-11-13']) assert.equal(bankRateOn(c, d), bankRateOn(RATES, d), d);
  assert.deepEqual(compactRates([]), []);
});

await t('the MPC page excerpt gives the Bank\'s sixteen dates, and our hand-kept list matches it', () => {
  const d = parseMpcPage(fx('boe_mpc_page_excerpt.html'));
  assert.equal(d.length, 16);
  assert.deepEqual(d, MPC_DATES);
  assert.ok(!d.includes('2026-09-21'), 'the page footer date (last updated) is not a meeting');
});

await t('the hand-kept MPC list is well formed: sorted, unique, all Thursdays', () => {
  assert.deepEqual([...MPC_DATES].sort(), MPC_DATES); assert.equal(new Set(MPC_DATES).size, MPC_DATES.length);
  for (const d of MPC_DATES) assert.equal(new Date(d + 'T00:00:00Z').getUTCDay(), 4, `${d} is not a Thursday`);
});

await t('forwardAt: exact on the grid, linear between, flat outside', () => {
  const months = [1, 2, 3], f = [4, 5, 7];
  assert.equal(forwardAt(months, f, 1 / 12), 4); assert.equal(forwardAt(months, f, 2 / 12), 5);
  near(forwardAt(months, f, 1.5 / 12), 4.5, 1e-9); near(forwardAt(months, f, 2.5 / 12), 6, 1e-9);
  assert.equal(forwardAt(months, f, 0), 4); assert.equal(forwardAt(months, f, 9), 7);
});

await t('windowMean averages the curve over a window; a window under a day is read at its start', () => {
  const months = [1, 2, 3], f = [4, 4, 4];
  near(windowMean(months, f, 0, 60), 4, 1e-9);
  assert.equal(windowMean(months, f, 10, 10.2), forwardAt(months, f, 10 / 365));
});

await t('readStep: 21bp is an 84% chance of a hike; 30bp is more than one step; -10bp a 40% cut; a flat step holds', () => {
  assert.deepEqual(readStep(21), { dir: 'hike', pMove: 0.84, steps: 0.84, multi: false });
  assert.deepEqual(readStep(30), { dir: 'hike', pMove: 1, steps: 1.2, multi: true });
  assert.deepEqual(readStep(-10), { dir: 'cut', pMove: 0.4, steps: 0.4, multi: false });
  assert.deepEqual(readStep(0.2), { dir: 'hold', pMove: 0, steps: 0, multi: false });
});

const PARSED = parseForwardRows(CUR);
const LATEST = { months: PARSED.months, snap: PARSED.snaps.at(-1) };

await t('a flat curve prices nothing: every meeting holds and the level stays at Bank Rate', () => {
  const months = Array.from({ length: 60 }, (_, i) => i + 1), f = months.map(() => 4.0);
  const p = pricedPath({ curve: { months, f }, valuation: '2026-11-13', bankRate: 4.0, meetings: MPC_DATES });
  assert.ok(p.rows.length >= 8);
  assert.ok(p.rows.every(r => r.dir === 'hold' && r.pMove === 0 && r.levelPct === 4));
});

await t('a curve with a step of about 25bp between the windows around a meeting reads as a near-certain hike at that meeting', () => {
  const months = Array.from({ length: 60 }, (_, i) => i + 1), f = months.map(m => (m <= 1 ? 4.0 : m >= 2 ? 4.25 : 4.125));
  const p = pricedPath({ curve: { months, f }, valuation: '2026-11-13', bankRate: 4.0, meetings: ['2026-12-28', '2027-02-04'] });   // first meeting 45 days out
  const r = p.rows[0];
  assert.equal(r.date, '2026-12-28'); assert.equal(r.dir, 'hike');
  assert.ok(r.stepBp > 15 && r.stepBp < 26, String(r.stepBp));
  near(p.rows[1].levelPct, 4.0 + (4.25 - p.baselinePct), 0.01);   // later level = Bank Rate + the cumulative rise
});

await t('the real 13 Nov curve: the next meeting is 17 Dec, the path rises, levels are anchored to the 4% Bank Rate, steps add up to the running total', () => {
  const p = pricedPath({ curve: { months: LATEST.months, f: LATEST.snap.f }, valuation: LATEST.snap.d, bankRate: 4.0, meetings: MPC_DATES });
  assert.equal(p.rows[0].date, '2026-12-17'); assert.equal(p.rows[0].daysAway, 34);
  assert.ok(p.rows.length >= 8);
  assert.ok(p.rows[0].stepBp > 5 && p.rows[0].stepBp < 45, `first step ${p.rows[0].stepBp}`);
  const sum = p.rows.reduce((a, r) => a + r.stepBp, 0);
  near(sum, p.rows.at(-1).cumBp, 0.6, 'steps add to the running total');
  for (const r of p.rows) near(r.levelPct, 4.0 + r.cumBp / 100, 0.002, 'level = Bank Rate + running total');
  assert.ok(p.levels.length >= 5 && p.levels.every(l => l.levelPct > 3 && l.levelPct < 7));
  assert.ok(p.rows.every(r => r.date > '2026-11-13'));
});

await t('history: merge keeps order, replaces a repeat date with the newer copy and caps its length', () => {
  const a = [{ d: '2026-11-02', f: [1] }, { d: '2026-11-03', f: [1] }];
  const m = mergeHistory(a, [{ d: '2026-11-03', f: [2] }, { d: '2026-11-01', f: [3] }, { bad: true }]);
  assert.deepEqual(m.map(s => s.d), ['2026-11-01', '2026-11-02', '2026-11-03']); assert.deepEqual(m[2].f, [2]);
  assert.equal(mergeHistory(m, [], 2).length, 2);
});

await t('snapOnOrBefore: the latest copy on or before a date, and null beyond the tolerance', () => {
  const h = [{ d: '2026-10-30', f: [1] }, { d: '2026-11-02', f: [1] }];
  assert.equal(snapOnOrBefore(h, '2026-11-01')?.d, '2026-10-30');
  assert.equal(snapOnOrBefore(h, '2026-11-20'), null);
  assert.equal(snapOnOrBefore(h, '2026-10-01'), null);
});

const HIST = mergeHistory([], [...parseForwardRows(ARC).snaps, ...PARSED.snaps]);

await t('ticks: 1 day, 1 week and 1 month earlier come from the copies we hold, priced against the Bank Rate then in force', () => {
  const tk = ticksFor({ hist: HIST, months: PARSED.months, valuation: '2026-11-13', meetings: MPC_DATES, rates: RATES });
  assert.equal(tk.d1.asOf, '2026-11-12'); assert.equal(tk.w1.asOf, '2026-11-06'); assert.equal(tk.m1.asOf, '2026-10-16');
  assert.equal(tk.m1.bankRate, 3.75); assert.equal(tk.w1.bankRate, 4);
  const lvl = tk.m1.byMeeting['2026-12-17'].levelPct;
  assert.ok(lvl > 3.5 && lvl < 5.5, String(lvl));
  assert.ok('2026-11-05' in tk.m1.byMeeting, 'on 16 Oct the 5 Nov meeting was still ahead, so it was priced then');
  assert.ok(!('2026-11-05' in tk.d1.byMeeting), 'on 12 Nov it had already been held');
});

await t('ticks: with no history a tick is null, not invented', () => {
  const tk = ticksFor({ hist: PARSED.snaps.slice(-1), months: PARSED.months, valuation: '2026-11-13', meetings: MPC_DATES, rates: RATES });
  assert.deepEqual(tk, { d1: null, w1: null, m1: null });
});

await t('the document: Bank Rate 4%, last change 5 Nov from 3.75, eight meetings with ticks, age in days, method stated', () => {
  const now = Date.parse('2026-11-16T15:00:00Z');
  const d = buildDocument({ latest: LATEST, hist: HIST, rates: RATES, now });
  assert.equal(d.ok, true); assert.equal(d.asOf, '2026-11-13'); assert.equal(d.curveAgeDays, 3);
  assert.equal(d.bankRate.pct, 4); assert.deepEqual(d.bankRate.lastChange, { date: '2026-11-05', from: 3.75, to: 4 });
  assert.equal(d.meetings.length, 8); assert.equal(d.meetings[0].date, '2026-12-17');
  assert.ok(d.meetings[0].ticks.d1 != null && d.meetings[0].ticks.w1 != null && d.meetings[0].ticks.m1 != null);
  assert.equal(d.meetingsInfo.stale, false); assert.equal(d.meetingsInfo.source, 'list'); assert.ok(d.meetingsInfo.remaining >= 8);
  assert.match(d.method, /Priced, not forecast/);
  assert.equal(d.historyDays, HIST.length);
});

await t('the document says so when the meeting list has run out (decided from the clock passed in, so this test never depends on today)', () => {
  const d = buildDocument({ latest: LATEST, hist: HIST, rates: RATES, now: Date.parse('2027-12-20T00:00:00Z') });
  assert.equal(d.meetingsInfo.stale, true); assert.equal(d.meetingsInfo.remaining, 0);
});

await t('the document refuses to guess: no curve, or no Bank Rate, is ok:false with the reason', () => {
  assert.equal(buildDocument({ latest: null }).ok, false);
  const d = buildDocument({ latest: LATEST, hist: HIST, rates: [], now: Date.parse('2026-11-16T00:00:00Z') });
  assert.equal(d.ok, false); assert.match(d.error, /Bank Rate/);
});

// ── fetchers, with fakes ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const stubXlsx = rows => ({ read: () => ({ SheetNames: ['info', '1. fwds, short end', '2. fwd curve'], Sheets: { '1. fwds, short end': 'S1' } }), utils: { sheet_to_json: (s, o) => { assert.equal(s, 'S1'); assert.equal(o.raw, true); return rows; } } });
const resp = (body, init = {}) => new Response(body, { status: 200, ...init });

await t('the workbook reader takes the short-end forward sheet', async () => {
  const rows = await rowsFromWorkbook(Buffer.from('x'), { loadXlsx: async () => stubXlsx(CUR) });
  assert.equal(rows, CUR);
  await assert.rejects(() => rowsFromWorkbook(Buffer.from('x'), { loadXlsx: async () => ({ read: () => ({ SheetNames: ['info'], Sheets: {} }), utils: {} }) }), /no short-end forward sheet/);
});

await t('fetchLatestCurve: a 304 means nothing new; a good zip is parsed; a blocked page or a bad status is an error', async () => {
  const seen = [];
  const f304 = async (u, i) => { seen.push(i.headers['If-Modified-Since']); return new Response(null, { status: 304 }); };
  assert.deepEqual(await fetchLatestCurve({ fetchImpl: f304, ifModifiedSince: 'Mon, 16 Nov 2026 11:05:30 GMT' }), { notModified: true, lastModified: 'Mon, 16 Nov 2026 11:05:30 GMT' });
  assert.equal(seen[0], 'Mon, 16 Nov 2026 11:05:30 GMT');
  const zip = Buffer.concat([Buffer.from('PK'), Buffer.alloc(2000, 1)]);
  const ok = await fetchLatestCurve({ fetchImpl: async () => resp(zip, { headers: { 'last-modified': 'Mon, 16 Nov 2026 11:05:30 GMT' } }), loadXlsx: async () => stubXlsx(CUR), readEntry: () => ({ data: Buffer.from('xlsx') }) });
  assert.equal(ok.snaps.length, 10); assert.equal(ok.lastModified, 'Mon, 16 Nov 2026 11:05:30 GMT'); assert.equal(ok.bytes, zip.length);
  await assert.rejects(() => fetchLatestCurve({ fetchImpl: async () => resp('<html>access denied</html>'), readEntry: () => { throw new Error('unused'); } }), /not a zip/);
  await assert.rejects(() => fetchLatestCurve({ fetchImpl: async () => new Response('x', { status: 403 }) }), /HTTP 403/);
});

await t('fetchArchiveSince keeps only snapshots from the date asked for and reports the bytes it fetched', async () => {
  const r = await fetchArchiveSince('2026-10-15', { loadXlsx: async () => stubXlsx(ARC), readRemoteEntry: async () => ({ data: Buffer.from('x'), bytesFetched: 1_500_000 }) });
  assert.ok(r.snaps.length > 0 && r.snaps.every(s => s.d >= '2026-10-15')); assert.equal(r.bytes, 1_500_000);
});

await t('fetchMpcDates reads the page; a page with a changed layout is an error so the hand list is used instead', async () => {
  const d = await fetchMpcDates({ fetchImpl: async () => resp(fx('boe_mpc_page_excerpt.html')) });
  assert.deepEqual(d, MPC_DATES);
  await assert.rejects(() => fetchMpcDates({ fetchImpl: async () => resp('<html><body>nothing here</body></html>') }), /only 0 dates/);
  await assert.rejects(() => fetchMpcDates({ fetchImpl: async () => new Response('x', { status: 500 }) }), /HTTP 500/);
});

await t('fetchBankRates parses the CSV and surfaces a bad answer', async () => {
  const r = await fetchBankRates('2026-09-01', { fetchImpl: async () => resp(fx('boe_bankrate.csv')) });
  assert.equal(r.at(-1).rate, 4);
  await assert.rejects(() => fetchBankRates('2026-09-01', { fetchImpl: async () => resp('<html>nope</html>') }), /no rows/);
});

console.log(`boePath: ${n} tests passed`);
