// Research hub views (js/research/hubView.js). Run: node --test js/research/hubView.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as V from './hubView.js';
import { hubMap, parseAgenda } from '../researchHub.js';

test('the loop: five steps with arrows, the shelf below, unread sources shown as a dash, the library locked', () => {
  const h = V.loopHtml(hubMap({ rooms: [{ waiting: { on: 'you' }, status: 'open' }] }));
  for (const s of ['In', 'Ask', 'Talk', 'Test', 'Known', 'Shelf', 'Rooms waiting on you', 'Theory Lab', 'C.OG education', 'library.html', '🔒']) assert.ok(h.includes(s), s);
  assert.equal((h.match(/class="arr"/g) ?? []).length, 4);
  assert.match(h, /class="tv na"/);
  assert.match(h, /class="tile warn" href="#rooms"/);
});

test('agenda cards: open ones get a room button, run ones fold away, text escaped', () => {
  const a = parseAgenda('# Agenda: <b>x</b>\n### Q1. One <i> — score 12/15\n> do it\n### Q2. Two — score 9/15 — **RUN 2026-11-01: NULL**\n> done\n', 'x.md');
  const h = V.agendasHtml([a]);
  assert.ok(h.includes('&lt;b&gt;x&lt;/b&gt;') && h.includes('One &lt;i&gt;'));
  assert.equal((h.match(/data-card=/g) ?? []).length, 1);
  assert.match(h, /1 run or parked/);
  assert.match(V.agendasHtml(null), /Could not read/);
});

test('queue, ledger, register and verdict lists render and escape', () => {
  const q = V.queueHtml([{ id: '1', kind: 'video', status: 'queued', lane: 'cog', at: '2026-11-12T15:00:00Z', url: 'https://youtu.be/a"b', note: '<x>' }, { id: '2', kind: 'text', status: 'done', lane: 'auto', at: '2026-11-12T15:00:00Z', text: 'hello', result: { note: 'ok', path: 'p.md' } }], { cog: 'C.OG' });
  assert.ok(q.includes('🎬 video') && q.includes('C.OG') && q.includes('&lt;x&gt;') && q.includes('a&quot;b') && q.includes('<code>p.md</code>'));
  assert.match(V.queueHtml([]), /Nothing dropped/);
  assert.match(V.intakeHtml([]), /process the research inbox/);
  assert.match(V.intakeHtml(null), /Could not read/);
  assert.match(V.registerHtml([{ id: 'r', status: 'RUNNING', question: 'q', updated: '2026-11-12', next: 'n' }]), /running/);
  assert.match(V.latestHtml([{ id: 'e', verdict: 'null', date: '2026-11-01', claim: 'c' }]), /NULL/);
});
