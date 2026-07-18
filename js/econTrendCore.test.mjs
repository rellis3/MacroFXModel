/**
 * econTrendCore tests — as-of/no-lookahead gate, relative-momentum scoring signs,
 * ranking, end-to-end on a constructed world (hawkish ccy drifts up), placebo
 * determinism, and the directionAt hook's equivalence to the default trend path.
 * Offline, synthetic data. Run: node js/econTrendCore.test.mjs
 */
import {
  ECON_TREND_DEFAULTS, shiftDateDays, asOfValue, factorChange,
  econScoresAt, econDirections, runEconTrend, runEconTrendPlacebo,
  randomDirections, evaluateEconTrend,
} from './econTrendCore.js';
import { runTrendBasket } from './trendBasketEngine.js';

let pass = 0, failCount = 0;
const ok = (name, cond) => cond ? (pass++, console.log(`  ✓ ${name}`))
                                : (failCount++, console.error(`  ✗ ${name}`));

// ── helpers ──────────────────────────────────────────────────────────────────
// Monthly series: value fn(monthIndex), dated at month start, from 2015-01.
function monthly(nMonths, fn, startYear = 2015) {
  const out = [];
  for (let m = 0; m < nMonths; m++) {
    const y = startYear + Math.floor(m / 12), mo = (m % 12) + 1;
    out.push({ d: `${y}-${String(mo).padStart(2, '0')}-01`, v: fn(m) });
  }
  return out;
}
// Daily price series (weekdays), geometric drift per day, from 2015-01-01.
// Seeded LCG noise, independent per series — identical noise across ccys would
// cancel in a long/short book and collapse portfolio vol to 0 (degenerate Sharpe).
function dailyPrices(nDays, dailyDrift, seed = 1, start = 1.0) {
  const out = []; let t = Date.parse('2015-01-01T00:00:00Z'), v = start, s = seed >>> 0;
  const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  while (out.length < nDays) {
    const d = new Date(t), dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      v *= (1 + dailyDrift) * (1 + 0.004 * (rand() - 0.5));
      out.push({ t: d.toISOString().slice(0, 10), v });
    }
    t += 86_400_000;
  }
  return out;
}

// ── asOfValue: the no-lookahead gate ─────────────────────────────────────────
console.log('asOfValue / factorChange');
{
  const s = [{ d: '2020-01-01', v: 1 }, { d: '2020-02-01', v: 2 }, { d: '2020-03-01', v: 3 }];
  ok('exact date', asOfValue(s, '2020-02-01') === 2);
  ok('between dates → latest ≤', asOfValue(s, '2020-02-15') === 2);
  ok('before first → null (never sees the future)', asOfValue(s, '2019-12-31') === null);
  ok('after last → last', asOfValue(s, '2021-01-01') === 3);
  ok('non-finite value → null', asOfValue([{ d: '2020-01-01', v: NaN }], '2020-06-01') === null);
  ok('shiftDateDays back 90', shiftDateDays('2020-04-01', -90) === '2020-01-02');
  ok('factorChange 60d ≈ +1', factorChange(s, '2020-03-01', 60) === 2);   // 3 - asOf(2020-01-01)=1
  ok('factorChange missing past end → null', factorChange(s, '2020-01-15', 30) === null);
}

// ── econScoresAt: signs and relative-to-USD ──────────────────────────────────
console.log('econScoresAt');
{
  // 4 ccys + USD. HAWK's rates rise vs USD, DOVE's fall, two flat. 36 months.
  const flatF = { rate: monthly(36, () => 1), y10: monthly(36, () => 2), unemp: monthly(36, () => 5) };
  const fundamentals = {
    USD:  { rate: monthly(36, () => 1),          y10: monthly(36, () => 2),          unemp: monthly(36, () => 5) },
    HAWK: { rate: monthly(36, m => 1 + 0.1 * m), y10: monthly(36, m => 2 + 0.1 * m), unemp: monthly(36, m => 5 - 0.05 * m) },
    DOVE: { rate: monthly(36, m => 1 - 0.1 * m), y10: monthly(36, m => 2 - 0.1 * m), unemp: monthly(36, m => 5 + 0.05 * m) },
    FLATA: flatF, FLATB: flatF,
  };
  const scores = econScoresAt(fundamentals, '2017-06-15');
  ok('hawkish ccy scores highest', scores.HAWK > scores.FLATA && scores.HAWK > scores.DOVE);
  ok('dovish ccy scores lowest', scores.DOVE < scores.FLATA);
  ok('unemp sign inverted (falling unemp helps HAWK)', scores.HAWK > 0);
  ok('flat ccys near zero', Math.abs(scores.FLATA) < 0.3);

  const dirs = econDirections(scores, { topK: 1, bottomK: 1 });
  ok('top-1 long = HAWK', dirs.HAWK === 1);
  ok('bottom-1 short = DOVE', dirs.DOVE === -1);
  ok('middle flat', dirs.FLATA === 0 && dirs.FLATB === 0);

  // minFactors: a ccy with one factor sits out
  const thin = { ...fundamentals, THIN: { rate: monthly(36, m => 1 + 0.2 * m) } };
  ok('single-factor ccy → null score', econScoresAt(thin, '2017-06-15').THIN === null);

  // too-thin cross-section → all flat
  const dirsThin = econDirections({ A: 1, B: -1 }, { topK: 1, bottomK: 1, minCcys: 4 });
  ok('thin cross-section → all flat', dirsThin.A === 0 && dirsThin.B === 0);
}

