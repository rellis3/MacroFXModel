// node --test js/terminal/replayView.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defaultDate, lineStyle, lagLabel } from './replayView.js';
import { openReplay } from './replayLink.js';

test('first visit starts on the last weekday session, never a weekend', () => {
  assert.equal(defaultDate(Date.parse('2026-11-16T09:00:00Z')), '2026-11-13');   // Monday -> Friday
  assert.equal(defaultDate(Date.parse('2026-11-14T09:00:00Z')), '2026-11-13');   // Saturday -> Friday
  assert.equal(defaultDate(Date.parse('2026-11-18T09:00:00Z')), '2026-11-17');
});

test('line styles: strong walls and the flips glow, others are dashed; forecast and open are quiet; colours are theme tokens', () => {
  assert.deepEqual(lineStyle({ kind: 'oi', type: 'call', tier: 'strong' }), { tok: 'blue2', strong: true, dash: [] });
  assert.equal(lineStyle({ kind: 'oi', type: 'put', tier: 'moderate' }).strong, false);
  assert.equal(lineStyle({ kind: 'oi', type: 'gammaflip' }).strong, true);
  assert.equal(lineStyle({ kind: 'fc' }).tok, 'flat');
  assert.equal(lineStyle({ kind: 'open' }).tok, 'tx3');
});

test('lag label says when the option book was saved, which session it is for, and when it is stale', () => {
  const l = { kind: 'oi', publishedAt: Date.parse('2026-11-14T06:45:00Z'), tradeDate: '2026-11-13', stale: false };
  assert.match(lagLabel(l), /option book saved 2026-11-14 06:45 London, for the 2026-11-13 session's open interest/);
  assert.match(lagLabel({ ...l, stale: true }), /STALE/);
  assert.match(lagLabel({ kind: 'fc' }), /forecast/);
});

test('openReplay: opens through the tab button, passes the request, and refuses when the tab is off', () => {
  let clicked = 0, loaded = null;
  const root = { dataset: { built: '1' }, __rp: { load: (i, t) => { loaded = [i, t]; } } };
  const doc = { querySelector: () => ({ hidden: false, click: () => { clicked++; } }), getElementById: () => root };
  assert.equal(openReplay('NQ', 123, doc), true);
  assert.equal(clicked, 1); assert.deepEqual(loaded, ['NQ', 123]);
  const fresh = { querySelector: () => ({ hidden: false, click: () => { clicked++; } }), getElementById: () => ({ dataset: {} }) };
  assert.equal(openReplay('GOLD', 456, fresh), true);
  assert.equal(globalThis.__replayRequest.inst, 'GOLD');                       // left for the view to consume on first mount
  globalThis.__replayRequest = null;
  assert.equal(openReplay('NQ', 1, { querySelector: () => ({ hidden: true, click() {} }), getElementById: () => null }), false);
  assert.equal(openReplay('NQ', 1, { querySelector: () => null, getElementById: () => null }), false);
});

test('GUARD: the replay view says it describes and does not predict, and keeps the reduced-motion path', () => {
  const src = fs.readFileSync(new URL('./replayView.js', import.meta.url), 'utf8');
  assert.match(src, /does not say what price will do next/);
  assert.match(src, /prefers-reduced-motion/);
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ''), /(buy|sell|entry|stop loss|take profit|invalidation)/i, 'no trade wording in the view');
});
