/**
 * macroCore tests — frozen-threshold regime classifier, publication lag,
 * riskSens golden equality vs PAIR_DRIVERS, and the backfill map identity.
 * Offline, synthetic data. Run: node js/macroCore.test.mjs
 */
import {
  macroRegime, macroContext, macroContextByDate, riskSensFor, effectiveDate,
  MACRO_THRESHOLDS, MACRO_FRED_SERIES,
} from './macroCore.js';
import { PAIR_DRIVERS } from './fx-macro-model.js';
import { resolveKey } from './instrumentRegistry.js';
import { macroState, MACRO_RISK_SENS_MIN } from '../Trade_Decision_Engine/decisionCore.js';

let pass = 0, failCount = 0;
const ok = (name, cond) => cond ? (pass++, console.log(`  ✓ ${name}`))
                                : (failCount++, console.error(`  ✗ ${name}`));

// ── synthetic obs-dated series on business days ──────────────────────────────
const DAY = 86_400_000;
function bizDates(n, endIso = '2026-07-01') {
  const out = [];
  let t = Date.parse(endIso + 'T00:00:00Z');
  while (out.length < n) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) out.unshift(new Date(t).toISOString().slice(0, 10));
    t -= DAY;
  }
  return out;
}
const series = (values, endIso) => bizDates(values.length, endIso).map((date, i) => ({ date, value: values[i] }));
const flat = (n, v) => Array.from({ length: n }, () => v);
const asOf = iso => Date.parse(iso + 'T12:00:00Z');

console.log('[effectiveDate — publication lag]');
ok('weekday obs usable next day', effectiveDate('2026-06-30') === '2026-07-01');      // Tue → Wed
ok('Friday obs usable Monday', effectiveDate('2026-06-26') === '2026-06-29');         // Fri → Mon
ok('garbage returns null', effectiveDate('nope') === null);

console.log('[macroRegime — frozen thresholds]');
{
  const calmVix = series(flat(40, 13), '2026-06-30');
  const calmHy  = series(flat(40, 3.2).map((v, i) => v - i * 0.001), '2026-06-30'); // gently tightening
  ok('calm + tightening ⇒ RISK_ON', macroRegime({ vix: calmVix, hy: calmHy }, asOf('2026-07-01')).regime === 'RISK_ON');

  const spikeVix = series([...flat(35, 14), ...flat(5, 26)], '2026-06-30');
  ok('VIX ≥ 25 alone ⇒ RISK_OFF', macroRegime({ vix: spikeVix, hy: calmHy }, asOf('2026-07-01')).regime === 'RISK_OFF');

  const risingVix = series([...flat(35, 17), 18, 19, 20, 21, 22], '2026-06-30');    // 22, +4 over 5 obs
  ok('VIX ≥ 20 AND rising ⇒ RISK_OFF', macroRegime({ vix: risingVix, hy: calmHy }, asOf('2026-07-01')).regime === 'RISK_OFF');

  const wideHy = series([...flat(20, 3.2), ...flat(20, 3.7)], '2026-06-30');        // +0.50 over 20 obs
  ok('HY +40bp/20obs alone ⇒ RISK_OFF (even with calm VIX)',
     macroRegime({ vix: calmVix, hy: wideHy }, asOf('2026-07-01')).regime === 'RISK_OFF');

  const midVix = series(flat(40, 18), '2026-06-30');
  ok('in-between ⇒ NEUTRAL', macroRegime({ vix: midVix, hy: calmHy }, asOf('2026-07-01')).regime === 'NEUTRAL');

  ok('insufficient history ⇒ NEUTRAL + insufficient flag',
     macroRegime({ vix: calmVix.slice(-3), hy: calmHy.slice(-3) }, asOf('2026-07-01')).regime === 'NEUTRAL'
     && macroRegime({ vix: [], hy: [] }, asOf('2026-07-01')).insufficient !== false);

  // Lookahead: a VIX-26 print dated TODAY must not flip today's regime — it is
  // only usable tomorrow (the +1-business-day publication lag).
  const lateSpike = series([...flat(39, 14), 26], '2026-07-01');
  const today = macroRegime({ vix: lateSpike, hy: calmHy }, asOf('2026-07-01'));
  const tomorrow = macroRegime({ vix: lateSpike, hy: calmHy }, asOf('2026-07-02'));
  ok('same-day print is NOT usable (publication lag)', today.regime !== 'RISK_OFF' && today.asOfObs.vix === '2026-06-30');
  ok('next business day it IS usable', tomorrow.regime === 'RISK_OFF' && tomorrow.asOfObs.vix === '2026-07-01');
}

