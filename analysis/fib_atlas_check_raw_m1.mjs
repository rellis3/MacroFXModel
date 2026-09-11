import { loadM1ForPair } from '../js/volBacktestM1Engine.js';

const PAIRS = ['gbpaud', 'euraud', 'nzdjpy', 'usdcad', 'eurusd'];
for (const pair of PAIRS) {
  try {
    const packed = await loadM1ForPair(pair);
    if (!packed?.times?.length) { console.log(`${pair}: no packed data`); continue; }
    const first = new Date(packed.times[0] * 1000).toISOString();
    const last = new Date(packed.times[packed.times.length - 1] * 1000).toISOString();
    console.log(`${pair}\tbars=${packed.times.length}\tfirst=${first}\tlast=${last}`);
  } catch (e) {
    console.log(`${pair}: ERROR ${e.message}`);
  }
}
