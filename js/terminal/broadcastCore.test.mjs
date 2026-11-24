// js/terminal/broadcastCore.test.mjs: the MORNING BROADCAST's pure half (script, lead, segment plan, ticker, subtitles). Run: node js/terminal/broadcastCore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { planBroadcast, pickLead, leadLines, keyFigure, tickerItems, tickerText, subtitleChunks, chunkAt, trimWords, timesWords, timesFig, pctWords, pctFig, dateWords, normEvent, clean,
  itemSeconds, durText, SEGMENTS, wantedSceneIds, BUILTIN, SIGNOFF_TEXT, QUICK_WORDS, partOfDay, speakFig, dedupeBody, LEAD_OPENERS, SHORT_BUDGET_SEC } from './broadcastCore.js';
import { candleRows, boardSummary, topMovers } from './jarvisCandles.js';

const vol = {
  GOLD: { oc: 2.1, oh: 2.4, ol: 0.3, forecast: { oc_median: 0.88 } }, USDJPY: { oc: 0.92, oh: 1, ol: 0.2, forecast: { oc_median: 0.46 } }, EURUSD: { oc: -0.42, oh: 0.1, ol: 0.5, forecast: { oc_median: 0.3 } },
  NQ: { oc: 0.1, oh: 0.6, ol: 0.4, forecast: { oc_median: 0.9 } }, WTI: { oc: -2.6, oh: 0.2, ol: 2.9, forecast: { oc_median: 1.4 } }, GBPUSD: { oc: 0.05, oh: 0.2, ol: 0.2, forecast: { oc_median: null } },
};
const rows = candleRows(vol, {});
const sum = { holding: 5, broken: 2, quiet: 18, judged: 7, brokenShort: ['real yields → dollar', 'oil → inflation pricing'], headline: '2 of 7 testable links broken: real yields → dollar, oil → inflation pricing. That is where the story is.' };
const events = [{ time: '13:30', ccy: 'USD', event: 'CPI m/m' }, { time: '15:00', ccy: 'USD', event: 'Fed Chair Powell Speaks' }, { time: '09:30', ccy: 'GBP', event: 'Retail Sales m/m' }];
const NOW = new Date('2026-11-20T07:30:00Z');
const inp = { now: NOW, rows, movers: topMovers(rows, 6), board: boardSummary(rows), chain: sum, events, extra: {} };
const FORECASTY = /\b(will|expect|target|should rise|should fall|going to)\b/i;

test('numbers are rounded and said naturally', () => {
  assert.equal(timesWords(2.04), 'twice'); assert.equal(timesWords(-1.84), '1.8 times'); assert.equal(timesWords(1.02), 'about'); assert.equal(timesWords(12.6), '13 times'); assert.equal(timesWords(0.5), 'half');
  assert.equal(timesFig(-2.43), '2.4×'); assert.equal(timesFig(14.2), '14×');
  assert.equal(pctWords(2.13), '2.1 percent'); assert.equal(pctWords(-0.9), '0.9 percent'); assert.equal(pctWords(0.426), '0.43 percent'); assert.equal(pctWords(12.4), '12 percent');
  assert.equal(pctFig(2.13), '+2.1%'); assert.equal(pctFig(-0.42), '−0.42%'); assert.equal(pctFig(0), '0.00%'); assert.equal(pctFig(NaN), '–');
});

test('dates: card, spoken (ordinal) and short forms in London time', () => {
  const d = dateWords(NOW);
  assert.equal(d.card, 'FRIDAY 20 NOVEMBER'); assert.equal(d.spoken, 'Friday the twentieth of November'); assert.equal(d.short, 'FRI 20 NOV'); assert.equal(d.hour, 7);
  assert.equal(dateWords(new Date('2026-07-01T23:30:00Z')).spoken, 'Thursday the second of July', 'British Summer Time moves the date');
  assert.ok(dateWords(new Date('nope')).card.length > 5, 'a bad date falls back to now');
});

test('clean: symbols the voice would trip on are spelled out', () => {
  assert.equal(clean('real yields → dollar — and oil & gas'), 'real yields to dollar, and oil and gas');
  assert.equal(clean('CPI m/m at 3%'), 'CPI month on month at 3 percent');
  assert.equal(clean(null), '');
});

