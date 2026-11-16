// node js/terminal/workspaceState.test.mjs: the Workspace controller (load, save, rename, delete, import, offline, local memory).
import assert from 'node:assert/strict';
import { createWorkspaceState, LOCAL_KEY } from './workspaceState.js';
import { STARTERS } from './workspaceCore.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const memStore = () => { const m = new Map(); return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const fakeApi = (seed = []) => {
  let layouts = seed.slice(); const calls = [];
  return { calls, list: async () => ({ ok: true, layouts }), post: async b => {
    calls.push(b);
    if (b.action === 'save') { layouts = [...layouts.filter(l => l.name !== b.name), { name: b.name, tiles: b.layout.tiles }]; return { ok: true, layouts }; }
    if (b.action === 'delete') { layouts = layouts.filter(l => l.name !== b.name); return { ok: true, layouts }; }
    if (b.action === 'rename') { layouts = layouts.map(l => (l.name === b.name ? { ...l, name: b.newName } : l)); return { ok: true, layouts }; }
    return { ok: false, error: 'no' };
  } };
};
const T = [{ id: 'panel.macro.curve', x: 0, y: 0, w: 6, h: 8 }];

{ // starters work with nothing else; first screen is Morning
  const s = await createWorkspaceState({ api: { list: async () => { throw new Error('offline'); }, post: async () => { throw new Error('offline'); } }, store: memStore() }).init();
  ok(s.current.name === 'Morning' && s.current.source === 'starter' && !s.dirty, 'starts on Morning');
  ok(/could not be reached/.test(s.note), 'offline: says so in words');
  ok(s.load('rates').ok && s.current.name === 'Rates' && s.current.tiles.length === STARTERS[1].tiles.length, 'load a starter by name, any case');
  ok(s.load('event').ok && s.current.name === 'Event day', 'a unique prefix is enough');
  ok(!s.load('nope').ok && /Try Morning, Rates, Event day/.test(s.load('nope').error), 'unknown name: an error that lists the names');
  const r = await s.save();
  ok(!r.ok && r.needName, 'a starter cannot be saved over: it asks for a name');
  ok(!(await s.save('Rates')).ok, 'nor under a starter name');
  ok(!(await s.save('Mine')).ok && /reach/i.test((await s.save('Mine')).error), 'offline save fails in words and does not mark it saved');
}
{ // save, edit, rename, delete
  const api = fakeApi(), store = memStore();
  const s = await createWorkspaceState({ api, store }).init();
  s.setTiles(T);
  ok(s.dirty && s.current.tiles.length === 1, 'editing marks it unsaved');
  ok((await s.save('My view')).ok && !s.dirty && s.current.source === 'saved' && s.names().includes('My view'), 'save as a new name');
  s.add('panel.macro.vol'); ok(s.dirty && s.current.tiles.length === 2, 'add a tile');
  ok(!s.add('panel.macro.vol').ok && !s.add('panel.nope').ok, 'duplicate and unknown panels refused in words');
  ok((await s.save()).ok && api.calls.at(-1).name === 'My view' && api.calls.at(-1).layout.tiles.length === 2, 'save again under the open name');
  s.move('panel.macro.vol', 6, 0); s.resize('panel.macro.vol', 6, 12); s.removeTile('panel.macro.curve');
  ok(s.current.tiles.length === 1 && s.dirty, 'move, resize, remove');
  ok((await s.rename('Desk view')).ok && s.current.name === 'Desk view' && s.names().includes('Desk view') && !s.names().includes('My view'), 'rename');
  ok(!(await s.rename('')).ok || true, 'rename with nothing does not throw');
  ok((await s.remove()).ok && !s.names().includes('Desk view') && s.current.source === 'new', 'delete removes it from the shared list but keeps the open grid');
  ok(!(await createWorkspaceState({ api: fakeApi(), store }).init().then(x => x.remove())).ok, 'a starter cannot be deleted');
}
{ // local memory across a reload
  const api = fakeApi(), store = memStore();
  const a = await createWorkspaceState({ api, store }).init();
  a.load('Rates'); a.removeTile('panel.macro.curve');
  const b = await createWorkspaceState({ api, store }).init();
  ok(b.current.name === 'Rates' && b.dirty && b.current.tiles.length === STARTERS[1].tiles.length - 1, 'this browser reopens where it left off, unsaved edits included');
  store.m.set(LOCAL_KEY, '{broken'); ok((await createWorkspaceState({ api, store }).init()).current.name === 'Morning', 'a corrupt local copy falls back to Morning');
  store.m.set(LOCAL_KEY, JSON.stringify({ name: 'Old', source: 'saved', tiles: [{ id: 'panel.removed', x: 0, y: 0, w: 4, h: 4 }, ...T] }));
  const c = await createWorkspaceState({ api, store }).init();
  ok(c.current.tiles.length === 1 && /left out/.test(c.note), 'a panel removed since is dropped and the note says so');
  store.m.set(LOCAL_KEY, JSON.stringify({ name: 'Gone', tiles: [{ id: 'panel.removed', x: 0, y: 0, w: 4, h: 4 }] }));
  ok((await createWorkspaceState({ api, store: store }).init()).current.name === 'Morning', 'a local copy of only removed panels is ignored');
  ok((await createWorkspaceState({ api, store: null }).init()).current.name === 'Morning', 'no storage at all still works');
}
{ // shared list loads, export and import
  const api = fakeApi([{ name: 'Team', tiles: T }]);
  const s = await createWorkspaceState({ api, store: memStore() }).init();
  ok(s.names().join() === 'Team' && s.load('team').ok && s.current.source === 'saved', 'the shared list is loaded');
  const text = s.exportText();
  ok(JSON.parse(text).kind === 'desk-workspace' && s.exportFileName() === 'team.workspace.json', 'export');
  const i = s.importText(text);
  ok(i.ok && s.current.name === 'Team 2' && s.current.source === 'new' && s.dirty, 'import opens it as a new unsaved layout with a free name');
  ok(!s.importText('nope').ok && !s.importText('{"kind":"desk-workspace","v":1,"tiles":[]}').ok, 'bad imports refused in words');
  let fired = 0; const off = s.subscribe(() => { fired++; throw new Error('a bad listener'); });
  s.load('Morning'); ok(fired === 1, 'subscribers are told; a throwing one does not break the controller'); off(); s.load('Rates'); ok(fired === 1, 'unsubscribe');
}
console.log(`workspaceState: ${n} checks OK`);
