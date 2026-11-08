// Tests for the weekly edition's own pages.   node js/newsletterWeekly.test.mjs
import { reviewDigest, reviewPages, reviewLine, weekTicker, weekDeskState, weekDeskPages, packMove } from './newsletterWeekly.js';
import { buildNewsletter } from './newsletter.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'), H = { esc };
const NOW = Date.parse('2026-11-08T17:00:00Z');

const mk = (group, units, w1, w4, pct, extra = {}) => ({ sym: 'X', group, units, level_text: '1', move: { last: 1, last_date: '2026-11-06', w1, w4, w13: 0, range_pos: 0.5, move4_pct: pct }, drivers: [], in_charge: null, ...extra });
const pack = {
  asof: '2026-11-07', notes: ['fred DGS2: timed out'],
  regime: [
    { a: '^NDX', b: 'US10Y', recent: 0.52, prior: -0.25, status: 'INVERTED', why: 'Stocks vs yields' },
    { a: 'CL=F', b: 'US10Y', recent: -0.14, prior: 0.24, status: 'weak', why: 'Oil vs yields' },
  ],
  fed_path: [['V6', 3.88, 3.885, '2026-10-26'], ['X6', 3.8775, 3.8775, '2026-11-06'], ['V7', 4.345, 4.39, '2026-11-06']],
  markets: {
    'Nikkei 225': mk('Equities', 'pct', -0.093, -0.168, 99.4, { decomp: { r2: 0.1, actual: -0.168, resid: -0.12 }, in_charge: '^NDX' }),
    'US 10y': mk('Rates', 'bp', -0.07, -0.385, 95.2, { drivers: [{ key: '^NDX', why: 'Discount rate', lab: 'textbook', lab_prior: 'INVERTED', flipped: true, recent: 0.4 }] }),
    EURUSD: mk('G10 FX', 'pct', 0.004, 0.001, 5, { drivers: [{ key: 'US_EA2', recent: 0.06 }], cot: { name: 'EURO FX', date: '2026-11-03', groups: [{ group: 'lev funds', net: -78559, chg4: -34298, pct3y: 0.6 }] } }),
    Gold: mk('Commodities', 'pct', 0.045, -0.034, 39, { in_charge: 'SI=F' }),
  },
};

