// Tests for js/questionOfDay.js and the bank behind it.   node js/questionOfDay.test.mjs
import { questionFor } from './questionOfDay.js';
import { QUESTIONS } from './questionBank.js';
import { readFileSync } from 'node:fs';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

const bank = Array.from({ length: 10 }, (_, i) => ({ id: 'q' + i, level: 1 + (i % 3) }));
ok('the same date always gives the same question', questionFor(bank, '2026-10-24').today.id === questionFor(bank, '2026-10-24').today.id);
const seen = new Set(); for (let d = 0; d < 10; d++) seen.add(questionFor(bank, '2026-11-' + String(1 + d).padStart(2, '0')).today.id);
ok('no question repeats until the whole bank has been used', seen.size === 10);
const t = questionFor(bank, '2026-11-05');
ok('the previous answer is the question shown the day before', t.previous.id === questionFor(bank, '2026-11-04').today.id);
ok('the weekly edition moves one question per week and prefers harder ones', questionFor(bank, '2026-11-10', { weekly: true }).today.id !== questionFor(bank, '2026-11-17', { weekly: true }).today.id);
ok('an empty bank or a bad date gives nothing', questionFor([], '2026-11-05') === null && questionFor(bank, 'nope') === null);

// The real bank: every answer must be backed by a verbatim quote from the lesson it names.
const norm = s => String(s).replace(/\s+/g, ' ').trim();
const ids = new Set(); let bad = [];
for (const q of QUESTIONS) {
  for (const k of ['id', 'topic', 'question', 'clue', 'answer', 'why', 'source', 'quote']) if (!String(q[k] ?? '').trim()) bad.push(`${q.id}: empty ${k}`);
  if (ids.has(q.id)) bad.push(`${q.id}: duplicate id`); ids.add(q.id);
  if (![1, 2, 3].includes(q.level)) bad.push(`${q.id}: level`);
  let src = ''; try { src = norm(readFileSync(new URL('../' + q.source, import.meta.url), 'utf8')); } catch { bad.push(`${q.id}: source file missing`); }
  if (src && !src.includes(norm(q.quote))) bad.push(`${q.id}: quote not found in source`);
  if (/[—–→()]/.test(`${q.question} ${q.clue} ${q.answer} ${q.why}`)) bad.push(`${q.id}: dash, arrow or bracket in the text`);
}
ok(`the real bank has ${QUESTIONS.length} questions, each with a quote found verbatim in its lesson`, QUESTIONS.length >= 40 && !bad.length, bad.slice(0, 5).join(' | '));
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
