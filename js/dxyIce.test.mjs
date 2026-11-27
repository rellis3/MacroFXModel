// node js/dxyIce.test.mjs
import assert from 'node:assert/strict';
import { dxyFrom, dxySeries } from './dxyIce.js';

// ICE's published close for 2024-12-31 was about 108.49 (EURUSD 1.0354, USDJPY 157.20, GBPUSD 1.2516, USDCAD 1.4382, USDSEK 11.0436, USDCHF 0.9074).
const v = dxyFrom({ eurusd: 1.0354, usdjpy: 157.20, gbpusd: 1.2516, usdcad: 1.4382, usdsek: 11.0436, usdchf: 0.9074 });
assert.ok(Math.abs(v - 108.49) < 0.15, `DXY ${v}`);
// a missing leg gives null, never a partial index
assert.equal(dxyFrom({ eurusd: 1.0354, usdjpy: 157.2 }), null);
assert.equal(dxyFrom({ eurusd: 0, usdjpy: 157.20, gbpusd: 1.2516, usdcad: 1.4382, usdsek: 11.0436, usdchf: 0.9074 }), null);
// a stronger euro means a lower DXY
const up = dxyFrom({ eurusd: 1.10, usdjpy: 157.20, gbpusd: 1.2516, usdcad: 1.4382, usdsek: 11.0436, usdchf: 0.9074 });
assert.ok(up < v);
// on a series, a day missing any leg is null and nothing carries forward
const s = dxySeries({ eurusd: [1.0354, 1.04, null], usdjpy: [157.2, 157, 156], gbpusd: [1.2516, 1.25, 1.25], usdcad: [1.4382, 1.43, 1.43], usdsek: [11.0436, 11, 11], usdchf: [0.9074, 0.9, 0.9] }, 3);
assert.ok(s[0] != null && s[1] != null && s[1] < s[0]);
assert.equal(s[2], null);
assert.deepEqual(dxySeries({}, 2), [null, null]);
console.log('dxyIce: 8 checks OK');
