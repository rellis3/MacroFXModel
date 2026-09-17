// Shape tests for js/deskEvidence.js.   node js/deskEvidence.test.mjs
import { DESK_EVIDENCE, evidenceFor, evidenceForPrompt } from './deskEvidence.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
ok('ids unique', new Set(DESK_EVIDENCE.map(e => e.id)).size === DESK_EVIDENCE.length);
ok('every entry has claim, result, use, date, doc', DESK_EVIDENCE.every(e => e.claim && e.result && e.use && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.doc));
ok('verdicts are validated | null | context', DESK_EVIDENCE.every(e => ['validated', 'null', 'context'].includes(e.verdict)));
ok('every entry has a domain', DESK_EVIDENCE.every(e => ['macro', 'events', 'positioning', 'price', 'volatility', 'execution'].includes(e.domain)));
ok('validated entries name instruments', DESK_EVIDENCE.filter(e => e.verdict === 'validated').every(e => Array.isArray(e.instruments) && e.instruments.length));
ok('no entry claims direction', DESK_EVIDENCE.every(e => !/predicts? (the )?direction|goes (up|down) next/i.test(e.use)));
ok('evidenceFor(NQ) includes the down-week and every null', evidenceFor('NQ').some(e => e.id === 'nq-down-week') && evidenceFor('NQ').filter(e => e.verdict === 'null').length === DESK_EVIDENCE.filter(e => e.verdict === 'null').length);
ok('evidenceFor(EURUSD) excludes the NQ-only result', !evidenceFor('EURUSD').some(e => e.id === 'nq-down-week'));
const txt = evidenceForPrompt();
ok('prompt block: one line per entry, tagged', txt.split('\n').length === DESK_EVIDENCE.length && /\[VALIDATED, 2026/.test(txt) && /\[TESTED NULL, /.test(txt));
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
