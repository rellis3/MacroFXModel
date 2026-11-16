// js/terminal/eventReplay.test.mjs: the event replay (pure core, picture, player definition, command, wiring) over synthetic releases and a stand-in fetch. node --test js/terminal/eventReplay.test.mjs
// It does NOT prove the look or the feel in a real browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as C from '../eventReplayCore.js';
import { eventStage } from './eventReplayDraw.js';
import { eventDef } from './eventReplay.js';
import { buildCommands } from './commandCore.js';
import { SURFACES } from './tabRegistry.js';
import { FEEL_KEYS } from './terminalFeel.js';
import { FEATURES } from './featureStatus.js';

// synthetic record: 8 CPI releases (a month apart), 2 NFP; each path is 271 one-minute samples (minute -30 first), 0 at the release minute
const mkPath = (k, scale) => ({ step: 1, bars: 30, thin: false, source: 'T', v: Array.from({ length: 271 }, (_, i) => (i < 30 ? 0.01 * scale : i === 30 ? 0 : +(scale * Math.sin((i - 30) / 25) * (k % 3 + 1) * 0.1).toFixed(4))) });
const mkRow = (fam, n, i) => ({ id: `2026-0${i + 1}-10T13:30:00Z|${fam}`, family: fam, name: `${fam} ${n}`, t: `2026-0${i + 1}-10T13:30:00Z`, status: 'history', actual: 0.3, consensus: 0.2, surprise: 0.1, M: { nq: { m30: 0.3 + i * 0.05 }, eurusd: { m30: 0.1 + i * 0.01 } } });
const rows = [...Array.from({ length: 8 }, (_, i) => mkRow('CPI', 'Core CPI m/m', i)), ...Array.from({ length: 2 }, (_, i) => mkRow('NFP', 'Nonfarm payrolls', i)), { id: 'x|FOMC', family: 'FOMC', name: 'FOMC', t: '2099-01-01T19:00:00Z', status: 'upcoming', M: {} }];
const now = Date.parse('2026-11-16T10:00:00Z');
const paths = Object.fromEntries(rows.map((r, i) => [r.id, { nq: mkPath(i, 1), eurusd: mkPath(i, 0.4) }]));
const fetchJson = async u => { if (u.startsWith('/api/release-layer1/paths')) { const id = decodeURIComponent(u.split('id=')[1]); if (!paths[id]) throw new Error('unknown release'); return { ok: true, id, paths: paths[id] }; } throw new Error(`unexpected ${u}`); };

test('the record: printed releases only, newest first, and the ghosts are the five before the focus (point in time)', () => {
  const l = C.listReleases(rows, now); assert.equal(l.length, 10); assert.ok(!l.some(r => r.status === 'upcoming')); assert.ok(Date.parse(l[0].t) >= Date.parse(l[1].t));
  const focus = l.find(r => r.family === 'CPI'); const prev = C.previousSameKind(rows, focus, 5);
  assert.equal(prev.length, 5); assert.ok(prev.every(r => r.family === 'CPI' && Date.parse(r.t) < Date.parse(focus.t)), 'only earlier releases of the same kind');
  const oldest = C.listReleases(rows, now).filter(r => r.family === 'CPI').at(-1); assert.equal(C.previousSameKind(rows, oldest).length, 0);
  const picks = C.releasePicks(rows, now, 6); assert.equal(picks.length, 6); assert.match(picks[0].label, /·.*·.*2026/);
});

test('a stored path is read from the right minute: the first sample is minute -30 and minute 0 is the release', () => {
  const p = mkPath(1, 1); assert.equal(C.valueAt(p, 0), 0); assert.equal(C.valueAt(p, -30), p.v[0]); assert.equal(C.valueAt(p, 240), p.v[270]); assert.equal(C.valueAt(p, 241), null); assert.equal(C.valueAt(p, -31), null); assert.equal(C.valueAt(null, 0), null);
  assert.deepEqual(C.OFFS, [-30, 240]);
});

test('the unit is the typical 30-minute move of that kind (median of absolute m30), null with fewer than 5', () => {
  assert.ok(Math.abs(C.unitFor(rows, 'CPI', 'nq') - 0.475) < 0.06, 'median of 0.30 .. 0.65'); assert.equal(C.unitFor(rows, 'NFP', 'nq'), null); assert.equal(C.unitFor(rows, 'CPI', 'gold'), null);
});

