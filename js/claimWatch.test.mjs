// Synthetic tests for js/claimWatch.js. No network, no clock.   node js/claimWatch.test.mjs
import { CLAIMS, evaluateClaims, scoreClaimFires, joined, STAGE, APPROACH_AT } from './claimWatch.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const N = 900, END = Date.parse('2026-10-16');
const dates = Array.from({ length: N }, (_, i) => new Date(END - (N - 1 - i) * 864e5).toISOString().slice(0, 10));
// a deterministic wiggle so rolling histories have spread without randomness
const wig = (i, a = 0.004, p = 7) => 1 + a * Math.sin(i / p) + a * 0.5 * Math.cos(i / 3.1);
const flat = (lvl, a) => Array.from({ length: N }, (_, i) => +(lvl * wig(i, a)).toFixed(4));
const drift = (lvl, perDay, a) => Array.from({ length: N }, (_, i) => +(lvl * (1 + perDay * i) * wig(i, a)).toFixed(4));

function bundle({ narrow = false, broad = false, dspxDir = null, spike = false, rotate = false } = {}) {
  const S = {};
  S.spy = drift(400, 0.0004, 0.003); S.rsp = drift(150, 0.0004, 0.003); S.smh = drift(200, 0.0008, 0.004);
  if (narrow) for (let i = N - 20; i < N; i++) S.spy[i] = +(S.spy[i] * (1 + 0.012 * (i - (N - 21)))).toFixed(4);   // cap-weight rips, equal-weight flat
  if (broad) for (let i = N - 20; i < N; i++) S.rsp[i] = +(S.rsp[i] * (1 + 0.012 * (i - (N - 21)))).toFixed(4);
  S.dspx = flat(30, 0.04);
  if (dspxDir === 'rising') for (let i = N - 20; i < N; i++) S.dspx[i] = +(36 + 0.3 * (i - (N - 20))).toFixed(2);
  if (dspxDir === 'falling') { for (let i = N - 40; i < N - 20; i++) S.dspx[i] = 44; for (let i = N - 20; i < N; i++) S.dspx[i] = +(44 - 0.2 * (i - (N - 20))).toFixed(2); }
  S.vix = flat(16, 0.05); if (spike) { S.vix[N - 1] = 23; S.vix[N - 2] = 21; }
  S.nq = drift(20000, 0.0005, 0.004); S.r2k = Array.from({ length: N }, (_, i) => +(2200 * (1 + 0.0005 * i) * (1 + 0.006 * Math.sin(i / 5))).toFixed(4));
  if (rotate) for (let i = N - 20; i < N; i++) S.nq[i] = +(S.nq[i] * (1 + 0.009 * (i - (N - 21)))).toFixed(2);
  S.gold = drift(2600, 0.0003, 0.003); S.oil = flat(80, 0.02);
  // a quiet tape is quiet BY CONSTRUCTION, not by luck: a sine's last value can sit at a
  // high percentile of its own window, which would read as 'approaching' on a flat market
  if (!dspxDir) for (let i = N - 25; i < N; i++) S.dspx[i] = 30;                         // at the median of its window
  if (!rotate) for (let i = N - 21; i < N; i++) { S.nq[i] = +(S.nq[N - 22] * (1 + 0.0005 * (i - (N - 22)))).toFixed(2); S.r2k[i] = +(S.r2k[N - 22] * (1 + 0.0005 * (i - (N - 22)))).toFixed(2); }   // identical relative path → rel20 = 0
  // US holidays: Yahoo/FRED rows blank where OANDA trades
  for (const k of ['spy', 'rsp', 'smh', 'vix']) for (let i = 100; i < N; i += 97) S[k][i] = null;
  return { dates, series: S };
}
const by = arr => Object.fromEntries(arr.map(t => [t.id, t]));

