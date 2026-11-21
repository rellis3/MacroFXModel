// js/jarvis/voiceCore.js: the pure half of Jarvis's VOICE (POST /api/jarvis/voice, js/jarvis/jarvisVoice.js). Which provider speaks, how the text is cleaned, the cache key and the daily cap.
//   eleven : ElevenLabs (paid, the most natural). Used only when ELEVENLABS_API_KEY is set on the server, capped at JARVIS_ELEVEN_DAILY_CHARS characters a London day (default 20 000).
//   edge   : Microsoft Edge's neural read-aloud voice (free, no key; en-GB-RyanNeural by default, the same service the Paper Library uses).
//   off    : JARVIS_VOICE=off; the browser's own voice is used instead (the client falls back by itself on any failure).
// No DOM, no fetch, no Node APIs: tested in voiceCore.test.mjs.

export const ELEVEN_DEFAULT_VOICE = 'onwK4e9ZLuTAKqWW03F9';      // ElevenLabs "Daniel": a deep British news-presenter voice
export const ELEVEN_MODEL = 'eleven_multilingual_v2';
export const EDGE_DEFAULT_VOICE = 'en-GB-RyanNeural';
export const MAX_CHARS = 1500;
export const DEFAULT_DAILY_CHARS = 20_000;

/** Which provider to use, from the server's environment. Order: an explicit JARVIS_VOICE, else ElevenLabs when a key exists, else Edge. */
export function pickProvider(env = {}) {
  const want = String(env.JARVIS_VOICE ?? '').trim().toLowerCase();
  if (want === 'off' || want === 'none') return { name: 'off' };
  const hasEleven = !!String(env.ELEVENLABS_API_KEY ?? '').trim();
  if ((want === 'eleven' || want === '' || want === 'auto') && hasEleven) {
    const cap = Number(env.JARVIS_ELEVEN_DAILY_CHARS);
    return { name: 'eleven', voice: String(env.JARVIS_ELEVEN_VOICE || ELEVEN_DEFAULT_VOICE), model: String(env.JARVIS_ELEVEN_MODEL || ELEVEN_MODEL), dailyChars: Number.isFinite(cap) && cap >= 0 ? cap : DEFAULT_DAILY_CHARS };
  }
  return { name: 'edge', voice: String(env.JARVIS_EDGE_VOICE || EDGE_DEFAULT_VOICE) };
}

/** Text made safe and short for speech: markup and control characters gone, whitespace folded, cut at a sentence end before MAX_CHARS. '' when nothing is left. */
export function cleanForSpeech(text, max = MAX_CHARS) {
  let t = String(text ?? '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[*_`#>|~]/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  t = t.slice(0, max); const cut = Math.max(t.lastIndexOf('. '), t.lastIndexOf('! '), t.lastIndexOf('? '));
  return (cut > max * 0.5 ? t.slice(0, cut + 1) : t).trim();
}

/** The speaking style, clamped: rate 0.5..2 (1 = normal) -> Edge's percent string. */
export const edgeRate = r => { const x = Math.max(0.5, Math.min(2, Number(r) || 1)); const p = Math.round((x - 1) * 100); return `${p >= 0 ? '+' : ''}${p}%`; };

/** ElevenLabs request body. style 0..1 adds expression; stability lower = more varied delivery. */
export function elevenBody(text, model = ELEVEN_MODEL) {
  return { text, model_id: model, voice_settings: { stability: 0.42, similarity_boost: 0.82, style: 0.32, use_speaker_boost: true } };
}

/** A cache key that does not depend on object order: provider|voice|rate|text. */
export const cacheKey = (provider, voice, rate, text) => `${provider}|${voice}|${Number(rate || 1).toFixed(2)}|${text}`;

/** The daily cap: may `n` more characters be spent? state = { date, used }. Returns { ok, state } with the day rolled over when the date changed. */
export function capCheck(state, date, n, limit) {
  const s = state?.date === date ? { ...state } : { date, used: 0 };
  if (!(limit > 0)) return { ok: false, state: s };
  return { ok: s.used + n <= limit, state: s };
}

/** A small LRU for audio buffers, bounded by entry count and total bytes. */
export class AudioCache {
  constructor({ maxItems = 300, maxBytes = 48 * 1024 * 1024 } = {}) { this.m = new Map(); this.bytes = 0; this.maxItems = maxItems; this.maxBytes = maxBytes; }
  get(k) { const v = this.m.get(k); if (!v) return null; this.m.delete(k); this.m.set(k, v); return v; }
  set(k, v) {
    const size = v?.buf?.length ?? 0; if (size > this.maxBytes) return;
    if (this.m.has(k)) { this.bytes -= this.m.get(k).buf.length; this.m.delete(k); }
    this.m.set(k, v); this.bytes += size;
    while (this.m.size > this.maxItems || this.bytes > this.maxBytes) { const [ok, ov] = this.m.entries().next().value; this.m.delete(ok); this.bytes -= ov.buf.length; }
  }
  get size() { return this.m.size; }
}
