// Parity: rebuild NQ's 2026-09-29 export ladder from M1 and compare with the
// owner's NAS100 chart (Vol Forecast v3 export drawn by the Pine overlay).
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { v4Days } from '../../js/voteAtlasV4Lines.js';
const CHART = { hl_p50: 1.40, hl_p75: 1.87, oc_p50: 0.62, oc_p75: 1.13, oh_p75: 1.08, oh_p90: 1.54, ol_p50: 0.56, ol_p75: 1.08, ol_p90: 1.78 };
const packed = await loadM1ForPair('nq');
for (const tag of ['none', 'high', 'CPI', 'NFP', 'FOMC', null]) {
  const days = v4Days(packed, { instrument: 'NQ', assetClass: 'index', eventTagFor: () => tag, minBars: 1 });
  const d = days.find(x => x.date === '2026-09-29');
  if (!d) { console.log('no 2026-09-29 day; last', days.at(-1)?.date); break; }
  const got = Object.fromEntries(Object.keys(CHART).map(k => { const [q, r] = k.split('_'); return [k, d.ladder[q]?.[r]]; }));
  const err = Object.keys(CHART).map(k => Math.abs(got[k] - CHART[k]));
  console.log(`tag=${String(tag).padEnd(5)} maxAbsErr=${Math.max(...err).toFixed(3)}pp  sigma=${d.ladder.sigma_daily_pct}% mult=${d.ladder.event_mult} est=${d.ladder.estimator} lastNYday=${d.lastNyKey}`, JSON.stringify(got));
}
console.log('chart', JSON.stringify(CHART));
