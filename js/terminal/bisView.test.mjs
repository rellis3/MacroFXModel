// js/terminal/bisView.test.mjs: the BIS heat strip (pure model, the strips and table, the Insight pill and the command). node --test js/terminal/bisView.test.mjs
// It does NOT prove the look or the feel in a real browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as C from '../bisStripCore.js';
import { boardHtml, stripSvg } from './bisView.js';
import { PANELS } from './insightView.js';
import { SURFACES } from './tabRegistry.js';
import { buildCommands } from './commandCore.js';

const qs = (a, b) => { const out = []; for (let y = a; y <= b; y++) for (let q = 1; q <= 4; q++) out.push(`${y}-Q${q}`); return out; };
const wave = (p, i) => +(5 + 9 * Math.sin(i / 7) + (p.startsWith('2008') ? -9 : 0)).toFixed(2);
const hist = (a, b, last) => qs(a, b).map((p, i) => ({ period: p, g: wave(p, i) })).slice(0, last);
const J = {
  ok: true, latest: '2026-Q2', firstSeen: '2026-10-29', line: 'Bank credit 2026-Q2: cross-border USD lending +13.0% y/y (fast). Regime context, not a forecast.', evidence: { dxy: 'x', nasdaq: 'y' },
  headline: { regimeBands: { low: 2.68, high: 7.6 } },
  history: { total: hist(1999, 2026, 110), usd: hist(1999, 2026, 110), nbfi: qs(2014, 2026).slice(3, 50).map((p, i) => ({ period: p, g: 12 + i * 0.1 })), caymanUsd: hist(1999, 2026, 110), yenOffshore: hist(1999, 2026, 110) },
  borrowers: [{ code: 'US', name: 'United States', stockBn: 10106.3, g: 13.36, gPrev: 14.16, gYearAgo: 11.88 }, { code: 'JP', name: 'Japan', stockBn: 919, g: 1.5, gPrev: 10.97, gYearAgo: null }],
};

test('band and strength: slow below the low band, fast above the high band, nothing in between, null for no value', () => {
  assert.equal(C.band(1), 'slow'); assert.equal(C.band(2.68), 'normal'); assert.equal(C.band(7.6), 'normal'); assert.equal(C.band(7.61), 'fast'); assert.equal(C.band(null), null); assert.equal(C.band(NaN), null);
  assert.equal(C.strength(5), 0); assert.ok(C.strength(8) > 0.35 && C.strength(8) < 0.5); assert.equal(C.strength(40), 1); assert.ok(C.strength(0) > C.strength(2)); assert.equal(C.strength(null), null);
  assert.equal(C.band(3, { low: 4, high: 9 }), 'slow');
});

test('model: one axis from the earliest to the latest quarter, five rows, missing early quarters are gaps, the busts are placed, depth said honestly', () => {
  const m = C.model(J); assert.ok(m.ok); assert.equal(m.rows.length, 5); assert.equal(m.n, 110); assert.equal(m.rows[0].cells.length, 110); assert.equal(m.rows[0].cells[0].period, '1999-Q1'); assert.equal(m.rows[0].cells.at(-1).period, '2026-Q2');
  const nb = m.rows.find(r => r.key === 'nbfi'); assert.equal(nb.cells[0].g, null, 'non-bank financials start in 2014'); assert.ok(nb.cells.filter(c => c.g !== null).length > 30); assert.equal(nb.first, '2014-Q4');
  assert.equal(m.busts.length, 2); assert.equal(m.busts[0].a, 4 * 1, 'the 2000-02 band starts at 2000-Q1, one year after 1999-Q1'); assert.match(m.depth, /110 quarters from 1999-Q1 to 2026-Q2/); assert.match(m.depth, /non-bank financials only from 2014-Q/); assert.match(m.depth, /first seen here on 2026-10-29/);
  const r = m.rows[0]; assert.match(r.text, /All cross-border bank claims: [-\d.]+% a year on 2026-Q2 \((fast|slow|normal)\); fast in \d+ of 110 quarters, slow in \d+\./);
  assert.equal(C.model({ ok: false, error: 'x' }).ok, false); assert.equal(C.model({ ok: true, history: { total: [] } }).ok, false); assert.equal(C.model(null).ok, false);
  const c = m.countries; assert.equal(c.length, 2); assert.equal(c[0].pts.length, 3); assert.equal(c[0].pts[2].label, '2026-Q2'); assert.equal(c[0].pts[2].band, 'fast'); assert.equal(c[1].pts[0].g, null); assert.equal(c[1].pts[2].band, 'slow');
  assert.deepEqual(C.yearTicks(m).map(t => t.label).slice(0, 3), ['2000', '2005', '2010']);
});

