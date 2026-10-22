// Exercise the live job's flag-setting on real inputs: production oi_store (read-only GET), CBOE CSVs, local M1 history.
import path from 'path'; import { pathToFileURL } from 'url';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
const { createPaperRecord } = await import(pathToFileURL(path.resolve('../MacroFXModel-paper/js/paperRecordRoutes.js')).href);
const { INSTRUMENTS } = await import(pathToFileURL(path.resolve('../MacroFXModel-paper/js/paperRecordCore.js')).href);
const oi = await (await fetch('https://macrofxmodel-production.up.railway.app/api/kv/get?key=oi_store')).text();
const liveCache = new Map();
for (const i of INSTRUMENTS) liveCache.set(i.key, { packed: await loadM1ForPair(i.key) });
const kv = { getStrict: async () => null, get: async k => k === 'oi_store' ? oi : null, put: async () => {} };
const job = createPaperRecord({ kv, getFastLive: async () => ({}), liveCache });
const store = { days: {}, log: [] };
await job._setFlags(store, '2026-10-05');
for (const [k, f] of Object.entries(store.days['2026-10-05'].flags)) console.log(k.padEnd(7), JSON.stringify(f));
