// js/goldEtfSources.test.mjs: the issuer parsers and the per-fund chain (issuer first, Yahoo second) over fakes, plus the tonnes helpers of goldEtfFlowCore.js.
// The live files were read from a laptop on 2026-11-16: GLD 1,044.41 t / $130.63bn and IAU 460.81 t / $57.64bn, both as of 2026-11-13 (see the commit).
// node --test js/goldEtfSources.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { isoDate, parseSpdrArchive, parseIsharesPage, fundPoint, resetGldCache } from './goldEtfSources.js';
import { mergeTonnes, tonnesBlock, fetchBlock, healthParts, routeBody } from './goldEtfFlowCore.js';

const ARCHIVE = [
  ['Date', 'Closing Price', 'Ounces of Gold per Share', 'NAV/Share at 10:30am NYT', 'x', 'y', 'z', 'Daily Share Volume', 'Total Ounces of Gold in the Trust', 'Tonnes of Gold', 'Total Net Asset Value in the Trust'],
  ['18-Nov-2004', '44.38', '0.1', '44.2', '', '', '', '5992000', '260000.0', '8.09', '114920000.0'],
  ['25-Nov-2004', 'US Holiday', 'US Holiday', 'US Holiday', 'US Holiday', 'US Holiday', 'US Holiday', 'US Holiday', 'US Holiday', 'US Holiday', 'US Holiday'],
  ['12-Nov-2026', '354.89', '0.09', '354.6', '', '', '', '13634778', '33459645.18', '1040.7', '129477862299.84'],
  ['13-Nov-2026', '355.45', '0.09', '356.5', '', '', '', '11884333', '33578766.42', '1044.41', '130630860326.43'],
];
test('dates in both issuer spellings become ISO; anything else is null', () => {
  assert.equal(isoDate('13-Nov-2026'), '2026-11-13'); assert.equal(isoDate('Nov 13, 2026'), '2026-11-13'); assert.equal(isoDate('2026-11-13'), '2026-11-13');
  assert.equal(isoDate('US Holiday'), null); assert.equal(isoDate(null), null);
});
test('the SPDR archive: numeric days only (a holiday row is skipped, never filled), ascending, tonnes and net assets', () => {
  const r = parseSpdrArchive(ARCHIVE);
  assert.deepEqual(r.map(x => x.date), ['2004-11-18', '2026-11-12', '2026-11-13']);
  assert.equal(r.at(-1).tonnes, 1044.41); assert.equal(r.at(-1).aum, 130630860326.43);
  assert.throws(() => parseSpdrArchive([['nothing']]), /no Date header/); assert.throws(() => parseSpdrArchive([['Date', 'Other']]), /Tonnes of Gold/);
  assert.throws(() => parseSpdrArchive([ARCHIVE[0], ARCHIVE[2]]), /no numeric rows/);
});
const PAGE = '<div data-x="{&quot;tonnes&quot;:{&quot;visible&quot;:true,&quot;label&quot;:&quot;Tonnes in Trust&quot;,&quot;formattedValue&quot;:&quot;460.81&quot;,&quot;sortOrder&quot;:48,&quot;prefix&quot;:null,&quot;infoBubble&quot;:&quot;One metric tonne&quot;,&quot;formattedAsOfDate&quot;:&quot;Nov 13, 2026&quot;,&quot;name&quot;:&quot;tonnes&quot;},&quot;totalNetAssetsFundLevel&quot;:{&quot;visible&quot;:true,&quot;label&quot;:&quot;Net Assets of Fund&quot;,&quot;formattedValue&quot;:&quot;57,639,251,084&quot;,&quot;sortOrder&quot;:2,&quot;prefix&quot;:&quot;$&quot;,&quot;formattedAsOfDate&quot;:&quot;Nov 13, 2026&quot;,&quot;name&quot;:&quot;totalNetAssetsFundLevel&quot;}}"></div>';
test('the iShares page: tonnes, net assets and the as-of date from the escaped page data; a changed page throws, it does not guess', () => {
  assert.deepEqual(parseIsharesPage(PAGE), { tonnes: 460.81, aum: 57639251084, asOf: '2026-11-13' });
  assert.throws(() => parseIsharesPage('<html>nothing here</html>'), /no "Tonnes in Trust"/);
});

