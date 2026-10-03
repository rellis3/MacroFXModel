// Shape tests for js/deskEvidence.js.   node js/deskEvidence.test.mjs
import { DESK_EVIDENCE, evidenceFor, evidenceForPrompt, evidenceBrief, citable, unrecordedPower } from './deskEvidence.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
ok('ids unique', new Set(DESK_EVIDENCE.map(e => e.id)).size === DESK_EVIDENCE.length);
ok('every entry has claim, result, use, date, doc', DESK_EVIDENCE.every(e => e.claim && e.result && e.use && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.doc));
ok('verdicts are validated | null | context | underpowered', DESK_EVIDENCE.every(e => ['validated', 'null', 'context', 'underpowered'].includes(e.verdict)));
ok('prompt tags underpowered entries', /\[UNDERPOWERED\b/.test(evidenceForPrompt()));
ok('every entry has a domain', DESK_EVIDENCE.every(e => ['macro', 'events', 'positioning', 'price', 'volatility', 'execution'].includes(e.domain)));
ok('validated entries name instruments', DESK_EVIDENCE.filter(e => e.verdict === 'validated').every(e => Array.isArray(e.instruments) && e.instruments.length));
ok('no entry claims direction', DESK_EVIDENCE.every(e => !/predicts? (the )?direction|goes (up|down) next/i.test(e.use)));
ok('evidenceFor(NQ) includes the down-week and every null', evidenceFor('NQ').some(e => e.id === 'nq-down-week') && evidenceFor('NQ').filter(e => e.verdict === 'null').length === DESK_EVIDENCE.filter(e => e.verdict === 'null').length);
ok('evidenceFor(EURUSD) excludes the NQ-only result', !evidenceFor('EURUSD').some(e => e.id === 'nq-down-week'));
const txt = evidenceForPrompt();
ok('prompt block: one line per entry, tagged', txt.split('\n').length === DESK_EVIDENCE.length && /\[VALIDATED[,\u2014]/.test(txt) && /\[TESTED NULL[,\u2014]/.test(txt));
// ── The guard that exists because of 2026-10-02 ──────────────────────────────
// I quoted `oi-max-pain` -- one sentence, no n, no interval, a memory note for a
// doc -- as settled, to justify rewriting live code. These lock the fix: the
// confident phrasing must be UNAVAILABLE unless someone recorded the power.
const WEAK = DESK_EVIDENCE.filter(e => !citable(e).strong);
ok('an entry with no recorded power can never be quoted confidently',
  WEAK.every(e => /power not recorded/.test(citable(e).tag)), `${WEAK.length} unrecorded`);
ok('a recorded entry carries its sample size in the tag',
  DESK_EVIDENCE.filter(e => citable(e).strong).every(e => /n=/.test(citable(e).tag)));
ok('a doc that is a memory note is NOT treated as a study',
  DESK_EVIDENCE.filter(e => /^\s*memory[:\s]/i.test(e.doc)).every(e => citable(e).docIsStudy === false));
ok('a doc that IS a file path counts as a study',
  citable(DESK_EVIDENCE.find(e => /^MD files\//.test(e.doc))).docIsStudy === true);
// The two entries this guard was built for, named so a future edit cannot quietly
// mark them strong without someone recording a real n first.
for (const id of ['oi-max-pain', 'yields-to-fx-direction']) {
  const e = DESK_EVIDENCE.find(x => x.id === id);
  if (e) ok(`${id} still reads as unrecorded`, !citable(e).strong && /no study doc/.test(citable(e).tag), citable(e).tag);
}
// Both prompt builders must go through citable(). A caller writing its own tag is
// a caller that can over-claim, which is the whole point of this.
ok('BOTH prompt builders carry the hedge', /power not recorded/.test(evidenceForPrompt()) && /power not recorded/.test(evidenceBrief()));
ok('unrecordedPower() lists the backlog', Array.isArray(unrecordedPower()) && unrecordedPower().includes('oi-max-pain'));
console.log(`  i ${unrecordedPower().length} of ${DESK_EVIDENCE.length} entries have no recorded power -- the backlog this shrinks`);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
