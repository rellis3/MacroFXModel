// node js/jarvis/voiceCore.test.mjs
import assert from 'node:assert/strict';
import { pickProvider, cleanForSpeech, edgeRate, cacheKey, capCheck, AudioCache, ELEVEN_DEFAULT_VOICE, EDGE_DEFAULT_VOICE, MAX_CHARS } from './voiceCore.js';

// provider choice
assert.equal(pickProvider({}).name, 'edge');
assert.equal(pickProvider({}).voice, EDGE_DEFAULT_VOICE);
assert.equal(pickProvider({ ELEVENLABS_API_KEY: 'k' }).name, 'eleven');
assert.equal(pickProvider({ ELEVENLABS_API_KEY: 'k' }).voice, ELEVEN_DEFAULT_VOICE);
assert.equal(pickProvider({ ELEVENLABS_API_KEY: '  ' }).name, 'edge', 'a blank key is no key');
assert.equal(pickProvider({ ELEVENLABS_API_KEY: 'k', JARVIS_VOICE: 'edge' }).name, 'edge', 'the owner can force the free voice');
assert.equal(pickProvider({ JARVIS_VOICE: 'off' }).name, 'off');
assert.equal(pickProvider({ JARVIS_VOICE: 'eleven' }).name, 'edge', 'eleven without a key falls back to edge');
assert.equal(pickProvider({ ELEVENLABS_API_KEY: 'k', JARVIS_ELEVEN_DAILY_CHARS: '500' }).dailyChars, 500);
assert.equal(pickProvider({ ELEVENLABS_API_KEY: 'k', JARVIS_ELEVEN_DAILY_CHARS: 'x' }).dailyChars, 20000);

// cleaning
assert.equal(cleanForSpeech('  <b>Hello</b>\n world  '), 'Hello world');
assert.equal(cleanForSpeech('**bold** `code` # head'), 'bold code head');
assert.equal(cleanForSpeech(null), '');
const long = 'This is a sentence. '.repeat(200);
const c = cleanForSpeech(long);
assert.ok(c.length <= MAX_CHARS && c.endsWith('.'), 'long text is cut at a sentence end');

// rate
assert.equal(edgeRate(1), '+0%'); assert.equal(edgeRate(1.25), '+25%'); assert.equal(edgeRate(0.75), '-25%'); assert.equal(edgeRate(9), '+100%'); assert.equal(edgeRate('x'), '+0%');

// cache key and cap
assert.equal(cacheKey('edge', 'v', 1, 'hi'), 'edge|v|1.00|hi');
let r = capCheck(null, '2026-11-20', 100, 1000); assert.ok(r.ok); assert.equal(r.state.used, 0);
r = capCheck({ date: '2026-11-20', used: 950 }, '2026-11-20', 100, 1000); assert.ok(!r.ok);
r = capCheck({ date: '2026-11-19', used: 950 }, '2026-11-20', 100, 1000); assert.ok(r.ok, 'a new day resets the cap');
assert.ok(!capCheck(null, 'd', 1, 0).ok, 'a zero cap blocks');

// LRU
const lru = new AudioCache({ maxItems: 2, maxBytes: 10 });
lru.set('a', { buf: Buffer.alloc(4) }); lru.set('b', { buf: Buffer.alloc(4) }); lru.get('a'); lru.set('c', { buf: Buffer.alloc(4) });
assert.ok(lru.get('a') && lru.get('c') && !lru.get('b'), 'least recently used goes first');
lru.set('d', { buf: Buffer.alloc(9) }); assert.equal(lru.size, 1, 'byte bound evicts');
lru.set('huge', { buf: Buffer.alloc(11) }); assert.ok(!lru.get('huge'), 'an item over the byte bound is not kept');
console.log('voiceCore: all tests passed');
