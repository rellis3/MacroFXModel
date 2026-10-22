// Tests for js/svgArt.js — the allowlist that stands between a model's drawing and the page.   node js/svgArt.test.mjs
import { sanitizeSvg } from './svgArt.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

const GOOD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 160" width="999" height="400">
  <defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a2a6c"/><stop offset="1" stop-color="rgb(178,31,31)" stop-opacity="0.8"/></linearGradient></defs>
  <rect x="0" y="0" width="680" height="160" fill="url(#g1)"/>
  <path d="M0 120 C 120 60, 240 160, 360 90 S 600 40, 680 100" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.5" stroke-linecap="round"/>
  <g transform="translate(40 30)"><circle cx="20" cy="20" r="12" fill="#fdbb2d" fill-opacity="0.7"/></g>
</svg>`;
const r = sanitizeSvg('Here is your banner:\n```svg\n' + GOOD + '\n```');
ok('a clean drawing inside a code fence and prose is accepted', r.ok && r.elements >= 7, r.reason);
ok('the root is rebuilt: fixed viewBox, 100% size, the model\'s 999×400 is ignored', r.ok && /<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 680 160"[^>]*width="100%" height="100%"/.test(r.svg) && !/999|400/.test(r.svg.slice(0, 200)));
ok('gradients keep their camel-case names', r.ok && /<linearGradient id="g1"/.test(r.svg) && /<\/linearGradient>/.test(r.svg));
ok('output carries no script, handler, href or style', r.ok && !/script|\bon\w+=|href|style/i.test(r.svg));

const BAD = {
  'a script element': GOOD.replace('<defs>', '<script>alert(1)</script><defs>'),
  'an onload handler': GOOD.replace('<rect ', '<rect onload="x()" '),
  'an href': GOOD.replace('<circle ', '<circle href="https://evil.example" '),
  'javascript: in a value': GOOD.replace('#fdbb2d', 'javascript:alert(1)'),
  'a style element': GOOD.replace('<defs>', '<style>*{fill:red}</style><defs>'),
  'a style attribute': GOOD.replace('<rect ', '<rect style="fill:red" '),
  'foreignObject': GOOD.replace('<defs>', '<foreignObject><div>hi</div></foreignObject><defs>'),
  'an <image> with a data URI': GOOD.replace('<defs>', '<image href="data:image/png;base64,AAA"/><defs>'),
  'text (the model must not write words into the art)': GOOD.replace('<defs>', '<text x="1" y="1">BUY</text><defs>'),
  'an external url() fill': GOOD.replace('url(#g1)', 'url(https://evil.example/x.svg#a)'),
  'a use element': GOOD.replace('<defs>', '<use href="#g1"/><defs>'),
  'an animate element': GOOD.replace('<defs>', '<animate attributeName="x"/><defs>'),
  'an HTML entity': GOOD.replace('#fdbb2d', '&#106;avascript'),
  'a CSS expression': GOOD.replace('#fdbb2d', 'expression(alert(1))'),
  'a path with letters outside the path grammar': GOOD.replace('M0 120', 'M0 120 foo'),
  'a transform that is not a transform': GOOD.replace('translate(40 30)', 'url(javascript:1)'),
  'unbalanced tags': GOOD.replace('</g>', ''),
  'a nested svg': GOOD.replace('<defs>', '<svg><circle r="1"/></svg><defs>'),
  'stray text between tags': GOOD.replace('<defs>', 'hello<defs>'),
  'a duplicate attribute': GOOD.replace('<rect ', '<rect x="1" '),
  'no svg at all': 'I cannot draw that.',
  'an empty string': '',
};
for (const [name, src] of Object.entries(BAD)) { const x = sanitizeSvg(src); ok(`rejects ${name}`, x.ok === false, x.ok ? 'ACCEPTED' : x.reason); }
ok('rejects more than the element cap', sanitizeSvg('<svg>' + '<circle cx="1" cy="1" r="1"/>'.repeat(200) + '</svg>').ok === false);
ok('rejects an oversized drawing', sanitizeSvg('<svg>' + '<circle cx="1" cy="1" r="1"/>'.repeat(10) + ' '.repeat(20000) + '</svg>').ok === false);
ok('accepts the minimal drawing', sanitizeSvg('<svg><rect x="0" y="0" width="10" height="10" fill="red"/></svg>').ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
