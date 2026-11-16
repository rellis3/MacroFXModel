// js/terminal/flagStrip.test.mjs: the risk-flag history strip (pure model, the ribbons and cards, the loader over a stand-in fetch, the command and the wiring).
// node --test js/terminal/flagStrip.test.mjs. It does NOT prove the look or the feel in a real browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as C from '../riskFlagStripCore.js';
import { ribbonSvg, boardHtml, compactHtml, loadPoints, resetCache } from './flagStrip.js';
import { FLAG_EVIDENCE } from './flagsView.js';
import { buildCommands } from './commandCore.js';
import { SURFACES } from './tabRegistry.js';
import { FEEL_KEYS } from './terminalFeel.js';
import { FEATURES } from './featureStatus.js';

const H = 3600e3, T0 = Date.parse('2026-11-14T18:00:00Z');
// 30 hourly points: vix_term on for hours 5-9 and 20-22 (2 episodes), vix_level never on, evz_stress never readable, hy_speed on at the end
const pt = i => ({ ts: T0 + i * H, d: { risk: { flags: {
  vix_level: [0, 18], vix_term: [i >= 5 && i <= 9 || i >= 20 && i <= 22 ? 1 : 0, 0.9], hy_speed: [i >= 28 ? 1 : 0, -20], jpy_bid: [0, 0.4], evz_stress: [0, null], stock_bond_corr: [i === 12 ? 0 : 0, i === 12 ? null : 0.02] } } } });
const points = Array.from({ length: 30 }, (_, i) => pt(i));
const evidence = [{ id: 'vix-inversion', verdict: 'validated', claim: 'a VIX inversion is followed by wider ranges', use: 'range runs wider' }, { id: 'mv-vixterm-range', verdict: 'validated', claim: 'range', use: '' }, { id: 'mv-creditstack-range', verdict: 'validated', claim: 'range', use: 'wider' }, { id: 'stock-bond-flip', verdict: 'context', claim: 'flip', use: '' }];

test('seriesOf and summarise: on, off and could-not-read are three different things', () => {
  const s = C.seriesOf(points), vt = C.summarise(s.vix_term), ev = C.summarise(s.evz_stress), sb = C.summarise(s.stock_bond_corr);
  assert.equal(s.vix_term.length, 30); assert.equal(vt.on, 8); assert.equal(vt.episodes, 2); assert.equal(vt.now, 0); assert.ok(Math.abs(vt.share - 8 / 30) < 1e-9); assert.ok(vt.lastChange === T0 + 23 * H, 'last change is the first off after the second episode');
  assert.equal(ev.read, 0); assert.equal(ev.gaps, 30); assert.equal(ev.share, null); assert.equal(ev.now, null); assert.equal(sb.gaps, 1, 'one reading with no value is a gap, not off');
  assert.equal(C.summarise(s.hy_speed).now, 1); assert.equal(C.summarise(s.hy_speed).episodes, 1); assert.deepEqual(C.seriesOf([]).vix_level, []); assert.equal(C.seriesOf([{ ts: 1, d: {} }]).vix_level.length, 0);
});

test('evidenceKind: only a validated RANGE finding is marked as one; a nearest test and a bare light are labelled as such', () => {
  assert.equal(C.evidenceKind('vix_term', FLAG_EVIDENCE, evidence).kind, 'range'); assert.equal(C.evidenceKind('hy_speed', FLAG_EVIDENCE, evidence).kind, 'nearest');
  assert.equal(C.evidenceKind('jpy_bid', FLAG_EVIDENCE, evidence).kind, 'light'); assert.match(C.evidenceKind('stock_bond_corr', FLAG_EVIDENCE, evidence).words, /context/); assert.match(C.evidenceKind('vix_term', FLAG_EVIDENCE, evidence).words, /never which way/);
});

test('model: six rows in order, plain sentences, honest depth, and the empty cases', () => {
  const m = C.model(points, { flagEvidence: FLAG_EVIDENCE, evidence }); assert.ok(m.ok); assert.deepEqual(m.rows.map(r => r.key), C.FLAGS.map(f => f.key));
  const byKey = Object.fromEntries(m.rows.map(r => [r.key, r.text]));
  assert.match(byKey.vix_term, /on for 27% of 30 readings in 2 episodes; off now, last changed 6 hours ago/); assert.match(byKey.vix_level, /off at every one of 30 readings/); assert.match(byKey.evz_stress, /could not be read at any of the 30 captures/);
  assert.match(m.headline, /1 of 5 readable flags are on now; 2 of the six have been on at some point since 14 Nov/); assert.match(m.depth, /30 saved captures from 14 Nov to 15 Nov/); assert.equal(m.ticks.length, 1);
  assert.equal(C.model([], {}).ok, false); assert.match(C.model([pt(0)], {}).why, /Only one saved capture/); assert.match(C.model([], {}).depth, /No saved snapshots/);
  for (const r of m.rows) assert.doesNotMatch(r.text, /\b(bullish|bearish|will|signal|buy|sell)\b/i, r.text);
});

