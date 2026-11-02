/**
 * treasuryDts — the three Daily Treasury Statement layouts (rows copied from the live API, 2026-11-01).
 * Run: node --test js/treasuryDts.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dtsTgaValue } from './treasuryDts.js';

test('all three DTS layouts give the TGA balance in $bn; other rows are ignored', () => {
  assert.equal(dtsTgaValue({ account_type: 'Federal Reserve Account', close_today_bal: '87316' }), 87.316);
  assert.equal(dtsTgaValue({ account_type: 'Treasury General Account (TGA)', close_today_bal: '211700', open_today_bal: '219793' }), 211.7);
  assert.equal(dtsTgaValue({ account_type: 'Treasury General Account (TGA) Closing Balance', close_today_bal: 'null', open_today_bal: '769937' }), 769.937);
  assert.equal(dtsTgaValue({ account_type: 'Treasury General Account (TGA) Opening Balance', close_today_bal: 'null', open_today_bal: '661227' }), null);
  assert.equal(dtsTgaValue({ account_type: 'Supplementary Financing Program Account', close_today_bal: '0' }), null);
  assert.equal(dtsTgaValue({ account_type: 'Total TGA Deposits (Table II)', open_today_bal: '196101' }), null);
});
