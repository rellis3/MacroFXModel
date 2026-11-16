// node js/terminal/workspaceCore.test.mjs: the layout model (shape, unknown surfaces dropped safely, no overlap, starters, files).
import assert from 'node:assert/strict';
import { COLS, MAX_TILES, STARTERS, PANELS, sanitizeLayout, resolve, addTile, removeTile, moveTile, resizeTile, exportLayout, parseImport, uniqueName, sanitizeStore, homeSection, cleanName, snap, isPanel } from './workspaceCore.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const noOverlap = tiles => tiles.every((a, i) => tiles.every((b, j) => i === j || !(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)));
const inGrid = tiles => tiles.every(t => t.x >= 0 && t.w >= 1 && t.x + t.w <= COLS && t.y >= 0 && t.h >= 1 && Number.isInteger(t.x + t.y + t.w + t.h));

// shape: every kind of junk comes out as a safe layout and never throws
for (const junk of [null, undefined, 5, 'x', [], {}, { tiles: 'no' }, { tiles: [null, 3, {}, { id: 5 }] }, { name: '<b>x</b>', tiles: [{ id: 'panel.macro.curve', x: 'a', y: -9, w: 999, h: 0 }] }]) {
  const { layout } = sanitizeLayout(junk);
  ok(layout.v === 1 && typeof layout.name === 'string' && layout.name.length > 0 && Array.isArray(layout.tiles) && inGrid(layout.tiles) && noOverlap(layout.tiles), `junk ${JSON.stringify(junk)} is made safe`);
}
const one = sanitizeLayout({ name: '<b>Hi</b>', tiles: [{ id: 'panel.macro.curve', x: 'a', y: -9, w: 999, h: 0 }] }).layout;
ok(one.name === 'bHib' || !/[<>]/.test(one.name), 'angle brackets are stripped from names');
ok(one.tiles[0].w === COLS && one.tiles[0].x === 0 && one.tiles[0].y === 0 && one.tiles[0].h >= 3, 'numbers clamp into the grid');

// unknown surfaces dropped, with a reason
const d = sanitizeLayout({ name: 'x', tiles: [{ id: 'panel.macro.curve', x: 0, y: 0, w: 6, h: 6 }, { id: 'panel.gone.away', x: 6, y: 0, w: 6, h: 6 }, { id: 'tab.macro', x: 0, y: 6, w: 6, h: 6 }, { id: 'panel.macro.curve', x: 6, y: 6, w: 6, h: 6 }] });
ok(d.layout.tiles.length === 1 && d.dropped.length === 3, 'unknown, non-panel and duplicate tiles are dropped');
ok(d.dropped.some(x => x.id === 'panel.gone.away') && d.dropped.every(x => x.why), 'each drop says why');

// cap
const ids = [...PANELS.keys()];
ok(sanitizeLayout({ tiles: ids.slice(0, 40).map((id, i) => ({ id, x: 0, y: i * 3, w: 4, h: 3 })) }).layout.tiles.length === MAX_TILES, 'tile count capped');

// no overlap, idempotent, moved tile keeps its place
const lay = [{ id: 'a', x: 0, y: 0, w: 6, h: 6 }, { id: 'b', x: 3, y: 2, w: 6, h: 6 }, { id: 'c', x: 0, y: 0, w: 12, h: 4 }];
const r = resolve(lay);
ok(noOverlap(r) && r.map(t => t.id).join() === 'a,b,c', 'resolve removes overlap and keeps order');
ok(JSON.stringify(resolve(r)) === JSON.stringify(r), 'resolve is idempotent');
const f = resolve(lay, 'b');
ok(f.find(t => t.id === 'b').y === 2 && noOverlap(f), 'the tile being moved keeps its place, the others give way');

// editing
let t = [];
t = addTile(t, 'panel.macro.curve'); t = addTile(t, 'panel.macro.vol'); t = addTile(t, 'panel.macro.curve'); t = addTile(t, 'panel.nope');
ok(t.length === 2 && noOverlap(t) && inGrid(t), 'addTile: known only, once each, no overlap');
t = moveTile(t, 'panel.macro.vol', 100, 0);
ok(inGrid(t) && noOverlap(t), 'moveTile clamps to the grid');
t = resizeTile(t, 'panel.macro.vol', 3, 1);
ok(t.find(x => x.id === 'panel.macro.vol').w >= 2 && t.find(x => x.id === 'panel.macro.vol').h >= 3, 'resizeTile keeps the minimum size');
ok(moveTile(t, 'zzz', 1, 1) === t && resizeTile(t, 'zzz', 1, 1) === t, 'unknown id: unchanged');
ok(removeTile(t, 'panel.macro.vol').length === 1, 'removeTile');
ok(snap(137, 48) === 3 && snap(10, 0) === 0, 'snap');

// starters: registered panels only, valid shape
ok(STARTERS.length >= 3 && STARTERS.map(s => s.name).join() === 'Morning,Rates,Event day', 'the three starters');
for (const s of STARTERS) {
  const { layout, dropped } = sanitizeLayout(s);
  ok(dropped.length === 0 && layout.tiles.length === s.tiles.length, `starter ${s.name}: every tile is a registered panel`);
  ok(noOverlap(s.tiles) && inGrid(s.tiles), `starter ${s.name}: a valid grid`);
}

// home sections
ok(homeSection('panel.macro.curve') === 'macro' && homeSection('panel.ov.book') === 'overview' && homeSection('panel.asset.volclock') === 'assets' && homeSection('x') === null, 'home sections');
for (const id of PANELS.keys()) ok(homeSection(id) !== null, `panel ${id} has a home section`);

// files
const exp = exportLayout({ name: 'My view', tiles: STARTERS[1].tiles });
const imp = parseImport(exp);
ok(imp.ok && imp.layout.name === 'My view' && imp.layout.tiles.length === STARTERS[1].tiles.length, 'export then import round-trips');
ok(!parseImport('{nope').ok && !parseImport('{"kind":"other"}').ok && !parseImport(JSON.stringify({ kind: 'desk-workspace', v: 2, tiles: [] })).ok, 'bad files are refused in words');
const partial = parseImport(JSON.stringify({ kind: 'desk-workspace', v: 1, name: 'p', tiles: [{ id: 'panel.macro.curve', x: 0, y: 0, w: 6, h: 6 }, { id: 'panel.removed', x: 6, y: 0, w: 6, h: 6 }] }));
ok(partial.ok && partial.layout.tiles.length === 1 && partial.dropped.length === 1, 'an old file with a removed panel still loads, minus that tile');
ok(!parseImport(JSON.stringify({ kind: 'desk-workspace', v: 1, name: 'p', tiles: [{ id: 'panel.removed', x: 0, y: 0, w: 6, h: 6 }] })).ok, 'a file of only unknown tiles is refused');

// names and the saved list
ok(uniqueName('Rates', ['rates', 'Rates 2']) === 'Rates 3' && uniqueName('', []) === 'Untitled' && cleanName('  a   b ') === 'a b', 'names');
const st = sanitizeStore({ layouts: [{ name: 'A', tiles: STARTERS[0].tiles }, { name: 'a', tiles: STARTERS[0].tiles }, { name: 'B', tiles: [] }, 7, { name: 'C', tiles: [{ id: 'panel.nope', x: 0, y: 0, w: 4, h: 4 }] }] });
ok(st.layouts.length === 1 && st.layouts[0].name === 'A', 'store: duplicates, empty and all-unknown layouts dropped');
ok(isPanel('panel.macro.curve') && !isPanel('tab.macro'), 'isPanel');
console.log(`workspaceCore: ${n} checks OK`);
