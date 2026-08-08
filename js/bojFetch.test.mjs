// Synthetic test for bojFetch.js's pure helpers. No network — the fetch*()
// I/O functions aren't exercised here (this sandbox can't reach boj.or.jp).
//   node js/bojFetch.test.mjs
import { statementUrl, outlookViewUrl, outlookFullUrl, opinionsUrl, minutesPdfUrl, extractVote } from './bojFetch.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[URL builders — matched against real confirmed examples]');
{
  // Corrected 2026-08-07 via a live /api/boj/debug-fetch diagnostic: the
  // original .htm guesses for statement/opinions both 404'd for real; a
  // follow-up search confirmed the actual live documents are PDFs at these
  // paths (e.g. the exact July 2026 statement was found indexed at this URL).
  ok('statementUrl matches the real Jan 2026 PDF', statementUrl('2026-01-23') === 'https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2026/k260123a.pdf', statementUrl('2026-01-23'));
  ok('statementUrl matches the real Jul 2026 PDF', statementUrl('2026-07-31') === 'https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2026/k260731a.pdf');
  // Corrected 2026-08-08: the "Highlights" HTML page 404'd for the July 2026
  // edition specifically; both the "a" (Bank's View) and "b" (full report)
  // PDFs are confirmed real for that same edition — see bojFetch.js's header.
  ok('outlookViewUrl matches the real Jul 2026 "Bank\'s View" PDF', outlookViewUrl('2026-07-31') === 'https://www.boj.or.jp/en/mopo/outlook/gor2607a.pdf', outlookViewUrl('2026-07-31'));
  ok('outlookFullUrl matches the real Jul 2026 full-report PDF', outlookFullUrl('2026-07-31') === 'https://www.boj.or.jp/en/mopo/outlook/gor2607b.pdf', outlookFullUrl('2026-07-31'));
  ok('outlookViewUrl matches the real Apr 2026 "Bank\'s View" PDF', outlookViewUrl('2026-04-28') === 'https://www.boj.or.jp/en/mopo/outlook/gor2604a.pdf');
  ok('opinionsUrl matches the real Jan 2026 PDF', opinionsUrl('2026-01-23') === 'https://www.boj.or.jp/en/mopo/mpmsche_minu/opinion_2026/opi260123.pdf', opinionsUrl('2026-01-23'));
  ok('minutesPdfUrl matches the real Apr 2026 example (dir year = meeting year)', minutesPdfUrl('2026-04-28') === 'https://www.boj.or.jp/en/mopo/mpmsche_minu/minu_2026/g260428.pdf', minutesPdfUrl('2026-04-28'));
}

console.log('[extractVote — real confirmed BoJ phrasing]');
{
  const unanimous = 'The Bank decided, by a unanimous vote, to set the following guideline for money market operations.';
  ok('unanimous vote detected', extractVote(unanimous)?.unanimous === true, JSON.stringify(extractVote(unanimous)));
}
{
  // Real text pattern from the actual June 2024 release.
  const majority = 'The Bank decided, by an 8-1 majority vote, to reduce its purchase amount of Japanese government bonds. Nakamura Toyoaki voted against the action, dissenting because he considered that the Bank should maintain the current pace of purchases for the time being.';
  const v = extractVote(majority);
  ok('majority split parsed correctly', v.unanimous === false && v.majority === 8 && v.minority === 1, JSON.stringify(v));
  ok('dissenter name + reason extracted', v.dissenters.length === 1 && v.dissenters[0].name === 'Nakamura Toyoaki' && /maintain the current pace/.test(v.dissenters[0].reason), JSON.stringify(v.dissenters));
}
{
  // Alternate "vote of X-Y" phrasing, no dissent clause present.
  const majority = 'The Bank decided, by a vote of 7-2, to set the following guideline.';
  const v = extractVote(majority);
  ok('plain "vote of X-Y" variant also parses', v.majority === 7 && v.minority === 2, JSON.stringify(v));
  ok('no dissent clause -> empty dissenters array, not a crash', Array.isArray(v.dissenters) && v.dissenters.length === 0);
}
{
  ok('no vote sentence -> null', extractVote('No vote information in this text.') === null);
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll bojFetch tests passed.');
