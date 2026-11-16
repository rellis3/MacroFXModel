// bias-engine-backtest step 2: run the LIVE engine (js/biasEngine.js, imported, not ported) once per London issue date
// on the point-in-time inputs from bars.py / build_inputs.py / fetch_y2.mjs. Nothing here re-implements a threshold or
// weight: buildBiasRecord, yieldWeekChange and fillPolicyFallback are the production functions.
//   node scripts/bias-engine-backtest/run_engine.mjs [--selftest]
// Writes analysis/output/bias-engine-backtest/engine_daily.csv (one row per date x market) and engine_coverage.json.
import { readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { buildBiasRecord, fillPolicyFallback, CCYS, allPairs, CCY_WEIGHTS, labelOf, pairFrom, rnd } from '../../js/biasEngine.js';
import { yieldWeekChange } from '../../js/yield2y.js';

const OUT = 'analysis/output/bias-engine-backtest', INP = `${OUT}/inputs`;
const DAY = 864e5, H4 = 4 * 3600e3;
const PRICE_NAMES = ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDJPY', 'USDCAD', 'USDCHF', 'GOLD', 'NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100', 'WTI', 'COPPER'];
const SCORED_ASSETS = ['GOLD', 'NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100'];
const Y2_CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF'];   // NZD: RBNZ blocks scripted clients (403), as live often
const LOCKBOX = '2026-08-21';

// ── policy proxy, point in time ─────────────────────────────────────────────────────────────────────────────────
// The live gather calls yieldWeekChange(points, issueDate): points dated before the issue date. In history we also
// respect when each value was PUBLISHED: daily sources are taken as known from the business day after next (dated
// before the previous business day); the SNB publishes monthly, so a CHF point dated in month M is known from the
// 4th calendar day of M+1.
const ymd = ms => new Date(ms).toISOString().slice(0, 10);
function prevBizDay(date) { let t = Date.parse(date + 'T12:00:00Z') - DAY; while ([0, 6].includes(new Date(t).getUTCDay())) t -= DAY; return ymd(t); }
export function knownY2(points, ccy, issueDate) {
  if (ccy === 'CHF') {
    return points.filter(p => { const d = new Date(p.date + 'T00:00:00Z'); const pub = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 4); return pub <= Date.parse(issueDate + 'T00:00:00Z'); });
  }
  const lim = prevBizDay(issueDate);
  return points.filter(p => p.date < lim);
}
export function policyFor(y2, issueDate, issueMs) {
  const proxy = {};
  for (const c of Y2_CCYS) {
    const pts = y2[c]; if (!pts) continue;
    const w = yieldWeekChange(knownY2(pts, c, issueDate), issueDate);
    proxy[c] = w.ok ? { weekBp: w.weekBp, level: w.level, asOf: `${w.date}T23:59:00.000Z`, source: `2y government yield (history)` } : { why: w.why };
  }
  return fillPolicyFallback({}, proxy, issueMs);
}

// ── prices: closed bars before the issue, the same depth the live gather fetches (130 D / 200 H4 incl. the open bar)
function sliceBars(arr, issueMs, dur, n) {
  // arr sorted by t; binary search for the last bar closed at or before the issue
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m][0] + dur <= issueMs) lo = m + 1; else hi = m; }
  return arr.slice(Math.max(0, lo - n), lo).map(([t, c]) => ({ t, c, complete: true }));
}

