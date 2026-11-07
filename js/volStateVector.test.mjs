import assert from 'node:assert/strict';
import { sigmaNow, sigmaExpectedChange, longrunStats, sigmaVsLongrun, hmmHighVolProb, regime, forecastErrorStat, forecastError, jumpIntensity, buildVector, JUMP_PENDING } from './volStateVector.js';

// 1. σ now comes from the ladder; missing ladder -> null + reason
const fc = { ladder: { sigma_used_pct: 1.2, sigma_daily_pct: 1.1, event_mult: 1.09, estimator: 'yz_10' }, cone_5d: 80, cone_21d: 60, cone_63d: 50, vol_pct: 40,
             term_structure: { slope: 40, label: 'expanding' }, vol_accel: { label: 'rising' } };
assert.equal(sigmaNow(fc, 'x').value, 1.2);
assert.equal(sigmaNow({}, 'x').value, null); assert.match(sigmaNow(null).reason, /not in the vol forecast/);

// 2. expected change is a labelled proxy
const ec = sigmaExpectedChange(fc, 'x');
assert.equal(ec.value, 40); assert.equal(ec.proxy, true); assert.match(ec.source, /PROXY/);
assert.equal(sigmaExpectedChange({}, 'x').value, null);

// 3. long-run ratio and percentile
const ser = Array.from({ length: 252 }, (_, i) => i + 1);           // median 126.5, last 252
const st = longrunStats(ser);
assert.equal(+st.ratio.toFixed(4), +(252 / 126.5).toFixed(4)); assert.equal(+st.pct.toFixed(2), +((251 + 1) / 252 * 100).toFixed(2));
assert.equal(longrunStats(ser.slice(0, 150)), null);
assert.equal(sigmaVsLongrun({ series: ser, estimator: 'yz_10', asOf: 'a' }, fc).value, +(252 / 126.5).toFixed(3));
assert.match(sigmaVsLongrun({ series: null, reason: 'boom' }).reason, /boom/);

// 4. HMM: only hours COMPLETED before the cut-off; '.' skipped; quiet -> 1 - p
const cut = Date.parse('2026-11-06T00:00:00Z');
const entry = { t0: '2026-11-05T20', s: 'qa.a', p: [90, 70, 0, 80] };   // 20h q90, 21h a70, 22h ., 23h a80 (ends 00:00)
const h = hmmHighVolProb(entry, cut);
assert.equal(h.pActive, 0.8); assert.equal(h.hour, '2026-11-05T23:00Z');
const h2 = hmmHighVolProb(entry, cut - 1);                                // 23h not complete -> 22h '.' -> 21h
assert.equal(h2.pActive, 0.7);
const h3 = hmmHighVolProb({ t0: '2026-11-05T20', s: 'q', p: [90] }, cut);
assert.equal(+h3.pActive.toFixed(2), 0.1); assert.equal(h3.state, 'quiet');
assert.equal(regime(null).value, null);
assert.equal(regime({ pActive: 0.5, state: 'active', hour: 'h', ageH: 10 }).value, null);   // stale reading
assert.equal(regime(h, 'c').value, 0.8);

// 5. forecast error: mean log ratio over the last 20 valid rows
const rows = Array.from({ length: 25 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, hl: i < 5 ? 100 : 2, p50: 1 }));
rows.push({ date: '2026-10-30', hl: null, p50: 1 });
const fe = forecastErrorStat(rows);
assert.equal(fe.n, 20); assert.equal(+fe.mean.toFixed(6), +Math.log(2).toFixed(6)); assert.equal(fe.from, '2026-10-06');
const fe2 = forecastError(rows, { stress: { factor: 1.06, sessionDate: 'd' }, drawdown: null, cls: 'fx' });
assert.equal(fe2.shadows.stress.factor, 1.06); assert.equal(fe2.shadows.drawdown.value, null);
assert.match(forecastError([], { cls: null }).shadows.stress.reason, /FX and indices only/);
assert.equal(forecastError([], {}).value, null);

// 6. jump: null with the pending-study reason unless a live value is supplied
assert.equal(jumpIntensity().reason, JUMP_PENDING);

const v = buildVector({ sym: 'NQ', sessionDate: '2026-11-06', fc, fcAsOf: 'x', longrun: { series: ser, estimator: 'yz_10' }, hmm: h, errRows: rows, cls: 'idx' });
for (const k of ['sigma_now', 'sigma_expected_change', 'sigma_vs_longrun', 'regime', 'forecast_error', 'jump_intensity']) assert.ok(k in v, k);
for (const k of ['sigma_now', 'regime', 'forecast_error']) assert.ok(v[k].value != null && (v[k].source || v[k].reason), k);
console.log('volStateVector tests passed');
