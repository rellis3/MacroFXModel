// js/terminal/oiDrill.test.mjs: OI drills (pure core over synthetic captures, the window, the command and the wiring).
// node --test js/terminal/oiDrill.test.mjs. It does NOT prove the look or the feel in a real browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as C from '../oiDrillCore.js';
import { drillHtml, sparkSvg, resetCache } from './oiDrill.js';
import { buildCommands } from './commandCore.js';
import { SURFACES } from './tabRegistry.js';
import { FEEL_KEYS } from './terminalFeel.js';
import { FEATURES } from './featureStatus.js';

// 40 daily captures. The strike grid is 50 and the basis drifts by 1.3 a day, so the same real strike (the 24000 call) sits at a different k each day.
const day = (i, over = {}) => {
  const basis = 17 + i * 1.3, ds = new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10), c = 23800 + (i % 5) * 40 + i * 6;
  const ladder = (strikes, oi0) => strikes.map((K, j) => ({ k: K + basis, oi: oi0 - j * 120 - (K === 24000 ? 0 : 0) })).sort((a, b) => b.oi - a.oi);
  return { date: ds, spot: c, maxPain: 23850 + i * 3, gammaFlip: 23700 + i * 2, regime: 'pin', dte: 5, calls: ladder([24000, 24100, 24200, 24500, 25000, 24300, 24400, 24600], 1500 + (i > 28 ? 400 : 0) + i * 5), puts: ladder([23000, 23100, 23200, 22500, 22000, 23300, 23400, 22800], 1400 + i * 3), px: { o: c - 20, h: c + 120, l: c - 100, c }, ...over };
};
const days = Array.from({ length: 40 }, (_, i) => day(i));

test('gridStep and the offset series: the grid is found, and the same strike is matched across days despite the drifting basis', () => {
  assert.equal(C.gridStep(days), 100, 'gaps of 100 are the commonest small gap');
  const off = C.offsetSeries(days, 100); assert.equal(off.length, 40); for (let i = 1; i < 40; i++) assert.ok(Math.abs(off[i] - off[i - 1]) < 5, `smooth at ${i}`);
  assert.equal(C.gridStep([{ calls: [{ k: 1 }] }]), null); assert.ok(C.offsetCandidates(days[0], 100).length >= 1);
});

test('drill the biggest call strike: held streak, top-8 days, open interest change, distance in average daily ranges, traded-through', () => {
  const m = C.drill(days, 'callwall'); assert.ok(m.ok); assert.equal(m.target.id, 'callwall'); assert.equal(m.rows.length, 30); assert.equal(m.all, 40); assert.equal(m.step, 100);
  assert.ok(Math.abs(m.anchorLevel - (24000 + 17 + 39 * 1.3)) < 1e-6, 'the latest day\'s biggest call strike is the 24000 strike at its basis');
  const s = m.summary; assert.equal(s.heldDays, 40, 'it has been the biggest call strike every day'); assert.equal(s.inTop, 30); assert.equal(s.captures, 40); assert.equal(s.from, days[0].date); assert.equal(s.to, days[39].date);
  assert.equal(s.oiNow, days[39].calls[0].oi); assert.equal(s.oiChange, days[39].calls[0].oi - days[34].calls[0].oi); assert.ok(m.rows.every(r => r.rank === 1 && r.top));
  const r = m.rows.at(-1); assert.ok(Math.abs(r.level - m.anchorLevel) < 1e-6); assert.ok(Number.isFinite(r.dist) && r.dist < 0, 'price is below that call strike'); assert.equal(r.through, false);
  assert.ok(Math.abs(C.adrBefore(days, 39) - 220) < 1e-6, 'average daily range = high minus low = 220'); assert.equal(C.adrBefore(days, 2), null, 'fewer than 5 sessions before: no average');
});

test('a strike that left the top 8 is "below the top 8", never zero; a far-away strike is not a wall', () => {
  const d2 = days.map((d, i) => (i < 20 ? { ...d, calls: d.calls.filter(x => Math.abs(x.k - 24000 - (17 + i * 1.3)) > 1) } : d));
  const m = C.drill(d2, 'callwall'); const early = m.rows.find(r => r.date === d2[5].date); assert.equal(early, undefined, 'the window shows only the last 30'); const r10 = C.drill(d2, 'callwall', { last: 40 }).rows[10];
  assert.equal(r10.inLadder, false); assert.equal(r10.oi, null); assert.equal(r10.rank, null); assert.equal(r10.top, false); assert.ok(Number.isFinite(r10.level), 'its level is still followed');
  assert.equal(C.drill(d2, 'callwall', { last: 40 }).summary.heldDays, 20);
  const junk = days.map(d => ({ ...d, calls: [{ k: 85.2, oi: 99999 }, ...d.calls] })), jm = C.drill(junk, 'callwall'); assert.ok(jm.ok); assert.ok(Math.abs(jm.anchorLevel - 24067.7) < 1, 'the strike at 85 (about -99% from price) is ignored');
});

test('drill the biggest put strike, max pain and the gamma flip: levels followed, distances from each close', () => {
  const p = C.drill(days, 'putwall'); assert.ok(p.ok); assert.ok(p.anchorLevel < 23200); assert.equal(p.summary.heldDays, 40);
  const mp = C.drill(days, 'maxpain'); assert.ok(mp.ok); assert.equal(mp.summary.heldDays, null); assert.equal(mp.rows.at(-1).level, days[39].maxPain); assert.ok(Number.isFinite(mp.rows.at(-1).dist)); assert.equal(mp.rows.at(-1).oi, null);
  const gf = C.drill(days, 'gammaflip'); assert.equal(gf.anchorLevel, days[39].gammaFlip); assert.equal(C.drill(days, 'nope').ok, false);
  assert.equal(C.drill(days.slice(0, 2), 'callwall').ok, false); assert.equal(C.drill([], 'callwall').ok, false); assert.match(C.drill([], 'callwall').why, /No stored option-OI captures/);
  assert.equal(C.drill(days.map(d => ({ ...d, maxPain: null })), 'maxpain').ok, false);
});

