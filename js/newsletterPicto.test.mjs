// Tests for js/newsletterPicto.js.   node js/newsletterPicto.test.mjs
import assert from 'node:assert/strict';
import { composePicto, withTitle, short } from './newsletterPicto.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const H = { esc: s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
const run = { date: '2026-11-04', newsletter: { ok: true, issue: { subject: 'CAD leads <as> the dollar slips', standfirst: 'Risk-off holds, but the dollar is soft. Second sentence.' } },
  head: { ok: true, book: { headline: 'CAD leads', instruments: {
    EURCAD: { rating: 'STRONG_SHORT', conviction: 'high', size: 1, plan: { invalidation: 'Close above 1.6200' } },
    GBPUSD: { rating: 'SHORT', conviction: 'medium', size: 0.6 }, USDJPY: { rating: 'FLAT', size: 0 } } } },
  debate: { global: { view: { tone: 'risk_off', conviction: 'medium', summary: 'Credit stress (credit_funding).', drivers: ['Liquidity gate BLOCKED (credit_funding).', 'Funding stress at the 97th percentile.'] } },
    currency: { view: { ranking: ['CAD', 'USD', 'JPY', 'GBP', 'CHF', 'EUR'], currencies: { CAD: { bias: 2 }, USD: { bias: 1 }, JPY: { bias: 1 }, GBP: { bias: -1 }, CHF: { bias: -1 }, EUR: { bias: -2 } } } } } };
const base = { assets: [{ label: 'Nasdaq 100', d1: -1.52, price: '20100', d1Label: 'since Tuesday close' }, { label: 'Gold', d1: 2.31, price: '4021.28' }, { label: 'EUR/USD', d1: 0.01 }, { label: 'Oil', d1: null }],
  events: [{ ms: Date.parse('2026-11-04T10:00:00Z'), country: 'EUR', event: 'CPI Flash Estimate y/y', impact: 'high' }, { ms: Date.parse('2026-11-06T13:30:00Z'), country: 'USD', event: 'Non-Farm Employment Change', impact: 'high' }, { ms: 1, country: 'USD', event: 'Minor', impact: 'low' }] };
const stress = { overall: 'watch', tiles: [{ label: 'Credit', level: 'stress', detail: 'HY 343bp' }, { label: 'Funding', level: 'watch', detail: 'SOFR-IORB 97th pct' }, { label: 'EM carry', level: 'ok', detail: 'z 0.3' }] };

t('one page with every panel, from the data only', () => {
  const out = composePicto({ run, base, stress }, H), h = out.html;
  assert.ok(h.startsWith('<!doctype html>') && h.includes('THE CHAIN – DESK BRIEF') && h.includes('Wed, 4 Nov 2026'));
  for (const x of ['Market moves', 'Key signals', 'The big picture', 'Currencies', 'Upcoming events', 'The desk\'s view', 'Bottom line', 'RISK-OFF', 'Gold', '+2.31%', '−1.52%', 'CAD leads &lt;as&gt; the dollar slips', 'Short EUR/CAD', 'A+', 'wrong above 1.6200', 'Liquidity gate BLOCKED', 'STRESS', 'HY 343bp', 'Risk-off holds, but the dollar is soft', 'Fri 13:30', '(strongest)', '(weakest)'])
    assert.ok(h.includes(x), x);
  assert.ok(!h.includes('Minor') && !h.includes('USD/JPY'), 'low-impact events and flat cards are left out');
  assert.ok(!/credit_funding/.test(h), 'no analyst ids');
  assert.ok(!/<script|https?:\/\/(?!www\.w3\.org)/.test(h), 'self-contained'); assert.ok(h.includes("font-family:'Kalam'") && h.includes('data:font/woff2;base64,'), 'fonts embedded');
  assert.ok(h.includes('size:A4 landscape'));
  assert.match(out.subject, /^2026-11-04 Desk brief pictograph/); assert.match(out.text, /Bottom line: Risk-off holds/);
  assert.equal(composePicto({ run: {} }, H), null);
});
t('live moves say since which close, and show the full day before (the Nasdaq -7% day, 2026-11-06)', () => {
  const b = { assets: [{ label: 'Nasdaq', d1: 1.42, d1Basis: 'live', d1AsOf: '2026-11-05', spark: [28309.2, 28537.8, 26531] }, { label: 'Gold', d1: -0.8, d1Basis: 'live', d1AsOf: '2026-11-05', spark: [4060.355, 4088.225] }, { label: 'DAX', d1: -1.11, d1Basis: 'live', d1AsOf: '2026-11-05', spark: [26636.8, 26201.4] }, { label: 'AUD/USD', d1: -0.81, d1Basis: 'live', d1AsOf: '2026-11-05', spark: [0.7006, 0.693] }, { label: 'EUR/USD', d1: 0.9, d1Basis: 'live', d1AsOf: '2026-11-05', spark: [1.1, 1.1] }] };
  const out = composePicto({ run, base: b }, H), h = out.html;
  assert.ok(h.includes('Moves since Thu&#39;s close') || h.includes("Moves since Thu's close"), 'the box says since which close');
  assert.ok(/Thu <span class="dn">−7.03%/.test(h), 'the full day shows under the live move');
  const line = out.text.split('\n').find(l => l.startsWith('Moves since'));
  assert.ok(line.indexOf('Nasdaq') < line.indexOf('DAX') && !line.includes('Gold'), 'ranked by the larger of the live move and the full day (gold, 0.8 and 0.7, drops out)');
  assert.match(out.text, /Moves since Thu's close: .*Nasdaq \+1\.42% \(Thu −7\.03%\)/);
});
t('missing data leaves panels out instead of placeholders; the map only with paths', () => {
  const h = composePicto({ run }, H).html;
  assert.ok(!h.includes('Market moves') && !h.includes('Key signals') && !h.includes('Upcoming events'));
  const m = composePicto({ run, map: { W: 100, H: 50, countries: [{ id: 124, d: 'M1,1' }, { id: 4, d: 'M2,2' }], banks: { CAD: [10, 10] }, arc: 'M0,0L1,1' } }, H).html;
  assert.ok(m.includes('aria-label="the desk\'s currency bias on the world map"') && m.includes('rgba(46,154,76'));
});
t('titles name the saved PDF: date first, brief in the short one', () => {
  assert.equal(withTitle('<html><head><title>x</title></head></html>', '2026-11-04 Desk brief', H.esc), '<html><head><title>2026-11-04 Desk brief</title></head></html>');
  assert.equal(withTitle('<html><head lang="en"><meta></head></html>', 'A & B', H.esc), '<html><head lang="en"><title>A &amp; B</title><meta></head></html>');
  assert.equal(short('First sentence (rates_cb) is long enough. Second.', 200), 'First sentence is long enough');
});
t('the big picture comes from the newsletter\'s sections when it has them', () => {
  const r2 = { ...run, newsletter: { ok: true, issue: { ...run.newsletter.issue, sections: [{ title: 'The currencies', body: 'CAD leads the board on oil and rates. More detail.' }, { title: 'What could break the day', body: 'Payrolls.' }, { title: 'Rates', body: 'The Fed path is priced for one cut.' }] } } };
  const h = composePicto({ run: r2 }, H).html;
  assert.ok(h.includes('CAD leads the board on oil and rates') && h.includes('The Fed path is priced for one cut') && !h.includes('Payrolls') && !h.includes('Liquidity gate BLOCKED'));
});
console.log(`newsletterPicto: ${n} tests passed`);
