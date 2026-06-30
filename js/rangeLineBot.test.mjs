// Offline tests for the range-line bot producer (no network).
//   node js/rangeLineBot.test.mjs
import { buildRangeLineBotPlan } from './rangeLineBotPlan.js';
import { refreshRangeLineBotPlan } from './rangeLineBotProducer.js';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

console.log('[buildRangeLineBotPlan]');
{
  const byInstr = {
    eurusd: { assetClass: 'fx', pip: 0.0001, cost: 0.008, slip: 0.006, policy: {
      'A_-0.5_dn|': { decision: 'fade', n: 80 },
      'M_1_up|':    { decision: 'follow', n: 60 },
      'A_2_up|':    { decision: 'skip', n: 12, reason: 'lowN' },
    } },
    nq: { assetClass: 'index', pip: 1.0, cost: 0.010, slip: 0.008, policy: {
      'A_0.5_up|': { decision: 'follow', n: 90 },
    } },
    deadpair: { assetClass: 'fx', pip: 0.0001, cost: 0.008, slip: 0.006, policy: {
      'A_3_up|': { decision: 'skip', n: 5, reason: 'lowN' },
    } },
  };
  const plan = buildRangeLineBotPlan(byInstr, { sources: ['asia', 'monday'], ladderFibs: [-1, -0.5, 0, 0.5, 1], boundaryHour: 23, asiaHrs: 6, chandFrac: 0.5, minN: 50, marginPct: 0 });

  ok('strategy tag set', plan.strategy === 'range-line');
  ok('ladder meta carried', plan.boundaryHour === 23 && plan.asiaHrs === 6 && plan.chandFrac === 0.5 && plan.ladderFibs.length === 5);
  ok('universe = instruments with a tradeable cell', plan.universe.sort().join(',') === 'eurusd,nq');
  ok('deadpair (all-skip) dropped from universe', !plan.universe.includes('deadpair') && !plan.instruments.deadpair);
  ok('skip cells stripped from policy', !plan.instruments.eurusd.policy['A_2_up|'] && Object.keys(plan.instruments.eurusd.policy).length === 2);
  ok('kept cells carry only the decision', plan.instruments.eurusd.policy['A_-0.5_dn|'].decision === 'fade' && plan.instruments.eurusd.policy['M_1_up|'].decision === 'follow');
  ok('per-instrument cost/pip/assetClass carried', plan.instruments.nq.assetClass === 'index' && plan.instruments.nq.pip === 1.0 && plan.instruments.nq.cost === 0.010);
}

console.log('[refreshRangeLineBotPlan — injected I/O]');
{
  const writes = {};
  const kvPut = async (k, v) => { writes[k] = JSON.parse(v); };
  // Fake freeze: eurusd has a tradeable cell, badpair is all-skip.
  const freeze = (records, ctx) => records.policy;
  const recordsByInstr = {
    eurusd: { policy: { 'A_-0.5_dn|': { decision: 'fade', n: 80 } } },
    nq:     { policy: { 'A_1_up|': { decision: 'follow', n: 70 } } },
    badpair:{ policy: { 'A_2_up|': { decision: 'skip', n: 4, reason: 'lowN' } } },
  };
  const getRecords = async (instr) => recordsByInstr[instr] ? [recordsByInstr[instr]] && recordsByInstr[instr] : null;
  // getRecords must return a non-empty array-like; our freeze reads .policy off it,
  // so return the object directly (length check uses truthiness of the array).
  const getRec = async (instr) => {
    const r = recordsByInstr[instr];
    return r ? Object.assign([r], { policy: r.policy }) : null;
  };

  const plan = await refreshRangeLineBotPlan({
    universe: ['eurusd', 'nq', 'badpair', 'missing'],
    getRecords: getRec, kvPut, freeze,
    assetClassFor: (k) => (k === 'nq' ? 'index' : 'fx'),
    pipFor: (k) => (k === 'nq' ? 1.0 : 0.0001),
    boundaryHour: 23, asiaHrs: 6,
    now: () => '2026-06-30T06:15:00Z', stamp: () => 1751000000000,
  });

  ok('plan written to range_line_bot_plan', !!writes['range_line_bot_plan']);
  ok('envelope is {data,timestamp}', writes['range_line_bot_plan'].timestamp === 1751000000000 && !!writes['range_line_bot_plan'].data);
  ok('generatedAt stamped', plan.generatedAt === '2026-06-30T06:15:00Z');
  ok('only tradeable instruments in universe', plan.universe.sort().join(',') === 'eurusd,nq');
  ok('all-skip and missing instruments dropped', !plan.universe.includes('badpair') && !plan.universe.includes('missing'));
  ok('frozen window params carried', plan.boundaryHour === 23 && plan.asiaHrs === 6);
}

console.log('[refreshRangeLineBotPlan — refuses empty plan]');
{
  let threw = false, wrote = false;
  const kvPut = async () => { wrote = true; };
  try {
    await refreshRangeLineBotPlan({
      universe: ['eurusd'],
      getRecords: async () => null,            // nothing freezes
      kvPut,
      now: () => 'x', stamp: () => 0,
    });
  } catch { threw = true; }
  ok('throws when no instrument freezes', threw);
  ok('does NOT clobber KV with an empty plan', !wrote);
}

console.log(`\n${fail ? '✗' : '✓'} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
