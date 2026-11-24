// jarvis_broadcast/vclock.js: a VIRTUAL CLOCK for frame-by-frame recording. Injected by record_broadcast.py (--frames, the default) before the page's own scripts.
//
// Until freeze() the page runs on the real clock, untouched. After freeze() the page's time stands still and moves only when the recorder calls step(ms):
//   performance.now, Date.now / new Date(), setTimeout / setInterval, requestAnimationFrame, CSS and Web Animations, and the HUD's audio context's currentTime
//   all follow the virtual clock. The recorder steps 1/30 s, takes a screenshot, steps again: every frame is complete however slow the machine is.
// While a network fetch (or a promise handed to hold()) is still pending, step() waits for it in real time, so data and voice clips arrive "instantly" in the video.
// SOUND: after freeze(), a new AudioContext is an OfflineAudioContext whose clock is the virtual one. Everything the HUD schedules on it (voice, ambient, whooshes, blips)
// is rendered at the end by render() into a WAV, in perfect step with the frames. Nothing reaches the speakers.
(() => {
  if (window.__vclock) return;
  const R = {
    now: performance.now.bind(performance), Date: window.Date, st: window.setTimeout.bind(window), ct: window.clearTimeout.bind(window),
    si: window.setInterval.bind(window), ci: window.clearInterval.bind(window), raf: window.requestAnimationFrame.bind(window), caf: window.cancelAnimationFrame.bind(window),
    fetch: window.fetch.bind(window), AC: window.AudioContext || window.webkitAudioContext, OAC: window.OfflineAudioContext,
  };
  const VC = { frozen: false, v: 0, off: 0, frame: 0 };
  let seq = 1e9;                                              // virtual timer ids never collide with the browser's own
  const timers = new Map(), rafs = new Map(), holds = new Set(), fetches = new Map();
  const realDateNow = () => R.Date.now();

  performance.now = () => (VC.frozen ? VC.v : R.now());
  const vnow = () => (VC.frozen ? Math.floor(VC.v + VC.off) : realDateNow());
  function VDate(...a) {
    if (!new.target) return new R.Date(vnow()).toString();
    return a.length ? new R.Date(...a) : new R.Date(vnow());
  }
  VDate.prototype = R.Date.prototype; VDate.now = vnow; VDate.parse = R.Date.parse; VDate.UTC = R.Date.UTC;
  Object.defineProperty(VDate.prototype, 'constructor', { value: VDate, writable: true, configurable: true });
  window.Date = VDate;

  window.setTimeout = (fn, ms = 0, ...args) => {
    if (!VC.frozen) return R.st(fn, ms, ...args);
    const id = ++seq; timers.set(id, { fn, due: VC.v + Math.max(0, +ms || 0), args, every: 0 }); return id;
  };
  window.setInterval = (fn, ms = 0, ...args) => {
    if (!VC.frozen) return R.si(fn, ms, ...args);
    const every = Math.max(1, +ms || 0), id = ++seq; timers.set(id, { fn, due: VC.v + every, args, every }); return id;
  };
  window.clearTimeout = id => { if (id >= 1e9) timers.delete(id); else R.ct(id); };
  window.clearInterval = id => { if (id >= 1e9) timers.delete(id); else R.ci(id); };
  window.requestAnimationFrame = fn => { if (!VC.frozen) return R.raf(fn); const id = ++seq; rafs.set(id, fn); return id; };
  window.cancelAnimationFrame = id => { if (id >= 1e9) rafs.delete(id); else R.caf(id); };
  window.fetch = (...a) => {
    const p = R.fetch(...a); if (!VC.frozen) return p;
    const k = {}; fetches.set(k, R.now()); p.finally(() => fetches.delete(k)).catch(() => {}); return p;
  };

  // after freeze(), the HUD's audio context is offline and runs on the virtual clock (its currentTime counts from when it was made)
  const AUDIO_SECONDS = 420, RATE = 48000;
  let offline = null;
  function VAudioContext() {
    if (!VC.frozen || !R.OAC) return new R.AC();
    if (offline) return offline;
    const ac = new R.OAC(1, AUDIO_SECONDS * RATE, RATE), born = VC.v;
    Object.defineProperty(ac, 'currentTime', { get: () => (VC.v - born) / 1000 });
    Object.defineProperty(ac, 'state', { get: () => 'running' });
    ac.resume = () => Promise.resolve(); ac.suspend = () => Promise.resolve(); ac.close = () => Promise.resolve();
    ac.createMediaStreamDestination = () => { const g = ac.createGain(); g.stream = { getTracks: () => [] }; return g; };     // no live tap: the sound is rendered at the end
    ac.__virtual = true; ac.__born = born;
    return (offline = ac);
  }
  window.AudioContext = VAudioContext; window.webkitAudioContext = VAudioContext;

  const yieldTask = () => new Promise(r => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
  const busy = () => { const t = R.now(); for (const s of fetches.values()) if (t - s < 20000) return true; return holds.size > 0; };
  let prevV = 0;
  window.__vclock = {
    get frozen() { return VC.frozen; }, get v() { return VC.v; }, get frame() { return VC.frame; },
    now: vnow,
    /** Stop the real clock: from here the page's time moves only with step(). */
    freeze() { if (VC.frozen) return vnow(); VC.v = R.now(); VC.off = realDateNow() - VC.v; prevV = VC.v; VC.frozen = true; return vnow(); },
    /** Hold the clock until p settles (a voice clip being fetched and decoded). */
    hold(p) { const k = Promise.resolve(p).catch(() => {}).finally(() => holds.delete(k)); holds.add(k); return p; },
    /** Move the clock on by ms: run every timer due on the way (in order), then the animation frame callbacks, then the CSS / Web Animations. Resolves when the page has caught up. */
    async step(ms = 1000 / 30) {
      const t0 = R.now(); while (busy() && R.now() - t0 < 90000) await new Promise(r => R.st(r, 5));
      const target = VC.v + ms;
      for (let guard = 0; guard < 20000; guard++) {
        let next = null; for (const [id, t] of timers) if (t.due <= target && (!next || t.due < next[1].due)) next = [id, t];
        if (!next) break;
        const [id, t] = next; VC.v = Math.max(VC.v, t.due);
        if (t.every) t.due += t.every; else timers.delete(id);
        try { typeof t.fn === 'function' ? t.fn(...t.args) : null; } catch (e) { console.error(e); }
        await yieldTask();                                   // let promise chains the timer woke run (they may set new timers due in this frame)
        if (busy()) { const t1 = R.now(); while (busy() && R.now() - t1 < 90000) await new Promise(r => R.st(r, 5)); }
      }
      VC.v = target; VC.frame++;
      const cbs = [...rafs.values()]; rafs.clear();
      for (const f of cbs) { try { f(VC.v); } catch (e) { console.error(e); } }
      for (const a of document.getAnimations()) {
        try { if (a.__v0 == null) { a.__v0 = prevV; a.pause(); } a.currentTime = VC.v - a.__v0; } catch (e) { /* a finished or removed animation */ }
      }
      prevV = VC.v;
      await yieldTask();
      await Promise.race([new Promise(r => R.raf(() => r())), new Promise(r => R.st(r, 150))]);     // give the compositor a real frame (an off-screen window may not send one)
      return vnow();
    },
    /** Render the offline sound from virtual ms a to b into 16-bit mono WAV, kept as base64 in __vclock.wav (fetched in pieces). Returns its length. */
    async render(a, b) {
      if (!offline) throw new Error('no audio context was made after freeze');
      const buf = await offline.startRendering(), sr = buf.sampleRate, d = buf.getChannelData(0);
      const i0 = Math.max(0, Math.round((a - VC.off - offline.__born) / 1000 * sr)), i1 = Math.min(d.length, Math.round((b - VC.off - offline.__born) / 1000 * sr));
      const n = Math.max(0, i1 - i0), out = new DataView(new ArrayBuffer(44 + n * 2)), w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
      out.setUint32(24, sr, true); out.setUint32(28, sr * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i0 + i])) * 32767, true);
      const bytes = new Uint8Array(out.buffer); let bin = '';
      for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000));
      this.wav = btoa(bin); return { chars: this.wav.length, seconds: n / sr, cut: i1 >= d.length };     // cut: the broadcast outran the offline buffer (AUDIO_SECONDS)
    },
    wav: '',
  };
})();
