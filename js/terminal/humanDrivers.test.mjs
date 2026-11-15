// node --test js/terminal/humanDrivers.test.mjs
// The "What drives this" panel in plain English: names, sources, trimming, figures, takeaways, the rendered card, and the viewer's copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESK_SKILLS } from '../deskPack.js';
import { sanitizeRun, isTradeText, isTradeLevelText } from '../deskViewerView.js';
import { cardDrivers } from './cardExplain.js';
import * as HD from './humanDrivers.js';
import { humanDriversHtml } from './humanDriversView.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const visible = html => html.replace(/<\/?(b|span|i)[^>]*>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const here = path.dirname(fileURLToPath(import.meta.url));

test('every analyst id in the Desk Pack has a plain name, and an unknown id is title-cased, never snake_case', () => {
  for (const s of DESK_SKILLS) { assert.ok(HD.ANALYST_LABEL[s.id], `no label for ${s.id}`); assert.ok(!/_/.test(HD.analystLabel(s.id))); }
  assert.equal(HD.analystLabel('rates_cb'), 'Central banks & rates');
  assert.equal(HD.analystLabel('new_fancy_analyst'), 'New fancy analyst');
  assert.equal(HD.analystLabel(''), 'Analyst');
});

test('fitText ends on a sentence, clause or word; never mid-word, mid-number, inside a bracket or on a lone surrogate', () => {
  const claims = [
    'The USD-JPY short-rate gap is the widest structural spread in the set; USD 2.7 (score 1.0) and JPY 2.31 (score 0.92) are the strong outliers while CAD (-0.86), GBP (-0.47) and CHF (-0.63) are weakest.',
    'FOMC held at 3.75-4% on 2026-10-28 with a 10-2 vote where both dissenters wanted a 25bp HIKE, hawkish score 0.72; markets price hike odds of 98% for December and 93% for March (mean path ~431bp to ~461bp), so the expected path is rising.',
    'Fed speakers since the Oct statement drift -0.15 (leaning dovish): Waller 2026-11-10 leans to a 25bp December hike and says 50bp should be considered if core CPI stays hot (score 0.9, +0.18); Bowman 2 is less sure.',
    'Gold spot 3884.69 is in a BREAKOUT regime right at its gamma flip 3884.89 with 3-day put walls at 3848.38 and 3898.38 (strong) and call walls at 3923.38 and 3948.38; hedging speeds moves 😀 up.',
  ];
  for (const c of claims) for (let max = 40; max < c.length; max += 7) {
    const out = HD.fitText(c, max), body = out.replace(/…$/, '');
    assert.ok(out.length <= max + 1, `too long at ${max}: ${out}`);
    assert.ok(c.replace(/\s+/g, ' ').startsWith(body), `not a prefix at ${max}: ${out}`);
    assert.ok(!/[\uD800-\uDBFF]$/.test(body), 'lone surrogate');
    assert.equal((body.match(/[([{]/g) ?? []).length, (body.match(/[)\]}]/g) ?? []).length, `unbalanced bracket at ${max}: ${out}`);
    const next = c.slice(body.length).replace(/^\s/, '')[0];
    const tailTok = body.match(/[^\s]+$/)?.[0] ?? '';
    // the next character must start a new token: the cut is at a space or punctuation, not inside "stru|ctural" or "431|bp"
    assert.ok(c[body.length] === undefined || /[\s,;:.—–]/.test(c[body.length]) || /[\s,;:.—–]$/.test(body), `cut inside a token at ${max}: "${body}" | "${c.slice(body.length, body.length + 8)}"`);
    assert.ok(!/[\d.,%+~-]$/.test(tailTok) || /^[\d.,%+~-]+$/.test(c.slice(body.length).trimStart().split(/\s/)[0]) === false, `ended inside a number at ${max}: ${out}`);
    void next;
  }
  assert.equal(HD.fitText('Short enough.', 80), 'Short enough.');
  assert.equal(HD.fitText('', 10), '');
  // a decimal point is not a sentence end
  assert.ok(!/3\.…?$/.test(HD.fitText('FOMC held at 3.75-4% on the day with a split vote and a hawkish tone overall', 16)));
  // an emoji at the cut is not split
  assert.ok(!/[\uD800-\uDBFF]/.test(HD.fitText('a'.repeat(9) + '😀' + ' tail words follow here', 10)));
});

test('sentences does not split on decimals, versions or U.S.', () => {
  const t = 'Rate 3.75-4% held. Markets price 98% for December (mean 4.3). The U.S. curve is flat. Next.';
  assert.deepEqual(HD.sentences(t), ['Rate 3.75-4% held.', 'Markets price 98% for December (mean 4.3).', 'The U.S. curve is flat.', 'Next.']);
  assert.deepEqual(HD.sentences(''), []);
});

