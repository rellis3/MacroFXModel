import fs from 'fs';
import { applyDrawdownThrottle } from '../js/levelAtlasVoteReview.js';
import { maxDrawdownFromPnls } from '../js/metricsCore.js';
import { portfolioStats } from '../js/backtestStats.js';

const raw = JSON.parse(fs.readFileSync('C:/Users/relli/AppData/Local/Temp/claude/c--Users-relli-OneDrive-Documents-Programming-Trading-v2-trading-model-MacroFXModel/2468a24d-d5a5-4612-805e-26cc5cc893c9/scratchpad/raw_daily_returns.json', 'utf8'));
const dates = raw.equityCurve.map(d => d.date);
const dailyReturns = raw.equityCurve.map(d => d.dailyReturn);
const tradesByDate = {};
for (const t of raw.trades) tradesByDate[t.date] = (tradesByDate[t.date] || 0) + 1;
const totalTrades = raw.trades.length;
console.log(`Loaded: ${dates.length} days, ${totalTrades} trades, ${(totalTrades/dates.length).toFixed(1)} trades/day avg\n`);

function withNonCompoundedDD(returns) {
  const maxDDNonComp = maxDrawdownFromPnls(returns);
  const years = returns.length / 252;
  const cagrNonComp = years > 0 ? returns.reduce((s, r) => s + r, 0) / years : 0;
  return { maxDDNonComp, cagrNonComp, calmarNonComp: maxDDNonComp < 0 ? cagrNonComp / Math.abs(maxDDNonComp) : 0 };
}

// ── Episode analysis for the CURRENT setting ──────────────────────────────
function analyzeEpisodes(triggerDD, restoreDD, throttleMult) {
  const tr = applyDrawdownThrottle(dailyReturns, dates, { triggerDD, restoreDD, throttleMult });
  const episodes = [];
  let inEpisode = false, start = null, worstDD = 0;
  for (const s of tr.state) {
    if (s.throttled && !inEpisode) { inEpisode = true; start = s.date; worstDD = s.ddAtDecision; }
    if (s.throttled) worstDD = Math.min(worstDD, s.ddAtDecision);
    if (!s.throttled && inEpisode) {
      inEpisode = false;
      episodes.push({ start, end: s.date, worstDD });
    }
  }
  if (inEpisode) episodes.push({ start, end: null, worstDD }); // still throttled as of the end of history

  const daysThrottled = tr.state.filter(s => s.throttled).length;
  let tradesThrottled = 0;
  for (const s of tr.state) if (s.throttled) tradesThrottled += (tradesByDate[s.date] || 0);

  const episodeLens = episodes.filter(e => e.end).map(e => {
    const i0 = dates.indexOf(e.start), i1 = dates.indexOf(e.end);
    const daysLen = i1 - i0;
    const tradesLen = dates.slice(i0, i1).reduce((a, d) => a + (tradesByDate[d] || 0), 0);
    return { ...e, daysLen, tradesLen };
  });

  return { tr, episodes: episodeLens, ongoingAtEnd: episodes.find(e => !e.end), daysThrottled, tradesThrottled };
}

console.log('='.repeat(90));
console.log('CURRENT SETTING: trigger=-8%  restore=-2%  mult=0.25x');
console.log('='.repeat(90));
const cur = analyzeEpisodes(-8, -2, 0.25);
console.log(`Total episodes (fully resolved): ${cur.episodes.length}`);
console.log(`Days spent throttled: ${cur.daysThrottled} of ${dates.length} (${(cur.daysThrottled/dates.length*100).toFixed(1)}%)`);
console.log(`Trades taken AT REDUCED SIZE while throttled: ${cur.tradesThrottled} of ${totalTrades} (${(cur.tradesThrottled/totalTrades*100).toFixed(1)}%)`);
if (cur.episodes.length) {
  const avgDays = cur.episodes.reduce((a,e)=>a+e.daysLen,0)/cur.episodes.length;
  const avgTrades = cur.episodes.reduce((a,e)=>a+e.tradesLen,0)/cur.episodes.length;
  const maxDays = Math.max(...cur.episodes.map(e=>e.daysLen));
  const maxTrades = Math.max(...cur.episodes.map(e=>e.tradesLen));
  console.log(`Avg time to recover from trigger to restore: ${avgDays.toFixed(1)} trading days (~${avgTrades.toFixed(0)} trades)`);
  console.log(`Longest episode: ${maxDays} trading days (~${maxTrades} trades)`);
  console.log(`\nPer-episode detail:`);
  for (const e of cur.episodes) console.log(`  ${e.start} -> ${e.end}  worst DD ${e.worstDD.toFixed(1)}%  ${e.daysLen}d / ~${e.tradesLen} trades`);
}
if (cur.ongoingAtEnd) console.log(`\nStill throttled as of the end of this history (started ${cur.ongoingAtEnd.start}) -- matches the live account's current state.`);

// ── Sweep ──────────────────────────────────────────────────────────────────
console.log(`\n\n${'='.repeat(110)}`);
console.log('SWEEP: alternative (trigger, restore, mult) calibrations against the SAME real daily returns');
console.log('='.repeat(110));
const GRID = [
  { triggerDD: -8, restoreDD: -2, throttleMult: 0.25, label: 'CURRENT' },
  { triggerDD: -6, restoreDD: -2, throttleMult: 0.25 },
  { triggerDD: -10, restoreDD: -2, throttleMult: 0.25 },
  { triggerDD: -8, restoreDD: -4, throttleMult: 0.25 },
  { triggerDD: -8, restoreDD: -1, throttleMult: 0.25 },
  { triggerDD: -8, restoreDD: -2, throttleMult: 0.4 },
  { triggerDD: -8, restoreDD: -2, throttleMult: 0.5 },
  { triggerDD: -8, restoreDD: -2, throttleMult: 0.15 },
  { triggerDD: -10, restoreDD: -3, throttleMult: 0.4 },
  { triggerDD: -6, restoreDD: -1, throttleMult: 0.4 },
  { triggerDD: -12, restoreDD: -3, throttleMult: 0.3 },
];

console.log('setting'.padEnd(28), 'sharpe'.padStart(7), 'cagr%'.padStart(8), 'maxDD%'.padStart(8), 'calmar'.padStart(7), '%daysThr'.padStart(9), 'avgEpDays'.padStart(10), 'avgEpTrades'.padStart(12));
for (const g of GRID) {
  const a = analyzeEpisodes(g.triggerDD, g.restoreDD, g.throttleMult);
  const ps = portfolioStats(a.tr.dailyReturns, { mc: false, targetVol: 10 });
  const nc = withNonCompoundedDD(a.tr.dailyReturns);
  const avgDays = a.episodes.length ? a.episodes.reduce((s,e)=>s+e.daysLen,0)/a.episodes.length : 0;
  const avgTrades = a.episodes.length ? a.episodes.reduce((s,e)=>s+e.tradesLen,0)/a.episodes.length : 0;
  const label = (g.label || `${g.triggerDD}/${g.restoreDD}/${g.throttleMult}`).padEnd(28);
  console.log(label, ps.sharpe.toFixed(2).padStart(7), nc.cagrNonComp.toFixed(1).padStart(8), nc.maxDDNonComp.toFixed(1).padStart(8), nc.calmarNonComp.toFixed(2).padStart(7), (a.daysThrottled/dates.length*100).toFixed(1).padStart(8)+'%', avgDays.toFixed(1).padStart(10), avgTrades.toFixed(0).padStart(12));
}
