// One expiry rule for the Options tab (js/optionExpiry.js).   node --test js/optionExpiry.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { cmeCodeExpiry, expiryCutoffMs, isExpired, dteOf, usMarketHoliday, bookExpiry, productOf } from './optionExpiry.js';

test('E-mini S&P codes decode to the right weekday (27 Nov 2026 book)', () => {
  const want = { EW4X6: '2026-11-27', EWX6: '2026-11-30', E1BZ6: '2026-12-01', E1CZ6: '2026-12-02', E1DZ6: '2026-12-03', EW1Z6: '2026-12-04', E1AZ6: '2026-12-07',
    E3CZ6: '2026-12-16', E3DZ6: '2026-12-17', ESZ6: '2026-12-18', EW3Z6: '2026-12-18', E4CZ6: '2026-12-23', E4DZ6: '2026-12-24' };
  for (const [c, d] of Object.entries(want)) assert.equal(cmeCodeExpiry(c, '2026-11-27'), d, c);
});
test('Nasdaq and gold codes; FX codes are left to the capture (already right)', () => {
  assert.equal(cmeCodeExpiry('QN4X6', '2026-11-27'), '2026-11-27');
  assert.equal(cmeCodeExpiry('NEX6', '2026-11-27'), '2026-11-30');
  assert.equal(cmeCodeExpiry('NQZ6', '2026-11-27'), '2026-12-18');
  assert.equal(cmeCodeExpiry('OG4X6', '2026-11-27'), '2026-11-27');
  assert.equal(cmeCodeExpiry('OGF7', '2026-11-27'), '2026-12-28');   // 4th last business day of December
  assert.equal(cmeCodeExpiry('OGG7', '2026-11-27'), '2027-01-26');
  assert.equal(cmeCodeExpiry('OGJ7', '2026-11-27'), '2027-03-24');   // the day before Good Friday moves back one
  assert.equal(cmeCodeExpiry('EUUZ6', '2026-11-27'), null);
  assert.equal(cmeCodeExpiry(null), null);
});
test('a holiday moves a weekly to the business day before', () => {
  assert.equal(cmeCodeExpiry('EW4Z6', '2026-11-27'), '2026-12-24');   // 4th Friday of Dec 2026 = Christmas
  assert.ok(usMarketHoliday('2026-11-26') && usMarketHoliday('2026-04-03') && usMarketHoliday('2026-07-03') && !usMarketHoliday('2026-11-27'));
});
test('expiry times by product, and expired after them', () => {
  assert.equal(new Date(expiryCutoffMs('2026-11-27', 'EUR/USD')).toISOString(), '2026-11-27T15:00:00.000Z');   // 10:00 New York
  assert.equal(new Date(expiryCutoffMs('2026-11-27', 'XAU/USD')).toISOString(), '2026-11-27T18:30:00.000Z');   // 12:30 Chicago
  assert.equal(new Date(expiryCutoffMs('2026-12-18', 'SPX500_USD', 'ESZ6')).toISOString(), '2026-12-18T14:30:00.000Z');   // the AM quarterly
  assert.equal(new Date(expiryCutoffMs('2026-12-18', 'SPX500_USD', 'EW3Z6')).toISOString(), '2026-12-18T21:00:00.000Z');
  assert.equal(isExpired('2026-11-27', 'EUR/USD', Date.parse('2026-11-27T14:59:00Z')), false);
  assert.equal(isExpired('2026-11-27', 'EUR/USD', Date.parse('2026-11-27T15:00:00Z')), true);
  assert.equal(productOf('NAS100_USD'), 'index'); assert.equal(productOf('XAU_USD'), 'metal'); assert.equal(productOf('USD/JPY'), 'fx');
});
test('one days-to-expiry rule; a book expiry from the code, else capture + DTE moved off the weekend', () => {
  assert.equal(dteOf('2026-11-27', '2026-12-18'), 21);
  assert.equal(dteOf('2026-11-27', '2026-11-27'), 0);
  assert.equal(bookExpiry('2026-11-27', 21, 'E3DZ6'), '2026-12-17');   // capture + DTE would say 18 Dec
  assert.equal(bookExpiry('2026-11-27', 7, 'EUUZ6'), '2026-12-04');
  assert.equal(bookExpiry('2026-11-27', 1, null), '2026-11-27');        // Saturday back to Friday
});
