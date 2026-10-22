// Tests for js/newsletterRecord.js.   node js/newsletterRecord.test.mjs
import { snapshotOf, diffSnapshots, scoreIssue, scoreLine, weekRecord, readIsSafe } from './newsletterRecord.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

const L = (a, b, v) => ({ a: { key: a, label: a.toUpperCase() }, b: { key: b, label: b.toUpperCase() }, verdict: v });
const n1 = { headline: 'h1', regimeCard: { label: 'Reflation' }, links: [L('real', 'dxy', 'broken'), L('us10y', 'real', 'holding'), L('x', 'y', 'quiet')],
  riskFlags: { total: 6, flags: [{ label: 'VIX elevated', on: false }, { label: 'Credit widening fast', on: true }] }, cb: [{ ccy: 'USD', latest: 0.88 }],
  assets: [{ key: 'EURUSD', hlMed: 0.51, used: 0.4 }, { key: 'GOLD', hlMed: 1.18, used: 0.9 }, { key: 'NQ', hlMed: 1.75, used: 0.5 }, { key: 'BAD', hlMed: null }] };
const s1 = snapshotOf(n1, { date: '2026-10-22' });
ok('snapshot keeps broken and holding links by id, flags on, tone and the expected ranges', s1.broken.length === 1 && s1.broken[0].id === 'real>dxy' && s1.holding.length === 1 && s1.flagsOn.join() === 'Credit widening fast' && s1.cb.USD === 0.88 && s1.ranges.EURUSD.expected === 0.51 && !('BAD' in s1.ranges));
ok('quiet links are not stored as a claim', !JSON.stringify(s1).includes('x>y'));

const n2 = { ...n1, regimeCard: { label: 'Goldilocks' }, links: [L('real', 'dxy', 'holding'), L('real', 'nq', 'broken')], riskFlags: { total: 6, flags: [{ label: 'VIX elevated', on: true }, { label: 'Credit widening fast', on: false }] }, cb: [{ ccy: 'USD', latest: 0.95 }] };
const d = diffSnapshots(s1, snapshotOf(n2, { date: '2026-10-23' }));
ok('a new broken link, a healed link, flags on and off, a regime change and a tone move are each reported', ['link-broke', 'link-healed', 'flag-on', 'flag-off', 'regime', 'cb'].every(k => d.items.some(i => i.kind === k)) && d.from === '2026-10-22');
ok('no previous issue means first, no invented changes', diffSnapshots(null, s1).first === true && diffSnapshots(null, s1).items.length === 0);
ok('an unchanged day reports nothing', diffSnapshots(s1, s1).items.length === 0);

const audit = { instruments: { EURUSD: { hl: 0.62 }, GOLD: { hl: 0.9 }, NQ: { hl: 2.1 }, OTHER: { hl: 1 } } };
const sc = scoreIssue(s1, audit);
ok('each market is marked as realised range over the expected range the issue printed', sc.n === 3 && sc.rows.find(r => r.key === 'EURUSD').ratio === 1.22 && sc.rows.find(r => r.key === 'GOLD').ratio === 0.76 && sc.rows.find(r => r.key === 'NQ').ratio === 1.2);
ok('median, share past the expected range and share within half to one-and-a-half are computed', sc.median === 1.2 && sc.pastShare === 67 && sc.withinShare === 100);
ok('too few matched markets means no score rather than a noisy one', scoreIssue(s1, { instruments: { EURUSD: { hl: 1 } } }) === null && scoreIssue(s1, null) === null);
ok('the score line says what calibrated looks like and never mentions direction', /median near 1/.test(scoreLine(sc)) && !/bullish|bearish|right|wrong|hit rate/i.test(scoreLine(sc)) && /Not scored yet/.test(scoreLine(null)));
const wk = weekRecord([{ score: sc }, { score: sc }, { score: null }]);
ok('a week rolls scored days together and skips unscored ones', wk.days === 2 && wk.n === 6 && wk.pastShare === 67);

ok('a market read that describes and explains is allowed, including a consensus "expected"', readIsSafe('Up 0.10% today. Retail sales are expected to fall 0.1% and the book is the smallest long in years.') && readIsSafe('Used 198% of a normal day, a wide sweep that went nowhere; gamma is negative.'));
ok('predictions and advice are refused', ['The stale book leans against a euro squeeze. Expect extension not fade.', 'It is likely to rally.', 'Price will rise from here.', 'Bullish setup.', 'Buy the dip.', 'Gold should fall on this.'].every(x => !readIsSafe(x)) && !readIsSafe('') && !readIsSafe(null));
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
