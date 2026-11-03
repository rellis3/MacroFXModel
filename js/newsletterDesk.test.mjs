import assert from 'node:assert/strict';
import { prose, ladderSvg, deskPages, deskCover, instName } from './newsletterDesk.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const H = { esc: s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') };

t('prose: source tags out, ordinary brackets kept, decimals never split, cut at whole sentences', () => {
  assert.equal(prose('The gate is BLOCKED (credit_funding: liquidity-gate/live) and HY widened (global ruling). VIX is 19.4 (against 21.6 a month out). Third. Fourth.', { sentences: 2 }),
    'The gate is BLOCKED and HY widened. VIX is 19.4 (against 21.6 a month out).');
  assert.equal(prose('Rates at 0.93 held. Next.', { sentences: 1 }), 'Rates at 0.93 held.');
  assert.ok(!/inher$/.test(prose('A'.repeat(50) + ' word. ' + 'Second sentence is long. '.repeat(10), { sentences: 9, chars: 80 })));
  assert.equal(prose('', {}), '');
});

t('instrument names read as markets', () => {
  assert.equal(instName('EURUSD'), 'EUR/USD'); assert.equal(instName('NQ'), 'Nasdaq'); assert.equal(instName('WHEAT'), 'Wheat');
});

const card = { rating: 'SHORT', size: 0.41, levels: { open: 1.11799, up: { p50: 1.12087, p75: 1.123, p90: 1.12536 }, down: { p50: 1.1151, p75: 1.11299, p90: 1.11063 } } };
t('ladder: open and the six lines in price, the lean shaded on its side; nothing without levels', () => {
  const svg = ladderSvg('EURUSD', card, H);
  assert.ok(svg.startsWith('<svg') && svg.includes('EUR/USD') && svg.includes('SHORT') && svg.includes('1.11799') && svg.includes('1.12536') && svg.includes('1.11063'));
  assert.ok(svg.includes('#ff5d73'), 'short shades red');
  assert.equal(ladderSvg('X', { rating: 'LONG' }, H), '');
});

const run = {
  calls: 33, packHealth: { ok: 79, total: 107 },
  head: { ok: true, book: { global: { tone: 'risk_off', summary: 's' }, risks: ['NFP at 13:30 (events_news).'], gaps: ['fed-path stale'],
    exposure: { cap: 4, before: { USD: 8.95, EUR: -2 }, after: { USD: 4, EUR: -1.5 }, cuts: [] },
    instruments: { EURUSD: { ...card, sizeBeforeCap: 0.85 }, AUDJPY: { rating: 'STRONG_SHORT', size: 0.75 }, USDCHF: { rating: 'FLAT', size: 0 } } } },
  debate: {
    global: { ok: true, view: { tone: 'risk_off', conviction: 'medium', summary: 'Risk-off won (credit_funding: credit-stress).', drivers: ['HY wider'], flip: ['gate clears'] },
      debate: { risk_on: { ok: true, view: { cases: { GLOBAL: { argument: 'Calm VIX.', strength: 'low' } }, rebuttal: 'Stale.' } }, risk_off: { ok: true, view: { cases: { GLOBAL: { argument: 'Gate blocked.', strength: 'medium' } }, rebuttal: '' } } } },
    currency: { ok: true, view: { ranking: ['USD', 'JPY', 'CAD', 'CHF', 'GBP', 'EUR', 'NZD', 'AUD'], currencies: Object.fromEntries(['USD', 'JPY', 'CAD', 'CHF', 'GBP', 'EUR', 'NZD', 'AUD'].map((c, i) => [c, { bias: 2 - Math.floor(i / 2), conviction: 'medium', why: `${c} why.` }])) },
      debate: { ccy_strengthen: { view: { cases: { USD: { argument: 'Hawkish Fed.' } } } }, ccy_weaken: { view: { cases: { USD: { argument: 'Soft labour.' } } } } } },
    risk: { risk_conservative: { ok: true, view: { headline: 'One trade, twenty tickers.', adjustments: [{ target: 'AUDUSD', size: 0, veto: true, reason: 'range spent' }], warnings: [] } } },
  },
  newsletter: { ok: true, issue: { subject: 'Dollar and yen bid', standfirst: 'Opening.', sections: [{ title: 'The global backdrop', label: 'Model output', body: 'Body.' }], ideas: [{ instrument: 'AUDJPY', view: 'STRONG_SHORT', size: 0.75, level: 'sell bounces', invalidation: 'gate clears', why: 'w' }] } },
};

t('desk pages: four pages in order, the house parts, the views labelled, no source tags in print', () => {
  const pages = deskPages(run, H, { flag: c => `[${c}]` });
  assert.deepEqual(pages.map(p => p.section), ["The desk's view", 'The currencies, ranked', 'Where the desk leans', 'The risk desk']);
  const html = pages.map(p => p.html).join('');
  assert.ok(html.includes('The desk rules risk-off, medium conviction'));
  assert.ok(html.includes('Strongest to weakest: USD › JPY'));
  assert.ok(html.includes('DESK BIAS BY CURRENCY') && html.includes('NET EXPOSURE BY CURRENCY AFTER THE CAP OF 4'), 'dark bar figures');
  assert.ok(html.includes('was 0.85') && html.includes('AUD/JPY') && html.includes('Strong short'));
  assert.ok(html.includes('<b style="color:#b4232f">veto</b>'));
  assert.ok(html.includes('Untested interpretation') || html.includes('untested'), 'labelled');
  assert.ok(!/credit_funding|events_news|global ruling\)/.test(html), 'no source tags');
  assert.ok(html.includes('<svg') && html.includes('EUR/USD'), 'a price ladder for an idea with levels');
});

t('no run, or a failed head, gives no pages; the cover only changes when there is a written issue', () => {
  assert.deepEqual(deskPages(null, H), []);
  assert.deepEqual(deskPages({ head: { ok: false } }, H), []);
  const today = { kicker: 'RBA day', headline: 'Regular headline', lede: 'Regular lede' };
  assert.equal(deskCover(today, { newsletter: null }), today);
  const c = deskCover(today, run);
  assert.equal(c.headline, 'Dollar and yen bid'); assert.equal(c.lede, 'Opening.'); assert.match(c.kicker, /^Desk edition · RBA day/);
});

console.log(`newsletterDesk: ${n} tests passed`);
