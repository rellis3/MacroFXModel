// Synthetic tests for the IV Forecast export. No network.
//   node js/ivLadderExport.test.mjs
import { constantMaturityIV } from './ivMetrics.js';
import { buildIvInstruments, buildIvLadderExportText, IV_LADDER_INSTRUMENTS } from './ivLadderExport.js';
import { buildLadder } from './forecastLadder.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) fails++; };
const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;

console.log('[constantMaturityIV]');
{
  // flat term structure -> that vol
  ok('flat 6% -> 0.06', near(constantMaturityIV([{ dte: 10, iv: 6 }, { dte: 40, iv: 6 }]), 0.06));
  // total-variance interpolation: 10d@5%, 40d@8% -> sqrt((w0 + (w1-w0)*(20/30)) / (30/365))
  const w0 = 0.05 ** 2 * 10 / 365, w1 = 0.08 ** 2 * 40 / 365;
  const exp = Math.sqrt((w0 + (w1 - w0) * (20 / 30)) / (30 / 365));
  ok('variance-time interpolation', near(constantMaturityIV([{ dte: 40, iv: 8 }, { dte: 10, iv: 5 }]), exp), `${exp}`);
  ok('expiries under 5 DTE ignored', near(constantMaturityIV([{ dte: 1, iv: 40 }, { dte: 10, iv: 6 }, { dte: 40, iv: 6 }]), 0.06));
  ok('flat-extrapolates past the last expiry', near(constantMaturityIV([{ dte: 7, iv: 5 }, { dte: 14, iv: 7 }]), 0.07));
  ok('null when nothing >= 5 DTE', constantMaturityIV([{ dte: 2, iv: 9 }]) === null);
}

const now = Date.UTC(2026, 8, 23, 7, 0);
const registry = [
  { name: 'EURUSD', oandaInstrument: 'EUR_USD', assetClass: 'fx' },
  { name: 'USDJPY', oandaInstrument: 'USD_JPY', assetClass: 'fx' },
  { name: 'GBPUSD', oandaInstrument: 'GBP_USD', assetClass: 'fx' },
  { name: 'GOLD',   oandaInstrument: 'XAU_USD', assetClass: 'commodity' },
];
const prodLadder = s => buildLadder(s, { instrument: 'EURUSD', eventTag: 'none' });
const latest = { session_label: 'WED 23 SEP 2026', instruments: {
  EURUSD: { vol_annual: 6, ladder: prodLadder(0.004), drift_d: 0.12 },
  USDJPY: { vol_annual: 9, ladder: prodLadder(0.006) },
  GBPUSD: { vol_annual: 7, ladder: { ...prodLadder(0.005), event_tag: null } },
  GOLD:   { vol_annual: 20, ladder: prodLadder(0.012) },
} };
const ts = (iv) => ({ points: [{ dte: 10, iv }, { dte: 40, iv }] });
const oi = {
  'EUR/USD': { ivTermStructure: ts(5.5), ivSavedAtMs: now - 2 * 3600_000 },
  'USD/JPY': { ivTermStructure: ts(8),   ivSavedAtMs: now - 2 * 3600_000 },
  'GBP/USD': { ivTermStructure: ts(6),   ivSavedAtMs: now - 100 * 3600_000 },   // stale
};

console.log('[buildIvInstruments]');
{
  const r = buildIvInstruments(latest, oi, registry, now);
  ok('EURUSD swapped to IV', r.swapped.some(s => s.name === 'EURUSD') && r.instruments.EURUSD.ladder.estimator === 'iv30');
  ok('EURUSD σ = iv30/√252', near(r.instruments.EURUSD.ladder.sigma_daily_pct, Math.round(5.5 / Math.sqrt(252) * 100) / 100, 1e-9),
     `${r.instruments.EURUSD.ladder.sigma_daily_pct}`);
  ok('EURUSD keeps its drift fields', r.instruments.EURUSD.drift_d === 0.12);
  ok('USDJPY NOT swapped (lost OOS)', !IV_LADDER_INSTRUMENTS.includes('USDJPY') && r.instruments.USDJPY === latest.instruments.USDJPY);
  ok('GOLD untouched', r.instruments.GOLD === latest.instruments.GOLD);
  ok('stale GBPUSD falls back to production', r.instruments.GBPUSD === latest.instruments.GBPUSD
     && r.skipped.some(s => s.name === 'GBPUSD' && /stale/.test(s.reason)));
}

console.log('[null event tag stays x1.0]');
{
  const oi2 = { ...oi, 'GBP/USD': { ivTermStructure: ts(6), ivSavedAtMs: now - 3600_000 } };
  const r = buildIvInstruments(latest, oi2, registry, now);
  ok('GBPUSD event_mult 1 when production tag is null', r.instruments.GBPUSD.ladder.event_mult === 1,
     `${r.instruments.GBPUSD.ladder.event_mult}`);
}

console.log('[export text is Pine-safe]');
{
  const { text } = buildIvLadderExportText(latest, oi, registry, now);
  const footer = text.trim().split('\n').at(-1);
  ok('same header as the production export', text.startsWith('**VOL & RANGE FORECAST**'));
  ok('EURUSD block has the parsed rows', /──── EURUSD[\s\S]*High to Low range\s*:[\s\S]*Open High \(upside\)/.test(text));
  const bad = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'GOLD', 'NQ', 'RANGE', 'MOVE', 'OPEN HIGH', 'OPEN LOW', 'DRIFT']
    .filter(t => footer.toUpperCase().includes(t));
  ok('footer carries no ticker or row token', bad.length === 0, bad.join(','));
}

console.log(`\n${fails === 0 ? 'ALL PASSED ✓' : fails + ' FAILED ✗'}`);
process.exit(fails === 0 ? 0 : 1);
