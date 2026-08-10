// Trade Decision Engine — liquidity-sweep candidate feature fit.
// Backfills the 6 FX majors (same universe/methodology as FIT_FINDINGS.md) and
// A/B-fits sweep_reject_fade / sweep_continue_follow against the v0 feature set.
// These features are computed automatically inside decide()'s buildEventFeatures
// (SWEEP_FEATURES in decisionCore.js) — no context injection needed, unlike the
// macro/USD-trend candidates in crossAssetFit.mjs. Run offline:
//   R2_ACCESS_KEY= R2_SECRET_KEY= node Trade_Decision_Engine/sweepFit.mjs

import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { backfillPair, fitLogistic } from './backfill.js';
import { MODEL_V0 } from './modelV0.js';

const FX = ['eurusd', 'gbpusd', 'audusd', 'nzdusd', 'usdcad', 'usdchf'];
const cacheDir = new URL('../VolRangeForecaster/data/m1', import.meta.url).pathname;

const all = [];
for (const p of FX) {
  const packed = await loadM1ForPair(p, cacheDir);
  const evs = [];
  backfillPair(p, packed, { onEvent: e => evs.push(e) });
  all.push(...evs);
  console.error(p, evs.length, 'events');
}
console.log('pooled events:', all.length);

const wr = a => a.length ? +(100 * a.filter(e => e.outcome.win).length / a.length).toFixed(1) : NaN;
const mean = a => a.length ? +(a.reduce((s, e) => s + e.outcome.pnlPct, 0) / a.length).toFixed(4) : NaN;

const rejN = all.filter(e => e.features.sweep_reject_fade > 0);
const conN = all.filter(e => e.features.sweep_continue_follow > 0);
console.log(`sweep_reject_fade active:     n=${rejN.length} (${(100 * rejN.length / all.length).toFixed(2)}%) win=${wr(rejN)}% mean_pnl=${mean(rejN)}bp | all-fades win=${wr(all.filter(e => e.action === 'fade'))}%`);
console.log(`sweep_continue_follow active: n=${conN.length} (${(100 * conN.length / all.length).toFixed(2)}%) win=${wr(conN)}% mean_pnl=${mean(conN)}bp | all-follows win=${wr(all.filter(e => e.action === 'follow'))}%`);

const base = Object.keys(MODEL_V0.weights);
const fits = {
  baseline:    fitLogistic(all, { features: base }),
  plus_reject: fitLogistic(all, { features: [...base, 'sweep_reject_fade'] }),
  plus_follow: fitLogistic(all, { features: [...base, 'sweep_continue_follow'] }),
  plus_both:   fitLogistic(all, { features: [...base, 'sweep_reject_fade', 'sweep_continue_follow'] }),
};
for (const [k, r] of Object.entries(fits)) {
  console.log(`${k.padEnd(11)} OOS brier=${r.oos?.fitted?.brier} (v0 prior ${r.oos?.prior_v0?.brier}) reject_w=${r.candidate?.weights?.sweep_reject_fade ?? '-'} follow_w=${r.candidate?.weights?.sweep_continue_follow ?? '-'}`);
}
