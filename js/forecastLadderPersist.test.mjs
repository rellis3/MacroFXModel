// node js/forecastLadderPersist.test.mjs
// Parity with the research harness was checked 2026-10-06 on the NY-close bars in analysis/output/ladder_candidates/d1
// (gitignored): EURUSD / GOLD / NQ for session 2026-08-18 matched scripts/forecast_history/forecast_fix.py --live to
// 4 dp on regime, res1, res5 and weekday. These tests pin the module's behaviour on synthetic bars.
import { persistFeatures, buildPersistLadder, buildPersistInstruments } from './forecastLadderPersist.js';
import { PERSIST_PARAMS } from './forecastLadderPersistParams.js';

let fail = 0;
const ok = (name, cond) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`); if (!cond) fail++; };

function bars(n, vol = 0.004, seed = 7) {
  let s = seed, px = 1.1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) - 0.5;
  const out = [];
  const d0 = Date.UTC(2023, 0, 2);
  for (let i = 0, day = 0; out.length < n; day++) {
    const dt = new Date(d0 + day * 86400_000);
    if (dt.getUTCDay() === 0 || dt.getUTCDay() === 6) continue;
    const o = px, c = o * (1 + rnd() * vol * 2);
    out.push({ date: dt.toISOString().slice(0, 10), open: o, close: c,
               high: Math.max(o, c) * (1 + Math.abs(rnd()) * vol), low: Math.min(o, c) * (1 - Math.abs(rnd()) * vol) });
    px = c; i++;
  }
  return out;
}

const B = bars(800);
const next = '2026-10-06';                                   // a Tuesday
const x = persistFeatures(B, { instrument: 'EURUSD', sessionDate: next });
ok('features computed from 800 bars', x && Number.isFinite(x.regime) && Number.isFinite(x.res1) && Number.isFinite(x.res5));
ok('Tuesday sets wd1 only', x.wd1 === 1 && x.wd2 === 0 && x.wd3 === 0 && x.wd4 === 0);
const mon = persistFeatures(B, { instrument: 'EURUSD', sessionDate: '2026-10-05' });
ok('Monday is the base (no weekday dummy)', mon.wd1 + mon.wd2 + mon.wd3 + mon.wd4 === 0);
ok('short history -> null', persistFeatures(bars(200), { instrument: 'EURUSD', sessionDate: next }) === null);

const L = buildPersistLadder(B, { instrument: 'EURUSD', sessionDate: next, sigmaUsedPct: 0.40 });
ok('ladder built', L && L.hl && L.oh && L.ol && L.oc);
ok('rungs increase p50 < p75 < p90', ['hl', 'oh', 'ol', 'oc'].every(q => L[q].p50 < L[q].p75 && L[q].p75 < L[q].p90));
ok('sigma_used = export sigma x adjust', Math.abs(L.sigma_used_pct - 0.40 * L.persist_adjust) < 0.006);
ok('width x sigma_new', Math.abs(L.hl.p75 - PERSIST_PARAMS.pairs.EURUSD.width.hl[1] * L.sigma_used_pct) < 0.01);

// features exactly at the instrument mean -> no adjustment
const P = JSON.parse(JSON.stringify(PERSIST_PARAMS));
const xm = persistFeatures(B, { instrument: 'EURUSD', sessionDate: next });
P.pairs.EURUSD.mean = Object.fromEntries(P.features.map(k => [k, xm[k]]));
const L0 = buildPersistLadder(B, { instrument: 'EURUSD', sessionDate: next, sigmaUsedPct: 0.40, params: P });
ok('features at the mean -> adjust 1.000', L0.persist_adjust === 1);

// regime above usual -> pulled down (negative beta), all else equal
ok('every class pulls a high regime down', Object.values(PERSIST_PARAMS.classes).every(c => c.beta.regime < 0));

const latest = { session_date: next, session_label: 'test', instruments: {
  EURUSD: { ladder: { sigma_used_pct: 0.4, event_tag: 'none' } }, BTCUSD: { ladder: { sigma_used_pct: 2 } } } };
const r = buildPersistInstruments(latest, { EURUSD: B }, [{ name: 'EURUSD', assetClass: 'fx' }]);
ok('instrument with params adjusted', r.adjusted.length === 1 && r.adjusted[0].name === 'EURUSD');
ok('instrument without params left on the plain ladder', r.skipped.some(s => s.name === 'BTCUSD') && r.instruments.BTCUSD.ladder.sigma_used_pct === 2);
ok('bars on/after the session date are ignored', (() => {
  const extra = [...B, { date: next, open: 1, high: 9, low: 0.1, close: 1 }];
  const a = buildPersistInstruments(latest, { EURUSD: extra }, []).instruments.EURUSD.ladder.sigma_used_pct;
  return a === r.instruments.EURUSD.ladder.sigma_used_pct;
})());

// implied-vol branch (the chosen forecast on the 13 IV instruments)
const Liv = buildPersistLadder(B, { instrument: 'EURUSD', sessionDate: next, sigmaUsedPct: 0.40, ivAnnualPct: 7.5 });
ok('IV given -> persist+iv form with its own widths', Liv.form === 'persist+iv' && Math.abs(Liv.hl.p75 - PERSIST_PARAMS.pairs.EURUSD.iv.width.hl[1] * Liv.sigma_used_pct) < 0.01);
ok('iv_sig = log(IV / annualised sigma_daily)', Math.abs(Liv.features.iv_sig - Math.log(7.5 / (Liv.sigma_daily_pct * Math.sqrt(252)))) < 1e-3);
const Lhi = buildPersistLadder(B, { instrument: 'EURUSD', sessionDate: next, sigmaUsedPct: 0.40, ivAnnualPct: 15 });
ok('higher implied vol -> wider lines', Lhi.hl.p75 > Liv.hl.p75);
ok('no IV -> persistence form', buildPersistLadder(B, { instrument: 'EURUSD', sessionDate: next, sigmaUsedPct: 0.40 }).form === 'persist');
ok('instrument without an iv block ignores IV', buildPersistLadder(B, { instrument: 'EURJPY', sessionDate: next, sigmaUsedPct: 0.40, ivAnnualPct: 9 }).form === 'persist');

console.log(fail ? `${fail} FAILED` : 'all passed');
process.exit(fail ? 1 : 0);
