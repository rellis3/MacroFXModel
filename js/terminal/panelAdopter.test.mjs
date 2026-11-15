// node js/terminal/panelAdopter.test.mjs: panels move into a tile and back, and survive their tab redrawing them (a tiny tree stands in for the DOM).
import assert from 'node:assert/strict';
import { createAdopter } from './panelAdopter.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

class Node {
  constructor(name, attrs = {}) { this.name = name; this.attrs = attrs; this.kids = []; this.parentNode = null; }
  append(k) { k.parentNode?.removeChild(k); k.parentNode = this; this.kids.push(k); return k; }
  insertBefore(k, ref) { k.parentNode?.removeChild(k); const i = this.kids.indexOf(ref); k.parentNode = this; this.kids.splice(i < 0 ? this.kids.length : i, 0, k); return k; }
  removeChild(k) { this.kids = this.kids.filter(x => x !== k); k.parentNode = null; return k; }
  replaceChildren(...ks) { for (const k of [...this.kids]) this.removeChild(k); for (const k of ks) this.append(k); }
  querySelector(sel) { const m = /^\[data-surface="([^"]+)"\]$/.exec(sel); const walk = nd => { for (const k of nd.kids) { if (m && k.attrs?.['data-surface'] === m[1]) return k; const r = walk(k); if (r) return r; } return null; }; return walk(this); }
}
const page = () => {
  const secs = { macro: new Node('section'), overview: new Node('section') }, host = new Node('div');
  const doc = { getElementById: id => secs[id] ?? null, createComment: t => new Node('#comment', { t }) };
  const panel = (id, sec) => { const el = new Node('div', { 'data-surface': id }); secs[sec].append(el); return el; };
  return { doc, secs, host, panel };
};
const homeOf = id => ({ 'panel.macro.curve': 'macro', 'panel.ov.book': 'overview' })[id] ?? null;

{ // adopt, then put back in the same place
  const { doc, secs, host, panel } = page();
  const a = panel('panel.ov.book', 'overview'), b = panel('panel.macro.curve', 'macro'), c = panel('panel.macro.vol', 'macro');
  const ad = createAdopter({ doc, homeOf: id => (id === 'panel.macro.vol' ? 'macro' : homeOf(id)) });
  ok(ad.adopt('panel.macro.curve', host) === 'adopted' && host.kids[0] === b && ad.has('panel.macro.curve'), 'adopted into the tile');
  ok(secs.macro.kids.length === 2 && secs.macro.kids[0].name === '#comment' && secs.macro.kids[1] === c, 'a marker is left where it was');
  ad.release('panel.macro.curve');
  ok(secs.macro.kids[0] === b && secs.macro.kids[1] === c && secs.macro.kids.length === 2 && host.kids.length === 0 && !ad.has('panel.macro.curve'), 'released: back in its old place, no marker left, tile empty');
  ok(ad.release('panel.macro.curve') === false, 'releasing twice is harmless');
  ad.adopt('panel.macro.curve', host); ad.adopt('panel.macro.vol', new Node('div'));
  ad.releaseAll();
  ok(secs.macro.kids[0] === b && secs.macro.kids[1] === c && ad.ids().length === 0, 'releaseAll puts every panel back in order');
  ok(secs.overview.kids[0] === a, 'other tabs untouched');
}
{ // missing: not drawn yet
  const { doc, host } = page();
  const ad = createAdopter({ doc, homeOf });
  ok(ad.adopt('panel.macro.curve', host) === 'missing' && host.kids.length === 0 && !ad.has('panel.macro.curve'), 'a panel its tab has not drawn is reported missing');
  ok(ad.adopt('panel.unknown', host) === 'missing' && ad.findLive('panel.unknown') === null, 'a panel with no home section is missing, not an error');
}
{ // the tab redraws while adopted: the new copy replaces the old
  const { doc, secs, host, panel } = page();
  const ad = createAdopter({ doc, homeOf });
  const old = panel('panel.macro.curve', 'macro');
  ad.adopt('panel.macro.curve', host);
  ok(!ad.stale('panel.macro.curve'), 'nothing newer yet');
  secs.macro.replaceChildren();                       // the tab redraws: its section is rebuilt (our marker goes with it)
  const fresh = panel('panel.macro.curve', 'macro');
  ok(ad.stale('panel.macro.curve'), 'a newer copy in the tab is noticed');
  ok(ad.adopt('panel.macro.curve', host) === 'adopted' && host.kids.length === 1 && host.kids[0] === fresh && host.kids[0] !== old, 'the tile now shows the new copy');
  ad.release('panel.macro.curve');
  ok(secs.macro.kids[0] === fresh && secs.macro.kids.length === 1, 'and it goes back as the only copy: no duplicate, no marker');
}
{ // leaving after the tab redrew: the stale element is dropped, not re-inserted next to the new one
  const { doc, secs, host, panel } = page();
  const ad = createAdopter({ doc, homeOf });
  panel('panel.macro.curve', 'macro'); ad.adopt('panel.macro.curve', host);
  secs.macro.replaceChildren(); const fresh = panel('panel.macro.curve', 'macro');
  ad.releaseAll();
  ok(secs.macro.kids.length === 1 && secs.macro.kids[0] === fresh && host.kids.length === 0, 'releasing a stale element drops it and leaves the new one alone');
}
console.log(`panelAdopter: ${n} checks OK`);
