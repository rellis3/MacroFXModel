// Follow-up to fib_atlas_severity_controlled.mjs: those 15 "silent miss" rows
// were only checked against status==='entered' decisions. The live bot ALSO
// logs deliberate, working risk-gate skips (hedge_cap, risk_budget, max_open,
// max_concurrent_per_pair) via _record_decision(..., "skipped", ...). A row
// that matches one of THOSE isn't a silent miss or a staleness bug at all --
// it's a portfolio cap doing its job. Check the full (unfiltered-by-status)
// decision log for each of the 15 rows.
const BASE = 'https://macrofxmodel-production.up.railway.app';
const ROWS = [
  { pair: 'gbpusd', ladder: 'asia', date: '2026-09-16', side: 'below', rung: -4 },
  { pair: 'usdjpy', ladder: 'asia', date: '2026-09-17', side: 'below', rung: -0.25 },
  { pair: 'usdjpy', ladder: 'asia', date: '2026-09-17', side: 'below', rung: -1 },
  { pair: 'audusd', ladder: 'asia', date: '2026-09-14', side: 'below', rung: -0.25 },
  { pair: 'audusd', ladder: 'asia', date: '2026-09-16', side: 'below', rung: -1 },
  { pair: 'audusd', ladder: 'asia', date: '2026-09-16', side: 'below', rung: -2 },
  { pair: 'audusd', ladder: 'asia', date: '2026-09-17', side: 'above', rung: 1.25 },
  { pair: 'nzdusd', ladder: 'asia', date: '2026-09-14', side: 'below', rung: -0.25 },
  { pair: 'nzdusd', ladder: 'asia', date: '2026-09-17', side: 'above', rung: 1.25 },
  { pair: 'nzdusd', ladder: 'asia', date: '2026-09-17', side: 'above', rung: 1.25 },
  { pair: 'usdcad', ladder: 'asia', date: '2026-09-14', side: 'above', rung: 2 },
  { pair: 'usdcad', ladder: 'asia', date: '2026-09-14', side: 'above', rung: 4 },
  { pair: 'usdchf', ladder: 'asia', date: '2026-09-15', side: 'above', rung: 1.25 },
  { pair: 'audjpy', ladder: 'asia', date: '2026-09-16', side: 'above', rung: 1.25 },
  { pair: 'audjpy', ladder: 'asia', date: '2026-09-16', side: 'above', rung: 1.25 },
];

async function fetchJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) return null;
  return r.json();
}

async function main() {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10);
  const tl = await fetchJson(`${BASE}/api/fib-atlas-bot/trade-log?from=${from}&to=${to}`);
  const allDecisions = tl?.decisions || [];
  console.log(`Total decisions of ANY status in window: ${allDecisions.length}`);
  const statusCounts = {};
  for (const d of allDecisions) statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
  console.log('Status breakdown:', statusCounts);

  for (const row of ROWS) {
    const matches = allDecisions.filter(d => {
      const dDate = new Date(d.t * 1000).toISOString().slice(0, 10);
      return (d.pair || '').toLowerCase() === row.pair && d.ladder === row.ladder &&
        dDate === row.date && d.side === row.side && String(d.rung) === String(row.rung);
    });
    if (matches.length) {
      for (const m of matches) {
        console.log(`MATCH  ${row.pair}|${row.ladder}|${row.date}|${row.side}|${row.rung}  ->  status=${m.status} reason=${m.reason || ''} t=${new Date(m.t*1000).toISOString()}`);
      }
    } else {
      console.log(`NOTHING  ${row.pair}|${row.ladder}|${row.date}|${row.side}|${row.rung}  -> genuinely zero decision-log event of any status`);
    }
  }
}

main();