console.log('the market review digest');
{ const dg = reviewDigest(pack, { nowMs: NOW });
  ok('reads the pack and is not stale one day after it was built', dg && dg.n === 4 && dg.asof === '2026-11-07' && !dg.stale && dg.ageDays === 1);
  ok('a gauge that changed sign past 0.3 is shifted; a weak wobble is not', dg.gauges.find(g => g.pair === 'Nasdaq 100 vs US 10y').shifted && !dg.gauges.find(g => g.pair === 'WTI crude vs US 10y').shifted);
  ok('unusual moves are the 4-week moves at or above the 90th percentile, most unusual first', dg.unusual.map(u => u.name).join() === 'Nikkei 225,US 10y');
  ok('yields are in basis points and prices in percent', packMove(pack.markets['US 10y'], -0.385) === '−39bp' && packMove(pack.markets.Gold, 0.045) === '+4.5%' && dg.unusual[0].w4 === '−16.8%');
  ok('a flipped driver is listed with its before and now', dg.flips.length === 1 && dg.flips[0].name === 'US 10y' && dg.flips[0].before === 'INVERTED' && dg.flips[0].now === 'textbook');
  ok('a sizeable move mostly left unexplained is listed', dg.unexplained.map(u => u.name).join() === 'Nikkei 225');
  ok('a market with drivers but none clearly in charge is listed as no clear driver', dg.noDriver.includes('EURUSD') && !dg.noDriver.includes('Gold'));
  ok('positioning at a three-year extreme is listed with its side', dg.crowded.length === 1 && dg.crowded[0].side === 'short' && dg.crowded[0].name === 'EURUSD');
  ok('the Fed path skips a contract that stopped printing', dg.fedPath.near.m === 'X6' && dg.fedPath.far.m === 'V7' && Math.abs(dg.fedPath.far.d - (4.345 - 4.39)) < 1e-9);
  ok('the board groups every market in asset-class order', dg.board.map(g => g.group).join() === 'G10 FX,Equities,Rates,Commodities');
  ok('a pack ten days old is stale and says so', (() => { const d = reviewDigest(pack, { nowMs: NOW + 9 * 864e5 }); return d.stale && /days old/.test(reviewPages(d, H)[0].html); })());
  ok('no pack, no digest and no pages', reviewDigest(null) === null && reviewDigest({ markets: {} }) === null && reviewPages(null, H).length === 0);
  const line = reviewLine(dg);
  ok('the cover line names the shifted gauge and the most unusual move, with no percentile above the 99th', /One regime gauge shifted: Nasdaq 100 vs US 10y now moves together/.test(line) && /Nikkei 225, −16\.8% \(99th percentile/.test(line), line);
  const pages = reviewPages(dg, H), all = pages.map(p => p.html).join('');
  ok('three pages: the story, where the textbook is not working, every market', pages.length === 3 && /Which story the market is trading/.test(all) && /Drivers, leftovers and crowding/.test(all) && /Every market's week/.test(all));
  ok('the pages carry evidence labels and the pack\'s own data notes', /Observed data/.test(all) && /Model output/.test(all) && /Context, not a signal/.test(all) && /fred DGS2: timed out/.test(all));
  ok('nothing in the review pages calls a direction', !/will (rise|fall)|expect(ed)? to (rise|fall)|buy |sell /i.test(all.replace(/<[^>]+>/g, ' ')));
  const tk = weekTicker(pack);
  ok('the weekly tape carries price markets only, with the week\'s move', tk.map(t => t.label).join() === 'Nikkei 225,EURUSD,Gold' && Math.abs(tk[2].chg - 4.5) < 1e-9 && tk[2].day.word === 'week'); }

console.log('the strategist');
const view = { headline: 'A CPI week with the dollar on the back foot', lastWeek: 'The desk leaned risk-off.', themes: [{ title: 'Growth scare', body: 'Bonds hedge stocks again.' }],
  currencies: Object.fromEntries(['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'].map((c, i) => [c, { bias: [1, 0, -1, 2, -1, -2, 0, 1][i], why: `reason ${c}` }])),
  ranking: ['JPY', 'USD', 'CHF', 'EUR', 'CAD', 'GBP', 'AUD', 'NZD'], week: [{ when: 'Tue 13:30', event: 'US CPI', why: 'the week turns on it' }], scenarios: [{ if: 'If CPI is hot', then: 'the dollar view flips' }], watch: ['Asia open on JPY'] };
const rec = { ok: true, week: '2026-W46', writtenAt: '2026-11-08T16:05:00Z', basedOn: ['2026-11-02', '2026-11-06'], view };
{ ok('no record, or a failed one, gives no state', weekDeskState(null, '2026-W46') === null && weekDeskState({ ok: false }, '2026-W46') === null);
  const st = weekDeskState(rec, '2026-W46'), pg = weekDeskPages(st, H), all = pg.map(p => p.html).join('');
  ok('a view for the coming week is fresh and shows no warning', st.fresh && !/not the coming week/.test(all));
  ok('two pages: the week ahead, and the currencies with the dates, scenarios and watch list', pg.length === 2 && /The themes carrying into the week/.test(all) && /Strongest to weakest/.test(all) && /US CPI/.test(all) && /If CPI is hot/.test(all) && !/If If/.test(all) && /Asia open on JPY/.test(all));
  ok('the ranking runs strongest first and every currency shows its bias', all.indexOf('<b>JPY</b>') < all.indexOf('<b>NZD</b>') && /−2/.test(all) && /\+2/.test(all));
  ok('the view is labelled a hypothesis, not a forecast', /Hypothesis/.test(all) && /not a forecast/.test(all));
  const old = weekDeskPages(weekDeskState(rec, '2026-W47'), H).map(p => p.html).join('');
  ok('a view written for an earlier week is shown with a warning', /Written for 2026-W46, not the coming week/.test(old)); }

console.log('the weekly issue');
{ const base = { date: 'Sunday 8 November 2026', isoDate: '2026-11-08', edition: 'weekly', layout: 'v2', release: true, nowMs: NOW,
    brief: { letter: { subject: "Friday's brief subject", opening: "Friday's opening, which a Sunday weekly should not lead with." } },
    changes: [{ key: 'us10y', last: 4.86, d5: -7 }, { key: 'hy', last: 3.2, d5: 8 }],
    week: { events: [{ ms: Date.parse('2026-11-10T13:30:00Z'), ccy: 'USD', event: 'CPI y/y', impact: 'high' }], ranges: [{ label: 'EUR/USD', hl5: 1.1, hl5_75: 1.5, hlMed: 0.5 }] } };
  const w = buildNewsletter({ ...base, weekDesk: rec, weekFor: '2026-W46', reviewPack: pack });
  ok('the weekly is the magazine layout with no draft tag', /class="mg"/.test(w.html) && !/V2 draft/.test(w.html) && /Weekly/.test(w.html));
  ok('its subject is the week\'s figures, not Friday\'s brief', /^Yields fell 7bp this week, yet junk-bond spreads widened 8bp/.test(w.subject) && !/Friday/.test(w.subject), w.subject);
  ok('the strategist and the review follow the cover, before the 20-day exhibits', (() => { const h = w.html, a = h.indexOf('The market review in one line'), b = h.indexOf('A CPI week with the dollar'), c = h.indexOf('Which story the market is trading'), d = h.indexOf('The week ahead</h2>'); return a > 0 && b > a && c > b && (d < 0 || d > c); })());
  ok('with the strategist\'s view, Friday\'s brief reading is left out of the weekly', !/Friday's opening/.test(w.html) && !/Friday's opening/.test(w.text));
  ok('the plain text carries the week ahead and the review', /THE DESK'S WEEK AHEAD \(2026-W46/.test(w.text) && /Ranking: JPY \+2 > USD/.test(w.text) && /THE MARKET REVIEW \(2026-11-07\)/.test(w.text));
  ok('the tape shows the week\'s moves', /Gold <b>1<\/b> <i class="up">week/.test(w.html));
  const bare = buildNewsletter(base);
  ok('without the strategist or the pack the weekly still builds, and keeps the brief\'s reading', /class="mg"/.test(bare.html) && !/Which story the market is trading/.test(bare.html) && /Friday's opening/.test(bare.html));
  ok('the daily is untouched by the weekly inputs', !/Which story the market is trading|The desk's view of the week/.test(buildNewsletter({ ...base, edition: 'daily', weekDesk: rec, reviewPack: pack }).html)); }

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