test('events: the digest shape and plain strings are both read; the big ones are spotted', () => {
  assert.deepEqual(normEvent({ time: '8:30', ccy: 'USD', event: 'Non-Farm Payrolls' }), { time: '08:30', ccy: 'USD', event: 'Non-Farm Payrolls', where: 'US', big: true });
  assert.equal(normEvent({ ccy: 'EUR', event: 'German Ifo' }).big, false);
  assert.equal(normEvent('13:30 US CPI').time, '13:30'); assert.equal(normEvent('ECB speakers').time, '');
  assert.equal(normEvent({ event: '' }), null); assert.equal(normEvent(null), null);
});

test('the lead: the textbook-links count no longer competes for it (24 Nov 2026); chainLead brings it back', () => {
  assert.deepEqual(pickLead(inp).map(x => x.kind), ['mover', 'mover', 'event']);
  assert.ok(!pickLead(inp).some(x => x.kind === 'chain'));
  assert.ok(!pickLead({ ...inp, headKeys: ['GOLD'] }).some(x => x.key === 'GOLD'), 'a market the headline named is not repeated in the lead');
});

test('the lead: top three, best first, never three versions of one story, each with a number and a spoken line', () => {
  const lead = pickLead({ ...inp, chainLead: true });
  assert.equal(lead.length, 3);
  assert.deepEqual(lead.map(x => x.kind), ['chain', 'mover', 'mover'], 'two broken links outrank a 2.4x mover; at most two movers');
  assert.equal(lead[0].figure, '2 of 7'); assert.equal(lead[0].tone, 'gold');
  assert.equal(lead[1].key, 'GOLD'); assert.equal(lead[1].figure, '2.4×'); assert.equal(lead[1].tone, 'up'); assert.match(lead[1].headline, /Gold up 2\.1%/);
  assert.match(lead[1].text, /^Gold is up 2\.1 percent\. That is 2\.4 times its usual move\.$/);
  for (const x of lead) { assert.ok(x.figure && x.headline && x.text); assert.doesNotMatch(x.text, FORECASTY); }
  // no chain trouble: the CPI release takes a lead slot
  const noChain = pickLead({ ...inp, chainLead: true, chain: { ...sum, broken: 0 } });
  assert.ok(noChain.some(x => x.kind === 'event' && x.figure === '13:30' && /US CPI month on month/.test(x.headline)), JSON.stringify(noChain.map(x => x.headline)));
  assert.equal(noChain.filter(x => x.kind === 'mover').length, 2);
});

test('the lead on a thin morning: fewer items, a quiet card, or nothing at all, never a throw', () => {
  assert.deepEqual(pickLead({}), []);
  const quiet = candleRows({ NQ: { oc: 0.1, oh: 0.2, ol: 0.1, forecast: { oc_median: 0.9 } } }, {});
  const q = pickLead({ movers: topMovers(quiet), board: boardSummary(quiet) });
  assert.equal(q.length, 1); assert.equal(q[0].kind, 'quiet'); assert.equal(q[0].figure, '1 of 1');
  const bad = pickLead({ movers: [{ key: 'GOLD', ratio: NaN, oc: 1 }, null, { key: 'NQ', ratio: 3, oc: undefined }], chain: { broken: 'x' }, events: [null, 'Fed speakers'] });
  assert.deepEqual(bad.map(x => x.kind), ['event']); assert.equal(bad[0].figure, '1');
});

test('lead lines read like an anchor: a rotating opener, then "First, ..." "Second, ..." "And third, ...", and two movers never share a phrasing', () => {
  const inpC = { ...inp, chainLead: true }, l = leadLines(pickLead(inpC));
  assert.equal(l[0], 'Three stories lead this morning. First, in the chain, two of seven textbook links are broken, led by real yields to dollar.', 'no "That is where the story is." cliché');
  assert.match(l[1], /^Second, gold is up 2\.1 percent\. That is 2\.4 times its usual move\.$/); assert.equal(l[2], "And third, Dollar Yen, up 0.92 percent: twice a normal day's travel.");
  const two = leadLines(pickLead(inpC).slice(0, 2), 'today'); assert.match(two[0], /^Two stories lead today\. First,/); assert.match(two[1], /^And second, /);
  assert.match(leadLines([{ say: 'gold is up.' }])[0], /^One story leads this morning\. Gold is up\.$/);
  assert.match(leadLines(pickLead(inpC), 'this morning', 1)[0], /^Here is what matters this morning\. First,/); assert.match(leadLines(pickLead(inpC), 'this morning', 2)[0], /^Three things to know this morning\. First,/);
  assert.equal(LEAD_OPENERS.length, 3); assert.deepEqual(leadLines([]), []);
});