const okBody = body => async () => ({ ok: true, status: 200, text: async () => body, arrayBuffer: async () => new TextEncoder().encode(body).buffer });
const bad = status => async () => ({ ok: false, status });
test('IAU: the issuer page first; Yahoo only when the page fails, and then without tonnes', async () => {
  const a = await fundPoint('IAU', { fetchImpl: okBody(PAGE) });
  assert.equal(a.source, 'ishares'); assert.equal(a.tonnes, 460.81); assert.equal(a.asOf, '2026-11-13');
  const b = await fundPoint('IAU', { fetchImpl: bad(403), yahoo: async () => 57e9 });
  assert.equal(b.source, 'yahoo'); assert.equal(b.tonnes, null); assert.equal(b.aum, 57e9); assert.match(b.tried[0], /iShares HTTP 403/);
});
test('every source failing lists every reason, in words', async () => {
  resetGldCache();
  await assert.rejects(() => fundPoint('GLD', { fetchImpl: bad(403), loadXlsx: async () => ({}), yahoo: async () => { throw new Error('Yahoo crumb HTTP 401'); } }), /GLD: SPDR HTTP 403; Yahoo crumb HTTP 401/);
  await assert.rejects(() => fundPoint('IAU', { fetchImpl: bad(500) }), /IAU: iShares HTTP 500/);
});
test('GLD: a workbook answer is parsed (fake loader), a non-workbook answer is refused', async () => {
  resetGldCache();
  const xl = Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.alloc(2000)]);
  const fakeX = { read: () => ({ SheetNames: ['Disclaimer', 'US GLD Historical Archive'], Sheets: { 'US GLD Historical Archive': 1 } }), utils: { sheet_to_json: () => ARCHIVE } };
  const f = async () => ({ ok: true, status: 200, arrayBuffer: async () => xl.buffer.slice(xl.byteOffset, xl.byteOffset + xl.byteLength) });
  const g = await fundPoint('GLD', { fetchImpl: f, loadXlsx: async () => ({ default: fakeX }), now: 1 });
  assert.equal(g.source, 'spdr'); assert.equal(g.tonnes, 1044.41); assert.equal(g.asOf, '2026-11-13'); assert.equal(g.history.length, 3);
  resetGldCache();
  await assert.rejects(() => fundPoint('GLD', { fetchImpl: okBody('<html>blocked</html>'), loadXlsx: async () => ({}) }), /not an xlsx/);
});

test('mergeTonnes: GLD backfills from the archive, IAU accumulates from its first read; no duplicate dates', () => {
  let s = mergeTonnes([], { gld: parseSpdrArchive(ARCHIVE) });
  assert.equal(s.length, 3); assert.equal(s.at(-1).gld, 1044.41); assert.equal(s.at(-1).iau, undefined);
  s = mergeTonnes(s, { gld: parseSpdrArchive(ARCHIVE), iau: { date: '2026-11-13', tonnes: 460.81 } });
  assert.equal(s.length, 3); assert.equal(s.at(-1).iau, 460.81);
});
test('tonnesBlock: latest read of each fund, their sum on a shared date, and the change in tonnes (a flow)', () => {
  const rows = [];
  for (let i = 0; i < 25; i++) rows.push({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, gld: 1000 + i, iau: i >= 22 ? 450 + i : undefined });
  const b = tonnesBlock(rows);
  assert.equal(b.unit, 'tonnes'); assert.equal(b.last.gld.tonnes, 1024); assert.equal(b.last.iau.tonnes, 474); assert.equal(b.last.total.total, 1498);
  assert.equal(b.deltas.gld[1], 1); assert.equal(b.deltas.gld[5], 5); assert.equal(b.deltas.gld[20], 20);
  assert.equal(b.deltas.total[1], 2, 'the total only counts dates both funds were read'); assert.equal(b.deltas.total[5], null);
  assert.equal(tonnesBlock([]), null); assert.match(b.note, /not the change in dollars/);
});
test('the fetch block names its source and the data-health suffix shows it; tonnes alone still makes the route ok', () => {
  const f = fetchBlock({ haveToday: true, okAt: 1, source: { GLD: 'spdr', IAU: 'ishares' } });
  assert.deepEqual(f.source, { GLD: 'spdr', IAU: 'ishares' });
  assert.match(healthParts({}, { fetch: f }).suffix, /via GLD spdr, IAU ishares/);
  assert.match(healthParts({}, { fetch: fetchBlock({ haveToday: false, reason: 'SPDR HTTP 403 | Yahoo crumb HTTP 401' }) }).suffix, /SPDR HTTP 403/);
  assert.equal(routeBody({ series: [], tonnes: { unit: 'tonnes' }, fetch: fetchBlock({ haveToday: false, reason: 'x' }) }).ok, true);
  assert.equal(routeBody({ series: [], tonnes: null, fetch: fetchBlock({ haveToday: false, reason: 'x' }) }).ok, false);
});
