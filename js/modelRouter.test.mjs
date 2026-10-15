import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROVIDERS, DEFAULT_MODELS, TASK_CLASS, buildRequest, authHeaders, readResponse,
  resolveTask, costOf, configFromEnv, estimateTokens, carriesLedger,
} from './modelRouter.js';

test('an Anthropic request with no standing content is shaped exactly as before', () => {
  // The refactor must be invisible when nothing changes. A plain-string system and a
  // single user message is what all sixteen call sites sent by hand.
  const r = buildRequest({ provider: 'anthropic', model: 'claude-opus-5',
    system: 'Respond with JSON only.', prompt: 'the snapshot', maxTokens: 4000 });
  assert.equal(r.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(r.body.system, 'Respond with JSON only.', 'a bare system must stay a string');
  assert.deepEqual(r.body.messages, [{ role: 'user', content: 'the snapshot' }]);
  assert.equal(r.body.max_tokens, 4000);
  assert.equal(r.headers['anthropic-version'], '2023-06-01');
  assert.ok(!('temperature' in r.body), 'no temperature unless asked for');
});

test('standing content becomes a cached system block, and only on Anthropic', () => {
  const a = buildRequest({ provider: 'anthropic', model: 'm', standing: 'THE LEDGER',
    system: 'JSON only.', prompt: 'today', maxTokens: 100 });
  assert.ok(Array.isArray(a.body.system));
  assert.equal(a.body.system[0].text, 'THE LEDGER');
  assert.deepEqual(a.body.system[0].cache_control, { type: 'ephemeral' });
  assert.equal(a.body.system[1].text, 'JSON only.');
  assert.ok(!a.body.system[1].cache_control, 'only the stable prefix is the breakpoint');

  // DeepSeek caches automatically; sending a breakpoint would be meaningless
  const d = buildRequest({ provider: 'deepseek', model: 'm', standing: 'THE LEDGER',
    system: 'JSON only.', prompt: 'today', maxTokens: 100 });
  assert.equal(d.body.messages[0].role, 'system');
  assert.equal(d.body.messages[0].content, 'THE LEDGER\n\nJSON only.');
  assert.equal(JSON.stringify(d.body).includes('cache_control'), false);
});

test('the standing block leads, because a cache only hits on a stable prefix', () => {
  const r = buildRequest({ provider: 'anthropic', model: 'm', standing: 'LEDGER',
    system: 'rules', prompt: "today's volatile snapshot", maxTokens: 100 });
  assert.equal(r.body.system[0].text, 'LEDGER', 'the unchanging half must come first');
  // and the volatile half must NOT be inside the cached block
  assert.ok(!JSON.stringify(r.body.system).includes('volatile'));
});

test('cache can be turned off without changing anything else', () => {
  const r = buildRequest({ provider: 'anthropic', model: 'm', standing: 'LEDGER',
    system: 'rules', prompt: 'p', maxTokens: 100, cache: false });
  assert.equal(r.body.system[0].text, 'LEDGER');
  assert.ok(!r.body.system[0].cache_control);
});

test('output is clamped to the provider cap instead of truncating mid-JSON', () => {
  // ten call sites ask for 16000; DeepSeek caps at 8192 and does not error, it truncates
  const d = buildRequest({ provider: 'deepseek', model: 'deepseek-chat', prompt: 'p', maxTokens: 16000 });
  assert.equal(d.body.max_tokens, 8192);
  assert.equal(d.clamped, true, 'the caller has to be able to see that it was clamped');
  const a = buildRequest({ provider: 'anthropic', model: 'claude-opus-5', prompt: 'p', maxTokens: 16000 });
  assert.equal(a.body.max_tokens, 16000);
  assert.equal(a.clamped, false);
  // an explicit override wins over the default cap
  const o = buildRequest({ provider: 'deepseek', model: 'x', prompt: 'p', maxTokens: 16000, maxOutput: 20000 });
  assert.equal(o.body.max_tokens, 16000);
});

test('the key goes where each provider wants it, and never into the body', () => {
  const a = buildRequest({ provider: 'anthropic', model: 'm', prompt: 'p' });
  assert.equal(authHeaders(a, 'sk-ant-xyz')['x-api-key'], 'sk-ant-xyz');
  const d = buildRequest({ provider: 'deepseek', model: 'm', prompt: 'p' });
  assert.equal(authHeaders(d, 'sk-ds-xyz').Authorization, 'Bearer sk-ds-xyz');
  assert.ok(!JSON.stringify(a.body).includes('sk-ant'));
  assert.throws(() => authHeaders(a, ''), /no API key/);
});

test('the reply is found by TYPE, so a thinking block first does not return empty', () => {
  // the bug this codebase already paid for once
  const r = readResponse('anthropic', {
    content: [{ type: 'thinking', thinking: 'hmm' }, { type: 'text', text: '{"ok":true}' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 1200, output_tokens: 90, cache_read_input_tokens: 34000 },
  });
  assert.equal(r.text, '{"ok":true}');
  assert.equal(r.truncated, false);
  assert.equal(r.usage.cacheRead, 34000);
});

test('truncation is reported on both wire formats, because retries depend on it', () => {
  assert.equal(readResponse('anthropic', { content: [{ type: 'text', text: '{' }], stop_reason: 'max_tokens' }).truncated, true);
  assert.equal(readResponse('deepseek', { choices: [{ message: { content: '{' }, finish_reason: 'length' }] }).truncated, true);
  assert.equal(readResponse('deepseek', { choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] }).truncated, false);
});

test('an OpenAI-shaped reply and its automatic cache hit are read', () => {
  const r = readResponse('deepseek', {
    choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 40000, completion_tokens: 120, prompt_cache_hit_tokens: 34000 },
  });
  assert.equal(r.text, 'hello');
  assert.equal(r.usage.in, 40000);
  assert.equal(r.usage.cacheRead, 34000);
});

