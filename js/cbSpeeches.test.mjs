// Tests for js/cbSpeeches.js.   node js/cbSpeeches.test.mjs
import assert from 'node:assert/strict';
import { parseFeed, speakerFrom, tierFrom, candidates, pickToScore, policyWords, clipText, validateSpeech, logEntry, mergeLog, speakerDrift, matchEvent, speechPrompt, speechId, SPEECH_SOURCES, DRIFT_BIG } from './cbSpeeches.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const NOW = Date.parse('2026-11-04T18:00:00Z');

const FED = `<?xml version="1.0"?><rss version="2.0"><channel><title>FRB: Speeches</title>
<item><title>Waller, The Signaling Value of the SEP</title><link><![CDATA[https://www.federalreserve.gov/newsevents/speech/waller20261008a.htm]]></link>
<description><![CDATA[Speech At the Istanbul Economic Forum, T&uuml;rkiye]]></description><pubDate><![CDATA[Thu, 08 Oct 2026 08:30:00 GMT]]></pubDate></item>
<item><title>Bowman, Supervisory Modernization</title><link>https://www.federalreserve.gov/newsevents/speech/bowman20261014a.htm</link><pubDate>Thu, 15 Oct 2026 02:55:00 GMT</pubDate></item>
</channel></rss>`;
const BOC = `<rdf:RDF><channel rdf:about="x"><title>Speeches</title></channel>
<item rdf:about="https://www.bankofcanada.ca/2026/11/opening-statement-2026-11-03/"><title>Opening Statement</title><link>https://www.bankofcanada.ca/2026/11/opening-statement-2026-11-03/</link>
<dc:date>2026-11-03T11:00:54+00:00</dc:date><cb:speech><cb:person><cb:nameAsWritten>Tiff Macklem</cb:nameAsWritten></cb:person></cb:speech></item></rdf:RDF>`;
const ECB = `<rss><channel><item><title> ECB wage tracker suggests higher wage growth </title><link>https://www.ecb.europa.eu//press/pr/date/2026/html/ecb.pr261104~c.en.html</link><pubDate>Wed, 04 Nov 2026 01:00:00 +0100</pubDate></item>
<item><title> Philip R. Lane: AI adoption in Europe</title><link>https://www.ecb.europa.eu//press/key/date/2026/html/ecb.sp261030~08.en.html</link><pubDate>Fri, 30 Oct 2026 17:10:00 +0100</pubDate></item></channel></rss>`;

