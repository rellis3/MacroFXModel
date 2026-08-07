// Synthetic test for bojFetch.js's pure helpers. No network — the fetch*()
// I/O functions aren't exercised here (this sandbox can't reach boj.or.jp).
//   node js/bojFetch.test.mjs
import { statementUrl, outlookHighlightUrl, opinionsUrl, minutesPdfUrl, extractVote } from './bojFetch.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[URL builders — matched against real confirmed examples]');
{
  ok('statementUrl matches the real Jan 2026 page', statementUrl('2026-01-23') === 'https://www.boj.or.jp/en/mopo/mpmdeci/state_2026/k260123a.htm', statementUrl('2026-01-23'));
  ok('statementUrl matches the real Apr 2026 page', statementUrl('2026-04-28') === 'https://www.boj.or.jp/en/mopo/mpmdeci/state_2026/k260428a.htm');
  ok('outlookHighlightUrl matches the real Jul 2025 example (pre-2026 sanity check)', outlookHighlightUrl('2025-07-31') === 'https://www.boj.or.jp/en/mopo/outlook/highlight/ten202507.htm', outlookHighlightUrl('2025-07-31'));
  ok('opinionsUrl matches the real Jan 2026 example', opinionsUrl('2026-01-23') === 'https://www.boj.or.jp/en/mopo/mpmsche_minu/opinion_2026/opi260123.htm', opinionsUrl('2026-01-23'));
  ok('minutesPdfUrl matches the real Sep 2025 example (dir year = meeting year)', minutesPdfUrl('2025-09-19') === 'https://www.boj.or.jp/en/mopo/mpmsche_minu/minu_2025/g250919.pdf', minutesPdfUrl('2025-09-19'));
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
