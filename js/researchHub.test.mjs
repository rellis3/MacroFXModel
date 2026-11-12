// Research hub (js/researchHub.js): the repo-file parsers, the drop-box queue, the related reading and the map. Run: node --test js/researchHub.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as H from './researchHub.js';
import * as RRM from './researchRoom.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const AGENDA = `# Agenda: rough volatility (is it rough?)

Intro text.

## Cards, in rank order

### Q1. Is it rough on our series, or is that the proxy? — score 13/15

> Build the structure function of log daily realised variance.
> Then run the identical estimator on a simulated smooth process.

Some notes.

### Q2. Does a rough forecast beat HAR-800? — score 11/15, gated on Q1

> Fit and compare.

### Q3. Split-book mirror — score 14/15 — **RUN 2026-11-03: NULL** (\`gex-split-book\`)

> Done already.

### Q4. PCA loading stability — score 6/15 (Parked)
`;

test('an agenda: title, every card, its score, status and quoted text', () => {
  const a = H.parseAgenda(AGENDA, '/x/rough-volatility.md');
  assert.equal(a.theme, 'rough-volatility');
  assert.equal(a.title, 'rough volatility (is it rough?)');
  assert.deepEqual(a.cards.map(c => [c.n, c.score, c.status]), [[1, 13, 'open'], [2, 11, 'gated'], [3, 14, 'run'], [4, 6, 'parked']]);
  assert.equal(a.cards[0].title, 'Is it rough on our series, or is that the proxy?');
  assert.match(a.cards[0].text, /structure function .* smooth process/);
  assert.equal(a.cards[0].key, 'rough-volatility#Q1');
  assert.equal(a.cards[3].text, '');
});

test('every agenda in the repo parses to at least one card (the hub shows them)', () => {
  const dir = path.join(root, H.AGENDA_DIR);
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
    const a = H.parseAgenda(fs.readFileSync(path.join(dir, f), 'utf8'), f);
    assert.ok(a.cards.length > 0, `${f}: no "### Q<n>. title — score s/15" cards found`);
    for (const c of a.cards) assert.ok(c.title && Number.isFinite(c.score), `${f} Q${c.n}: title and score`);
  }
});

test('the register and the intake ledger parse from the repo files', () => {
  const reg = H.parseRegister(fs.readFileSync(path.join(root, H.REGISTER_FILE), 'utf8'));
  assert.ok(reg.length > 10 && reg.every(r => r.id && r.status));
  assert.ok(reg.some(r => r.status === 'BANKED'));
  const md = '| Processed | Lane | Source | Title | URL | Note | Ideas carded | Method lessons |\n|---|---|---|---|---|---|---|---|\n| 2026-11-12 | technical | Quant Guild | Volatility is rough | https://youtu.be/x | [note](technical/quant-guild/a.md) | rough-volatility Q1-Q3 | #10, #11 |\n';
  const rows = H.parseIntakeIndex(md);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].lane, rows[0].title, rows[0].note, rows[0].ideas], ['technical', 'Volatility is rough', 'technical/quant-guild/a.md', 'rough-volatility Q1-Q3']);
  assert.ok(Array.isArray(H.parseIntakeIndex(fs.readFileSync(path.join(root, H.INTAKE_INDEX), 'utf8'))));
  const les = H.methodLessonCounts('| 1 | a | DO WORSE | x | y | **PROPOSED**: z |\n| 2 | b | DON\'T DO | x | y | WATCH |\n');
  assert.deepEqual(les, { total: 2, proposed: 1 });
});

test('the drop box: links, text and pictures; junk refused; a repeated link refused; marking done', () => {
  const now = '2026-11-12T15:00:00.000Z';
  const v = H.normaliseDrop({ lane: 'cog', url: 'https://www.youtube.com/watch?v=abc', note: 'his GEX point' }, { now, id: 'in-1' });
  assert.ok(v.ok); assert.deepEqual([v.item.kind, v.item.lane, v.item.status], ['video', 'cog', 'queued']);
  assert.equal(H.normaliseDrop({ url: 'https://ssrn.com/abstract=123' }).item.kind, 'paper');
  assert.equal(H.normaliseDrop({ url: 'https://example.com/post' }).item.kind, 'link');
  assert.equal(H.normaliseDrop({ lane: 'nonsense', text: 'A Discord message long enough to keep.' }).item.lane, 'auto');
  assert.equal(H.normaliseDrop({ url: 'javascript:alert(1)' }).ok, false);
  assert.equal(H.normaliseDrop({ text: 'short' }).ok, false);
  assert.equal(H.normaliseDrop({ image: { id: '../etc' } }).ok, false);
  assert.equal(H.normaliseDrop({ image: { id: 'img-abc123-ff00aa', ext: 'png', name: 'chart.png' } }).item.kind, 'image');
  let q = { v: 1, items: [] };
  q = H.addDrop(q, v.item).queue;
  const again = H.addDrop(q, { ...v.item, id: 'in-2', url: 'https://www.youtube.com/watch?v=abc/' });
  assert.equal(again.ok, false); assert.match(again.error, /already in the queue/);
  const m = H.markItem(q, 'in-1', { status: 'done', note: 'note written', path: 'education/intake/cog/x.md', at: now });
  assert.ok(m.ok); assert.equal(m.queue.items[0].status, 'done'); assert.equal(m.queue.items[0].result.path, 'education/intake/cog/x.md');
  assert.equal(H.markItem(q, 'nope').ok, false);
  assert.equal(H.markItem(q, 'in-1', { status: 'eaten' }).ok, false);
});

test('related reading: the open cards and intake notes nearest a room, never a card already run', () => {
  const cards = H.parseAgenda(AGENDA, 'rough-volatility.md').cards.map(c => ({ ...c, agendaTitle: 'rough volatility' }));
  const intake = [{ title: 'Volatility is rough', source: 'Quant Guild', lane: 'technical', ideas: 'rough-volatility Q1', lessons: '' }, { title: 'Gold seasonality', source: 'Crown', lane: 'informational', ideas: '', lessons: '' }];
  const r = H.relatedReading('is realised volatility rough, structure function, smooth process', { cards, intake });
  assert.ok(r.cards.length >= 1 && r.cards.every(c => !/Split-book/.test(c.title)));
  assert.equal(r.intake[0].title, 'Volatility is rough');
  assert.ok(!r.intake.some(n => n.title === 'Gold seasonality'));
  assert.match(H.readingText(r), /research director has already set/);
  assert.deepEqual(H.relatedReading('', { cards, intake }), { cards: [], intake: [] });
});

test('a room carries the related reading: the timeline shows it and every prompt reads it', () => {
  const reading = { cards: [{ key: 'rough-volatility#Q1', title: 'Is it rough?', agenda: 'rough volatility', score: 13, text: 'structure function' }], intake: [] };
  const c = RRM.newRoom({ id: 'room-1', date: '2026-11-12', ownerText: 'Is volatility rough on our series?', reading });
  assert.deepEqual(c.room.reading, reading);
  assert.ok(RRM.timeline(c).some(m => m.kind === 'reading' && m.cards.length === 1));
  assert.match(RRM.roomText(c), /Is it rough\?/);
  assert.match(RRM.talkPrompt(c, 'quant'), /Is it rough\?/);
  const bare = RRM.newRoom({ id: 'room-2', date: '2026-11-12', ownerText: 'Something with nothing on the shelf', reading: { cards: [], intake: [] } });
  assert.equal(bare.room.reading, null);
  assert.ok(!RRM.timeline(bare).some(m => m.kind === 'reading'));
});

test('the map: six steps, live counts, and null (not 0) when a source could not be read', () => {
  const m = H.hubMap({
    rooms: [{ waiting: { on: 'you' }, status: 'open' }, { waiting: { on: 'team' }, status: 'open' }, { waiting: { on: 'closed' }, status: 'parked' }],
    agendas: [H.parseAgenda(AGENDA, 'rough-volatility.md')], register: [{ status: 'RUNNING' }, { status: 'BANKED' }, { status: 'REGISTERED' }],
    queue: { items: [{ status: 'queued' }, { status: 'done' }] }, evidence: [{ id: 'a', verdict: 'null', date: '2026-11-01', claim: 'x' }, { id: 'b', verdict: 'validated', date: '2026-11-10', claim: 'y' }],
  });
  assert.deepEqual(m.map(s => s.id), ['in', 'ask', 'talk', 'test', 'known', 'shelf']);
  const t = (step, label) => m.find(s => s.id === step).tiles.find(x => x.label === label);
  assert.equal(t('in', 'Waiting for the intake skill').value, 1);
  assert.equal(t('ask', "Director's open questions").value, 2);
  assert.equal(t('talk', 'Rooms waiting on you').value, 1);
  assert.equal(t('talk', 'Rooms working').value, 1);
  assert.equal(t('test', 'Studies claimed or running').value, 2);
  assert.equal(t('known', 'Evidence Book entries').value, 2);
  assert.equal(m.find(s => s.id === 'known').latest[0].id, 'b');
  assert.equal(t('shelf', 'Papers in the library').value, null);   // not read: null, never 0
  assert.equal(t('ask', 'Scanner questions').value, null);
  assert.ok(t('shelf', 'Papers in the library').lock);
  assert.ok(t('ask', 'New idea').link);
});
