// The desk sign-in page (js/deskLoginPage.js): the form contract, the escaping, the error state, and that the main and education pages are untouched.
//   node --test js/deskLoginPage.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { deskLoginPage } from './deskLoginPage.js';

const sha = s => crypto.createHash('sha256').update(s).digest('hex');

test('the form: a password field, remember box, submit, labelled, autofocus, current-password', () => {
  const h = deskLoginPage('/desk-terminal.html', false);
  assert.match(h, /<input type="password" id="pw"[^>]*autocomplete="current-password"[^>]*autofocus/);
  assert.match(h, /<label class="vh" for="pw">Password<\/label>/);
  assert.match(h, /<input type="checkbox" id="remember" checked>/);
  assert.match(h, /<button type="submit" class="go" id="go">/);
  assert.match(h, /aria-label="Show password"/);
});

test('the POST contract is the same as the other zones: zone desk, password, remember; next kept; error redirect', () => {
  const h = deskLoginPage('/desk-terminal.html?tab=macro', false);
  assert.match(h, /fetch\('\/login', \{ method: 'POST'/);
  assert.match(h, /zone: 'desk', password: pw\.value, remember: document\.getElementById\('remember'\)\.checked/);
  assert.ok(h.includes('location.href = "/desk-terminal.html?tab=macro"'), 'next is preserved on success');
  assert.ok(h.includes("'/login?zone=desk&next=' + encodeURIComponent(\"/desk-terminal.html?tab=macro\") + '&error=1'"), 'next is preserved on failure');
});

test('a crafted next can never close the script tag', () => {
  const h = deskLoginPage('/x</script><script>alert(1)</script>', false);
  assert.ok(!/<\/script><script>alert/.test(h));
  assert.ok(h.includes('\\u003c/script\\u003e'));
});

test('the error state shows only when asked, and says what happened without apologising', () => {
  assert.ok(!deskLoginPage('/desk-terminal.html', false).includes("That password didn’t work"));
  const e = deskLoginPage('/desk-terminal.html', true);
  assert.ok(e.includes("That password didn’t work. Check it and try again."));
  assert.match(e, /role="alert"/);
  assert.match(e, /aria-invalid="true"/);
  assert.match(e, /classList\.add\('shake'\)/);
});

test('self-contained: the only hosts are the terminal\'s Google Fonts; motion respects reduced-motion; the educational line is there', () => {
  const h = deskLoginPage();
  const hosts = new Set([...h.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map(m => m[1].toLowerCase()));
  for (const host of hosts) assert.ok(['fonts.googleapis.com', 'www.w3.org'].includes(host), `unexpected host ${host}`);
  assert.match(h, /prefers-reduced-motion:reduce/);
  assert.ok(h.includes('Not investment advice and not a trade signal.'));
  assert.ok(h.includes('The desk\'s macro analysis. None of the advice.'));
});

test('server.js wires the desk zone to this page, and the main and education pages are byte-for-byte what they were', () => {
  const src = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /import \{ deskLoginPage as _deskLoginPage \} from '\.\/js\/deskLoginPage\.js';/);
  assert.match(src, /function authLoginPageDesk\(next, error\) \{ return _deskLoginPage\(next, error\); \}/);
  const a = src.indexOf('function authLoginPage(zone, next, error, brand) {'), b = src.indexOf("// The Desk Terminal's own sign-in");
  const c = src.indexOf('function authLoginPageEducation(next, error, brand) {'), d = src.indexOf('// ── Research Library access');
  assert.ok(a > 0 && b > a && c > b && d > c, 'markers found in order');
  // hashes of the two pages as they stood before this change (the main dispatcher + plain dashboard form; the Theory Lab / Library form)
  assert.equal(sha(src.slice(a, b)), '265fa1768dc150f06cbfaf6cce4d251b36c748811c975aba739c3ab71523f50a', 'main page changed');
  assert.equal(sha(src.slice(c, d)), '3c492483f334776881648a111681a0369d0a1125464ad1abaf1039df0ce2baea', 'education page changed');
});
