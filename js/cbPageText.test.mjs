// Synthetic test for cbPageText.js's pure helpers. No network.
//   node js/cbPageText.test.mjs
import { fixNumericEntities, sliceHtml, pageText, findAnchors, dmyLong, mdyLong, numberish } from './cbPageText.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[fixNumericEntities — the RBA emits cp1252 entities]');
{
  ok('&#146; becomes a right single quote (seen live on rba.gov.au)', fixNumericEntities('Today&#146;s policy decision') === 'Today’s policy decision');
  ok('hex entity decoded', fixNumericEntities('Canada&#x2011;US') === 'Canada‑US');
  ok('ordinary decimal entities left for decodeEntities', fixNumericEntities('&#114;&#098;') === '&#114;&#098;');
}

console.log('[sliceHtml / pageText]');
{
  const html = '<nav>Menu Home About</nav><h1 id="main-heading">Title</h1><p>Body one.</p><p>Body&nbsp;two.</p><h2>Media contact</h2><footer>x</footer>';
  ok('slice keeps start marker, drops end marker onward', sliceHtml(html, /<h1/, /<h2>Media contact/) === '<h1 id="main-heading">Title</h1><p>Body one.</p><p>Body&nbsp;two.</p>');
  const t = pageText(html, /<h1/, /<h2>Media contact/);
  ok('nav text removed', !/Menu/.test(t), t);
  ok('body text kept, nbsp folded to a space', /Body one\./.test(t) && /Body two\./.test(t), JSON.stringify(t));
  ok('missing start marker -> whole page kept (noisy, not empty)', /Menu/.test(pageText(html, /<nope/, null)));
}

console.log('[findAnchors — full-phrase match, not loose terms]');
{
  const html = '<a href="/a">2&nbsp;September 2026</a><a href="/b">22 September 2026</a>';
  const hits = findAnchors(html, /^2 September 2026$/);
  ok('exact phrase picks the right anchor only', hits.length === 1 && hits[0].href === '/a', JSON.stringify(hits));
}

console.log('[date prose + number words]');
{
  ok('dmyLong', dmyLong('2026-09-02') === '2 September 2026');
  ok('mdyLong', mdyLong('2026-09-02') === 'September 2, 2026');
  ok('numberish words + digits', numberish('eight') === 8 && numberish('6') === 6 && numberish('lots') === null);
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll cbPageText tests passed.');