test('the picture: tokens only, one block per capture, the hatch for a gap, labelled for a screen reader', () => {
  const m = C.model(points, { flagEvidence: FLAG_EVIDENCE, evidence }), svg = ribbonSvg(m.rows[1], m, { id: 'x' });
  assert.equal((svg.match(/<rect x=/g) ?? []).length, 30); assert.match(svg, /role="img" aria-label="VIX term structure: on for 27%/); assert.doesNotMatch(svg, /#[0-9a-fA-F]{3,8}\b|rgb\(/); assert.match(svg, /var\(--dn\)/);
  const gap = ribbonSvg(m.rows[4], m, { id: 'y' }); assert.match(gap, /url\(#y-gap\)/); assert.doesNotMatch(gap, /var\(--dn\)/);
  const b = boardHtml(m); assert.match(b, /data-surface="panel.risk.strip"/); assert.match(b, /range finding: VALIDATED/); assert.match(b, /nearest test only/); assert.match(b, /a light, not a finding/); assert.match(b, /data-rfs-csv/); assert.match(b, /never which way/); assert.doesNotMatch(b, /undefined|NaN/);
  const c = compactHtml(m); assert.match(c, /data-rfs-compact/); assert.equal((c.match(/class="rfs-mini"/g) ?? []).length, 6); assert.equal(compactHtml({ ok: false }), ''); assert.match(boardHtml({ ok: false, why: 'x <y>', depth: 'd' }), /x &lt;y&gt;/);
  const csv = C.csv(m).split('\n'); assert.equal(csv.length, 31); assert.match(csv[0], /^time_utc,vix_level,vix_term/); assert.match(csv[1], /^2026-11-14T18:00:00.000Z,0,0,0,0,,0$/);
});

test('loadPoints: one request for the whole record, hourly, risk section only, cached for five minutes', async () => {
  resetCache(); const urls = []; const fetchJson = async u => { urls.push(u); return { ok: true, points: [...points, { ts: 5, d: {} }] }; };
  const now = () => T0 + 40 * H, a = await loadPoints({ fetchJson, now }), b = await loadPoints({ fetchJson, now }); assert.equal(a.length, 30, 'a point with no risk section is dropped'); assert.equal(urls.length, 1); assert.match(urls[0], /fields=risk&step=60&max=400&from=2026-11-14/);
  await loadPoints({ fetchJson, now: () => T0 + 40 * H + 6 * 60e3 }); assert.equal(urls.length, 2); resetCache();
});

test('the FLAGHISTORY command and the wiring: preview surface, loader, flags board gate, status panel', () => {
  const c = buildCommands({ isOn: () => true, now: () => T0 }).find(x => x.id === 'flaghistory');
  assert.ok(c && c.help.length > 80 && c.example && c.opens && c.surface === 'panel.risk.strip'); assert.doesNotMatch(`${c.help} ${c.opens}`, /\b(buy|sell|entry|target|stop|signal)\b/i); assert.deepEqual(c.run('').action, { kind: 'flaghistory' });
  const s = SURFACES.find(x => x.id === 'panel.risk.strip'); assert.ok(s && s.hidden === 'preview' && s.kind === 'panel'); assert.ok(FEEL_KEYS.includes('riskStrip')); assert.equal(FEATURES.riskStrip.surface, 'panel.risk.strip');
  assert.ok(FEATURES.riskStrip.where.some(w => /Overview/.test(w)) && FEATURES.riskStrip.where.some(w => /Risk flags/.test(w)) && FEATURES.riskStrip.where.some(w => /FLAGHISTORY/.test(w)));
  const feel = fs.readFileSync(new URL('./terminalFeel.js', import.meta.url), 'utf8'); assert.match(feel, /riskStrip: on\('panel\.risk\.strip'\)/); assert.match(feel, /import\('\.\/flagStrip\.js'\)/);
  const fv = fs.readFileSync(new URL('./flagsView.js', import.meta.url), 'utf8'); assert.match(fv, /deskSurfaceOn\?\.\('panel\.risk\.strip'\)/); assert.match(fv, /import\('\.\/flagStrip\.js'\)/); assert.doesNotMatch(fv, /^import .*flagStrip/m, 'a desk login gets no strip code');
  assert.match(fs.readFileSync(new URL('./commandLine.js', import.meta.url), 'utf8'), /case 'flaghistory'/);
});