test('splitLead keeps every word: a long claim breaks at a clause, a short one stays whole', () => {
  const c = 'FOMC held at 3.75-4% on 2026-10-28 with a 10-2 vote where both dissenters wanted a 25bp HIKE, hawkish score 0.72; markets price hike odds of 98% for December and 93% for March, so the dollar keeps its rate support.';
  const { lead, rest } = HD.splitLead(c);
  assert.ok(lead.length < c.length && rest.startsWith('Markets price'), `${lead} | ${rest}`);
  const norm = s => s.toLowerCase().replace(/[\s.;,—-]+/g, ' ').trim();
  assert.equal(norm(`${lead} ${rest}`), norm(c));
  assert.deepEqual(HD.splitLead('A short one.'), { lead: 'A short one.', rest: '' });
  // a clause break on ", with" leaves no stray comma or full stop at the start of the rest
  const w = HD.splitLead('USD inflation pressure is the highest scored: CPI pressure 0.64 and PPI pressure 0.94 (Oct prints), with inflation the dominant scorecard factor at 0.79; Cleveland nowcast has CPI at 0.135% m/m and core at 0.211% (as of 12 Nov).');
  assert.ok(!/^[\s.,;—-]/.test(w.rest) && /\.$/.test(w.lead), JSON.stringify(w)); assert.ok(w.rest.startsWith('With inflation'), w.rest);
});

test('emphasise: dates written plainly, key figures picked out, everything escaped', () => {
  const h = HD.emphasise('Waller 2026-11-10 leans to a 25bp hike; odds 98% (z 0.9), a 10-2 vote, gold 3884.69, 2025-12-01.', esc, { refYear: 2026 });
  assert.match(h, /<span class="hd-d">10 Nov<\/span>/); assert.match(h, /<span class="hd-d">1 Dec 2025<\/span>/);
  assert.match(h, /<b class="hd-n">25bp<\/b>/); assert.match(h, /<b class="hd-n">98%<\/b>/); assert.match(h, /<b class="hd-n">0\.9<\/b>/); assert.match(h, /<b class="hd-n">3884\.69<\/b>/);
  assert.ok(!/<b class="hd-n">10<\/b>/.test(h), 'a plain count is not a key figure');
  assert.match(HD.emphasise('position percentile 100, State A; flow 2,993 futures', esc), /<b class="hd-n">2,993<\/b>/);
  assert.ok(!/100,<\/b>/.test(HD.emphasise('position percentile 100, State A', esc)), 'a trailing comma is not part of a figure');
  const x = HD.emphasise('<img src=x onerror=alert(1)> beats 5% & "quotes"', esc);
  assert.ok(!/<img/i.test(x)); assert.match(x, /&lt;img/); assert.match(x, /<b class="hd-n">5%<\/b>/);
});

test('evidence tags become friendly sources; a bracketed test note becomes a plain note; no route names survive', () => {
  const e = HD.parseEvidence('macro-changes, credit-leads-equities (TESTED NULL, reopened); trade-decision/state:USDCAD; levels; fomc/latest; some-new-feed');
  assert.deepEqual(e.map(x => x.label), ['Macro changes', 'Credit-leads-equities', 'Market state · USD/CAD', 'Level engine', 'FOMC statement', 'Some new feed']);
  assert.equal(e[1].note, 'tested before: no clear edge found');
  assert.equal(HD.prettyFeed('swing-map:GOLD'), 'Swing map · Gold');
  assert.equal(HD.staleWords('fed-path (stale, 257h)'), 'Fed path (11 days old)');
  assert.equal(HD.gapPhrase({ id: 'xccy-basis', status: 'empty' }), 'Cross-currency basis (no data)');
  assert.equal(HD.gapPhrase({ id: 'term-premium', status: 'stale', ageH: 227 }), 'Term premium (9 days old)');
  assert.equal(HD.ageWords(5), '5 hours old'); assert.equal(HD.ageWords(1542), '9 weeks old');
  assert.equal(HD.gapCount(1), '1 input'); assert.equal(HD.gapCount(2), '2 inputs');
});

