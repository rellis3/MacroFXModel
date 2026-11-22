// js/terminal/jarvisVoiceClient.js: Jarvis's NATURAL VOICE in the browser. Two engines, tried in this order, then the HUD's built-in browser voice:
//   KOKORO (default): Kokoro-82M, an open-source neural voice (Apache 2.0) that runs IN THE BROWSER in a Web Worker (kokoroWorker.js): free, no key, nothing on the server. British male
//                     voices bm_george (default), bm_daniel, bm_lewis, bm_fable. First use downloads the model (~90 MB, then cached). Lines are rendered ahead of the narration.
//   SERVER:           POST /api/jarvis/voice (ElevenLabs when the server has a key, else Microsoft's free British neural voice).
// Every clip plays through an <audio> element, so it reaches a tab recording (SHOW / BROADCAST -> RECORD). Clips are cached per line; any failure falls through to the next engine.
// A ROBOT FINISH (FX_LEVELS: human / a little robotic (default) / full robot) runs the clip through the HUD's audio context: a ring modulator and a short metallic comb. Recorded with the tab like the rest.
// The words are whatever is already on screen; nothing is generated here. Description only.

const MAX_CLIPS = 80, LS = 'jarvisVoice:v1';
export const KOKORO_VOICES = [['bm_george', 'GEORGE'], ['bm_daniel', 'DANIEL'], ['bm_lewis', 'LEWIS'], ['bm_fable', 'FABLE']];
/** The robot finish on the voice: off, a light machine edge (default), or a full synthetic voice. */
export const FX_LEVELS = [['off', 'HUMAN'], ['subtle', 'A LITTLE ROBOTIC'], ['full', 'FULL ROBOT']];
/** The settings of each level: ring-modulator carrier (Hz) and mix, metallic comb delay (ms), feedback and mix, the dry level. Pure data (tested). */
export const FX_PARAMS = {
  subtle: { ringHz: 48, ring: 0.22, combMs: 7, fb: 0.32, comb: 0.18, dry: 0.85 },
  full: { ringHz: 78, ring: 0.5, combMs: 11, fb: 0.5, comb: 0.34, dry: 0.5 },
};
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
          const ac = new win.AbortController(), to = win.setTimeout(() => ac.abort(), 15000);      // never let one slow clip hold up the programme
          const r = await win.fetch('/api/jarvis/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t, rate: 1 }), signal: ac.signal }).finally(() => win.clearTimeout(to));
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

/** The voice for one Jarvis window: { prefetch(text), play(text, rate, onEnd) -> Promise<ctl {stop, pause, setRate, progress}|null>; the clip goes through the robot finish into the HUD's audio bus, so a recording has the voice, slow(), warm(), info(), stopAll(), engine/setEngine, kvoice/setKvoice }. */
export function makeNeuralVoice(win, opts = {}) {
  // opts: the HUD's audio bus (a function -> { ctx, input, stream }: speakers + the recorder's tap), or { audioBus, audioCtx }
  const audioBus = typeof opts === 'function' ? opts : (opts?.audioBus ?? null), audioCtx = opts?.audioCtx ?? (audioBus ? () => audioBus()?.ctx ?? null : null);
  const server = serverEngine(win), kokoro = kokoroEngine(win);
  let audio = null;
  const engine = () => lsGet().engine || 'kokoro';
  const order = () => (engine() === 'kokoro' ? [kokoro, server] : [server]);
  // The narration must never wait for Kokoro to download or warm up. Within one programme (a SHOW or BROADCAST run) ONE voice is used throughout:
  // Kokoro if it is warm when the programme starts and keeps up, otherwise the server voice; Kokoro keeps loading in the background for next time.
  let lock = null;                                   // null (undecided) | 'kokoro' | 'server'
  const withTimeout = (p, ms) => new Promise(res => { const t = win.setTimeout(() => res(null), ms); p.then(v => { win.clearTimeout(t); res(v); }, () => { win.clearTimeout(t); res(null); }); });
  async function clip(text) {
    if (engine() === 'kokoro' && lock !== 'server') {
      if (kokoro.info().ready && !kokoro.info().broken) {
        const u = await withTimeout(kokoro.fetch(text), lock === 'kokoro' ? 20000 : 8000);     // warm: give a line time to render; it was rendered ahead while the last one played
        if (u) { lock = 'kokoro'; return { u, by: 'kokoro' }; }
      } else kokoro.warm();
      lock = 'server';                               // not warm, or could not keep up: the server voice for the rest of this programme
    }
    const u = await server.fetch(text); return u ? { u, by: 'server' } : null;
  }
  const fxLevel = () => (FX_PARAMS[lsGet().fx ?? 'subtle'] ? (lsGet().fx ?? 'subtle') : 'off');
  /** Route a clip through the robot finish. Only when the HUD's audio context is running (else the clip plays plain: a suspended context would make it silent). Returns a cleanup. */
  async function robot(a) {
    const P = FX_PARAMS[fxLevel()];
    try {
      const b = audioBus?.(), ac = b?.ctx ?? audioCtx?.(); if (!ac) return () => {};
      if (ac.state !== 'running') await Promise.race([ac.resume().catch(() => {}), new Promise(r => win.setTimeout(r, 300))]);
      if (ac.state !== 'running') return () => {};                 // a suspended context would make the clip silent: it plays plain, straight to the speakers
      const dest = b?.input ?? ac.destination, src = ac.createMediaElementSource(a);
      if (!P) { src.connect(dest); return () => {}; }              // HUMAN finish: still through the bus, so a recording has the voice
      const out = ac.createGain(), hp = ac.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 110; out.connect(hp); hp.connect(dest);
      const dry = ac.createGain(); dry.gain.value = P.dry; src.connect(dry); dry.connect(out);
      const ring = ac.createGain(), rmix = ac.createGain(), osc = ac.createOscillator(); ring.gain.value = 0; osc.type = 'sine'; osc.frequency.value = P.ringHz; osc.connect(ring.gain); src.connect(ring); ring.connect(rmix); rmix.gain.value = P.ring; rmix.connect(out); osc.start();
      const dl = ac.createDelay(0.05), fb = ac.createGain(), cmix = ac.createGain(); dl.delayTime.value = P.combMs / 1000; fb.gain.value = P.fb; cmix.gain.value = P.comb; src.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(cmix); cmix.connect(out);
      return () => { try { osc.stop(); } catch (e) { /* stopped */ } win.setTimeout(() => { try { out.disconnect(); hp.disconnect(); } catch (e) { /* gone */ } }, 400); };
    } catch (e) { return () => {}; }
  }
  async function play(text, rate = 1, onEnd = () => {}) {
    const c = await clip(text); if (!c) return null;
    try { audio?.pause(); } catch (e) { /* idle */ }
    const a = new win.Audio(c.u); audio = a; a.playbackRate = Math.max(0.5, Math.min(2, rate || 1)); a.preservesPitch = true;
    const unfx = await robot(a);
    let ended = false; const end = () => { if (!ended) { ended = true; unfx(); onEnd(); } };
    a.onended = end; a.onerror = end;
    try { await a.play(); } catch (e) { return null; }
    // progress(): how far through the clip the audio really is (0..1, from the element's own clock), or null while the duration is not known yet; subtitles and the scene camera follow it
    return { by: c.by, stop() { try { a.pause(); } catch (e) { /* idle */ } end(); }, pause(on) { try { on ? a.pause() : a.play(); } catch (e) { /* idle */ } }, setRate(r) { a.playbackRate = Math.max(0.5, Math.min(2, r || 1)); },
      progress() { const d = a.duration; return ended ? 1 : Number.isFinite(d) && d > 0 ? Math.max(0, Math.min(1, a.currentTime / d)) : null; } };
  }
  return {
    prefetch: t => { if (engine() === 'kokoro' && lock !== 'server' && kokoro.info().ready) kokoro.fetch(t); else server.fetch(t); },
    /** A new programme starts: decide its voice afresh, and start warming Kokoro if it is the chosen engine. */
    begin: () => { lock = null; if (engine() === 'kokoro') kokoro.warm(); },
    play,
    slow: () => false,                              // play() never waits long: at most ~8-20 s for a Kokoro line, 15 s for the server, then the built-in voice
    warm: () => { if (engine() === 'kokoro') kokoro.warm(); },
    info: () => ({ engine: engine(), lock, kokoro: kokoro.info(), server: server.info() }),
    /** One line for a status bar: which voice is speaking, and Kokoro's download progress while it warms up. */
    label() { const k = kokoro.info(); if (engine() !== 'kokoro') return 'server voice'; if (k.broken) return 'server voice (Kokoro could not start here)'; if (!k.ready) return `server voice while Kokoro downloads${k.loading ? ` (${Math.round(k.loading * 100)}%)` : ''}`; return lock === 'server' ? 'server voice this time (Kokoro is ready for the next run)' : 'Kokoro'; },
    stopAll() { try { audio?.pause(); } catch (e) { /* idle */ } },
    fx: fxLevel, setFx: v => lsPut({ fx: v }),
    engine, setEngine: e => lsPut({ engine: e }), kvoice: () => lsGet().kvoice || 'bm_george', setKvoice: v => lsPut({ kvoice: v }),
  };
}
