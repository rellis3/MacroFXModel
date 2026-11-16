// js/terminal/boePathView.test.mjs: the Bank of England path board over a document built from the real file excerpts (tests/fixtures/boe_*), with a fixed clock.
// node js/terminal/boePathView.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseForwardRows, parseBankRateCsv, mergeHistory, buildDocument } from '../boePath.js';
import { boePathHtml, boeSentences, ribbonSvg, bp, dayWord, stepWords } from './boePathView.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fx = f => fs.readFileSync(path.join(root, 'tests/fixtures', f), 'utf8');
const CUR = parseForwardRows(JSON.parse(fx('boe_ois_rows_current.json'))), ARC = parseForwardRows(JSON.parse(fx('boe_ois_rows_archive_tail.json')));
const RATES = parseBankRateCsv(fx('boe_bankrate.csv'));
const NOW = Date.parse('2026-11-16T15:00:00Z');
const DOC = buildDocument({ latest: { months: CUR.months, snap: CUR.snaps.at(-1) }, hist: mergeHistory([], [...ARC.snaps, ...CUR.snaps]), rates: RATES, now: NOW });
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

t('the fixture document is a good one (so the tests below are about the view)', () => { assert.equal(DOC.ok, true); assert.equal(DOC.meetings.length, 8); });

t('small formatters say what they mean', () => {
  assert.equal(bp(12.26), '+12bp'); assert.equal(bp(-30.2), '−30bp'); assert.equal(bp(0.2), '0bp'); assert.equal(bp(null), '–');
  assert.equal(dayWord('2026-12-17'), '17 Dec');
});

t('step wording rounds to the nearest half step', () => {
  assert.equal(stepWords(0.2), 'a fraction of a step'); assert.equal(stepWords(0.5), 'about half a step'); assert.equal(stepWords(1.0), 'about one step');
  assert.equal(stepWords(1.8), 'about 2 steps'); assert.equal(stepWords(1.5), 'about one and a half steps'); assert.equal(stepWords(2.5), 'about 2.5 steps');
});

t('the sentences state Bank Rate and its last change, the next meeting, the running total and the 12-month level, from the numbers only', () => {
  const s = boeSentences(DOC);
  assert.equal(s[0], 'Bank Rate is 4.00%, raised from 3.75% on 5 Nov.');
  assert.match(s[1], /^At the next meeting \(17 Dec\) the curve prices \+\d+bp: a \d+% chance of a 25bp hike on the Bank's usual step\.$/);
  assert.match(s[2], /^By \d{1,2} \w{3} the running total is \+\d+bp \(\d\.\d\d%\), (about [a-z0-9. ]+ steps?|a fraction of a step)\.$/);
  assert.match(s[3], /^Twelve months out the curve is at \d\.\d\d%\.$/);
  assert.deepEqual(boeSentences({ ok: false }), []);
});

t('the board says priced not forecast and leaves the surface wrapper to the page, and draws the ribbon and one table row per meeting', () => {
  const h = boePathHtml(DOC, {}, NOW);
  assert.ok(!/data-surface=/.test(h), 'the page wraps the board in its surface, not the view');
  assert.match(h, /priced, not forecast/); assert.match(h, /RATE PATH: PRICED, NOT FORECAST/);
  assert.match(h, /<svg class="fpy-svg" viewBox="0 0 560 230"/);
  assert.equal((h.match(/<tr><td class="mono">/g) ?? []).length, DOC.meetings.length);
  assert.match(h, /Evidence Book/); assert.match(h, /data-ev="stir-wide-scan"/);
  assert.match(h, /smoothed/);
});

t('colours are theme tokens only and nothing reads NaN or undefined', () => {
  const h = boePathHtml(DOC, {}, NOW);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(h.replace(/&#\d+;/g, '')), 'a hex colour');
  assert.ok(!/rgba?\(/.test(h), 'an rgb colour');
  assert.ok(!/NaN|undefined|null/.test(h), (h.match(/.{20}(NaN|undefined|null).{20}/) ?? [])[0]);
});

t('a priced hike is red and a priced cut is green, the way the Fed cards do it', () => {
  const cut = structuredClone(DOC); cut.meetings[0] = { ...cut.meetings[0], dir: 'cut', stepBp: -12, pMove: 0.48, steps: 0.48, multi: false };
  assert.match(boePathHtml(DOC, {}, NOW), /class="n mono dn">\+12bp/);
  assert.match(boePathHtml(cut, {}, NOW), /class="n mono up">−12bp/);
});

t('the data-age chip: current at the fixture date, very stale a fortnight later', () => {
  assert.match(boePathHtml(DOC, {}, NOW), /data-age="ok"/);
  assert.match(boePathHtml(DOC, {}, Date.parse('2026-11-30T12:00:00Z')), /data-age="bad"/);
});

t('the ribbon has a ghost for each earlier reading we hold, and none for a missing one', () => {
  const svg = ribbonSvg(DOC);
  assert.equal((svg.match(/<title>1 (day|week|month) ago/g) ?? []).length, 3);
  const noM1 = structuredClone(DOC); noM1.ticks.m1 = null; noM1.meetings.forEach(r => { r.ticks.m1 = null; });
  assert.equal((ribbonSvg(noM1).match(/<title>1 month ago/g) ?? []).length, 0);
  assert.match(boePathHtml(noM1, {}, NOW), /No earlier curve held yet for: 1 month/);
  assert.equal(ribbonSvg({ ok: false }), ''); assert.equal(ribbonSvg({ ...DOC, meetings: DOC.meetings.slice(0, 1) }), '');
});

t('the meeting list running out is said on the card, not hidden', () => {
  const stale = structuredClone(DOC); stale.meetingsInfo = { ...stale.meetingsInfo, stale: true, remaining: 1 };
  assert.match(boePathHtml(stale, {}, NOW), /meeting list needs updating/);
  assert.ok(!/meeting list needs updating/.test(boePathHtml(DOC, {}, NOW)));
});

t('no feed yet draws nothing; a failed feed says why and that the rest stands; reasons are escaped', () => {
  assert.equal(boePathHtml(undefined), '');
  const bad = boePathHtml({ ok: false, error: 'nothing', fetch: { reason: '<script>alert(1)</script> HTTP 403' } });
  assert.match(bad, /not available: &lt;script&gt;alert\(1\)&lt;\/script&gt; HTTP 403/); assert.ok(!/<script>/.test(bad));
  assert.match(bad, /stand on their own/);
});

console.log(`boePathView: ${n} tests passed`);
