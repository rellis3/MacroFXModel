// node js/biasEngineV2.test.mjs   (plans/BIAS_ENGINE_V2_SPEC.md §6.1, acceptance tests A1-A21)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBiasRecord, CCYS, allPairs } from './biasEngine.js';
import {
  buildVariant, buildV2Record, VARIANTS, SWITCHES, C2, CONFIG, CONFIG_HASH, canonicalJson, sha256, phaseOf, obsEndOf, ageDaysOf, freshness, unusableF1,
  riskFactorAt, futuresReading, pickRung, y2Reading, dataF1, removeLookahead, cadenceOfDim,
} from './biasEngineV2.js';
import { snapshot, strip, riskSeries, ISSUE_DATE, DAY } from './biasEngineV2.fixture.mjs';
import { biasEngineV2 as biasEngineV2Views } from './biasForecasters.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// file hashes ignore line endings: Windows checkouts (core.autocrlf) turn LF into CRLF, which is not a change
const fileSha = rel => sha256(fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'));
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  ok ', name); };
const near = (a, b, eps = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} != ${b}`);
const ON = sw => Object.fromEntries(SWITCHES.map(s => [s, sw.includes(s)]));

ok('A1 all switches off reproduce V1 exactly (every currency, cross and asset)', () => {
  const snap = snapshot(), v1 = buildBiasRecord(snap.v1), v = buildVariant(snap, VARIANTS.v1r);
  for (const k of CCYS) for (const f of ['score', 'dir', 'strength', 'coverage']) assert.equal(v.currencies[k][f], v1.currencies[k][f], `${k}.${f}`);
  for (const k of Object.keys(v1.markets)) for (const f of ['score', 'dir', 'strength', 'coverage']) assert.equal(v.markets[k][f], v1.markets[k][f], `${k}.${f}`);
  assert.equal(v.risk.score, v1.risk.score);
  // and with V1's edge cases: stale policy, missing COT universe, no risk
  const s2 = snapshot(); s2.v1.policy.USD.asOf = new Date(Date.parse(s2.v1.asOf) - 30 * DAY).toISOString(); delete s2.v1.risk;
  const a = buildBiasRecord(s2.v1), b = buildVariant(s2, VARIANTS.v1r);
  for (const k of Object.keys(a.markets)) assert.equal(b.markets[k].score, a.markets[k].score, k);
});

ok('A2 determinism: the same snapshot gives a byte-identical record', () => {
  assert.equal(canonicalJson(buildV2Record(snapshot())), canonicalJson(buildV2Record(snapshot())));
});

ok('A3 lookahead: readings dated on or after the issue are removed and change nothing', () => {
  const clean = buildV2Record(snapshot()), dirty = snapshot();
  dirty.extra.riskSeries.vix.push({ date: ISSUE_DATE, value: 80 });
  dirty.extra.y2.NZD.points.push({ date: '2026-11-20', value: 9 });
  const r = buildV2Record(dirty);
  assert.equal(r.snapshot.removedLookahead.length, 2);
  for (const id of Object.keys(VARIANTS)) assert.equal(canonicalJson(r.variants[id].markets), canonicalJson(clean.variants[id].markets), id);
});

ok('A4 one snapshot: one hash for the whole record, from the canonical snapshot', () => {
  const s = snapshot(), r = buildV2Record(s);
  assert.equal(r.snapshot.sha256, sha256(canonicalJson(s)));
  assert.equal(Object.keys(r.variants).length, 12);
});

ok('A5 pair antisymmetry: S(q,b) = −S(b,q) exactly, direction and features flip, every variant and all 28 crosses', () => {
  const snap = snapshot();
  for (const [id, sw] of Object.entries(VARIANTS)) {
    const v = buildVariant(snap, sw);
    for (const p of allPairs()) {
      const b = p.slice(0, 3), q = p.slice(3), x = v.pairOf(b, q), y = v.pairOf(q, b);
      assert.ok(x.score === -y.score || (x.score == null && y.score == null), `${id} ${p} ${x.score} ${y.score}`);
      const flip = { BULLISH: 'BEARISH', BEARISH: 'BULLISH', NEUTRAL: 'NEUTRAL' };
      assert.equal(y.dir, flip[x.dir], `${id} ${p} dir`);
      assert.equal(x.strength, y.strength);
      if (x.pairFeatures) for (const k of ['carryGapPp', 'expectedGapBp', 'expectedChgBp', 'y2GapPp']) assert.ok(x.pairFeatures[k] === -y.pairFeatures[k] || (x.pairFeatures[k] == null && y.pairFeatures[k] == null), `${id} ${p} ${k}`);
    }
  }
});

ok('A6 F3 isolation: random stance and COT never move a score, direction, strength or agreement under F3', () => {
  const base = buildVariant(snapshot(), VARIANTS.v2);
  let s = 12345;
  const r = () => { s = (1664525 * s + 1013904223) >>> 0; return s / 2 ** 32; };
  for (let k = 0; k < 200; k++) {
    const snap = snapshot();
    for (const c of CCYS) { snap.v1.stance[c] = { score: r() * 2 - 1, meetingDate: '2026-11-01', asOf: '2026-11-01T12:00:00Z' }; snap.v1.cot[c] = { pct: r() * 100, share: r() * 40 - 20, asOf: snap.v1.cot.EUR.asOf }; }
    const v = buildVariant(snap, VARIANTS.v2);
    for (const m of Object.keys(base.markets)) for (const f of ['score', 'dir', 'strength', 'agreement']) assert.equal(v.markets[m][f], base.markets[m][f], `${m}.${f}`);
  }
});

ok('A7 switch locality: each switch changes only the drivers it owns', () => {
  const snap = snapshot(), v1r = buildVariant(snap, VARIANTS.v1r);
  const owns = { F1: ['data'], F2: ['rates', 'carry'], F3: ['policy', 'positioning'], F4: ['risk'], F5: ['policy', 'repricing'] };
  for (const s of SWITCHES) {
    const v = buildVariant(snap, VARIANTS[`v1r+${s}`]);
    for (const c of CCYS) {
      const dOf = (rec, k) => rec.currencies[c].drivers.find(x => x.key === k && !x.bilateral)?.d ?? null;
      for (const k of ['policy', 'rates', 'data', 'realYield', 'risk', 'commodity', 'positioning', 'trend']) if (!owns[s].includes(k)) assert.equal(dOf(v, k), dOf(v1r, k), `${s} changed ${c}.${k}`);
    }
  }
});

ok('A8 carry: AUD 4.85% vs JPY 1.228% is +3.622 pp and +2 for AUDJPY, −2 for JPYAUD; equal rates give 0; monotone', () => {
  const v = buildVariant(snapshot(), ON(['F2']));
  const c = m => m.drivers.find(x => x.key === 'carry');
  assert.equal(c(v.markets.AUDJPY).d, 2); assert.equal(c(v.pairOf('JPY', 'AUD')).d, -2);
  near(v.markets.AUDJPY.pairFeatures.carryGapPp, 3.622, 1e-9);
  assert.equal(c(v.markets.EURCAD).d, 0);                          // 2.5 vs 2.5
  const snap = snapshot(); let last = -Infinity;
  for (const r of [0, 1, 2, 2.5, 3, 4, 5]) { snap.extra.policyRates.rates.EUR.rate = r; const d = c(buildVariant(snap, ON(['F2'])).markets.EURUSD).d; assert.ok(d >= last); last = d; }
});

ok('A9 repricing: USD +54/−8, EUR +42/−2 -> EURUSD 0.00; equal levels, base +25 bp change -> +0.5; proxy flagged', () => {
  const v = buildVariant(snapshot(), ON(['F5'])), r = v.markets.EURUSD.drivers.find(x => x.key === 'repricing');
  near(r.d, 0, 1e-9, 'EURUSD');
  near(v.markets.EURUSD.pairFeatures.expectedGapBp, -12, 1e-6); near(v.markets.EURUSD.pairFeatures.expectedChgBp, 6, 1e-6);
  const s = snapshot(); s.extra.futures.banks.EUR = strip('EUR', { bp: [27, 47, 73], chg: [0, 25, 0] }); s.extra.futures.banks.CAD = strip('CAD', { bp: [27, 47, 73], chg: [0, 0, 0] });
  const w = buildVariant(s, ON(['F5'])).markets.EURCAD.drivers.find(x => x.key === 'repricing');
  near(w.d, 0.5, 1e-9); near(w.components.level + w.components.change, w.contrib, 2e-4);
  const nz = buildVariant(snapshot(), ON(['F5'])).markets.NZDUSD.drivers.find(x => x.key === 'repricing');
  assert.equal(nz.proxy, true); assert.equal(nz.mixedSource, true);
});

ok('A10 risk factor: mirrored inputs give −F; drift alone gives no lean; fewer than 3 inputs -> missing', () => {
  const s = riskSeries(), F = riskFactorAt(s, ISSUE_DATE).score;
  const mir = { vix: s.vix.map(p => ({ ...p, value: 400 / p.value })), vix3m: s.vix3m.map((p, i) => ({ ...p, value: (400 / s.vix[i].value) / (2 - s.vix[i].value / p.value) })),
    hy: s.hy.map(p => ({ ...p, value: 8 - p.value })), spx: s.spx.map(p => ({ ...p, value: 1e7 / p.value })) };
  near(riskFactorAt(mir, ISSUE_DATE).score, -F, 2e-4);
  // drift: average F over 150 dates of a strongly drifting S&P with noise stays near zero
  const drift = riskSeries(700, 11), dates = drift.spx.slice(-150).map(p => p.date);
  const fs = dates.map(d => riskFactorAt({ ...drift, spx: drift.spx.map((p, i) => ({ ...p, value: p.value * Math.exp(0.002 * i) })) }, d).score).filter(x => x != null);
  assert.ok(Math.abs(fs.reduce((a, x) => a + x, 0) / fs.length - dates.map(d => riskFactorAt(drift, d).score).reduce((a, x) => a + x, 0) / dates.length) < 0.05, 'a pure drift changes F');
  assert.equal(riskFactorAt({ vix: s.vix, vix3m: s.vix3m }, ISSUE_DATE).score, null);
});

ok('A11 freshness: period-end dating, oldest input, per-input budgets, f falls with age', () => {
  const t = Date.parse('2026-11-18T07:00:00Z');
  assert.equal(new Date(obsEndOf('2026-10-01', 'monthly', t).obsEndMs).toISOString().slice(0, 10), '2026-10-31');
  const q2 = ageDaysOf('2026-04-01', 'quarterly', t), q1 = ageDaysOf('2026-01-01', 'quarterly', t);
  assert.ok(q2 > 140 && q2 < 141); assert.equal(freshness(q2, 'quarterly'), 1);
  assert.ok(q1 > 231 && q1 < 232); near(freshness(q1, 'quarterly'), 0.5 ** ((q1 - 152) / 120), 1e-12); assert.equal(unusableF1('2026-01-01', 'quarterly', t), null);
  assert.match(unusableF1('2025-12-01', 'monthly', t), /stale/);
  assert.equal(obsEndOf('2026-11-01', 'monthly', t).partial, true);          // a month not yet over
  // the data driver keeps fresh dimensions and drops a stale one on its own
  const snap = snapshot(); snap.extra.scorecard.USD.asOf.gdp = '2025-07-01';
  const x = dataF1('USD', snap.extra, Date.parse(snap.v1.asOf));
  assert.ok(x.used.every(u => u.dim !== 'gdp')); assert.ok(Number.isFinite(x.score));
  let prev = 2; for (const a of [10, 80, 120, 200, 300]) { const f = freshness(a, 'monthly'); assert.ok(f <= prev && f >= 0 && f <= 1); prev = f; }
  assert.equal(cadenceOfDim('retailSales', 'USD'), 'monthly'); assert.equal(cadenceOfDim('retailSales', 'GBP'), 'quarterly');
});

ok('A12 the twelve variants and their switch sets', () => {
  assert.deepEqual(Object.keys(VARIANTS).sort(), ['v1r', 'v2', ...SWITCHES.map(s => `v2-no${s}`), ...SWITCHES.map(s => `v1r+${s}`)].sort());
  for (const s of SWITCHES) { assert.equal(VARIANTS[`v2-no${s}`][s], false); assert.equal(Object.values(VARIANTS[`v1r+${s}`]).filter(Boolean).length, 1); }
});

ok('A13 V1 untouched: js/biasEngine.js matches its pinned hash', () => {
  assert.equal(fileSha('js/biasEngine.js'), 'b704c67d12c63634b0608e6e1e3d25c69749689c811833c8674a1e860b685e28',
    'js/biasEngine.js changed: V1 is the production control and must stay untouched (spec G1)');
});

ok('A14 no production reads: only V2\'s own files, its server section, its panel and the scoreboard mention V2', () => {
  const allowed = new Set(['js/biasEngineV2.js', 'js/biasEngineV2.test.mjs', 'js/biasEngineV2.econ.test.mjs', 'js/biasEngineV2.fixture.mjs', 'server.js', 'js/biasForecasters.js',
    'js/terminal/biasEngineV2View.js', 'js/terminal/biasEngineV2View.test.mjs', 'js/terminal/terminalTabs.js', 'js/terminal/tabRegistry.js', 'js/deskAccess.js', 'js/serviceFlags.js', 'js/storeRegistry.js', 'js/deskSnapshot.js', 'kv.js', '_worker.js', 'desk-terminal.html', 'js/biasForecasters.test.mjs',
    // owner 2026-11-22: V2 sits next to V1 in the Desk Bias Process head to head (scoring display only, not a consumer of its calls)
    'js/deskBiasH2H.js', 'js/deskBiasH2H.test.mjs', 'js/terminal/deskBiasProcessView.js',
    // 2026-11-23: the hourly "Through the day" re-run of V2's own panel (display only, produces V2's intraday record, read by the V2 view); not a production consumer
    'js/biasIntraday.js', 'js/biasIntraday.test.mjs']);
  const hits = [];
  const walkDir = d => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
    const rel = path.join(d, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.git', 'analysis', 'plans', 'forge', 'MD files', 'scripts'].includes(e.name) && !e.name.startsWith('.')) walkDir(rel); continue; }
    if (!/\.(m?js|html)$/.test(e.name)) continue;
    const t = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if (/biasEngineV2|bias_engine_v2|bias-engine-v2/.test(t)) hits.push(rel.replace(/\\/g, '/'));
  } };
  walkDir('.');
  const bad = hits.map(h => h.replace(/^\.\//, '')).filter(h => !allowed.has(h));
  assert.deepEqual(bad, [], 'V2 is referenced outside its allowed files (production consumers must not read it)');
});

ok('A15 constants: the frozen table (spec §4.9) equals the code', () => {
  assert.deepEqual({ ...C2.budgets }, { daily: 10, weekly: 21, monthly: 110, quarterly: 245, meeting: 120 });
  assert.deepEqual({ ...C2.expected }, { daily: 1, weekly: 10, monthly: 76, quarterly: 152, meeting: 45 });
  assert.deepEqual({ ...C2.halfLife }, { daily: 3, weekly: 10, monthly: 45, quarterly: 120, meeting: 45 });
  assert.equal(C2.carryScalePp, 1.0); assert.equal(C2.risk.window, 252); assert.equal(C2.risk.zClip, 3); assert.equal(C2.risk.minInputs, 3);
  assert.deepEqual([C2.riskGate.corrPC1, C2.riskGate.meanAbs, ...C2.riskGate.posShare, C2.riskGate.coverage], [0.90, 0.10, 0.40, 0.60, 0.95]);
  const R = C2.repricing;
  assert.deepEqual([R.rungMonths, R.rungTolMonths, R.futuresMaxAgeBd, ...R.win4wDays, R.minDeliveryMonths, R.maxAbsChgBp, R.levelScaleBp, R.chgScaleBp, ...R.mix, R.y2LevelFactor, R.y2ChgBd],
    [6, 1, 3, 20, 35, 3, 150, 50, 25, 0.5, 0.5, 0.5, 20]);
  assert.equal(C2.basketMin, 4); assert.equal(C2.familyMin, 0.02); assert.equal(C2.confidenceMinDays, 120);
  const spec = fs.readFileSync(path.join(ROOT, 'plans/BIAS_ENGINE_V2_SPEC.md'), 'utf8');
  for (const s of ['10 / 21 / 110 / 245 d', '1 / 10 / 76 / 152 d', '3 / 10 / 45 / 120 d', '1.0 pp per unit', '6 m, ±1 month, 3 bd', '20–35 cd, 3 months, 150 bp', '50 bp, 25 bp, 0.5 / 0.5', '4 of the other 7']) assert.ok(spec.includes(s), `spec table lacks ${s}`);
});

ok('A16 schema: every market in every variant carries the separate output fields', () => {
  const r = buildV2Record(snapshot());
  for (const [id, v] of Object.entries(r.variants)) for (const [k, m] of [...Object.entries(v.markets), ...Object.entries(v.currencies)]) {
    for (const f of ['direction', 'score', 'strength', 'confidence', 'dataQuality', 'support', 'coverage', 'drivers', 'context']) assert.ok(f in m, `${id} ${k} lacks ${f}`);
    assert.equal(m.confidence.status, 'uncalibrated');
    assert.ok(m.dataQuality >= 0 && m.dataQuality <= 1, `${id} ${k} quality ${m.dataQuality}`);
    for (const x of m.drivers) assert.ok(x.family, `${id} ${k} ${x.key} has no family`);
  }
});

ok('A17 contributions sum to the score (repricing components included)', () => {
  const r = buildV2Record(snapshot());
  for (const [id, v] of Object.entries(r.variants)) for (const [k, m] of Object.entries(v.markets)) {
    if (m.score == null) continue;
    near(m.drivers.reduce((s, x) => s + x.contrib, 0), m.score, 2e-3, `${id} ${k}`);
    for (const x of m.drivers) if (x.components) near(x.components.level + x.components.change, x.contrib, 2e-4, `${id} ${k} components`);
  }
});

ok('A18 pairs never come from currency views: a third currency moves the views, not the pair', () => {
  const a = buildVariant(snapshot(), VARIANTS.v2), s = snapshot();
  s.extra.policyRates.rates.CAD.rate = 6; s.extra.futures.banks.CAD = strip('CAD', { bp: [80, 120, 150], chg: [10, 40, 20] });
  const b = buildVariant(s, VARIANTS.v2);
  assert.equal(b.markets.EURUSD.score, a.markets.EURUSD.score);
  assert.notEqual(b.currencies.EUR.score, a.currencies.EUR.score);
});

ok('A19 roll and continuity: C2, C4, C6 fail to the proxy; the chosen rung changes contract with no spliced jump', () => {
  const bank = strip('EUR', { bp: [19, 42, 63], chg: [-1, -2, -7] });
  assert.equal(futuresReading(bank, 2.5, ISSUE_DATE).ok, true);
  const old = structuredClone(bank); old.rungs[1].date4wAgo = '2026-10-03';
  assert.match(futuresReading(old, 2.5, ISSUE_DATE).why, /^C2/);
  const near6 = structuredClone(bank); near6.rungs = near6.rungs.map(r => ({ ...r, month: '202701' }));
  assert.equal(futuresReading(near6, 2.5, ISSUE_DATE).ok, false);   // no rung within ±1 month of 6 months ahead
  assert.equal(pickRung([{ month: '202701', rate: 1 }], ISSUE_DATE), null);
  const big = strip('EUR', { bp: [19, 42, 63], chg: [0, 200, 0] });
  assert.match(futuresReading(big, 2.5, ISSUE_DATE).why, /^C6/);
  const s = snapshot(); s.extra.futures.banks.GBP.rungs[1].date4wAgo = '2026-09-01';
  const v = buildVariant(s, ON(['F5']));
  assert.equal(v.markets.GBPUSD.drivers.find(x => x.key === 'repricing').proxy, true);
  // roll: in December the 6-month rung is the June contract; its change is its own price history, never the May one's
  const roll = { kind: '3m', rungs: [{ local: 'M5', month: '202705', rate: 2.9, date: '2026-12-10', rate4wAgo: 2.8, date4wAgo: '2026-11-12' }, { local: 'M6', month: '202706', rate: 3.0, date: '2026-12-10', rate4wAgo: 2.99, date4wAgo: '2026-11-12' }] };
  const fr = futuresReading(roll, 2.5, '2026-12-11');
  assert.equal(fr.rung, 'M6'); near(fr.dP, 1, 1e-9);
  // the 2y proxy needs a point near 20 business days back
  assert.equal(y2Reading([{ date: '2026-11-12', value: 3 }], 2.5, ISSUE_DATE).ok, false);
});

ok('A20 the trial is excluded: a trial record gives no scoreboard views; an official one gives every variant with its drivers', () => {
  const rec = buildV2Record(snapshot()), v1 = buildBiasRecord(snapshot().v1);
  assert.deepEqual(biasEngineV2Views(rec, v1), []);
  const fwd = buildV2Record(snapshot(), { forwardStart: '2026-11-13' }), views = biasEngineV2Views(fwd, v1);
  assert.equal(fwd.phase, 'forward');
  assert.equal(views.length, 13 * 13);   // 13 instruments × (V1 + 12 variants)
  const eu = views.find(x => x.model_id === 'bias-engine-v2' && x.inst === 'eurusd');
  assert.ok(eu.inputs.drivers.length > 0 && eu.inputs.drivers.every(d => 'contrib' in d && d.family));
  assert.ok(eu.inputs.support && 'dataQuality' in eu.inputs);
  assert.ok(views.some(x => x.model_id === 'bias-engine-v1' && x.inst === 'gold'));
});
ok('A20b phases: no forward start (or before it) is trial; on and after it is forward', () => {
  assert.ok(CONFIG.FORWARD_START === null || fs.existsSync(path.join(ROOT, 'forge/BIAS_ENGINE_V2_FREEZE.json')), 'a forward start needs the freeze manifest (spec §6.4)');
  assert.equal(phaseOf('2026-11-20', null), 'trial');
  assert.equal(phaseOf('2026-11-20', '2026-11-27'), 'trial'); assert.equal(phaseOf('2026-11-27', '2026-11-27'), 'forward');
  assert.equal(buildV2Record(snapshot(), { forwardStart: null }).phase, 'trial');
});

ok('A21 freeze: after the freeze the spec, the config and the engine match the manifest', () => {
  const f = path.join(ROOT, 'forge/BIAS_ENGINE_V2_FREEZE.json');
  if (!fs.existsSync(f)) { assert.equal(CONFIG.FORWARD_START, null, 'a forward start without a freeze manifest'); return; }
  const m = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.equal(fileSha('plans/BIAS_ENGINE_V2_SPEC.md'), m.specSha256, 'the spec changed after the freeze');
  assert.equal(fileSha('js/biasEngineV2.js'), m.engineSha256, 'the engine changed after the freeze');
  assert.equal(CONFIG_HASH, m.configHash, 'the constants or config changed after the freeze');
  assert.equal(CONFIG.FORWARD_START, m.forwardStart);
});

ok('the policy-rate table fetched during the issue\'s own gather (just after the issue time) is current; one fetched days later is not', () => {
  const s = snapshot(); s.extra.policyRates.fetchedAt = new Date(Date.parse(s.v1.asOf) + 60_000).toISOString();
  assert.equal(buildVariant(s, ON(['F2'])).markets.AUDJPY.drivers.find(x => x.key === 'carry').d, 2);
  s.extra.policyRates.fetchedAt = new Date(Date.parse(s.v1.asOf) + 3 * DAY).toISOString();
  assert.equal(buildVariant(s, ON(['F2'])).markets.AUDJPY.drivers.find(x => x.key === 'carry'), undefined);
});

ok('futures are knowable by the pull time, not the trading-day label: an Osaka next-day label is kept; a pull after the issue is removed', () => {
  const s = snapshot(); for (const r of s.extra.futures.banks.JPY.rungs) r.date = '2026-11-16';   // next weekday after Friday 11-13
  const v = buildVariant(removeLookahead(s).snap, ON(['F5']));
  assert.notEqual(v.markets.USDJPY.drivers.find(x => x.key === 'repricing').proxy, true);
  const late = snapshot(); late.extra.futures.asOf = '2026-11-13T09:00:00.000Z';
  const r = removeLookahead(late);
  assert.deepEqual(r.removed, ['futures pull 2026-11-13T09:00:00.000Z']); assert.deepEqual(r.snap.extra.futures.banks, {});
  const far = snapshot(); for (const x of far.extra.futures.banks.EUR.rungs) x.date = '2026-11-18';
  assert.match(futuresReading(far.extra.futures.banks.EUR, 2.5, ISSUE_DATE).why, /^C3/);
});

ok('the risk gate: F4 is off in every variant until the gate has passed', () => {
  const s = snapshot(); s.extra.riskGate = { pass: false };
  const v = buildVariant(s, VARIANTS.v2);
  assert.equal(v.risk.kind, 'R'); assert.match(v.f4Blocked, /gate/);
});

ok('removeLookahead lists what it removed and leaves the input untouched', () => {
  const s = snapshot(); s.extra.y2.USD.points.push({ date: '2026-11-13', value: 5 });
  const { removed } = removeLookahead(s);
  assert.deepEqual(removed, ['2y USD 2026-11-13']); assert.equal(s.extra.y2.USD.points.at(-1).date, '2026-11-13');
});

console.log(`${passed} passed`);
