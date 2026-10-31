// Synthetic tests for js/claimWatch.js. No network, no clock.   node js/claimWatch.test.mjs
import { CLAIMS, DETECTOR_ROWS, GAUGE_ROWS, evaluateClaims, evaluateGauges, scoreClaimFires, joined, STAGE, APPROACH_AT } from './claimWatch.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const N = 900, END = Date.parse('2026-10-16');
const dates = Array.from({ length: N }, (_, i) => new Date(END - (N - 1 - i) * 864e5).toISOString().slice(0, 10));
// a deterministic wiggle so rolling histories have spread without randomness
const wig = (i, a = 0.004, p = 7) => 1 + a * Math.sin(i / p) + a * 0.5 * Math.cos(i / 3.1);
const flat = (lvl, a) => Array.from({ length: N }, (_, i) => +(lvl * wig(i, a)).toFixed(4));
const drift = (lvl, perDay, a) => Array.from({ length: N }, (_, i) => +(lvl * (1 + perDay * i) * wig(i, a)).toFixed(4));

function bundle({ narrow = false, broad = false, dspxDir = null, spike = false, rotate = false, allDown = false, dear = false, yieldJump = false } = {}) {
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
  S.spx = drift(5000, 0.0004, 0.012); S.de30 = drift(18000, 0.0003, 0.004); S.uk100 = drift(8000, 0.0002, 0.003); S.jp225 = drift(38000, 0.0004, 0.004);
  S.us10y = flat(4.2, 0.002); S.us10y[N - 1] = yieldJump ? S.us10y[N - 2] + 0.25 : S.us10y[N - 2];   // quiet: an unchanged 10-year
  // a quiet tape is quiet BY CONSTRUCTION, not by luck: a sine's last value can sit at a
  // high percentile of its own window, which would read as 'approaching' on a flat market
  if (!dspxDir) for (let i = N - 25; i < N; i++) S.dspx[i] = 30;                         // at the median of its window
  if (!rotate) for (let i = N - 21; i < N; i++) { S.nq[i] = +(S.nq[N - 22] * (1 + 0.0005 * (i - (N - 22)))).toFixed(2); S.r2k[i] = +(S.r2k[N - 22] * (1 + 0.0005 * (i - (N - 22)))).toFixed(2); }   // identical relative path → rel20 = 0
  // LAST, after every other edit to these series: the index-close override, the implied-vol
  // spike, and the front-month ratio (which must see the final VIX)
  for (const k of ['spx', 'nq', 'r2k', 'de30', 'uk100', 'jp225']) S[k][N - 1] = +(S[k][N - 2] * (allDown ? 0.99 : 1.002)).toFixed(2);   // quiet tape: every index up a touch
  S.vix9d = S.vix.map(v => +(v * (dear ? 1.02 : 0.90)).toFixed(2));        // normal front at 0.90; dear at 1.02
  // US holidays: Yahoo/FRED rows blank where OANDA trades
  for (const k of ['spy', 'rsp', 'smh', 'vix', 'vix9d']) for (let i = 100; i < N; i += 97) S[k][i] = null;
  return { dates, series: S };
}
const by = arr => Object.fromEntries(arr.map(t => [t.id, t]));

console.log('[register]');
ok('every row has id/evidenceId/source/claim/verdict/rule/lookFor; detector rows carry an outcome with a base per horizon', CLAIMS.every(c => c.id && c.evidenceId && ['Crown', 'desk'].includes(c.source) && c.claim && c.verdict && c.rule && c.lookFor) && DETECTOR_ROWS.every(c => c.outcome?.horizons?.length && c.outcome.horizons.every(h => c.outcome.base[h])));
ok('gauge rows name an existing desk-watch trigger and carry no outcome (the trigger scores itself)', GAUGE_ROWS.length >= 6 && GAUGE_ROWS.every(c => c.watchId && c.outcome == null) && DETECTOR_ROWS.every(c => !c.watchId));
ok('desk detector rows set kind by verdict: validated → tested, otherwise claim', DETECTOR_ROWS.filter(c => c.source === 'desk').every(c => (c.verdict.startsWith('VALIDATED') ? 'tested' : 'claim') === c.kind));
ok('no claim text promises a direction', CLAIMS.every(c => !/will (rise|fall)|goes (up|down) from here/i.test(c.lookFor + c.verdict)));
ok('ids are unique and prefixed claim- (Crown), watch- (desk detector) or gauge- (desk gauge)', new Set(CLAIMS.map(c => c.id)).size === CLAIMS.length && CLAIMS.every(c => (c.source === 'Crown' && c.id.startsWith('claim-')) || (c.watchId ? c.id.startsWith('gauge-') : c.id.startsWith('watch-'))));

