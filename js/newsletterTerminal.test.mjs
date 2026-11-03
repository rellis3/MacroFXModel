// Tests for js/newsletterTerminal.js.   node js/newsletterTerminal.test.mjs
import assert from 'node:assert/strict';
import { composeTerminal, assetScore, ccyScore, grade, ring, dial, clean } from './newsletterTerminal.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const H = { esc: s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
const L = { open: 157.92, up: { p50: 158.25, p75: 158.55, p90: 158.88 }, down: { p50: 157.57, p75: 157.27, p90: 156.89 } };
const run = { date: '2026-11-03', head: { ok: true, book: { headline: 'Yen strength <today>', global: { tone: 'risk_off' }, risks: ['US elections at 15:16 (events_news).'],
  instruments: { USDJPY: { rating: 'SHORT', conviction: 'high', size: 1.02, why: 'JPY is the strongest (rates_cb).', plan: { zone: 'Sell rallies into 158.27-158.55', invalidation: 'Close above 158.92' }, levels: L }, AUDJPY: { rating: 'STRONG_SHORT', conviction: 'high', size: 0.51, why: 'AUD weakest.' }, UK100: { rating: 'FLAT', conviction: 'low', size: 0 } } } },
  debate: { global: { view: { tone: 'risk_off', conviction: 'medium', summary: 'Credit stress (credit_funding).', drivers: ['Liquidity gate BLOCKED'] } }, currency: { view: { ranking: ['JPY', 'USD', 'CHF', 'CAD', 'GBP', 'NZD', 'EUR', 'AUD'], currencies: { JPY: { bias: 2, why: 'BoJ hiked.' }, AUD: { bias: -2, why: 'RBA.' } } } } } };

t('scores, grades, graphics', () => {
  assert.equal(assetScore({ rating: 'STRONG_SHORT', conviction: 'high' }), 0); assert.equal(assetScore({ rating: 'FLAT' }), 5); assert.equal(ccyScore(2), 10);
  assert.equal(grade({ rating: 'STRONG_SHORT', conviction: 'high', size: 0.5 }), 'A+'); assert.equal(grade({ rating: 'FLAT', size: 0 }), null);
  assert.match(ring(7.5), /7\.5/); assert.match(dial('risk_off', 'high'), /RISK-OFF/);
  assert.equal(clean('JPY (rates_cb, macro_economy) is strong, yields_curve.'), 'JPY is strong.');
});
t('the issue: every page, escaped, no internal ids, self-contained, a text version', () => {
  const out = composeTerminal({ run, review: { score: { date: '2026-11-02', S: -0.54, eligible: false, scored: 30, live: 35, placebo: { p95: -0.4 }, race: { resolved: 10, leanFirst: 5 }, cards: { USDJPY: { dir: -1, R: -2.4, size: 1 } } } }, rates: { JPY: 1.04 }, cb: { JPY: { regime: 'MIXED' } } }, H);
  assert.ok(out.html.startsWith('<!doctype html>') && out.html.includes('THE CHAIN <i>// TERMINAL</i>'));
  assert.ok(out.html.includes('Yen strength &lt;today&gt;') && out.html.includes('RISK-OFF') && out.html.includes('Today\'s playbooks') && out.html.includes('Every market, one glance'));
  assert.ok(out.html.includes('The book lost 0.54 u: inside the range a random book scores') && out.html.includes('NOT FINANCIAL ADVICE'));
  assert.ok(!/rates_cb|credit_funding|events_news/.test(out.html), 'no analyst ids');
  assert.ok(!/<script|https?:\/\/(?!www\.w3)/.test(out.html.replace(/xmlns="[^"]+"/g, '')), 'no scripts or external fetches');
  assert.match(out.text, /PLAYBOOKS/); assert.match(out.subject, /^Terminal: /);
  assert.equal(composeTerminal({ run: {} }, H), null);
});
t('the map page appears only with map paths', () => {
  const noMap = composeTerminal({ run }, H).html, withMap = composeTerminal({ run, map: { W: 100, H: 50, sphere: 'M0,0', grat: 'M0,0', countries: [{ id: 392, d: 'M1,1' }], banks: Object.fromEntries(['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'].map(c => [c, [10, 10]])), arc: 'M0,0' } }, H).html;
  assert.ok(!noMap.includes('dots are the central banks') && withMap.includes('dots are the central banks') && withMap.includes('rgba(47,211,154'));
});
console.log(`newsletterTerminal: ${n} tests passed`);