t('parses RSS 2.0 with CDATA and entities, and RSS 1.0 with the cb: speaker', () => {
  const f = parseFeed(FED);
  assert.equal(f.length, 2); assert.equal(f[0].url, 'https://www.federalreserve.gov/newsevents/speech/waller20261008a.htm');
  assert.equal(f[0].date, '2026-10-08T08:30:00.000Z'); assert.match(f[0].description, /Türkiye/);
  const b = parseFeed(BOC);
  assert.equal(b.length, 1); assert.equal(b[0].person, 'Tiff Macklem'); assert.equal(b[0].date, '2026-11-03T11:00:54.000Z');
  assert.equal(parseFeed(ECB)[1].url, 'https://www.ecb.europa.eu/press/key/date/2026/html/ecb.sp261030~08.en.html', 'double slash collapsed');
});
t('speaker from each bank\'s title convention', () => {
  assert.equal(speakerFrom({ title: 'Waller, The Signaling Value', url: '' }, 'Fed'), 'Waller');
  assert.equal(speakerFrom({ title: 'Philip R. Lane: AI adoption', url: '' }, 'ECB'), 'Philip R. Lane');
  assert.equal(speakerFrom({ title: 'Learning about earnings − speech by Megan Greene', url: '' }, 'BoE'), 'Megan Greene');
  assert.equal(speakerFrom({ title: '2026-10-29 - Petra Tschudin / Thomas Moser: Liquidity', url: '' }, 'SNB'), 'Petra Tschudin / Thomas Moser');
  assert.equal(speakerFrom({ title: 'Opening Statement', url: 'https://www.rba.gov.au/speeches/2026/sp-gov-2026-10-28.html' }, 'RBA'), 'Governor');
  assert.equal(speakerFrom({ title: 'x', url: '', person: 'Tiff Macklem' }, 'BoC'), 'Tiff Macklem');
});
t('a first guess at rank from the header', () => {
  assert.equal(tierFrom('Speech by Chair X on the outlook', 'Fed'), 'head');
  assert.equal(tierFrom('Speech by Vice Chair Jefferson', 'Fed'), 'voter');
  assert.equal(tierFrom('Speech by Governor Waller', 'Fed'), 'voter');
  assert.equal(tierFrom('Remarks by President of the Federal Reserve Bank', 'Fed'), 'nonvoter');
  assert.equal(tierFrom('Speech by Boris Vujčić, Vice-President of the ECB', 'ECB'), 'voter');
  assert.equal(tierFrom('Speech by Christine Lagarde, President of the ECB', 'ECB'), 'head');
  assert.equal(tierFrom('Remarks by Governor Andrew Bailey', 'BoE'), 'head');
  assert.equal(tierFrom('Speech by Deputy Governor Sarah Breeden', 'BoE'), 'voter');
  assert.equal(tierFrom('Martin Schlegel, Chairman of the Governing Board', 'SNB'), 'head');
  assert.equal(tierFrom('Data and analytics at the Bank', 'BoE'), 'staff');
});
t('candidates keep only speeches, skip seen ids and old items, newest first', () => {
  const items = parseFeed(ECB), c = candidates('ECB', items, new Set(), { now: NOW });
  assert.equal(c.length, 1); assert.equal(c[0].speaker, 'Philip R. Lane'); assert.equal(c[0].ccy, 'EUR');
  assert.equal(c[0].id, speechId('ECB', 'https://www.ecb.europa.eu/press/key/date/2026/html/ecb.sp261030~08.en.html'));
  assert.equal(candidates('ECB', items, new Set([c[0].id]), { now: NOW }).length, 0);
  assert.equal(candidates('Fed', parseFeed(FED), new Set(), { now: NOW, maxAgeDays: 25 }).length, 1, 'the 8 Oct speech is older than 25 days');
  assert.deepEqual(candidates('Fed', parseFeed(FED), new Set(), { now: NOW, maxAgeDays: 40 }).map(x => x.speaker), ['Bowman', 'Waller']);
});
t('the daily budget: heads first, never more than the room left', () => {
  const c = [{ id: 'a', tierGuess: 'staff', date: '2026-11-04' }, { id: 'b', tierGuess: 'head', date: '2026-11-01' }, { id: 'c', tierGuess: 'voter', date: '2026-11-03' }];
  assert.deepEqual(pickToScore(c, { used: 0, maxPerRun: 2 }).map(x => x.id), ['b', 'c']);
  assert.equal(pickToScore(c, { used: 11, maxPerDay: 12 }).length, 1);
  assert.equal(pickToScore(c, { used: 12, maxPerDay: 12 }).length, 0);
});
t('policy words and clipping', () => {
  assert.equal(policyWords('Inflation is high; monetary policy must stay tight. The labour market is cooling.'), 3);
  assert.equal(policyWords('Tokenisation and settlement of securities'), 0);
  const long = 'a'.repeat(30_000) + 'END';
  const c = clipText(long, 1000); assert.ok(c.length < 1100); assert.ok(c.endsWith('END')); assert.match(c, /characters cut/);
  assert.equal(clipText('x / / / / y'), 'x y');
});
t('the prompt carries the statement it is compared with', () => {
  const { system, prompt } = speechPrompt({ bank: 'BoE', ccy: 'GBP', title: 'T', date: '2026-10-20T00:00:00Z', speaker: 'Megan Greene' }, 'TEXT', { score: 0.2, regime: 'NEUTRAL', date: '2026-09-18', headline: 'hold' });
  assert.match(system, /-1\.0 \(very dovish\)/); assert.match(prompt, /scored 0\.2 \(NEUTRAL\)/); assert.match(prompt, /TEXT$/);
  assert.match(speechPrompt({ bank: 'SNB', ccy: 'CHF', title: 'T' }, 'x', null).prompt, /No scored SNB statement/);
});
t('the reply is validated and clamped', () => {
  assert.equal(validateSpeech({ hawkishScore: 2, relevance: 0.5, tier: 'head' }).ok, false);
  assert.equal(validateSpeech({ hawkishScore: 0.3, relevance: 0.5, tier: 'boss' }).ok, false);
  const v = validateSpeech({ speaker: 'X', tier: 'voter', relevance: '0.8', hawkishScore: '-0.35', topics: { inflation: 0.9, fx: 3 }, keyQuotes: [{ quote: 'q1', why: 'w' }, { quote: '' }, { quote: 'q2' }, { quote: 'q3' }, { quote: 'q4' }] });
  assert.equal(v.ok, true); assert.equal(v.value.score, -0.35); assert.equal(v.value.relevance, 0.8);
  assert.equal(v.value.topics.inflation, 0.9); assert.equal(v.value.topics.fx, 0, 'out of range topic dropped to 0');
  assert.equal(v.value.keyQuotes.length, 2, 'max 3 taken, the empty one removed');
});
const ent = (bank, date, score, tier = 'voter', relevance = 1, speaker = 'Jane Doe') => logEntry({ id: `${bank}:${date}:${speaker}`, bank, ccy: SPEECH_SOURCES.find(s => s.bank === bank).ccy, title: 't', url: 'u', date: `${date}T12:00:00Z`, speaker },
  { score: { speaker, tier, relevance, score, topics: {}, keyQuotes: [] }, statement: { score: 0.1, date: '2026-10-01' }, at: 'now' });
