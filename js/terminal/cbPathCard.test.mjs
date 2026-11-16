// js/terminal/cbPathCard.test.mjs: the meeting-by-meeting block on the central-bank futures card (desk-terminal.html cbPathHtml): wired in, labelled, no trade wording.
// node --test js/terminal/cbPathCard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../../desk-terminal.html', import.meta.url), 'utf8');
test('cbPathHtml exists, is called from the futures card, and carries the evidence chip', () => {
  assert.ok(/function cbPathHtml\(x\)/.test(html));
  assert.ok(/\$\{cbPathHtml\(x\)\}<\/div>`;\s*\}/.test(html), 'called at the end of cbExpectCard');
  assert.ok(html.includes('RATE PATH: PRICED, NOT FORECAST'));
});
test('it states the method limits and the calendar stale guard, and says nothing about trades', () => {
  const i = html.indexOf('function cbPathHtml'), j = html.indexOf('function cbExpectCard');
  const body = html.slice(i, j);
  assert.ok(/not a forecast/i.test(body) && /reading/.test(body) && /calendar needs refreshing/.test(body));
  assert.ok(!/\b(buy|sell|entry|target|stop loss|position size)\b/i.test(body));
});
