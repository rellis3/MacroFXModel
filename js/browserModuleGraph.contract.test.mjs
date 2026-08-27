/**
 * Contract: no page's ES-module graph may reach a BARE import specifier.
 *
 * ## The failure this exists to catch
 *
 * `forecast-reversion.html` went completely dead — blank controls, no chart, no
 * error the page itself could show. The cause was three hops away:
 *
 *     forecast-reversion.html
 *       -> js/exhaustionLadderEngine.js   (imported for `dayTurns`)
 *            -> js/volEstimatorAB.js      (imported for `buildLondonDaily`)
 *                 -> js/sessionStats.js   (imported for `_londonParts`, 7 pure lines)
 *                      -> import fs from 'fs'
 *
 * A browser cannot resolve a bare specifier, and the failure is not local: the
 * WHOLE entry module is discarded before a single statement runs, so every handler
 * on the page silently never binds.
 *
 * What makes it worth a permanent test is that nothing else could catch it. Node
 * resolves `fs` happily, so the full suite stayed green while the page was dead;
 * `node --check` passes because the syntax is fine; the importing code looks
 * correct at every hop. The only signal was loading the page in a real browser.
 *
 * This walks each page's graph statically instead — cheap, no browser needed, and
 * it fails on the hop that introduces the specifier rather than on the symptom.
 *
 * A Node-only module is not a bug in itself. Importing one from a page is.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Pages known to be broken this exact way, NOT approved exceptions.
 *
 * volatility-classifier-standalone.html imports js/volBacktestM1Engine.js, which
 * needs `fs`, `hyparquet` and `@aws-sdk/client-s3` for its parquet/R2 loading. It
 * is dead in a browser today (verified: same "Failed to resolve module specifier
 * fs" error). It is listed rather than fixed because CLAUDE.md marks the v1 M1
 * engine read-only and in production — unpicking its Node dependencies is a real
 * piece of work, not a drive-by. Delete the entry when that page is fixed; do not
 * add to this list to make a new failure go away.
 */
const KNOWN_BROKEN = new Set(['volatility-classifier-standalone.html']);

const FROM_RE = /(?:^|\n)\s*(?:import|export)\s[^;\n]*?from\s*['"]([^'"]+)['"]/g;
const SIDE_RE = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;

function specifiers(src) {
  const out = [];
  for (const re of [FROM_RE, SIDE_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) out.push(m[1]);
  }
  return out;
}

// Depth-first through relative imports, collecting every bare specifier with the
// chain that reached it — the chain is the point, since the offending hop is never
// the file you were looking at.
function walkModule(file, seen, chain) {
  const bad = [];
  let src;
  try { src = fs.readFileSync(file, 'utf8'); } catch { return bad; }
  const here = [...chain, path.relative(ROOT, file).split(path.sep).join('/')];
  for (const spec of specifiers(src)) {
    const clean = spec.split('?')[0];              // strip the ?v= cache-busters pages use
    if (!clean.startsWith('.') && !clean.startsWith('/')) { bad.push({ spec: clean, chain: here }); continue; }
    const target = path.resolve(path.dirname(file), clean);
    if (seen.has(target) || !fs.existsSync(target)) continue;
    seen.add(target);
    bad.push(...walkModule(target, seen, here));
  }
  return bad;
}

function bareSpecifiersFor(page) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const seen = new Set();
  const bad = [];
  for (const m of html.matchAll(/<script[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/g)) {
    for (const spec of specifiers(m[1])) {
      const clean = spec.split('?')[0];
      if (!clean.startsWith('.') && !clean.startsWith('/')) { bad.push({ spec: clean, chain: [page] }); continue; }
      const target = path.resolve(ROOT, clean);
      if (seen.has(target) || !fs.existsSync(target)) continue;
      seen.add(target);
      bad.push(...walkModule(target, seen, [page]));
    }
  }
  return bad;
}

const PAGES = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));

test('no page reaches a bare import specifier', () => {
  assert.ok(PAGES.length > 100, `only found ${PAGES.length} pages — did ROOT resolve wrong?`);
  const broken = [];
  for (const page of PAGES) {
    if (KNOWN_BROKEN.has(page)) continue;
    for (const b of bareSpecifiersFor(page)) {
      broken.push(`${page}: bare "${b.spec}" via ${b.chain.join(' -> ')}`);
    }
  }
  assert.deepEqual(broken, [],
    'A page imports a module that reaches a bare specifier. The browser discards the '
    + 'ENTIRE entry module, so the page dies silently.\n  ' + broken.join('\n  '));
});

test('forecast-reversion.html specifically stays clean', () => {
  // Named separately because this is the page the bug shipped on, and because the
  // chain that broke it (exhaustionLadderEngine -> volEstimatorAB -> sessionStats)
  // is one any new research engine could re-introduce.
  assert.deepEqual(bareSpecifiersFor('forecast-reversion.html').map(b => b.spec), []);
});

test('the pure London clock stays free of environment imports', () => {
  // londonSession.js exists ONLY to be safe to import from a browser. If it ever
  // grows an fs/path/process dependency the extraction has been undone and the
  // graph test above starts failing for a much less obvious reason.
  const src = fs.readFileSync(path.join(ROOT, 'js', 'londonSession.js'), 'utf8');
  assert.deepEqual(specifiers(src), [], 'londonSession.js must import nothing');
  // Strip comments before the environment check — this file's own header DESCRIBES
  // the `process.env` dependency it was extracted away from, and matching prose
  // would fail on the documentation rather than on the code.
  const code = src.replace(/[/][*][\s\S]*?[*][/]/g, '').replace(/^\s*[/][/].*$/gm, '');
  assert.doesNotMatch(code, /process[.]/, 'londonSession.js must not read process');
  assert.doesNotMatch(code, /require\s*[(]/, 'londonSession.js must not use require()');
});

test('sessionStats still re-exports the moved names for its Node callers', () => {
  // Six modules import _londonParts/SESSIONS from sessionStats.js. Moving them
  // without the re-export would break every one of those at import time.
  const src = fs.readFileSync(path.join(ROOT, 'js', 'sessionStats.js'), 'utf8');
  assert.match(src, /export\s*\{[^}]*SESSIONS[^}]*\}/, 'sessionStats.js dropped the SESSIONS re-export');
  assert.match(src, /export\s*\{[^}]*_londonParts[^}]*\}/, 'sessionStats.js dropped the _londonParts re-export');
});

test('KNOWN_BROKEN lists only pages that really are broken', () => {
  // Stops the list becoming a dumping ground: an entry that no longer fails must be
  // removed, or the guard quietly stops covering that page forever.
  for (const page of KNOWN_BROKEN) {
    assert.ok(fs.existsSync(path.join(ROOT, page)), `KNOWN_BROKEN lists a page that no longer exists: ${page}`);
    assert.ok(bareSpecifiersFor(page).length > 0,
      `${page} is in KNOWN_BROKEN but is now clean — delete the entry so it is guarded again.`);
  }
});
