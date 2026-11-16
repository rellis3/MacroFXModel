// node js/biasEngine.test.mjs   (plans/BIAS_ENGINE_SPEC.md: thresholds, renormalisation, pair identity, Neutral rules,
// gold's sign conventions, determinism, lookahead)
import assert from 'node:assert/strict';
import { buildBiasRecord, marketView, fillPolicyFallback, band, combine, labelOf, trendD, slopeZ, closedBars, basketIndex, riskScore, unusable, pairFrom, allPairs, rnd,
  CCYS, ASSETS, CCY_WEIGHTS, GOLD_WEIGHTS, TH, RISK_ROLE } from './biasEngine.js';

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  ok ', name); };
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

const ISSUE = '2026-11-13T07:00:00.000Z', ISSUE_MS = Date.parse(ISSUE), DAY = 864e5, H4 = 4 * 3600e3;
const ago = d => new Date(ISSUE_MS - d * DAY).toISOString();

// deterministic random walk with drift; bars end before the issue
function walk(seed, drift, n, durMs, start = 1) {
  let s = seed >>> 0, x = Math.log(start); const out = [], t0 = ISSUE_MS - n * durMs - durMs;
  for (let i = 0; i < n; i++) { s = (1664525 * s + 1013904223) >>> 0; x += drift + ((s / 2 ** 32) - 0.5) * 0.004; out.push({ t: t0 + i * durMs, c: Math.exp(x), complete: true }); }
  return out;
}
function fixture() {
  const names = { EURUSD: [1, 0.002, 1.1], GBPUSD: [2, 0.001, 1.3], AUDUSD: [3, -0.002, 0.65], NZDUSD: [4, -0.003, 0.58], USDJPY: [5, 0.002, 150], USDCAD: [6, 0, 1.38], USDCHF: [7, -0.001, 0.8],
    GOLD: [8, 0.004, 4000], SILVER: [9, 0.003, 50], WTI: [10, -0.004, 60], COPPER: [11, 0.003, 5], NQ: [12, 0.003, 25000], SPX500: [13, -0.001, 6800], US30: [14, 0.001, 47000], US2000: [15, -0.001, 2400], DE30: [16, 0.001, 24000], UK100: [17, 0, 9700] };
  const d1 = {}, h4 = {};
  for (const [k, [seed, dr, p]] of Object.entries(names)) { d1[k] = walk(seed, dr, 120, DAY, p); h4[k] = walk(seed + 100, dr / 6, 200, H4, p); }
  const by = (f) => Object.fromEntries(CCYS.map((c, i) => [c, f(c, i)]));
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

ok('thresholds: band edges are inclusive and symmetric; policy, data, rates, positioning, VIX, HY, trend conflict', () => {
  assert.deepEqual([4.99, 5, 14.99, 15, -5, -15, -4.99].map(x => band(x, TH.policyWeekBp)), [0, 1, 1, 2, -1, -2, 0]);
  assert.deepEqual([0.149, 0.15, 0.5, -0.5].map(x => band(x, TH.data)), [0, 1, 2, -2]);
  assert.equal(band(NaN, TH.data), null);
  const cur = s => buildBiasRecord({ ...fixture(), ...s }).currencies;
  // policy 16bp + hawkish stance -> clamp 2; EUR -6bp, neutral stance -> -1; AUD -20 -> -2; JPY 3 -> 0
  const c = cur({});
  const d = (ccy, k) => c[ccy].drivers.find(x => x.key === k)?.d;
  assert.equal(d('USD', 'policy'), 2); assert.equal(d('EUR', 'policy'), -1); assert.equal(d('AUD', 'policy'), -2); assert.equal(d('JPY', 'policy'), 0); assert.equal(d('CHF', 'policy'), 1);
  // positioning contrarian: EUR 92nd & long -> -2; GBP 20th -> +1; JPY 5th & short -> +2; AUD mid -> 0
  assert.deepEqual(['EUR', 'GBP', 'JPY', 'AUD'].map(x => d(x, 'positioning')), [-2, 1, 2, 0]);
  // data momentum: USD 0.3 -> 1, JPY 0.6 -> 2, AUD -0.55 -> -2, GBP 0.05 -> 0
  assert.deepEqual(['USD', 'JPY', 'AUD', 'GBP'].map(x => d(x, 'data')), [1, 2, -2, 0]);
  // rates: z band + level gap vs the 8 average (2.275): EUR z -1.6 -> -2, gap -0.275 -> 0 => -2; JPY z 1.7 -> 2, gap -1.775 -> -1 => 1
  assert.equal(d('EUR', 'rates'), -2); assert.equal(d('JPY', 'rates'), 1);
  // risk: VIX 85th pct -> -2, term 0.97 -> -1, HY +30bp -> -1
  const r = riskScore({ risk: fixture().risk }, ISSUE_MS, null);
  assert.deepEqual(r.drivers.map(x => [x.key, x.d]), [['vixLevel', -2], ['vixTerm', -1], ['credit', -1]]);
  close(r.score, -4 / 3, 1e-3); assert.equal(r.coverage, 0.75);
  assert.equal(riskScore({ risk: { vixTerm: { ratio: 1.0, asOf: ago(1) } } }, ISSUE_MS, null).drivers[0].d, -2);
  assert.equal(riskScore({ risk: { vixTerm: { ratio: 0.85, asOf: ago(1) } } }, ISSUE_MS, null).drivers[0].d, 1);
  assert.equal(riskScore({ risk: { vix: { pct1y: 19, asOf: ago(1) } } }, ISSUE_MS, null).drivers[0].d, 2);
  // trend: agree strong -> ±2, agree -> ±1, conflict -> 0, H4 missing -> D1 capped at ±1
  assert.deepEqual([trendD(0.7, 0.8), trendD(0.7, 0.2), trendD(0.7, -0.7), trendD(0.1, 0.9), trendD(-0.9, null), trendD(null, 1)], [2, 1, 0, 0, -1, null]);
});

ok('renormalisation: missing drivers drop out, weights rescale, coverage = weight present; n/a drivers are out of the base', () => {
  const c = combine([{ key: 'a', label: 'A', w: 0.25, d: 2 }, { key: 'b', label: 'B', w: 0.20, d: -1 }, { key: 'c', label: 'C', w: 0.55, d: null, why: 'gone' }, { key: 'n', label: 'N', w: 0.05, na: true }]);
  close(c.score, (0.25 * 2 - 0.20) / 0.45, 1e-4); assert.equal(c.coverage, 0.45);
  close(c.drivers.reduce((s, x) => s + x.contrib, 0), c.score, 1e-3);
  assert.deepEqual(c.missing, [{ key: 'c', label: 'C', w: 0.55, why: 'gone' }]);
  // a currency with only policy and data: exactly their weighted mean. NZD has no real-yield series at all (not held:
  // n/a, out of the base 0.90), so coverage = 0.45 / 0.90; dairy is held-but-missing, so it stays in the base
  const inp = { asOf: ISSUE, policy: { NZD: { weekBp: 20, asOf: ago(1) } }, data: { NZD: { score: -0.2, asOf: ago(1) } } };
  const nz = buildBiasRecord(inp).currencies.NZD;
  close(nz.score, (0.25 * 2 + 0.20 * -1) / 0.45, 1e-4); assert.equal(nz.coverage, 0.5);
  assert.ok(nz.missing.some(m => m.key === 'commodity' && /dairy/.test(m.why)));
  const usd = buildBiasRecord({ asOf: ISSUE, policy: { USD: { weekBp: 20, asOf: ago(1) } } }).currencies.USD;
  // USD: no commodity link and no COT contract tracked, both n/a, so its base is 0.90
  close(usd.coverage, rnd(0.25 / 0.90, 3)); assert.equal(usd.score, 2);
  const full = buildBiasRecord(fixture()).currencies;
  for (const k of CCYS) { const s = full[k].drivers.reduce((a, x) => a + x.contrib, 0); close(s, full[k].score, 2e-3); assert.ok(full[k].coverage > 0 && full[k].coverage <= 1); }
  assert.equal(Object.values(CCY_WEIGHTS).reduce((a, b) => a + b, 0).toFixed(10), '1.0000000000');
  assert.equal(Object.values(GOLD_WEIGHTS).reduce((a, b) => a + b, 0).toFixed(10), '1.0000000000');
});

ok('lookahead: inputs published after the issue time or past their age budget are dropped with the reason; future bars ignored', () => {
  assert.equal(unusable(ago(-0.01), ISSUE_MS, 10), 'published after the issue time');
  assert.match(unusable(ago(11), ISSUE_MS, 10), /^stale/);
  assert.equal(unusable(ago(1), ISSUE_MS, 10), null);
  const f = fixture(); f.policy.USD.asOf = ago(-0.1); f.cot.EUR.asOf = ago(30);
  const c = buildBiasRecord(f).currencies;
  assert.equal(c.USD.missing.find(m => m.key === 'policy').why, 'published after the issue time');
  assert.match(c.EUR.missing.find(m => m.key === 'positioning').why, /stale/);
  // a bar that has not closed by the issue time changes nothing
  const g = fixture(), base = JSON.stringify(buildBiasRecord(g));
  for (const k of Object.keys(g.prices.d1)) { g.prices.d1[k].push({ t: ISSUE_MS - 3600e3, c: 9e9, complete: true }); g.prices.h4[k].push({ t: ISSUE_MS - 3600e3, c: 9e9, complete: true }); g.prices.h4[k].push({ t: ISSUE_MS - 8 * 3600e3, c: 1, complete: false }); }
  assert.equal(JSON.stringify(buildBiasRecord(g)), base);
  assert.equal(closedBars([{ t: ISSUE_MS - DAY, c: 1 }, { t: ISSUE_MS - DAY + 1, c: 1 }], ISSUE_MS, DAY).length, 1);
});

ok('pairs: all 28 crosses = (s_base − s_quote) / 2, both legs listed; NZDCHF = −CHFNZD for any pair', () => {
  const rec = buildBiasRecord(fixture()), pairs = allPairs();
  assert.equal(pairs.length, 28); assert.equal(new Set(pairs).size, 28);
  assert.ok(pairs.includes('EURUSD') && pairs.includes('USDJPY') && pairs.includes('NZDCHF') && pairs.includes('GBPJPY') && !pairs.includes('USDEUR'));
  for (const p of pairs) {
    const m = rec.markets[p], [b, q] = [p.slice(0, 3), p.slice(3)];
    close(m.score, (rec.currencies[b].score - rec.currencies[q].score) / 2, 1e-4);
    assert.deepEqual(m.legs, [b, q]);
    assert.ok(m.drivers.some(x => x.leg === b) && m.drivers.some(x => x.leg === q));
    const inv = marketView(rec, q + b);
    assert.equal(inv.score, -m.score, `${q + b}`); assert.equal(inv.strength, m.strength); assert.equal(inv.coverage, m.coverage);
    assert.equal(inv.dir, { BULLISH: 'BEARISH', BEARISH: 'BULLISH', NEUTRAL: 'NEUTRAL' }[m.dir], `${p} ${m.dir} vs ${inv.dir}`);
    close(inv.drivers.reduce((s, x) => s + x.contrib, 0), -m.drivers.reduce((s, x) => s + x.contrib, 0), 1e-9);
  }
  const nc = marketView(rec, 'NZDCHF'), cn = marketView(rec, 'chf/nzd');
  assert.equal(nc.score, -cn.score); assert.equal(cn.market, 'CHFNZD');
  assert.equal(marketView(rec, 'GOLD').market, 'GOLD'); assert.equal(marketView(rec, 'USD').market, 'USD'); assert.equal(marketView(rec, 'EURNOK'), null); assert.equal(marketView(rec, 'XYZ'), null);
  // identity holds with hand-set currency scores too
  const ccys = { NZD: { score: -1, coverage: 0.9, drivers: [{ key: 'p', label: 'P', reading: 'r', contrib: -1 }], missing: [] }, CHF: { score: 0.8, coverage: 0.7, drivers: [{ key: 'p', label: 'P', reading: 'r', contrib: 0.8 }], missing: [] } };
  const a = pairFrom('NZD', 'CHF', ccys), b2 = pairFrom('CHF', 'NZD', ccys);
  assert.equal(a.score, -0.9); assert.equal(b2.score, 0.9); assert.equal(a.dir, 'BEARISH'); assert.equal(b2.dir, 'BULLISH'); assert.equal(a.strength, 5); assert.equal(a.coverage, 0.7);
});

ok('label: strength = round(|s|×5); Neutral when strength ≤ 2, coverage < 0.5, or the top two contributions oppose within 0.1', () => {
  assert.deepEqual(labelOf(1.1, 0.9, [0.6, 0.5]), { dir: 'BULLISH', strength: 6, neutral: null });
  assert.deepEqual(labelOf(-2, 1, [-2]), { dir: 'BEARISH', strength: 10, neutral: null });
  assert.equal(labelOf(0.49, 1, [0.49]).dir, 'NEUTRAL'); assert.equal(labelOf(0.49, 1, [0.49]).strength, 2);
  assert.equal(labelOf(0.5, 1, [0.5]).dir, 'BULLISH'); assert.equal(labelOf(0.5, 1, [0.5]).strength, 3);
  assert.match(labelOf(1.5, 0.49, [1.5]).neutral, /coverage/);
  assert.equal(labelOf(1.5, 0.5, [1.5]).dir, 'BULLISH');
  assert.match(labelOf(0.8, 1, [0.55, -0.5, 0.75]).neutral ?? '', /^$/);         // top two are 0.75 and 0.55: same sign
  assert.match(labelOf(0.8, 1, [0.6, -0.55, 0.3, 0.45]).neutral, /opposite/);       // 0.6 vs -0.55: gap 0.05
  assert.equal(labelOf(0.8, 1, [0.7, -0.55, 0.65]).dir, 'BULLISH');                 // top two 0.7, 0.65 agree
  assert.equal(labelOf(0.8, 1, [0.7, -0.6, 0.7]).dir, 'BULLISH');                   // 0.7 and 0.7 lead
  assert.equal(labelOf(0.8, 1, [0.7, -0.6]).dir, 'BULLISH');                        // gap exactly 0.1 is not < 0.1
  assert.equal(labelOf(0.8, 1, [0.7, -0.61]).dir, 'NEUTRAL');
});

ok('gold: real yield falling +, USD strong −, Fed dovish +, risk-off + (role −0.5), crowded long −, trend', () => {
  const g = f => buildBiasRecord(f).markets.GOLD, dOf = (m, k) => m.drivers.find(x => x.key === k)?.d;
  const f = fixture(), m = g(f);
  assert.equal(dOf(m, 'realYield'), 2);                     // -30bp in 20 days
  f.usReal.chg20bp = 30; assert.equal(dOf(g(f), 'realYield'), -2);
  f.usReal.chg20bp = 10; assert.equal(dOf(g(f), 'realYield'), -1);
  const usd = buildBiasRecord(fixture()).currencies.USD;
  assert.ok(usd.score > 0); assert.equal(dOf(m, 'usd'), -band(usd.score, TH.usdScore));
  assert.ok(dOf(m, 'usd') < 0, 'a stronger dollar is bad for gold');
  assert.equal(dOf(m, 'fedPath'), -2);                      // USD policy +2 (hawkish) -> -2 for gold
  const dov = fixture(); dov.policy.USD.weekBp = -16; dov.stance.USD.score = -0.6; assert.equal(dOf(g(dov), 'fedPath'), 2);
  const risk = buildBiasRecord(fixture()).risk;
  assert.ok(risk.score < 0); assert.equal(dOf(m, 'risk'), band(RISK_ROLE.GOLD * risk.score, TH.roleR));
  assert.ok(dOf(m, 'risk') > 0, 'risk-off is good for gold');
  assert.equal(dOf(m, 'positioning'), -2);                  // 95th pct, net long
  assert.equal(m.drivers.find(x => x.key === 'trend').d, trendD(slopeZ(closedBars(fixture().prices.d1.GOLD, ISSUE_MS, 864e5).map(b => Math.log(b.c))), slopeZ(closedBars(fixture().prices.h4.GOLD, ISSUE_MS, 4 * 3600e3).map(b => Math.log(b.c)))));
  // silver: same model, risk role flips to +0.5
  const s = buildBiasRecord(fixture()).markets.SILVER;
  assert.equal(dOf(s, 'risk'), band(0.5 * risk.score, TH.roleR));
  // indices: falling real yields +, risk-off -, US data momentum +
  const nq = buildBiasRecord(fixture()).markets.NQ;
  assert.equal(dOf(nq, 'rates'), 2); assert.ok(dOf(nq, 'risk') < 0); assert.equal(dOf(nq, 'data'), 1); assert.equal(dOf(nq, 'fedPath'), -2);
});

ok('record: 8 currencies, risk, 28 crosses and 10 assets, each with why / flip; gaps list the missing drivers', () => {
  const rec = buildBiasRecord(fixture());
  assert.equal(rec.version, 'bias-engine-v1'); assert.equal(rec.weights, 'theory-v1'); assert.equal(rec.asOf, ISSUE);
  assert.deepEqual(Object.keys(rec.currencies), CCYS);
  for (const a of ASSETS) assert.ok(rec.markets[a], a);
  assert.equal(Object.keys(rec.markets).length, 28 + ASSETS.length);
  for (const m of [...Object.values(rec.currencies), ...Object.values(rec.markets)]) {
    assert.ok(['BULLISH', 'BEARISH', 'NEUTRAL'].includes(m.dir)); assert.ok(m.strength >= 0 && m.strength <= 10);
    assert.ok(typeof m.why === 'string' && m.why.length > 10); assert.ok(typeof m.flip === 'string' && m.flip.length > 10);
    for (const x of m.drivers) { assert.ok([-2, -1, 0, 1, 2].includes(x.d), `${x.key} d=${x.d}`); assert.ok(x.source); assert.ok('asOf' in x); assert.ok(x.reading); }
  }
  assert.ok(rec.gaps.some(g => /NZD/.test(g) && /dairy/.test(g)));
  assert.ok(rec.gaps.some(g => /WTI/.test(g) && /EIA/.test(g)));
  assert.ok(rec.gaps.some(g => /GBP/.test(g) && /policy expectations/.test(g)));
  assert.equal(rec.ranking.length, 8);
  // nothing at all: every market Neutral, coverage 0, no throw
  const empty = buildBiasRecord({ asOf: ISSUE });
  assert.ok(Object.values(empty.markets).every(m => m.dir === 'NEUTRAL'));
  assert.throws(() => buildBiasRecord({}), /asOf/);
});

ok('determinism: the same inputs give the same record, whatever the key order; nothing reads the clock', () => {
  const a = JSON.stringify(buildBiasRecord(fixture()));
  const f = fixture(), shuffled = Object.fromEntries(Object.entries(f).reverse());
  shuffled.rates = Object.fromEntries(Object.entries(f.rates).reverse());
  shuffled.prices = { h4: f.prices.h4, d1: Object.fromEntries(Object.entries(f.prices.d1).reverse()) };
  const realNow = Date.now; Date.now = () => 0;
  try { assert.equal(JSON.stringify(buildBiasRecord(shuffled)), a); } finally { Date.now = realNow; }
  assert.equal(JSON.stringify(buildBiasRecord(fixture())), a);
  // the basket index is a proper basket: the eight sum to zero at every bar
  const b = basketIndex(fixture().prices.d1, ISSUE_MS, DAY);
  for (let i = 0; i < b.index.USD.length; i += 17) close(CCYS.reduce((s, c) => s + b.index[c][i], 0), 0, 1e-12);
});

ok('policy fallback: futures fresh -> futures; futures stale -> 2y proxy; both unusable -> dropped with both reasons; GBP/NZD via proxy', () => {
  const fut = { USD: { weekBp: 16, horizon: '6m', asOf: ago(1), source: 'futures' }, EUR: { weekBp: -6, horizon: '6m', asOf: ago(12), source: 'futures' }, JPY: { weekBp: 3, asOf: ago(15) } };
  const px = { USD: { weekBp: -9, asOf: ago(1), source: '2y government yield (proxy: FRED DGS2)' }, EUR: { weekBp: 9, asOf: ago(1), source: '2y government yield (proxy: ECB)' },
    GBP: { weekBp: 11, asOf: ago(1), source: '2y government yield (proxy: BoE IUDSNPY)' }, NZD: { weekBp: -17, asOf: ago(2), source: '2y government yield (proxy: RBNZ B2)' },
    JPY: { weekBp: 4, asOf: ago(14), source: 'x' }, CHF: { why: 'only 3 daily 2y points' } };
  const r = fillPolicyFallback(fut, px, ISSUE_MS);
  assert.equal(r.used.USD, 'futures'); assert.equal(r.policy.USD.weekBp, 16); assert.ok(!r.policy.USD.proxy);
  assert.equal(r.used.EUR, 'proxy'); assert.equal(r.policy.EUR.weekBp, 9); assert.equal(r.policy.EUR.proxy, true); assert.match(r.policy.EUR.futuresWhy, /stale/);
  assert.equal(r.used.GBP, 'proxy'); assert.equal(r.used.NZD, 'proxy'); assert.equal(r.policy.GBP.futuresWhy, 'no futures');
  assert.ok(!r.policy.JPY); assert.match(r.why.JPY, /futures: stale \(15 days old\); 2y proxy: stale \(14 days old\)/);
  assert.match(r.why.CHF, /futures: none; 2y proxy: only 3 daily 2y points/);
  assert.match(r.why.CAD, /futures: none; 2y proxy: no data/);
  // a proxy dated after the issue is not used either
  assert.match(fillPolicyFallback({}, { AUD: { weekBp: 5, asOf: ago(-0.2) } }, ISSUE_MS).why.AUD, /published after the issue time/);
  // through the engine: the reading names the proxy, the d uses the same thresholds, gold's Fed path follows it
  const f = fixture(); f.policy = r.policy; f.policyWhy = r.why;
  const rec = buildBiasRecord(f), drv = (c) => rec.currencies[c].drivers.find(x => x.key === 'policy');
  assert.equal(drv('EUR').d, 1); assert.match(drv('EUR').reading, /^2y yield \+9bp over the week \(proxy, futures stale\)/); assert.equal(drv('EUR').proxy, true);
  assert.match(drv('EUR').source, /2y government yield \(proxy: ECB\)/);
  assert.equal(drv('GBP').d, 1); assert.match(drv('GBP').reading, /proxy, futures missing/);
  assert.equal(drv('NZD').d, -2);
  assert.match(drv('USD').reading, /^6m priced \+16bp/); assert.ok(!drv('USD').proxy);
  assert.match(rec.currencies.JPY.missing.find(m => m.key === 'policy').why, /2y proxy: stale/);
  // USD on the proxy: gold's fedPath driver carries it and says so
  const g = fixture(); const r2 = fillPolicyFallback({ USD: { weekBp: 16, asOf: ago(20) } }, px, ISSUE_MS); g.policy = r2.policy; g.policyWhy = r2.why;
  const fed = buildBiasRecord(g).markets.GOLD.drivers.find(x => x.key === 'fedPath');
  assert.equal(fed.proxy, true); assert.match(fed.reading, /2y yield −9bp over the week \(proxy, futures stale\)/);
});

console.log(`biasEngine: ${passed} tests passed`);

ok('not-held series are n/a (out of the coverage base), and dependants read the USD score, not its Neutral label', () => {
  const r = buildBiasRecord({ asOf: ISSUE, policy: { GBP: { weekBp: 20, asOf: ago(1) } } }).currencies.GBP;
  assert.ok(!r.missing.some(m => m.key === 'realYield'), 'GBP real yield is not held: n/a, not missing');
  const u = buildBiasRecord({ asOf: ISSUE }).currencies.USD;
  assert.ok(!u.missing.some(m => m.key === 'positioning'), 'USD has no COT contract tracked: n/a');
  // a USD score below its own call threshold (Neutral label) must still push gold the other way
  const rec = buildBiasRecord(fixture());
  const usd = rec.currencies.USD, gold = rec.markets.GOLD, dUsd = gold.drivers.find(x => x.key === 'usd');
  if (usd.dir === 'NEUTRAL' && Math.abs(usd.score) >= 0.3) assert.ok(dUsd && dUsd.d !== 0, 'gold uses the USD score even when USD is labelled Neutral');
  if (dUsd) assert.equal(Math.sign(dUsd.d), -Math.sign(usd.score) || 0);
});
