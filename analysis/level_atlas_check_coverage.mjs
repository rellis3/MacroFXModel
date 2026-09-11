import { getJSON } from '../js/r2Store.js';

const PAIRS = ['gbpaud', 'euraud', 'nzdjpy', 'eurusd', 'gbpusd'];
for (const pair of PAIRS) {
  const stored = await getJSON(`level-atlas/${pair}-votetrades.json`);
  if (!stored) { console.log(`${pair}: MISSING (may not exist for Level Atlas, or different key shape)`); continue; }
  const trades = stored.trades || [];
  const lastDate = trades.reduce((max, t) => t.date > max ? t.date : max, '');
  console.log(`${pair}\tgeneratedAt=${stored.generatedAt}\tlastTradeDate=${lastDate}\ttrades=${trades.length}`);
}
