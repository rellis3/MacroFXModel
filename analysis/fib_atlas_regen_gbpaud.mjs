import { runOne as runOneAsia } from '../js/asiaFibAtlasRoutes.js';
import { runOne as runOneMonday } from '../js/mondayFibAtlasRoutes.js';
import { getJSON } from '../js/r2Store.js';

console.log('Regenerating gbpaud (asia)...');
await runOneAsia('gbpaud', { onLog: m => console.log('  [asia]', m) });
console.log('Regenerating gbpaud (monday)...');
await runOneMonday('gbpaud', { onLog: m => console.log('  [monday]', m) });

for (const [prefix, label] of [['asia-fib-atlas', 'asia'], ['monday-fib-atlas', 'monday']]) {
  const stored = await getJSON(`${prefix}/gbpaud-votetrades.json`);
  console.log(`\n=== gbpaud (${label}) — generatedAt: ${stored?.generatedAt} ===`);
  const sept7 = (stored?.trades || []).filter(t => t.date === '2026-09-07');
  console.log(`2026-09-07 touches: ${sept7.length}`);
  for (const t of sept7) {
    console.log(JSON.stringify({ time: new Date(t.time * 1000).toISOString(), side: t.side, rung: t.level ?? t.rung, decision: t.decision, margin: t.margin, entry: t.entry, win: t.win, pnlPct: t.pnlPct }));
  }
}