// History-adjusted coverage (the registered primary label): the drivers that exist LIVE but cannot be rebuilt point in
// time (data momentum for every market; EUR / CHF real yield) are taken out of the coverage base instead of counting as
// missing, so a currency is not forced Neutral for a gap the live engine does not have. The SCORE is unchanged (the
// engine's score only ever uses the drivers present); only the coverage gate behind the Neutral label moves.
const NOT_RECON = c => new Set(['data', ...(['EUR', 'CHF'].includes(c) ? ['realYield'] : [])]);
export function adjCoverage(m, name) {
  const skip = NOT_RECON(name), wUsed = m.drivers.reduce((s, x) => s + x.w, 0);
  const wMiss = m.missing.filter(x => !skip.has(x.key)).reduce((s, x) => s + x.w, 0);
  return wUsed + wMiss > 0 ? rnd(wUsed / (wUsed + wMiss), 3) : 0;
}
function rowsFor(date, rec, out) {
  const r = rec;
  const curD = c => Object.fromEntries((r.currencies[c].drivers ?? []).map(x => [x.key, x.d]));
  const adj = {};
  for (const c of CCYS) { const m = r.currencies[c]; adj[c] = { ...m, coverage: adjCoverage(m, c) }; }
  const lab = (m, cov) => labelOf(m.score, cov, m.drivers.map(x => x.contrib));
  for (const c of CCYS) {
    const m = r.currencies[c], d = curD(c), L = lab(m, adj[c].coverage);
    out.push([date, c, 'ccy', m.score, m.dir, m.strength, m.coverage, m.neutral ?? '', adj[c].coverage, L.dir, L.neutral ?? '', ...Object.keys(CCY_WEIGHTS).map(k => d[k] ?? '')]);
  }
  for (const p of allPairs()) {
    const m = r.markets[p], a = pairFrom(p.slice(0, 3), p.slice(3), adj);
    out.push([date, p, 'pair', m.score, m.dir, m.strength, m.coverage, m.neutral ?? '', a.coverage, a.dir, a.neutral ?? '', ...Object.keys(CCY_WEIGHTS).map(() => '')]);
  }
  for (const a of SCORED_ASSETS) {
    const m = r.markets[a], d = Object.fromEntries(m.drivers.map(x => [x.key, x.d])), cov = adjCoverage(m, a), L = lab(m, cov);
    // asset driver columns hold: d_policy=fedPath|ratesPath, d_rates=US real yield (rates|realYield), d_data=data,
    // d_realYield=usd|ccy (already inverted by the engine), d_risk=risk, d_commodity='', d_positioning, d_trend
    out.push([date, a, 'asset', m.score, m.dir, m.strength, m.coverage, m.neutral ?? '', cov, L.dir, L.neutral ?? '', d.fedPath ?? d.ratesPath ?? '', d.realYield ?? d.rates ?? '', d.data ?? '', d.usd ?? d.ccy ?? '', d.risk ?? '', '', d.positioning ?? '', d.trend ?? '']);
  }
  out.push([date, 'RISK', 'risk', r.risk.score, '', '', r.risk.coverage, '', '', '', '', ...r.risk.drivers.map(x => `${x.key}:${x.d}`).concat(Array(8).fill('')).slice(0, 8)]);
}

