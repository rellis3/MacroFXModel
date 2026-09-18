// Direct owner ask (2026-09-18): "how bad does it look" -- quantify the
// live-vs-backtest gap across the FULL live-trading pair universe over a
// real recent window, not just the 2 USDCAD examples found earlier. Three
// numbers matter: (1) what fraction of backtest-predicted (margin>=2)
// touches have ZERO live decision-log event at all (the plan-staleness
// "silent miss" pattern), (2) what fraction matched a real live decision,
// (3) how many live trades have NO backtest counterpart (the reverse,
// rearm-sensitivity gap). Read-only: fetches already-computed backtest
// vote-trades + the live bot's own decision/trade log over HTTP.
const BASE = 'https://macrofxmodel-production.up.railway.app';
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];
const LADDERS = ['asia', 'monday'];

async function fetchJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) return null;
  return r.json();
}

async function main() {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10);
  console.log(`Window: ${from} to ${to}`);

  const tl = await fetchJson(`${BASE}/api/fib-atlas-bot/trade-log?from=${from}&to=${to}`);
  const decisions = (tl?.decisions || []).filter(d => d.status === 'entered');
  const liveTrades = tl?.trades || [];
  console.log(`Live decision-log "entered" events in window: ${decisions.length}`);
  console.log(`Live real fills in window: ${liveTrades.length}`);

  // Index live entered-decisions by (pair, ladder, side, rung, date) for fast lookup.
  const decisionKey = d => `${(d.pair||'').toLowerCase()}|${d.ladder}|${d.side}|${d.rung}|${new Date(d.t*1000).toISOString().slice(0,10)}`;
  const decisionByKey = new Map();
  for (const d of decisions) {
    const k = decisionKey(d);
    if (!decisionByKey.has(k)) decisionByKey.set(k, []);
    decisionByKey.get(k).push(d);
  }

  let totalBacktestQualifying = 0, silentMisses = 0, matched = 0;
  const silentMissRows = [];

  for (const pair of PAIRS) {
    for (const ladder of LADDERS) {
      const routePrefix = ladder === 'asia' ? 'asia-fib-atlas' : 'monday-fib-atlas';
      const vt = await fetchJson(`${BASE}/api/${routePrefix}/vote-trades/${pair.toUpperCase()}?minMargin=2`);
      if (!vt?.trades) continue;
      const inWindow = vt.trades.filter(t => t.date >= from && t.date <= to);
      for (const t of inWindow) {
        totalBacktestQualifying++;
        const k = `${pair}|${ladder}|${t.side}|${t.rung}|${t.date}`;
        if (decisionByKey.has(k)) {
          matched++;
        } else {
          silentMisses++;
          if (silentMissRows.length < 30) silentMissRows.push({ pair, ladder, date: t.date, side: t.side, rung: t.rung, time: new Date(t.time*1000).toISOString(), win: t.win, pnlPct: t.pnlPct });
        }
      }
    }
  }

  console.log(`\n=== Severity ===`);
  console.log(`Backtest-predicted qualifying (margin>=2) touches in window: ${totalBacktestQualifying}`);
  console.log(`Matched a real live decision-log event: ${matched} (${(100*matched/totalBacktestQualifying).toFixed(1)}%)`);
  console.log(`SILENT MISSES (backtest says margin>=2, live shows nothing at all): ${silentMisses} (${(100*silentMisses/totalBacktestQualifying).toFixed(1)}%)`);

  const silentWins = silentMissRows.filter(r => r.win).length;
  console.log(`\nSample of silent misses (first 30, ${silentMissRows.length} shown), win rate among them: ${silentMissRows.length ? (100*silentWins/silentMissRows.length).toFixed(1) : '-'}%`);
  console.log('pair\tladder\tdate\tside\trung\ttime\twin\tpnlPct');
  for (const r of silentMissRows) console.log(`${r.pair}\t${r.ladder}\t${r.date}\t${r.side}\t${r.rung}\t${r.time}\t${r.win}\t${r.pnlPct}`);

  // Reverse gap: live entered decisions with no backtest counterpart at all.
  let liveNoMatch = 0;
  const backtestKeySet = new Set();
  for (const pair of PAIRS) {
    for (const ladder of LADDERS) {
      const routePrefix = ladder === 'asia' ? 'asia-fib-atlas' : 'monday-fib-atlas';
      const vt = await fetchJson(`${BASE}/api/${routePrefix}/vote-trades/${pair.toUpperCase()}?minMargin=1`);
      if (!vt?.trades) continue;
      for (const t of vt.trades.filter(t => t.date >= from && t.date <= to)) {
        backtestKeySet.add(`${pair}|${ladder}|${t.side}|${t.rung}|${t.date}`);
      }
    }
  }
  for (const d of decisions) {
    const k = decisionKey(d);
    if (!backtestKeySet.has(k)) liveNoMatch++;
  }
  console.log(`\nLive "entered" events with NO backtest touch at ANY margin for that (pair,ladder,side,rung,date): ${liveNoMatch} of ${decisions.length} (${(100*liveNoMatch/decisions.length).toFixed(1)}%)`);
}

main();
