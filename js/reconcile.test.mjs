/**
 * Reconciliation tests — the same-constant gate.
 *
 * Every pip/digits table in the tree must return the IDENTICAL value for every
 * instrument. This is the cheapest, most decisive check in the repo: a single
 * wrong pip (0.0001 vs 0.001) silently scales PnL by 10x, and the tables have
 * drifted before (see js/instrumentRegistry.js's own header, DATA_RECONCILIATION.md).
 *
 * Canonical = js/instrumentRegistry.js, which is verified here against
 * pylego/instruments.json. Every other table is compared to it.
 *
 * Run:  node --test js/reconcile.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(ROOT, p), 'utf8');

// ── Canonical: the JS registry ───────────────────────────────────────────────
const { instrument, INSTRUMENT_KEYS } = await import('./instrumentRegistry.js');

/** Every canonical record, keyed by display symbol ('XAU/USD', 'EUR/USD', …). */
function canonical() {
  const out = {};
  for (const key of INSTRUMENT_KEYS ?? []) {
    const rec = instrument(key);
    if (rec) out[rec.display] = { pip: rec.pip, digits: rec.digits };
  }
  return out;
}

/**
 * Pull a `{ 'EUR/USD': 0.0001, … }` object literal out of a source file by the
 * name it is assigned to. Deliberately textual: these tables are the thing under
 * test, so importing them would let a table define its own correctness.
 */
function literalTable(src, name) {
  const at = src.indexOf(name);
  if (at < 0) return null;
  const open = src.indexOf('{', at);
  const close = src.indexOf('};', open);
  if (open < 0 || close < 0) return null;
  const out = {};
  for (const m of src.slice(open, close).matchAll(/'([A-Z]{3}\/[A-Z]{3}|[A-Z0-9]+_[A-Z]{3})':\s*([\d.]+)/g)) {
    out[m[1]] = Number(m[2]);
  }
  return Object.keys(out).length ? out : null;
}

/** Report every disagreement at once — one assert per table, not per symbol. */
function diff(label, actual, expectedFor) {
  const bad = [];
  for (const [sym, val] of Object.entries(actual)) {
    const want = expectedFor(sym);
    if (want == null) continue;                 // symbol the canonical table doesn't carry
    if (Math.abs(val - want) > 1e-12) bad.push(`  ${sym}: ${label}=${val}  canonical=${want}`);
  }
  return bad;
}

// ── 1. The two canonical tables must agree with each other ───────────────────
test('pylego/instruments.json agrees with js/instrumentRegistry.js', () => {
  const py = JSON.parse(read('pylego/instruments.json')).instruments;
  const canon = canonical();
  const bad = [];
  for (const [key, rec] of Object.entries(py)) {
    const js = canon[rec.display];
    if (!js) { bad.push(`  ${key} (${rec.display}): missing from the JS registry`); continue; }
    if (Math.abs(Number(rec.pip) - js.pip) > 1e-12)
      bad.push(`  ${rec.display}: pylego pip=${rec.pip}  registry pip=${js.pip}`);
    if (Number(rec.digits) !== js.digits)
      bad.push(`  ${rec.display}: pylego digits=${rec.digits}  registry digits=${js.digits}`);
  }
  assert.equal(bad.length, 0, `\nThe two canonical instrument tables have drifted:\n${bad.join('\n')}\n`);
});

// ── 2. js/utils.js getPipSize must match the registry ────────────────────────
test('js/utils.js getPipSize matches the canonical registry', async () => {
  const { getPipSize } = await import('./utils.js');
  const canon = canonical();
  const bad = diff('utils.getPipSize',
    Object.fromEntries(Object.keys(canon).map(s => [s, getPipSize(s)])),
    s => canon[s]?.pip);
  assert.equal(bad.length, 0,
    `\njs/utils.js has its own pip table and it has drifted:\n${bad.join('\n')}\n` +
    `Fix: import pipSize from './instrumentRegistry.js' instead of the private branches.\n`);
});

// ── 3. server.js PIP_SIZE must match the registry ────────────────────────────
test('server.js PIP_SIZE matches the canonical registry', () => {
  const tbl = literalTable(read('server.js'), 'const PIP_SIZE');
  assert.ok(tbl, 'could not locate `const PIP_SIZE` in server.js');
  const canon = canonical();
  const bad = diff('server.PIP_SIZE', tbl, s => canon[s]?.pip);
  assert.equal(bad.length, 0, `\nserver.js PIP_SIZE has drifted:\n${bad.join('\n')}\n`);
});

