// What /logout clears and where it goes (js/deskLogout.js), and that server.js wires it to the right cookies.
//   node --test js/deskLogout.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { logoutPlan, clearCookieHeader, sameSiteOk, DESK_LOGIN, MAIN_LOGIN_FOR_TERMINAL, ZONES, COOKIE_PREFIX } from './deskLogout.js';

test('desk viewer: clears the desk cookie only and goes back to the desk login', () => {
  assert.deepEqual(logoutPlan({ zone: 'desk', deskEnabled: true }), { clear: ['desk'], redirect: DESK_LOGIN });
  assert.equal(DESK_LOGIN, '/login?zone=desk&next=%2Fdesk-terminal.html');
});

test('owner: all clears main + desk + education; the next visit shows a login', () => {
  const on = logoutPlan({ zone: 'all', deskEnabled: true });
  assert.deepEqual([...on.clear].sort(), [...ZONES].sort());
  assert.equal(on.redirect, DESK_LOGIN, 'desk login enabled: the owner lands on it, to try the desk password');
  const off = logoutPlan({ zone: 'all', deskEnabled: false });
  assert.equal(off.redirect, MAIN_LOGIN_FOR_TERMINAL, 'desk login disabled: the main login, with the terminal as next');
});

test('the older zones behave as before', () => {
  assert.deepEqual(logoutPlan({ zone: 'library' }), { clear: ['education', 'main'], redirect: '/library.html' });
  assert.deepEqual(logoutPlan({ zone: 'education' }), { clear: ['education'], redirect: '/theory-lab/' });
  assert.deepEqual(logoutPlan({ zone: 'education', next: '/library.html' }), { clear: ['education'], redirect: '/library.html' });
  assert.deepEqual(logoutPlan({ zone: 'main' }), { clear: ['main'], redirect: '/' });
  assert.deepEqual(logoutPlan({}), { clear: ['main'], redirect: '/' });
  assert.deepEqual(logoutPlan({ zone: 'nonsense' }), { clear: ['main'], redirect: '/' });
});

test('no open redirect: next is honoured only for the library return link', () => {
  for (const next of ['https://evil.example/', '//evil.example', '/\evil.example', '/admin', 'javascript:alert(1)', '/desk-terminal.html', '/library.html.evil']) {
    for (const zone of ['main', 'education', 'desk', 'all']) {
      const r = logoutPlan({ zone, next, deskEnabled: true }).redirect;
      assert.ok(['/', '/theory-lab/', DESK_LOGIN, MAIN_LOGIN_FOR_TERMINAL].includes(r), `${zone} + next ${next} -> ${r}`);
    }
  }
  assert.equal(logoutPlan({ zone: 'main', next: '/library' }).redirect, '/library');
});

test('the cleared cookie has the same attributes the login sets, and is expired', () => {
  const c = clearCookieHeader('desk', false);
  assert.equal(c, `${COOKIE_PREFIX}_desk=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  assert.equal(clearCookieHeader('main', true), `${COOKIE_PREFIX}_main=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`);
  // server.js sets the login cookie with exactly these attributes (Path=/; HttpOnly; SameSite=Lax[; Secure]): keep the two in step
  const src = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(src, /Path=\/; HttpOnly; SameSite=Lax\$\{req\.secure \? '; Secure' : ''\}`\);/);
});

test('cross-site sign-out is refused; same-site, curl and old clients pass', () => {
  assert.equal(sameSiteOk({ secFetchSite: 'cross-site', host: 'a.com' }), false);
  assert.equal(sameSiteOk({ secFetchSite: 'same-origin', origin: 'https://a.com', host: 'a.com' }), true);
  assert.equal(sameSiteOk({ secFetchSite: 'none' }), true);
  assert.equal(sameSiteOk({}), true);
  assert.equal(sameSiteOk({ origin: 'https://evil.example', host: 'a.com' }), false);
  assert.equal(sameSiteOk({ origin: 'null', host: 'a.com' }), true);
});

test('server.js: /logout (GET and POST) goes through the plan, and desk-session says whether auth is on', () => {
  const src = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(src, /app\.get\('\/logout', \(req, res\) => _logoutDo\(req, res, req\.query, false\)\);/);
  assert.match(src, /app\.post\('\/logout', \(req, res\) => _logoutDo\(req, res, req\.query, true\)\);/);
  assert.match(src, /_logoutPlan\(\{ zone: q\.zone, next: q\.next, deskEnabled: DESK_ENABLED \}\)/);
  assert.match(src, /deskLogin: DESK_ENABLED, auth: AUTH_ENABLED/);
  // /logout must stay public: it is registered before the site gate
  assert.ok(src.indexOf("app.post('/logout'") < src.indexOf('app.use(requireAuth);'), '/logout is registered after requireAuth: a signed-out visitor could not reach it');
});
