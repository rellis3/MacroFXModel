// Links from the Desk Terminal to pages outside the desk zone are the OWNER's: a desk viewer must never be shown one (it would bounce to the
// owner's login). This test covers the helper (js/terminal/links.js) and GUARDS the code: a raw href to a page in desk-terminal.html or
// js/terminal/*.js fails with its file:line. If it fails: build the link with ownerLink(href, label, { hide, suffix, target }) or wrap the sentence in
// ownerOnly(html) from './links.js' (desk-terminal.html's classic script: globalThis.ownerLink / globalThis.ownerOnly).
//   node --test js/terminal/links.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownerLink, ownerOnly, isOwner, isDeskLocal } from './links.js';
import { wireSignout, resolveSession } from './access.js';
import { visibleFor, cleanSwitches, SURFACE_IDS, ALWAYS_VISIBLE_IDS } from './tabRegistry.js';

const as = role => { globalThis.deskAccessState = role ? { role } : undefined; };

test('owner gets a real anchor; a viewer gets plain text; unknown role fails closed', () => {
  as('owner');
  assert.equal(isOwner(), true);
  assert.match(ownerLink('bank-credit.html', 'Bank credit page'), /^<a href="bank-credit\.html" data-owner-link>Bank credit page<\/a>$/);
  as('viewer');
  assert.equal(ownerLink('bank-credit.html', 'Bank credit page'), '<span class="nolink">Bank credit page</span>');
  as(null);
  assert.equal(isOwner(), false, 'no session yet: a viewer');
  assert.equal(ownerLink('x.html', 'X'), '<span class="nolink">X</span>');
  assert.equal(ownerOnly('<p>secret</p>'), '');
  as('owner');
  assert.equal(ownerOnly('<p>ok</p>'), '<p>ok</p>');
});

test('options: suffix (arrow) only for the owner, hide gives a viewer nothing, target adds rel=noopener, id/class/style carry over', () => {
  as('owner');
  assert.match(ownerLink('research.html', 'Research rooms', { cls: 'btn', style: 'color:red', suffix: ' →', target: '_blank', id: 'r' }),
    /^<a id="r" class="btn" style="color:red" href="research\.html" target="_blank" rel="noopener" data-owner-link>Research rooms →<\/a>$/);
  as('viewer');
  assert.equal(ownerLink('research.html', 'Research rooms', { suffix: ' →', hide: true }), '');
  assert.equal(ownerLink('research.html', 'Research rooms', { cls: 'btn', suffix: ' →' }), '<span class="nolink btn">Research rooms</span>', 'no arrow, no link');
});

test('hrefs are escaped; in-page, external and /api links need no owner', () => {
  as('owner');
  assert.match(ownerLink('a.html?x="1"&y=2', 'L'), /href="a\.html\?x=&quot;1&quot;&amp;y=2"/);
  as('viewer');
  for (const h of ['#pair=EURUSD', '#', 'https://www.rbnz.govt.nz/x', 'mailto:a@b.c', '/api/global-read/record', 'desk-terminal.html#pair=X', '/desk-terminal.html']) {
    assert.ok(isDeskLocal(h), h);
    assert.match(ownerLink(h, 'ok'), /^<a /, `${h} is not owner-only`);
  }
  for (const h of ['bank-credit.html', 'today.html', 'evidence.html#ev-x', 'research.html', '/atlas.html']) assert.equal(isDeskLocal(h), false, h);
});

test('the classic script reaches the helpers through globalThis once access.js is loaded', () => {
  assert.equal(typeof globalThis.ownerLink, 'function');
  assert.equal(typeof globalThis.ownerOnly, 'function');
});

// ── the guard ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const files = ['desk-terminal.html', ...fs.readdirSync(path.join(ROOT, 'js', 'terminal')).filter(f => f.endsWith('.js') && !/\.test\./.test(f) && !/^(links|access|tabRegistry)\.js$/.test(f)).map(f => `js/terminal/${f}`)];
// dynamic hrefs that are external sources (a central-bank speech, a news headline, a paper) or the page's own assets, not pages of this site
const EXTERNAL_OK = ['esc(sp.url)', 'esc(l.url)', 'esc(h.link', 'esc(u)', 'h(p.url)', '${url}', 'new URL(', 'createObjectURL', 'safeHref(', 'fonts.googleapis.com'];   // fonts.googleapis.com: the theme picker's one extra font stylesheet (the head script, js/terminal/themes.js)

