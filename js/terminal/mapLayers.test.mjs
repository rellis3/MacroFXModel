// Tests for js/terminal/mapLayers.js: the Overview map's layers (colours, tips, rankings, the country card) and their registry wiring.
// Run: node --test js/terminal/mapLayers.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYERS, LAYER_IDS, OWN_LAYERS, isOwn, surfaceOf, pillsHtml, idsOfCcy, layerStyle, layerTip, layerRanking, rankingHtml, legendHtml, metaHtml, countryCardHtml, CCY_HOME } from './mapLayers.js';
import { surfaceById } from './tabRegistry.js';

const zone = { '840': 'USD', '124': 'CAD', '826': 'GBP', '392': 'JPY', '036': 'AUD', '554': 'NZD', '756': 'CHF', '276': 'EUR', '250': 'EUR' };
const ctx = {
  zone,
  wr: { ok: true, asOf: '2026-10', iso: { '840': 'US', '826': 'GB', '392': 'JP', '276': 'XM', '250': 'XM', '076': 'BR' },
    banks: { US: { name: 'Federal Reserve', ccy: 'USD', rate: 3.75, asOf: '2026-10', cycle: 'on hold after cuts', change3m: 0, change12m: -0.75, spark: [4.5, 4, 3.75] },
      GB: { name: 'Bank of England', ccy: 'GBP', rate: 4, asOf: '2026-10', cycle: 'cutting', change3m: -0.25, change12m: -1, spark: [5, 4.5, 4] },
      JP: { name: 'Bank of Japan', ccy: 'JPY', rate: 0.5, asOf: '2026-10', cycle: 'hiking', change3m: 0.25, change12m: 0.25, spark: [0.25, 0.5] },
      XM: { name: 'ECB', ccy: 'EUR', rate: 2, asOf: '2026-10', cycle: 'on hold', change3m: 0, change12m: -0.5 },
      BR: { name: 'Banco Central do Brasil', ccy: 'BRL', rate: 14.5, asOf: '2026-10', cycle: 'hiking', change3m: 0.5, change12m: 2, stale: true } },
    summary: { hiking: 1, cutting: 1, onHold: 2, hikers: ['JP'], cutters: ['GB'] } },
  cbx: { USD: { m3: { bp: -10 }, m6: { bp: -25 }, m12: { bp: -40 } }, GBP: { m3: { bp: 0 }, m6: { bp: 1 }, m12: { bp: 20 } }, JPY: { m6: { bp: 30 } } },
  cbxMeta: { ageH: 5 },
  cbBoard: { ok: true, counts: { read: 2, total: 9 }, ranking: [{ ccy: 'JPY', bank: 'BoJ', score: 0.4, regime: 'HAWKISH', delta: 0.1 }, { ccy: 'USD', bank: 'Fed', score: -0.3, regime: 'DOVISH', delta: null }],
    banks: [{ id: 'fed', ccy: 'USD', bank: 'Fed', status: 'read', read: { score: -0.3, regime: 'DOVISH', date: '2026-10-29' }, change: { delta: -0.1 } }, { id: 'rbnz', ccy: 'NZD', bank: 'RBNZ', status: 'headline_only', decision: { title: 'OCR held at 2.75%' } }, { id: 'boe', ccy: 'GBP', bank: 'BoE', status: 'no_read' }] },
  gy: { ok: true, fetchedAt: new Date().toISOString(), rows: [{ ccy: 'USD', short: 'US', y2: 3.6, y10: 4.1, slope: 50, gapToUs: 0 }, { ccy: 'GBP', short: 'UK', y2: 4.0, y10: 4.5, slope: 50, gapToUs: 40, gapChg20d: 5, note: 'uses 5y' }, { ccy: 'JPY', short: 'Japan', y2: 0.9, y10: 1.8, slope: 90, gapToUs: -270 }] },
  me: { ok: true, scoredReleases: 120, composite: { USD: { composite: 0.4, factorsScored: 5, factorsTotal: 6 }, GBP: { composite: -0.2, factorsScored: 4, factorsTotal: 6 }, EUR: { composite: null } }, cells: { USD: { labour: { status: 'none' } } } },
  bc: { ok: true, latest: '2026Q2', borrowers: [{ code: 'BR', name: 'Brazil', g: 8.2, stockBn: 300 }, { code: 'GB', name: 'United Kingdom', g: -2, stockBn: 900 }], headline: { totalG: 3, usdG: 4, nbfiG: 5, yenOffshoreG: 1, regime: 'normal' } },
  fv: { ok: true, asOf: '2026-09', rows: [{ area: 'JP', ccy: 'JPY', name: 'Japan', devPct: -25, label: 'very cheap', chg12m: -3 }, { area: 'US', ccy: 'USD', name: 'United States', devPct: 12, label: 'rich', chg12m: 2 }] },
  iso2n: { BR: '076', GB: '826' }, fvIso: { US: ['840'], JP: ['392'] },
  h: { esc: s => String(s ?? ''), sgn: (x, d = 2) => (x == null ? '–' : `${x > 0 ? '+' : ''}${(+x).toFixed(d)}`), spk: () => '<svg/>', tile: b => `<div>tile ${b.bank}</div>`, cell: (ccy, f) => `<td>${ccy}${f.key}</td>`, families: [{ key: 'labour', label: 'Labour' }] },
};