test('a garbled or empty reply returns empty text rather than throwing', () => {
  for (const d of [null, {}, { content: [] }, { content: [{ type: 'thinking' }] }, { choices: [] }]) {
    assert.doesNotThrow(() => readResponse('anthropic', d));
    assert.doesNotThrow(() => readResponse('deepseek', d));
  }
  assert.equal(readResponse('anthropic', { content: [{ type: 'thinking', thinking: 'x' }] }).text, '');
});

test('routing falls back to a provider that actually has a key', () => {
  const cfg = { provider: 'anthropic', keys: { anthropic: true, deepseek: false, moonshot: false },
                tasks: { headlines: 'deepseek' } };
  const r = resolveTask('headlines', cfg);
  assert.equal(r.provider, 'anthropic', 'a missing key must make it dearer, not broken');
  assert.equal(r.fellBack, true);
  assert.match(r.why, /no key configured/);

  const withKey = resolveTask('headlines', { ...cfg, keys: { anthropic: true, deepseek: true } });
  assert.equal(withKey.provider, 'deepseek');
  assert.equal(withKey.model, DEFAULT_MODELS.deepseek.id);
  assert.equal(withKey.fellBack, false);
});

test('a per-task choice beats the global default', () => {
  const cfg = { provider: 'deepseek', keys: { anthropic: true, deepseek: true },
                tasks: { brief: 'anthropic' } };
  assert.equal(resolveTask('brief', cfg).provider, 'anthropic');
  assert.equal(resolveTask('headlines', cfg).provider, 'deepseek');
});

test('model ids and caps are overridable, because vendors rename faster than this file', () => {
  const cfg = { provider: 'deepseek', keys: { deepseek: true },
                models: { deepseek: { id: 'deepseek-v9', maxOutput: 12345 } } };
  const r = resolveTask('misc', cfg);
  assert.equal(r.model, 'deepseek-v9');
  assert.equal(r.maxOutput, 12345);
});

