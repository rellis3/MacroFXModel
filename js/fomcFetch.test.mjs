// Synthetic test for the FOMC fetch module's pure text helpers. No network —
// the fetch*() I/O functions aren't exercised here (this sandbox can't reach
// federalreserve.gov; see the fetch-now run notes for the live-data proof).
//   node js/fomcFetch.test.mjs
import { htmlToText, stripBoilerplate, extractVote, statementUrl, transcriptPdfUrl, minutesUrl, yyyymmdd } from './fomcFetch.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[URL builders]');
{
  ok('yyyymmdd strips dashes', yyyymmdd('2026-07-29') === '20260729');
  ok('statementUrl', statementUrl('2026-07-29') === 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20260729a.htm');
  ok('minutesUrl', minutesUrl('2026-06-17') === 'https://www.federalreserve.gov/monetarypolicy/fomcminutes20260617.htm');
  ok('transcriptPdfUrl', transcriptPdfUrl('2026-07-29') === 'https://www.federalreserve.gov/mediacenter/files/FOMCpresconf20260729.pdf');
}

console.log('[htmlToText]');
{
  const html = '<html><head><style>.x{color:red}</style></head><body><p>Hello &amp; welcome.</p><script>evil()</script><div>Second line.</div></body></html>';
  const text = htmlToText(html);
  ok('strips tags', !text.includes('<'), text);
  ok('drops script/style content', !text.includes('evil') && !text.includes('color:red'), text);
  ok('decodes entities', text.includes('Hello & welcome'), text);
  ok('block tags become line breaks', text.includes('Hello & welcome.\n\nSecond line.'), JSON.stringify(text));
}

console.log('[stripBoilerplate]');
{
  const body = 'The Committee decided to hold rates steady, judging that the current stance of monetary policy remains appropriate given the balance of risks to its dual mandate of maximum employment and price stability. '.repeat(3);
  const text = `Federal Reserve Board navigation stuff\nFor release at 2:00 p.m. EDT\nJuly 29, 2026\n\n${body}\n\nLast Update: July 29, 2026`;
  const out = stripBoilerplate(text);
  ok('drops leading nav', !out.includes('navigation stuff'), out.slice(0, 60));
  ok('drops trailing footer', !out.includes('Last Update'), out.slice(-60));
  ok('keeps the actual content', out.includes('The Committee decided to hold rates steady'));
}
{
  // No markers found — must fall back to the full text, not silently empty it.
  const text = 'Some page with neither marker present.';
  ok('falls back to full text when markers are absent', stripBoilerplate(text) === text);
}

console.log('[extractVote]');
{
  const text = 'The Committee approved the following statement. The vote for this action was 9 to 3. Voting against the monetary policy action were Beth M. Hammack, Neel Kashkari, and Lorie K. Logan, who preferred to raise the target range for the federal funds rate by 1/4 percentage point at this meeting.';
  const v = extractVote(text);
  ok('parses 9-3', v.for === 9 && v.against === 3, JSON.stringify(v));
  ok('names 3 dissenters', v.dissenters.length === 3, JSON.stringify(v.dissenters));
  ok('dissenter names look right', v.dissenters.includes('Neel Kashkari'), JSON.stringify(v.dissenters));
}
{
  const unanimous = 'The vote for this action was 12 to 0.';
  const v = extractVote(unanimous);
  ok('unanimous vote has no dissenters', v.for === 12 && v.against === 0 && v.dissenters.length === 0, JSON.stringify(v));
}
{
  ok('no vote sentence -> null', extractVote('No vote information here.') === null);
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll fomcFetch pure-function tests passed.');
