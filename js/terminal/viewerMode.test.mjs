// js/terminal/viewerMode.test.mjs: the desk login (viewer) must see NOTHING of the owner's chrome, and must never see a dead or empty shell.
//
// Owner report (2026-11-13, tested on the deployed terminal as a viewer): the top-bar Research / Access / Desk Office / Desk Run buttons were
// still there but not clickable, and an Overview card showed "Largest net currency", "Largest scenario loss", "Against currency view" over dashes.
// Causes: (1) access.js deLink() swapped every link to another page for a bare <span>, and the span had no data-surface, so the switched-off
// surface came back as a dead label; (2) bookPanels.js drew the book panels from an unconditional module-ready call, and a surface the owner had
// switched on for the desk login showed labels over withheld data.
//
// The repo has no DOM library (no jsdom), so this test runs the REAL access.js functions over a tiny stand-in DOM built from the REAL markup of the
// terminal's top bar, with the REAL registry. It is a behavioural test of the hide / de-link / sweep passes, not of a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SURFACES, SURFACE_IDS, ALWAYS_OWNER_IDS, visibleFor } from './tabRegistry.js';
import { hideCss, resolveSession, deLink, sweepEmpty } from './access.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = fs.readFileSync(path.join(root, 'desk-terminal.html'), 'utf8');

// ── a tiny DOM: just what deLink / sweepEmpty touch ──
class El {
  constructor(tag, attrs = {}, kids = []) { this.tag = tag; this.attrs = { ...attrs }; this.kids = []; this.parent = null; this._text = ''; this.hidden = false; kids.forEach(k => this.add(k)); }
  add(k) { k.parent = this; this.kids.push(k); return this; }
  get className() { return this.attrs.class ?? ''; } set className(v) { this.attrs.class = v; }
  get title() { return this.attrs.title ?? ''; } set title(v) { this.attrs.title = v; }
  get textContent() { return this._text + this.kids.map(k => k.textContent).join(''); }
  get innerHTML() { return this.textContent; } set innerHTML(v) { this._text = v; this.kids = []; }
  getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }
  hasAttribute(n) { return n in this.attrs; }
  setAttribute(n, v) { this.attrs[n] = v; }
  matches(sel) {
    if (sel === 'a[href]') return this.tag === 'a' && 'href' in this.attrs;
    if (sel.startsWith('.')) return this.className.split(/\s+/).includes(sel.slice(1));
    const m = /^\[([\w-]+)\]$/.exec(sel); if (m) return m[1] in this.attrs;
    throw new Error(`unsupported selector ${sel}`);
  }
  closest(sel) { for (let e = this; e; e = e.parent) if (e.matches(sel)) return e; return null; }
  querySelectorAll(sel) { const out = []; const walk = n => { for (const k of n.kids) { if (k.matches(sel)) out.push(k); walk(k); } }; walk(this); return out; }
  replaceWith(n) { const i = this.parent.kids.indexOf(this); n.parent = this.parent; this.parent.kids[i] = n; this.parent = null; }
}
const doc = { createElement: tag => new El(tag) };
/** what a person can see: the text of every element that is not on or inside a hidden surface, and not [hidden] */
function visibleText(node, hidden) {
  const out = [];
  const walk = (n, off) => {
    const sf = n.getAttribute?.('data-surface');
    const isOff = off || (sf && hidden.has(sf)) || n.hidden === true;
    if (isOff) return;
    if (n._text) out.push(n._text);
    n.kids.forEach(k => walk(k, false));
  };
  walk(node, false);
  return out.join(' | ');
}

