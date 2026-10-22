// Tests for the chain layout.   node js/chainLayout.test.mjs
import { layoutScore } from './chainLayout.js';
import { CHAIN_LAYOUT, CHAIN_NODES, CHAIN_LINKS } from './macroChain.js';
import { CHAIN_POS } from './newsletter.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

const links = CHAIN_LINKS.map(l => l.id.split('-'));
const OLD = { oil: [0, 0], bei: [1, 0], us10y: [2, 0], real: [3, 0], dxy: [4, 0], audusd: [5, 0], usdcad: [0, 1], crack: [1, 1], us30y: [2, 1], gold: [4, 1], usdjpy: [5, 1], vix: [0, 2], hy: [1, 2], spx: [2, 2], nq: [3, 2], copper: [4, 2], btc: [5, 2], funding: [3, 1], giltgap: [0, 3], gbpusd: [1, 3], bundgap: [2, 3], eurusd: [3, 3], jgbgap: [4, 3], us2y: [5, 3] };

ok('every chain node has exactly one chip, and no chip is unknown', Object.keys(CHAIN_NODES).every(k => CHAIN_LAYOUT[k]) && Object.keys(CHAIN_LAYOUT).every(k => CHAIN_NODES[k]));
const slots = Object.values(CHAIN_LAYOUT).map(([c, r]) => `${c},${r}`);
ok('no two chips share a slot, and all slots are inside the 6 x 4 grid', new Set(slots).size === slots.length && Object.values(CHAIN_LAYOUT).every(([c, r]) => c >= 0 && c < 6 && r >= 0 && r < 4));
ok('both pages read the same layout', CHAIN_POS === CHAIN_LAYOUT);
ok('every link joins two chips that exist', links.every(([a, b]) => CHAIN_LAYOUT[a] && CHAIN_LAYOUT[b]));

const now = layoutScore(CHAIN_LAYOUT, links), old = layoutScore(OLD, links);
ok('the hand-laid layout it replaced had 14 crossing pairs and 16 lines under other chips (the reason for the change)', old.cross === 14 && old.hidden === 16, JSON.stringify(old));
ok('the current layout has no crossing lines', now.cross === 0, JSON.stringify(now));
ok('at most one line runs under a chip it has nothing to do with', now.hidden <= 1, JSON.stringify(now));
ok('lines are shorter overall than before', now.len < old.len, `${now.len} vs ${old.len}`);
ok('the spine oil -> inflation -> 10Y -> real yield keeps the top row, in order', ['oil', 'bei', 'us10y', 'real'].every((k, i) => CHAIN_LAYOUT[k][0] === i && CHAIN_LAYOUT[k][1] === 0));
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
