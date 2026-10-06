// STEP 0 check 2 (forge/FORECAST_HISTORY_SPEC.md): rebuild a session's forecast from M1 truncated at that session's
// open (+ its first bar) and compare with the table. Any difference = the forecast read data it could not have had.
//   node scripts/forecast_history/causality_check.mjs
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { buildContext } from '../rangebook/common.mjs';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { forecastSigma } from '../../js/forecastSigma.js';

const REPORT = JSON.parse(fs.readFileSync('forge/out_vol_lon/vol_report.json', 'utf8'));
const calendar = loadCalendarProxy();
const JOBS = [['eurusd', 'EURUSD'], ['gold', 'GOLD'], ['nq', 'NQ']];
const DATES = ['2019-03-14', '2020-11-04', '2022-06-15', '2024-08-05', '2026-03-18'];
let bad = 0, n = 0;
for (const [key, SYM] of JOBS) {
  const packed = await loadM1ForPair(key);
  const table = new Map(fs.readFileSync(`analysis/output/forecast_history/${SYM}.csv`, 'utf8').trim().split('\n').slice(1)
    .map(l => l.split(',')).map(c => [c[1], c]));
  const head = fs.readFileSync(`analysis/output/forecast_history/${SYM}.csv`, 'utf8').split('\n')[0].split(',');
  const col = name => head.indexOf(name);
  const specs = REPORT[key].specs.map(s => ({ t: Date.parse(s.trained_through.replace(' ', 'T') + 'Z') / 1000, est: s.estimator }))
    .sort((a, b) => a.t - b.t);
  for (const date of DATES) {
    const row = table.get(date);
    if (!row) { console.log(`${SYM} ${date}: not in table`); continue; }
    // find the session open in the full data, then cut everything after its first bar
    const full = buildContext(packed, { sym: SYM, assetClass: assetClassFor(key), tagFor: calendar(SYM) });
    const d0 = full.days.find(d => d.date === date);
    let cut = 0; while (cut < packed.n && packed.times[cut] <= d0.openSec) cut++;
    const trunc = { n: cut, times: packed.times.subarray(0, cut), opens: packed.opens.subarray(0, cut), highs: packed.highs.subarray(0, cut),
                    lows: packed.lows.subarray(0, cut), closes: packed.closes.subarray(0, cut), volumes: packed.volumes?.subarray?.(0, cut) };
    const ctx = buildContext(trunc, { sym: SYM, assetClass: assetClassFor(key), tagFor: calendar(SYM) });
    const d = ctx.days.find(x => x.date === date);
    let spec = null; for (const s of specs) if (s.t < d.openSec) spec = s; spec ??= specs[0];
    // buildLadder (and so the table and the live export) carries sigma rounded to 2 dp
    const pit = Math.round(forecastSigma(ctx.ny.slice(0, d.nyBarsUsed), spec.est) * 100 * 100) / 100;
    const live = d.ladder.sigma_daily_pct;
    const okP = Math.abs(pit - +row[col('pit_sig_daily')]) < 1e-3, okL = Math.abs(live - +row[col('live_sig_daily')]) < 1e-3;
    n++; if (!okP || !okL) bad++;
    console.log(`${SYM} ${date}: pit ${pit.toFixed(4)} vs ${row[col('pit_sig_daily')]}  live ${live.toFixed(4)} vs ${row[col('live_sig_daily')]}  ${okP && okL ? 'OK' : 'MISMATCH'}`);
  }
}
console.log(`causality: ${n - bad}/${n} unchanged`);
