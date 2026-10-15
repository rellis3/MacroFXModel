import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prohibitions, claimTerms, auditText, compareOutputs, structuralCheck, readableText } from './modelAudit.js';
import { DESK_EVIDENCE } from './deskEvidence.js';

// A small hand-made ledger, so the behaviour tests do not move when the real one grows.
const LEDGER = [
  {
    id: 'squeeze-fuel', verdict: 'null',
    claim: 'A crowded, underwater retail position is squeeze fuel',
    use: 'The position book is descriptive only. Never read crowded positioning as a squeeze setup.',
    doc: 'MD files/SQUEEZE_VOL_TEST.md',
  },
  {
    id: 'surprise-size', verdict: 'validated',
    claim: 'A bigger economic surprise is followed by a wider range',
    use: 'Use it for range. Never a direction.',
  },
  {
    id: 'breadth-narrowing', verdict: 'null',
    claim: 'Narrowing market breadth predicts an index decline',
    use: 'Show the narrowing, never alert on it.',
  },
];

test('prohibitions are mined from the ledger, not invented here', () => {
  const p = prohibitions(LEDGER);
  assert.ok(p.length >= 3);
  assert.ok(p.some(x => x.id === 'squeeze-fuel' && /Never read crowded positioning/i.test(x.sentence)));
  // "Never a direction." has no subject of its own, so the topic must come from the claim
  const sd = p.find(x => x.id === 'surprise-size');
  assert.ok(sd.terms.includes('surprise'), 'topic terms come from the claim, not the prohibition');
});

test('a validated finding quoted as a direction call is still worth catching', () => {
  // surprise-size is VALIDATED for range; using it directionally is the classic misuse
  const p = prohibitions(LEDGER);
  assert.ok(p.some(x => x.verdict === 'validated'), 'validated entries can carry prohibitions too');
});

test('claim terms drop filler and keep the subject', () => {
  const t = claimTerms('A crowded, underwater retail position is squeeze fuel');
  assert.ok(t.includes('crowded') && t.includes('position') && t.includes('squeeze'));
  assert.ok(!t.includes('the') && !t.includes('is'));
});

test('an answer that contradicts a banked null is flagged', () => {
  const bad = 'Retail is heavily crowded long here. That crowded position is squeeze fuel and '
            + 'the pair should rally hard as those shorts are forced to cover.';
  const r = auditText(bad, LEDGER);
  assert.ok(r.counts.flagged >= 1, 'a forecast built on a tested-null mechanism must flag');
  assert.equal(r.flags[0].id, 'squeeze-fuel');
  assert.ok(r.flags[0].prohibition.length > 0, 'the flag must carry the desk\'s own words');
});

test('naming the topic without forecasting is NOT a violation', () => {
  const fine = 'Retail positioning is crowded long, and the position book is shown here as context.';
  assert.equal(auditText(fine, LEDGER).counts.flagged, 0);
});

test('forecasting about something untested is NOT a violation', () => {
  const fine = 'The euro will likely rise into the close on month-end flows.';
  assert.equal(auditText(fine, LEDGER).counts.flagged, 0, 'the screen must not flag all forecasting');
});

test('a sentence that cites the null itself is the model behaving, and is not flagged', () => {
  const good = 'Positioning is crowded long, but crowded positioning as squeeze fuel was tested here '
             + 'and came back null, so it says nothing about whether this will rally.';
  assert.equal(auditText(good, LEDGER).counts.flagged, 0,
    'hedged, ledger-citing language is exactly what the prompt asks for');
});

test('the comparison is the point: same screen, two answers', () => {
  const careful = 'Positioning is crowded long. Tested here, that is null for direction, so it is context only.';
  const loose   = 'Positioning is crowded long, so the pair will rally as the squeeze forces covering. '
                + 'Narrowing breadth also means the index should fall from here.';
  const c = compareOutputs({ a: careful, b: loose, aLabel: 'opus', bLabel: 'cheap' }, LEDGER);
  assert.equal(c.opus.flagged, 0);
  assert.ok(c.cheap.flagged >= 1);
  assert.match(c.verdict, /cheap tripped the screen/);
  assert.match(c.verdict, /Same screen on both/);
  assert.ok(c.perEntry.length >= 1);
  assert.ok(c.flags.cheap.length >= 1 && c.flags.opus.length === 0);
});

test('two equally clean answers report no separation rather than a winner', () => {
  const a = 'The dollar firmed overnight.', b = 'The dollar was firmer overnight.';
  const c = compareOutputs({ a, b }, LEDGER);
  assert.match(c.verdict, /No separation/);
});

