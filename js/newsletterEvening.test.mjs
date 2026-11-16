// Tests for js/newsletterEvening.js and the "Yesterday, reviewed" page.   node js/newsletterEvening.test.mjs
import assert from 'node:assert/strict';
import { dayMoves, movesText, renderEvening, currencyStrength, moveGrid } from './newsletterEvening.js';
import { reviewPage } from './newsletterDesk.js';
import { londonMs, windowFor } from './deskScore.js';
import { buildEveningDay } from './eveningDay.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const H = { esc: s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') };
const L = { open: 100, up: { p50: 101 }, down: { p50: 99 } };
const path = (a, b) => { const s = londonMs('2026-11-04', 8) / 1000; return Array.from({ length: 780 }, (_, i) => { const p = a + (b - a) * i / 779; return { time: s + i * 60, open: p, high: p + 0.2, low: p - 0.2, close: p }; }); };
const cards = { EURUSD: { rating: 'SHORT', levels: L }, GOLD: { rating: 'SHORT', levels: L }, NQ: { rating: 'LONG' } };
const bars = { EURUSD: path(100, 99), GOLD: path(100, 101.5), NQ: path(100, 100.3) };

t('day moves: percent always, u and range in u only where the book had levels', () => {
  const m = dayMoves(bars, cards, '2026-11-04');
  assert.equal(m.EURUSD.pct, -1); assert.equal(m.EURUSD.u, -1); assert.equal(m.GOLD.u, 1.5); assert.equal(m.GOLD.rangeU, 1.9);
  assert.equal(m.NQ.u, null); assert.equal(m.NQ.pct, 0.3);
  assert.match(movesText(m, cards), /FX majors: EURUSD -1% \(-1 u, range 1\.4 u\) · book: SHORT/);
  assert.match(movesText(m, cards), /Metals: GOLD \+1\.5%/);
});

const score = { date: '2026-11-04', eligible: true, S: 0.12, unweighted: 0.1, live: 3, scored: 2, placebo: { mean: 0, p95: 0.4 }, control: { unweighted: -0.05 }, race: { resolved: 2, leanFirst: 1 },
  cards: { EURUSD: { dir: -1, R: 1, race: 1, size: 1 }, GOLD: { dir: -1, R: -1.5, race: -1, size: 0.5 } } };
const reflection = { headline: 'Short EUR worked; short gold did not', worked: ['EUR/USD fell 1 u'], failed: ['Gold rose 1.5 u against a short'], lessons: [{ lesson: 'Check the real-yield chain before shorting gold on the dollar alone.', scope: 'asset', about: 'GOLD' }], watch: ['Gold at the p75 line'] };
const record = { eligibleDays: 1, S: { mean: 0.12, ci: null }, vsControl: { mean: 0.15 } };

t('"Yesterday, reviewed": the score, the cards that moved it, the review, labelled; nothing without a score', () => {
  const p = reviewPage({ score, reflection, movers: { best: [{ inst: 'EURUSD', R: 1 }], worst: [{ inst: 'GOLD', R: -1.5 }] }, record }, H);
  assert.equal(p.section, 'Yesterday, reviewed');
  assert.ok(p.html.includes('Short EUR worked; short gold did not') && p.html.includes('+0.12 u') && p.html.includes('THE CARDS THAT MOVED THE DAY'));
  assert.ok(p.html.includes('Made the day:</b> EUR/USD +1.00 u') && p.html.includes('What the desk takes from it') && p.html.includes('One day is an anecdote'));
  assert.ok(p.html.includes('This day counts in the test') && p.html.includes('Running record, interim and not judged: 1 counted day'));
  assert.equal(reviewPage(null, H), null);
});

