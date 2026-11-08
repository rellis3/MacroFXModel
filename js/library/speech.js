// Browser voice for the reader, built to the Theory Lab TTS rules (theory-lab/assets/tts.js):
//  - utterances <= 110 chars; every remaining one is queued SYNCHRONOUSLY inside the click handler;
//  - no periodic pause()/resume() keep-alive (pause/resume only from the user's button);
//  - a generation token makes stale callbacks no-ops; cancel on pagehide/beforeunload (see app glue);
//  - the current paragraph is highlighted from each utterance's onstart.
export const MAX_UTTERANCE_CHARS = 110;
export const RATE_KEY = 'libraryTTSRate';
export const VOICE_KEY = 'libraryTTSVoiceName';
export const MODE_KEY = 'libraryListenMode';

export function splitForSpeech(text) {
  text = String(text || '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  if (text.length <= MAX_UTTERANCE_CHARS) return [text];
  const pieces = text.split(/([.!?])\s+(?=[A-Z(])/);
  let sentences = [];
  for (let i = 0; i < pieces.length; i += 2) {
    const s = ((pieces[i] || '') + (pieces[i + 1] || '')).trim();
    if (s) sentences.push(s);
  }
  if (!sentences.length) sentences = [text];
  const out = [];
  for (let s of sentences) {
    while (s.length > MAX_UTTERANCE_CHARS) {
      let cut = s.lastIndexOf(' ', MAX_UTTERANCE_CHARS);
      if (cut < 40) cut = MAX_UTTERANCE_CHARS;
      out.push(s.slice(0, cut).trim());
      s = s.slice(cut).trim();
    }
    if (s) out.push(s);
  }
  return out;
}

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Build the speaking queue [{text, block}]; block = reader block index to highlight (-1 none).
 * Uses listen.blocks (optional array parallel to sentences) when the server sends it; otherwise matches each
 * sentence forward against the block texts.
 */
export function buildQueue(listen, blocks) {
  const sentences = (listen && listen.sentences) || [];
  const given = listen && Array.isArray(listen.blocks) && listen.blocks.length === sentences.length ? listen.blocks : null;
  const bt = (blocks || []).filter(b => b.type === 'h1' || b.type === 'h2' || b.type === 'p').map(b => ({ i: b.i, n: norm(b.text) }));
  let ptr = 0, cur = -1;
  const q = [];
  for (let k = 0; k < sentences.length; k++) {
    let block;
    if (given) block = given[k] == null ? -1 : given[k];
    else {
      const key = norm(sentences[k]).slice(0, 28);
      if (key.length >= 8) for (let j = ptr; j < bt.length; j++) if (bt[j].n.includes(key)) { ptr = j; cur = bt[j].i; break; }
      block = cur;
    }
    for (const part of splitForSpeech(sentences[k])) q.push({ text: part, block });
  }
  return q;
}

/** deps: { synth, Utterance, storage, onState({idx,total,playing,rate}), onBlock(blockIdx) } */
export function createSpeaker(deps) {
  const { synth, Utterance, storage } = deps;
  const getS = k => { try { return storage && storage.getItem(k); } catch { return null; } };
  const setS = (k, v) => { try { storage && storage.setItem(k, v); } catch { /* private mode */ } };
  let queue = [], idx = -1, playing = false, token = 0;
  let rate = parseFloat(getS(RATE_KEY)) || 1;
  let voice = null;
  const emit = () => deps.onState && deps.onState({ idx, total: queue.length, playing, rate });
  const invalidate = () => { token++; };

  function queueBatch(start) {
    invalidate();
    const my = token;
    if (synth.speaking || synth.pending) synth.cancel();
    if (start < 0 || start >= queue.length) { stop(); return; }
    idx = start;
    if (deps.onBlock) deps.onBlock(queue[start].block);
    emit();
    const last = queue.length - 1;
    for (let i = start; i <= last; i++) {
      const u = new Utterance(queue[i].text);
      u.rate = rate;
      if (voice) u.voice = voice;
      u.onstart = () => { if (my !== token) return; idx = i; if (deps.onBlock) deps.onBlock(queue[i].block); emit(); };
      if (i === last) {
        u.onend = () => { if (my === token) stop(); };
        u.onerror = () => { if (my === token) stop(); };
      }
      synth.speak(u);
    }
  }
  function stop() {
    playing = false; idx = -1; invalidate();
    try { synth.cancel(); } catch { /* ignore */ }
    if (deps.onBlock) deps.onBlock(-1);
    emit();
  }
  const api = {
    setQueue(q) { stop(); queue = q.slice(); emit(); },
    play() {
      if (!queue.length) { emit(); return; }
      playing = true;
      if (synth.paused && (synth.speaking || synth.pending)) { synth.resume(); emit(); return; }
      queueBatch(idx < 0 ? 0 : idx);
    },
    pause() { playing = false; synth.pause(); emit(); },
    toggle() { if (playing) api.pause(); else api.play(); },
    /** previous / next paragraph (not 110-char piece) */
    skip(delta) {
      if (!queue.length) return;
      const from = idx < 0 ? 0 : idx;
      const start = i => { let j = i; while (j > 0 && queue[i].block !== -1 && queue[j - 1].block === queue[i].block) j--; return j; };
      const end = i => { let j = i; while (j < queue.length - 1 && queue[i].block !== -1 && queue[j + 1].block === queue[i].block) j++; return j; };
      let n;
      if (delta > 0) n = Math.min(queue.length - 1, end(from) + 1);
      else { const s = start(from); n = from > s ? s : start(Math.max(0, s - 1)); }
      if (playing) queueBatch(n);
      else { invalidate(); if (synth.speaking || synth.pending) synth.cancel(); idx = n; if (deps.onBlock) deps.onBlock(queue[n].block); emit(); }
    },
    setRate(r) { rate = parseFloat(r) || 1; setS(RATE_KEY, String(rate)); if (playing) queueBatch(idx < 0 ? 0 : idx); else emit(); },
    setVoice(v) { voice = v || null; setS(VOICE_KEY, v ? v.name : ''); if (playing) queueBatch(idx < 0 ? 0 : idx); },
    pickVoice(voices) {
      const saved = getS(VOICE_KEY);
      const sorted = voices.slice().sort((a, b) => (/^en/i.test(a.lang) ? 0 : 1) - (/^en/i.test(b.lang) ? 0 : 1) || a.name.localeCompare(b.name));
      voice = sorted.find(v => v.name === saved) || sorted[0] || null;
      return { sorted, voice };
    },
    stop,
    get rate() { return rate; },
    get state() { return { idx, total: queue.length, playing, rate }; },
  };
  return api;
}
