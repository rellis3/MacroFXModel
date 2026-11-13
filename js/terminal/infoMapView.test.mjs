// js/terminal/infoMapView.test.mjs - the Info map tab's pure builders. Run: node js/terminal/infoMapView.test.mjs
import assert from 'node:assert/strict';
import { counts, filterFamilies, filtersHtml, staleHtml, rowHtml, listHtml, headerHtml, STATUS_ORDER } from './infoMapView.js';
import { FAMILIES, GROUPS } from '../infoMap.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };

t('counts add up', () => {
  const c = counts();
  assert.equal(c.total, FAMILIES.length);
  assert.equal(STATUS_ORDER.reduce((a, k) => a + (c.status[k] ?? 0), 0), c.total);
  assert.equal(c.flagged, FAMILIES.filter(f => f.flag).length);
});

t('filter by status, group, flag and words', () => {
  assert.ok(filterFamilies(FAMILIES, { status: 'DRAWN' }).every(f => f.status === 'DRAWN'));
  assert.ok(filterFamilies(FAMILIES, { group: 'cb' }).every(f => f.group === 'cb'));
  assert.ok(filterFamilies(FAMILIES, { flag: true }).every(f => f.flag));
  const rbnz = filterFamilies(FAMILIES, { q: 'rbnz' });
  assert.ok(rbnz.length >= 1 && rbnz.every(f => /rbnz/i.test(JSON.stringify([f.name, f.family, f.pages, f.routes]))));
  assert.equal(filterFamilies(FAMILIES, { q: 'zzzz-nothing-matches' }).length, 0);
  // every word must match, in any order
  assert.ok(filterFamilies(FAMILIES, { q: 'statement rbnz' }).length >= 1);
  assert.equal(filterFamilies(FAMILIES, {}).length, FAMILIES.length);
});

t('filters mark the pressed button and show counts', () => {
  const html = filtersHtml({ status: 'PACK', group: 'vol', flag: true, q: 'a "quote"' });
  assert.match(html, /data-im-status="PACK" aria-pressed="true"/);
  assert.match(html, /data-im-group="vol" aria-pressed="true"/);
  assert.match(html, /data-im-flag checked/);
  assert.match(html, /value="a &quot;quote&quot;"/);
});

t('the stale box names the RBNZ block and the OANDA books', () => {
  const html = staleHtml();
  assert.match(html, /RBNZ/);
  assert.match(html, /OANDA/);
  assert.match(html, /class="chip gold"/);
  assert.equal(staleHtml([]), '');
});

t('a row opens to its detail, links the page and the tab, and escapes text', () => {
  const f = { ...FAMILIES.find(x => x.status === 'DRAWN' && x.tab), name: 'A <b>name</b>' };
  const html = rowHtml(f, { pages: [{ file: 'x.html', exists: true }, { file: 'gone.html', exists: false }], routes: [{ route: '/api/x', exists: false }], modules: [], names: { terminal: ['a.js'], today: [], atlas: [], newsletter: [] }, evidence: [{ id: 'e1', verdict: 'null' }], packSkills: ['rates_cb'], drift: ['re-trace'] });
  assert.match(html, /<details class="im-row"/);
  assert.match(html, /A &lt;b&gt;name&lt;\/b&gt;/);
  assert.doesNotMatch(html, /A <b>name/);
  assert.match(html, /data-im-tab="/);
  assert.match(html, /href="x.html"/);
  assert.match(html, /im-gone/);
  assert.match(html, /\(not found\)/);
  assert.match(html, /e1: null/);
  assert.match(html, /analyst pack: rates_cb/);
  assert.match(html, /name match, not a trace: terminal yes · today no/);
  assert.match(html, /im-drift/);
});

t('the list groups families in the registry order and says when nothing matches', () => {
  const html = listHtml(FAMILIES);
  const at = GROUPS.map(g => html.indexOf(`<h2>${g.label}</h2>`)).filter(i => i >= 0);
  assert.deepEqual(at, [...at].sort((a, b) => a - b));
  assert.equal((html.match(/<details class="im-row"/g) ?? []).length, FAMILIES.length);
  assert.match(listHtml([]), /No family matches/);
});

t('the header counts every status', () => {
  const html = headerHtml();
  for (const k of STATUS_ORDER) assert.match(html, new RegExp(`vchip`));
  assert.match(html, new RegExp(`${FAMILIES.length} families`));
});

console.log(`\n${n} checks passed`);
