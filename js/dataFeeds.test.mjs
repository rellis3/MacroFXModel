// Tests for js/dataFeeds.js — the feed registry behind the 🗄 Data Map.
//
// The map is only worth having if it cannot quietly fall behind the code, which is what
// happened to the hand-kept Site Map and API Map. So these check the registry against
// the repo in the directions that drift:
//   - a host the server fetches that no feed claims        (a new feed nobody described)
//   - an endpoint a feed lists that the server does not serve (a renamed/removed route)
//   - a health id no health row produces                    (a feed that can never show fresh)
//   - a series key that matches nothing in js/dataCatalogue.js
//
// Run:  node --test js/dataFeeds.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEEDS, FEED_CATEGORIES, IGNORE_HOSTS } from './dataFeeds.js';
import { CATALOGUE } from './dataCatalogue.js';
import { uncataloguedHosts } from './dataCatalogueCore.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const jsFiles = fs.readdirSync(path.join(root, 'js')).filter(f => /\.m?js$/.test(f) && !/\.test\./.test(f));
const SERVER = read('server.js');
const ROUTES = [SERVER, read('_worker.js'), ...jsFiles.filter(f => /Routes\.js$/.test(f)).map(f => read('js/' + f))].join('\n');

test('every feed is complete enough to read on the map', () => {
  const cats = new Set(FEED_CATEGORIES.map(c => c.id));
  const ids = new Set();
  for (const f of FEEDS) {
    assert.ok(!ids.has(f.id), `duplicate feed id ${f.id}`); ids.add(f.id);
    for (const k of ['name', 'provider', 'category', 'purpose', 'refresh'])
      assert.ok(f[k] && String(f[k]).length > 2, `${f.id} is missing ${k}`);
    assert.ok(cats.has(f.category), `${f.id} has unknown category ${f.category}`);
  }
});

test('the server fetches from no host that the registry does not describe', () => {
  // server.js plus every server-side js/ module, the same text /api/data-catalogue scans
  const text = [SERVER, ...jsFiles.map(f => read('js/' + f))].filter(t => /\bfetch\s*\(|https?:\/\//.test(t)).join('\n');
  const missing = uncataloguedHosts(text, FEEDS, IGNORE_HOSTS);
  assert.deepEqual(missing, [], `add these hosts to a feed's \`hosts\` in js/dataFeeds.js (or IGNORE_HOSTS if not data): ${missing.join(', ')}`);
});

test('every endpoint a feed lists is actually served', () => {
  const missing = [];
  for (const f of FEEDS) for (const ep of f.endpoints ?? []) {
    const served = [`'${ep}'`, `"${ep}"`, `\`${ep}`, `'${ep}/`, `'${ep}?`].some(s => ROUTES.includes(s));
    if (!served) missing.push(`${f.id} ${ep}`);
  }
  assert.deepEqual(missing, []);
});

test('every health id is produced by /api/data-health', () => {
  for (const f of FEEDS) for (const id of f.health ?? []) {
    if (id.startsWith('cvol:')) continue;               // discovered from /api/cvol at run time
    assert.ok(SERVER.includes(`push('${id}'`), `${f.id}: no data-health row pushes '${id}'`);
  }
});

test('every series key names rows in the series catalogue', () => {
  const keys = new Set(CATALOGUE.flatMap(c => c.readBy ?? []));
  for (const f of FEEDS) for (const k of f.series ?? []) assert.ok(keys.has(k), `${f.id}: no catalogue row is readBy '${k}'`);
});
