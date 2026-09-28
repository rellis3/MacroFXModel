import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAPTERS, chapterFor, builtChapters, requiredSeries } from './chapterSpec.js';
import { DESK_EVIDENCE } from './deskEvidence.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const ledger = new Map(DESK_EVIDENCE.map(e => [e.id, e.verdict]));

t('the book is twelve chapters, lettered without gaps', () => {
  assert.equal(CHAPTERS.length, 12);
  assert.deepEqual(CHAPTERS.map(c => c.key), 'ABCDEFGHIJKL'.split(''));
  assert.equal(new Set(CHAPTERS.map(c => c.name)).size, 12, 'two chapters share a name');
});

// A chapter citing an entry that was renamed shows NOTHING under it and looks fine.
// Eight ghost ids were in the first draft of this file, all plausible-sounding.
t('every evidence id a chapter cites actually exists', () => {
  for (const c of CHAPTERS) {
    for (const id of c.evidence) {
      assert.ok(ledger.has(id), `chapter ${c.key} (${c.name}) cites "${id}", which is not in the ledger`);
    }
  }
});

t('every chapter carries evidence — a gauge with no verdict is the thing this page exists not to be', () => {
  for (const c of CHAPTERS) {
    assert.ok(c.evidence.length >= 2, `${c.key} cites only ${c.evidence.length} findings`);
    assert.ok(c.blurb && c.blurb.length > 40, `${c.key} has no blurb`);
  }
});

t('a built chapter has members and receipts; an unbuilt one is honest about it', () => {
  for (const c of CHAPTERS) {
    if (c.built) {
      assert.ok(c.members.length >= 2, `${c.key} is marked built with ${c.members.length} members`);
      assert.ok(c.receipts.length >= 1, `${c.key} is built with no receipt`);
      for (const r of c.receipts) assert.ok(c.members.some(m => m.key === r), `${c.key} takes a receipt on "${r}", which is not one of its members`);
    } else {
      assert.ok(!c.members.length || c.members.length < 2, `${c.key} has members but is not marked built`);
    }
  }
});

t('units are one of the three the renderer knows', () => {
  for (const c of CHAPTERS) for (const m of c.members) {
    assert.ok(['bp', 'pct', 'idx'].includes(m.unit), `${c.key}/${m.key} has unit "${m.unit}"`);
    assert.ok(m.label && m.label.length > 0, `${c.key}/${m.key} has no label`);
  }
});

t('no member key is repeated inside a chapter', () => {
  for (const c of CHAPTERS) {
    const keys = c.members.map(m => m.key);
    assert.equal(new Set(keys).size, keys.length, `${c.key} lists a member twice`);
  }
});

// Several chapters are mostly NULL and that is the point — liquidity reads fine and this
// desk's own test of it returned null. A page that shows the gauge without the verdict is
// exactly the thing being improved on.
t('the chapters that are mostly null say so in their note', () => {
  for (const c of CHAPTERS) {
    const verdicts = c.evidence.map(id => ledger.get(id));
    const nulls = verdicts.filter(v => v === 'null').length;
    if (nulls > verdicts.length / 2) {
      assert.ok(c.note && /null|falsif|closed|48-52|never said/i.test(c.note),
        `${c.key} (${c.name}) cites mostly nulls and its note does not mention it: "${c.note}"`);
    }
  }
});

t('the nav and the page cannot disagree, because there is one list', () => {
  const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'chapters.html'), 'utf8');
  assert.doesNotMatch(html, /const PLANNED = \[/, 'a second chapter list has reappeared');
  assert.match(html, /from '\.\/js\/chapterSpec\.js'/, 'the page must read the spec');
  assert.match(html, /builtChapters\(\)/, 'and render from it');
});

t('requiredSeries covers every built chapter and nothing else', () => {
  const need = requiredSeries();
  for (const c of builtChapters()) {
    for (const m of c.members) assert.ok(need.includes(m.key), `${m.key} is needed by ${c.key} and missing from requiredSeries`);
    for (const r of c.receipts) assert.ok(need.includes(r), `${r} is a receipt in ${c.key} and missing`);
  }
  // an unbuilt chapter's members must not pull data nobody renders
  const builtKeys = new Set(builtChapters().flatMap(c => c.members.map(m => m.key)));
  for (const k of need) assert.ok(builtKeys.has(k), `requiredSeries includes "${k}" which no built chapter uses`);
});

t('lookups behave', () => {
  assert.equal(chapterFor('A').name, 'The curve');
  assert.equal(chapterFor('Z'), null);
  assert.equal(chapterFor(undefined), null);
  assert.ok(builtChapters().length >= 8, `only ${builtChapters().length} chapters are built`);
  assert.ok(builtChapters().every(c => c.built));
});

console.log(`chapterSpec: ${n} groups, all passed`);