console.log('[register]');
ok('every claim has id/evidenceId/claim/verdict/rule/lookFor/outcome with horizons and base per horizon', CLAIMS.every(c => c.id && c.evidenceId && c.claim && c.verdict && c.rule && c.lookFor && c.outcome?.horizons?.length && c.outcome.horizons.every(h => c.outcome.base[h])));
ok('no claim text promises a direction', CLAIMS.every(c => !/will (rise|fall)|goes (up|down) from here/i.test(c.lookFor + c.verdict)));
ok('ids are unique and prefixed claim-', new Set(CLAIMS.map(c => c.id)).size === CLAIMS.length && CLAIMS.every(c => c.id.startsWith('claim-')));

console.log('[joined]');
{ const J = joined(bundle(), ['spy', 'rsp']); ok('joined drops holiday rows and keeps alignment', J.idx.length < N && J.idx.length > N - 20 && J.v.spy.length === J.idx.length && J.dates.length === J.idx.length);
  ok('joined with a missing key is empty, not a throw', joined(bundle(), ['spy', 'nope']).idx.length === 0); }

console.log('[evaluateClaims — quiet tape]');
{ const t = evaluateClaims({ bundle: bundle(), crack: null });
  ok('every bundle-fed claim evaluates; the crack one is absent without its input', t.length === CLAIMS.length - 1 && !t.some(x => x.id === 'claim-crack-disagreement'));
  ok('all kind claim, none firing, all idle, each carries evidenceId + lookFor + a progress in [0,1]', t.every(x => x.kind === 'claim' && !x.firing && x.stage === STAGE.idle && x.evidenceId && x.lookFor && x.value.progress >= 0 && x.value.progress <= 1));
  ok('detail carries the claim and the verdict', t.every(x => /Crown’s claim:/.test(x.detail) && /This desk:/.test(x.detail)));
  ok('no inputs at all → no triggers (missing input is never a clear)', evaluateClaims({}).length === 0); }

console.log('[evaluateClaims — setups live]');
{ const t = by(evaluateClaims({ bundle: bundle({ narrow: true, dspxDir: 'rising', spike: true, rotate: true }) }));
  ok('narrowing extreme fires (z ≤ −1.8) and the broad mirror does not', t['claim-breadth-narrow'].firing && t['claim-breadth-narrow'].value.reading <= -1.8 && !t['claim-breadth-broad'].firing);
  ok('semis tilt fires on the same tape (RSP/SPY 20s change in the bottom decile)', t['claim-semis-tilt'].firing && t['claim-semis-tilt'].value.rank <= 0.10);
  ok('dispersion rising fires; the falling arm does not and cannot read as approaching', t['claim-dispersion-rising'].firing && !t['claim-dispersion-falling'].firing && t['claim-dispersion-falling'].stage === STAGE.idle);
  ok('fear spike fires at +7 over five sessions', t['claim-fear-spike'].firing && t['claim-fear-spike'].value.reading >= 5);
  ok('rotation extreme fires with Nasdaq leading', t['claim-rotation-extreme'].firing && t['claim-rotation-extreme'].value.sign === 1);
  ok('a live trigger says so and labels itself Setup watch', /LIVE/.test(t['claim-breadth-narrow'].detail) && /^Setup watch · /.test(t['claim-breadth-narrow'].label)); }
{ const t = by(evaluateClaims({ bundle: bundle({ broad: true, dspxDir: 'falling' }) }));
  ok('broadening extreme fires the mirror, not the narrowing', t['claim-breadth-broad'].firing && !t['claim-breadth-narrow'].firing);
  ok('dispersion falling fires (crowded, down over 20) and rising does not', t['claim-dispersion-falling'].firing && !t['claim-dispersion-rising'].firing); }