console.log('[riskSens — golden equality vs PAIR_DRIVERS (zero copies)]');
{
  let allEqual = true, n = 0;
  for (const [display, cfg] of Object.entries(PAIR_DRIVERS)) {
    if (!Number.isFinite(cfg?.riskSens)) continue;
    n++;
    if (riskSensFor(display) !== cfg.riskSens) allEqual = false;                   // display form
    if (riskSensFor(resolveKey(display)) !== cfg.riskSens) allEqual = false;       // registry key form
  }
  ok(`every PAIR_DRIVERS riskSens round-trips exactly (${n} pairs, both key forms)`, allEqual && n >= 20);
  ok('unknown/driverless pair returns null', riskSensFor('nas100') === null && riskSensFor('nonsense') === null);
  ok('sign sanity: GBP/JPY falls in risk-off; USD/CAD rises',
     riskSensFor('gbpjpy') < 0 && riskSensFor('usdcad') > 0);
}

console.log('[macroContext — TDE snapshot shape]');
{
  const vix = series([...flat(35, 14), ...flat(5, 27)], '2026-06-30');
  const hy  = series(flat(40, 3.4), '2026-06-30');
  const ctx = macroContext('gbpjpy', { vix, hy }, asOf('2026-07-01'));
  ok('shape: { regime, riskSens, asOf, stale }',
     ctx.regime === 'RISK_OFF' && Number.isFinite(ctx.riskSens) && Number.isFinite(ctx.asOf) && ctx.stale === false);
  const staleCtx = macroContext('gbpjpy', { vix, hy }, asOf('2026-07-20'));
  ok('stale data ⇒ NEUTRAL + stale:true (fail-neutral, riskSens kept finite)',
     staleCtx.regime === 'NEUTRAL' && staleCtx.stale === true && Number.isFinite(staleCtx.riskSens));
  ok('driverless pair ⇒ null context (buildSnapshot stamps null)',
     macroContext('nas100', { vix, hy }, asOf('2026-07-01')) === null);
  // End-to-end with the TDE's frozen direction resolver: risk-off + long on a
  // risk-sensitive pair must resolve OPPOSED (−1); short ALIGNED (+1).
  ok('decisionCore.macroState integration: RISK_OFF long GBP/JPY = −1, short = +1',
     macroState(ctx.riskSens, ctx.regime, 'long') === -1 && macroState(ctx.riskSens, ctx.regime, 'short') === +1);
  ok('sub-threshold riskSens pair resolves 0 (no noisy sign)',
     Math.abs(riskSensFor('eurgbp')) < MACRO_RISK_SENS_MIN
     && macroState(riskSensFor('eurgbp'), 'RISK_OFF', 'long') === 0);
}

console.log('[macroContextByDate — the backfill injection map]');
{
  const vix = series([...flat(30, 14), ...flat(10, 27)], '2026-06-30');
  const hy  = series(flat(40, 3.4), '2026-06-30');
  const fred = { vix, hy };
  const map = macroContextByDate('gbpjpy', fred, { to: asOf('2026-07-01') });
  const dates = Object.keys(map).sort();
  ok('map is non-empty with {macro:{regime,riskSens,asOf}} rows',
     dates.length > 20 && map[dates[0]].macro && Number.isFinite(map[dates[0]].macro.riskSens));
  // Golden identity: the map's regime equals macroRegime() evaluated at that
  // date, for every date — one formula, two entry points, no drift possible.
  let identical = true;
  for (const d of dates) {
    if (map[d].macro.regime !== macroRegime(fred, Date.parse(d + 'T12:00:00Z')).regime) identical = false;
  }
  ok('map ≡ macroRegime pointwise on every date', identical);
  ok('late dates are RISK_OFF, early dates are not',
     map[dates[dates.length - 1]].macro.regime === 'RISK_OFF' && map[dates[0]].macro.regime !== 'RISK_OFF');
  ok('driverless pair ⇒ empty map (macro-neutral backfill)',
     Object.keys(macroContextByDate('nas100', fred, { to: asOf('2026-07-01') })).length === 0);
}

ok('series registry names the two pre-registered factors',
   MACRO_FRED_SERIES.vix === 'VIXCLS' && MACRO_FRED_SERIES.hy === 'BAMLH0A0HYM2');
ok('thresholds are frozen', Object.isFrozen(MACRO_THRESHOLDS));

console.log(`\n${pass} passed, ${failCount} failed`);
if (failCount) process.exit(1);
