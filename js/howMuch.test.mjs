// node js/howMuch.test.mjs
import { stopAndSize, howMuchClass } from './howMuch.js';
import { HOW_MUCH } from './howMuchParams.js';

let fail = 0;
const ok = (name, cond) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`); if (!cond) fail++; };

ok('classes', howMuchClass('EURUSD') === 'fx_majors' && howMuchClass('EURJPY') === 'fx_crosses' && howMuchClass('GOLD') === 'gold'
  && howMuchClass('US30') === 'indices' && howMuchClass('NQ') === 'indices');
ok('every class has long + short rules', Object.values(HOW_MUCH.classes).every(c => c.long?.min_stop_sigma > 0 && c.short?.min_stop_sigma > 0));

const L = stopAndSize({ instrument: 'EURUSD', price: 1.10, sigmaPct: 0.40, side: 'long', riskBudget: 100 });
const P = HOW_MUCH.classes.fx_majors.long;
ok('long stop sits below price at the minimum', Math.abs(L.stop_price - (1.10 - P.min_stop_sigma * 1.10 * 0.004)) < 1e-12);
ok('planned loss = stop + overshoot', Math.abs(L.planned_loss_sigma - (P.min_stop_sigma + P.overshoot_p90_sigma)) < 1e-3);
ok('size = budget / loss per unit', Math.abs(L.size * L.loss_per_unit - 100) < 1e-9);

const S = stopAndSize({ instrument: 'EURUSD', price: 1.10, sigmaPct: 0.40, side: 'short', riskBudget: 100 });
ok('short stop sits above price', S.stop_price > 1.10);

const tight = stopAndSize({ instrument: 'EURUSD', price: 1.10, sigmaPct: 0.40, side: 'long', stopSigma: 0.2 });
ok('a stop inside the minimum is widened and flagged', tight.stop_sigma === P.min_stop_sigma && tight.stop_clamped);
const wide = stopAndSize({ instrument: 'EURUSD', price: 1.10, sigmaPct: 0.40, side: 'long', stopSigma: 1.5 });
ok('a wider stop is kept', wide.stop_sigma === 1.5 && !wide.stop_clamped);

const wk = stopAndSize({ instrument: 'EURUSD', price: 1.10, sigmaPct: 0.40, side: 'long', riskBudget: 100, weekend: true });
ok('weekend adds the Monday gap and shrinks size', wk.weekend_sigma > 0 && wk.size < L.size);

const hi = stopAndSize({ instrument: 'EURUSD', price: 1.10, sigmaPct: 0.80, side: 'long', riskBudget: 100 });
ok('double sigma -> half the size (vol targeting at the trade level)', Math.abs(hi.size * 2 - L.size) < 1e-6);
ok('bad input -> null', stopAndSize({ instrument: 'EURUSD', price: 0, sigmaPct: 0.4 }) === null);

console.log(fail ? `${fail} FAILED` : 'all passed');
process.exit(fail ? 1 : 0);