t('log entries carry the change against the statement; the log merges by id, newest first', () => {
  const e = ent('Fed', '2026-11-01', 0.5); assert.equal(e.delta, 0.4); assert.equal(e.weight, 0.7);
  const skip = logEntry({ id: 'x', bank: 'Fed', ccy: 'USD', title: 't', url: 'u', date: '2026-11-02T00:00:00Z' }, { skipped: 'no policy content', at: 'now' });
  assert.equal(skip.score, undefined); assert.equal(skip.skipped, 'no policy content');
  const log = mergeLog(mergeLog([], [e]), [skip, { ...e, score: 0.6 }]);
  assert.equal(log.length, 2); assert.equal(log[0].id, 'x'); assert.equal(log[1].score, 0.6);
});
t('speaker drift: weighted by rank, relevance and recency; speeches before the statement are left out', () => {
  const st = { USD: { score: 0.1, meetingDate: '2026-10-29', regime: 'NEUTRAL' }, GBP: { score: 0.0, meetingDate: '2026-09-18' } };
  const log = [ent('Fed', '2026-11-03', 0.6, 'head'), ent('Fed', '2026-11-02', 0.4, 'staff'), ent('Fed', '2026-10-20', -0.9, 'head'),
    ent('BoE', '2026-11-01', -0.1, 'voter', 0.2), ent('BoE', '2026-10-30', -0.05, 'voter')];
  const d = speakerDrift(log, st, NOW);
  assert.equal(d.banks.Fed.speeches, 2, 'the 20 Oct speech predates the 29 Oct statement');
  assert.ok(d.banks.Fed.drift > 0.4 && d.banks.Fed.drift < 0.5, `head-weighted toward +0.5, got ${d.banks.Fed.drift}`);
  assert.equal(d.banks.Fed.big, true); assert.equal(d.banks.Fed.label, 'much more hawkish');
  assert.equal(d.banks.BoE.speeches, 1, 'relevance 0.2 is below the floor');
  assert.equal(d.banks.BoE.drift, -0.05); assert.equal(d.banks.BoE.label, 'in line');
  assert.equal(d.banks.ECB.drift, null); assert.equal(d.banks.ECB.label, 'no speeches');
  const noSt = speakerDrift([ent('SNB', '2026-11-01', 0.3)], {}, NOW);
  assert.equal(noSt.banks.SNB.drift, null, 'no statement, no drift'); assert.equal(noSt.banks.SNB.speechAvg, 0.3);
  assert.ok(DRIFT_BIG === 0.25);
});
t('a calendar speaker event finds the scored speech by surname and day', () => {
  const log = [ent('Fed', '2026-11-03', 0.6, 'voter', 1, 'Christopher Waller')];
  const ms = Date.parse('2026-11-03T15:00:00Z');
  assert.equal(matchEvent({ ms, event: 'FOMC Member Waller Speaks', country: 'US' }, log, { bankOf: () => 'Fed' })?.score, 0.6);
  assert.equal(matchEvent({ ms, event: 'FOMC Member Bowman Speaks', country: 'US' }, log, { bankOf: () => 'Fed' }), null);
  assert.equal(matchEvent({ ms: ms + 5 * 864e5, event: 'Waller Speaks' }, log), null, 'a different day');
});
console.log(`cbSpeeches: ${n} tests passed`);