test('frames: 271 one-minute frames, the focus in units, the ghosts band only when at least two ghosts have a value, no lookahead of the focus into the ghosts', () => {
  const unit = 0.5, fr = C.makeFrames(paths[rows[7].id].nq, [paths[rows[6].id].nq, paths[rows[5].id].nq, null].filter(Boolean), unit);
  assert.equal(fr.length, 271); assert.equal(fr[0].t, -30); assert.equal(fr.at(-1).t, 240); const z = fr.find(f => f.t === 0).data; assert.equal(z.y, 0);
  const m = fr.find(f => f.t === 60).data; assert.ok(Math.abs(m.y - C.valueAt(paths[rows[7].id].nq, 60) / unit) < 1e-9); assert.equal(m.n, 2); assert.ok(m.lo <= m.med && m.med <= m.hi);
  const one = C.makeFrames(paths[rows[7].id].nq, [paths[rows[6].id].nq], unit).find(f => f.t === 60).data; assert.equal(one.lo, null, 'one ghost is not a band'); assert.equal(C.makeFrames({ v: [] }, [], unit)[40].data.y, null);
  assert.equal(C.makeFrames(paths[rows[7].id].nq, [], null)[40].data.y, null, 'no unit, no units');
});

test('captions describe size and timing and never say which way the next release will go', () => {
  const unit = 0.5, fr = C.makeFrames(paths[rows[7].id].nq, [6, 5, 4, 3, 2].map(i => paths[rows[i].id].nq), unit), extra = { mkt: 'nq', unit, family: 'CPI' };
  for (const min of [-20, 0, 5, 30, 120]) { const t = C.captionFor(fr, fr.findIndex(f => f.t === min), extra); assert.ok(t.length > 30, `caption at ${min}`); assert.doesNotMatch(t, /\b(will|should|expect|buy|sell|bullish|bearish|signal|likely to|forecast)\b/i, t); }
  assert.match(C.captionFor(fr, fr.findIndex(f => f.t === 30), extra), /larger than|smaller than|of them in size/);
  assert.match(C.captionFor(fr, fr.findIndex(f => f.t === -20), extra), /Before the release/);
  const cov = C.coverageText(rows, rows[7], [rows[6], rows[5]], 0.5, 'nq'); assert.match(cov, /8 US CPI releases are held/); assert.match(cov, /30 minutes before to 4 hours after/); assert.match(C.coverageText(rows, rows[7], [rows[6]], 0.5, 'nq'), /no ghosts are drawn/);
  assert.match(C.coverageText(rows, rows[7], [rows[6], rows[5]], null, 'nq'), /fewer than 5 releases/);
});

