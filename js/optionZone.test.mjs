// Tests for js/optionZone.js.   node js/optionZone.test.mjs
import { optionZone } from './optionZone.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

const eur = optionZone({ spot: 1.122655, putWall: 1.1226, callWall: 1.1251, regime: 'BREAKOUT', dte: 15 }, 'EURUSD', 4);
ok('the zone runs from the lower option edge to the upper one, and says where price is', eur.words === '1.1226 to 1.1251' && eur.where === 'inside' && eur.placeWords === 'price is inside it');
ok('BREAKOUT reads as dealers amplifying, in plain words with no wall or gamma jargon', eur.dealers === 'amplify' && /amplify moves/.test(eur.dealerWords) && !/wall|gamma|max pain|pin|breakout/i.test(eur.words + eur.placeWords + eur.dealerWords));
const gbp = optionZone({ spot: 1.34033, putWall: 1.3298, callWall: 1.3398, regime: 'PIN' }, 'GBPUSD', 4);
ok('PIN reads as dealers calming moves', gbp.dealers === 'calm' && /calm moves/.test(gbp.dealerWords));
const below = optionZone({ spot: 2759.341, putWall: 2759.7936, callWall: 2764.7936, regime: 'BREAKOUT' }, 'US2000', 1);
ok('price just under the zone is "just below it" with no distance claim', below.where === 'below' && below.placeWords === 'price is just below it', below.placeWords);
const far = optionZone({ spot: 100, putWall: 103, callWall: 110, regime: 'PIN' }, 'X', 1);
ok('price clearly outside says how far', far.where === 'below' && far.placeWords === 'price is below it, 3.0% away');
ok('edges given the wrong way round are put in order', optionZone({ spot: 5, putWall: 6, callWall: 4, regime: 'PIN' }, 'X', 0).words === '4 to 6');
ok('no levels means no zone', optionZone({ spot: 1 }, 'X') === null && optionZone(null, 'X') === null);
ok('the dealer note is flagged validated for the S&P only', optionZone({ spot: 1, putWall: 0.9, callWall: 1.1, regime: 'PIN' }, 'SPX500', 2).validated === true && eur.validated === false);
ok('the zone is described as a location: nothing says price is drawn to it', !/magnet|attract|drawn|pull|target|resistance|support/i.test(JSON.stringify(eur)));
ok('walls of zero mean the levels did not load, so no zone is drawn instead of 0.0 to 0.0 and an infinite distance', optionZone({ spot: 52284.1, putWall: 0, callWall: 0, regime: 'BREAKOUT' }, 'US30', 1) === null && optionZone({ spot: 100, putWall: 0, callWall: 120 }, 'X', 1) === null);
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