test('stance, takeaway and summary are built by rule from the net push, in market words', () => {
  assert.deepEqual([0, 0.4, 1, 2, 4, -1, -2, -5].map(n => HD.stance(n).word + ':' + HD.stance(n).strength), ['Neutral:none', 'Neutral:none', 'Tailwind:mild', 'Tailwind:clear', 'Tailwind:strong', 'Headwind:mild', 'Headwind:clear', 'Headwind:strong']);
  assert.equal(HD.takeaway({ net: -4, forN: 0, againstN: 3, points: [{ push: -2 }, { push: -2 }] }, 'Gold'), 'A strong headwind for Gold.');
  assert.equal(HD.takeaway({ net: 1, forN: 1, againstN: 1, points: [{ push: 2 }, { push: -1 }] }, 'Gold'), 'A mild tailwind for Gold, though not every point agrees.');
  assert.equal(HD.takeaway({ net: 0, forN: 1, againstN: 1, points: [{ push: 1 }, { push: -1 }] }, 'Gold'), 'Pulls both ways, roughly neutral for Gold.');
  const an = [{ id: 'rates_cb', net: -4 }, { id: 'macro_economy', net: -3 }, { id: 'yields_curve', net: 2 }, { id: 'cot_positioning', net: 0 }];
  assert.equal(HD.summaryLine(an, 'Gold'), "Central banks & rates and Economy & inflation lean against Gold; Yields & the curve leans Gold's way; Positioning is roughly neutral.");
  assert.equal(HD.summaryLine([], 'Gold'), '');
  assert.equal(HD.channelsPhrase(['direct', 'the dollar (priced in USD)'], 'Gold'), 'Points that bear on Gold, directly and through the dollar.');
  assert.equal(HD.channelsPhrase(['direct', 'EUR leg', 'USD leg (quote)'], 'EUR/USD'), 'Points that bear on EUR/USD, directly and through EUR and USD.');
  assert.equal(HD.channelsPhrase(['direct'], 'NQ'), 'Points that bear on NQ directly.');
});

// ── the rendered card, from a desk-run shaped like the live one (Gold, 2026-11-15) ──
const LONG = 'The USD-JPY short-rate gap is the widest structural spread in the set; USD 2.7 (score 1.0) and JPY 2.31 (score 0.92) are the strong outliers while CAD (-0.86), GBP (-0.47) and CHF (-0.63) are the weakest on the day.';
const run = () => ({
  date: '2026-11-15', packBuiltAt: '2026-11-15T10:40:00Z', finishedAt: '2026-11-15T11:15:00Z',
  head: { ok: true, book: { instruments: { GOLD: { rating: 'FLAT', conviction: 'low', size: 0, why: 'USD headwind only.', invalidation: 'Close above 3950', plan: { invalidation: 'Close above 3950', entry: 'Buy at 3880' } } } } },
  dataQuality: { gaps: [{ id: 'cb-expectations', skill: 'rates_cb', status: 'stale', ageH: 257.4 }, { id: 'rbnz/latest', skill: 'rates_cb', status: 'empty' }] },
  analysts: {
    rates_cb: { ok: true, layer: 'currency', report: { confidence: 'medium', points: [
      { claim: 'FOMC held at 3.75-4% on 2026-10-28 with a 10-2 vote where both dissenters wanted a 25bp HIKE, hawkish score 0.72; markets price hike odds of 98% for December and 93% for March (mean path ~431bp to ~461bp), so the expected path is rising.', evidence: 'fomc/latest; fed-path', impact: { USD: 2 } },
      { claim: LONG, evidence: 'rate-diff', impact: { USD: 1 } },
      { claim: 'Fed speakers since the Oct statement drift -0.15 (leaning dovish). Waller 2026-11-10 leans to a 25bp December hike. Buy at 3880 on the dip.', evidence: 'speech-drift; cb-expectations', impact: { USD: 1 } },
      { claim: 'A fourth point, shown under "more".', evidence: 'rates', impact: { USD: 1 } } ] } },
    macro_economy: { ok: true, layer: 'currency', report: { points: [{ claim: 'USD inflation pressure is the highest scored: CPI pressure 0.64 and PPI pressure 0.94.', evidence: 'cpi, ppi, macro-scorecard, nowcast', impact: { USD: 2 } }] } },
    yields_curve: { ok: true, layer: 'currency', report: { points: [{ claim: 'US real 10y yield is 1.05%, z-score -0.53: real yields sit below their recent norm, which is not a headwind for gold.', evidence: 'real-yield', impact: { USD: -2 } }] } },
    options_oi: { ok: true, layer: 'asset', report: { points: [{ claim: 'Gold spot 3884.69 is in a BREAKOUT regime right at its gamma flip 3884.89.', evidence: 'hedging-summary, oi-levels, swing-map:GOLD', impact: { GOLD: 1 } }] } },
    some_new_analyst: { ok: true, report: { points: [{ claim: 'A brand new analyst says something.', evidence: 'brand-new-feed', impact: { GOLD: 1 } }] } },
  },
});
const GOLD = r => cardDrivers(r, 'GOLD', { cap: 12 });

