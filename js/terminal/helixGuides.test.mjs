import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HELIX_GUIDES, guideFor, guideText, guideHtml, lessonHref } from './helixGuides.js';
import { SECTIONS, ENGINE_TOOLS } from './jarvisNav.js';
import { MODULE_FILES, viewsOf } from './jarvisModules.js';
import { DESK_EVIDENCE } from '../deskEvidence.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BUILT_IN_VIEWS = ['globe', 'bubbles', 'skyline', 'orbit'];      // drawn by jarvisView.js itself (the other views register through MODULE_FILES)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

test('every registered view has a guide (the module files loaded as the HUD loads them, plus the built-in pictures)', async () => {
  await Promise.all(MODULE_FILES.map(f => import(f).catch(() => null)));
  const ids = [...new Set([...BUILT_IN_VIEWS, ...viewsOf().map(v => v.id)])];
  assert.ok(ids.length >= 30, `only ${ids.length} views registered`);
  const missing = ids.filter(id => !guideFor(id) || guideFor(id).kind !== 'view');
  assert.deepEqual(missing, [], `views with no guide in js/terminal/helixGuides.js: ${missing.join(', ')}`);
});

test('every nav item (each section\'s pictures and panels) and every engine panel has a guide of the right kind', () => {
  const missing = [];
  for (const s of SECTIONS) for (const [kind, id] of s.items) { const g = guideFor(id); if (!g || g.kind !== kind) missing.push(`${kind}:${id}`); }
  for (const id of Object.keys(ENGINE_TOOLS)) if (!guideFor(id)) missing.push(`tool:${id}`);
  assert.deepEqual(missing, [], `add a guide to js/terminal/helixGuides.js for: ${missing.join(', ')}`);
});

test('guides are complete, unique, cite only real Evidence Book ids and real Theory Lab lessons', () => {
  const ev = new Set(DESK_EVIDENCE.map(e => e.id));
  assert.equal(new Set(HELIX_GUIDES.map(g => g.id)).size, HELIX_GUIDES.length, 'duplicate guide ids');
  for (const g of HELIX_GUIDES) {
    assert.ok(['view', 'tool'].includes(g.kind), g.id);
    assert.ok(typeof g.title === 'string' && g.title.length > 1, `${g.id}.title`);
    for (const k of ['shows', 'notTell']) assert.ok(typeof g[k] === 'string' && g[k].length > 10, `${g.id}.${k}`);
    assert.ok(Array.isArray(g.read) && g.read.length >= 1 && g.read.every(x => typeof x === 'string' && x.length > 5), `${g.id}.read`);
    assert.ok(Array.isArray(g.evidence), `${g.id}.evidence`);
    for (const id of g.evidence) assert.ok(ev.has(id), `${g.id} cites ${id}, which is not in js/deskEvidence.js`);
    if (g.lesson != null) {
      assert.ok(/^[a-z0-9-]+\.html$/.test(g.lesson) && !g.lesson.includes('micro'), `${g.id}.lesson ${g.lesson}`);
      assert.ok(existsSync(ROOT + 'theory-lab/lessons/' + g.lesson), `${g.id}: theory-lab/lessons/${g.lesson} does not exist`);
      assert.equal(lessonHref(g), '/theory-lab/lessons/' + g.lesson);
    }
  }
});

test('description only: no guide gives a trade call or advice', () => {
  const bad = /\b(buy|sell|go long|go short|take profit|stop loss|you should|enter (a|the) trade)\b/i;
  for (const g of HELIX_GUIDES) { const t = guideText(g); assert.ok(!bad.test(t), `${g.id}: ${t.match(bad)?.[0]}`); }
});

test('guideText reads as one paragraph; guideHtml escapes and links the evidence and the lesson', () => {
  const g = { id: 'x', kind: 'view', title: 'T<1>', shows: 'Shows a & b.', read: ['One.', 'Two.'], unusual: 'U.', notTell: 'Not this.', evidence: ['vix-inversion'], lesson: 'garch-volatility.html' };
  assert.equal(guideText(g), 'T<1>. Shows a & b. How to read it. One. Two. What is unusual. U. What it does not tell you. Not this.');
  assert.ok(!guideHtml(g, esc).includes('href="/evidence.html'), 'a viewer sees the Evidence Book id as text, not a link to the main site');
  globalThis.deskAccessState = { role: 'owner' };
  const h = guideHtml(g, esc);
  delete globalThis.deskAccessState;
  assert.ok(h.includes('T&lt;1&gt;') && h.includes('a &amp; b') && h.includes('/evidence.html#ev-vix-inversion') && h.includes('/theory-lab/lessons/garch-volatility.html'));
  assert.ok(guideHtml(null, esc).includes('No guide'));
  assert.equal(guideText(null), '');
});
