/**
 * vumanchuState.test.mjs — the live-vs-offline PARITY GATE.
 *
 * The frozen probability table is indexed by cell keys the Python panel
 * produced. If this JS brick encodes state even slightly differently, the live
 * lookup misses and silently falls back to a coarser level — no error, just
 * quietly wrong probabilities. This repo has documented cases of live and
 * backtest paths diverging exactly this way, so parity is asserted rather than
 * assumed.
 *
 * The fixture (`js/fixtures/vumanchu_state_cases.json`) is generated FROM the
 * Python side: real gold M1 bars plus the codes `vumanchuLab/shapes.py`
 * computed at 45 timestamps spanning every level and form.
 *
 *   node js/vumanchuState.test.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeState, formOf, resampleBars, zoneOf, lookupState, interpret } from './vumanchuState.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = JSON.parse(readFileSync(join(HERE, 'fixtures/vumanchu_state_cases.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; }
  else { fail++; console.log(`  FAIL  ${label}`); }
};

// ── unit: the two encoders ───────────────────────────────────────────────────
ok(zoneOf(60) === 'OB' && zoneOf(53) === 'OB', 'zoneOf: >=53 is OB');
ok(zoneOf(-60) === 'OS' && zoneOf(-53) === 'OS', 'zoneOf: <=-53 is OS');
ok(zoneOf(0) === 'mid' && zoneOf(52.9) === 'mid', 'zoneOf: between is mid');
ok(zoneOf(NaN) === null, 'zoneOf: non-finite is null, never a guess');

// form: early = wt[-5]-wt[-10], late = wt[0]-wt[-5]
const mk = (far, half, now) => {
  const a = new Array(11).fill(0);
  a[0] = far; a[5] = half; a[10] = now;
  return a;
};
ok(formOf(mk(10, 0, 10)) === 'Vup', 'formOf: down-then-up is Vup');
ok(formOf(mk(0, 10, 0)) === 'Vdn', 'formOf: up-then-down is Vdn');
ok(formOf(mk(0, 5, 10)) === 'rise', 'formOf: monotone up is rise');
ok(formOf(mk(10, 5, 0)) === 'fall', 'formOf: monotone down is fall');
ok(formOf([1, 2, 3]) === null, 'formOf: too little history is null');

// ── unit: resampling must not include a forming bar ──────────────────────────
{
  // t0 must sit ON a 5-minute boundary or the buckets straddle the data and the
  // arithmetic below is meaningless (this test asserted the wrong counts first
  // time round for exactly that reason).
  const t0 = 1700000100;                       // divisible by 300
  const bars = Array.from({ length: 20 }, (_, i) => ({
    t: t0 + i * 60, open: 1, high: 2, low: 0, close: 1.5, volume: 1,
  }));
  const lastBucketCloses = t0 + 4 * 300;       // 4 buckets of 5 bars each
  const after = resampleBars(bars, 5, { nowSec: lastBucketCloses });
  const during = resampleBars(bars, 5, { nowSec: lastBucketCloses - 60 });
  ok(after.length === 4, 'resample: 20 aligned M1 -> 4 closed 5m buckets');
  ok(during.length === 3, 'resample: the still-forming bucket is dropped');
  ok(resampleBars(bars, 5, { dropForming: false, nowSec: lastBucketCloses - 60 }).length === 4,
     'resample: dropForming=false keeps it (for backfill only)');
  ok(after[0].high === 2 && after[0].low === 0 && after[0].volume === 5,
     'resample: OHLCV aggregation is right');
}

// ── THE PARITY GATE ──────────────────────────────────────────────────────────
const bars = FIX.bars;
let checked = 0, mismatches = [];
for (const c of FIX.cases) {
  // Only bars up to and including the case timestamp — the live path can never
  // see more than this.
  const upto = bars.filter(b => b.t <= c.t);
  if (upto.length < 400) continue;
  const st = computeState(upto, { nowSec: c.t + 60 });
  checked++;
  for (const tf of [1, 5, 15]) {
    const got = st.per[tf]?.code;
    const want = c[`tf${tf}_code`];
    if (got !== want) {
      mismatches.push(`t=${c.t} tf${tf}: JS ${got} vs PY ${want}`);
    }
  }
}
ok(checked >= 30, `parity: ${checked} cases had enough history to check`);
ok(mismatches.length === 0,
   `parity: all ${checked * 3} timeframe codes match Python` +
   (mismatches.length ? `\n        ${mismatches.slice(0, 6).join('\n        ')}` +
     (mismatches.length > 6 ? `\n        ...and ${mismatches.length - 6} more` : '') : ''));

// ── lookup + interpret behaviour ─────────────────────────────────────────────
{
  const table = {
    instruments: {
      gold: {
        60: {
          uncond_p_revert: 0.5165,
          levels: {
            L1: [{ cell: 'OS/fall|OS/fall|OS/fall', n: 1121, p_revert: 0.575, baseline: 0.522,
                   delta_pp: 5.37, years: 6, years_same_sign: 5, year_min_pp: 1, year_max_pp: 9 }],
            L2: [{ cell: 'OS|OS|OS', n: 6129, p_revert: 0.547, baseline: 0.517,
                   delta_pp: 2.90, years: 6, years_same_sign: 5, year_min_pp: -0.9, year_max_pp: 5.3 },
                 { cell: 'mid|mid|mid', n: 45981, p_revert: 0.515, baseline: 0.516,
                   delta_pp: -0.11, years: 6, years_same_sign: 2, year_min_pp: -1.5, year_max_pp: 0.9 }],
            L4: [{ cell: 'OS', n: 52242, p_revert: 0.53, baseline: 0.517,
                   delta_pp: 1.30, years: 6, years_same_sign: 6, year_min_pp: 0.5, year_max_pp: 3 }],
          },
        },
      },
    },
  };
  const s = k => ({ keys: k });

  const tight = lookupState(s({ L1: 'OS/fall|OS/fall|OS/fall', L2: 'OS|OS|OS', L4: 'OS' }), table,
                            { instrument: 'gold' });
  ok(tight.matched === 'L1' && tight.n === 1121, 'lookup: takes the tightest level that clears minN');

  const coarse = lookupState(s({ L1: 'OB/rise|OB/rise|OB/rise', L2: 'OS|OS|OS', L4: 'OS' }), table,
                             { instrument: 'gold' });
  ok(coarse.matched === 'L2', 'lookup: falls back when the tight key is absent');

  const floored = lookupState(s({ L1: 'OS/fall|OS/fall|OS/fall', L2: 'OS|OS|OS' }), table,
                              { instrument: 'gold', minN: 5000 });
  ok(floored.matched === 'L2', 'lookup: a cell under the sample floor is skipped, not returned');

  const none = lookupState(s({ L2: 'nope' }), table, { instrument: 'gold' });
  ok(none.matched === null, 'lookup: unknown state returns no match rather than a guess');

  ok(lookupState(s({ L4: 'OS' }), table, { instrument: 'eurusd' }).matched === null,
     'lookup: unknown instrument is reported, not silently defaulted');

  // interpret
  ok(interpret(s({}), tight).read === 'FADE', 'interpret: positive delta -> FADE');
  const flat = lookupState(s({ L2: 'mid|mid|mid' }), table, { instrument: 'gold' });
  ok(interpret(s({}), flat).read === 'NONE',
     'interpret: a delta inside the noise band is NONE, not a weak opinion');
  ok(interpret(s({}), none).read === 'NONE', 'interpret: no match -> NONE');
  ok(interpret(s({}), { matched: 'L2', deltaPP: -2.5 }).read === 'FOLLOW',
     'interpret: negative delta -> FOLLOW');
}

console.log(`\nvumanchuState: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