console.log('[approaching]');
{ const B = bundle(); for (let i = N - 20; i < N; i++) B.series.vix[i] = 16 + 0.2 * (i - (N - 20)); B.series.vix[N - 1] = B.series.vix[N - 6] + 4.0;
  const t = by(evaluateClaims({ bundle: B }));
  ok(`VIX +4 in five reads approaching (progress ${t['claim-fear-spike'].value.progress} ≥ ${APPROACH_AT}), not firing`, t['claim-fear-spike'].stage === STAGE.approaching && !t['claim-fear-spike'].firing && /Approaching/.test(t['claim-fear-spike'].detail)); }
{ const crack = Array.from({ length: 40 }, (_, i) => ({ date: dates[N - 40 + i], value: 30 + (i >= 20 ? 0.3 * (i - 19) : 0), wti: 90 * (i >= 20 ? 1 - 0.003 * (i - 19) : 1) }));
  const t = by(evaluateClaims({ crack }));
  ok('crack disagreement fires on −6% crude and +$6 crack', t['claim-crack-disagreement']?.firing && t['claim-crack-disagreement'].value.dCrack >= 5);
  const half = crack.map(r => ({ ...r, value: 30 + (r.value - 30) * 0.5 }));
  ok('with the crack only +$3 it does not fire and is not approaching (both legs must be ≥ 75%)', !by(evaluateClaims({ crack: half }))['claim-crack-disagreement'].firing && by(evaluateClaims({ crack: half }))['claim-crack-disagreement'].stage === STAGE.idle); }

console.log('[scoreClaimFires]');
{ const B = bundle(); const fireDay = dates[N - 30];
  const log = [
    { id: 'claim-semis-tilt', claimId: 'claim-semis-tilt', kind: 'claim', event: 'started', at: fireDay + 'T21:00:00Z', value: {} },
    { id: 'claim-breadth-narrow', claimId: 'claim-breadth-narrow', kind: 'claim', event: 'started', at: fireDay + 'T21:00:00Z', value: {} },
    { id: 'claim-rotation-extreme', claimId: 'claim-rotation-extreme', kind: 'claim', event: 'started', at: fireDay + 'T21:00:00Z', value: { sign: -1 } },
    { id: 'claim-fear-spike', claimId: 'claim-fear-spike', kind: 'claim', event: 'started', at: fireDay + 'T21:00:00Z', value: {} },
    { id: 'vix-inversion', kind: 'tested', event: 'started', at: fireDay + 'T21:00:00Z' },
    { id: 'claim-semis-tilt', claimId: 'claim-semis-tilt', kind: 'claim', event: 'approaching', at: fireDay + 'T21:00:00Z' },
  ];
  const bars = Array.from({ length: 60 }, (_, i) => ({ date: dates[N - 60 + i], value: 5000 + i, high: 5000 + i + 20, low: 5000 + i - 20 }));
  const changed = scoreClaimFires(log, { bundle: B, series: { spx: bars, nq: bars } });
  ok('scores the 5/20-session horizons that have elapsed and leaves 60 open', log[0].outcomes[20] != null && log[0].outcomes[60] == null && log[1].outcomes[5] != null && log[1].outcomes[20] != null && changed >= 4);
  ok('relRet is SMH minus SPY in %, ratioChange is RSP/SPY in %', Math.abs(log[0].outcomes[20]) < 10 && Math.abs(log[1].outcomes[20]) < 10);
  ok('extend uses the sign stored at the fire', typeof log[2].outcomes[20] === 'number');
  ok('non-claim and non-started entries are untouched', log[4].outcomes == null && log[5].outcomes == null);
  const log2 = [{ id: 'claim-dispersion-rising', claimId: 'claim-dispersion-rising', kind: 'claim', event: 'started', at: dates[N - 30] + 'T21:00:00Z' }];
  scoreClaimFires(log2, { bundle: B, series: { spx: bars, nq: bars } });
  ok('rangeRatio scores both instruments from bars (near-constant range bars → ≈1.0)', Math.abs(log2[0].outcomes[5]?.SPX500 - 1) < 0.02 && Math.abs(log2[0].outcomes[20]?.NQ - 1) < 0.02);
  const again = scoreClaimFires(log, { bundle: B, series: { spx: bars, nq: bars } });
  ok('a second pass changes nothing already scored', again === 0); }
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
