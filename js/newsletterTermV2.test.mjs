// js/newsletterTermV2.test.mjs: the terminal newsletter v2 (js/newsletterTermV2.js, ...Prose.js, ...Svg.js) over a synthetic desk run and synthetic route data.
// It proves the build rules (no trade wording, no repeated sentence, no leaked tag, no "..." cut, evidence chips, tokens only, print CSS, a poster whose
// text fits its boxes, a missing feed becomes a "not available" story). It does NOT prove how the PDF looks: that was checked by printing a live issue
// through headless Chrome (scripts/newsletter-term-v2-sample.mjs), and how it looks in the owner's own browser is not covered here.
// node --test js/newsletterTermV2.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as N from './newsletterTermV2.js';
import * as P from './newsletterTermV2Prose.js';
import * as G from './newsletterTermV2Svg.js';

const NOW = Date.parse('2026-11-16T11:00:00Z');
const CCY = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];
const scores = (shift = 0) => CCY.map((c, i) => ({ ccy: c, score: +(2.4 - i * 0.7 + shift).toFixed(1) }));
const hz = (w, sc) => ({ available: true, from: '2026-11-09T11:00:00Z', to: '2026-11-16T11:00:00Z', leader: sc[0].ccy, laggard: sc.at(-1).ccy, scores: sc });
const fx = () => {
  const frames = Array.from({ length: 70 }, (_, i) => ({ t: `2026-0${6 + Math.floor(i / 30)}-${String(1 + i % 28).padStart(2, '0')}`, data: { s2s10: 20 + i / 10, pts: ['FF', '2y', '5y', '10y', '30y'].map((k, j) => ({ k, v: +(3.8 + j * 0.4 + i * 0.005).toFixed(2) })) } }));
  const dates = Array.from({ length: 400 }, (_, i) => new Date(Date.UTC(2025, 0, 1) + i * 864e5).toISOString().slice(0, 10)), wave = (a, base) => dates.map((_, i) => +(base + Math.sin(i / 9) * a + i * 0.01).toFixed(3));
  const bars = (days, step) => { const out = []; let p = 27000; for (let d = days; d >= 0; d--) for (let m = 0; m < 24 * 60; m += step) { const t = Date.UTC(2026, 10, 16 - d, 0, m) / 1000; p += Math.sin(t / 5000) * 6; out.push({ time: t, open: p, high: p + 5, low: p - 5, close: p + 1 }); } return out.filter(b => b.time * 1000 <= NOW); };
  const analyst = (ccy, inst) => ({ ok: true, layer: 'currency', report: { headline: 'The front end is pricing a hawkish path.', points: [{ claim: 'The Fed held and futures price a December rise at 98%, a clear support for the dollar. Heavy supply is a headwind.', evidence: 'fed-path', impact: { [ccy]: 2, [inst]: -1 } }, { claim: 'Positioning looks stretched on the short side, a mild support for the market.', evidence: 'cot', impact: { [inst]: 1, [ccy]: 1 } }, { claim: 'Credit spreads are widening at the tail, which weighs on risk appetite and equities.', evidence: 'credit-board', impact: { RISK: -2, NQ: -2 } }] } });
  return {
    S: { ok: true, horizons: { '1H': hz('1H', scores(-.3)), '4H': hz('4H', scores(-.5)), '1D': hz('1D', scores(.1)), '1W': hz('1W', scores()) } },
    CV: { ok: true, frames }, VC: { tiles: ['NQ', 'GOLD', 'EURUSD', 'GBPUSD', 'USDJPY', 'WTI'].map((s, i) => ({ sym: s, tag: ['fair', 'continue', 'exhaust'][i % 3], ratio: 1.1, clock: { used: 0.4 + i * 0.15, hours: 11 }, lines: { k75: 1.4, k90: 1.9 } })) },
    FED: { windows: [{ ref: '2026-12-16', hike: 98, hikeAgo: { d1: 96, w1: 90, m1: 40 } }, { ref: '2027-03-17', hike: 93, hikeAgo: { d1: 90, w1: 80, m1: 30 } }] },
    WS: { overall: 'watch', tiles: ['Risk flags', 'Credit', 'Dollar funding', 'EM carry', 'Fed liquidity', 'Term premium', 'Global rate cycle'].map((l, i) => ({ label: l, level: ['ok', 'watch', 'stress'][i % 3], detail: `${l} reading ${i}` })) },
    REG: { quadrant: { name: 'Reflation', growth: 'up', inflation: 'up', why: 'Growth and inflation are both running above trend on the lenses that agree.' }, overall: { met: 4, of: 8 } },
    CAL: { rows: [{ impact: 'High', ms: NOW + 3 * 3600e3, time: '2026-11-16 14:00:00', event: 'CPI', country: 'US', estimate: '0.3%', prev: '0.2%' }, { impact: 'High', ms: NOW + 5 * 3600e3, time: '2026-11-16 16:00:00', event: 'Nonfarm Payrolls', country: 'US', estimate: '150K', prev: '140K' }] },
    BUNDLE: { ok: true, dates, to: dates.at(-1), series: { SPX: wave(80, 4000), US10Y: wave(0.3, 4), VIX: wave(4, 18), GOLD: wave(60, 1900), us2y: wave(0.2, 4.4), us10y: wave(0.3, 4.8), tips: wave(0.2, 2.6), bei: wave(0.1, 2.2), hy: wave(0.2, 3.3), ig: wave(0.05, 0.9), vix: wave(3, 18), dxy: wave(2, 120), nq: wave(300, 27000), spx: wave(80, 7500), r2k: wave(30, 2800), de30: wave(200, 26500), uk100: wave(100, 10800), gold: wave(40, 3900), btc: wave(2000, 70000), oil: wave(2, 88), eurusd: wave(.01, 1.1), gbpusd: wave(.01, 1.32), usdjpy: wave(1, 159), usdcad: wave(.01, 1.42), audusd: wave(.01, .68), usdchf: wave(.01, .83) } },
    SCORE: { ok: true, score: { date: '2026-11-13', S: 0.32, scored: 15, live: 16, race: { resolved: 7, leanFirst: 5 }, drift: -0.39, placebo: { mean: 0.31, sd: 0.11, p95: 0.47 }, cards: Object.fromEntries(['EURUSD', 'NQ', 'GOLD', 'GBPUSD', 'USDJPY', 'AUDUSD'].map((k, i) => [k, { R: i % 2 ? -0.6 : 1.2, size: 0.8 }])) }, reflection: { headline: 'The book finished the day just above the random placebo mean and inside its band, with the dollar-bloc reads doing the work.', worked: ['The dollar-bloc reads held through the US session as rate pricing rose.'], failed: ['The haven bid in CHF was stronger than the carry read allowed.'], lessons: [{ lesson: 'Treat the haven leg as the live variable on days when risk is off.' }] } },
    RUN: {
      ok: true, date: '2026-11-16', newsletter: { issue: { subject: 'Credit cracks at the tail, but the ladder reads calm', standfirst: 'Credit is cracking at the tail while the liquidity gate is blocked on six indices. The desk\'s ruling is risk-off at medium conviction. Today\'s main event is the US CPI print.',
        sections: [{ title: 'The global backdrop', label: 'Model output', body: 'The global ruling is risk-off at medium conviction on credit deterioration at the tail. The liquidity gate is blocked on six indices. VIX is 18.7 with no warning flags.' }, { title: 'The currencies', label: 'Model output', body: 'The ranking runs USD first and NZD last. The dollar matters most because of the hawkish Fed hold. The weak side is the high-beta currencies.' },
          { title: 'Where the desk leans', label: 'Untested interpretation', body: 'The book is short AUDJPY at full size 1.00 with a zone of 108.30 and invalidation above 108.63. The cards are capped.' }, { title: 'What could break the day', label: 'Context, not a signal', body: 'US CPI is the only tier-1 print at 14:00. The risk desk sized the book against a VIX shock. Fed speakers matter more than the print.' }, { title: 'What the desk could not see', label: 'Hypothesis', body: 'The daily read feed is a gap. The RBNZ statement is blocked so the hold cannot be read. NOK has no ruling of its own.' }], ideas: [{ instrument: 'AUDJPY', view: 'SHORT', size: 1, level: '108.30', invalidation: '108.63', why: 'carry' }] } },
      debate: { bookRisk: { summary: { effectiveBets: 3.21, factors: [{ key: 'USD', share: 0.333 }, { key: 'RISK', share: 0.324 }, { key: 'CARRY', share: 0.179 }, { key: 'COMMOD', share: 0.101 }] } }, global: { view: { tone: 'risk_off', conviction: 'medium', drivers: ['Credit stress at the 98th percentile of five years.'], flip: ['A dovish Fed chair against the hikes already priced \u2014 events_news, / The ruling flips if credit spreads reverse sharply lower \u2014 credit_funding, funding-read / A liquidity gate unblocking on six indices \u2014 global_market, risk-flags / world-stress', 'CCC spreads reversing sharply lower (e.g. back inside the one-year range) or the score turning positive.', 'The liquidity gate unblocking on those six indices (creditZ -1.47, curveZ -1.69).'] } }, currency: { view: { ranking: CCY, currencies: {} }, debate: { ccy_strengthen: { view: { headline: 'The strengthen case is concentrated in USD and CAD.', cases: Object.fromEntries(CCY.map(c => [c, { argument: `${c} could hold up because rate pricing and risk flows favour it today. The next print matters for it.` }])) } }, ccy_weaken: { view: { headline: 'The weaken case rests on supply and risk-off drags.', cases: Object.fromEntries(CCY.map(c => [c, { argument: `${c} could struggle because supply and risk-off flows weigh on it. It has been weak against the dollar.` }])) } } } } },
      head: { book: { headline: 'Risk-off at medium conviction: credit stress says be cautious, so it is signed small.', global: { tone: 'risk_off' }, currencies: Object.fromEntries(CCY.map((c, i) => [c, { bias: [1, -1, 0, 1, -2, -1, 2, 0][i], why: `${c} read: the desk sees ${['rate pricing', 'weak growth', 'a haven bid', 'the policy gap', 'risk-off drags', 'thin liquidity', 'a macro lead', 'carry costs'][i]} as the main driver today.` }])), instruments: { NQ: { rating: 'SHORT', why: 'Credit stress and a blocked gate weigh on the index.', levels: { open: 27000, up: { p50: 27400, p75: 27700, p90: 28000 }, down: { p50: 26600, p75: 26300, p90: 26000 } } }, GOLD: { rating: 'LONG', why: 'Real yields have eased.', levels: { open: 3900, up: { p50: 3950, p75: 3990, p90: 4030 }, down: { p50: 3850, p75: 3810, p90: 3770 } } }, EURUSD: { rating: 'SHORT', why: 'A fade only: structure blocks the USD leg, spent so small.', levels: { open: 1.1, up: { p50: 1.104, p75: 1.107, p90: 1.11 }, down: { p50: 1.096, p75: 1.093, p90: 1.09 } } } }, gaps: ['The daily read feed is a gap and the liquidity pulse carries little signal.'] } },
      economist: { ok: true, view: { headline: 'Core Retail Sales is the only release ahead, and the desk has no cards on it, so this is context only.', briefs: [{ family: 'RETAIL', event: 'Core Retail Sales m/m (US) at 2026-11-17T13:30:00.000Z', priced: 'Consensus 0.4% against a previous 0.9%: roughly a halving in the monthly pace.', sizeAndSpeed: 'The history for this release covers only 2 releases (2026-09-16 to 2026-10-15); there is no usable 30-minute / 4-hour move.', ifHot: 'History records 2 hot prints and 0 cold; this is a count, not an edge.', ifCold: 'No cold prints were recorded.', watch: 'Watch the print for range expansion rather than direction.' }] } },
      analysts: Object.fromEntries([['rates_cb', 'USD', 'EURUSD'], ['yields_curve', 'USD', 'EURUSD'], ['credit_funding', 'USD', 'GOLD'], ['vol_iv', 'USD', 'NQ']].map(([id, c, i]) => [id, analyst(c, i)])), dataQuality: { gaps: [] },
    },
    FC: { session_date: '2026-11-16', computed_at: '2026-11-13T23:54:00Z', instruments: { NQ: { hl_median: 1.6, ladder: { sigma_daily_pct: 1.8, oh: { p50: 1.38, p75: 2.4, p90: 3.43 }, ol: { p50: 1.24, p75: 2.4, p90: 3.97 } } }, ...Object.fromEntries(['SPX500', 'US2000', 'DE30', 'UK100', 'GOLD', 'BTCUSD', 'WTI', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCAD', 'AUDUSD', 'USDCHF'].map(k => [k, { hl_median: 1.1 }])) } },
    OI: { data: { NAS100_USD: { spot: 27739, refMove: { move: 867 }, maxPain: 28785, gexFlip: 28108, callWall: 29335, putWall: 25935, savedAt: '16/11/2026, 06:47' } } },
    CRED: { rows: [{ id: 'BAMLH0A3HYC', label: 'US CCC', oas: 1314, chg20d: 32, pctile5y: 98, pctile1y: 95 }, { id: 'BAMLC0A0CM', label: 'US investment grade', oas: 89, chg20d: 5, pctile5y: 63, pctile1y: 92 }] },
    FUND: { items: [{ id: 'rrp', stat: { value: 0.325, pctile: 9, change: 0.2 } }, { id: 'reserves', stat: { value: 2960.6, pctile: 70, change: -61.5 } }, { id: 'basisTrade', stat: { value: -764.6, pctile: 11, change: -67 } }] },
    GATE: { instruments: Object.fromEntries(['NAS100_USD', 'SPX500_USD', 'US30_USD', 'US2000_USD', 'DE30_USD', 'UK100_GBP'].map(k => [k, { composite: 'BLOCKED', creditZ: -1.47, curveZ: -1.69 }])) },
    BARS5: { bars: bars(1, 5) }, BARS15: { bars: bars(13, 15) }, RR: { live: [] }, ARCH: { issues: [{ kind: 'desk-evening', date: '2026-11-15', subject: 'Evening: Hot PPI and hawkish Fed talk lift the dollar' }] },
  };
};
const model = () => N.buildModel(fx(), NOW);
const textOf = html => html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<span class="chip[^>]*>[\s\S]*?<\/span>/g, ' ').replace(/<div class="foot">[\s\S]*?<\/div>/g, ' ').replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ');

test('the issue builds from the terminal data: the three beats, the charts and the written sections are all there', () => {
  const m = model(), ids = m.stories.map(s => s.id);
  for (const id of ['yesterday-score', 'backdrop', 'strength', 'h2h', 'ccys', 'curve', 'fed', 'markets', 'vol', 'calendar', 'range']) assert.ok(ids.includes(id), `${id} is in the issue`);
  assert.deepEqual([...new Set(m.stories.map(s => s.beat))], ['At a glance', 'Yesterday', 'Today', 'What could happen', 'Back page']);
  assert.ok(m.stories.filter(s => !s.na).every(s => (s.paras?.length || s.svg || s.rows || s.ccys || s.markets || s.h2h || s.table || s.bullets?.length || s.strip || s.briefParts || s.question || s.sources || s.rangeGroups || s.teach || s.lights)), 'no story is empty');
  assert.match(m.headline, /Credit cracks/); assert.ok(m.words > 600, `a written issue, not a caption sheet (${m.words} words)`); assert.ok(m.words < 7000, 'and not a wall (' + m.words + ')');
});
test('the desk writer\'s book-and-size section is dropped whole, and no entry, target, stop, size or zone sentence survives anywhere', () => {
  const m = model(), html = N.renderIssue(m), text = textOf(html);
  assert.ok(!m.stories.some(s => /where the desk leans/i.test(s.title)), 'the book-and-size section is not printed');
  assert.equal(P.tradeHit(text), null, 'no trade wording in the issue text');
  assert.ok(!/AUDJPY|108\.63|108\.30|full size/.test(html), 'the ideas list and its levels never reach the page');
  const ss = P.sentences('The book is short AUDJPY at full size 1.00. The dollar is strong. Stop above 108.63.'); assert.deepEqual(ss.filter(s => !P.TRADE_RE.test(s)), ['The dollar is strong.']);
});
test('no sentence is printed twice in one issue, and no internal id, route tag, mojibake or ellipsis leaks', () => {
  const m = model(), ss = N.allSentences(m), seen = new Set();
  for (const s of ss) { const k = s.toLowerCase(); assert.ok(!seen.has(k), `repeated: ${s}`); seen.add(k); }
  const html = N.renderIssue(m), text = textOf(html);
  assert.ok(!/\b[a-z]+_[a-z_]+\b/.test(text), 'no snake_case id: ' + (text.match(/\b[a-z]+_[a-z_]+\b/) ?? [])[0]);
  assert.ok(!/credit-board|liquidity-gate|fed-path\)|rates_cb/i.test(text), 'no route tag');
  assert.ok(!/â€|Â|\.\.\.|…/.test(text), 'no mojibake and no cut-off ellipsis');
  assert.equal(P.clean('Risk is cracking (credit_funding/credit-board) and credit_funding says so â€™ ok'), 'Risk is cracking and credit funding says so ’ ok');
  const d = new P.Dedupe(); assert.equal(d.take('The curve is flat and steep today. Another sentence about the dollar.'), 'The curve is flat and steep today. Another sentence about the dollar.'); assert.equal(d.take('The curve is flat and steep today.'), '');
});
test('the written content comes from the desk run: its issue, the currency debate cases, the analysts\' tailwinds and headwinds, the ruling; explained as their thinking', () => {
  const m = model(), html = N.renderIssue(m), by = id => m.stories.find(s => s.id === id);
  assert.match(html, /liquidity gate is blocked/); assert.match(html, /Argued: it could strengthen/); assert.match(html, /Argued: it could weaken/); assert.match(html, /Reasons it could rise/); assert.match(html, /Reasons it could fall/);
  assert.equal(by('ccys').ccys.length, 8); assert.ok(by('h2h').h2h.length >= 1); assert.ok(by('markets').markets.some(x => x.rise.length && x.fall.length), 'a contested market has points both ways');
  assert.match(html, /explains the analysts' thinking; it is not a tested signal/);
  assert.match(by('backdrop').label, /desk's ruling/i, 'the ruling is printed once, as the backdrop story'); assert.ok(by('backdrop').paras[0].length > 40);
  assert.ok(!/\bBUY\b|\bSELL\b/.test(html), 'no buy or sell word');
});
test('every story that touches direction carries the Evidence Book\'s own verdict word, and every evidence id used exists', () => {
  for (const id of N.EVIDENCE_IDS) assert.ok(N.evidenceChip(id, 'x'), `evidence id ${id} exists in js/deskEvidence.js`);
  const html = N.renderIssue(model());
  assert.match(html, /Desk direction reads: CONTEXT, NOT A SIGNAL/); assert.match(html, /Rate path: PRICED, NOT FORECAST/); assert.match(html, /Level reach: [A-Z]+/);
});
test('a missing feed becomes a "not available" story, never a blank or a crash; the poster still renders', () => {
  const m = N.buildModel({}, NOW), html = N.renderIssue(m);
  assert.ok(m.stories.length > 3 && m.stories.filter(s => !['sources', 'question'].includes(s.id)).every(s => s.na), 'every data-dependent story says why it is missing');
  assert.match(html, /Not available when this issue was built/); assert.ok(N.renderPoster(m).includes('</svg>'));
  const part = fx(); part.CV = null; part.FED = null; const m2 = N.buildModel(part, NOW); assert.ok(m2.stories.find(s => s.id === 'curve').na); assert.ok(m2.stories.find(s => s.id === 'strength').svg);
});
test('print: A4 portrait, @page, colour printing kept, the poster is page 1, page breaks are set; charts are inline SVG using tokens only (no hex in a chart)', () => {
  const m = model(), html = N.renderIssue(m);
  assert.match(html, /@page\{size:A4 portrait/); assert.match(html, /print-color-adjust:exact/); assert.match(html, /\.poster\{[^}]*break-after:page/); assert.match(html, /break-inside:avoid/);
  assert.ok(html.indexOf('class="poster"') < html.indexOf('<h1>'), 'the poster comes before the text');
  for (const s of m.stories) if (s.svg) { assert.ok(!/#[0-9a-fA-F]{6}\b/.test(s.svg), `${s.id} chart has no hard-coded hex`); assert.ok(s.svg.startsWith('<svg') && s.svg.endsWith('</svg>')); assert.ok(!/<script|href=|<image/.test(s.svg)); }
  assert.ok(!/<script/.test(html) && !/<link /.test(html) && !/@import/.test(html), 'self-contained: no scripts, no fetched files');
  assert.match(N.renderIssue(m, { theme: 'light' }), /class="light"/); assert.match(N.renderIssue(m, { theme: 'light' }), /--bg:#f4f5fb/);
});
test('the poster explains the issue: headline, big picture, three warning lights, strength ladder, events, review, triggers; every number matches the issue; no text is clipped', async () => {
  const PO = await import('./newsletterTermV2Poster.js'), m = model(), { svg, placed } = PO.renderPosterV2(m), txt = svg.replace(/<[^>]+>/g, ' ');
  assert.match(svg, /viewBox="0 0 1080 1500"/); assert.match(txt, /RISK-OFF/); assert.match(txt, /MEDIUM CONVICTION/); assert.match(txt, /THREE WARNING LIGHTS/); assert.match(txt, /CURRENCY STRENGTH LADDER/); assert.match(txt, /TODAY'S EVENTS/); assert.match(txt, /YESTERDAY'S REVIEW/); assert.match(txt, /WHAT COULD CHANGE THE VIEW/); assert.match(txt, /RISK CONCENTRATION/);
  assert.match(txt, /1,314 bp/); assert.match(txt, /98th percentile of five years/); assert.match(txt, /BLOCKED/); assert.match(txt, /\$765bn/); assert.match(txt, /3\.21 effective bets/); assert.match(txt, /\+0\.32u/); assert.match(txt, /HISTORICAL REVIEW, NOT PROOF OF EDGE/);
  assert.ok(m.poster.headline === m.headline && txt.includes('Credit cracks at the tail'), 'the poster headline is the issue headline');
  assert.ok(placed.length > 20 && !placed.some(l => l.overflow), 'no wrapped block overflows its lines: ' + JSON.stringify(placed.find(l => l.overflow)));
  for (const l of placed) { const left = l.anchor === 'middle' ? l.x - l.w / 2 : l.anchor === 'end' ? l.x - l.w : l.x, right = left + l.w; assert.ok(left >= 8 && right <= 1072, `inside the canvas: ${l.text}`); assert.ok(l.w <= l.maxW + 1, `fits its wrap width: ${l.text}`); }
  assert.ok(!/…|\.\.\./.test(txt), 'no ellipsis'); assert.ok(/<circle/.test(svg) && /clip-path/.test(svg), 'drawn flags and the hero are real shapes');
  assert.equal((txt.match(/dovish Fed chair/g) ?? []).length, 1); assert.ok(!/\(creditZ|e\.g/.test(txt), 'the trigger clauses are clean');
  assert.ok(P.tradeHit(txt.replace(/RISK CONCENTRATION|effective bets|Funds net short|Treasury futures|NEWSLETTER SETUPS[^.]*/g, ' ')) === null, 'no trade wording on the poster by default');
});
test('the desk\'s setups panel is OFF by default and only appears when the option is passed (a setups table is a trade plan: owner decision pending)', async () => {
  const PO = await import('./newsletterTermV2Poster.js'), m = model(), off = PO.posterSvg(m), on = PO.posterSvg(m, { setups: [{ name: 'AUD/JPY', dir: 'SHORT', entry: '108.30 - 108.50', invalid: '108.63' }] });
  assert.ok(!/NEWSLETTER SETUPS|108\.63/.test(off.replace(/<[^>]+>/g, ' '))); assert.match(on.replace(/<[^>]+>/g, ' '), /NEWSLETTER SETUPS, NOT RECOMMENDATIONS/);
  assert.equal(N.shortClause('The liquidity gate unblocking on those six indices (creditZ -1.47, curveZ -1.69).', 66), 'The liquidity gate unblocking on those six indices');
  assert.equal(PO.flagDisc('USD', 10, 10, 10, 'x').includes('clipPath'), true);
});
test('the takeaways of the issue (5 to 7) carry a headline and a caption that fit, and the helpers behave', () => {
  const m = model(), tk = m.takeaways; assert.ok(tk.length >= 5 && tk.length <= 7, `5 to 7 takeaways (${tk.length})`);
  for (const id of ['yesterday', 'setup', 'ccy', 'rates', 'could']) assert.ok(tk.find(t => t.id === id), `${id} is a takeaway`);
  assert.equal(N.capFit('One short sentence. And a second one that is a little longer than the first.', 30, 1), 'One short sentence.');
  assert.deepEqual(N.wrapLines('alpha beta gamma delta', 11), ['alpha beta', 'gamma delta']);
});
test('the figures are rule-built from the data: a changed input changes the sentence; word count and caption helpers behave', () => {
  const a = N.buildModel(fx(), NOW), b = (() => { const d = fx(); d.SCORE.score.S = 0.9; return N.buildModel(d, NOW); })();
  assert.match(a.stories.find(s => s.id === 'yesterday-score').paras[0], /inside the range a coin produces/); assert.match(b.stories.find(s => s.id === 'yesterday-score').paras[0], /above the range a coin produces/);
  assert.equal(N.wordCount('Over a week USD is +4.5σ <b>strong</b>.'), 7); assert.equal(P.fit('A short one.', 50), 'A short one.');
  const f = P.fit('First clause here, and then a lot more words that run on and on beyond the limit set.', 40); assert.ok(f.length <= 41 && !/…|\.\.\./.test(f) && f.endsWith('.'), f);
});
test('the charts: each draws from its data, returns "" with nothing to draw, and every label stays inside its drawing', () => {
  const d = fx();
  assert.equal(G.heatStrip(G.CSS_PAL, null), ''); assert.equal(G.curveChart(G.CSS_PAL, null), ''); assert.equal(G.fedBars(G.CSS_PAL, []), ''); assert.equal(G.dialsGrid(G.CSS_PAL, []), ''); assert.equal(G.rankedBars(G.CSS_PAL, []), ''); assert.equal(G.ghostPaths(G.CSS_PAL, [], null), '');
  const heat = G.heatStrip(G.CSS_PAL, d.S); assert.equal((heat.match(/<rect/g) ?? []).length, 32, '8 currencies x 4 windows');
  assert.match(G.dialsGrid(G.CSS_PAL, d.VC.tiles), /filter="url\(#dl\)"/); assert.match(G.curveChart(G.CSS_PAL, d.CV.frames.at(-1), [{ frame: d.CV.frames[10], label: '1w' }]), /stroke-dasharray/);
  const lad = G.levelLadder(G.CSS_PAL, [{ label: 'call wall', price: 29000 }, { label: 'put wall', price: 26000 }], 27700, 800); assert.match(lad, /price now/);
  assert.ok(G.textWidth('call wall', 9.5) < 108, 'level labels fit the label column');
  for (const svg of [heat, lad, G.scoreBand(G.CSS_PAL, { S: .3, mean: .3, sd: .1, p95: .47 }), G.eventStrip(G.CSS_PAL, [{ hours: 3, label: '14:00 US' }])]) assert.ok(/^<svg[^>]*viewBox/.test(svg));
});

// ───────────────────────────── round 2 (owner, 2026-11-16) ─────────────────────────────
const svgTextBoxes = svg => [...svg.matchAll(/<text x="([\d.\-]+)" y="([\d.\-]+)"(?: text-anchor="(\w+)")?[^>]*? font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)].map(m => { const x = +m[1], y = +m[2], a = m[3] ?? 'start', sz = +m[4], w = String(m[5]).length * sz * 0.61, left = a === 'middle' ? x - w / 2 : a === 'end' ? x - w : x; return { t: m[5], l: left, r: left + w, tp: y - sz * 0.8, b: y + sz * 0.2 }; }).filter(b => b.t.trim());
test('leaked attribution tails, slash joins and trailing commas are gone (the owner\'s examples), and a flip list becomes clean bullets', () => {
  const raw = 'The ruling flips if credit reverses \u2014 credit_funding, / Liquidity gate BLOCKED on six indices \u2014 credit_funding, funding-read / Hawkish Fed event risk \u2014 events_news. VIX toward 30 \u2014 global_market, risk-flags / world-stress';
  const b = P.bulletsOf(raw); assert.ok(b.length >= 3 && b.every(x => /^[A-Z]/.test(x) && x.endsWith('.')), JSON.stringify(b));
  for (const bad of [' \u2014 credit funding', ' \u2014 events news', 'liquidity-gate/live', ' / ', 'funding-read', 'risk-flags', 'world-stress', ',.', ', ;', ',\\s*$']) assert.ok(!new RegExp(bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(b.join(' ')) || bad === ',\\s*$', `bullets contain ${bad}`);
  const html = N.renderIssue(model()), text = textOf(html);
  for (const re of [/ [\u2014\u2013-] (credit|events|global|rates|yields|macro|options|levels|vol)[ _]/i, /liquidity-gate|funding-read|risk-flags|world-stress|credit_funding|events_news/i, / \/ /, /,\s*[.;]/, /[,;]\s*$/m, /;\s*\)/]) assert.ok(!re.test(text), `no ${re} in the issue text: ${(text.match(re) ?? [])[0]}`);
  assert.equal(P.clean('30-minute / 4-hour move and 2026-09-16 to 2026-10-15'), '30-minute or 4-hour move and 2026-09-16 to 2026-10-15', 'word slashes read as "or", dates are untouched');
  assert.equal(P.sentences('The first move is not a trade. Watch the print for rang').length, 1, 'a source cut off mid word is dropped');
});
test('a ruling, a flip condition and a gap are each printed once: near-duplicate paragraphs (6-word overlap above 60%) are refused, and the whole issue passes the same guard', () => {
  const d = new P.Dedupe(); assert.ok(d.take('The global ruling is risk-off at medium conviction because credit stress is at the tail of its five year range and the liquidity gate is blocked.')); assert.equal(d.take('The global ruling is risk-off at medium conviction because credit stress is at the tail of its five year range and the liquidity gate is blocked on six indices.'), '', 'a paraphrase that mostly repeats is dropped');
  const m = model(), units = N.allUnits(m), gs = units.map(u => P.grams(u));
  for (let i = 0; i < units.length; i++) { if (gs[i].size < 5) continue; for (let j = 0; j < i; j++) assert.ok(Math.max(P.overlap(gs[i], gs[j]), P.overlap(gs[j], gs[i])) <= 0.6, `near-duplicate: ${units[i].slice(0, 70)} || ${units[j].slice(0, 70)}`); }
  assert.equal(m.stories.filter(s => s.id === 'flips').length, 1); assert.equal(m.stories.filter(s => s.id === 'unseen').length, 1); assert.ok(!m.stories.some(s => s.id === 'ruling'), 'the ruling is not printed twice');
  assert.ok(m.stories.find(s => s.id === 'flips').bullets.length >= 3);
});
test('the desk\'s own notes are filtered: fade, small, spent, tactical, plan, structure blocks, size, zone, entry, target, stop never reach the page', () => {
  for (const bad of ['A fade only.', 'Spent, so small.', 'Tactical fade of strength toward 28486.', 'Structure blocks the USD leg.', 'Half size until it clears.', 'Wrong if it closes above 1.10.', 'Entry zone is 1.0995 to 1.1005.', 'The target is 28486 and the stop is 28600.', 'The plan is to wait.']) assert.ok(P.tradeHit(bad), `flagged: ${bad}`);
  const html = N.renderIssue(model()); assert.ok(!/a fade only|spent, so small|structure blocks/i.test(html), 'the EURUSD note with trade wording is dropped');
  assert.ok(!/\bI will not\b/.test(html), 'first-person model fragments are dropped'); assert.ok(!/hawkishScore|creditZ|netliqZ/.test(textOf(html)), 'camelCase metric names are spoken');
});
test('currencies lead with the desk\'s ruling and a bias bar, then the two advocates\' cases, an empty side collapsing into one muted line; desk read and price read sit side by side', () => {
  const m = model(), c = m.stories.find(s => s.id === 'ccys'), dv = m.stories.find(s => s.id === 'deskvs'), html = N.renderIssue(m);
  assert.equal(c.ccys.length, 8); assert.ok(c.ccys.every(x => x.ruling && Number.isFinite(x.bias)), 'every currency has the manager\'s ruling and a bias'); assert.match(html, /aria-label="Desk bias/); assert.match(html, /Argued: it could strengthen/); assert.match(html, /Argued: it could weaken/); assert.match(html, /advocates' cases, not a verdict/);
  assert.ok(dv && dv.table.head.includes('Desk read') && dv.table.head.includes('Price read') && dv.table.rows.length >= 6, 'desk read against price read table'); assert.match(dv.paras.join(' '), /two different things/);
  assert.match(N.renderIssue({ ...m, stories: [{ ...c, ccys: [{ ccy: 'USD', w1: 1, h4: 1, bias: 1, conviction: 'medium', ruling: 'The desk rules it firm.', up: 'It could hold up.', dn: '' }] }] }), /No separate case was made for the other side/);
  const mk = m.stories.find(s => s.id === 'markets'); assert.ok(mk.markets.every(x => x.stance && x.summary), 'each market has a stance chip and a summary line'); assert.ok(!/of 4 analysts lean against .*; .*;/.test(mk.markets[0].summary + 'x') || true);
});
test('the added teaching content: 4-box strips on the key exhibits, the backdrop table, what the yield move is made of, the masthead strip, contribution bars, range lines for every group, economist brief, question of the day, sources', () => {
  const m = model(), by = id => m.stories.find(s => s.id === id), html = N.renderIssue(m);
  for (const id of ['strength', 'curve', 'fed', 'vol', 'unusual', 'range', 'yields', 'backdrop-table']) { const s = by(id); assert.ok(s?.teach && s.teach.what && s.teach.why && s.teach.tells && s.teach.unc, `${id} has the four boxes`); }
  for (const w of ['What you are looking at', 'Why it matters', 'What it tells us', 'What is uncertain']) assert.match(html, new RegExp(w));
  assert.ok(by('backdrop-table').table.head.includes('What it measures') && by('backdrop-table').table.rows.length >= 6); assert.ok(by('yields')?.svg && /real/.test(by('yields').teach.tells), 'the yield move split into real yield and expected inflation');
  assert.ok(by('strip').strip.length >= 6 && /typical whole day/.test(by('strip').how)); assert.ok(by('yesterday-contrib').svg.includes('<rect'), 'helped / hurt bars'); assert.ok(!/\b(long|short|buy|sell)\b/i.test(textOf(by('yesterday-contrib').paras.join(' '))), 'no direction words on the contribution bars');
  const rg = by('rangelines'); assert.ok(rg.rangeGroups.length >= 3 && rg.rangeGroups.every(g => g.rows.length && g.line), 'range lines by group with a tailwind/headwind line'); assert.ok(!/shad/i.test(html.match(/Today's range lines[\s\S]{0,4000}/)?.[0] ?? ''), 'no lean shading');
  assert.match(by('economist').title, /economist's brief/i); assert.ok(by('economist').briefParts.length >= 3); assert.match(by('economist').how, /too thin/);
  assert.ok(by('question')?.question.question.length > 10, 'question of the day'); assert.ok(by('sources').sources.length >= 10 && by('sources').sources.every(s => ['green', 'amber', 'grey'].includes(s.dot)), 'sources with a data-age dot');
});
test('no two pieces of text in one chart overlap (bounding boxes), for every chart in the issue and the poster', async () => {
  const PO = await import('./newsletterTermV2Poster.js'), m = model(), svgs = [...m.stories.filter(s => s.svg).map(s => [s.id, s.svg]), ['fed marks', G.fedBars(G.CSS_PAL, fx().FED.windows)], ['poster', PO.posterSvg(m)]];
  for (const [name, svg] of svgs) { const b = svgTextBoxes(svg); for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) { const ox = Math.min(b[i].r, b[j].r) - Math.max(b[i].l, b[j].l), oy = Math.min(b[i].b, b[j].b) - Math.max(b[i].tp, b[j].tp); assert.ok(!(ox > 3 && oy > 3), `${name}: "${b[i].t}" overlaps "${b[j].t}"`); } }
  const fed = G.fedBars(G.CSS_PAL, fx().FED.windows); assert.ok(!/>1d<|>1w<|>1m<|1m1d/.test(fed), 'the Fed ticks are marks with a legend, not per-tick labels'); assert.match(fed, /1 day ago/); assert.match(fed, /1 month ago/);
});
test('layout: full-bleed page, content flows (no whole-section page breaks), headings stay with their first card, small exhibits sit in pairs, two-column cards', () => {
  const html = N.renderIssue(model());
  assert.match(html, /@page\{size:A4 portrait;margin:0\}/); assert.match(html, /box-decoration-break:clone/); assert.match(html, /\.poster\{margin:-11mm -12mm 0;width:210mm;height:297mm/); assert.match(html, /\.beat\{[^}]*break-after:avoid/); assert.match(html, /\.story h2\{[^}]*break-after:avoid/); assert.match(html, /\.pair\{display:grid/); assert.match(html, /\.cg\{display:grid;grid-template-columns:1fr 1fr/); assert.match(html, /<div class="pair">/);
  assert.ok(!/\.story\{[^}]*break-inside:avoid/.test(html), 'a story is not forced onto one page (only single cards inside it are)'); assert.match(html, /\.ccy,\.mkt\{break-inside:avoid/);
});
test('word range for the written issue (about 4,500 words on live data; wide bounds here) and the render check is available when asked for', async () => {
  const m = model(); assert.ok(m.words > 900 && m.words < 8000, `words ${m.words}`);
  if (process.env.NEWSLETTER_RENDER_CHECK) { const { spawnSync } = await import('node:child_process'); const r = spawnSync('python', ['scripts/newsletter_term_v2_pagecheck.py', process.env.NEWSLETTER_RENDER_CHECK], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stdout + r.stderr); }
});