test('the evidence chips come from the Evidence Book and the words say context, never direction', () => {
  const ev = C.evidenceWords(J, [{ id: 'bank-credit-dollar-dxy', verdict: 'underpowered' }, { id: 'bank-credit-dollar-nasdaq', verdict: 'context' }]); assert.deepEqual(ev.map(e => e.verdict), ['UNDERPOWERED', 'CONTEXT']); assert.match(ev[1].what, /2000-02 and 2008-09/);
  assert.deepEqual(C.evidenceWords(J, []), []);
});

test('the board: strips with no hex colours, hatched gaps, bust shading, the table, key, chips, CSV, and no forecasts', () => {
  const m = C.model(J), h = boardHtml(m, [{ id: 'bank-credit-dollar-dxy', verdict: 'underpowered' }, { id: 'bank-credit-dollar-nasdaq', verdict: 'context' }], J);
  assert.match(h, /data-surface="panel.insight.bis"/); assert.equal((h.match(/class="bis-row"/g) ?? []).length, 5); assert.equal((h.match(/<svg class="bis-svg"/g) ?? []).length, 5); assert.doesNotMatch(h, /#[0-9a-fA-F]{3,8}\b|rgb\(/); assert.match(h, /url\(#bis\d+-gap\)/); assert.match(h, /fill-opacity="\.14"/);
  assert.match(h, /Bank credit 2026-Q2/); assert.match(h, /fast \(above 7\.6%\)/); assert.match(h, /slow \(below 2\.68%\)/); assert.match(h, /UNDERPOWERED/); assert.match(h, /CONTEXT/); assert.match(h, /data-bis-csv/); assert.match(h, /The borrowers/); assert.match(h, /United States/); assert.match(h, /\+13\.4%/);
  assert.match(h, /not a signal/); assert.doesNotMatch(h, /undefined|NaN/); assert.doesNotMatch(h.replace(/not a forecast/g, ''), /(will|should|buy|sell|bullish|bearish|forecast)/i, 'no direction words');
  assert.match(boardHtml({ ok: false, why: 'gone <x>' }), /gone &lt;x&gt;/); const svg = stripSvg(m.rows[2], m); assert.match(svg, /var\(--gold\)|var\(--pur2\)|var\(--line2\)/);
  const csv = C.csv(m).split('\n'); assert.equal(csv.length, 111); assert.match(csv[0], /^quarter,total,usd,nbfi,caymanUsd,yenOffshore$/); assert.match(csv[1], /^1999-Q1,[-\d.]+,[-\d.]+,,/); assert.equal(C.csv({ ok: false }), '');
});

test('the Insight pill and the command: a preview surface, in the pill list, a command with help', () => {
  assert.ok(PANELS.some(p => p.key === 'bis' && p.surface === 'panel.insight.bis')); const s = SURFACES.find(x => x.id === 'panel.insight.bis'); assert.ok(s && s.hidden === 'preview' && s.kind === 'panel');
  const c = buildCommands({ isOn: () => true, now: () => Date.now() }).find(x => x.id === 'insight.bis'); assert.ok(c && c.help.length > 60 && c.example && c.opens && c.surface === 'panel.insight.bis'); assert.deepEqual(c.action, { kind: 'insight', panel: 'bis' }); assert.doesNotMatch(`${c.help} ${c.opens}`, /\b(buy|sell|entry|target|stop|signal)\b/i);
  const iv = fs.readFileSync(new URL('./insightView.js', import.meta.url), 'utf8'); assert.match(iv, /import\('\.\/bisView\.js'\)/); assert.doesNotMatch(iv, /^import .*bisView/m, 'loaded only when the pill is opened');
});
