// Shared test fixture for js/biasEngineV2*.test.mjs: V1's own test inputs (copied from js/biasEngine.test.mjs, which
// does not export them) plus the extra inputs V2 reads. Deterministic. Not used by any production code.
import { CCYS } from './biasEngine.js';

export const ISSUE = '2026-11-13T07:00:00.000Z', ISSUE_MS = Date.parse(ISSUE), DAY = 864e5, H4 = 4 * 3600e3;
export const ISSUE_DATE = '2026-11-13';
const ago = d => new Date(ISSUE_MS - d * DAY).toISOString();

function walk(seed, drift, n, durMs, start = 1) {
  let s = seed >>> 0, x = Math.log(start); const out = [], t0 = ISSUE_MS - n * durMs - durMs;
  for (let i = 0; i < n; i++) { s = (1664525 * s + 1013904223) >>> 0; x += drift + ((s / 2 ** 32) - 0.5) * 0.004; out.push({ t: t0 + i * durMs, c: Math.exp(x), complete: true }); }
  return out;
}
/** V1's test inputs (js/biasEngine.test.mjs fixture()). */
export function v1Inputs() {
  const names = { EURUSD: [1, 0.002, 1.1], GBPUSD: [2, 0.001, 1.3], AUDUSD: [3, -0.002, 0.65], NZDUSD: [4, -0.003, 0.58], USDJPY: [5, 0.002, 150], USDCAD: [6, 0, 1.38], USDCHF: [7, -0.001, 0.8],
    GOLD: [8, 0.004, 4000], SILVER: [9, 0.003, 50], WTI: [10, -0.004, 60], COPPER: [11, 0.003, 5], NQ: [12, 0.003, 25000], SPX500: [13, -0.001, 6800], US30: [14, 0.001, 47000], US2000: [15, -0.001, 2400], DE30: [16, 0.001, 24000], UK100: [17, 0, 9700] };
  const d1 = {}, h4 = {};
  for (const [k, [seed, dr, p]] of Object.entries(names)) { d1[k] = walk(seed, dr, 120, DAY, p); h4[k] = walk(seed + 100, dr / 6, 200, H4, p); }
  const by = f => Object.fromEntries(CCYS.map((c, i) => [c, f(c, i)]));
  return {
    asOf: ISSUE,
    policy: { USD: { weekBp: 16, horizon: 'm6', asOf: ago(0.5), source: 'test' }, EUR: { weekBp: -6, asOf: ago(0.5) }, JPY: { weekBp: 3, asOf: ago(0.5) }, AUD: { weekBp: -20, asOf: ago(0.5) }, CAD: { weekBp: 0, asOf: ago(0.5) }, CHF: { weekBp: 7, asOf: ago(0.5) } },
    stance: { USD: { score: 0.6, meetingDate: '2026-10-29', asOf: '2026-10-29T18:00:00Z' }, EUR: { score: -0.1, meetingDate: '2026-10-30', asOf: '2026-10-30T13:00:00Z' } },
    rates: by((c, i) => ({ level: [3.6, 2.0, 3.75, 0.5, 3.6, 2.5, 2.25, 0.0][i], z: [0.2, -1.6, 0.6, 1.7, -0.5, -0.4, 0, -1][i], asOf: ago(40) })),
    data: by((c, i) => ({ score: [0.3, -0.2, 0.05, 0.6, -0.55, 0.1, -0.1, 0.0][i], asOf: ago(20) })),
    realYield: { USD: { level: 1.8, z: 1.1, asOf: ago(30) }, EUR: { level: 0.4, z: -0.2, asOf: ago(30) }, CHF: { level: 0.1, z: 0, asOf: ago(30) }, JPY: { level: -1.2, z: 1.5, asOf: ago(30) } },
    usReal: { chg20bp: -30, level: 1.75, asOf: ago(1), source: 'test' },
    cot: { EUR: { pct: 92, share: 12, asOf: ago(5) }, GBP: { pct: 20, share: -3, asOf: ago(5) }, JPY: { pct: 5, share: -20, asOf: ago(5) }, AUD: { pct: 50, share: 1, asOf: ago(5) },
      GOLD: { pct: 95, share: 30, asOf: ago(5) }, NQ: { pct: 40, share: 2, asOf: ago(5) } },
    risk: { vix: { level: 22, pct1y: 85, asOf: ago(0.4) }, vixTerm: { ratio: 0.97, asOf: ago(0.4) }, hy: { chg20bp: 30, level: 3.1, asOf: ago(1.4) } },
    prices: { d1, h4 },
  };
}
/** London weekdays before the issue date, oldest first. */
export function weekdays(n, end = ISSUE_DATE) {
  const out = []; let t = Date.parse(`${end}T12:00:00Z`) - DAY;
  while (out.length < n) { if (new Date(t).getUTCDay() % 6) out.unshift(new Date(t).toISOString().slice(0, 10)); t -= DAY; }
  return out;
}
function rngSeries(seed, n, f) { let s = seed >>> 0; return Array.from({ length: n }, (_, i) => { s = (1664525 * s + 1013904223) >>> 0; return f(i, s / 2 ** 32 - 0.5); }); }
/** Daily risk series ([{ date, value }]): VIX, VIX3M, HY OAS (%), S&P. */
export function riskSeries(n = 420, seed = 7) {
  const ds = weekdays(n);
  let v = 16, h = 3.2, p = 5000;
  const vix = [], vix3m = [], hy = [], spx = [];
  rngSeries(seed, n, (i, u) => {
    v = Math.max(9, v + u * 1.6 + (16 - v) * 0.05); h = Math.max(2.4, h + u * 0.06 + (3.2 - h) * 0.02); p *= Math.exp(0.0003 + u * 0.02);
    vix.push({ date: ds[i], value: +v.toFixed(2) }); vix3m.push({ date: ds[i], value: +(v * 1.08 + 0.5).toFixed(2) }); hy.push({ date: ds[i], value: +h.toFixed(3) }); spx.push({ date: ds[i], value: +p.toFixed(2) });
    return 0;
  });
  return { vix, vix3m, hy, spx };
}
const POLICY = { USD: 4.0, EUR: 2.5, GBP: 4.0, JPY: 1.228, AUD: 4.85, NZD: 2.75, CAD: 2.5, CHF: 0 };
/** One bank's strip: rungs at issue month + 3, + 6, + 12; bp priced and 4-week change per rung. */
export function strip(ccy, { kind = '3m', bp = [10, 20, 30], chg = [0, 0, 0], date = '2026-11-12', date4wAgo = '2026-10-15', months = ['202702', '202705', '202711'] } = {}) {
  return { kind, source: `test ${ccy}`, rungs: months.map((m, i) => ({ local: `${ccy}${m}`, month: m, rate: POLICY[ccy] + bp[i] / 100, date, rate4wAgo: POLICY[ccy] + (bp[i] - chg[i]) / 100, date4wAgo })) };
}
export function scorecardRow(scores, asOf) { return { dims: { ...scores }, asOf: { ...asOf } }; }
/** The full V2 snapshot. */
export function snapshot(over = {}) {
  const ds = weekdays(60);
  const y2pts = (lvl, slope) => ds.map((d, i) => ({ date: d, value: +(lvl + slope * i).toFixed(4) }));
  const sc = (g, inf, lab, dem) => scorecardRow({ gdp: g, ism: g, cpi: inf, laborMarket: lab, retailSales: dem, consumerConfidence: dem },
    { gdp: '2026-07-01', ism: '2026-10-01', cpi: '2026-10-01', laborMarket: '2026-10-01', retailSales: '2026-07-01', consumerConfidence: '2026-10-01' });
  return {
    v1: v1Inputs(),
    extra: {
      policyRates: { fetchedAt: ago(0.3), rates: Object.fromEntries(Object.entries(POLICY).map(([c, r]) => [c, { rate: r, asOf: '2026-11-01' }])) },
      futures: { asOf: ago(0.6), banks: {
        USD: strip('USD', { kind: '1m', bp: [33, 54, 64], chg: [-1, -8, -14] }), EUR: strip('EUR', { bp: [19, 42, 63], chg: [-1, -2, -7] }), GBP: strip('GBP', { bp: [27, 58, 84], chg: [-2, -5, -10] }),
        CHF: strip('CHF', { bp: [-1, 16, 49], chg: [0, 2, 3] }), CAD: strip('CAD', { bp: [27, 47, 73], chg: [-1, -7, -9] }), AUD: strip('AUD', { kind: '1m', bp: [4, 4, -13], chg: [-1, 1, 6] }),
        JPY: strip('JPY', { bp: [22, 42, 64], chg: [0, -2, -3] }) } },
      y2: Object.fromEntries(Object.entries({ USD: [4.3, 0.001], EUR: [2.6, 0.0005], GBP: [4.1, -0.001], JPY: [1.3, 0.002], AUD: [4.7, -0.002], NZD: [2.9, -0.003], CAD: [2.6, 0], CHF: [0.2, 0] })
        .map(([c, [l, s]]) => [c, { points: y2pts(l, s), source: 'test' }])),
      riskSeries: riskSeries(),
      scorecard: { USD: sc(0.3, 0.4, 0.2, 0.3), EUR: sc(-0.2, 0.1, -0.1, -0.3), GBP: sc(0.1, 0.5, -0.2, 0.0), JPY: sc(0.6, 0.3, 0.5, 0.4),
        AUD: sc(-0.5, -0.2, -0.6, -0.4), NZD: sc(0.1, 0, 0.2, 0.1), CAD: sc(-0.1, 0.1, -0.2, 0), CHF: sc(0, -0.1, 0.1, 0) },
      riskGate: { pass: true, checks: { note: 'test' } },
      ...over,
    },
  };
}
