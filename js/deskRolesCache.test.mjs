import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStagePrompt } from './deskRoles.js';
import { CACHE_MARK, splitCacheMark } from './modelRouter.js';

const role = { id: 'r', body: 'You are r.', output: 'global_view', evidence: [] };
const pack = { date: '2026-11-07' };

test('buildStagePrompt: the cache mark sits after the date and evidence, and removing it gives the old text', () => {
  const { prompt } = buildStagePrompt({ role, pack, ledger: [], sections: [['A', 'one'], ['B', 'two']], tail: 'end' });
  assert.equal(prompt.split(CACHE_MARK).length, 2);
  const { lead, rest } = splitCacheMark(prompt);
  assert.equal(lead, 'Desk date: 2026-11-07.\n\n');
  assert.equal(lead + rest, 'Desk date: 2026-11-07.\n\n## A\none\n\n## B\ntwo\n\nend');   // exactly what the model saw before
});

test('buildStagePrompt: stableSections moves the mark after the first sections; empty ones are skipped', () => {
  const { prompt } = buildStagePrompt({ role, pack, ledger: [], stableSections: 2, sections: [['Book', 'big'], ['Empty', ''], ['Case', 'this case']] });
  const { lead, rest } = splitCacheMark(prompt);
  assert.equal(lead, 'Desk date: 2026-11-07.\n\n## Book\nbig\n\n');
  assert.equal(rest, '## Case\nthis case');
});
