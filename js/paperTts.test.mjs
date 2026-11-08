import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMp3, providers, getProvider, TtsError, id3Length, stripId3, DEFAULT_VOICE } from './paperTts.js';

// Every test uses a mocked provider: no network, no TTS service is called.
const id3 = (payload) => {
  const size = payload.length;
  const hdr = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, (size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f]);
  return Buffer.concat([hdr, payload]);
};
const frames = (tag) => Buffer.concat([Buffer.from([0xff, 0xf3]), Buffer.from(tag)]);

const mock = (fn) => ({ name: 'mock', defaultVoice: 'v', calls: [], async synthesize(text, o) { this.calls.push({ text, o }); return fn(text, o, this.calls.length); } });

test('id3 detection and stripping', () => {
  const tag = id3(Buffer.alloc(40, 1));
  assert.equal(id3Length(tag), 50);
  assert.equal(id3Length(frames('x')), 0);
  assert.equal(id3Length(Buffer.from('ID3')), 0);
  assert.deepEqual(stripId3(Buffer.concat([tag, frames('abc')])), frames('abc'));
  assert.equal(id3Length(null), 0);
});

test('chunks are synthesised sequentially, in order, and the mp3s concatenate (ID3 stripped after the first)', async () => {
  let active = 0; let maxActive = 0;
  const p = mock(async (text) => {
    active++; maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    return Buffer.concat([id3(Buffer.alloc(12, 7)), frames(text)]);
  });
  const progress = [];
  const out = await makeMp3(['one', 'two', 'three'], p, { onProgress: (d, t) => progress.push([d, t]) });
  assert.equal(maxActive, 1, 'sequential');
  assert.deepEqual(p.calls.map((c) => c.text), ['one', 'two', 'three']);
  assert.equal(p.calls[0].o.voice, 'v');
  const first = Buffer.concat([id3(Buffer.alloc(12, 7)), frames('one')]);
  assert.deepEqual(out, Buffer.concat([first, frames('two'), frames('three')]));
  assert.deepEqual(progress, [[1, 3], [2, 3], [3, 3]]);
});

test('a failing chunk is retried, then succeeds', async () => {
  const p = mock((text, o, n) => { if (n < 3) throw new Error('flaky'); return frames(text); });
  const out = await makeMp3(['a'], p, { retries: 2, retryDelayMs: 1 });
  assert.deepEqual(out, frames('a'));
  assert.equal(p.calls.length, 3);
});

test('retries are exhausted: a clear TtsError that names the chunk', async () => {
  const p = mock(() => { throw new Error('endpoint changed'); });
  await assert.rejects(makeMp3(['a', 'b'], p, { retries: 1, retryDelayMs: 1 }), (e) => {
    assert.ok(e instanceof TtsError);
    assert.equal(e.code, 'provider_error');
    assert.match(e.message, /chunk 1 of 2 failed: endpoint changed/);
    return true;
  });
  assert.equal(p.calls.length, 2);
});

test('a hanging provider times out instead of hanging', async () => {
  const p = mock(() => new Promise(() => {}));
  const t0 = Date.now();
  await assert.rejects(makeMp3(['a'], p, { retries: 0, timeoutMs: 40 }), (e) => e instanceof TtsError && e.code === 'timeout');
  assert.ok(Date.now() - t0 < 3000);
});

test('empty provider output and empty input are errors', async () => {
  await assert.rejects(makeMp3(['a'], mock(() => Buffer.alloc(0)), { retries: 0 }), (e) => e.code === 'no_audio');
  await assert.rejects(makeMp3([], mock(() => frames('x'))), (e) => e.code === 'empty');
  await assert.rejects(makeMp3(['  ', null], mock(() => frames('x'))), (e) => e.code === 'empty');
  await assert.rejects(makeMp3(['a'], null), (e) => e.code === 'unavailable');
});

test('the none provider disables MP3 creation with a plain message and no retries', async () => {
  await assert.rejects(makeMp3(['a'], providers.none), (e) => e.code === 'disabled' && /switched off/.test(e.message));
  await assert.rejects(providers.none.synthesize('x'), (e) => e.code === 'disabled');
});

test('PAPER_TTS_PROVIDER picks the provider; unknown names fail closed to none; only free providers exist', () => {
  const saved = process.env.PAPER_TTS_PROVIDER;
  try {
    delete process.env.PAPER_TTS_PROVIDER;
    assert.equal(getProvider().name, 'edge');
    process.env.PAPER_TTS_PROVIDER = 'none';
    assert.equal(getProvider().name, 'none');
    process.env.PAPER_TTS_PROVIDER = 'elevenlabs';
    assert.equal(getProvider().name, 'none');
    assert.equal(getProvider('edge').name, 'edge');
  } finally {
    if (saved === undefined) delete process.env.PAPER_TTS_PROVIDER; else process.env.PAPER_TTS_PROVIDER = saved;
  }
  assert.deepEqual(Object.keys(providers).sort(), ['edge', 'none']);
  assert.ok(providers.edge.free && providers.none.free);
  assert.equal(providers.edge.defaultVoice, DEFAULT_VOICE);
});

test('edge provider rejects empty text without touching the network', async () => {
  await assert.rejects(providers.edge.synthesize('   '), (e) => e.code === 'empty');
});
