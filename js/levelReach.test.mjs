// node js/levelReach.test.mjs — parity with the Python export (scripts/levels/export_reach_params.py) and core behaviour.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { reachP, vtShare, modelHour, scenarios, geometryP } from './levelReach.js';
import { REACH_PARAMS } from './levelReachParams.js';

let n = 0;
const fx = JSON.parse(readFileSync(new URL('../analysis/output/level_p2/reach_parity.json', import.meta.url)));
let worst = 0;
for (const r of fx.rows) for (const hz of Object.keys(r.p)) {
  const p = reachP(hz, { d: r.dist, v: r.v[hz], used: r.used, ext: r.ext, h: r.h, cls: r.cls });
  worst = Math.max(worst, Math.abs(p - r.p[hz]));
}
assert.ok(worst < 1e-6, `parity worst |dp| = ${worst}`); n++;

// vol-time share at an integer checkpoint equals the Phase 2 construction (sum of hourly shares; half of hour h for 30 min)
const s = REACH_PARAMS.hour_shares.major;
assert.ok(Math.abs(vtShare('major', 600, 630) - s[10] * 0.5) < 1e-12); n++;
assert.ok(Math.abs(vtShare('major', 600, 1320) - s.slice(10, 22).reduce((a, b) => a + b, 0)) < 1e-12); n++;
assert.equal(modelHour(170), null); assert.equal(modelHour(180), 3); assert.equal(modelHour(17 * 60), 16); n++;
assert.ok(Math.abs(geometryP(0, 0.1) - 0.9999) < 1e-9); n++;

// scenarios: eligibility, monotone horizons, race
const st = { sym: 'EURUSD', open: 1.1, price: 1.1010, high: 1.1020, low: 1.0990, sigmaDailyPct: 0.5, londonMin: 10 * 60 + 20 };
const sc = scenarios(st, [{ price: 1.1015, family: 'x' }, { price: 1.1040, family: 'x' }, { price: 1.0970, family: 'x' }, { price: 1.1000, family: 'open', intraday: true }, { price: 1.30, family: 'x' }]);
assert.ok(sc.ok); n++;
const by = Object.fromEntries(sc.levels.map(l => [l.price, l]));
assert.equal(by[1.1015].why, 'traded through today'); assert.equal(by[1.3].why, 'beyond 3σ'); assert.ok(by[1.1].eligible); n++;
const p = by[1.104].p;
assert.ok(p['30'] <= p['60'] && p['60'] <= p['120'] && p['120'] <= p['240'] && p['240'] <= p.end + 1e-9); n++;
assert.equal(sc.race.up, 1.104); assert.equal(sc.race.down, 1.1); n++;
assert.ok(Math.abs(sc.race.pUpFirst - (1.1010 - 1.1) / (1.104 - 1.1)) < 1e-9); n++;
assert.equal(scenarios({ ...st, londonMin: 22 * 60 }, []).ok, false); n++;
console.log(`levelReach: ${n} passed (parity worst ${worst.toExponential(2)})`);
