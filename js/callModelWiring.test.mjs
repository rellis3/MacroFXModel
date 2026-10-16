/**
 * Static check on how server.js uses callModel().
 *
 * WHY THIS EXISTS. Sixteen hand-written `fetch(...)` calls were converted to callModel()
 * by a script, and the script walked forward from each call removing the response
 * plumbing that no longer applied -- `if (!antRes.ok)`, `await antRes.json()`. It stopped
 * at the first line it did not recognise, and a BLANK LINE is a line it did not
 * recognise. Two sites had one, so their plumbing survived:
 *
 *     const antRes = await callModel({ task: 'pair', ... });
 *                                                      <- the gap that ended the cleanup
 *     if (!antRes.ok) { ... }            <- never fires: the shim sets ok: true
 *     const antData = await antRes.json();   <- "antRes.json is not a function"
 *
 * It reached production and broke the per-pair analysis on every card. Nothing caught it
 * because it is a runtime error on a paid, click-only path: no test exercises it, and the
 * one smoke call that was made went through a different endpoint.
 *
 * callModel returns a plain object, not a fetch Response. It throws on a provider error
 * (with `.status` set) rather than handing back something to inspect. So any `.json()`,
 * `.text()` or `.ok` on its result is dead code at best and a crash at worst, and that is
 * a thing a parser can see without spending a penny.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const LINES = SRC.split('\n');

/** Every `const X = await callModel(` with the line it sits on. */
function callModelVars() {
  const out = [];
  LINES.forEach((ln, i) => {
    const m = ln.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+callModel\s*\(/);
    if (m) out.push({ name: m[1], line: i + 1 });
  });
  return out;
}

test('server.js actually calls callModel', () => {
  const vars = callModelVars();
  assert.ok(vars.length >= 10, `only ${vars.length} callModel assignments found — did the wiring get reverted?`);
});

test('no callModel result is treated as a fetch Response', () => {
  const bad = [];
  for (const { name, line } of callModelVars()) {
    // look ahead over the whole handler, not just the next line: the bug that shipped was
    // separated from the call by a blank line, and the next one might be further still.
    const window = LINES.slice(line, line + 40).join('\n');
    for (const pat of [
      [`await ${name}.json()`, '.json() on a plain object'],
      [`${name}.json()`, '.json() on a plain object'],
      [`await ${name}.text()`, '.text() on a plain object'],
      [`${name}.text()`, '.text() on a plain object'],
      [`!${name}.ok`, '.ok is always true — callModel throws instead'],
    ]) {
      if (window.includes(pat[0])) bad.push(`line ${line}: ${name} — ${pat[1]} (${pat[0]})`);
    }
  }
  assert.deepEqual([...new Set(bad)], [],
    'callModel returns a plain object and throws on failure; these treat it as a Response');
});

test('every callModel call names a task the router knows', async () => {
  const { TASK_CLASS } = await import('./modelRouter.js');
  const used = [...SRC.matchAll(/callModel\(\{\s*task:\s*'([a-z-]+)'/g)].map(m => m[1]);
  assert.ok(used.length >= 10, `only ${used.length} tasks named`);
  const unknown = [...new Set(used)].filter(t => !TASK_CLASS[t]);
  assert.deepEqual(unknown, [],
    'a task missing from TASK_CLASS silently routes as "misc" and vanishes from the config screen');
});

test('the ledger-carrying calls pass the ledger as `standing`, or it cannot be cached', () => {
  // `standing` is what makes the ~34k-token ledger a stable cacheable prefix. A task
  // declared as ledger-carrying that glues it into `prompt` instead gets no cache hit
  // ever, silently — the symptom is a cache hit rate that stays at zero.
  // The window has to clear the explanatory comment that sits between the task name and
  // the argument; 400 was too tight and reported a false failure on the chain read.
  const withStanding = [...SRC.matchAll(/callModel\(\{\s*task:\s*'([a-z-]+)'[\s\S]{0,900}?standing:/g)].map(m => m[1]);
  assert.ok(withStanding.includes('brief'), 'the morning brief must pass the ledger as standing');
  assert.ok(withStanding.includes('chain'), 'the chain read must pass the ledger as standing');
});

test('no raw provider call survives anywhere in server.js', () => {
  for (const host of ['api.anthropic.com', 'api.deepseek.com', 'api.moonshot.ai']) {
    const hits = SRC.split(host).length - 1;
    // the models-listing endpoint reaches providers through PROVIDERS[].modelsUrl, not a
    // literal, so any literal host here is a call that escaped the router
    assert.equal(hits, 0, `${host} appears ${hits}× in server.js — that call bypasses callModel`);
  }
});

test('no endpoint gates on ANT_KEY specifically any more', () => {
  // These were the last place Anthropic was hardcoded. With a key set they are harmless,
  // which is exactly why nine of them survived the conversion unnoticed -- and why the
  // per-pair analysis would have 503'd on a DeepSeek-only setup while DeepSeek sat there
  // configured and working. callModel resolves the provider for the task and throws if
  // THAT one has no key, so asking about Anthropic is asking the wrong question.
  const code = LINES
    .map(l => l.replace(/\/\/.*$/, ''))          // the fix's own comments mention it
    .join('\n');
  const hits = [...code.matchAll(/process\.env\.ANT_KEY/g)].length;
  assert.equal(hits, 1,
    `process.env.ANT_KEY appears ${hits}× in live code; only the env audit should name it`);
});
