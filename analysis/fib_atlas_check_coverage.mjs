import { getJSON } from '../js/r2Store.js';

const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];

for (const pair of PAIRS) {
  const stored = await getJSON(`asia-fib-atlas/${pair}-votetrades.json`);
  if (!stored) { console.log(`${pair}: MISSING`); continue; }
  const sept7 = (stored.trades || []).filter(t => t.date === '2026-09-07').length;
  const lastDate = (stored.trades || []).reduce((max, t) => t.date > max ? t.date : max, '');
  console.log(`${pair}\tgeneratedAt=${stored.generatedAt}\tlastTradeDate=${lastDate}\tsept7Touches=${sept7}`);
}