// ── the real top bar, parsed from desk-terminal.html ──
function parseTopBar() {
  const m = /<div class="tright">([\s\S]*?)<\/div>\s*<\/div>\s*<div class="ticker"/.exec(html);
  assert.ok(m, 'the top bar markup is found');
  const bar = new El('div', { class: 'tright' });
  for (const t of m[1].matchAll(/<(a|button|span)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const attrs = {}; for (const a of t[2].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    const el = new El(t[1], attrs); el._text = t[3].replace(/<[^>]+>/g, ''); bar.add(el);
  }
  return bar;
}
const askButton = () => { const m = /<button class="fab" id="askbtn" data-surface="([^"]+)"[^>]*>([^<]*)<\/button>/.exec(html); assert.ok(m, 'the Ask pill markup is found'); const e = new El('button', { id: 'askbtn', 'data-surface': m[1] }); e._text = m[2]; return e; };

const viewerState = saved => { const v = visibleFor('viewer', saved); const s = resolveSession({ ok: true, role: 'viewer' }, { ok: true, role: 'viewer', visible: v }); return { ...s, hidden: new Set(SURFACE_IDS.filter(id => !s.visible.includes(id))) }; };
const ownerState = () => { const s = resolveSession({ ok: true, role: 'owner' }, { ok: true, role: 'owner', visible: SURFACE_IDS }); return { ...s, hidden: new Set() }; };

test('the top bar: every control carries a data-surface that is in the registry', () => {
  const bar = parseTopBar();
  assert.ok(bar.kids.length >= 6, 'the top bar has its chips and links');
  for (const e of bar.kids) {
    const id = e.getAttribute('data-surface');
    assert.ok(id, `top-bar <${e.tag}> "${e._text}" has no data-surface: it could never be hidden`);
    assert.ok(SURFACE_IDS.includes(id), `${id} is not in the registry`);
  }
  assert.ok(askButton().getAttribute('data-surface') && SURFACE_IDS.includes(askButton().getAttribute('data-surface')));
});

test('a viewer sees none of the owner chrome: Research, Access, Desk Office, Desk Run, Ask the desk are removed, not left as dead labels', () => {
  const bar = parseTopBar(), ask = askButton();
  const body = new El('body', {}, [bar, ask]);
  // the owner has even switched EVERYTHING on for the desk login: private surfaces and links must still not appear
  const st = viewerState(Object.fromEntries(SURFACE_IDS.map(id => [id, true])));
  deLink(body, st.hidden, doc);
  const seen = visibleText(body, st.hidden);
  for (const w of ['Research', 'Access', 'Desk Office', 'Desk Run', 'Ask the desk']) assert.ok(!seen.includes(w), `a viewer can see "${w}": ${seen}`);
  // and no bare "Owner only" span replaced them (the old bug)
  for (const sp of body.querySelectorAll('.nolink')) assert.fail(`a dead label was left behind: ${sp._text}`);
  // the hide stylesheet covers every one of them
  const css = hideCss(st.visible);
  for (const id of ['nav.access', 'nav.research', 'nav.deskoffice', 'nav.deskrun', 'widget.ask', 'widget.dqchip']) assert.ok(css.includes(`[data-surface="${id}"]{display:none!important}`), `${id} is hidden by the stylesheet`);
  // what stays: the sign-out chip and the clocks (analysis / always visible)
  assert.ok(seen.includes('Sign out'));
});

test('the owner still sees every one of them', () => {
  const bar = parseTopBar(), ask = askButton(); const body = new El('body', {}, [bar, ask]);
  const st = ownerState(); deLink(body, st.hidden, doc);
  const seen = visibleText(body, st.hidden);
  for (const w of ['Research', 'Access', 'Desk Office', 'Desk Run', 'Ask the desk']) assert.ok(seen.includes(w), `the owner lost "${w}"`);
  assert.equal(hideCss(st.visible), '');
});

test('deLink: a link on a switched-off surface is left alone, a visible link to another page becomes plain text that keeps its surface id', () => {
  const hiddenLink = new El('a', { href: 'research.html', 'data-surface': 'nav.research' }); hiddenLink._text = 'Research';
  const visibleLink = new El('a', { href: 'bank-credit.html', class: 'lnk' }); visibleLink._text = 'Bank credit page';
  const surfaceLink = new El('a', { href: 'rates.html', 'data-surface': 'panel.ov.week' }); surfaceLink._text = 'Rates';
  const inside = new El('a', { href: 'x.html' }); inside._text = 'inside hidden panel';
  const panel = new El('div', { 'data-surface': 'panel.ov.exposure' }, [inside]);
  const ext = new El('a', { href: 'https://example.com/x' }); ext._text = 'external';
  const body = new El('body', {}, [hiddenLink, visibleLink, surfaceLink, panel, ext]);
  deLink(body, new Set(['nav.research', 'panel.ov.exposure']), doc);
  assert.equal(body.kids[0], hiddenLink, 'the hidden anchor is not replaced');
  assert.equal(body.kids[1].tag, 'span'); assert.match(body.kids[1].className, /nolink/); assert.equal(body.kids[1]._text, 'Bank credit page');
  assert.equal(body.kids[2].tag, 'span'); assert.equal(body.kids[2].getAttribute('data-surface'), 'panel.ov.week', 'a span made from a surface link keeps its data-surface');
  assert.equal(panel.kids[0], inside, 'a link inside a hidden panel is not replaced');
  assert.equal(body.kids[4], ext, 'external links stay');
});

test('sweepEmpty: a card whose values are all dashes is hidden whole; a card with real values, or one lone dash, is not', () => {
  const tile = v => { const t = new El('div', { class: 'bi-tile' }); const lbl = new El('div', { class: 'lbl' }); lbl._text = 'Largest scenario loss'; const val = new El('div', { class: 'v' }); val._text = v; return t.add(lbl).add(val); };
  const card = (...vals) => new El('div', { class: 'card bi' }, vals.map(tile));
  const empty = card('–', '–', '–', '—'), real = card('–', 'EUR long 1.2', '–'), lone = card('–');
  const body = new El('body', {}, [empty, real, lone]);
  sweepEmpty(body);
  assert.equal(empty.hidden, true); assert.ok(empty.hasAttribute('data-empty'));
  assert.equal(real.hidden, false); assert.equal(lone.hidden, false);
  assert.equal((visibleText(body, new Set()).match(/Largest scenario loss/g) ?? []).length, 4, 'the four labels of the swept card are gone; the honest cards (3 + 1) remain');
});

test('the page hides [data-empty] and gates its fail-closed state before access resolves', () => {
  assert.match(html, /\[data-empty\]\{display:none!important\}/);
  assert.match(html, /html:not\(\[data-role\]\) \[data-surface\]\{visibility:hidden\}/, 'until access.js says who is looking, no owner chrome is shown');
});

test('bookPanels.js never builds a book panel for a session that may not see it (the module-ready call is not gated by the page)', () => {
  const src = fs.readFileSync(path.join(root, 'js', 'terminal', 'bookPanels.js'), 'utf8');
  for (const [fn, id] of [['drawBookIntel', 'panel.ov.bookintel'], ['drawBookFlow', 'panel.charts.bookflow'], ['drawScenarioMap', 'panel.ana.scenmap']]) {
    const body = src.slice(src.indexOf(`async function ${fn}(`)); const head = body.slice(0, body.indexOf('\n', body.indexOf('\n') + 1));
    assert.ok(head.includes(`deskSurfaceOn?.('${id}') === false`), `${fn} must return early when ${id} is off`);
  }
});

test('every private surface and every link out is owner-only, whatever the saved switches say, and there is no switch for it', () => {
  const admin = fs.readFileSync(path.join(root, 'desk-admin.html'), 'utf8');
  assert.match(admin, /ALWAYS_OWNER_IDS\.includes\(s\.id\)/, 'the admin panel does not list owner-only surfaces');
  for (const s of SURFACES) if (s.class === 'private' || s.kind === 'nav') assert.ok(ALWAYS_OWNER_IDS.includes(s.id), `${s.id} must be owner-only`);
});

test('a card whose only content is "owner only" is swept for a viewer', () => {
  const c = new El('div', { class: 'card muted' }); c._text = 'owner only';
  const ok = new El('div', { class: 'card' }); ok._text = 'No scored day yet.';
  sweepEmpty(new El('body', {}, [c, ok]));
  assert.equal(c.hidden, true); assert.equal(ok.hidden, false);
});

test('a withheld read hides its whole panel, and the correlation Admin (rebuild) box is not built for a viewer', () => {
  const bp = fs.readFileSync(path.join(root, 'js', 'terminal', 'bookPanels.js'), 'utf8');
  assert.match(bp, /if \(withheld\(idx\)\) return hideShell\(el\)/, 'ranking vs realised hides itself when its route is refused');
  const cv = fs.readFileSync(path.join(root, 'js', 'terminal', 'corrView.js'), 'utf8');
  assert.match(cv, /\$\{globalThis\.deskIsViewer\?\.\(\) \? '' : '<details class="ct-admin">/, 'the Admin / Rebuild now box is owner-only');
});
