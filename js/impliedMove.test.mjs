// Tests for js/impliedMove.js.   node js/impliedMove.test.mjs
import { impliedRow, impliedKeyFor, impliedValidatedOn } from './impliedMove.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const now = Date.parse('2026-10-24T12:00:00Z'), rec = { expMovePct: 0.763, iv30Pct: 15.18, savedAtMs: now - 6 * 3.6e6 };

ok('the S&P 500, Russell 2000, Dow and Nasdaq all map to a key the feed serves', ['SPX500', 'US2000', 'US30', 'NQ'].every(k => impliedKeyFor(k)) && impliedKeyFor('BTCUSD') === null && impliedKeyFor('DE30') === null);
const nq = impliedRow({ ...rec, expMovePct: 1.235, iv30Pct: 24.58 }, 'NQ', now), spx = impliedRow(rec, 'SPX500', now);
ok('a market the ledger validated says it is a size read and never a direction', nq.validated && /never a direction/.test(nq.sub) && /±1\.24%/.test(nq.words) && /24\.6%/.test(nq.sub));
ok('a market the ledger has not validated says untested instead of borrowing the validation', !spx.validated && /Untested on this market/.test(spx.sub) && !impliedValidatedOn('SPX500'));
ok('gold is validated through its own ledger entry', impliedValidatedOn('GOLD'));
ok('an old capture is dropped rather than shown as current', impliedRow({ ...rec, savedAtMs: now - 9 * 864e5 }, 'NQ', now) === null);
ok('no number gives no row', impliedRow(null, 'NQ', now) === null && impliedRow({ expMovePct: 0 }, 'NQ', now) === null);
ok('small FX moves keep a third decimal so they do not read as zero', /±0\.332%/.test(impliedRow({ expMovePct: 0.0332 * 10 / 10, iv30Pct: 6.6, savedAtMs: now }, 'EURUSD', now).words) === false && /±0\.033%/.test(impliedRow({ expMovePct: 0.0332, iv30Pct: 6.6, savedAtMs: now }, 'EURUSD', now).words));
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
