// js/terminal/kokoroWorker.js: a module Web Worker that speaks with KOKORO-82M (open source, Apache 2.0) entirely in the browser: no server, no key, no cost. Running here keeps the HUD's
// animation smooth while a line is synthesised. The library (kokoro-js, which brings transformers.js / ONNX Runtime Web) loads from jsdelivr and the model (~90 MB, q8) from Hugging Face the first
// time; the browser caches both. WebGPU is used where the browser has it (fast), otherwise WASM (slower; the client renders lines ahead of the narration).
// Messages in:  { id, text, voice }          out: { id, wav: ArrayBuffer, secs } | { id, err }    and { ready: true, device } once loaded, { loading: progress 0..1 } while it downloads.
const LIB = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js';
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let ttsP = null, device = 'wasm';

async function load() {
  ttsP ??= (async () => {
    const { KokoroTTS } = await import(LIB);
    const gpu = !!self.navigator?.gpu && !!(await self.navigator.gpu.requestAdapter().catch(() => null));
    device = gpu ? 'webgpu' : 'wasm';
    const tts = await KokoroTTS.from_pretrained(MODEL, { dtype: gpu ? 'fp32' : 'q8', device, progress_callback: p => { if (p?.status === 'progress' && p.total) self.postMessage({ loading: p.loaded / p.total, file: p.file }); } });
    self.postMessage({ ready: true, device });
    return tts;
  })();
  ttsP.catch(() => { ttsP = null; });
  return ttsP;
}

// one line at a time, in the order asked (the narration order)
let chain = Promise.resolve();
self.onmessage = e => {
  const { id, text, voice, warm } = e.data ?? {};
  if (warm) { load().catch(err => self.postMessage({ err: String(err?.message ?? err) })); return; }
  chain = chain.then(async () => {
    try {
      const tts = await load();
      const a = await tts.generate(String(text ?? '').slice(0, 1500), { voice: voice || 'bm_george' });
      const wav = a.toWav(); self.postMessage({ id, wav, secs: a.audio.length / a.sampling_rate }, [wav]);
    } catch (err) { self.postMessage({ id, err: String(err?.message ?? err) }); }
  });
};