test('the screen never calls itself a verdict', () => {
  const r = auditText('anything', LEDGER);
  assert.match(r.note, /screen, not a judge/i);
});

test('structural failures are separated from ledger violations', () => {
  assert.equal(structuralCheck('{"a":1}').ok, true);
  assert.deepEqual(structuralCheck('').problems, ['empty reply', 'no JSON object in the reply']);
  assert.ok(structuralCheck('```json\n{"a":1}\n```').problems.some(p => /fence/.test(p)));
  assert.ok(structuralCheck('{"a":1').problems.some(p => /truncation/.test(p)));
  assert.ok(structuralCheck('Here you go: {"a":1}').problems.some(p => /commentary/.test(p)));
  assert.ok(structuralCheck('{"a":1}', { requiredKeys: ['b'] }).problems.some(p => /missing required key: b/.test(p)));
  assert.equal(structuralCheck('free text', { requireJson: false }).ok, true);
});

test('it runs over the REAL ledger without throwing, and mines a useful number of rules', () => {
  const p = prohibitions(DESK_EVIDENCE);
  assert.ok(p.length >= 40, `only ${p.length} prohibitions mined from ${DESK_EVIDENCE.length} entries`);
  assert.ok(p.every(x => x.id && x.sentence && Array.isArray(x.terms)));
  // and a plainly offending answer is caught against the real thing
  const bad = 'Leveraged funds are crowded long in the Aussie, so a weak jobs print will force a '
            + 'sharp drop as that crowded position unwinds.';
  const r = auditText(bad, DESK_EVIDENCE);
  assert.ok(r.counts.flagged >= 1, 'the AUD positioning claim must trip the real ledger');
});

test('an empty or missing answer does not throw', () => {
  for (const v of [null, undefined, '', '   ']) {
    assert.doesNotThrow(() => auditText(v, DESK_EVIDENCE));
    assert.equal(auditText(v, DESK_EVIDENCE).counts.flagged, 0);
  }
  assert.doesNotThrow(() => auditText('text', []));
  assert.doesNotThrow(() => compareOutputs({ a: '', b: '' }, []));
});

// ── the false positives the first live comparison produced ───────────────────

test('the wire format is stripped before screening, so a brace is not a sentence', () => {
  // Verbatim shape of what tripped the screen on 2026-10-16: a field name and a closing
  // brace read as prose, producing a flag nobody could act on.
  const reply = JSON.stringify({
    verdict: ['MIXED tape', 'the dollar uptrend paused', 'watch the Fed Chair speech'],
    byAsset: [
      { asset: 'GBP', lean: 'NEUTRAL', note: 'Strong domestic demand and curve, offset by the weakest trade balance after JPY.' },
      { asset: 'Gold', lean: 'NEUTRAL', note: 'Real yields up 12bps on the month and a firm dollar.' },
    ],
    watch: ['Fed Chair speech (today) - the only scheduled catalyst'],
  });
  const txt = readableText(reply);
  assert.ok(!txt.includes('"'), 'no JSON punctuation should survive');
  assert.ok(!txt.includes('byAsset') && !txt.includes('lean'), 'keys are schema, not claims');
  assert.ok(txt.includes('Strong domestic demand'), 'the actual prose must survive');
  assert.ok(txt.includes('MIXED tape'));
  // and the whole reply, screened, raises nothing: none of it forecasts a tested-null
  assert.equal(auditText(reply, DESK_EVIDENCE).counts.flagged, 0,
    'a neutral, hedged brief must not be flagged on JSON punctuation alone');
});

test('a real violation inside a JSON field is still caught', () => {
  const reply = JSON.stringify({
    theme: 'Positioning is crowded long here, so the pair will rally hard as the squeeze '
         + 'forces those shorts to cover.',
  });
  assert.ok(auditText(reply, LEDGER).counts.flagged >= 1,
    'stripping the format must not stop the screen seeing the claim');
});

test('free prose and unparseable JSON fall back to the raw text', () => {
  const prose = 'The dollar firmed overnight on a hot CPI print.';
  assert.equal(readableText(prose), prose);
  assert.equal(readableText('{"a":1'), '{"a":1', 'broken JSON is screened as-is, not dropped');
  assert.equal(readableText(''), '');
  assert.equal(readableText(null), '');
  // commentary wrapped around a JSON object still yields the values
  assert.ok(readableText('Here you go: {"note":"Gold is quiet."} hope that helps')
    .includes('Gold is quiet'));
});
