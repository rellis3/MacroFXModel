// Synthetic test for the FOMC statement word-diff. No network.
//   node js/fomcDiff.test.mjs
import { wordDiff, diffToPromptLines } from './fomcDiff.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[identical statements]');
{
  const d = wordDiff('Job gains have kept pace with the workforce.', 'Job gains have kept pace with the workforce.');
  ok('no changes', d.stats.added === 0 && d.stats.removed === 0, JSON.stringify(d.stats));
  ok('changeRatio is 0', d.stats.changeRatio === 0);
}

console.log('[single-phrase swap — the classic hawkish/dovish tell]');
{
  const prev = 'Inflation has been running at levels the Committee views as transitory.';
  const cur  = 'Inflation has been running at levels the Committee views as persistent.';
  const d = wordDiff(prev, cur);
  const added = d.segments.filter(s => s.type === 'add').map(s => s.text).join(' ');
  const removed = d.segments.filter(s => s.type === 'del').map(s => s.text).join(' ');
  ok('flags "persistent." as added', added.includes('persistent'), added);
  ok('flags "transitory." as removed', removed.includes('transitory'), removed);
  ok('rest of the sentence is unchanged', d.segments.some(s => s.type === 'same' && s.text.startsWith('Inflation has been running')));
}

console.log('[diffToPromptLines]');
{
  const d = wordDiff('The economy is expanding at a solid pace.', 'The economy is expanding at a moderate pace.');
  const lines = diffToPromptLines(d);
  ok('one ADDED and one REMOVED line', lines.some(l => l.startsWith('ADDED')) && lines.some(l => l.startsWith('REMOVED')), JSON.stringify(lines));
}

console.log('[empty previous — first-ever statement]');
{
  const d = wordDiff('', 'The Committee decided to hold rates steady.');
  ok('everything is an add', d.stats.removed === 0 && d.stats.added === d.stats.words);
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll fomcDiff tests passed.');
