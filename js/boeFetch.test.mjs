// Synthetic test for boeFetch.js's pure helpers. No network — the fetch*()
// I/O functions aren't exercised here (this sandbox can't reach
// bankofengland.co.uk).
//   node js/boeFetch.test.mjs
import { summaryUrl, reportUrl, transcriptPdfUrl, extractVote } from './boeFetch.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[URL builders — matched against real confirmed examples]');
{
  ok('summaryUrl matches the real June 2026 page', summaryUrl('2026-06-18') === 'https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes/2026/june-2026', summaryUrl('2026-06-18'));
  ok('summaryUrl matches the real February 2026 page', summaryUrl('2026-02-05') === 'https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes/2026/february-2026');
  ok('reportUrl matches the real April 2026 page', reportUrl('2026-04-30') === 'https://www.bankofengland.co.uk/monetary-policy-report/2026/april-2026', reportUrl('2026-04-30'));
  ok('transcriptPdfUrl matches the real May 2025 example', transcriptPdfUrl('2025-05-08') === 'https://www.bankofengland.co.uk/-/media/boe/files/monetary-policy-report/2025/may/mpr-press-conference-transcript-may-2025.pdf', transcriptPdfUrl('2025-05-08'));
}

console.log('[extractVote — real confirmed BoE phrasing]');
{
  const unanimous = 'At its meeting ending on 18 March 2026, the Monetary Policy Committee (MPC) voted unanimously to maintain Bank Rate at 3.75%.';
  ok('unanimous vote detected', extractVote(unanimous)?.unanimous === true, JSON.stringify(extractVote(unanimous)));
}
{
  // Real text pattern from the actual Feb 2026 release, EN-DASH between numbers.
  const majority = 'the Monetary Policy Committee voted by a majority of 5–4 to maintain Bank Rate at 3.75%.';
  const v = extractVote(majority);
  ok('majority split parsed correctly', v.unanimous === false && v.majority === 5 && v.minority === 4, JSON.stringify(v));
}
{
  // Also handle a plain hyphen in case a different rendering strips the en-dash.
  const majority = 'the Monetary Policy Committee voted by a majority of 8-1 to maintain Bank Rate at 3.75%.';
  const v = extractVote(majority);
  ok('plain-hyphen variant also parses', v.majority === 8 && v.minority === 1, JSON.stringify(v));
}
{
  ok('no vote sentence -> null', extractVote('No vote information in this text.') === null);
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll boeFetch tests passed.');
