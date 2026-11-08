// The owner's routing (Bot Config > AI models, KV ai_routing_v1) must be in force after a deploy without anyone opening
// the page. Until 2026-11-08 it was read only by GET/POST /api/ai-config, so after each deploy every job set to DeepSeek
// ran on the Anthropic default (Opus 5) until the page was opened.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('the routing is loaded at boot', () => {
  assert.match(src, /^_loadAiOverride\(\)\.catch\(/m);
});

test('callModel re-reads the routing when it is more than a minute old', () => {
  const body = src.match(/async function callModel\([^)]*\) \{\n([\s\S]*?)\n  const cfg = _aiConfig\(\);/);
  assert.ok(body && /_aiOverride\.at > 60_000\) await _loadAiOverride\(\)/.test(body[1]));
});

test('a failed read keeps the last good routing', () => {
  const fn = src.match(/async function _loadAiOverride\(\) \{([\s\S]*?)\n\}/);
  assert.ok(fn, '_loadAiOverride not found');
  assert.match(fn[1], /kv\.getStrict\(_AI_ROUTING_KV\)/);            // a backend failure throws instead of reading as "none saved"
  assert.match(fn[1], /catch \{ _aiOverride = \{ \.\.\._aiOverride/); // and the catch keeps what was there
});