function scan(text) {
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;                      // comments
    const hrefs = [...line.matchAll(/href\s*=\s*\\?(["'`])?([^"'`\s>]*)/g)].map(m => m[2]);
    const sinks = [...line.matchAll(/(window\.open\(|location\.(?:href|assign|replace)\s*=|\.href\s*=)/g)];
    if (!hrefs.length && !sinks.length) return;
    const wrapped = /ownerLink|ownerOnly\(|data-owner-link|data-surface="nav\.|data-keep-link/.test(line);
    for (const v of hrefs) {
      if (/^(#|https?:|mailto:|\/api\/|js\/|css\/|desk-terminal|\(https\?)/i.test(v)) continue;   // (https? = a regex that only lets https links through (newsChannelView)
      if (wrapped) continue;
      if (EXTERNAL_OK.some(s => line.includes(s))) continue;
      if (v === '' || v === '$') continue;                             // an attribute value split by the template
      out.push({ line: i + 1, v, text: line.trim().slice(0, 140) });
    }
    for (const m of sinks) {
      if (wrapped || EXTERNAL_OK.some(s => line.includes(s))) continue;
      if (/\.href\s*=\s*['"`]?#/.test(line) || /location\.hash/.test(line)) continue;
      out.push({ line: i + 1, v: m[0], text: line.trim().slice(0, 140) });
    }
  });
  return out;
}

test('GUARD: no raw link to a page outside the desk zone in desk-terminal.html or js/terminal/*.js', () => {
  const bad = [];
  for (const f of files) for (const b of scan(fs.readFileSync(path.join(ROOT, f), 'utf8'))) bad.push(`${f}:${b.line}  ${b.v}  | ${b.text}`);
  assert.deepEqual(bad, [], 'A viewer must never see a link to the main site. Use ownerLink(...) / ownerOnly(...) from js/terminal/links.js:\n  ' + bad.join('\n  '));
});

test('the guard catches what it should (self-test)', () => {
  assert.equal(scan('<a href="bank-credit.html">x</a>').length, 1);
  assert.equal(scan('`<a href="${esc(b.page)}">x</a>`').length, 1);
  assert.ok(scan('a.href = `oi-dashboard-v2.html#${x}`;').length >= 1);
  assert.equal(scan("window.open('research.html')").length, 1);
  assert.equal(scan("${ownerLink('bank-credit.html', 'x')}").length, 0);
  assert.equal(scan('<a href="#" data-x>').length, 0);
  assert.equal(scan('<a href="https://x.org">').length, 0);
  assert.equal(scan('<a class="btn" data-surface="nav.research" href="research.html">Research</a>').length, 0);
  assert.equal(scan('// <a href="x.html">').length, 0);
});

// ── sign out ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function fakeDoc() {
  const b = { style: {}, textContent: '', title: '', disabled: false, onclick: null };
  return { b, doc: { getElementById: id => (id === 'signout' ? b : null) } };
}

test('Sign out chip: shows the role, hidden when no passwords are set, owner clears all zones and a viewer only the desk', async () => {
  let { b, doc } = fakeDoc();
  wireSignout({ role: 'owner', auth: true }, doc);
  assert.equal(b.textContent, 'owner · Sign out');
  assert.match(b.title, /every login/);
  ({ b, doc } = fakeDoc());
  wireSignout({ role: 'viewer', auth: true }, doc);
  assert.equal(b.textContent, 'desk · Sign out');
  ({ b, doc } = fakeDoc());
  wireSignout({ role: 'owner', auth: false }, doc);
  assert.equal(b.style.display, 'none');

  // what the click asks for
  const calls = []; const realFetch = globalThis.fetch; const realLoc = globalThis.location;
  globalThis.fetch = async (u, o) => { calls.push([u, o?.method]); return { json: async () => ({ ok: true, redirect: '/login?zone=desk&next=%2Fdesk-terminal.html' }) }; };
  globalThis.location = { href: '' };
  try {
    for (const [role, zone] of [['owner', 'all'], ['viewer', 'desk']]) {
      ({ b, doc } = fakeDoc()); calls.length = 0; globalThis.location.href = '';
      wireSignout({ role, auth: true }, doc);
      await b.onclick();
      assert.deepEqual(calls, [[`/logout?zone=${zone}`, 'POST']], role);
      assert.equal(globalThis.location.href, '/login?zone=desk&next=%2Fdesk-terminal.html');
    }
    // a hostile redirect from the server is never followed; the GET route is the fallback
    globalThis.fetch = async () => ({ json: async () => ({ ok: true, redirect: 'https://evil.example/' }) });
    ({ b, doc } = fakeDoc()); wireSignout({ role: 'viewer', auth: true }, doc); await b.onclick();
    assert.equal(globalThis.location.href, '/logout?zone=desk');
  } finally { globalThis.fetch = realFetch; globalThis.location = realLoc; }
});

test('resolveSession carries auth; Sign out is a surface every session always sees and no switch can hide', () => {
  assert.equal(resolveSession({ ok: true, role: 'owner', auth: false }, { ok: true, role: 'owner', visible: [] }).auth, false);
  assert.equal(resolveSession({ ok: true, role: 'viewer', auth: true }, { ok: true, role: 'viewer', visible: [] }).auth, true);
  assert.equal(resolveSession(null, null).auth, true, 'unknown: keep the way out');
  assert.deepEqual(ALWAYS_VISIBLE_IDS, ['widget.signout']);
  assert.ok(SURFACE_IDS.includes('widget.signout'));
  assert.ok(visibleFor('viewer', { 'widget.signout': false }).includes('widget.signout'));
  assert.ok(visibleFor('viewer', null).includes('widget.signout'));
  assert.deepEqual(cleanSwitches({ 'widget.signout': false }), { ok: true, clean: {} });
  const html = fs.readFileSync(path.join(ROOT, 'desk-terminal.html'), 'utf8');
  assert.match(html, /<button id="signout"[^>]*data-surface="widget\.signout"/);
});