test('the lead opener rotates by date, deterministically: three days, three openers; the same day always the same words', () => {
  const op = d => planBroadcast({ ...inp, now: new Date(d) }, { hooks: [] }).items.find(x => x.kind === 'lead').text.split('. ')[0];
  const days = ['2026-11-20T07:30:00Z', '2026-11-21T07:30:00Z', '2026-11-22T07:30:00Z'].map(op);
  assert.equal(new Set(days).size, 3, days.join(' | ')); assert.equal(op('2026-11-20T07:31:00Z'), days[0]); assert.equal(op('2026-11-23T07:30:00Z'), days[0], 'the cycle is three days');
});

test('keyFigure: the earliest key number of a line, with its unit', () => {
  assert.deepEqual(keyFigure('Gold is up 1.8 times its usual move, 2.1 percent.'), { value: '1.8×', label: 'vs usual' });
  assert.deepEqual(keyFigure('About 65 basis points of cuts are priced.'), { value: '65 bp', label: '' });
  assert.deepEqual(keyFigure('Two of 7 testable links are broken.'), { value: '2 of 7', label: '' });
  assert.deepEqual(keyFigure('At the money it is priced at 15 percent.'), { value: '15%', label: '' });
  assert.deepEqual(keyFigure('US CPI at 13:30.'), { value: '13:30', label: 'UK time' });
  assert.deepEqual(keyFigure('Twice its usual move.'), { value: '2×', label: 'vs usual' });
  assert.deepEqual(keyFigure('In 2026 there were 4 meetings.'), { value: '4', label: '' }, 'a year is not a key number');
  assert.equal(keyFigure('No numbers here.'), null); assert.equal(keyFigure(undefined), null);
});

test('trimWords: whole sentences; QUICK drops a picture-naming opener and always keeps a number', () => {
  assert.equal(trimWords('One two three. Four five six. Seven.', 4), 'One two three.');
  assert.equal(trimWords('A very long first sentence that runs on.', 2), 'A very long first sentence that runs on.', 'always at least one sentence');
  assert.equal(trimWords('Rate paths: what futures price for each bank. The Fed has 65 basis points of cuts priced. That is pricing.', 10), 'The Fed has 65 basis points of cuts priced.');
  assert.equal(trimWords('The surface is calm today. It slopes upward as usual here. Puts are 2.5 points rich.', 8), 'The surface is calm today. Puts are 2.5 points rich.');
  assert.equal(trimWords('', 5), ''); assert.equal(trimWords('Keep me.', 0), 'Keep me.');
});

test('the built-in scenes: candles, chain and the calendar, each failing soft without data', () => {
  const c = BUILTIN.candles(inp); assert.equal(c.view, 'candles'); assert.match(c.text, /^The widest move is gold, up 2\.1 percent, 2\.4 times its usual size\. Behind it, Dollar Yen up 0\.92 percent and /); assert.equal(c.figure.value, '2.4×');
  assert.match(BUILTIN.candles({ ...inp, leadKeys: ['GOLD', 'USDJPY'] }).text, /^Beyond the lead, W.*down 2\.6 percent and Euro Dollar down 0\.42 percent\.$/, 'the lead movers are not said twice');
  assert.equal(BUILTIN.candles({}), null); assert.equal(BUILTIN.chain({}), null); assert.equal(BUILTIN.ahead({ events: [] }), null);
  const one = candleRows({ GOLD: vol.GOLD }, {}); assert.match(SEGMENTS[0].say({ inp: { board: boardSummary(one) } }), /^Starting with the markets\. Of 1 on the board, 1 is up, 0 down, 0 barely moving\.$/);
  assert.match(BUILTIN.chain(inp).text, /real yields to dollar/); assert.equal(BUILTIN.chain(inp).view, 'skyline');
  const a = BUILTIN.ahead(inp); assert.equal(a.text, 'At 13:30, US CPI month on month, at 15:00, US Fed Chair Powell Speaks and at 09:30, UK Retail Sales month on month.', 'no second disclaimer');
});

