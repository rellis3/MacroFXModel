// Synthetic, no-network unit tests for the carry engine.
//   node js/carryEngine.test.mjs
//
// The point of these tests is to prove the FIX over the old spot proxy:
//   (1) the carry ACCRUAL actually shows up in returns (flat-ish spot, positive
//       rate differential ⇒ positive total, driven by the carry leg not spot);
//   (2) the SIGNAL responds to rates (long high-rate ccy, short low-rate ccy);
//   (3) the spot/carry/cost decomposition adds up to the total;
//   (4) no-lookahead: a spike on the final bar cannot change in-sample stats;
//   (5) the OANDA financing-haircut math.

import { runCarryBasket, financingHaircut, forwardFillRates } from './carryEngine.js';

let failures = 0;
const ok   = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ── Deterministic synthetic series (no Math.random) ──────────────────────────
const N = 400;
function dateAt(i) { const d = new Date(Date.UTC(2015, 0, 1)); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); }
const DATES = Array.from({ length: N }, (_, i) => dateAt(i));

// Price with real vol but ~zero net drift, so any positive total return must come
// from the carry accrual, not from spot drift. Deterministic oscillation.
function oscPrice(base, amp, phase) {
  return DATES.map((t, i) => ({ t, v: base * (1 + amp * Math.sin(i * 0.3 + phase)) }));
}
// Constant annual rate (%) as a sparse monthly map, like FRED prints.
function flatRate(pct) {
  const m = new Map();
  for (let i = 0; i < N; i += 21) m.set(DATES[i], pct);
  return m;
}

const priceByCcy = {
  EUR: oscPrice(1.10, 0.004, 0.0),
  GBP: oscPrice(1.30, 0.004, 1.1),
  JPY: oscPrice(0.009, 0.004, 2.2),   // "JPY in USD" ≈ 1/110
};
const rateByCcy = {
  USD: flatRate(1.0),
  EUR: flatRate(5.0),   // +4% vs USD → long
  GBP: flatRate(4.0),   // +3% vs USD → long
  JPY: flatRate(0.1),   // −0.9% vs USD → short
};

console.log('carryEngine — synthetic tests');

// (0) forward-fill sanity: monthly rate carried across daily gaps, never ahead.
const ff = forwardFillRates(DATES, flatRate(3.0));
ok('forwardFillRates carries value forward', ff[0] === 3.0 && ff[200] === 3.0 && ff.every(x => x === 3.0));
ok('forwardFillRates is NaN before first obs', Number.isNaN(forwardFillRates(['2014-01-01', ...DATES], flatRate(3.0))[0]));

// (1) THE fix: carry accrual shows up; spot drift ~0.
const res = runCarryBasket(priceByCcy, rateByCcy, { volWindow: 60, rebalDays: 21, costBps: 2 });
ok('runs without error', !res.error, res.error || '');
ok('carry leg is positive (accrual earned)', res.decomposition.carryAnnPct > 0.5, `carryAnnPct=${res.decomposition.carryAnnPct}`);
ok('spot leg is ~flat (no drift edge)', Math.abs(res.decomposition.spotAnnPct) < Math.abs(res.decomposition.carryAnnPct), `spotAnnPct=${res.decomposition.spotAnnPct}`);
ok('total is positive and carry-driven', res.all.cagr > 0, `cagr=${res.all.cagr}%`);
ok('spotOnly (old-proxy world) underperforms total', res.spotOnly.cagr < res.all.cagr, `spotOnly=${res.spotOnly.cagr}% total=${res.all.cagr}%`);

// (2) signal responds to rates: long high-rate, short low-rate.
const pos = Object.fromEntries(res.current.map(c => [c.ccy, c.position]));
ok('EUR (high rate) is LONG', pos.EUR === 'long', `EUR=${pos.EUR}`);
ok('GBP (high rate) is LONG', pos.GBP === 'long', `GBP=${pos.GBP}`);
ok('JPY (low rate) is SHORT', pos.JPY === 'short', `JPY=${pos.JPY}`);

// (3) decomposition adds up (each leg rounded to 2dp → allow small eps).
const d = res.decomposition;
ok('decomposition sums to total', near(d.totalAnnPct, d.spotAnnPct + d.carryAnnPct + d.costAnnPct, 0.06),
   `${d.totalAnnPct} vs ${(d.spotAnnPct + d.carryAnnPct + d.costAnnPct).toFixed(2)}`);

// (4) no-lookahead: a spike on the FINAL bar must not change in-sample stats.
const spiked = JSON.parse(JSON.stringify(priceByCcy));
spiked.EUR[N - 1] = { t: DATES[N - 1], v: 5.0 };   // absurd final-day spike
const res2 = runCarryBasket(spiked, rateByCcy, { volWindow: 60, rebalDays: 21, costBps: 2 });
ok('in-sample stats unchanged by final-bar spike (no lookahead)',
   res2.is.sharpe === res.is.sharpe && res2.is.cagr === res.is.cagr,
   `is.sharpe ${res.is.sharpe}→${res2.is.sharpe}`);

// (5) financing haircut math.
const hc = financingHaircut(
  [{ pair: 'EUR_USD', ccy: 'EUR', interbankDiffPct: 4.0 },
   { pair: 'JPY_USD', ccy: 'JPY', interbankDiffPct: -4.0 }],
  { EUR_USD: { longRate: 0.02, shortRate: -0.03 },
    JPY_USD: { longRate: 0.01, shortRate: -0.03 } });
ok('long-side haircut = |4| − 2 = 2', hc.rows[0].haircutPct === 2, `got ${hc.rows[0].haircutPct}`);
ok('short-side haircut = |−4| − 3 = 1', hc.rows[1].haircutPct === 1, `got ${hc.rows[1].haircutPct}`);
ok('avg haircut = 1.5', hc.avgHaircutPct === 1.5, `got ${hc.avgHaircutPct}`);
ok('missing financing → null haircut', financingHaircut([{ pair: 'X_USD', ccy: 'X', interbankDiffPct: 3 }], {}).rows[0].haircutPct === null);

console.log(failures ? `\n${failures} test(s) FAILED` : '\nAll carryEngine tests passed');
process.exit(failures ? 1 : 0);