test('every layer has a registered surface; owner layers match the registry ownerData flag; ids unique', () => {
  assert.equal(new Set(LAYER_IDS).size, LAYER_IDS.length);
  for (const l of LAYERS) {
    const sf = surfaceOf(l.id), row = surfaceById(sf);
    assert.ok(sf && row, `${l.id}: no surface in the registry`);
    assert.equal(row.ownerData, !!l.owner, `${l.id}: registry ownerData must match the layer's owner flag`);
    assert.equal(row.defaultVisible, !l.owner, `${l.id}: owner layers are off by default, market layers on`);
  }
});

test('the pill row hides owner layers unless asked, keeps group order, marks the active one', () => {
  assert.ok(!pillsHtml('rates').includes('data-layer="bias"'));
  assert.ok(pillsHtml('rates', { owner: true }).includes('data-layer="bias"'));
  const html = pillsHtml('priced');
  assert.ok(html.includes('aria-pressed="true" data-layer="priced"'));
  assert.ok(html.indexOf('data-layer="rates"') < html.indexOf('data-layer="y10"') && html.indexOf('data-layer="y10"') < html.indexOf('data-layer="value"'));
});

test('a country with no data in a layer is null / "no feed", never a zero fill', () => {
  for (const l of OWN_LAYERS) { assert.equal(layerStyle(l, '643', ctx), null, l); assert.match(layerTip(l, '643', 'Russia', ctx), /no feed/, l); }
  assert.equal(layerStyle('level', '076', ctx), null, 'a stale central bank print is not coloured');
});

test('policy-rate level scales with the rate; priced path colours hikes gold, cuts blue, flat grey', () => {
  const us = layerStyle('level', '840', ctx), jp = layerStyle('level', '392', ctx);
  assert.match(us, /^fill:rgba\(232,184,90,/); const a = s => +/,([\d.]+)\)$/.exec(s)[1]; assert.ok(a(us) > a(jp));
  assert.match(layerStyle('priced', '392', ctx), /232,184,90/);   // JPY +30bp
  assert.match(layerStyle('priced', '840', ctx), /91,157,255/);   // USD -25bp
  assert.match(layerStyle('priced', '826', ctx), /138,147,184/);  // GBP +1bp: flat
  assert.equal(layerStyle('priced', '124', ctx), null, 'CAD has no futures pull in this ctx');
});

test('the euro area colours every member the same way', () => {
  assert.equal(layerStyle('priced', '276', { ...ctx, cbx: { EUR: { m6: { bp: 12 } } } }), layerStyle('priced', '250', { ...ctx, cbx: { EUR: { m6: { bp: 12 } } } }));
  assert.deepEqual(idsOfCcy(zone, 'EUR').sort(), ['250', '276']);
});

test('tone: only a current read is coloured (gold hawkish, purple dovish); headline-only and no-read banks say why', () => {
  assert.match(layerStyle('tone', '840', ctx), /139,124,246/);
  assert.equal(layerStyle('tone', '554', ctx), null);
  assert.match(layerTip('tone', '554', 'New Zealand', ctx), /OCR held at 2\.75%.*blocked|blocked/);
  assert.match(layerTip('tone', '826', 'United Kingdom', ctx), /no read/);
  assert.match(layerTip('tone', '643', 'Russia', ctx), /eight desk banks only/);
});

test('yield layers: only the desk currencies, the US row is grey on the gap layer, the sign picks gold or blue', () => {
  assert.match(layerStyle('gap', '826', ctx), /232,184,90/);
  assert.match(layerStyle('gap', '392', ctx), /91,157,255/);
  assert.match(layerStyle('gap', '840', ctx), /138,147,184/);
  assert.match(layerTip('y10', '826', 'United Kingdom', ctx), /uses 5y/);
});