// fake SHOW hooks, shaped like the view modules' registerShowScene entries
const hook = (id, view, text, extra = {}) => ({ id, after: 'x', build: (i, d) => (d === 'none' ? null : { title: id.toUpperCase(), view, text, ...extra }) });
const HOOKS = [hook('reactor', 'reactor', 'The chain reactor: every market on one ring. Two of 7 links are broken. A description, not a forecast.'), hook('chainfly', 'chainfly', 'Flying the chain.'),
  hook('cbpaths', 'cbpaths', 'Rate paths: what futures price. The Fed has about 65 basis points of cuts priced.'), hook('yields', 'yields', 'The curve is 42 basis points steep.'),
  hook('ccy', 'ccy', 'The franc is strongest, 1.4 times usual.'), hook('vol', 'vol', 'The VIX is 15.'), hook('gpillar', 'gpillar', 'Spot is 0.1 percent below the flip.', { figure: { value: '5,813', label: 'gamma flip' } }),
  hook('gterrain', 'gterrain', 'The terrain is flat.'), hook('gamma', 'gamma', 'Old gamma view.'), { id: 'boom', build: () => { throw new Error('bad scene'); } }, hook('dayahead', 'ahead', 'Still to come today: CPI at 13:30.')];

test('planBroadcast QUICK: cold open, the lead, one scene per segment (first available tier), numbered segments, sign-off', () => {
  const have = new Set(['reactor', 'chainfly', 'cbpaths', 'yields', 'ccy', 'vol', 'gpillar', 'gterrain', 'gamma', 'ahead']);
  const P = planBroadcast(inp, { hooks: HOOKS, have, mode: 'quick' });
  assert.deepEqual(P.segments.map(s => [s.name, s.num, s.total, s.scenes.join()]), [['The Outlook', 1, 8, 'dayahead'], ['Markets', 2, 8, 'candles'], ['The Chain', 3, 8, 'reactor'], ['Rates', 4, 8, 'cbpaths'], ['Currencies', 5, 8, 'ccy'],
    ['Volatility', 6, 8, 'vol'], ['Positioning', 7, 8, 'gpillar']], 'in the morning the outlook comes first');
  const kinds = P.items.map(x => x.kind);
  assert.equal(kinds[0], 'open'); assert.deepEqual(kinds.slice(1, 4), ['lead', 'lead', 'lead']); assert.equal(kinds[kinds.length - 1], 'close');
  assert.equal(kinds.filter(k => k === 'bumper').length, 7); assert.equal(kinds.filter(k => k === 'scene').length, 7);
  assert.equal(P.items[0].text, 'Good morning. This is Helix, with the morning briefing for Friday the twentieth of November.');
  const close = P.items[P.items.length - 1]; assert.equal(close.text, SIGNOFF_TEXT); assert.deepEqual([close.seg.num, close.seg.total], [8, 8]); assert.equal(close.date.card, 'FRIDAY 20 NOVEMBER');
  const all = P.items.filter(x => x.kind === 'scene'), scenes = [...all.slice(1), all[0]];      // indices below as before: the outlook (played first) is last here
  assert.match(scenes[0].text, /^Starting with the markets\. Of 5 on the board, 2 are up, 2 down, 1 barely moving\. Beyond the lead, /, 'the lead already named gold and the yen');
  assert.equal(scenes[1].text, 'The chain: 5 links holding, 2 broken.', 'the chain is one line: the counts, no body');
  assert.equal(scenes[2].text, 'Rates. The headline number: 65 basis points. The Fed has about 65 basis points of cuts priced.', 'QUICK drops the picture-naming opener and keeps the number');
  assert.match(scenes[3].text, /^Currencies\. All 2 pairs are on the move\. The franc/); assert.match(scenes[5].text, /^Positioning, and where the options sit: 5,813, the gamma flip\./);
  assert.match(scenes[6].text, /^The outlook for today: three high-impact releases on the clock\./);
  assert.deepEqual(scenes[2].figure, { value: '65 bp', label: '' }); assert.deepEqual(scenes[5].figure, { value: '5,813', label: 'gamma flip' }, 'a scene may give its own key number');
  assert.equal(scenes[6].view, 'ahead');
  for (const s of scenes) assert.ok(s.text.split(/\s+/).length <= QUICK_WORDS + 12, s.text);
  for (const x of P.items) assert.doesNotMatch(x.text, FORECASTY, x.text);
  const bump = P.items.find(x => x.kind === 'bumper'); assert.equal(bump.text, ''); assert.ok(bump.hold > 1);
  assert.ok(P.totalSec > 60 && P.totalSec < 200, `about two minutes, got ${P.totalSec}`);
  assert.equal(P.ticker[0].key, 'GOLD', 'the ticker carries every market, biggest first');
});

