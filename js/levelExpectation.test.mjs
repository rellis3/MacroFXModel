// node js/levelExpectation.test.mjs
//
// The band logic is the part that can silently invert - a level would then be
// labelled "cap" when hedging is actually amplifying through it. So the bands are
// asserted against the REAL USD/CAD crossing set (three crossings, alternating),
// which is the case that motivated the whole change.
import { levelExpectation, gammaBandAt } from './levelExpectation.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  → ' + e : ''}`); if (!c) fails++; };

// USD/CAD, 2026-08-02: long below 1.4103, SHORT between 1.4103-1.4296, long to
// 1.4936, short above. Spot 1.40136 sits just below the short-gamma pocket.
const CAD = [
  { price: 1.41030, dir: 'long->short' },
  { price: 1.42959, dir: 'short->long' },
  { price: 1.49358, dir: 'long->short' },
];

console.log('[bands alternate across a real three-crossing book]');
ok('below the first crossing  -> long',  gammaBandAt(1.4000, CAD) === 'long',  gammaBandAt(1.4000, CAD));
ok('inside the pocket         -> short', gammaBandAt(1.4200, CAD) === 'short', gammaBandAt(1.4200, CAD));
ok('above the pocket          -> long',  gammaBandAt(1.4500, CAD) === 'long',  gammaBandAt(1.4500, CAD));
ok('above every crossing      -> short', gammaBandAt(1.5200, CAD) === 'short', gammaBandAt(1.5200, CAD));

console.log('\n[single-crossing book behaves like the textbook case]');
const EUR = [{ price: 1.15446, dir: 'short->long' }];
ok('below the flip -> short', gammaBandAt(1.1500, EUR) === 'short', gammaBandAt(1.1500, EUR));
ok('above the flip -> long',  gammaBandAt(1.1600, EUR) === 'long',  gammaBandAt(1.1600, EUR));

console.log('\n[falls back to gammaFlip when no crossings are stored]');
ok('older entry, above flip -> long',
  gammaBandAt(1.16, null, { spot: 1.15, gammaFlip: 1.155 }) === 'long');
ok('no data at all -> null (claims nothing)',
  gammaBandAt(1.16, null, {}) === null);

console.log('\n[the same wall reads differently by band - the whole point]');
const ctx = { spot: 1.40136, gexFlips: CAD, refMove: 0.02 };
const inPocket = levelExpectation({ price: 1.4200, type: 'call_wall' }, ctx);
const outside  = levelExpectation({ price: 1.4500, type: 'call_wall' }, ctx);
ok('call wall inside the short-gamma pocket says Break', inPocket.short === 'Break',  inPocket.short);
ok('call wall in a long-gamma band says Reject',         outside.short === 'Reject', outside.short);
ok('the reason is written in plain English, not jargon',
  /hedging/.test(inPocket.long) && !/gamma exposure|dealer delta|convexity/.test(inPocket.long),
  inPocket.long);

console.log('\n[distance is flagged so a far level is not read as a target]');
const far = levelExpectation({ price: 1.4936, type: 'gex_flip' }, ctx);
ok('beyond 2.5x refMove is marked', far.short.endsWith('·far'), far.short);
ok('the action word leads the export line', /^(Reject|Break|Magnet|Pin|Edge|Watch) - /.test(far.long), far.long);
ok('tag is machine-stable for later scoring', far.tag === 'gex_flip:short:far', far.tag);

console.log('\n[indicator labels stay short enough to plot]');
const all = ['call_wall','put_wall','max_pain','gamma_flip','gex_flip','hvl','oi_volume','oi_cluster']
  .map(t => levelExpectation({ price: 1.42, type: t }, ctx).short);
ok('every short label <= 12 chars', all.every(s => s.length <= 12), all.join(' '));

// `mid` is what the export line and the indicator table show: the word plus a
// three-word reminder, so the vocabulary teaches itself with no separate key.
const mids = ['call_wall','put_wall','max_pain','gamma_flip','gex_flip','hvl','oi_volume','oi_cluster']
  .map(t => levelExpectation({ price: 1.42, type: t }, ctx).mid);
ok('every mid label carries its meaning', mids.every(s => /\(.+\)/.test(s)), mids.join(' | '));
ok('mid stays under 26 chars so a table cell does not wrap',
  mids.every(s => s.length <= 26), mids.map(s => `${s}:${s.length}`).join(' '));

ok('unknown type returns null', levelExpectation({ price: 1, type: 'nope' }, ctx) === null);

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