test('the card reads like a person wrote it: plain names, takeaways, full sentences, friendly sources, no routes or brackets', () => {
  const html = humanDriversHtml(GOLD(run()), { market: 'Gold', esc, refYear: 2026 }), text = visible(html);
  assert.match(text, /Central banks & rates/); assert.match(text, /Economy & inflation/); assert.match(text, /Yields & the curve/); assert.match(text, /Options & dealer flow/); assert.match(text, /New fancy analyst|Some new analyst/);
  assert.ok(!/[a-z]+_[a-z]+/.test(text), `snake_case showed: ${text.match(/[a-z]+_[a-z]+/)}`);
  assert.ok(!/\[[^\]]*(fomc|fed-path|\/latest)[^\]]*\]/i.test(text), 'a bracketed route tag is back');
  assert.ok(!/[▲▼]\s*\d/.test(text), 'raw arrow-and-count marks are back');
  assert.match(text, /A strong headwind for Gold/); assert.match(text, /Headwind/); assert.match(text, /Tailwind/);
  assert.match(text, /^Central banks & rates and Economy & inflation lean against Gold/);
  // nothing is cut: the long claim shows to its last word (the old panel stopped at 200 characters: "...the widest stru")
  assert.ok(text.includes('are the weakest on the day.'), 'the long claim was cut');
  assert.ok(text.includes('(mean path ~431bp to ~461bp)'), 'the figures were garbled');
  // sources are friendly and collapsed; gaps are in words
  assert.match(html, /<details class="hd-src"><summary>Where this comes from<\/summary>/);
  assert.match(text, /Fed path · FOMC statement|FOMC statement · Fed path/);
  assert.match(text, /Swing map · Gold/);
  assert.match(text, /2 inputs weren't available or were out of date this morning: Rate expectations \(futures\) \(11 days old\), RBNZ statement \(no data\)/);
  assert.match(text, /older data: Rate expectations \(futures\) \(11 days old\)/);
  // the 4th point is behind "more", the card still names every analyst, and the strongest card comes first
  assert.match(html, /<details class="hd-more"><summary>1 more point<\/summary>/);
  assert.ok(html.indexOf('data-an="rates_cb"') < html.indexOf('data-an="yields_curve"'));
  // a tiny weight bar is present and not colour-only (word chip + dots + aria-label)
  assert.match(html, /class="hd-bar dn" role="img" aria-label="Headwind, weight 5"/);
});

test('the viewer copy: trade sentences stay stripped, and nothing the panel writes reads as a trade instruction', () => {
  const clean = sanitizeRun(run(), () => false);
  const x = GOLD(clean), html = humanDriversHtml(x, { market: 'Gold', esc, refYear: 2026 }), text = visible(html);
  assert.ok(!/buy at/i.test(text), 'a trade sentence survived the sanitiser');
  assert.equal(x.invalidation, null, 'the invalidation level is owner-only');
  assert.equal(isTradeLevelText(text), false);
  // the words the panel itself adds are analysis words, never a plan
  const chrome = [HD.summaryLine(x.analysts, 'Gold'), HD.channelsPhrase(x.channels, 'Gold'), ...x.analysts.map(a => HD.takeaway(a, 'Gold')), ...Object.values(HD.ANALYST_LABEL), ...Object.values(HD.FEED_LABEL), 'Headwind', 'Tailwind', 'Neutral'];
  for (const s of chrome) assert.equal(isTradeText(s), false, `reads as a trade: ${s}`);
});

test('an empty run, a flat market with no points and unusual data do not break the card', () => {
  const empty = humanDriversHtml({ analysts: [], channels: ['direct'], more: 0 }, { market: 'Gold', esc });
  assert.equal(typeof empty, 'string');
  const odd = { analysts: [{ id: 'weird_one', net: NaN, forN: 0, againstN: 0, gaps: [{ id: 'x', status: 'stale', ageH: null }], points: [{ claim: '', evidence: null, push: 1, via: [], staleFeeds: ['garbage'] }] }], channels: [], more: 2 };
  assert.match(visible(humanDriversHtml(odd, { market: 'Gold', esc })), /Weird one/);
});

test('the panel stylesheet exists, uses tokens only and respects reduced motion', () => {
  const css = fs.readFileSync(path.join(here, 'humanDrivers.css'), 'utf8');
  assert.match(css, /prefers-reduced-motion/); assert.ok(!/#[0-9a-f]{3,6}\b/i.test(css.replace(/\/\*[\s\S]*?\*\//g, '')));
  assert.match(css, /max-width: 640px/);
});