test('the evidence chips come from the Evidence Book and the picture is tokens only, with the right pieces', () => {
  const ev = C.evidenceWords([{ id: 'surprise-size', verdict: 'validated' }, { id: 'news-asymmetry', verdict: 'null' }]); assert.deepEqual(ev.map(e => e.verdict), ['VALIDATED', 'NULL']);
  const unit = 0.5, fr = C.makeFrames(paths[rows[7].id].nq, [6, 5, 4].map(i => paths[rows[i].id].nq), unit);
  const extra = { mkt: 'nq', mktLabel: 'Nasdaq', unit, family: 'CPI', focusLabel: 'US CPI 10 Aug 2026', ghostIds: ['a', 'b', 'c'], facts: C.facts(rows[7]), evidence: ev, thin: true };
  for (const i of [0, 40, 100, 270]) { const h = eventStage(fr, i, extra, { reduced: i === 100 }); assert.match(h, /<svg/); assert.doesNotMatch(h, /#[0-9a-fA-F]{3,8}\b|rgb\(/, 'theme tokens only'); assert.match(h, /VALIDATED/); assert.match(h, /data-evr-ex="csv"/); assert.match(h, /thin data/); assert.doesNotMatch(h, /NaN|undefined/); }
  assert.match(eventStage(fr, 100, extra), /Last 3 releases of this kind: middle 80%/); assert.doesNotMatch(eventStage(fr, 10, extra), /Last 3 releases of this kind: middle 80%/, 'no comparison table before the release');
  assert.match(eventStage([], 0, extra), /Nothing to draw/); const csv = C.eventCsv(fr, extra); assert.equal(csv.split('\n').length, 272); assert.match(csv.split('\n')[0], /^minute,focus_pct,focus_units,ghost1_units_a/);
});

test('the player definition loads, draws every frame, picks a market, and refuses honestly', async () => {
  const def = eventDef(rows, { fetchJson, now: () => now }); assert.equal(def.id, 'eventreplay'); assert.equal(def.picks[0].values[0].v, C.listReleases(rows, now)[0].id, 'the newest printed release comes first');
  const picks = Object.fromEntries(def.picks.map(k => [k.id, k.values[0].v])), r = await def.load(picks);
  assert.equal(r.frames.length, 271); assert.match(def.coverage(r.frames, r, picks), /releases are held/); assert.ok(def.label(r.frames[40], 40, 271, picks).includes('after'));
  for (let i = 0; i < 271; i += 30) { assert.match(def.draw(r.frames, i, { reduced: false, extra: r.extra, picks }), /<svg/); assert.ok(def.caption(r.frames, i, r.extra, picks).length > 20); }
  const cpi = eventDef(rows, { family0: 'CPI', fetchJson, now: () => now }); assert.equal(rows.find(x => x.id === cpi.picks[0].values[0].v).family, 'CPI'); assert.equal(cpi.picks[1].values[0].v, 'nq', 'CPI opens on the Nasdaq');
  await assert.rejects(def.load({ rel: 'nope', mkt: 'nq' }), /not in the record/); await assert.rejects(def.load({ rel: picks.rel, mkt: 'bund' }), /no stored path for Bund/);
  const noPaths = eventDef(rows, { fetchJson: async () => { throw new Error('boom'); }, now: () => now }); await assert.rejects(noPaths.load(Object.fromEntries(noPaths.picks.map(k => [k.id, k.values[0].v]))), /no stored path/);
  const fewGhosts = eventDef(rows, { family0: 'NFP', fetchJson, now: () => now }), fp = Object.fromEntries(fewGhosts.picks.map(k => [k.id, k.values[0].v])); fp.mkt = 'eurusd';
  const fr = await fewGhosts.load(fp); assert.ok(fr.frames.every(f => f.data.lo === null), 'one earlier NFP is not enough for a band'); assert.match(fr.coverage, /no ghosts are drawn/);
});

test('the EVENTREPLAY command: help, example, errors, no trade words, and the word helpers', () => {
  const cmds = buildCommands({ isOn: () => true, now: () => now }), c = cmds.find(x => x.id === 'eventreplay');
  assert.ok(c && c.help.length > 80 && c.example && c.opens && c.surface === 'widget.eventreplay'); assert.doesNotMatch(`${c.help} ${c.opens}`, /\b(buy|sell|entry|target|stop|signal)\b/i);
  assert.deepEqual(c.run('cpi nq').action, { kind: 'eventreplay', family: 'CPI', market: 'nq' }); assert.deepEqual(c.run('').action, { kind: 'eventreplay', family: null, market: null }); assert.equal(c.run('payrolls').action.family, 'NFP');
  assert.match(c.run('zzz').error, /not a release family/); assert.match(c.run('cpi zzz').error, /not a market/); assert.equal(C.marketFromWord('Nasdaq'), 'nq'); assert.equal(C.familyFromWord('Fed'), 'FOMC'); assert.equal(C.familyFromWord('x'), null);
});

test('it is a PREVIEW surface wired into the loader, the status panel and the command line, and the desk login gets no static import', () => {
  const s = SURFACES.find(x => x.id === 'widget.eventreplay'); assert.ok(s && s.hidden === 'preview' && s.kind === 'widget');
  assert.ok(FEEL_KEYS.includes('eventReplay')); assert.equal(FEATURES.eventReplay.surface, 'widget.eventreplay'); assert.ok(FEATURES.eventReplay.where.some(w => /Calendar/.test(w)) && FEATURES.eventReplay.where.some(w => /EVENTREPLAY/.test(w)));
  const feel = fs.readFileSync(new URL('./terminalFeel.js', import.meta.url), 'utf8'); assert.match(feel, /eventReplay: on\('widget\.eventreplay'\)/); assert.match(feel, /import\('\.\/eventReplay\.js'\)/);
  const cl = fs.readFileSync(new URL('./commandLine.js', import.meta.url), 'utf8'); assert.match(cl, /case 'eventreplay'/);
  const core = fs.readFileSync(new URL('./commandCore.js', import.meta.url), 'utf8'); assert.doesNotMatch(core, /from '\.\/eventReplay\.js'/, 'the command table must not pull the feature module in for a desk login');
});
