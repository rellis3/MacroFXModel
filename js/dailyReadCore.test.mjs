// Synthetic, no-network unit tests for the Daily Read core.
//   node js/dailyReadCore.test.mjs
import { ivSigmaRatio, tagFor, setupRow, scoreRow, bandOf, tally, pickLesson, LESSONS } from './dailyReadCore.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };

const fc = (sigma, extra = {}) => ({
  vol_annual: sigma * Math.sqrt(252),
  ladder: { sigma_daily_pct: sigma, event_tag: 'none', event_mult: 0.946 },
  ladder_flat: { hl_p50: 0.6, hl_p75: 0.8, hl_p90: 1.0, oh_p50: 0.3, oh_p75: 0.5, oh_p90: 0.7, ol_p50: 0.3, ol_p75: 0.5, ol_p90: 0.7 },
  ...extra,
});

console.log('ratio and tags');
ok('ratio = IV/√252/σ', Math.abs(ivSigmaRatio(Math.sqrt(252) * 0.5, 0.5) - 1) < 1e-12);
ok('ratio null on missing IV', ivSigmaRatio(null, 0.5) === null);
ok('cheap → exhaust', tagFor('EURUSD', 0.90).tag === 'exhaust');
ok('edge itself → fair (lower edge inclusive of fair)', tagFor('EURUSD', 0.959).tag === 'fair');
ok('rich → continue (upper edge inclusive)', tagFor('EURUSD', 1.102).tag === 'continue');
ok('gold provisional', !!tagFor('GOLD', 1).provisional);
ok('unknown symbol → null tag', tagFor('EURGBP', 1).tag === null);

console.log('setup row');
const s = setupRow('EURUSD', fc(0.4), { iv: 0.4 * Math.sqrt(252) * 1.2, ratio: 1.3, rich: true, ivSource: 'x' });
ok('rich setup tagged continue', s.tag === 'continue', JSON.stringify({ ratio: s.ratio }));
ok('expectation attached', s.expectP75 === 0.348);
const s2 = setupRow('EURUSD', fc(0.4), { rich: null, why: 'capture older than 36h' });
ok('no IV → untagged with reason', s2.tag === null && s2.why === 'capture older than 36h');

console.log('scoring');
ok('band edges', bandOf(0.59, 0.6, 0.8, 1) === 0 && bandOf(0.6, 0.6, 0.8, 1) === 1 && bandOf(0.8, 0.6, 0.8, 1) === 2 && bandOf(1.2, 0.6, 0.8, 1) === 3);
const row = scoreRow('EURUSD', fc(0.4), { hl: 0.9, oh: 0.55, ol: 0.35, oc: 0.2, complete: true }, s);
ok('band p75–p90', row.band === 2);
ok('residual = hl / hl_p50', row.resid === 1.5);
ok('lines hit', row.hit.oh_p75 === true && row.hit.oh_p90 === false && row.hit.ol_p50 === true && row.hit.ol_p75 === false);
ok('missing session → null', scoreRow('EURUSD', fc(0.4), { error: 'x' }, s) === null);

console.log('tally');
const t = tally({ a: { score: { rows: [row, { ...row, band: 0, resid: 0.5 }, { ...row, tag: 'exhaust', band: 3 }] } } });
ok('continue n=2, p75 rate 0.5', t.continue.n === 2 && t.continue.p75Rate === 0.5);
ok('exhaust p90 counted', t.exhaust.p90Rate === 1);

console.log('lessons');
const L = pickLesson({ rows: [row], tallyAll: {}, recent: [] });
ok('rich day beyond p75 → vrp lesson', L?.id === 'vrp' && L.body.includes('EURUSD'));
const L2 = pickLesson({ rows: [row], tallyAll: {}, recent: ['vrp'] });
ok('recently used lesson is skipped', L2?.id !== 'vrp');
const usdRows = ['EURUSD', 'GBPUSD', 'AUDUSD', 'USDJPY'].map(sym => ({ sym, tag: 'fair', band: 1, resid: 1, event: null,
  hit: sym.startsWith('USD') ? { oh_p75: true, ol_p75: false } : { oh_p75: false, ol_p75: true } }));
ok('dollar factor lesson', pickLesson({ rows: usdRows, tallyAll: {}, recent: [] })?.id === 'usd');
ok('empty day still gets a lesson', !!pickLesson({ rows: [], tallyAll: {}, recent: [] }));
ok('every lesson renders without throwing', LESSONS.every(l => { try { const a = l.when({ rows: [row, ...usdRows], setup: [], tallyAll: t }); return !a || typeof l.body(a) === 'string'; } catch { return false; } }));

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
