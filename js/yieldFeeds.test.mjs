// Tests for js/yieldFeeds.js parsers on real samples.   node js/yieldFeeds.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRbaF2, parseValet, bubaUrl } from './yieldFeeds.js';
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const fx = f => readFileSync(new URL(`../tests/fixtures/yields/${f}`, import.meta.url), 'utf8');
t('RBA F2: the 2 and 10 year columns, dates ascending', () => {
  const y2 = parseRbaF2(fx('rba_f2_sample.csv'), 'Australian Government 2 year bond'), y10 = parseRbaF2(fx('rba_f2_sample.csv'), 'Australian Government 10 year bond');
  assert.ok(y2.length >= 3); assert.match(y2[0].date, /^\d{4}-\d{2}-\d{2}$/); assert.ok(y2.every((p, i) => !i || p.date > y2[i - 1].date)); assert.ok(y10.at(-1).value > 0);
  assert.deepEqual(parseRbaF2('nothing', 'x'), []);
});
t('Bank of Canada Valet: both series, sorted', () => {
  const ids = ['BD.CDN.2YR.DQ.YLD', 'BD.CDN.10YR.DQ.YLD'], p = parseValet(JSON.parse(fx('valet_sample.json')), ids);
  assert.ok(p[ids[0]].length >= 2 && p[ids[1]].length >= 2); assert.ok(p[ids[0]][0].date < p[ids[0]].at(-1).date);
});
t('Bundesbank URL by tenor', () => { assert.match(bubaUrl('02'), /R02XX/); assert.match(bubaUrl('10'), /R10XX/); });
console.log(`yieldFeeds: ${n} tests passed`);
