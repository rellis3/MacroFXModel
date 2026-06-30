/**
 * Offline test for dedupePairsByInstrument — collapses two parquet names for one
 * instrument so the book doesn't double-count it. Run: node js/discoverPairs.test.mjs
 */
import { dedupePairsByInstrument } from './forecastAnalyserStore.js';

let failures = 0;
const ok = (name, cond) => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}`); if (!cond) failures++; };

console.log('[dedupePairsByInstrument]');

const out = dedupePairsByInstrument(['spx', 'spx500', 'dow', 'us30', 'eurusd', 'de30', 'dax', 'frxWEIRD']);
const has = s => out.includes(s);

ok('spx kept, spx500 dropped (same SPX500_USD)', has('spx') && !has('spx500'));
ok('dow kept, us30 dropped (same US30_USD)',     has('dow') && !has('us30'));
ok('dax kept, de30 dropped (same DE30 instrument)', has('dax') && !has('de30'));
ok('distinct instrument (eurusd) survives',      has('eurusd'));
ok('unknown name kept (fail-open)',              has('frxWEIRD'));
ok('no duplicate instrument remains',            new Set(out).size === out.length && out.length === 5);

// Order-independent: whichever order the names arrive, the canonical-named one wins.
const out2 = dedupePairsByInstrument(['us30', 'dow', 'spx500', 'spx']);
ok('prefers canonical name regardless of input order', out2.includes('dow') && out2.includes('spx') && out2.length === 2);

// Idempotent.
ok('idempotent', JSON.stringify(dedupePairsByInstrument(out)) === JSON.stringify(out));

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
if (failures) process.exit(1);
