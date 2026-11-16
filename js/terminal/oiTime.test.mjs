// js/terminal/oiTime.test.mjs: OI over time, the three pictures, their player definitions and the command, over synthetic captures and a stand-in fetch. node --test js/terminal/oiTime.test.mjs
// Proves: theme tokens only, escaped words, one scale for the replay, every step of every view draws, the honest coverage line says where the captures start, errors say why,
// the command (help, example, errors, no trade words) and that the feature is a preview surface wired into the loader and status panel. It does NOT prove the look in a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { terrainStage, walkStage, gaugeStage } from './oiTimeDraw.js';
import { defFor, VIEWS, viewByWord, evidenceChips, intradayFrames, resetOiCache } from './oiTime.js';
import { buildOiDays, dayFrames, terrainScale, gaugeFrames, walkLevel, tally, tallySentence } from '../oiTimeCore.js';
import { buildCommands } from './commandCore.js';
import { SURFACES } from './tabRegistry.js';
import { FEEL_KEYS } from './terminalFeel.js';
import { FEATURES } from './featureStatus.js';

function payload(n) {
  const per = {}, candles = []; let t = Date.parse('2026-09-01T12:00:00Z'), k = 0;
  while (k < n) {
    const date = new Date(t).toISOString().slice(0, 10), dow = new Date(t).getUTCDay(); t += 864e5; if (dow === 0 || dow === 6) continue;
    const spot = 1000 + Math.sin(k / 5) * 40;
    per[date] = { asOf: date, savedAtMs: Date.parse(`${date}T06:45:00Z`), spot, maxPain: spot + 10, gammaFlip: spot - 8, gexFlips: [{ price: spot - 12, dir: 'down' }], callWalls: [{ strike: spot + 30, oi: 500 + k, tier: 'strong' }, { strike: spot + 60, oi: 300, tier: 'weak' }], putWalls: [{ strike: spot - 30, oi: 400, tier: 'strong' }, { strike: spot - 55, oi: 200, tier: null }],
      pcRatio: 0.8 + (k % 7) / 10, totalCallOI: 90000, totalPutOI: 80000 + k * 100, gex: 1e6, regime: 'pin', primaryDTE: 8 - (k % 9) };
    candles.push([Date.parse(`${date}T00:00:00Z`), spot - 3, spot + 14, spot - 14, spot + (k % 2 ? 6 : -6)]); k++;
  }
  const days = buildOiDays(per, candles, { tzDate: ms => new Date(ms).toISOString().slice(0, 10) });
  return { ok: true, inst: 'NQ', label: 'Nasdaq 100', dp: 1, days, first: days[0].date, captureDates: days.length, coverage: { n: days.length } };
}
const fetchJson = async u => { if (u.startsWith('/api/replay/oi-days')) return payload(60); if (u.startsWith('/api/replay/day')) { const w = Date.parse('2026-11-12T00:00:00Z'); return { ok: true, win: { start: w, end: w + 864e5 }, bars: Array.from({ length: 600 }, (_, i) => [w + i * 60e3, 1000 + i * 0.01, 1001 + i * 0.01, 999 + i * 0.01, 1000.5 + i * 0.01]) }; } throw new Error(`no stub for ${u}`); };

