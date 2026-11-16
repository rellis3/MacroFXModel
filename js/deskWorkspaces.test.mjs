// node js/deskWorkspaces.test.mjs: the server half of workspaces (save, rename, delete, caps, who may call).
import assert from 'node:assert/strict';
import { applyAction, handle, readStore, KEY } from './deskWorkspaces.js';
import { MAX_LAYOUTS } from './terminal/workspaceCore.js';
const T = [{ id: 'panel.macro.curve', x: 0, y: 0, w: 6, h: 8 }];
const mem = () => { const m = new Map(); return { m, get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; };
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

const s = { v: 1, layouts: [] };
let r = applyAction(s, { action: 'save', name: 'Mine', layout: { tiles: T } });
ok(r.ok && r.store.layouts.length === 1 && r.store.layouts[0].name === 'Mine', 'save adds');
r = applyAction(r.store, { action: 'save', name: 'mine', layout: { tiles: [{ ...T[0], w: 12 }] } });
ok(r.ok && r.store.layouts.length === 1 && r.store.layouts[0].tiles[0].w === 12, 'save over the same name (any case) replaces it');
ok(!applyAction(s, { action: 'save', name: 'Rates', layout: { tiles: T } }).ok, 'a starter name is refused');
ok(!applyAction(s, { action: 'save', name: 'Empty', layout: { tiles: [{ id: 'panel.nope', x: 0, y: 0, w: 4, h: 4 }] } }).ok, 'only unknown surfaces = nothing to save');
const u = applyAction(s, { action: 'save', name: 'Mixed', layout: { tiles: [...T, { id: 'panel.nope', x: 0, y: 9, w: 3, h: 3 }] } });
ok(u.ok && u.store.layouts[0].tiles.length === 1, 'unknown surfaces are dropped, the rest saved');
ok(applyAction(r.store, { action: 'rename', name: 'MINE', newName: 'Desk' }).store.layouts[0].name === 'Desk', 'rename');
ok(!applyAction(r.store, { action: 'rename', name: 'mine', newName: 'Morning' }).ok, 'rename onto a starter refused');
ok(applyAction(r.store, { action: 'delete', name: 'Mine' }).store.layouts.length === 0, 'delete');
ok(applyAction(r.store, { action: 'delete', name: 'zzz' }).status === 404, 'delete missing = 404');
ok(applyAction(s, { action: 'wipe', name: 'x' }).status === 400 && applyAction(s, { action: 'save', name: '  ' }).status === 400, 'bad action / no name');
let big = s;
for (let i = 0; i < MAX_LAYOUTS; i++) big = applyAction(big, { action: 'save', name: `L${i}`, layout: { tiles: T } }).store;
ok(big.layouts.length === MAX_LAYOUTS && applyAction(big, { action: 'save', name: 'one more', layout: { tiles: T } }).status === 400, 'capped');
ok(applyAction(big, { action: 'save', name: 'L3', layout: { tiles: T } }).ok, 'replacing at the cap still works');

const kv = mem();
ok((await handle({ method: 'GET', role: null, kv })).status === 401, 'no session: 401');
ok((await handle({ method: 'GET', role: 'viewer', kv, on: () => false })).status === 403, 'desk login with the switch off: 403 (reads)');
ok((await handle({ method: 'POST', role: 'viewer', kv, on: () => false, body: { action: 'save', name: 'x', layout: { tiles: T } } })).status === 403, 'desk login write with the switch off: 403');
const w = await handle({ method: 'POST', role: 'owner', kv, body: { action: 'save', name: 'Mine', layout: { tiles: T } } });
ok(w.status === 200 && kv.m.has(KEY), 'owner saves to the key');
ok((await handle({ method: 'GET', role: 'viewer', kv, on: id => id === 'tab.workspace' })).json.layouts.length === 1, 'desk login reads once switched on');
kv.m.set(KEY, 'not json');
ok((await readStore(kv)).layouts.length === 0, 'a corrupt store reads as empty');
console.log(`deskWorkspaces: ${n} checks OK`);
