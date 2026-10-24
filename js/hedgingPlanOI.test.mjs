// OI-level hedging plan.   node js/hedgingPlanOI.test.mjs
import { buildOiPlan, scoreOiPlan, orderStatesOI, buildOiPlanText, OI_PLAN } from './hedgingPlanOI.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  → ' + e : ''}`); if (!c) fails++; };
const L = (type, price, label) => ({ type, price, label: label || type.toUpperCase() });
const base = { spot: 7700, sigma: 50, levels: [
  L('call_wall', 7750, 'CALL WALL 1'), L('call_wall', 7800, 'CALL WALL 2'), L('put_wall', 7650, 'PUT WALL 1'), L('put_wall', 7580, 'PUT WALL 2'),
  L('zero_gamma', 7720, 'ZERO GAMMA'), L('max_pain', 7690, 'MAX PAIN'), L('exp_hi', 7765, 'EXP MOVE ↑'), L('exp_lo', 7635, 'EXP MOVE ↓') ] };

// PIN: fade the nearest walls
const pin = buildOiPlan({ ...base, regime: 'PIN' });
const sell = pin.orders.find(o => o.trigger === 'up'), buy = pin.orders.find(o => o.trigger === 'down');
ok('PIN: fade — sell limit at the nearest call wall, buy limit at the nearest put wall', pin.mode === 'fade' && sell.side === 'sell' && sell.type === 'limit' && sell.entry === 7750 && buy.side === 'buy' && buy.entry === 7650);
ok('stop sits a buffer beyond the wall (0.25σ = 12.5)', Math.abs(sell.stop - 7762.5) < 1e-9 && Math.abs(buy.stop - 7637.5) < 1e-9, `${sell.stop} ${buy.stop}`);
ok('fade target is the nearest structure back toward spot at least 1R away', sell.target === 7720 && buy.target === 7690, `${sell.target} ${buy.target}`);
ok('every order has RR >= minRR or is projected', pin.orders.every(o => o.projected || o.rr >= OI_PLAN.minRR - 1e-9));

// BREAKOUT: follow confirmed breaks
const brk = buildOiPlan({ ...base, regime: 'BREAKOUT' });
const buyStop = brk.orders.find(o => o.trigger === 'up'), sellStop = brk.orders.find(o => o.trigger === 'down');
ok('BREAKOUT: follow — buy stop just above the call wall, sell stop just below the put wall', brk.mode === 'follow' && buyStop.side === 'buy' && buyStop.type === 'stop' && Math.abs(buyStop.entry - 7752.5) < 1e-9 && sellStop.side === 'sell' && Math.abs(sellStop.entry - 7647.5) < 1e-9);
ok('follow stop sits back inside the wall, target is the next level beyond', buyStop.stop < 7750 && buyStop.target > buyStop.entry && sellStop.stop > 7650 && sellStop.target < sellStop.entry, `${buyStop.stop}->${buyStop.target} ${sellStop.stop}->${sellStop.target}`);

// reach: a wall the day cannot reach is not an order
const far = buildOiPlan({ spot: 7700, sigma: 20, regime: 'PIN', levels: base.levels });
ok('walls beyond 1.5σ are skipped with a reason (1.5σ = 30 pts: 7750 is 50 away)', far.orders.length === 0 && far.skipped.length === 2 && /beyond reach/.test(far.skipped[0].reason), JSON.stringify(far.skipped));
ok('a side with no wall is skipped', buildOiPlan({ spot: 7700, sigma: 50, regime: 'PIN', levels: [L('call_wall', 7750)] }).skipped.some(s => s.trigger === 'down'));
ok('a bad input returns null', buildOiPlan(null) === null && buildOiPlan({ spot: 0, sigma: 1, levels: [] }) === null);

// scoring on 1-minute bars
const bar = (lmin, o, h, l, c) => ({ t: lmin, lmin, o, h, l, c });
const win = (arr) => arr;
const hitTarget = scoreOiPlan(pin, win([bar(500, 7700, 7701, 7699, 7700), bar(540, 7740, 7751, 7739, 7745), bar(560, 7745, 7746, 7719, 7720)]));
ok('fade sell fills at the wall and wins at the target', hitTarget.triggered && hitTarget.side === 'sell' && hitTarget.how === 'target' && hitTarget.R > 0, JSON.stringify(hitTarget));
const hitStop = scoreOiPlan(pin, win([bar(540, 7740, 7751, 7739, 7745), bar(560, 7745, 7765, 7744, 7764)]));
ok('fade sell stopped out loses about 1R plus cost', hitStop.how === 'stop' && hitStop.R < -0.9 && hitStop.R > -1.2, JSON.stringify(hitStop));
ok('same minute stop and target counts as the stop', scoreOiPlan(pin, win([bar(540, 7740, 7770, 7700, 7745)])).how === 'stop');
ok('a touch before 08:00 is no trade (primed)', scoreOiPlan(pin, win([bar(300, 7740, 7751, 7739, 7745)])).reason === 'level touched before 08:00');
ok('no touch = no trade, and a one-sided plan still scores', scoreOiPlan(pin, win([bar(540, 7700, 7705, 7695, 7700)])).triggered === false && scoreOiPlan({ orders: [sell] }, win([bar(540, 7740, 7751, 7739, 7745)])).triggered === true);
ok('no order or no bars is handled', scoreOiPlan({ orders: [] }, [bar(1, 1, 1, 1, 1)]).triggered === false && scoreOiPlan(pin, []).triggered === false);

// chart output: states and the TradingView block
const idle = [bar(500, 7700, 7701, 7699, 7700)];
ok('states: untouched orders are armed', JSON.stringify(orderStatesOI(pin, idle, 520)) === JSON.stringify({ up: 'armed', down: 'armed' }));
const sOpen = orderStatesOI(pin, [bar(540, 7740, 7751, 7739, 7745)], 541);
ok('states: the filled side is open, the other done (one trade a day)', sOpen.up === 'open' && sOpen.down === 'done', JSON.stringify(sOpen));
const sDone = orderStatesOI(pin, [bar(540, 7740, 7751, 7739, 7745), bar(560, 7745, 7746, 7719, 7720)], 561);
ok('states: a trade that hit its target is done on both sides', sDone.up === 'done' && sDone.down === 'done');
ok('states: a touch before 08:00 primes both orders', Object.values(orderStatesOI(pin, [bar(300, 7740, 7751, 7739, 7745)], 330)).every(v => v === 'primed'));
const txt = buildOiPlanText([{ pair: 'NAS100_USD', spot: 7700, plan: pin }, { pair: 'EUR_USD', spot: 1.1, plan: { orders: [], skipped: [{ reason: 'no call wall above spot' }] } }, { pair: 'XXX_USD', spot: 1, plan: pin }], { NAS100_USD: 'NQ', EUR_USD: 'EURUSD' }, { NAS100_USD: { up: 'open', down: 'done' } }, { generated: 0 });
const lines = txt.split(String.fromCharCode(10));
ok('block: title says HEDGE so the indicator files it under its hedge switch', /HEDGE/.test(lines[0]) && !/OI-VOL/.test(lines[0].toUpperCase()));
ok('block: TZ line has the ten tokens the indicator parses, mode oi-fade, level then entry', lines.some(l => { const q = l.split(' '); return q[0] === 'TZ' && q.length === 10 && q[1] === 'SELL' && q[2] === 'oi-fade' && q[3] === '7750.00' && q[4] === '7750.00' && q[8] === 'open'; }), lines.filter(l => l.startsWith('TZ')).join(' | '));
ok('block: an instrument with no order says so, an unknown pair is left out', lines.some(l => /no order today/.test(l)) && !lines.includes('XXX_USD'));

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