t('the evening edition: a whole page with the moves, the writer\'s sections labelled, the review, and the disclaimer', () => {
  const issue = { subject: 'Gold up, euro down', standfirst: 'A mixed day.', sections: [{ title: 'The day in one picture', label: 'Observed data', body: 'Gold rose.' }, { title: 'What moved', label: 'Untested interpretation', body: 'Real yields fell (yields_curve).' }, { title: 'Into tomorrow', label: 'Untested interpretation', body: 'Check gold.' }] };
  const out = renderEvening({ date: '2026-11-04', issue, score, reflection, movers: null, record, moves: dayMoves(bars, cards, '2026-11-04'), cards }, H);
  assert.equal(out.subject, 'Evening: Gold up, euro down');
  assert.ok(out.html.startsWith('<!doctype html>') && out.html.includes('Evening · 4 Nov 2026') && out.html.includes('Where the moves were'));
  assert.ok(out.html.includes('The book against the day') && out.html.includes('NOT FINANCIAL ADVICE'));
  assert.ok(out.html.includes('Untested interpretation') && !out.html.includes('yields_curve'), 'labelled, no source tags');
  assert.ok(out.text.includes('WHAT MOVED') && out.text.includes('NOT FINANCIAL ADVICE'));
});

t('compact evening: currency chart from the pairs, a market grid, no lessons or watch list, no prereg path', () => {
  const cs = currencyStrength({ USDJPY: { u: 2 }, EURJPY: { u: 1 }, EURUSD: { u: -1 }, GOLD: { u: 1 } });
  assert.deepEqual(cs.map(c => c.ccy), ['USD', 'EUR', 'JPY']); assert.equal(cs[0].v, 1.5); assert.equal(cs.at(-1).v, -1.5);
  assert.match(moveGrid({ EURUSD: { u: -1, chg: -0.0012, pct: -0.11 }, USDJPY: { u: 2.44, chg: 0.83, pct: 0.54 } }, { EURUSD: { rating: 'SHORT' } }, H), /EUR\/USD.*short.*−1\.0u.*−12 pips, −0\.11%.*USD\/JPY.*\+83 pips, \+0\.54%/s);
  const issue = { subject: 'S', standfirst: 'One. Two. Three. Four.', sections: [{ title: 'The day', label: 'Observed data', body: 'A. B. C. D. E.' }] };
  const out = renderEvening({ date: '2026-11-04', issue, score, reflection, movers: null, record, moves: dayMoves(bars, cards, '2026-11-04'), cards }, H);
  assert.ok(!out.html.includes('What the desk takes from it') && !out.html.includes('Carried into today') && !out.html.includes('PREREG'));
  assert.ok(!out.html.includes('Four.'), 'the standfirst is capped at two sentences');
});

// ── the look-back pages (owner, 2026-11-16) ────────────────────────────────────────────────────────────────────────
const D16 = '2026-11-16', W16 = windowFor(D16);
const mkb = (open, f) => { const out = [], N = Math.round((W16.exitMs - W16.entryMs) / 60000); for (let i = 0; i < N; i++) { const p0 = open + f(i / N), p1 = open + f((i + 1) / N); out.push({ time: W16.entryMs / 1000 + i * 60, open: p0, high: Math.max(p0, p1), low: Math.min(p0, p1), close: p1 }); } return out; };
const Lv = (open, u) => ({ open, up: { p50: open + u }, down: { p50: open - u } });
const cards16 = { SPX500: { rating: 'SHORT', size: 0.4, levels: Lv(7000, 50) }, NQ: { rating: 'SHORT', size: 0.4, levels: Lv(25000, 200) }, EURUSD: { rating: 'SHORT', size: 0.45, levels: Lv(1.1, 0.0023) } };
const bars16 = { SPX500: mkb(7000, x => (x < 0.55 ? 0 : -(x - 0.55) / 0.45 * 100)), NQ: mkb(25000, x => -x * 360), EURUSD: mkb(1.1, x => -x * 0.0021) };
const moves16 = dayMoves(bars16, cards16, D16);
const trDay = { regime: { tone: 'risk_off', conviction: 'medium', realised: -1.48, basket: 14, verdict: 'right' }, morning: { headline: 'Risk-off at medium conviction. Signed small.' },
  currencies: { ranking: ['USD', 'EUR'], realisedRanking: ['USD', 'EUR'], strongest: { ccy: 'USD', realisedRank: 1, of: 8 }, weakest: { ccy: 'EUR', realisedRank: 8, of: 8 }, perCcy: [{ ccy: 'USD', bias: 1, realised: 0.96, verdict: 'right' }, { ccy: 'EUR', bias: -1, realised: -0.9, verdict: 'right' }] },
  cards: [{ inst: 'NQ', verdict: 'right', p50: { reached: true }, first: 'p50' }] };