test('planBroadcast FULL plays every available scene of a tier; missing views fall back; empty segments are skipped and the numbering closes up', () => {
  const full = planBroadcast(inp, { hooks: HOOKS, have: new Set(['reactor', 'cbpaths', 'yields', 'gpillar', 'gterrain', 'ahead']), mode: 'full' });
  assert.deepEqual(full.segments.map(s => s.scenes.join()), ['dayahead', 'candles', 'reactor', 'cbpaths,yields', 'gpillar,gterrain']);
  assert.match(full.items.find(x => x.scene?.id === 'yields').text, /^The curve/, 'only the first scene of a segment carries the segue');
  assert.match(full.items.find(x => x.scene?.id === 'cbpaths').text, /^Rates\. The headline number: 65 basis points\. Rate paths: what futures price\./, 'FULL keeps the whole line');
  // nothing new is registered: the HUD's own views carry the programme
  const bare = planBroadcast(inp, { hooks: [], have: new Set(), mode: 'quick' });
  assert.deepEqual(bare.segments.map(s => `${s.num}/${s.total} ${s.name}:${s.scenes}`), ['1/4 The Outlook:ahead', '2/4 Markets:candles', '3/4 The Chain:chain']);
  // a view that is not loaded never plays, even when its hook is registered; a hook that throws or returns nothing is skipped
  const noReactor = planBroadcast(inp, { hooks: [...HOOKS, { id: 'fxgrid', build: () => null }], have: new Set(['chainfly']), mode: 'quick' });
  assert.equal(noReactor.segments.find(s => s.id === 'chain').scenes[0], 'chainfly');
  assert.equal(noReactor.segments.find(s => s.id === 'ccy'), undefined);
  assert.doesNotThrow(() => planBroadcast({}, { hooks: [{ id: 'reactor', build: () => { throw new Error('x'); } }] }));
  const empty = planBroadcast({ now: NOW });
  assert.deepEqual(empty.items.map(x => x.kind), ['open', 'close']); assert.deepEqual(empty.ticker, []);
  assert.equal(empty.items[1].seg.num, 1);
});

test('the programme follows the clock: morning, afternoon or evening briefing, in the voice and on the title card', () => {
  const P = planBroadcast({ ...inp, now: new Date('2026-11-20T15:00:00Z') }, { hooks: [] });
  assert.match(P.items[0].text, /^Good afternoon\. This is Helix, with the afternoon briefing for/); assert.match(P.items[1].text, / this afternoon\./); assert.equal(P.items[0].title, 'THE AFTERNOON BRIEFING');
  const E = planBroadcast({ ...inp, now: new Date('2026-11-20T19:30:00Z') }, { hooks: [] });
  assert.match(E.items[0].text, /^Good evening\. This is Helix, with the evening briefing for/); assert.equal(E.items[0].title, 'THE EVENING BRIEFING'); assert.match(E.items[1].text, / tonight\./);
  assert.deepEqual([partOfDay(7), partOfDay(11), partOfDay(12), partOfDay(17), partOfDay(18), partOfDay(23)], ['morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening']);
});

test('the anchor script: one "First", every segue carries a number, no sentence said twice, ONE disclaimer for the whole programme', () => {
  const have = new Set(['reactor', 'cbpaths', 'yields', 'ccy', 'vol', 'gpillar', 'gterrain', 'ahead']);
  for (const mode of ['quick', 'full']) {
    for (const now of ['2026-11-20T07:30:00Z', '2026-11-21T07:30:00Z', '2026-11-22T16:00:00Z']) {
      const P = planBroadcast({ ...inp, now: new Date(now) }, { hooks: HOOKS, have, mode }), spoken = P.items.map(x => x.text).filter(Boolean).join(' ');
      assert.equal((spoken.match(/\bFirst\b/g) ?? []).length, 1, `${mode} ${now}: ${spoken}`);
      assert.equal((spoken.match(/not advice|not a forecast|not a call|description only/gi) ?? []).length, 1, `${mode}: one disclaimer, in the sign-off`);
      assert.doesNotMatch(spoken, /That is where the story is/);
      const sents = spoken.split(/(?<=[.!?])\s+/).map(x => x.toLowerCase()); assert.equal(new Set(sents).size, sents.length, `a sentence repeats: ${sents.filter((x, i) => sents.indexOf(x) !== i)}`);
      for (const x of P.items.filter(y => y.kind === 'scene' && P.items.find(z => z.kind === 'scene' && z.seg.id === y.seg.id) === y)) {
        const head = x.text.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
        assert.match(head, /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i, `segue without a number: ${x.text}`);
      }
    }
  }
});

