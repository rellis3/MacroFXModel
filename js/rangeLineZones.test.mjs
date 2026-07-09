// Synthetic test for the range-line zones view-model join. No network.
//   node js/rangeLineZones.test.mjs
import { buildRangeZones } from './rangeLineZones.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

// Asia ladder 1.1000–1.1100 (mid 1.1050). Levels at fib 0/0.5/1 → 1.10/1.105/1.11.
const status = {
  lines: [{
    instrument: 'EURUSD', price: 1.1042,
    ladders: {
      A: { low: 1.1000, high: 1.1100, levels: [
        { label: 'A_0',   side: 'dn', level: 1.1000 },
        { label: 'A_0.5', side: 'dn', level: 1.1050 },
        { label: 'A_1',   side: 'up', level: 1.1100 },
      ] },
    },
    taken: ['A|up'],
  }],
};
const plan = { instruments: { eurusd: { policy: {
  'A_1_up|':   { decision: 'follow' },
  'A_0_dn|':   { decision: 'fade' },
  // A_0.5_dn| absent → skip
} } } };
// Confluence: two sources hug A_1 (1.1100) → strong; one at A_0 (1.1000) → single.
const confluence = { tolFrac: 0.1, instruments: { eurusd: { pip: 0.0001, levels: [
  { price: 1.1100, source: 'pivots' }, { price: 1.1101, source: 'vah' },
  { price: 1.1000, source: 'round_number' },
] } } };

const vm = buildRangeZones({ status, plan, confluence }, { confluenceMin: 2, pipFor: () => 0.0001 });
const p = vm.pairs[0];
ok('one pair, keyed lowercase', vm.pairs.length === 1 && p.pair === 'eurusd');
ok('carries live price + pip', p.price === 1.1042 && p.pip === 0.0001);
const byLabel = Object.fromEntries(p.zones.map(z => [z.label, z]));

ok('A_1 follow, SL=inner(1.105), target=outer(away/none-extreme)', byLabel.A_1.decision === 'follow' && byLabel.A_1.sl === 1.1050);
ok('A_1 confluence = 3·multi with 2 sources listed', byLabel.A_1.confluence.bucket === '3·multi' && byLabel.A_1.confluence.count === 2 && byLabel.A_1.confluence.sources.length === 2);
ok('A_1 is GATED (strong + tradeable → live gate takes it)', byLabel.A_1.gated === true);
ok('A_1 marked taken (from status.taken A|up)', byLabel.A_1.taken === true);

ok('A_0 fade, SL=outer(none, it is the low extreme), single confluence', byLabel.A_0.decision === 'fade' && byLabel.A_0.confluence.bucket === '2·single');
ok('A_0 NOT gated (single < strong ≥2)', byLabel.A_0.gated === false);

ok('A_0.5 is skip (absent from policy) → not tradeable', byLabel['A_0.5'].decision === 'skip' && byLabel['A_0.5'].tradeable === false);
ok('distPips computed from price', Number.isFinite(byLabel.A_1.distPips) && Number.isFinite(byLabel.A_0.distPips));
ok('nearest-first sort (A_0.5 @1.105 closest to 1.1042)', p.zones[0].label === 'A_0.5');
ok('counts: tradeable=2, strong=1', p.counts.tradeable === 2 && p.counts.strong === 1);

console.log('[empty / missing artifacts — no throw]');
const empty = buildRangeZones({ status: null, plan: null, confluence: null });
ok('empty inputs → no pairs, no throw', empty.pairs.length === 0);
const noConf = buildRangeZones({ status, plan, confluence: null }, { pipFor: () => 0.0001 });
ok('missing confluence → all 1·none, nothing gated', noConf.pairs[0].zones.every(z => z.confluence.bucket === '1·none' && !z.gated));

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
