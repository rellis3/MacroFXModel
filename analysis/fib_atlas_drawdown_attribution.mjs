// Finds the actual drawdown window driving Asia's -100% OOS maxDD (all 26
// pairs, no exclusion) and attributes it per pair -- answers directly: is
// EURUSD/GOLD's exclusion from the pair-selection algorithm because they
// specifically blew up, or because they were simply the most ACTIVE pairs
// during a systemic, correlated bad stretch that hit many pairs at once?
import { applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries } from '../js/levelAtlasVoteReview.js';
import { RANGE_FIB_INSTRUMENTS } from '../js/rangeFibEngine.js';

const BASE = process.env.BASE || 'https://macrofxmodel-production.up.railway.app';
const MIN_MARGIN = 2, MAX_CONCURRENT = 1, RISK_PCT = 1;

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (resp.ok || resp.status === 404) return resp;
      if (i === retries) return resp;
    } catch (e) { if (i === retries) return null; }
    await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
}

async function loadPair(pair) {
  const resp = await fetchWithRetry(`${BASE}/api/asia-fib-atlas/vote-trades/${pair.toUpperCase()}?minMargin=${MIN_MARGIN}`);
  if (!resp || !resp.ok) return null;
  const j = await resp.json();
  const capped = applyConcurrencyCap(j.trades ?? [], { maxConcurrent: MAX_CONCURRENT });
  if (!capped?.kept?.length) return null;
  return riskAdjustTrades(capped.kept, RISK_PCT).map(t => ({ ...t, pair: pair.toUpperCase() }));
}

async function main() {
  console.log('Loading all 26 pairs...');
  const byPair = {};
  for (const pair of RANGE_FIB_INSTRUMENTS) {
    const trades = await loadPair(pair);
    if (trades) byPair[pair.toUpperCase()] = trades;
  }
  const syms = Object.keys(byPair);
  console.log(`Loaded ${syms.length} pairs.\n`);

  const weights = Object.fromEntries(syms.map(s => [s, 1]));
  const combined = buildPortfolioDailySeries(byPair, { weights });
  const { dates, dailyReturns } = combined;

  // Find the single worst drawdown window on the COMPOUNDED equity curve.
  let eq = 1, peak = 1, peakIdx = 0, worstDD = 0, worstStart = 0, worstEnd = 0;
  const eqCurve = [];
  for (let i = 0; i < dailyReturns.length; i++) {
    eq *= (1 + dailyReturns[i] / 100);
    eqCurve.push(eq);
    if (eq > peak) { peak = eq; peakIdx = i; }
    const dd = (eq - peak) / peak;
    if (dd < worstDD) { worstDD = dd; worstStart = peakIdx; worstEnd = i; }
  }
  console.log(`Worst drawdown: ${(worstDD * 100).toFixed(1)}%, from ${dates[worstStart]} (peak) to ${dates[worstEnd]} (trough)\n`);

  // Per-pair contribution DURING that window vs their overall share of trades.
  const windowStart = dates[worstStart], windowEnd = dates[worstEnd];
  console.log(`Per-pair PnL during the drawdown window (${windowStart} to ${windowEnd}):`);
  console.log(['pair', 'tradesInWindow', 'pnlInWindow%', 'totalTrades', '%ofAllTrades', 'winRateInWindow'].join('\t'));
  const rows = [];
  for (const sym of syms) {
    const all = byPair[sym];
    const inWindow = all.filter(t => t.date >= windowStart && t.date <= windowEnd);
    const pnlInWindow = inWindow.reduce((a, t) => a + t.pnlPct, 0);
    const winRateInWindow = inWindow.length ? +(100 * inWindow.filter(t => t.win).length / inWindow.length).toFixed(1) : null;
    rows.push({ sym, tradesInWindow: inWindow.length, pnlInWindow: +pnlInWindow.toFixed(2), totalTrades: all.length, winRateInWindow });
  }
  const totalAllTrades = rows.reduce((a, r) => a + r.totalTrades, 0);
  rows.sort((a, b) => a.pnlInWindow - b.pnlInWindow);
  for (const r of rows) {
    console.log([r.sym, r.tradesInWindow, r.pnlInWindow + '%', r.totalTrades, (100 * r.totalTrades / totalAllTrades).toFixed(1) + '%', (r.winRateInWindow ?? '—') + '%'].join('\t'));
  }

  // How many pairs were net NEGATIVE during the window vs net positive --
  // systemic (most pairs lose) vs idiosyncratic (a few pairs blow up).
  const negCount = rows.filter(r => r.pnlInWindow < 0).length;
  console.log(`\n${negCount} of ${rows.length} pairs were net NEGATIVE during this window (${(100 * negCount / rows.length).toFixed(0)}%) -- ${negCount > rows.length * 0.6 ? 'looks SYSTEMIC (most pairs hit at once)' : 'looks CONCENTRATED (a minority of pairs drove it)'}.`);
}

main();