test('a weak third lead item is dropped; a strong one stays', () => {
  const weak = planBroadcast({ ...inp, chain: null, events: [], movers: topMovers(candleRows({ GOLD: vol.GOLD, WTI: vol.WTI, EURUSD: { oc: -0.4, oh: 0.1, ol: 0.5, forecast: { oc_median: 0.3 } } }, {})) }, { hooks: [] });
  assert.equal(weak.lead.length, 2, weak.lead.map(x => `${x.key}:${x.score}`).join());
  assert.equal(planBroadcast(inp, { hooks: [] }).lead.length, 3);
});

test('speakFig and dedupeBody: key numbers said aloud; disclaimers and repeats removed from a body', () => {
  assert.equal(speakFig({ value: '65 bp', label: '' }), '65 basis points'); assert.equal(speakFig({ value: '2.4×', label: 'vs usual' }), '2.4 times usual');
  assert.equal(speakFig({ value: '15%', label: '' }), '15 percent'); assert.equal(speakFig({ value: '5,813', label: 'gamma flip' }), '5,813, the gamma flip'); assert.equal(speakFig({ value: '−0.4%', label: '' }), 'minus 0.4 percent');
  assert.equal(speakFig(null), null); assert.equal(speakFig({ value: '' }), null);
  const said = new Set();
  assert.equal(dedupeBody('Gold is up. A description, not a forecast. That is where the story is.', said), 'Gold is up.');
  assert.equal(dedupeBody('Gold is up. Oil is down.', said), 'Oil is down.', 'a sentence already said is not said again');
  assert.equal(dedupeBody('Description only: nothing here is a trade.', new Set()), '');
});

test('wantedSceneIds: every hook scene the programme may ask for, no built-ins', () => {
  const w = wantedSceneIds();
  for (const id of ['reactor', 'chainfly', 'moneyglobe', 'surprise', 'cycle', 'cbpaths', 'yields', 'fxgrid', 'ccy', 'ivsurf', 'vol', 'gpillar', 'gterrain', 'cot', 'gamma', 'dayahead', 'shockwave', 'wx', 'daymove', 'dayreview', 'shocktoday', 'tomorrow']) assert.ok(w.includes(id), id);
  assert.ok(!w.includes('candles') && !w.includes('chain') && !w.includes('ahead') && !w.includes('rangeused'));
  assert.equal(SEGMENTS.length, 11);
  assert.equal(SEGMENTS.filter(x => x.evening).length, 3);
});

test('the ticker: biggest against its usual move first, arrows and signs, quiet markets marked, junk dropped', () => {
  const t = tickerItems(rows);
  assert.deepEqual(t.map(x => x.key), ['USDJPY', 'GOLD', 'WTI', 'EURUSD', 'NQ'].sort((a, b) => Math.abs(rows.find(r => r.key === b).ratio) - Math.abs(rows.find(r => r.key === a).ratio)));
  const g = t.find(x => x.key === 'GOLD'); assert.deepEqual([g.arrow, g.pct, g.x, g.tone], ['▲', '+2.1%', '2.4×', 'up']);
  const w = t.find(x => x.key === 'WTI'); assert.deepEqual([w.arrow, w.pct, w.tone], ['▼', '−2.6%', 'dn']);
  const n = t.find(x => x.key === 'NQ'); assert.deepEqual([n.arrow, n.tone], ['•', 'quiet']);
  assert.ok(!t.some(x => x.key === 'GBPUSD'), 'a market with no usual move is not in the feed');
  assert.deepEqual(tickerItems(null), []); assert.deepEqual(tickerItems([{ key: 'X', oc: NaN, ratio: 1 }]), []);
  assert.equal(tickerItems(rows, 2).length, 2);
  assert.match(tickerText(t), /Gold ▲ \+2\.1% 2\.4× usual {2}· /);
});

