// js/terminal/broadcastCore.test.mjs: the MORNING BROADCAST's pure half (script, lead, segment plan, ticker, subtitles). Run: node js/terminal/broadcastCore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { planBroadcast, pickLead, leadLines, keyFigure, tickerItems, tickerText, subtitleChunks, chunkAt, trimWords, timesWords, timesFig, pctWords, pctFig, dateWords, normEvent, clean,
  itemSeconds, durText, SEGMENTS, wantedSceneIds, BUILTIN, SIGNOFF_TEXT, QUICK_WORDS } from './broadcastCore.js';
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

test('the lead: top three, best first, never three versions of one story, each with a number and a spoken line', () => {
  const lead = pickLead(inp);
  assert.equal(lead.length, 3);
  assert.deepEqual(lead.map(x => x.kind), ['chain', 'mover', 'mover'], 'two broken links outrank a 2.4x mover; at most two movers');
  assert.equal(lead[0].figure, '2 of 7'); assert.equal(lead[0].tone, 'gold');
  assert.equal(lead[1].key, 'GOLD'); assert.equal(lead[1].figure, '2.4×'); assert.equal(lead[1].tone, 'up'); assert.match(lead[1].headline, /Gold up 2\.1%/);
  assert.match(lead[1].text, /^Gold is up 2\.1 percent\. That is 2\.4 times its usual move\.$/);
  for (const x of lead) { assert.ok(x.figure && x.headline && x.text); assert.doesNotMatch(x.text, FORECASTY); }
  // no chain trouble: the CPI release takes a lead slot
  const noChain = pickLead({ ...inp, chain: { ...sum, broken: 0 } });
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

test('lead lines read like a presenter: "Three things matter this morning. First, ..." "Second, ..." "And third, ..."', () => {
  const l = leadLines(pickLead(inp));
  assert.match(l[0], /^Three things matter this morning\. First, in the chain, two of seven textbook links are broken, led by real yields to dollar\./);
  assert.match(l[1], /^Second, gold is up/); assert.match(l[2], /^And third, Dollar Yen is up 0\.92 percent\. That is twice its usual move\.$/);
  const two = leadLines(pickLead(inp).slice(0, 2), 'today'); assert.match(two[0], /^Two things matter today\. First,/); assert.match(two[1], /^And second, /);
  assert.match(leadLines([{ say: 'gold is up.' }])[0], /^One thing stands out this morning\. Gold is up\.$/);
  assert.deepEqual(leadLines([]), []);
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
  const c = BUILTIN.candles(inp); assert.equal(c.view, 'candles'); assert.match(c.text, /Across the desk's 5 markets, 2 are up, 2 are down and 1 is barely moving/); assert.equal(c.figure.value, '2.4×');
  assert.equal(BUILTIN.candles({}), null); assert.equal(BUILTIN.chain({}), null); assert.equal(BUILTIN.ahead({ events: [] }), null);
  const one = candleRows({ GOLD: vol.GOLD }, {}); assert.match(BUILTIN.candles({ board: boardSummary(one), movers: topMovers(one) }).text, /1 is up, 0 are down/);
  assert.match(BUILTIN.chain(inp).text, /real yields to dollar/); assert.equal(BUILTIN.chain(inp).view, 'skyline');
  const a = BUILTIN.ahead(inp); assert.match(a.text, /^On the calendar today: at 13:30, US CPI month on month, at 15:00, US Fed Chair Powell Speaks and at 09:30, UK Retail Sales month on month\. That is the schedule, not a call on the outcome\.$/);
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
  assert.deepEqual(P.segments.map(s => [s.name, s.num, s.total, s.scenes.join()]), [['Markets', 1, 8, 'candles'], ['The Chain', 2, 8, 'reactor'], ['Rates', 3, 8, 'cbpaths'], ['Currencies', 4, 8, 'ccy'],
    ['Volatility', 5, 8, 'vol'], ['Positioning', 6, 8, 'gpillar'], ['The Day Ahead', 7, 8, 'dayahead']]);
  const kinds = P.items.map(x => x.kind);
  assert.equal(kinds[0], 'open'); assert.deepEqual(kinds.slice(1, 4), ['lead', 'lead', 'lead']); assert.equal(kinds[kinds.length - 1], 'close');
  assert.equal(kinds.filter(k => k === 'bumper').length, 7); assert.equal(kinds.filter(k => k === 'scene').length, 7);
  assert.equal(P.items[0].text, 'Good morning. This is Jarvis, with the morning briefing for Friday the twentieth of November.');
  const close = P.items[P.items.length - 1]; assert.equal(close.text, SIGNOFF_TEXT); assert.deepEqual([close.seg.num, close.seg.total], [8, 8]); assert.equal(close.date.card, 'FRIDAY 20 NOVEMBER');
  const scenes = P.items.filter(x => x.kind === 'scene');
  assert.match(scenes[0].text, /^First, the markets\. /); assert.match(scenes[1].text, /^Now, the chain\. /);
  assert.equal(scenes[2].text, 'To rates. The Fed has about 65 basis points of cuts priced.', 'QUICK drops the picture-naming opener and keeps the number');
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
  assert.deepEqual(full.segments.map(s => s.scenes.join()), ['candles', 'reactor', 'cbpaths,yields', 'gpillar,gterrain', 'dayahead']);
  assert.match(full.items.find(x => x.scene?.id === 'yields').text, /^The curve/, 'only the first scene of a segment carries the segue');
  assert.match(full.items.find(x => x.scene?.id === 'cbpaths').text, /^To rates\. Rate paths: what futures price\./, 'FULL keeps the whole line');
  // nothing new is registered: the HUD's own views carry the programme
  const bare = planBroadcast(inp, { hooks: [], have: new Set(), mode: 'quick' });
  assert.deepEqual(bare.segments.map(s => `${s.num}/${s.total} ${s.name}:${s.scenes}`), ['1/4 Markets:candles', '2/4 The Chain:chain', '3/4 The Day Ahead:ahead']);
  // a view that is not loaded never plays, even when its hook is registered; a hook that throws or returns nothing is skipped
  const noReactor = planBroadcast(inp, { hooks: [...HOOKS, { id: 'fxgrid', build: () => null }], have: new Set(['chainfly']), mode: 'quick' });
  assert.equal(noReactor.segments.find(s => s.id === 'chain').scenes[0], 'chainfly');
  assert.equal(noReactor.segments.find(s => s.id === 'ccy'), undefined);
  assert.doesNotThrow(() => planBroadcast({}, { hooks: [{ id: 'reactor', build: () => { throw new Error('x'); } }] }));
  const empty = planBroadcast({ now: NOW });
  assert.deepEqual(empty.items.map(x => x.kind), ['open', 'close']); assert.deepEqual(empty.ticker, []);
  assert.equal(empty.items[1].seg.num, 1);
});

test('planBroadcast in the afternoon does not call itself a morning briefing', () => {
  const P = planBroadcast({ ...inp, now: new Date('2026-11-20T15:00:00Z') }, { hooks: [] });
  assert.match(P.items[0].text, /^Good afternoon\. This is Jarvis, with the briefing for/); assert.match(P.items[1].text, /things matter today\./);
});

test('wantedSceneIds: every hook scene the programme may ask for, no built-ins', () => {
  const w = wantedSceneIds();
  for (const id of ['reactor', 'chainfly', 'moneyglobe', 'surprise', 'cycle', 'cbpaths', 'yields', 'fxgrid', 'ccy', 'ivsurf', 'vol', 'gpillar', 'gterrain', 'cot', 'gamma', 'dayahead', 'shockwave', 'wx']) assert.ok(w.includes(id), id);
  assert.ok(!w.includes('candles') && !w.includes('chain') && !w.includes('ahead'));
  assert.equal(SEGMENTS.length, 8);
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