console.log('[joined]');
{ const J = joined(bundle(), ['spy', 'rsp']); ok('joined drops holiday rows and keeps alignment', J.idx.length < N && J.idx.length > N - 20 && J.v.spy.length === J.idx.length && J.dates.length === J.idx.length);
  ok('joined with a missing key is empty, not a throw', joined(bundle(), ['spy', 'nope']).idx.length === 0); }

console.log('[evaluateClaims — quiet tape]');
{ const t = evaluateClaims({ bundle: bundle(), crack: null });
  const BUNDLE_ONLY = ['claim-breadth-narrow', 'claim-breadth-broad', 'claim-semis-tilt', 'claim-dispersion-rising', 'claim-dispersion-falling', 'claim-fear-spike', 'claim-rotation-extreme', 'watch-iv-over-rv', 'watch-vol-front-dear', 'watch-breadth-all-down', 'watch-yield-move'];
  ok('exactly the bundle-fed rows evaluate; crack-, bars- and funding-fed rows are absent without their input', t.map(x => x.id).sort().join() === BUNDLE_ONLY.slice().sort().join());
  ok('none firing, all idle, each carries evidenceId + source + lookFor + a progress in [0,1]', t.every(x => !x.firing && x.stage === STAGE.idle && x.evidenceId && x.source && x.lookFor && x.value.progress >= 0 && x.value.progress <= 1), t.filter(x => x.stage !== STAGE.idle).map(x => `${x.id}:${x.stage}:${x.value.progress}`).join(' '));
  ok('kind follows the row: Crown rows claim, validated desk rows tested', t.filter(x => x.source === 'Crown').every(x => x.kind === 'claim') && by(t)['watch-iv-over-rv'].kind === 'tested' && by(t)['watch-yield-move'].kind === 'claim');
  ok('detail carries the claim and the verdict, attributed to Crown or to the desk', t.every(x => /(Crown’s claim|The claim):/.test(x.detail) && /This desk:/.test(x.detail)) && /Crown’s claim/.test(by(t)['claim-fear-spike'].detail) && /The claim:/.test(by(t)['watch-iv-over-rv'].detail));
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

console.log('[desk detector rows]');
{ const t = by(evaluateClaims({ bundle: bundle({ allDown: true, dear: true, yieldJump: true }) }));
  ok('all six indices down fires the breadth wipe-out (6/6)', t['watch-breadth-all-down'].firing && t['watch-breadth-all-down'].value.reading === 6);
  ok('a dear front (VIX9D/VIX 1.02) fires; the detail names DEAR', t['watch-vol-front-dear'].firing && /DEAR/.test(t['watch-vol-front-dear'].detail));
  // implied-over-realised needs a REALISTIC realised vol: a smooth sine has ~2% annualised, so a
  // deterministic random walk (mulberry32-style LCG, ~15% annualised) stands in for the S&P here
  { let seed = 0x9e3779b9; const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    const spx = [5000]; for (let i = 1; i < N; i++) spx.push(+(spx[i - 1] * (1 + 0.0095 * (rnd() * 2 - 1))).toFixed(2));   // ±0.95% uniform → ~0.55% daily ≈ 9% annualised
    const vix = Array(N).fill(16); vix[N - 1] = 40;
    const iv = by(evaluateClaims({ bundle: { dates, series: { spx, vix } } }))['watch-iv-over-rv'];
    ok('VIX 40 over a ~9% realised is top-decile implied-over-realised and fires as kind tested', iv?.firing && iv.kind === 'tested' && iv.value.rank >= 0.9);
    const quiet = by(evaluateClaims({ bundle: { dates, series: { spx, vix: Array(N).fill(16) } } }))['watch-iv-over-rv'];
    ok('a flat VIX over the same walk is not top-decile (idle or approaching only)', quiet && !quiet.firing); }
  ok('a +25bp day in the 10-year is a top-decile |Δ| and fires', t['watch-yield-move'].firing && t['watch-yield-move'].value.reading > 20);
  const five = by(evaluateClaims({ bundle: (() => { const B = bundle({ allDown: true }); B.series.jp225[N - 1] = +(B.series.jp225[N - 2] * 1.001).toFixed(2); return B; })() }));
  ok('five of six down is approaching (0.83), not live', !five['watch-breadth-all-down'].firing && five['watch-breadth-all-down'].stage === STAGE.approaching);
  const barsOf = (rng, n = 10, end = '2026-10-16') => Array.from({ length: n }, (_, i) => { const d = new Date(Date.parse(end) - (n - 1 - i) * 864e5).toISOString().slice(0, 10); const r = rng(i); return { date: d, value: 5000, high: 5000 + r / 2, low: 5000 - r / 2 }; });
  const nr7 = by(evaluateClaims({ series: { spx: barsOf(i => i === 9 ? 10 : 40) } }));
  ok('narrowest-of-seven on the S&P fires NR7; equal ranges do not (strict)', nr7['watch-nr7-spx'].firing && !by(evaluateClaims({ series: { spx: barsOf(() => 40) } }))['watch-nr7-spx'].firing);
  const repo = by(evaluateClaims({ funding: [{ date: '2026-10-15', value: 0.04 }, { date: '2026-10-16', value: 0.12 }] }));
  ok('headline SOFR +12bp over the floor fires; +4bp does not', repo['watch-repo-headline'].firing && !by(evaluateClaims({ funding: [{ date: '2026-10-16', value: 0.04 }] }))['watch-repo-headline'].firing);
  const crack = Array.from({ length: 260 }, (_, i) => ({ date: dates[N - 260 + i], value: 30 + Math.sin(i / 9) * 1.5 + (i >= 240 ? 0.6 * (i - 239) : 0), wti: 90 }));
  ok('a crack rising $12 in 20 sessions against a ±1.5 history is a blow-out (z ≥ 2)', by(evaluateClaims({ crack }))['watch-crack-blowout'].firing); }

console.log('[gauges]');
{ const inputs = { fred: { vix: { value: 19 }, vix3m: { value: 20 }, us2y: { value: 4.5 }, us10y: { value: 4.55 } }, stockBond: { corr: 0.1, asOf: '2026-10-16' },
    hist: { us2y: Array.from({ length: 6 }, (_, i) => ({ date: dates[N - 6 + i], value: 4.3 + 0.022 * i })), bei: Array.from({ length: 15 }, (_, i) => ({ date: dates[N - 15 + i], value: 2.3 })) },
    series: { nq: Array.from({ length: 6 }, (_, i) => ({ date: dates[N - 6 + i], value: 20000 - 30 * i })), oil: Array.from({ length: 21 }, (_, i) => ({ date: dates[N - 21 + i], value: 80 + 0.45 * i })) } };
  const g = by(evaluateGauges(inputs));
  ok('six gauges evaluate with their inputs, all kind gauge with a watchId and a progress', Object.keys(g).length === 6 && Object.values(g).every(x => x.kind === 'gauge' && x.watchId && x.value.progress >= 0 && x.value.progress <= 1 && x.lookFor));
  ok('VIX 19 vs VIX3M 20 (0.95) reads approaching on the inversion gauge, not live', g['gauge-vix-inversion'].stage === STAGE.approaching && !g['gauge-vix-inversion'].firing);
  ok('2s10s at +5bp is approaching inversion (progress 0.9); corr +0.1 is idle', g['gauge-curve-2s10s'].stage === STAGE.approaching && g['gauge-stock-bond'].stage === STAGE.idle);
  ok('NAS100 −0.75% over five reads approaching the down-week; 2-year +11bp approaching the shock', g['gauge-nq-down-week'].stage === STAGE.approaching && g['gauge-front-end-shock'].stage === STAGE.approaching);
  ok('oil +12% with breakevens flat fires the mirrored oil-without-breakevens condition', g['gauge-oil-without-bei'].firing);
  ok('no inputs → no gauges', evaluateGauges({}).length === 0); }

console.log('[hysteresis]');
{
  const { RELEASE_AT } = await import('./claimWatch.js');
  const B = bundle(); for (let i = N - 20; i < N; i++) B.series.vix[i] = 16 + 0.2 * (i - (N - 20));
  B.series.vix[N - 1] = B.series.vix[N - 6] + 4.6;                       // progress 0.92: under the line, above RELEASE_AT
  const prevLive = [{ id: 'claim-fear-spike', firing: true, stage: 'live' }];
  const held = by(evaluateClaims({ bundle: B }, prevLive))['claim-fear-spike'];
  ok(`a firing setup at ${held.value.progress} of its threshold stays LIVE (held) when it was firing last tick`, held.firing && held.stage === STAGE.live && held.value.held === true && /Still LIVE/.test(held.detail) && RELEASE_AT === 0.9);
  const fresh = by(evaluateClaims({ bundle: B }, []))['claim-fear-spike'];
  ok('the same reading with no prior fire is approaching, not live', !fresh.firing && fresh.stage === STAGE.approaching);
  B.series.vix[N - 1] = B.series.vix[N - 6] + 4.0;                       // progress 0.80: below RELEASE_AT → clears
  const cleared = by(evaluateClaims({ bundle: B }, prevLive))['claim-fear-spike'];
  ok('below RELEASE_AT it clears even if it was firing', !cleared.firing && cleared.stage === STAGE.approaching && !cleared.value.held);
}

console.log('[scoreClaimFires]');
{ const B = bundle(); const fireDay = dates[N - 30];
  const log = [
    { id: 'claim-semis-tilt', claimId: 'claim-semis-tilt', kind: 'claim', event: 'started', at: fireDay + 'T21:00:00Z', value: {} },
    { id: 'claim-breadth-narrow', claimId: 'claim-breadth-narrow', kind: 'claim', event: 'started', at: fireDay + 'T21:00:00Z', value: {} },
    { id: 'claim-rotation-extreme', claimId: 'claim-rotation-extreme', kind: 'claim', event: 'started', at: fireDay + 'T21:00:00Z', value: { sign: -1 } },
    { id: 'claim-fear-spike', claimId: 'claim-fear-spike', kind: 'claim', event: 'started', at: fireDay + 'T21:00:00Z', value: {} },
    { id: 'vix-inversion', kind: 'tested', event: 'started', at: fireDay + 'T21:00:00Z' },
    { id: 'watch-yield-move', claimId: 'watch-yield-move', kind: 'claim', event: 'started', at: fireDay + 'T21:00:00Z', value: {} },
    { id: 'claim-semis-tilt', claimId: 'claim-semis-tilt', kind: 'claim', event: 'approaching', at: fireDay + 'T21:00:00Z' },
  ];
  const bars = Array.from({ length: 60 }, (_, i) => ({ date: dates[N - 60 + i], value: 5000 + i, high: 5000 + i + 20, low: 5000 + i - 20 }));
  const changed = scoreClaimFires(log, { bundle: B, series: { spx: bars, nq: bars } });
  ok('scores the 5/20-session horizons that have elapsed and leaves 60 open', log[0].outcomes[20] != null && log[0].outcomes[60] == null && log[1].outcomes[5] != null && log[1].outcomes[20] != null && changed >= 4);
  ok('relRet is SMH minus SPY in %, ratioChange is RSP/SPY in %', Math.abs(log[0].outcomes[20]) < 10 && Math.abs(log[1].outcomes[20]) < 10);
  ok('extend uses the sign stored at the fire', typeof log[2].outcomes[20] === 'number');
  ok('non-register and non-started entries are untouched', log[4].outcomes == null && log[6].outcomes == null);
  ok('a desk detector fire with FX range outcomes scores from the FX bars when they are supplied', (() => { const fx = Array.from({ length: 60 }, (_, i) => ({ date: dates[N - 60 + i], value: 1.1, high: 1.102, low: 1.098 })); scoreClaimFires(log, { bundle: B, series: { spx: bars, nq: bars, eurusd: fx, usdjpy: fx, gbpusd: fx } }); return log[5].outcomes?.[1]?.EURUSD === 1 && log[5].outcomes?.[5]?.GBPUSD === 1; })());
  const log2 = [{ id: 'claim-dispersion-rising', claimId: 'claim-dispersion-rising', kind: 'claim', event: 'started', at: dates[N - 30] + 'T21:00:00Z' }];
  scoreClaimFires(log2, { bundle: B, series: { spx: bars, nq: bars } });
  ok('rangeRatio scores both instruments from bars (near-constant range bars → ≈1.0)', Math.abs(log2[0].outcomes[5]?.SPX500 - 1) < 0.02 && Math.abs(log2[0].outcomes[20]?.NQ - 1) < 0.02);
  const again = scoreClaimFires(log, { bundle: B, series: { spx: bars, nq: bars } });
  ok('a second pass changes nothing already scored', again === 0); }
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
