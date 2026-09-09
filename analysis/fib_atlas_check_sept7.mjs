import { getJSON } from '../js/r2Store.js';

for (const [prefix, pair] of [['asia-fib-atlas', 'gbpaud'], ['monday-fib-atlas', 'gbpaud'], ['asia-fib-atlas', 'audusd'], ['monday-fib-atlas', 'audusd']]) {
  const stored = await getJSON(`${prefix}/${pair}-votetrades.json`);
  if (!stored) { console.log(`${prefix}/${pair}: MISSING`); continue; }
  const sept7 = (stored.trades || []).filter(t => t.date === '2026-09-07');
  console.log(`\n=== ${prefix}/${pair} — generatedAt: ${stored.generatedAt} ===`);
  console.log(`2026-09-07 touches with margin>=1: ${sept7.length}`);
  for (const t of sept7) {
    console.log(JSON.stringify({ time: new Date(t.time * 1000).toISOString(), side: t.side, rung: t.level ?? t.rung, decision: t.decision, margin: t.margin, entry: t.entry, win: t.win, pnlPct: t.pnlPct, gapMin: t.gapMin }));
  }
}
