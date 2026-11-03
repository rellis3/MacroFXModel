import assert from 'node:assert/strict';
import { prose, ladderSvg, deskPages, deskCover, instName, groupPages, deskBrief, moveText, cardMove, isFxPair } from './newsletterDesk.js';
import { releaseNewsletterV3 } from './newsletterV3.js';

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


t('groupPages: one page per asset group with a card row per market and a ladder per live card with levels', () => {
  const pages = groupPages({ ...run, debate: { ...run.debate, assets: { fx_majors: { view: { summary: 'Dollar firm (rates_cb: fomc).' } } } } }, H);
  const maj = pages.find(p => p.section === 'FX majors'), cr = pages.find(p => p.section === 'FX crosses');
  assert.ok(maj && cr, 'majors and crosses have pages; empty groups have none');
  assert.equal(pages.length, 2);
  assert.match(maj.html, /FX majors: 1 short, 0 long, 1 flat/);
  assert.ok(maj.html.includes('Dollar firm.') && !maj.html.includes('rates_cb'), 'the asset desk reading, without source tags');
  assert.ok(maj.html.includes('EUR/USD') && maj.html.includes('USD/CHF') && maj.html.includes('class="ldg"'), 'cards and the ladder grid');
  assert.ok(!cr.html.includes('class="ldg"'), 'no ladder without levels');
  assert.deepEqual(groupPages(null, H), []);
});

t('deskBrief: the ruling, the currencies, the clearest ideas and what could break the day, in one read', () => {
  const html = deskBrief(run, H);
  assert.ok(html.includes('The desk brief') && html.includes('risk-off') && html.includes('THE CURRENCIES, STRONGEST TO WEAKEST'));
  assert.ok(html.includes('The clearest ideas') && html.includes('AUD/JPY') && html.includes('What could break the day') && html.includes('What the desk could not see'));
  assert.ok(!/events_news|credit_funding/.test(html));
  assert.equal(deskBrief({ head: { ok: false } }, H), '');
});

t('the two formats as whole issues: the magazine drops the regular pages that would contradict the desk; the brief is the cover and one read; the regular issue is unchanged', () => {
  const base = { date: 'Tuesday 3 November 2026', isoDate: '2026-11-03', regimeWord: 'MIXED' };
  const reg = releaseNewsletterV3(base), reg2 = releaseNewsletterV3({ ...base, deskMode: 'magazine' });
  assert.equal(reg.html, reg2.html, 'a mode without a desk run changes nothing');
  const mag = releaseNewsletterV3({ ...base, desk: run, deskMode: 'magazine' }), br = releaseNewsletterV3({ ...base, desk: run, deskMode: 'brief' }), ed = releaseNewsletterV3({ ...base, desk: run });
  assert.ok(mag.html.includes('Desk magazine') && mag.html.includes('FX majors:') && mag.html.includes('Where the desk leans today') && mag.html.includes('pgflow'));
  assert.ok(!mag.html.includes('Pair by pair, today'), 'no regular pair-by-pair page');
  assert.ok(br.html.includes('Desk brief') && br.html.includes('the day in one read') && !br.html.includes('FX majors:'));
  assert.ok(br.html.length < mag.html.length && ed.html.includes('Desk edition'));
  assert.equal(mag.subject, 'Dollar and yen bid');
});
t('moves in pips (FX, yen pairs on 0.01) or points, and percent; old scores without prices give nothing', () => {
  assert.equal(moveText('USDJPY', 0.83, 0.54), '+83 pips, +0.54%'); assert.equal(moveText('EURUSD', -0.0012, -0.11), '−12 pips, −0.11%');
  assert.equal(moveText('GOLD', -25.3, -0.9), '−25.3 pts, −0.90%'); assert.equal(moveText('BTCUSD', 1450, 1.42), '+1450 pts, +1.42%');
  assert.ok(isFxPair('GBPCHF') && !isFxPair('BTCUSD') && !isFxPair('SPX500'));
  assert.equal(cardMove('USDJPY', { entry: 157.5, exit: 158.33 }), '+83 pips, +0.53%'); assert.equal(cardMove('USDJPY', { R: 1 }), null);
});
console.log(`newsletterDesk: ${n} tests passed`);