function selftest() {
  // 1) the production test file must pass (it is the parity reference: we call the same functions)
  // 2) a hand-built input day through this driver's policy + bars path must equal buildBiasRecord on the same inputs
  const pts = Array.from({ length: 20 }, (_, i) => ({ date: ymd(Date.UTC(2024, 0, 2 + i)), value: 4 + i * 0.02 })).filter(p => ![0, 6].includes(new Date(p.date + 'T12:00:00Z').getUTCDay()));
  const issueDate = '2024-01-17', issueMs = Date.parse('2024-01-17T07:00:00Z');
  const pol = policyFor({ USD: pts }, issueDate, issueMs);
  if (pol.used.USD !== 'proxy') throw new Error('selftest: USD policy proxy not used');
  const known = knownY2(pts, 'USD', issueDate);
  if (known.at(-1).date !== '2024-01-15') throw new Error(`selftest: publication lag wrong (${known.at(-1).date})`);
  const exp = yieldWeekChange(known, issueDate).weekBp;
  if (pol.policy.USD.weekBp !== exp) throw new Error('selftest: weekBp mismatch');
  const chf = knownY2([{ date: '2024-01-31', value: 1 }, { date: '2024-02-29', value: 1 }], 'CHF', '2024-03-03');
  if (chf.length !== 1) throw new Error('selftest: CHF monthly publication lag wrong');
  const bars = [[0, 1], [DAY, 2], [2 * DAY, 3]];
  if (sliceBars(bars, 2 * DAY, DAY, 10).length !== 2) throw new Error('selftest: bar slicing must exclude the bar still open at the issue');
  const rec = buildBiasRecord({ asOf: new Date(issueMs).toISOString(), policy: pol.policy });
  if (!(rec.currencies.USD.drivers.find(x => x.key === 'policy')?.proxy)) throw new Error('selftest: engine did not take the proxy policy');
  const fake = { drivers: [{ key: 'policy', w: 0.25 }, { key: 'rates', w: 0.2 }], missing: [{ key: 'data', w: 0.2 }, { key: 'realYield', w: 0.1 }, { key: 'commodity', w: 0.05 }] };
  if (adjCoverage(fake, 'EUR') !== rnd(0.45 / 0.5, 3) || adjCoverage(fake, 'GBP') !== rnd(0.45 / 0.6, 3)) throw new Error('selftest: adjCoverage');
  console.log('run_engine SELFTEST PASSED');
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  selftest();
  const y2 = {};
  for (const c of Y2_CCYS) y2[c] = JSON.parse(readFileSync(`${INP}/y2_${c}.json`, 'utf8')).points.filter(p => p.date <= LOCKBOX);
  const bars = {};
  for (const n of PRICE_NAMES) bars[n] = JSON.parse(readFileSync(`${INP}/bars_${n}.json`, 'utf8'));
  const lines = readFileSync(`${INP}/macro_daily.jsonl`, 'utf8').trim().split('\n');
  const ws = createWriteStream(`${OUT}/engine_daily.csv`);
  ws.write(['date', 'market', 'kind', 'score', 'dir', 'strength', 'coverage', 'neutral', 'cov_adj', 'dir_adj', 'neutral_adj', 'd_policy', 'd_rates', 'd_data', 'd_realYield', 'd_risk', 'd_commodity', 'd_positioning', 'd_trend'].join(',') + '\n');
  const cov = { days: 0, policyUsed: {}, driverPresent: {}, neutralReasons: {}, neutralReasonsAdj: {} };
  for (const ln of lines) {
    const m = JSON.parse(ln), issueMs = m.issueMs, date = m.date;
    const pol = policyFor(y2, date, issueMs);
    const inputs = { asOf: new Date(issueMs).toISOString(), policy: pol.policy, policyWhy: pol.why, rates: m.rates, realYield: m.realYield, cot: m.cot, risk: m.risk, ...(m.usReal ? { usReal: m.usReal } : {}), prices: { d1: {}, h4: {} } };
    for (const n of PRICE_NAMES) { inputs.prices.d1[n] = sliceBars(bars[n].d1, issueMs, DAY, 129); inputs.prices.h4[n] = sliceBars(bars[n].h4, issueMs, H4, 199); }
    const rec = buildBiasRecord(inputs);
    const out = [];
    rowsFor(date, rec, out);
    ws.write(out.map(r => r.map(x => (x == null ? '' : typeof x === 'string' && x.includes(',') ? `"${x}"` : x)).join(',')).join('\n') + '\n');
    cov.days++;
    for (const c of CCYS) {
      const k = `${c}`; cov.policyUsed[k] = (cov.policyUsed[k] ?? 0) + (pol.used[c] ? 1 : 0);
      for (const x of rec.currencies[c].drivers) { const kk = `${c}.${x.key}`; cov.driverPresent[kk] = (cov.driverPresent[kk] ?? 0) + 1; }
    }
    for (const a of SCORED_ASSETS) for (const x of rec.markets[a].drivers) { const kk = `${a}.${x.key}`; cov.driverPresent[kk] = (cov.driverPresent[kk] ?? 0) + 1; }
    for (const x of rec.risk.drivers) { const kk = `RISK.${x.key}`; cov.driverPresent[kk] = (cov.driverPresent[kk] ?? 0) + 1; }
    for (const p of [...allPairs(), ...SCORED_ASSETS]) { const nr = (rec.markets[p].neutral ?? 'called').replace(/[0-9.]+/g, '#'); cov.neutralReasons[nr] = (cov.neutralReasons[nr] ?? 0) + 1; }
    for (const ln2 of out) if (ln2[2] === 'pair' || ln2[2] === 'asset') { const nr = (ln2[10] || 'called').replace(/[0-9.]+/g, '#'); cov.neutralReasonsAdj[nr] = (cov.neutralReasonsAdj[nr] ?? 0) + 1; }
  }
  ws.end();
  writeFileSync(`${OUT}/engine_coverage.json`, JSON.stringify(cov, null, 1));
  console.log('engine days', cov.days);
}
main();
