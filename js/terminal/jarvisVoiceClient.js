// js/terminal/jarvisVoiceClient.js: Jarvis's NATURAL VOICE in the browser. Asks the server (POST /api/jarvis/voice: ElevenLabs when a key is set, else Microsoft's free British neural voice)
// for an MP3 of a line and plays it through an <audio> element, so it also reaches a tab recording (SHOW -> RECORD). Clips are cached per line and the director can fetch the NEXT line while
// the current one plays, so there is no gap between scenes. Any failure (route missing, no network, autoplay blocked) returns null and the HUD falls back to the browser's built-in voice.
// The words are whatever is already on screen; nothing is generated here. Description only.

const MAX_CLIPS = 80;

/** A voice for one Jarvis window. win = the window; returns { prefetch(text, rate), play(text, rate, onEnd) -> ctl | null (Promise), info() }. */
export function makeNeuralVoice(win) {
  const clips = new Map();            // key -> Promise<string objectURL | null>
  let failures = 0, disabledUntil = 0, audio = null, lastProvider = null;
  const key = (t, r) => `${Number(r || 1).toFixed(2)}|${t}`;
  function fetchClip(text, rate = 1) {
    const t = String(text ?? '').trim(); if (!t) return Promise.resolve(null);
    if (Date.now() < disabledUntil) return Promise.resolve(null);
    const k = key(t, rate); if (clips.has(k)) return clips.get(k);
    const p = (async () => {
      try {
        const r = await win.fetch('/api/jarvis/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t, rate }) });
        if (!r.ok) throw new Error(String(r.status));
        lastProvider = r.headers.get('X-Jarvis-Voice') || lastProvider;
        const blob = await r.blob(); if (!blob.size) throw new Error('empty'); failures = 0;
        return win.URL.createObjectURL(blob);
      } catch (e) {
        clips.delete(k); if (++failures >= 2) disabledUntil = Date.now() + 5 * 60_000;   // two misses in a row: use the built-in voice for five minutes
        return null;
      }
    })();
    clips.set(k, p);
    if (clips.size > MAX_CLIPS) { const [ok, op] = clips.entries().next().value; clips.delete(ok); op.then(u => { if (u) win.URL.revokeObjectURL(u); }); }
    return p;
  }
  /** Start playing a line. Resolves to a controller { stop(), pause(on) } once it is playing, or null when the natural voice is not available (the caller falls back). */
  async function play(text, rate = 1, onEnd = () => {}) {
    const url = await fetchClip(text, 1);              // one clip per line; speed is the player's playbackRate, so changing speed never refetches
    if (!url) return null;
    try { audio?.pause(); } catch (e) { /* idle */ }
    const a = new win.Audio(url); audio = a; a.playbackRate = Math.max(0.5, Math.min(2, rate || 1)); a.preservesPitch = true;
    let ended = false; const end = () => { if (!ended) { ended = true; onEnd(); } };
    a.onended = end; a.onerror = end;
    try { await a.play(); } catch (e) { return null; }          // autoplay blocked: fall back
    return { stop() { try { a.pause(); } catch (e) { /* idle */ } end(); }, pause(on) { try { on ? a.pause() : a.play(); } catch (e) { /* idle */ } }, setRate(r) { a.playbackRate = Math.max(0.5, Math.min(2, r || 1)); } };
  }
  return { prefetch: (t, r) => { fetchClip(t, 1); }, play, info: () => ({ provider: lastProvider, failures, cached: clips.size }), stopAll() { try { audio?.pause(); } catch (e) { /* idle */ } } };
}
