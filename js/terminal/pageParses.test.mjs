// js/terminal/pageParses.test.mjs: GUARD. desk-terminal.html carries the terminal's main script inline. One missing bracket in it stops the whole page (no data, no visuals,
// "not available" everywhere) and nothing else catches it, because the other tests import the modules, not the page. This parses every inline classic script in the page.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('every inline script in desk-terminal.html parses', () => {
  const html = fs.readFileSync(new URL('../../desk-terminal.html', import.meta.url), 'utf8');
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/g;
  let m, n = 0;
  while ((m = re.exec(html))) {
    const attrs = m[1] ?? '';
    if (/src=/.test(attrs) || /type="module"/.test(attrs) || !m[2].trim()) continue;
    n++;
    const line = html.slice(0, m.index).split('\n').length;
    assert.doesNotThrow(() => new vm.Script(m[2]), `the inline script starting at line ${line} of desk-terminal.html has a syntax error`);
  }
  assert.ok(n >= 1, 'found no inline script to check');
});