const dayInput = { date: D16, wire: [{ ms: londonMs(D16, 14, 45), title: 'Dow drops as yields slip', sources: ['Yahoo'], tier: 2, read: { tier: 2, impact: { EQUITIES: -1 } } }],
  events: [{ ms: londonMs(D16, 13, 30), country: 'CA', event: 'CPI m/m', impact: 'high', actual: '0.2%', estimate: '0.3%' }, { ms: londonMs(D16, 17, 0), country: 'US', event: 'Fed Chairman Warsh Speaks', impact: 'high' }], scorecards: [],
  bursts: [{ inst: 'SPX500', u: -2, fromMs: londonMs(D16, 14, 40), toMs: londonMs(D16, 15, 10), from: '14:40', to: '15:10', share: 80 }, { inst: 'NQ', u: -1.8, fromMs: londonMs(D16, 14, 45), toMs: londonMs(D16, 15, 15), from: '14:45', to: '15:15', share: 70 }],
  bars: bars16, cards: cards16, tr: trDay, nextEvents: [{ ms: londonMs('2026-11-17', 13, 30), country: 'US', event: 'Retail Sales m/m', impact: 'high', estimate: '0.2%', prev: '0.8%' }], now: W16.exitMs + 300e3 };
const issue16 = { subject: 'Soft CPI, risk-off', standfirst: 'One. Two.', sections: [{ title: 'The day', label: 'Observed data', body: 'A risk-off session. The dollar was bid.' }, { title: 'Rates', label: 'Observed data', body: 'Yields slipped.' }, { title: 'Across', label: 'Observed data', body: 'Indices sold.' }] };
const ev16 = { date: D16, issue: issue16, score: { ...score, S: 1.1251, placebo: { mean: 0, p95: 0.81 } }, reflection, movers: null, record, moves: moves16, cards: cards16, day: buildEveningDay(dayInput) };
const strip = h => h.replace(/<div class="mh">[\s\S]*?<\/div>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

t('with the day built, the issue gains the day in order, how it unfolded, when the moves came, the morning against the day, and tomorrow; without it the issue is as before', () => {
  const withDay = renderEvening(ev16, H).html, without = renderEvening({ ...ev16, day: undefined }, H).html;
  for (const h of ['The day in order', 'What happened, hour by hour', 'How the day unfolded', 'When the moves came', 'This morning against the day', 'Into tomorrow', 'was scheduled for 17:00 London: no headline captured in the wire.', 'Nearest headlines: 14:45 Dow drops as yields slip']) assert.ok(withDay.includes(h), h);
  for (const h of ['The day in order', 'How the day unfolded', 'Into tomorrow']) assert.ok(!without.includes(h), `${h} only when the day is built`);
  assert.ok(withDay.indexOf('The day in order') < withDay.indexOf('Across markets'), 'the day in order comes before the rest of the narrative'); assert.ok(withDay.indexOf('Into tomorrow') < withDay.indexOf('Where the moves were'), 'the look-back pages come before the grid of numbers');
  assert.match(renderEvening(ev16, H).text, /THE DAY IN ORDER \(London time\)/);
});

t('the new pages add no trade wording, no repeated passage, and stay inside a word budget', () => {
  const html = renderEvening(ev16, H).html, a = html.indexOf('The day in order'), b = html.indexOf('Where the moves were'), part = strip(html.slice(a, b));
  assert.ok(!/(entry|target|stop[- ]?loss|invalidat|zone|take profit|buy|sell|long|short|size[ds]?)/i.test(part.replace(/long-?term/gi, '')), 'no trade wording in the new pages: ' + (part.match(/(entry|target|zone|buy|sell|long|short|sized?)/i) ?? [''])[0]);
  const words = part.split(' ').filter(Boolean), grams = new Map();
  for (let i = 0; i + 8 <= words.length; i++) { const g = words.slice(i, i + 8).join(' ').toLowerCase(); grams.set(g, (grams.get(g) ?? 0) + 1); }
  const rep = [...grams].filter(([, c]) => c > 1).map(([g]) => g); assert.deepEqual(rep.filter(g => !/headline captured|nearest headlines|no news found/.test(g)), [], 'no 8-word passage printed twice');
  assert.ok(words.length < 1100, `the new pages stay under 1,100 words, got ${words.length}`);
});

console.log(`newsletterEvening: ${n} tests passed`);
