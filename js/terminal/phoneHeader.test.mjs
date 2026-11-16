// js/terminal/phoneHeader.test.mjs: guards the phone header (2026-11-17). Static checks on desk-terminal.html, phone-header.css and phoneHeader.js: the phone rules exist,
// every header control keeps its id and data-surface, the More button and its sheet carry the aria attributes, and NOTHING outside the 700px media query changes
// the desktop header. The measurement (header height, reachability, no overflow) is scripts/phone-header-check.mjs (needs a browser, not in CI).
// node --test js/terminal/phoneHeader.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = f => fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const html = read('desk-terminal.html');
const css = read('js/terminal/phone-header.css');
const js = read('js/terminal/phoneHeader.js');
const asof = read('js/terminal/asofClock.js');

// the controls the feature loaders and the access hiding find by id / data-surface
const CONTROLS = [['cmdbtn', 'widget.cmdline'], ['alertsbtn', 'widget.alerts'], ['linkchip', 'widget.linked'], ['mktchip', 'widget.mktchip'], ['asofchip', 'widget.asof'], ['asofbtn', 'widget.asof'],
  ['bookchip', 'widget.bookchip'], ['dqchip', 'widget.dqchip'], ['themebtn', 'widget.themepicker'], ['signout', 'widget.signout']];

test('every header control keeps its id and its data-surface', () => {
  const head = html.slice(html.indexOf('<header class="top">'), html.indexOf('</header>'));
  for (const [id, surf] of CONTROLS) {
    const tag = new RegExp(`<[a-z]+[^>]*\\bid="${id}"[^>]*>`).exec(head)?.[0];
    assert.ok(tag, `#${id} is in the header`);
    assert.ok(tag.includes(`data-surface="${surf}"`), `#${id} carries data-surface="${surf}"`);
  }
  for (const s of ['nav.access', 'nav.research', 'nav.deskoffice', 'nav.deskrun', 'widget.clocks']) assert.ok(head.includes(`data-surface="${s}"`), `${s} is still in the header`);
  assert.ok(html.includes('id="askbtn"') && /id="askbtn"[^>]*data-surface="widget\.ask"/.test(html), 'Ask the desk keeps its id and surface');
});

test('the More button and its sheet carry the aria attributes', () => {
  const more = /<button[^>]*id="hdrmore"[^>]*>/.exec(html)?.[0];
  assert.ok(more, '#hdrmore exists');
  assert.ok(/aria-expanded="false"/.test(more) && /aria-controls="hdrsheet"/.test(more) && /aria-label="[^"]+"/.test(more), 'aria-expanded, aria-controls and an accessible name');
  assert.ok(/data-surface="widget\.phonemenu"/.test(more), 'the More button is a registered surface (the top-bar guard needs one)');
  assert.ok(/<div class="tright" id="hdrsheet">/.test(html), 'the sheet is .tright with the id the button controls');
  assert.ok(html.includes('aria-label="Ask the desk"'), 'the round Ask button keeps its name');
});

test('the phone header script and stylesheet are linked, and the script handles Esc, Tab and outside taps', () => {
  assert.ok(html.includes('href="js/terminal/phone-header.css"'), 'stylesheet linked');
  assert.ok(html.includes('src="js/terminal/phoneHeader.js"'), 'script loaded');
  assert.ok(/aria-expanded/.test(js) && /Escape/.test(js) && /Tab/.test(js), 'aria-expanded, Esc and a Tab trap');
  assert.ok(/insertBefore\(cmd, tright\)/.test(js) && /tright\.insertBefore\(cmd, tright\.firstChild\)/.test(js), 'the command box moves out and back');
  assert.ok(/max-width: 700px/.test(js), 'the same breakpoint as the stylesheet');
});

test('the phone rules exist and every rule that changes the header is inside the 700px media query', () => {
  assert.ok(/@media \(max-width: 700px\)/.test(css));
  for (const needle of ['.top { position: relative; }', 'grid-template-areas', '.hm-open', '#cmdbtn.cmdbar', '#asofbar.asof-bar { top: 0 !important; }', '.fab#askbtn']) assert.ok(css.includes(needle), `phone rule: ${needle}`);
  // strip every @media (...) { ... } block: what is left may only style the More button (hidden on desktop) and its focus ring
  let rest = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (;;) {
    const i = rest.search(/@media[^{]*\{/); if (i < 0) break;
    let depth = 0, j = rest.indexOf('{', i);
    for (; j < rest.length; j++) { if (rest[j] === '{') depth++; else if (rest[j] === '}') { depth--; if (depth === 0) break; } }
    rest = rest.slice(0, i) + rest.slice(j + 1);
  }
  const outside = [...rest.matchAll(/([^{}]+)\{/g)].map(m => m[1].trim()).filter(Boolean);
  assert.deepEqual(outside, ['.hm-more', '.hm-more:focus-visible'], `only the More button is styled outside the media query: ${outside.join(' | ')}`);
  assert.ok(/\.hm-more \{ display: none; \}/.test(css), 'the More button is hidden above 700px');
});

test('the world clocks keep their full names and gain a 3-letter label for the phone', () => {
  for (const ab of ['SYD', 'TYO', 'LON', 'NYC']) assert.ok(html.includes(`'${ab}'`), `${ab} is a clock label`);
  assert.ok(html.includes('<b data-ab="${ab}">${n.toUpperCase()}</b>'), 'the full name stays in the markup (desktop)');
});

test('the time bar starts folded on a phone and open elsewhere', () => {
  assert.ok(/saved == null \? !\(\(win\.innerWidth \|\| 1024\) <= 700\) : saved !== '0'/.test(asof), 'phone default is the folded tab; a saved choice still wins');
});
