// js/terminal/jarvisVoiceClient.js: Jarvis's NATURAL VOICE in the browser. Two engines, tried in this order, then the HUD's built-in browser voice:
//   KOKORO (default): Kokoro-82M, an open-source neural voice (Apache 2.0) that runs IN THE BROWSER in a Web Worker (kokoroWorker.js): free, no key, nothing on the server. British male
//                     voices bm_george (default), bm_daniel, bm_lewis, bm_fable. First use downloads the model (~90 MB, then cached). Lines are rendered ahead of the narration.
//   SERVER:           POST /api/jarvis/voice (ElevenLabs when the server has a key, else Microsoft's free British neural voice).
// Every clip plays through an <audio> element, so it reaches a tab recording (SHOW / BROADCAST -> RECORD). Clips are cached per line; any failure falls through to the next engine.
// The words are whatever is already on screen; nothing is generated here. Description only.

const MAX_CLIPS = 80, LS = 'jarvisVoice:v1';
export const KOKORO_VOICES = [['bm_george', 'GEORGE'], ['bm_daniel', 'DANIEL'], ['bm_lewis', 'LEWIS'], ['bm_fable', 'FABLE']];
export const ENGINES = [['kokoro', 'KOKORO (open source, in browser)'], ['server', 'SERVER (ElevenLabs / free neural)']];
const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { return {}; } };
const lsPut = o => { try { localStorage.setItem(LS, JSON.stringify({ ...lsGet(), ...o })); } catch (e) { /* private window */ } };

/** A bounded map of line -> Promise<objectURL|null>, revoking URLs it drops. */
function clipCache(win) {
  const m = new Map();
  return { get: k => m.get(k), has: k => m.has(k), del: k => m.delete(k), size: () => m.size,
    set(k, p) { m.set(k, p); if (m.size > MAX_CLIPS) { const [ok, op] = m.entries().next().value; m.delete(ok); op.then(u => { if (u) win.URL.revokeObjectURL(u); }); } } };
}

function serverEngine(win) {
  const clips = clipCache(win); let failures = 0, disabledUntil = 0, provider = null;
  return {
    name: 'server',
    fetch(text) {
      const t = String(text ?? '').trim(); if (!t || Date.now() < disabledUntil) return Promise.resolve(null);
      if (clips.has(t)) return clips.get(t);
      const p = (async () => {
        try {
          const r = await win.fetch('/api/jarvis/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t, rate: 1 }) });
          if (!r.ok) throw new Error(String(r.status)); provider = r.headers.get('X-Jarvis-Voice') || provider;
          const blob = await r.blob(); if (!blob.size) throw new Error('empty'); failures = 0; return win.URL.createObjectURL(blob);
        } catch (e) { clips.del(t); if (++failures >= 2) disabledUntil = Date.now() + 5 * 60_000; return null; }
      })();
      clips.set(t, p); return p;
    },
    info: () => ({ provider, failures }),
  };
}

function kokoroEngine(win) {
  const clips = clipCache(win); let worker = null, seq = 0, broken = false, state = { ready: false, device: null, loading: 0, err: null };
  const pending = new Map();
  const ensure = () => {
    if (worker || broken) return worker;
    try {
      worker = new win.Worker(new URL('./kokoroWorker.js', import.meta.url), { type: 'module' });
      worker.onmessage = e => {
        const d = e.data ?? {};
        if (d.ready) { state.ready = true; state.device = d.device; return; }
        if (d.loading != null) { state.loading = d.loading; return; }
        const cb = pending.get(d.id); if (!cb) { if (d.err) state.err = d.err; return; } pending.delete(d.id);
        cb(d.err ? null : win.URL.createObjectURL(new win.Blob([d.wav], { type: 'audio/wav' })));
        if (d.err) state.err = d.err;
      };
      worker.onerror = e => { state.err = String(e?.message ?? 'worker error'); broken = true; for (const cb of pending.values()) cb(null); pending.clear(); };
    } catch (e) { broken = true; state.err = String(e?.message ?? e); }
    return worker;
  };
  const voice = () => lsGet().kvoice || 'bm_george';
  return {
    name: 'kokoro',
    warm() { ensure()?.postMessage({ warm: true }); },
    fetch(text) {
      const t = String(text ?? '').trim(); if (!t || broken) return Promise.resolve(null);
      const k = `${voice()}|${t}`; if (clips.has(k)) return clips.get(k);
      const w = ensure(); if (!w) return Promise.resolve(null);
      const id = ++seq, p = new Promise(res => { pending.set(id, res); w.postMessage({ id, text: t, voice: voice() }); }).then(u => { if (!u) clips.del(k); return u; });
      clips.set(k, p); return p;
    },
    info: () => ({ ...state, voice: voice(), broken }),
  };
}

/** The voice for one Jarvis window: { prefetch(text), play(text, rate, onEnd) -> Promise<ctl|null>, slow(), warm(), info(), stopAll(), engine/setEngine, kvoice/setKvoice }. */
export function makeNeuralVoice(win) {
  const server = serverEngine(win), kokoro = kokoroEngine(win);
  let audio = null;
  const engine = () => lsGet().engine || 'kokoro';
  const order = () => (engine() === 'kokoro' ? [kokoro, server] : [server]);
  async function clip(text) { for (const e of order()) { const u = await e.fetch(text); if (u) return { u, by: e.name }; } return null; }
  async function play(text, rate = 1, onEnd = () => {}) {
    const c = await clip(text); if (!c) return null;
    try { audio?.pause(); } catch (e) { /* idle */ }
    const a = new win.Audio(c.u); audio = a; a.playbackRate = Math.max(0.5, Math.min(2, rate || 1)); a.preservesPitch = true;
    let ended = false; const end = () => { if (!ended) { ended = true; onEnd(); } };
    a.onended = end; a.onerror = end;
    try { await a.play(); } catch (e) { return null; }
    return { by: c.by, stop() { try { a.pause(); } catch (e) { /* idle */ } end(); }, pause(on) { try { on ? a.pause() : a.play(); } catch (e) { /* idle */ } }, setRate(r) { a.playbackRate = Math.max(0.5, Math.min(2, r || 1)); } };
  }
  return {
    prefetch: t => { order()[0].fetch(t); },
    play,
    slow: () => engine() === 'kokoro',              // the in-browser engine can take longer than the line itself on a slow machine: the director waits for it
    warm: () => { if (engine() === 'kokoro') kokoro.warm(); },
    info: () => ({ engine: engine(), kokoro: kokoro.info(), server: server.info() }),
    stopAll() { try { audio?.pause(); } catch (e) { /* idle */ } },
    engine, setEngine: e => lsPut({ engine: e }), kvoice: () => lsGet().kvoice || 'bm_george', setKvoice: v => lsPut({ kvoice: v }),
  };
}
