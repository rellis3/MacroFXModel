// Synthetic test for the FOMC fetch module's pure text helpers. No network —
// the fetch*() I/O functions aren't exercised here (this sandbox can't reach
// federalreserve.gov; see the fetch-now run notes for the live-data proof).
//   node js/fomcFetch.test.mjs
import { htmlToText, stripBoilerplate, extractVote, statementUrl, transcriptPdfUrl, minutesUrl, sepAccessibleUrl, yyyymmdd, extractTables, tablesToMarkdown } from './fomcFetch.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[URL builders]');
{
  ok('yyyymmdd strips dashes', yyyymmdd('2026-07-29') === '20260729');
  ok('statementUrl', statementUrl('2026-07-29') === 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20260729a.htm');
  ok('minutesUrl', minutesUrl('2026-06-17') === 'https://www.federalreserve.gov/monetarypolicy/fomcminutes20260617.htm');
  ok('transcriptPdfUrl', transcriptPdfUrl('2026-07-29') === 'https://www.federalreserve.gov/mediacenter/files/FOMCpresconf20260729.pdf');
  ok('sepAccessibleUrl', sepAccessibleUrl('2026-06-17') === 'https://www.federalreserve.gov/monetarypolicy/fomcprojtabl20260617.htm');
}

console.log('[extractTables / tablesToMarkdown — SEP dot-plot table parsing]');
{
  const html = `<html><body>
    <table>
      <tr><th>Variable</th><th>2026</th><th>2027</th><th>Longer run</th></tr>
      <tr><td>Change in real GDP</td><td>2.1</td><td>1.9</td><td>1.8</td></tr>
      <tr><td>Unemployment rate</td><td>4.2</td><td>4.3</td><td>4.0</td></tr>
    </table>
    <p>Some prose in between that is not a table.</p>
    <table><tr><td>Federal funds rate</td><td>3.6</td></tr></table>
  </body></html>`;
  const tables = extractTables(html);
  ok('finds both tables', tables.length === 2, tables.length);
  ok('first table has 3 rows', tables[0].length === 3, JSON.stringify(tables[0]));
  ok('cell text is trimmed/clean', tables[0][1][0] === 'Change in real GDP', JSON.stringify(tables[0][1]));
  ok('numbers preserved in their own cells', tables[0][1][1] === '2.1' && tables[0][2][2] === '4.3', JSON.stringify(tables[0]));

  const md = tablesToMarkdown(tables);
  ok('markdown mentions both tables', md.includes('Table 1:') && md.includes('Table 2:'), md.slice(0, 40));
  ok('markdown keeps the GDP row intact with its number', md.includes('| Change in real GDP | 2.1 | 1.9 | 1.8 |'), md);
}
{
  // Entity-encoded cells (e.g. "&mdash;" for a blank projection cell) must
  // decode the same way htmlToText does — a raw "&mdash;" leaking into a
  // numeric table would look like a real (garbage) data point to the model.
  const html = '<table><tr><td>Range</td><td>3.5&ndash;3.75</td><td>&mdash;</td></tr></table>';
  const tables = extractTables(html);
  ok('entities decoded inside table cells', tables[0][0][1] === '3.5–3.75' && tables[0][0][2] === '—', JSON.stringify(tables[0]));
}
{
  ok('no tables in plain HTML returns empty array', extractTables('<div>no tables here</div>').length === 0);
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