test('config reads the environment and NEVER returns a key', () => {
  const cfg = configFromEnv({
    ANT_KEY: 'sk-ant-secret', DEEPSEEK_KEY: 'sk-ds-secret',
    AI_PROVIDER: 'anthropic', AI_TASK_HEADLINES: 'deepseek',
    MODEL_DEEPSEEK_ID: 'deepseek-chat-v4', PRICE_DEEPSEEK_IN: '0.27', PRICE_DEEPSEEK_OUT: '1.10',
  });
  const blob = JSON.stringify(cfg);
  assert.ok(!blob.includes('secret'), 'a config object gets logged and served; it must carry no key');
  assert.deepEqual(cfg.keys, { anthropic: true, deepseek: true, moonshot: false });
  assert.equal(cfg.tasks.headlines, 'deepseek');
  assert.equal(cfg.models.deepseek.id, 'deepseek-chat-v4');
  assert.equal(cfg.prices.deepseek.in, 0.27);
  assert.equal(cfg.cache, true);
  assert.equal(configFromEnv({ AI_CACHE: '0' }).cache, false);
  assert.equal(configFromEnv({ AI_PROVIDER: 'nonsense' }).provider, 'anthropic');
});

test('cost reports tokens always and money only when a price was configured', () => {
  const usage = { in: 40000, out: 1000, cacheRead: 34000, cacheWrite: 0 };
  const noPrice = costOf('anthropic', usage, {});
  assert.equal(noPrice.usd, null);
  assert.equal(noPrice.priced, false);
  assert.equal(noPrice.in, 40000, 'tokens are known, so they are always reported');

  const priced = costOf('anthropic', usage, { anthropic: { in: 15, out: 75, cacheRead: 1.5 } });
  assert.equal(priced.priced, true);
  // 6000 fresh in @15 + 1000 out @75 + 34000 cached @1.5 = 0.09 + 0.075 + 0.051
  assert.ok(Math.abs(priced.usd - (40000 / 1e6 * 15 + 1000 / 1e6 * 75 + 34000 / 1e6 * 1.5)) < 1e-6);
});

test('the ledger-carrying tasks are known, since those are the ones to be careful with', () => {
  assert.equal(carriesLedger('brief'), true);
  assert.equal(carriesLedger('chain'), true);
  assert.equal(carriesLedger('eod-review'), true);
  assert.equal(carriesLedger('headlines'), false);
  assert.equal(carriesLedger('nonsense'), false);
  // every task must declare itself, or it silently defaults to "safe to run cheap"
  for (const [id, t] of Object.entries(TASK_CLASS)) {
    assert.ok('ledger' in t, `${id} must say whether it carries the ledger`);
    assert.ok(t.label, `${id} needs a human label for the config screen`);
  }
});

test('every provider declares a key env var and a wire format', () => {
  for (const [name, P] of Object.entries(PROVIDERS)) {
    assert.ok(P.keyEnv, `${name} needs a key env name`);
    assert.ok(['anthropic', 'openai'].includes(P.wire), `${name} has an unknown wire format`);
    assert.ok(P.url.startsWith('https://'), `${name} must be https`);
    assert.ok(DEFAULT_MODELS[name], `${name} needs a default model`);
  }
});

test('an unknown provider fails loudly instead of silently calling the wrong one', () => {
  assert.throws(() => buildRequest({ provider: 'gpt-9', prompt: 'p' }), /unknown provider/);
  assert.throws(() => readResponse('gpt-9', {}), /unknown provider/);
});

test('token estimate is rough but monotonic', () => {
  assert.equal(estimateTokens(''), 0);
  assert.ok(estimateTokens('a'.repeat(4000)) > estimateTokens('a'.repeat(400)));
  assert.equal(estimateTokens(null), 0);
});