test('subtitles: short broadcast chunks covering the whole line in order, timed by word count', () => {
  const text = "First, the markets. Across the desk's 51 markets, 11 are up, 8 are down and 32 are barely moving, each measured against its own usual move.";
  const c = subtitleChunks(text, 14);
  assert.equal(c.map(x => x.text).join(' '), text.replace(/\s+/g, ' '));
  assert.ok(c.every(x => x.text.split(' ').length <= 14)); assert.equal(c[0].text, 'First, the markets.');
  assert.equal(c[0].from, 0); assert.equal(c[c.length - 1].to, 1); for (let i = 1; i < c.length; i++) assert.equal(c[i].from, c[i - 1].to);
  assert.equal(chunkAt(c, 0).text, 'First, the markets.'); assert.equal(chunkAt(c, 0.999).text, c[c.length - 1].text); assert.equal(chunkAt(c, 5).text, c[c.length - 1].text, 'holds the last if the voice runs on');
  const long = subtitleChunks(Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ') + '.', 10); assert.equal(long.length, 4); assert.ok(long.every(x => x.text.split(' ').length <= 10));
  assert.deepEqual(subtitleChunks(''), []); assert.equal(chunkAt([], 0.5), null);
});

test('durations: reading time plus card holds, at the chosen speed; a readable clock', () => {
  assert.equal(itemSeconds({ text: '', hold: 1.9 }), 1.9); assert.ok(Math.abs(itemSeconds({ text: 'one two three four five six seven eight nine ten eleven twelve thirteen', hold: 0 }) - 5) < 1e-9);
  assert.equal(itemSeconds({ text: '', hold: 2 }, 2), 1); assert.equal(itemSeconds(null), 0);
  assert.equal(durText(131), '2 min 11 s'); assert.equal(durText(45), '45 s'); assert.equal(durText(120), '2 min');
});

test('SHORT (YouTube Short): shorter lead, and long programmes drop the least essential segments until the estimate fits; markets, chain and day ahead stay', () => {
  const long = 'This is a long line about this view that goes on for a while, with numbers like 1.8 times its usual move and 3 of 9 links, and then some more words to fill the time. A description, not a forecast.';
  const ids = [['reactor', 'reactor'], ['moneyglobe', 'moneyglobe'], ['cbpaths', 'cbpaths'], ['fxgrid', 'fxgrid'], ['ivsurf', 'ivsurf'], ['gpillar', 'gpillar'], ['dayahead', 'ahead']];
  const hooks = ids.map(([id, v]) => hook(id, v, long)), have = new Set(ids.map(x => x[1]));
  const quick = planBroadcast(inp, { hooks, have, mode: 'quick' }), short = planBroadcast(inp, { hooks, have, mode: 'short' });
  assert.ok(short.totalSec <= SHORT_BUDGET_SEC || short.segments.length === 3, `short ${short.totalSec}s with ${short.segments.length} segments`);
  assert.ok(short.totalSec < quick.totalSec);
  assert.ok(short.lead.length <= 2);
  for (const id of ['markets', 'chain', 'ahead']) assert.ok(short.segments.some(s => s.id === id), `${id} kept`);
  // a faster voice (brisk, 1.15x) gets a bigger estimate budget, so it keeps at least as many segments; normal speed is unchanged
  const brisk = planBroadcast(inp, { hooks, have, mode: 'short', rate: 1.15 });
  assert.ok(brisk.segments.length >= short.segments.length && brisk.totalSec <= SHORT_BUDGET_SEC * 1.15 + 1e-9 || brisk.segments.length === 3, `brisk ${brisk.totalSec}s with ${brisk.segments.length} segments`);
  assert.deepEqual(planBroadcast(inp, { hooks, have, mode: 'short', rate: 1 }).segments.map(s => s.id), short.segments.map(s => s.id));
  // the drop order keeps the useful, forward-looking data longest: when anything is cut, the macro goes before volatility and positioning
  const cut = short.segments.map(s => s.id);
  if (!cut.includes('vol')) assert.ok(!cut.includes('macro') && !cut.includes('pos'), cut.join());
  if (cut.includes('macro')) assert.ok(cut.includes('vol') && cut.includes('pos') && cut.includes('rates'), cut.join());
  // the frame-by-frame recorder asks for a bigger budget (budgetSec): at least as many segments, within it; out-of-range budgets are clamped
  const roomy = planBroadcast(inp, { hooks, have, mode: 'short', rate: 1.1, budgetSec: 145 });
  assert.ok(roomy.segments.length >= planBroadcast(inp, { hooks, have, mode: 'short', rate: 1.1 }).segments.length);
  assert.ok(roomy.totalSec <= 145 * 1.1 + 1e-9 || roomy.segments.length === 3, `roomy ${roomy.totalSec}s`);
  assert.deepEqual(planBroadcast(inp, { hooks, have, mode: 'short', budgetSec: 9999 }).segments.length, planBroadcast(inp, { hooks, have, mode: 'short', budgetSec: 170 }).segments.length);
  // numbering closes up after drops
  assert.deepEqual(short.segments.map(s => s.num), short.segments.map((_, i) => i + 1));
  // a programme already inside the budget is not cut
  const small = planBroadcast(inp, { hooks: [hook('reactor', 'reactor', 'Two links broke.')], have: new Set(['reactor']), mode: 'short' });
  assert.ok(small.segments.some(s => s.id === 'chain'));
});

test('THE OUTLOOK: today\'s typical ranges (sizes, not direction) join the calendar even in the quick cut; first only in the morning', () => {
  const v = { NQ: { oc: -0.3, oh: 0.2, ol: 0.5, hl: 0.7, forecast: { oc_median: 0.6, hl_median: 1.4, hl_75: 1.9 } }, GOLD: { oc: 0.4, oh: 0.6, ol: 0.1, hl: 0.7, forecast: { oc_median: 0.5, hl_median: 1.2, hl_75: 1.6 } },
    EURUSD: { oc: 0.05, oh: 0.1, ol: 0.1, hl: 0.2, forecast: { oc_median: 0.28, hl_median: 0.59, hl_75: 0.73 } } };
  const rows = candleRows(v, {}), r = BUILTIN.ranges({ rows });
  assert.equal(r.text, "The vol model's typical range for today, high to low: Nasdaq about 1.4 percent, gold about 1.2 percent and Euro Dollar about 0.59 percent. Gold has already used 58 percent of it. One day in four runs bigger. Those are sizes, not direction.");
  assert.deepEqual(r.figure, { value: '1.4%', label: `${r.figure.label}` }); assert.equal(r.view, 'vol');
  assert.equal(BUILTIN.ranges({ rows: rows.slice(0, 1) }), null, 'one market is not an outlook');
  const P = planBroadcast({ ...inp, rows, movers: topMovers(rows, 6), board: boardSummary(rows) }, { hooks: HOOKS, have: new Set(['ahead', 'vol']), mode: 'quick' });
  assert.deepEqual(P.segments[0].scenes, ['dayahead', 'ranges']);
  const aft = planBroadcast({ ...inp, now: new Date('2026-11-20T15:00:00Z'), rows }, { hooks: HOOKS, have: new Set(['ahead', 'vol']), mode: 'quick' });
  assert.equal(aft.segments.at(-1).id, 'ahead', 'in the afternoon it closes the programme');
  // the EVENING looks back: no outlook; THE DAY opens (here: the range used, the only evening scene these fixtures can build), and no morning-only segment is left over
  const eve = planBroadcast({ ...inp, now: new Date('2026-11-20T19:00:00Z'), rows }, { hooks: HOOKS, have: new Set(['ahead', 'vol']), mode: 'quick' });
  assert.ok(!eve.segments.some(x => x.id === 'ahead'), 'no outlook in the evening');
  assert.equal(eve.segments[0].id, 'day'); assert.deepEqual(eve.segments[0].scenes, ['rangeused']);
  const used = eve.items.find(x => x.scene?.id === 'rangeused');
  assert.match(used.text, /^The day, looking back\. This morning's typical ranges, against the day\. (Gold|Nasdaq): [\d.]+ percent expected, [\d.]+ percent travelled\./, used.text);
  assert.equal(planBroadcast({ ...inp, now: new Date('2026-11-20T09:00:00Z'), rows }, { hooks: HOOKS, have: new Set(['ahead', 'vol']), mode: 'quick' }).segments.some(x => x.id === 'day'), false, 'the evening segments stay out of the morning');
  for (const x of P.items) assert.doesNotMatch(x.text, FORECASTY, x.text);
});
