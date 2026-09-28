import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESK_EVIDENCE } from './deskEvidence.js';

/**
 * Desk Watch says what is firing. The ledger says what has been tested. Nothing connected
 * the two, so a trigger could be tagged 'tested' while citing a finding this desk had
 * closed, and the page would show it with a validated tick.
 *
 * Checked on 2026-09-28 and all nine triggers were honest — this is not a repair, it is
 * the fence. The failure it prevents is a future trigger citing a null, which is exactly
 * the kind of thing that survives review because it looks right.
 */
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'deskWatch.js'), 'utf8');
const ledger = new Map(DESK_EVIDENCE.map(e => [e.id, e.verdict]));

/** Every push({...}) trigger, however it happens to be formatted. */
const triggers = [...src.matchAll(/push\(\{[\s\S]{0,400}?\}\)/g)]
  .map(m => m[0])
  // A trigger is a push that carries a `kind`. The file also has three unrelated
  // out.push() calls in the expected-range helper, which have none.
  .filter(b => /kind:\s*'/.test(b))
  .map(b => {
    // Some triggers are emitted in a loop and use the shorthand `push({ id, kind: ... })`
    // with a computed id. A literal-only extractor silently skipped those, and a checker
    // that quietly inspects most of a file is worse than no checker.
    const lit = b.match(/id:\s*['`]([^'`]+)/);
    return {
      id: lit ? lit[1] : '<computed>',
      kind: (b.match(/kind:\s*'([^']+)/) || [])[1],
      evidenceId: (b.match(/evidenceId:\s*'([^']+)/) || [])[1] ?? null,
    };
  });

t('the trigger list was actually parsed', () => {
  // a regex that silently matches nothing would make every test below vacuously pass
  // 9 today. The file also contains three unrelated out.push() calls in the
  // expected-range helper, which carry no `kind` and are correctly filtered out — the
  // count is triggers, not push sites.
  assert.ok(triggers.length >= 9, `only ${triggers.length} triggers parsed — the extractor has drifted from the file`);
  assert.ok(triggers.some(x => x.kind === 'tested'), 'no tested triggers found at all');
});

t('a trigger never cites an evidence id that does not exist', () => {
  for (const x of triggers) {
    if (!x.evidenceId) continue;
    assert.ok(ledger.has(x.evidenceId), `${x.id} cites "${x.evidenceId}", which is not in the ledger`);
  }
});

// THE ONE THAT MATTERS. 'tested' is a claim that the page has measured this and it held.
t('anything tagged `tested` cites a VALIDATED finding', () => {
  for (const x of triggers.filter(x => x.kind === 'tested')) {
    assert.ok(x.evidenceId, `${x.id} claims to be tested and cites nothing`);
    assert.equal(ledger.get(x.evidenceId), 'validated',
      `${x.id} is tagged 'tested' but ${x.evidenceId} is banked as "${ledger.get(x.evidenceId)}" — either retag it 'described' or stop firing on it`);
  }
});

t('a `described` trigger may cite a null, and often should', () => {
  // This is not an oversight: a closed finding is still worth SHOWING as a state of the
  // world, it just must not wear a validated tick. front-end-shock is the live example —
  // tested, null, and still worth knowing the 2-year moved.
  const described = triggers.filter(x => x.kind === 'described' && x.evidenceId);
  for (const x of described) assert.ok(ledger.has(x.evidenceId), `${x.id} cites a ghost id`);
  assert.ok(described.some(x => ledger.get(x.evidenceId) !== 'validated'),
    'if no described trigger cites a non-validated finding, this test is not exercising anything');
});

t('kinds are limited to the two the file documents', () => {
  for (const x of triggers) assert.ok(['tested', 'described'].includes(x.kind), `${x.id} has kind "${x.kind}"`);
});

console.log(`deskWatchEvidence: ${n} groups, all passed`);
