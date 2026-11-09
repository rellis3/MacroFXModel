import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const s = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('the library opens for the dashboard login or the Theory Lab OWNER login, not the shared Theory Lab password', () => {
  assert.match(s, /function _libAuthOk\(req\)[\s\S]{0,500}edu\.role === 'admin' \|\| LIBRARY_ALLOW_EDU/);
  assert.match(s, /LIBRARY_ALLOW_EDU = process\.env\.LIBRARY_ALLOW_EDUCATION_PASSWORD === '1'/);
});
test('the page and the API use the same rule; the temporary no-login window is gone', () => {
  assert.match(s, /const _libGate = \(req, res, next\) => \{\s*if \(!AUTH_ENABLED\) return next\(\);\s*if \(_libAuthOk\(req\)\) return next\(\);/);
  assert.ok(!/_LIB_OPEN_UNTIL|_libOpen\b/.test(s), 'the temporary open window was removed');
  assert.match(s, /if \(_isLibraryPagePath\(req\.path\)\) \{[\s\S]{0,200}_libAuthOk\(req\)\) return next\(\)/);
});
test('the landing page is the Theory Lab login restyled as Research Library, and keeps its brand on a wrong password', () => {
  assert.match(s, /redirect\(`\/login\?zone=education&brand=library&next=/);
  assert.match(s, /Research <em>Library<\/em>/);
  assert.match(s, /JSON\.stringify\(lib \? '&brand=library' : ''\)/);
});
test('the owner is told, not looped, when the shared password is used', () => {
  assert.match(s, /status\(403\)[\s\S]{0,900}This area is for the owner only/);
});
