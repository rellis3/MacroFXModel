// Follow-up to fib_atlas_live_vs_backtest_severity.mjs (direct owner
// challenge, 2026-09-18: "feels like you're pointing at a known issue
// because it's easier to blame" -- fair). That script compared live
// decisions against RAW margin>=2 touches, which doesn't control for the
// gap-efficiency/cost-efficiency filters the live plan producer ALREADY
// applies before a zone ever reaches the bot (FIB_ATLAS_MIN_COST_RATIO=3,
// FIB_ATLAS_MAX_GAP_MIN=30, asiaFibAtlasRoutes.js). A touch the backtest
// counts as margin>=2 but that the SAME gap/cost filters would have
// excluded from the live plan anyway is not a timing bug -- it's the
// filter working as designed. This reruns the same comparison against the
// FILTERED backtest set to isolate how much of the "silent miss" rate
// survives once that confound is controlled for.
const BASE = 'https://macrofxmodel-production.up.railway.app';
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];
const LADDERS = ['asia', 'monday'];

async function fetchJson(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) return null;
    return r.json();
  } catch (e) { return null; }
}

async function main() {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10);
  console.log(`Window: ${from} to ${to}`);

  const tl = await fetchJson(`${BASE}/api/fib-atlas-bot/trade-log?from=${from}&to=${to}`);
  const decisions = (tl?.decisions || []).filter(d => d.status === 'entered');
  const decisionKey = d => `${(d.pair||'').toLowerCase()}|${d.ladder}|${d.side}|${d.rung}|${new Date(d.t*1000).toISOString().slice(0,10)}`;
  const decisionByKey = new Map();
  for (const d of decisions) {
    const k = decisionKey(d);
    if (!decisionByKey.has(k)) decisionByKey.set(k, []);
    decisionByKey.get(k).push(d);
  }

  // RAW margin>=2 (previous run's basis) vs FILTERED (same gap/cost filters
  // the live plan producer already applies: minCostRatio=3, maxGapMin=30) --
  // run BOTH so the comparison is visible side by side, not just asserted.
  let rawTotal = 0, rawMiss = 0;
  let filteredTotal = 0, filteredMiss = 0;
  const filteredMissRows = [];

  for (const pair of PAIRS) {
    for (const ladder of LADDERS) {
      const routePrefix = ladder === 'asia' ? 'asia-fib-atlas' : 'monday-fib-atlas';
      const rawVt = await fetchJson(`${BASE}/api/${routePrefix}/vote-trades/${pair.toUpperCase()}?minMargin=2`);
      const filteredVt = await fetchJson(`${BASE}/api/${routePrefix}/vote-trades/${pair.toUpperCase()}?minMargin=2&minCostRatio=3&maxGapMin=30`);
      if (rawVt?.trades) {
        for (const t of rawVt.trades.filter(t => t.date >= from && t.date <= to)) {
          rawTotal++;
          const k = `${pair}|${ladder}|${t.side}|${t.rung}|${t.date}`;
          if (!decisionByKey.has(k)) rawMiss++;
        }
      }
      if (filteredVt?.trades) {
        for (const t of filteredVt.trades.filter(t => t.date >= from && t.date <= to)) {
          filteredTotal++;
          const k = `${pair}|${ladder}|${t.side}|${t.rung}|${t.date}`;
          if (!decisionByKey.has(k)) {
            filteredMiss++;
            if (filteredMissRows.length < 50) filteredMissRows.push({ pair, ladder, date: t.date, side: t.side, rung: t.rung, time: new Date(t.time*1000).toISOString() });
          }
        }
      }
    }
  }

  console.log(`\n=== RAW margin>=2 (no gap/cost filter) ===`);
  console.log(`total=${rawTotal} silentMiss=${rawMiss} (${(100*rawMiss/rawTotal).toFixed(1)}%)`);
  console.log(`\n=== FILTERED (same gap/cost filters the live plan already applies) ===`);
  console.log(`total=${filteredTotal} silentMiss=${filteredMiss} (${filteredTotal ? (100*filteredMiss/filteredTotal).toFixed(1) : '-'}%)`);
  console.log(`\nDifference: ${rawTotal - filteredTotal} of the raw ${rawTotal} touches were excluded by gap/cost filters that ALREADY explain their absence from the live decision log -- not a timing bug.`);
  console.log(`Of the ${filteredTotal} that SHOULD have been live-eligible after the same filtering, ${filteredMiss} (${filteredTotal ? (100*filteredMiss/filteredTotal).toFixed(1) : '-'}%) still show zero live response -- this is the real, controlled number.`);

  console.log(`\nFiltered silent-miss rows (up to 50 of ${filteredMissRows.length}):`);
  console.log('pair\tladder\tdate\tside\trung\ttime');
  for (const r of filteredMissRows) console.log(`${r.pair}\t${r.ladder}\t${r.date}\t${r.side}\t${r.rung}\t${r.time}`);
}

main();
