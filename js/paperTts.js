// Paper Library MP3 creation. FREE voices only: the `edge` provider uses Microsoft Edge's online read-aloud voices (no key, no
// cost; an unofficial endpoint that can change or vanish, so every failure is a clear TtsError, never a hang).
// No paid provider exists here by design (plans/PAPER_LIBRARY.md rule 1).
//
//   provider.synthesize(text, { voice, timeoutMs }) -> Buffer (mp3)
//   makeMp3(chunks, provider, opts)                 -> Buffer (chunks synthesised one by one, retried, concatenated)
//   providers = { edge, none }; getProvider(name)   PAPER_TTS_PROVIDER=none disables MP3 creation

export const DEFAULT_VOICE = 'en-GB-RyanNeural';   // natural British neural voice; en-US-AriaNeural is the US alternative
export const DEFAULT_CHUNK_TIMEOUT_MS = 60_000;

export class TtsError extends Error {
  constructor(message, code = 'tts_error', cause) {
    super(message);
    this.name = 'TtsError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

const escapeXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
// Control characters are invalid in the SSML the service accepts.
const cleanText = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();

function withTimeout(promise, ms, label, onTimeout) {
  if (!ms || ms <= 0) return promise;
  let timer;
  const t = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try { onTimeout?.(); } catch { /* ignore */ }
      reject(new TtsError(`${label} timed out after ${ms} ms`, 'timeout'));
    }, ms);
  });
  return Promise.race([promise, t]).finally(() => clearTimeout(timer));
}

/** Length in bytes of a leading ID3v2 tag (0 if none). */
export function id3Length(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 10) return 0;
  if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return 0;   // "ID3"
  const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
  const total = 10 + size + (buf[5] & 0x10 ? 10 : 0);
  return Math.min(total, buf.length);
}

export const stripId3 = (buf) => buf.subarray(id3Length(buf));

// ---------- providers ----------
const edge = {
  name: 'edge',
  free: true,
  defaultVoice: DEFAULT_VOICE,
  async synthesize(text, { voice = DEFAULT_VOICE, timeoutMs = DEFAULT_CHUNK_TIMEOUT_MS } = {}) {
    const input = cleanText(text);
    if (!input) throw new TtsError('nothing to synthesise', 'empty');
    let mod;
    try { mod = await import('msedge-tts'); } catch (e) { throw new TtsError('msedge-tts is not installed (run npm ci)', 'unavailable', e); }
    const { MsEdgeTTS, OUTPUT_FORMAT } = mod;
    const tts = new MsEdgeTTS({ connectionTimeoutMs: 15_000, synthesisTimeoutMs: Math.max(5_000, timeoutMs - 5_000) });
    const close = () => { try { tts.close(); } catch { /* ignore */ } };
    const run = (async () => {
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(escapeXml(input));
      const bufs = [];
      await new Promise((resolve, reject) => {
        audioStream.on('data', (d) => bufs.push(Buffer.from(d)));
        audioStream.on('error', reject);
        audioStream.on('close', resolve);
        audioStream.on('end', resolve);
      });
      const out = Buffer.concat(bufs);
      if (!out.length) throw new TtsError('the Edge voice service returned no audio', 'no_audio');
      return out;
    })();
    try {
      return await withTimeout(run, timeoutMs, 'Edge voice service', close);
    } catch (e) {
      if (e instanceof TtsError) throw e;
      throw new TtsError(`Edge voice service failed: ${e?.message || e}`, 'provider_error', e);
    } finally {
      close();
      run.catch(() => {});
    }
  },
};

const none = {
  name: 'none',
  free: true,
  disabled: true,
  defaultVoice: null,
  async synthesize() {
    throw new TtsError('MP3 creation is switched off (PAPER_TTS_PROVIDER=none). The browser voice still works.', 'disabled');
  },
};

export const providers = { edge, none };

/** Provider chosen by name, else PAPER_TTS_PROVIDER, else edge. Unknown names resolve to `none` (fail closed, never a paid one). */
export function getProvider(name) {
  const key = String(name ?? process.env.PAPER_TTS_PROVIDER ?? 'edge').trim().toLowerCase() || 'edge';
  return providers[key] || none;
}

// ---------- chunk by chunk MP3 ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Synthesise `chunks` (strings) one after another and join the MP3s. Each chunk gets `retries` extra attempts and a timeout.
 * opts: { voice, retries=2, timeoutMs, retryDelayMs=800, onProgress(done,total) }
 * Throws TtsError (code: disabled | empty | timeout | provider_error | no_audio | ...) and never hangs.
 */
export async function makeMp3(chunks, provider = getProvider(), opts = {}) {
  const p = provider && typeof provider.synthesize === 'function' ? provider : null;
  if (!p) throw new TtsError('no TTS provider', 'unavailable');
  if (p.disabled) return p.synthesize();   // throws the 'disabled' error with its own message
  const list = (Array.isArray(chunks) ? chunks : []).map(cleanText).filter(Boolean);
  if (!list.length) throw new TtsError('no text to synthesise', 'empty');
  const retries = Number.isInteger(opts.retries) && opts.retries >= 0 ? opts.retries : 2;
  const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_CHUNK_TIMEOUT_MS;
  const retryDelayMs = Number.isFinite(opts.retryDelayMs) && opts.retryDelayMs >= 0 ? opts.retryDelayMs : 800;
  const voice = opts.voice || p.defaultVoice || DEFAULT_VOICE;
  const parts = [];
  for (let n = 0; n < list.length; n++) {
    let buf = null;
    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const out = await withTimeout(Promise.resolve(p.synthesize(list[n], { voice, timeoutMs })), timeoutMs + 2_000, `chunk ${n + 1} of ${list.length}`);
        if (!Buffer.isBuffer(out) || !out.length) throw new TtsError('provider returned no audio', 'no_audio');
        buf = out;
        break;
      } catch (e) {
        lastErr = e;
        if (e?.code === 'disabled' || e?.code === 'unavailable') break;   // retrying cannot help
        if (attempt < retries && retryDelayMs) await sleep(retryDelayMs * (attempt + 1));
      }
    }
    if (!buf) {
      const msg = `chunk ${n + 1} of ${list.length} failed: ${lastErr?.message || lastErr}`;
      throw lastErr instanceof TtsError ? new TtsError(msg, lastErr.code, lastErr) : new TtsError(msg, 'provider_error', lastErr);
    }
    parts.push(n === 0 ? buf : stripId3(buf));
    try { opts.onProgress?.(n + 1, list.length); } catch { /* ignore */ }
  }
  return Buffer.concat(parts);
}
