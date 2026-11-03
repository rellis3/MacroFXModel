// Tests for js/newsletterEvening.js and the "Yesterday, reviewed" page.   node js/newsletterEvening.test.mjs
import assert from 'node:assert/strict';
import { dayMoves, movesText, renderEvening, currencyStrength, moveGrid } from './newsletterEvening.js';
import { reviewPage } from './newsletterDesk.js';
import { londonMs } from './deskScore.js';

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

console.log(`newsletterEvening: ${n} tests passed`);