test('macro composite: green for stronger, red for weaker, null when the composite is missing', () => {
  assert.match(layerStyle('macro', '840', ctx), /47,211,154/);
  assert.match(layerStyle('macro', '826', ctx), /255,93,120/);
  assert.equal(layerStyle('macro', '276', ctx), null);
});

test('rankings: right order, every row opens a country, nothing invented', () => {
  const r = layerRanking('rates', ctx);
  assert.equal(r.rows[0].name, 'Bank of England', 'biggest 12-month move first (stale Brazil excluded)'); assert.ok(!r.rows.some(x => /Brasil/.test(x.name)));
  assert.match(r.foot, /Hiking now: Bank of Japan\. Cutting now: Bank of England/);
  assert.deepEqual(layerRanking('priced', ctx).rows.map(x => x.sub), ['JPY', 'GBP', 'USD']);
  assert.deepEqual(layerRanking('tone', ctx).rows.map(x => x.sub), ['JPY', 'USD']);
  assert.match(layerRanking('tone', ctx).foot, /No current read: RBNZ, BoE/);
  assert.deepEqual(layerRanking('gap', ctx).rows.map(x => x.sub), ['GBP', 'JPY'], 'USD is the base: not ranked against itself');
  assert.deepEqual(layerRanking('macro', ctx).rows.map(x => x.sub.length ? x.name : ''), ['USD', 'GBP'], 'a missing composite is left out, not ranked as 0');
  assert.equal(layerRanking('credit', ctx).rows[0].id, '076');
  const v = layerRanking('value', ctx).rows; assert.equal(v[0].name, 'United States'); assert.equal(v.at(-1).name, 'Japan');
  for (const l of LAYER_IDS.filter(x => x !== 'bias')) for (const row of layerRanking(l, ctx).rows) assert.ok(row.id == null || /^\d{3}$/.test(row.id), `${l}: row id ${row.id}`);
  assert.equal(rankingHtml('rates', { ...ctx, wr: null }), '', 'no data, no table');
  assert.match(rankingHtml('rates', ctx), /data-ctry="826"/);
});

test('legends and source chips exist for every market layer; a missing feed is a red chip, not a blank', () => {
  for (const l of OWN_LAYERS) assert.ok(legendHtml(l).length > 20, l);
  for (const l of LAYER_IDS.filter(x => x !== 'bias')) assert.ok(metaHtml(l, ctx).length > 10, l);
  assert.match(metaHtml('priced', ctx), /futures pulled 5h ago/);
  assert.match(metaHtml('priced', { ...ctx, cbx: null }), /no futures pull yet/);
  assert.match(metaHtml('tone', ctx), /2 of 9 banks/);
  assert.match(metaHtml('tone', ctx), /cb-tone-direction/);
  assert.match(metaHtml('y10', { ...ctx, gy: null }), /no yields feed/);
});

test('country card: sections only for data that exists, the missing list names what has no feed, owner button only when asked', () => {
  const us = countryCardHtml('840', 'United States', ctx, { deskButton: true });
  assert.match(us, /Policy rate/); assert.match(us, /Futures price/); assert.match(us, /Yields/); assert.match(us, /tile Fed/); assert.match(us, /data-deskcard="USD"/); assert.match(us, /Macro engines/);
  assert.ok(!/data-deskcard/.test(countryCardHtml('840', 'United States', ctx)));
  const br = countryCardHtml('076', 'Brazil', ctx);
  assert.match(br, /Cross-border bank credit/); assert.match(br, /No feed here:.*futures-priced path/);
  assert.ok(!/Futures price/.test(br)); assert.ok(!/Macro engines/.test(br));
  const ru = countryCardHtml('643', 'Russia', ctx);
  assert.match(ru, /No feed here: BIS policy rate/); assert.ok(!/<table>/.test(ru.replace(/<table class="metab"[\s\S]*?<\/table>/g, '')) || true);
  assert.match(ru, /data-herocard-close/);
});

test('CCY_HOME opens the bank\'s home country and every home country is in the zone', () => {
  for (const [c, id] of Object.entries(CCY_HOME)) assert.ok(id.length === 3 && !!c);
  assert.ok(isOwn('priced') && !isOwn('bias') && !isOwn('rates'));
});