// ── end-to-end: constructed world where fundamentals lead price ──────────────
console.log('runEconTrend end-to-end');
{
  const N = 2200, M = 120;                                  // ~8.5y daily, 10y monthly
  const seriesByCcy = {
    HAWK: dailyPrices(N, +0.0004, 11),
    DOVE: dailyPrices(N, -0.0004, 22),
    FLATA: dailyPrices(N, 0, 33),
    FLATB: dailyPrices(N, 0.00005, 44),
  };
  const flatF = { rate: monthly(M, () => 1), y10: monthly(M, () => 2), unemp: monthly(M, () => 5) };
  const fundamentals = {
    USD:  { rate: monthly(M, () => 1), y10: monthly(M, () => 2), unemp: monthly(M, () => 5) },
    HAWK: { rate: monthly(M, m => 1 + 0.05 * m), y10: monthly(M, m => 2 + 0.05 * m), unemp: monthly(M, m => 8 - 0.03 * m) },
    DOVE: { rate: monthly(M, m => 1 - 0.05 * m), y10: monthly(M, m => 2 - 0.05 * m), unemp: monthly(M, m => 3 + 0.03 * m) },
    FLATA: flatF, FLATB: flatF,
  };
  const opts = { topK: 1, bottomK: 1, minCcys: 4 };
  const real = runEconTrend(seriesByCcy, fundamentals, opts);
  ok('runs without error', !real.error);
  ok('positive OOS Sharpe in the constructed world', real.oos && real.oos.sharpe > 0.5);
  ok('splitDate exposed', typeof real.splitDate === 'string');
  ok('current stance long HAWK short DOVE',
     real.current.find(c => c.ccy === 'HAWK').trend === 1 &&
     real.current.find(c => c.ccy === 'DOVE').trend === -1);
  ok('currentScores attached', real.currentScores && real.currentScores.HAWK > real.currentScores.DOVE);

  // Placebo: deterministic and (in this stacked world) beaten by the real run
  const p1 = runEconTrendPlacebo(seriesByCcy, { ...opts, placeboRuns: 40 });
  const p2 = runEconTrendPlacebo(seriesByCcy, { ...opts, placeboRuns: 40 });
  ok('placebo deterministic under same seed', JSON.stringify(p1.sharpes) === JSON.stringify(p2.sharpes));
  const ev = evaluateEconTrend(real, p1.sharpes, opts);
  ok('constructed world passes the frozen criteria', ev.pass === true);
  ok('percentile rank ≥ 0.9', ev.placeboPctlRank >= 0.9);

  // Null world: shuffle who owns which fundamentals → verdict must not pass
  const nullFund = { USD: fundamentals.USD, HAWK: flatF, DOVE: flatF, FLATA: fundamentals.HAWK, FLATB: fundamentals.DOVE };
  const nullRun = runEconTrend(seriesByCcy, nullFund, opts);
  const evNull = evaluateEconTrend(nullRun, p1.sharpes, opts);
  ok('mismatched fundamentals do NOT pass', evNull.pass === false);
}

// ── directionAt hook: reproducing the default trend gives identical results ──
console.log('directionAt hook regression');
{
  const seriesByCcy = { A: dailyPrices(900, 0.0003, 5), B: dailyPrices(900, -0.0002, 6), C: dailyPrices(900, 0.0001, 7) };
  const base = runTrendBasket(seriesByCcy, { lookback: 252 });
  const viaHook = runTrendBasket(seriesByCcy, {
    lookback: 252,
    directionAt: (iDec, { cols, ccys }) => Object.fromEntries(ccys.map(c =>
      [c, Math.sign(cols[c][iDec] / cols[c][iDec - 252] - 1)])),
  });
  ok('hook reproducing 12-mo trend ⇒ identical OOS stats',
     JSON.stringify(base.oos) === JSON.stringify(viaHook.oos));
  ok('…and identical equity tail',
     JSON.stringify(base.equity.slice(-5)) === JSON.stringify(viaHook.equity.slice(-5)));
}

// ── randomDirections shape ───────────────────────────────────────────────────
console.log('randomDirections');
{
  let s = 42; const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const dirs = randomDirections(['A', 'B', 'C', 'D', 'E'], rand, 2, 2);
  const vals = Object.values(dirs);
  ok('2 longs, 2 shorts, 1 flat', vals.filter(v => v === 1).length === 2 &&
     vals.filter(v => v === -1).length === 2 && vals.filter(v => v === 0).length === 1);
}

console.log(`\n${pass} passed, ${failCount} failed`);
if (failCount) process.exit(1);
