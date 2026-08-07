// Synthetic test for the FOMC statement word-diff. No network.
//   node js/fomcDiff.test.mjs
import { wordDiff, diffToPromptLines, diffTables } from './fomcDiff.js';

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

console.log('[diffTables — SEP median moved, columns aligned by header text]');
{
  const prev = [[
    ['Variable', '2026', '2027', 'Longer run'],
    ['Change in real GDP, median', '2.1', '1.9', '1.8'],
    ['Federal funds rate, median', '3.9', '3.4', '3.0'],
  ]];
  const cur = [[
    ['Variable', '2026', '2027', 'Longer run'],
    ['Change in real GDP, median', '2.1', '2.0', '1.8'],
    ['Federal funds rate, median', '3.6', '3.4', '3.0'],
  ]];
  const lines = diffTables(prev, cur);
  ok('flags the GDP 2027 median move', lines.some(l => l.includes('Change in real GDP') && l.includes('2027') && l.includes('1.9 → 2.0')), JSON.stringify(lines));
  ok('flags the funds-rate 2026 median move', lines.some(l => l.includes('Federal funds rate') && l.includes('2026') && l.includes('3.9 → 3.6')), JSON.stringify(lines));
  ok('does NOT flag longer run (unchanged)', !lines.some(l => l.includes('Longer run')), JSON.stringify(lines));
  ok('exactly 2 changes', lines.length === 2, JSON.stringify(lines));
}

console.log('[diffTables — year columns roll forward, matched by header not position]');
{
  // Meeting N covers 2026-2028; meeting N+1 covers 2027-2029 — "2027" sits at
  // index 2 in prev but index 1 in cur. A positional diff would wrongly
  // compare 2026's value to 2027's; header-matching must get this right.
  const prev = [[
    ['Variable', '2026', '2027', '2028'],
    ['Unemployment rate, median', '4.0', '4.1', '4.2'],
  ]];
  const cur = [[
    ['Variable', '2027', '2028', '2029'],
    ['Unemployment rate, median', '4.1', '4.3', '4.4'],
  ]];
  const lines = diffTables(prev, cur);
  ok('2027 correctly reads as unchanged (4.1 -> 4.1, not flagged)', !lines.some(l => l.includes('(2027)')), JSON.stringify(lines));
  ok('2028 correctly flagged as changed (4.2 -> 4.3)', lines.some(l => l.includes('(2028): 4.2 → 4.3')), JSON.stringify(lines));
  ok('2029 is a brand-new column, reported as new not a diff', lines.some(l => l.includes('new column "2029"') && l.includes('4.4')), JSON.stringify(lines));
}

console.log('[diffTables — new row, e.g. a line item added to the table]');
{
  const prev = [[['Variable', '2026'], ['GDP', '2.1']]];
  const cur = [[['Variable', '2026'], ['GDP', '2.1'], ['Core PCE inflation', '2.4']]];
  const lines = diffTables(prev, cur);
  ok('flags the new row', lines.some(l => l.includes('NEW ROW') && l.includes('Core PCE inflation')), JSON.stringify(lines));
  ok('does not flag GDP (unchanged)', !lines.some(l => l.includes('"GDP"')), JSON.stringify(lines));
}

console.log('[empty previous — first-ever statement]');
{
  const d = wordDiff('', 'The Committee decided to hold rates steady.');
  ok('everything is an add', d.stats.removed === 0 && d.stats.added === d.stats.words);
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll fomcDiff tests passed.');
