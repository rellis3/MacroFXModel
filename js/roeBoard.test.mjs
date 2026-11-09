import test from 'node:test';
import assert from 'node:assert/strict';
import * as B from './roeBoard.js';

const row = { specHash: 'abc', title: 'T <b>', observation: 'o', why: 'w', hypothesis: 'h', dataNeeded: 'd', horizons: [1, 5], horizonUnit: 'sessions', baseline: 'b', smallestEffect: 's', minN: 100, mirror: 'm', placebo: 'p', dataBoundary: 'db', inputFlags: ['STALE:VXN'], firstDate: '2026-11-01', lastDate: '2026-11-06', timesRaised: 2, qtVersion: 'q1' };

test('header names the state and never shows an older run as current', () => {
  const h = B.headerHtml({ state: 'stale', message: 'discovery not completed for 2026-11-09; last completed run 2026-11-06', run: { runId: 'r', observations: 3, episodes: 2 } });
  assert.match(h, /discovery not completed for 2026-11-09/);
  assert.match(h, /rb-head bad/);
});
test('rows escape text, show the flag, the count and the not-tested note; no score or verdict wording', () => {
  const h = B.rowHtml(row);
  assert.ok(!h.includes('<b>'), 'escaped');
  assert.match(h, /input flagged: STALE:VXN/);
  assert.match(h, /raised 2 times/);
  assert.match(h, /Not tested yet/);
  assert.ok(!/rejected|failed|\bdead\b|\bscore\b|rank/i.test(h));
});
test('groups render per family and an empty list explains how to fill it', () => {
  assert.match(B.groupsHtml([{ mechanism: 'dealer gamma state', rows: [row] }]), /dealer gamma state/);
  assert.match(B.groupsHtml([]), /python -m roe --push/);
});
test('init: 401 shows a login message', async () => {
  const root = { innerHTML: '' };
  B.init({ getElementById: id => (id === 'roeRoot' ? root : null) }, async () => ({ status: 401 }));
  await new Promise(r => setTimeout(r, 5));
  assert.match(root.innerHTML, /Log in/);
});