// ── 4. levels.js must not re-declare a pip table ─────────────────────────────
// levels.js is the SERVER writer of ai_entries_{SYM}. It used to branch on the
// symbol and return 0.1 for gold; it now delegates to the registry. Assert the
// delegation rather than the value, so a re-inlined table fails here immediately.
test('levels.js delegates pip sizing to the canonical registry', () => {
  const src = read('levels.js');
  assert.match(src, /from '\.\/js\/instrumentRegistry\.js'/,
    'levels.js no longer imports the canonical registry');
  const reinlined = /function getPipSize\(sym\)\s*\{[^}]*return\s+0\.\d/s.exec(src);
  assert.equal(reinlined, null,
    `levels.js has re-inlined a private pip table:
${reinlined?.[0]}
Import pipSize from js/instrumentRegistry.js instead.`);
});

// ── 4b. BEHAVIOUR INVARIANT — the effective clustering distance ──────────────
// The pip never travels alone: levels.js computes `normalDist = confluencePips × pipSize`,
// and the pip-denominated constant was tuned against the pip currently in the file. Gold
// clusters at $20 (20 × $1 canonical, previously 200 × 0.1). Whichever way the pip is
// represented, THIS number
// must not move — it is the live bot's actual behaviour, as opposed to its labelling.
//
// If you are deliberately retuning the window, change the expectation here in the same commit
// so the change is visible in the diff rather than emergent from a units fix.
const EFFECTIVE_CLUSTER_DISTANCE = {
  'XAU/USD':    20,      // dollars
  'NAS100_USD': 100,     // index points
  'EUR/USD':    0.0002,  // price
};

test('levels.js effective clustering distance is unchanged by any pip fix', () => {
  const src = read('levels.js');
  const canon = canonical();                       // levels.js now delegates its pip here
  const pipOf = sym => canon[sym]?.pip ?? null;
  const defaults = literalCaps(src);
  const bad = [];
  for (const [sym, want] of Object.entries(EFFECTIVE_CLUSTER_DISTANCE)) {
    const pip  = pipOf(sym);
    const pips = defaults[sym];
    if (pip == null || pips == null) { bad.push(`  ${sym}: could not read pip/confluencePips from levels.js`); continue; }
    const got = pips * pip;
    if (Math.abs(got - want) > 1e-9)
      bad.push(`  ${sym}: ${pips} confluencePips × ${pip} pip = ${got}, expected ${want}`);
  }
  assert.equal(bad.length, 0,
    `\nThe live clustering distance CHANGED — this is a behaviour change, not a units fix:\n${bad.join('\n')}\n` +
    `If deliberate, update EFFECTIVE_CLUSTER_DISTANCE in this file in the same commit.\n`);
});

/** levels.js CAP_DEFAULTS_SERVER: { fx: {confluencePips: 2}, gold: {…200}, nas100: {…100} }. */
function literalCaps(src) {
  const map = { fx: 'EUR/USD', gold: 'XAU/USD', nas100: 'NAS100_USD' };
  const out = {};
  for (const [bucket, sym] of Object.entries(map)) {
    const m = src.match(new RegExp(`${bucket}:\\s*\\{[^}]*confluencePips:\\s*([\\d.]+)`));
    if (m) out[sym] = Number(m[1]);
  }
  return out;
}

// ── 5. today.html _pipSz must match the registry ─────────────────────────────
test('today.html _pipSz matches the canonical registry', () => {
  const src = read('today.html');
  const m = src.match(/const _pipSz\s*=\s*d\s*=>([^\n;]+)/);
  assert.ok(m, 'could not locate `const _pipSz` in today.html');
  const expr = m[1];
  const canon = canonical();
  const bad = [];
  // _pipSz(d) branches on d.sym / d.ac — evaluate it against synthetic records.
  const pipSz = new Function('d', `return ${expr};`);
  const cases = [
    ['USD/JPY', { sym: 'USD/JPY',    ac: 'fx' }],
    ['EUR/USD', { sym: 'EUR/USD',    ac: 'fx' }],
    ['XAU/USD', { sym: 'XAU/USD',    ac: 'commodity' }],
    ['NAS100_USD', { sym: 'NAS100_USD', ac: 'index' }],
  ];
  for (const [display, d] of cases) {
    const want = canon[display]?.pip;
    const got = pipSz(d);
    if (want != null && Math.abs(got - want) > 1e-12)
      bad.push(`  ${display}: today.html=${got}  canonical=${want}`);
  }
  assert.equal(bad.length, 0, `\ntoday.html _pipSz has drifted:\n${bad.join('\n')}\n`);
});