test('words and evidence: plain sentences, the archive limit said, no direction or trade words', () => {
  const m = C.drill(days, 'callwall'), w = C.words(m, 'Nasdaq 100', 1);
  assert.match(w, /biggest call strike for 40 straight captures, and in the top 8 on 30 of the last 30/); assert.match(w, /Its open interest is [\d,]+ contracts, (up|down) [\d,]+ on five captures ago/); assert.match(w, /8 biggest strikes per side, so "below the top 8" is not zero/); assert.match(w, /Nasdaq 100: 40 captures held, from 2026-10-01/);
  assert.doesNotMatch(w, /\b(will|should|buy|sell|bullish|bearish|signal|target)\b/i, w); assert.match(C.words(C.drill(days, 'maxpain'), null, 1), /followed over the last 30 captures/); assert.equal(C.words({ ok: false, why: 'x' }), 'x');
  assert.deepEqual(C.evidenceWords([{ id: 'wall-placebo', verdict: 'null' }, { id: 'oi-max-pain', verdict: 'null' }]).map(e => e.verdict), ['NULL', 'NULL']);
  const csv = C.drillCsv(m).split('\n'); assert.equal(csv.length, 31); assert.match(csv[0], /^date,level,oi,rank_in_top8,close,distance_adr,traded_through/); assert.equal(C.drillCsv({ ok: false }), '');
  for (const [a, b] of [['call', 'callwall'], ['Max Pain', 'maxpain'], ['flip', 'gammaflip'], ['puts', 'putwall'], ['x', null]]) assert.equal(C.targetFromWord(a), b);
});

test('the window: pills, the table (newest first), the spark strip, the evidence chips, the links, escaped text, tokens only', () => {
  const m = C.drill(days, 'callwall'), h = drillHtml(m, { target: 'callwall', dp: 1, label: 'Nasdaq 100', pathOk: true });
  assert.equal((h.match(/data-oid-t=/g) ?? []).length, 4); assert.match(h, /aria-pressed="true"/); assert.match(h, /<svg class="oid-spark"/); assert.equal((h.match(/<tr>/g) ?? []).length, 31, 'a header row and 30 captures'); assert.match(h, /data-oid-go="walk"/); assert.match(h, /data-oid-go="path"/); assert.match(h, /data-oid-csv/);
  assert.ok(h.indexOf(days[39].date) < h.indexOf(days[20].date), 'newest first'); assert.match(h, /never a reason to expect price to go to a level/); assert.doesNotMatch(h, /undefined|NaN|#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(drillHtml(m, { target: 'callwall', pathOk: false }), /data-oid-go="path"/); assert.match(drillHtml({ ok: false, why: 'x <b>' }, { target: 'callwall' }), /x &lt;b&gt;/);
  const mp = drillHtml(C.drill(days, 'maxpain'), { target: 'maxpain', dp: 1 }); assert.doesNotMatch(mp, /Open interest<\/th>/); assert.match(mp, /dashed line is the close/); assert.equal(sparkSvg([{ oi: 1 }], 'oi'), ''); resetCache();
});

test('the OIDRILL command and the wiring: preview surface, loader, status panel, no static import for a desk login', () => {
  const c = buildCommands({ isOn: () => true, now: () => Date.now() }).find(x => x.id === 'oidrill');
  assert.ok(c && c.help.length > 80 && c.example && c.opens && c.surface === 'widget.oidrill'); assert.doesNotMatch(`${c.help} ${c.opens}`, /\b(buy|sell|entry|target|stop|signal)\b/i);
  assert.deepEqual(c.run('callwall nq').action, { kind: 'oidrill', inst: 'NQ', target: 'callwall' }); assert.deepEqual(c.run('').action, { kind: 'oidrill', inst: 'NQ', target: 'callwall' }); assert.deepEqual(c.run('gold maxpain').action, { kind: 'oidrill', inst: 'GOLD', target: 'maxpain' });
  assert.match(c.run('zzz').error, /not a level or a market/); assert.match(c.run('callwall nzdusd').error, /covers|not one of them/);
  const s = SURFACES.find(x => x.id === 'widget.oidrill'); assert.ok(s && s.hidden === 'preview' && s.kind === 'widget'); assert.ok(FEEL_KEYS.includes('oiDrill')); assert.equal(FEATURES.oiDrill.surface, 'widget.oidrill'); assert.ok(FEATURES.oiDrill.where.some(w => /terrain card/.test(w)) && FEATURES.oiDrill.where.some(w => /OIDRILL/.test(w)));
  const feel = fs.readFileSync(new URL('./terminalFeel.js', import.meta.url), 'utf8'); assert.match(feel, /oiDrill: on\('widget\.oidrill'\)/); assert.match(feel, /import\('\.\/oiDrill\.js'\)/);
  assert.match(fs.readFileSync(new URL('./commandLine.js', import.meta.url), 'utf8'), /case 'oidrill'/); assert.doesNotMatch(fs.readFileSync(new URL('./commandCore.js', import.meta.url), 'utf8'), /from '\.\/oiDrill\.js'/);
});