test('the terrain picture by day: tokens only, strikes on both sides, the lines and a candle panel', () => {
  const p = payload(40), frames = dayFrames(p.days), extra = { days: p.days, scale: terrainScale(p.days), dp: 1, label: 'Nasdaq 100', mode: 'day' }, svg = terrainStage(frames, 30, extra, {});
  assert.match(svg, /^<svg class="rpv-svg oit-svg"/); assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(svg.replace(/&#\d+;/g, '')), 'no hex colours'); assert.match(svg, /var\(--up\)/); assert.match(svg, /var\(--dn\)/);
  assert.match(svg, /max pain/); assert.match(svg, /gamma flip/); assert.match(svg, /puts ◂ open interest ▸ calls/); assert.ok((svg.match(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="6"/g) ?? []).length >= 2, 'strike bars drawn');
  assert.notEqual(svg, terrainStage(frames, 31, extra, {})); assert.match(svg, /<rect[^>]*filter="url\(#oit\d+\)"/, 'the current candle glows'); assert.doesNotMatch(terrainStage(frames, 30, extra, { reduced: true }), /<rect[^>]*filter=/, 'reduced motion: no glow');
});

test('the terrain picture within a day: the price path stops at the current step', () => {
  const p = payload(40), r = intradayFrames({ bars: Array.from({ length: 600 }, (_, i) => [Date.parse('2026-11-12T00:00:00Z') + i * 60e3, 1000, 1001, 999, 1000.5 + i * 0.01]), win: { start: Date.parse('2026-11-12T00:00:00Z'), end: Date.parse('2026-11-13T00:00:00Z') } });
  assert.ok(r.frames.length >= 38 && r.path.length > 100); assert.equal(r.frames[0].data.x, 15 * 60e3);
  const extra = { days: p.days, scale: terrainScale(p.days), dp: 1, label: 'Nasdaq 100', mode: 'intraday', dayIndex: 30, focus: { path: r.path } }, a = terrainStage(r.frames, 4, extra, {}), b = terrainStage(r.frames, 30, extra, {});
  assert.notEqual(a, b); assert.match(a, /15 minutes at a time/);
});

test('the level walk picture: a fixed level, candles up to the step, the DTE under each, the tally bars', () => {
  const p = payload(80), w = walkLevel(p.days, 40, 'maxpain'), t = tally(p.days), frames = [{ t: 'x', data: { step: 0 } }, ...w.steps.map((s, j) => ({ t: 'x', data: { step: j + 1 } }))];
  const extra = { walk: w, tally: t, tallyText: tallySentence(t), dp: 1, label: 'Nasdaq 100', kindLabel: 'Max pain', evChips: evidenceChips() };
  const s0 = walkStage(frames, 0, extra, {}), s5 = walkStage(frames, 5, extra, {}), s8 = walkStage(frames, 8, extra, {});
  assert.match(s0, /start/); assert.match(s5, /d<\/text>/); assert.ok((s8.match(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" fill="var\(--(up|dn)\)"/g) ?? []).length >= 8, 'eight candle bodies by the last step');
  assert.match(s8, /level touched/); assert.match(s8, /mirror touched/); assert.match(s8, /fixed level/); assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(s8.replace(/&#\d+;/g, '')));
  assert.ok(!/<script|<img/.test(walkStage(frames, 3, { ...extra, tallyText: '<script>x</script>', kindLabel: '<img onerror=1>' }, {})));
});

test('the gauge picture: the Options tab dial, tinted by the day, with the strip of daily changes', () => {
  const p = payload(40), f = gaugeFrames(p.days), a = gaugeStage(f, 10, {}, {}), b = gaugeStage(f, 11, {}, {});
  assert.match(a, /class="oit-gauge"/); assert.match(a, /calls against puts gauge/); assert.match(a, /puts per call/); assert.match(a, /daily price change/); assert.notEqual(a, b);
  const up = f.findIndex(x => x.data.chg > 0), dn = f.findIndex(x => x.data.chg < 0); assert.match(gaugeStage(f, up, {}, {}), /border-color:var\(--up\)/); assert.match(gaugeStage(f, dn, {}, {}), /border-color:var\(--dn\)/);
});

test('every view loads and every step draws; the coverage line says where the captures start; a missing day says why', async () => {
  resetOiCache();
  for (const id of ['terrain', 'walk', 'gauge']) {
    const def = defFor(id, 'NQ', null, { fetchJson, now: () => Date.parse('2026-11-16T10:00:00Z') });
    const picks = Object.fromEntries(def.picks.map(k => [k.id, k.values[0].v])), r = await def.load(picks);
    assert.ok(r.frames.length >= 5, `${id}: frames`); assert.match(def.coverage(r.frames, r, picks), /daily captures of option-OI for Nasdaq 100, \w+, \d+ \w+ 2026/);
    for (let i = 0; i < r.frames.length; i += Math.ceil(r.frames.length / 9)) { assert.match(def.draw(r.frames, i, { reduced: false, extra: r.extra, picks }), /<svg|oit-gauge/); assert.ok(def.caption(r.frames, i, r.extra, picks).length > 20, `${id} caption ${i}`); assert.ok(def.label(r.frames[i], i, r.frames.length, picks).length > 3); }
  }
  const t = defFor('terrain', 'NQ', null, { fetchJson }); await assert.rejects(t.load({ inst: 'NQ', mode: 'intraday', day: '2026-01-05' }), /no option-OI capture is held for 2026-01-05/);
  const intra = await t.load({ inst: 'NQ', mode: 'intraday', day: payload(60).days[40].date }); assert.ok(intra.frames.length > 30); assert.match(intra.coverage, /steps of 15 minutes/);
  resetOiCache(); const few = defFor('gauge', 'NQ', null, { fetchJson: async () => ({ ...payload(60), days: payload(60).days.slice(0, 3) }) }); await assert.rejects(few.load({ inst: 'NQ' }), /too few to replay/);
  resetOiCache(); const w = defFor('walk', 'NQ', null, { fetchJson: async () => ({ ...payload(60), days: payload(60).days.slice(0, 10) }) }); await assert.rejects(w.load({ inst: 'NQ', kind: 'call', start: 'auto' }), /too few to replay/);
});

test('the OITIME command: help, example, errors, no trade words', () => {
  const cmds = buildCommands({ isOn: () => true, now: () => Date.parse('2026-11-16T10:00:00Z') }), c = cmds.find(x => x.id === 'oitime');
  assert.ok(c && c.help.length > 80 && c.example && c.opens && c.surface === 'widget.oitime'); assert.doesNotMatch(`${c.help} ${c.opens}`, /\b(buy|sell|entry|target|stop|signal)\b/i);
  assert.deepEqual(c.run('terrain nq').action, { kind: 'oitime', id: 'terrain', inst: 'NQ', date: null }); assert.equal(c.run('walk gold 12 nov').action.date, '2026-11-12'); assert.equal(c.run('gauge').action.inst, 'NQ');
  assert.match(c.run('').error, /Say which view/); assert.match(c.run('nope nq').error, /Say which view/); assert.match(c.run('terrain nzdusd').error, /covers|not one of them/); assert.match(c.run('terrain nq 32 nov').error, /real date|read/);
  assert.equal(viewByWord('speedometer').id, 'gauge'); assert.equal(viewByWord('expiry').id, 'walk'); assert.equal(viewByWord('zzz'), null); assert.equal(VIEWS.length, 3);
});

test('it is a PREVIEW surface wired into the loader and the status panel', () => {
  const s = SURFACES.find(x => x.id === 'widget.oitime'); assert.ok(s && s.hidden === 'preview' && s.kind === 'widget');
  assert.ok(FEEL_KEYS.includes('oiTime')); assert.equal(FEATURES.oiTime.surface, 'widget.oitime'); assert.ok(FEATURES.oiTime.where.some(w => /terrain/i.test(w)) && FEATURES.oiTime.where.some(w => /OITIME/.test(w)));
  const feel = fs.readFileSync(new URL('./terminalFeel.js', import.meta.url), 'utf8'); assert.match(feel, /oiTime: on\('widget\.oitime'\)/); assert.match(feel, /import\('\.\/oiTime\.js'\)/);
});
