// js/terminal/featureStatus.test.mjs: the words the Preview features panel and the command line use to say what a preview feature is doing on this page.
// node --test js/terminal/featureStatus.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES, KEY_OF_SURFACE, statusOf, statusLine, whyNot } from './featureStatus.js';
import { surfaceById } from './tabRegistry.js';
import { rowDetail, panelHtml } from './previewSwitches.js';
import { FEEL_KEYS } from './terminalFeel.js';
import { VISUALS } from '../replayVizCore.js';

test('every feature the loader starts has a status entry, a registry surface and a where-to-find-it line', () => {
  assert.deepEqual([...FEEL_KEYS].sort(), Object.keys(FEATURES).sort(), 'terminalFeel.js and featureStatus.js name the same features');
  for (const [k, f] of Object.entries(FEATURES)) {
    assert.ok(surfaceById(f.surface), `${k}: ${f.surface} is a registered surface`);
    assert.ok(f.name && f.where.length >= 1 && f.where.every(w => w.length > 10), `${k} says where to look`);
    assert.equal(KEY_OF_SURFACE[f.surface], k);
  }
});

test('the replay entry names every replayable visual\'s card, the export entry names its four tabs (so the words cannot drift from the code)', () => {
  const where = FEATURES.replayViz.where.join('\n');
  for (const must of ['currency strength', 'The curve through time', 'Atlanta Fed window odds', 'Growth × inflation', 'How markets have been moving together', 'Vol clock']) assert.ok(where.includes(must), `replay: ${must}`);
  for (const v of VISUALS) assert.ok(where.includes(`PLAY ${v.id}`) || where.includes(v.id), `the PLAY word for ${v.id} is named`);
  const ex = FEATURES.exporter.where.join('\n');
  for (const must of ['Monitor', 'Insight', 'Calendar', 'Currencies', 'EXPORT']) assert.ok(ex.includes(must), `export: ${must}`);
});

test('statusOf: loaded, failed with a reason, not requested, and still starting', () => {
  const feel = { done: true, features: { replayViz: { requested: true, loaded: true, error: null }, exporter: { requested: true, loaded: false, error: 'boom' }, cmdline: { requested: false, loaded: false, error: null }, alerts: { requested: true, loaded: false, error: null } } };
  assert.equal(statusOf(feel, 'replayViz').state, 'loaded');
  assert.deepEqual(statusOf(feel, 'exporter'), { state: 'failed', reason: 'boom' });
  assert.equal(statusOf(feel, 'cmdline').state, 'not-requested');
  assert.equal(statusOf(feel, 'alerts').state, 'failed', 'asked for, finished, never attached: reported, not hidden');
  assert.equal(statusOf(null, 'replayViz').state, 'waiting'); assert.equal(statusOf({ done: false, features: {} }, 'replayViz').state, 'waiting');
  assert.equal(statusLine(feel, 'exporter'), 'failed: boom'); assert.equal(statusLine(feel, 'replayViz'), 'loaded');
});

test('whyNot says WHY a command did nothing, in words, per state', () => {
  const win = { __deskFeel: { done: true, features: { replayViz: { requested: true, loaded: true }, exporter: { requested: true, loaded: false, error: 'import failed' }, linked: { requested: false, loaded: false } } } };
  assert.match(whyNot('replay-viz', win), /board has not drawn|Open the tab/i);
  assert.match(whyNot('export', win), /did not start: import failed/);
  assert.match(whyNot('link', win), /switched off for this login/);
  const ok = { __deskFeel: { done: true, features: { exporter: { requested: true, loaded: true } } } };
  assert.match(whyNot('export', ok), /Monitor, Insight, Calendar and Currencies/);
  assert.match(whyNot('tab', win), /did nothing/);
  assert.match(whyNot('export', {}), /still starting/);
});

test('the Preview features panel row shows the status and a "Where do I see it?" list for a feature the loader starts, and nothing extra for one it does not', () => {
  const row = { id: 'widget.replayviz' }, feel = { done: true, features: { replayViz: { requested: true, loaded: true } } };
  const h = rowDetail(row, feel);
  assert.match(h, /On this page: <b class="up" data-pv-status="replayViz">loaded<\/b>/); assert.match(h, /Where do I see it\?/); assert.match(h, /The curve through time/);
  const failed = rowDetail({ id: 'widget.export' }, { done: true, features: { exporter: { requested: true, loaded: false, error: 'x' } } });
  assert.match(failed, /class="dn"[^>]*>failed: x/);
  assert.equal(rowDetail({ id: 'panel.insight.gold' }, feel), '');
  assert.match(panelHtml({}, feel), /data-pv-status="replayViz"/);
});

test('a feature that is installed but waits for its tab to be built is "waiting", not "failed" (News saved searches attach on the first visit to the News tab)', () => {
  const feel = { done: true, features: { newsSearches: { requested: true, loaded: false, waiting: true, error: null } } };
  assert.equal(statusOf(feel, 'newsSearches').state, 'waiting'); assert.match(statusLine(feel, 'newsSearches'), /^waiting: installed/);
});
