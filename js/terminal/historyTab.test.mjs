// js/terminal/historyTab.test.mjs: flow review item 4 (2026-11-16): the Charts tab is now called History (ids unchanged, the old word still
// works as a command) and Positioning history lives on the Positioning tab. Reads the page source; the look is an owner click-through.
// node --test js/terminal/historyTab.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SURFACES as REGISTRY } from './tabRegistry.js';
import { TAB_LABELS } from '../infoMap.js';
const html = fs.readFileSync(new URL('../../desk-terminal.html', import.meta.url), 'utf8');
const byId = id => REGISTRY.find(r => r.id === id);

test('the tab button says History, keeps data-t="charts" and the surface id tab.charts', () => {
  assert.match(html, /data-t="charts" data-surface="tab\.charts">History<\/button>/);
  assert.equal(byId('tab.charts').label, 'History');
  assert.equal(TAB_LABELS.charts, 'History');
});
test('Positioning history is gone from the History tab and drawn by the Positioning tab, in its own switchable block', () => {
  const charts = html.slice(html.indexOf('async function charts()'), html.indexOf('const REG_COL'));
  assert.ok(!/cotgrid|Positioning history|desk-cot-history/.test(charts), 'the History tab no longer builds or fetches it');
  const pos = html.slice(html.indexOf('function positioning()'), html.indexOf('// ── CALENDAR ──'));
  assert.match(pos, /data-surface="panel\.pos\.history"/);
  assert.match(pos, /id="cotgrid"/);
  assert.match(pos, /positioningHistory\(\);/);
  const row = byId('panel.pos.history');
  assert.ok(row, 'registered, so the Access page can switch it');
  assert.equal(row.hidden, null, 'shown to the desk login, as it was on the Charts tab');
});
test('the History panels keep their surface ids (Access switches and saved overrides still apply)', () => {
  assert.ok(byId('panel.charts.bookflow') && byId('panel.charts.ranking'));
  assert.equal(byId('panel.charts.ranking').group, 'History');
});
