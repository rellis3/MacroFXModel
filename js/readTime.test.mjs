import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readableText, readWords, readMinutes, labelMinutes } from './readTime.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

const page = words => Array.from({ length: words }, (_, i) => 'word' + i).join(' ');
t('counts body prose, skips script/style/svg/audio script/ELI5/quiz', () => {
  const html = `<html><head><style>.a{}</style><script>var x = "ignored ignored";</script></head><body>
    <p>${page(100)}</p>
    <section class="tl-listen"><p>${page(500)}</p></section>
    <div class="tl-eli5"><div><p>${page(300)}</p></div><p>${page(50)}</p></div>
    <details class="tl-quiz"><summary>q</summary><div class="tl-answer">${page(200)}</div></details>
    <svg><text>${page(80)}</text></svg><p>${page(20)}</p></body></html>`;
  assert.equal(readWords(html), 120);                 // 100 + 20, nothing else
});
const BS = String.fromCharCode(92);   // a backslash, spelled out so no tool in between can collapse it
t('equations are discounted, not read word by word', () => {
  const html = '<body><p>one two three</p><div class="tl-math">' + BS + '[ ' + BS + 'frac{a}{b} + x_i^2 ' + BS + ']</div><p>and ' + BS + '(x' + BS + ') here</p></body>';
  assert.equal(readWords(html), 3 + 8 + 3);           // 3 words + display math (8) + 'and', inline math (1), 'here'
});
t('minutes = words / 200, at least 1; the label parser reads "~N min read"', () => {
  assert.equal(readMinutes(`<body><p>${page(4000)}</p></body>`), 20);
  assert.equal(readMinutes('<body><p>hi</p></body>'), 1);
  assert.equal(labelMinutes('<span>~16 min read</span>'), 16);
  assert.equal(labelMinutes('<span>no label</span>'), null);
});
t('a skipped block that nests tags is closed correctly (prose after it still counts)', () => {
  const html = `<body><div class="tl-eli5"><div><div><p>${page(40)}</p></div></div></div><p>${page(60)}</p></body>`;
  assert.equal(readWords(html), 60);
});

// Every lesson's label must be honest. Tolerance: 20% or 2 minutes, so editing a few paragraphs never breaks the
// build; a brand-new lesson with a guessed label does. Fix with: node scripts/tl_read_times.mjs
t('every Theory Lab / cog lesson label is within tolerance of what the page takes to read', () => {
  const bad = [];
  for (const d of ['theory-lab/lessons', 'cog/lessons']) {
    for (const f of fs.readdirSync(path.join(root, d)).filter(f => f.endsWith('.html') && !f.endsWith('-micro.html'))) {
      const html = fs.readFileSync(path.join(root, d, f), 'utf8'), label = labelMinutes(html);
      if (label == null) continue;
      const want = readMinutes(html);
      if (Math.abs(label - want) > Math.max(2, Math.round(want * 0.2))) bad.push(`${d}/${f}: says ${label}, reads ${want}`);
    }
  }
  assert.deepEqual(bad, [], `read-time labels are off — run: node scripts/tl_read_times.mjs\n${bad.slice(0, 8).join('\n')}`);
});
console.log(`readTime: ${n} tests passed`);
