/**
 * crosscheck_sigma.mjs — proves the Python yz_sigma reproduces the JS source of truth.
 * Generates the SAME synthetic daily bars as vol_exhaustion_lib._synthetic_daily,
 * runs the real js/volBacktestEngine.js yzVolSeries on them, and writes the tail to
 * stdout as JSON. compare_sigma.py asserts the two agree to 1e-10.
 *
 * Run:  node volatilityExhaustion/crosscheck_sigma.mjs
 */
import { yzVolSeries } from '../js/volBacktestEngine.js';

// Mirror numpy's default_rng(seed=7) Philox stream? No — instead we read the bars
// that Python dumped, so both sides use byte-identical inputs.
import { readFileSync } from 'node:fs';
const bars = JSON.parse(readFileSync(new URL('./_xcheck_bars.json', import.meta.url)));
const yz = yzVolSeries(bars, 30);
process.stdout.write(JSON.stringify(Array.from(yz)));
