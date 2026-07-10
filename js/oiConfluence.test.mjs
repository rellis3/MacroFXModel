// Synthetic test for the OI forward-test tagging brick (no network).
//   node js/oiConfluence.test.mjs
import { parseOILevels, normOIType, nearRoundNumber, tagTradeOI, tradePctReturn, oiAudit } from './oiConfluence.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[normOIType — free labels → slugs]');
ok('call wall variants', ['Call Wall', 'callwall', 'c-wall', 'CW'].every(s => normOIType(s) === 'call_wall'), JSON.stringify(['Call Wall','callwall','c-wall','CW'].map(normOIType)));
ok('put wall / max pain / gamma flip / hvl',
   normOIType('put wall') === 'put_wall' && normOIType('Max Pain') === 'max_pain' &&
   normOIType('gamma flip') === 'gamma_flip' && normOIType('HVL') === 'hvl');
ok('untyped → oi', normOIType('') === 'oi' && normOIType(null) === 'oi');

console.log('[parseOILevels — pasted lines]');
const parsed = parseOILevels(`
1.0850 call_wall
1.0820, max pain
1.0805  put wall
1.0900
# a comment

1,234.5 hvl
`);
ok('parses 5 levels, skips blanks/comments', parsed.length === 5, `n=${parsed.length}`);
ok('price + normalised type', parsed[0].price === 1.0850 && parsed[0].type === 'call_wall' && parsed[1].type === 'max_pain');
ok('untyped line → oi', parsed[3].price === 1.09 && parsed[3].type === 'oi');
ok('comma thousands parsed', parsed[4].price === 1234.5 && parsed[4].type === 'hvl');

console.log('[nearRoundNumber — big-figure / half / quarter grid]');
ok('1.1000 is round (big figure)', nearRoundNumber(1.10001, 0.0001, 10) === true);
ok('1.1050 is round (half)', nearRoundNumber(1.10502, 0.0001, 10) === true);
ok('1.1037 is NOT round', nearRoundNumber(1.1037, 0.0001, 10) === false);

console.log('[tagTradeOI — proximity within tol]');
const oi = [{ price: 1.0850, type: 'call_wall' }, { price: 1.0805, type: 'put_wall' }];
const hit = tagTradeOI(1.08455, oi, { pip: 0.0001, tolPips: 10 });   // 5.5 pips from call_wall
ok('near call_wall → hit', hit.hit && hit.types.includes('call_wall') && hit.distPips <= 10, JSON.stringify(hit));
const miss = tagTradeOI(1.0700, oi, { pip: 0.0001, tolPips: 10 });
ok('far from all → no hit, reports nearest', !miss.hit && miss.nearest === 1.0805 && miss.distPips > 10, JSON.stringify(miss));
ok('empty OI → no hit', tagTradeOI(1.08, [], { pip: 0.0001 }).hit === false);

console.log('[tradePctReturn — size-independent, direction-signed]');
ok('long win', Math.abs(tradePctReturn({ direction: 'BUY', open_price: 100, close_price: 101 }) - 1) < 1e-9);
ok('short win', Math.abs(tradePctReturn({ direction: 'SELL', open_price: 100, close_price: 99 }) - 1) < 1e-9);
ok('unresolved (no close) → null', tradePctReturn({ direction: 'BUY', open_price: 100, close_price: null }) === null);

console.log('[oiAudit — tagged vs untagged, per type, round-independence]');
// Two days. eurusd pip 1e-4. Day1 OI has call_wall 1.0850; Day2 OI has max_pain 1.2000 (a round number).
const oiByDate = {
  '2026-07-08': { eurusd: [{ price: 1.0837, type: 'call_wall' }] },   // 1.0837 is NOT a round grid level
  '2026-07-09': { eurusd: [{ price: 1.2000, type: 'max_pain' }] },
};
const log = [
  // Day1: entry AT the call_wall 1.0837 → tagged, winner. Not a round number.
  { date: '2026-07-08', symbol: 'EURUSD', direction: 'SELL', open_price: 1.0837, close_price: 1.0729 },
  // Day1: entry far from OI → untagged, loser (−0.5%).
  { date: '2026-07-08', symbol: 'EURUSD', direction: 'BUY', open_price: 1.0700, close_price: 1.06465 },
  // Day2: entry AT max_pain 1.2000 (a round number) → tagged + atRound, winner.
  { date: '2026-07-09', symbol: 'EURUSD', direction: 'SELL', open_price: 1.2000, close_price: 1.1880 },
  // A trade on a day with NO OI captured → excluded from tagged/untagged.
  { date: '2026-07-10', symbol: 'EURUSD', direction: 'BUY', open_price: 1.1000, close_price: 1.1050 },
  // Unresolved (still open) → skipped.
  { date: '2026-07-08', symbol: 'EURUSD', direction: 'BUY', open_price: 1.09, close_price: null },
];
const a = oiAudit(log, oiByDate, { pipFor: () => 0.0001, tolPips: 10, roundTolPips: 10 });
ok('tagged n=2 (both OI-aligned entries)', a.tagged.n === 2, `n=${a.tagged.n}`);
ok('untagged n=1 (OI day, entry not near)', a.untagged.n === 1, `n=${a.untagged.n}`);
ok('no-OI day excluded, unresolved skipped', a.coverage.tradesNoOIDay === 1 && a.coverage.unresolved === 1, JSON.stringify(a.coverage));
ok('tagged beats untagged (edge > 0)', a.edge > 0, `edge=${a.edge} tagged=${a.tagged.avgRet} untagged=${a.untagged.avgRet}`);
ok('per-type breakdown present', a.byType.call_wall?.n === 1 && a.byType.max_pain?.n === 1, JSON.stringify(Object.keys(a.byType)));
ok('round-independence split: 1 at round, 1 not', a.taggedAtRound.n === 1 && a.taggedNotRound.n === 1,
   `atRound=${a.taggedAtRound.n} notRound=${a.taggedNotRound.n}`);

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
