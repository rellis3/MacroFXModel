// js/jarvis/jarvisVoice.js: POST /api/jarvis/voice (owner-only) -> audio/mpeg, and GET /api/jarvis/voice/info. Jarvis's natural voice for the SHOW, the NEWSLETTER and the morning BROADCAST.
// Provider order (voiceCore.pickProvider): ElevenLabs when ELEVENLABS_API_KEY is set (capped per London day), else Microsoft Edge's free neural voice (en-GB-RyanNeural). A failed ElevenLabs call
// falls back to Edge; if both fail the route answers 502 and the browser speaks with its own built-in voice. Every clip is cached in memory, so a replayed show costs nothing.
// It speaks text the client already shows on screen (template words, never a model call). Description only, like the rest of Jarvis.
import { createHash } from 'node:crypto';
import { pickProvider, cleanForSpeech, edgeRate, elevenBody, elevenSpeed, elevenDict, cacheKey, capCheck, AudioCache, EDGE_DEFAULT_VOICE } from './voiceCore.js';

async function edgeSpeak(text, voice, rate) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
  const tts = new MsEdgeTTS({ connectionTimeoutMs: 15_000, synthesisTimeoutMs: 40_000 });
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const { audioStream } = tts.toStream(esc, { rate: edgeRate(rate), pitch: '-4Hz' });
    const bufs = [];
    await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('edge voice timed out')), 45_000); audioStream.on('data', d => bufs.push(Buffer.from(d))); audioStream.on('error', e => { clearTimeout(t); rej(e); }); audioStream.on('close', () => { clearTimeout(t); res(); }); audioStream.on('end', () => { clearTimeout(t); res(); }); });
    const out = Buffer.concat(bufs); if (!out.length) throw new Error('edge voice returned no audio'); return out;
  } finally { try { tts.close(); } catch { /* closed */ } }
}

async function elevenSpeak(text, p, key, opts = {}) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(p.voice)}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, body: JSON.stringify(elevenBody(text, p.model, { ...opts, dict: elevenDict(process.env) })), signal: AbortSignal.timeout(45_000),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text().catch(() => '')).slice(0, 160)}`);
  const buf = Buffer.from(await r.arrayBuffer()); if (!buf.length) throw new Error('ElevenLabs returned no audio'); return buf;
}

export async function mount(app, deps) {
  const { express, ownerOnly, londonDate } = deps;
  const cache = new AudioCache(), inflight = new Map();
  let cap = { date: null, used: 0 }, lastErr = null;
  app.get('/api/jarvis/voice/info', ownerOnly, (_req, res) => {
    const p = pickProvider(process.env), today = londonDate(Date.now()), used = cap.date === today ? cap.used : 0;
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, provider: p.name, voice: p.voice ?? null, cached: cache.size, eleven: p.name === 'eleven' ? { usedToday: used, dailyChars: p.dailyChars } : null, lastError: lastErr });
  });
  app.post('/api/jarvis/voice', ownerOnly, express.json({ limit: '16kb' }), async (req, res) => {
    const p0 = pickProvider(process.env), p = req.body?.provider === 'edge' && p0.name === 'eleven' ? { name: 'edge', voice: process.env.JARVIS_EDGE_VOICE || EDGE_DEFAULT_VOICE } : p0;      // provider 'edge': the recorder found the ElevenLabs day budget too short for the whole script, so one voice throughout
    if (p.name === 'off') return res.status(503).json({ ok: false, error: 'the server voice is switched off (JARVIS_VOICE=off)' });
    const text = cleanForSpeech(req.body?.text), rate = Math.max(0.5, Math.min(2, Number(req.body?.rate) || 1));
    if (!text) return res.status(400).json({ ok: false, error: 'no text to speak' });
    const send = (hit, cached) => { res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=86400', 'X-Jarvis-Voice': hit.provider, 'X-Jarvis-Cached': cached ? '1' : '0', 'X-Jarvis-Rate': String(hit.rate ?? 1) }); res.send(hit.buf); };
    // both providers bake the speed in (pitch kept): Edge as its rate, ElevenLabs as voice_settings.speed (0.7..1.2; from 2026-11-27, it used to be asked for at 1 and sped up in the browser, pitched up)
    const ctx = { prev: typeof req.body?.prev === 'string' ? cleanForSpeech(req.body.prev, 600) : '', next: typeof req.body?.next === 'string' ? cleanForSpeech(req.body.next, 600) : '' };
    const order = p.name === 'eleven' ? [{ name: 'eleven', voice: p.voice, rate: elevenSpeed(rate) }, { name: 'edge', voice: process.env.JARVIS_EDGE_VOICE || EDGE_DEFAULT_VOICE, rate }] : [{ name: 'edge', voice: p.voice, rate }];
    for (const o of order) { const hit = cache.get(cacheKey(o.name, o.voice, o.rate, text)); if (hit) return send(hit, true); }
    const id = createHash('sha1').update(cacheKey(p.name, p.voice, rate, text)).digest('hex');
    try {
      if (!inflight.has(id)) inflight.set(id, (async () => {
        for (const o of order) {
          try {
            let buf;
            if (o.name === 'eleven') {
              const today = londonDate(Date.now()), c = capCheck(cap, today, text.length, p.dailyChars); cap = c.state;
              if (!c.ok) { lastErr = `ElevenLabs daily cap of ${p.dailyChars} characters reached; using the free voice`; continue; }
              buf = await elevenSpeak(text, p, process.env.ELEVENLABS_API_KEY, { speed: o.rate, ...ctx }); cap = { ...cap, used: cap.used + text.length };
            } else buf = await edgeSpeak(text, o.voice, o.rate);
            const hit = { buf, provider: o.name, rate: o.rate }; cache.set(cacheKey(o.name, o.voice, o.rate, text), hit); return hit;
          } catch (e) { lastErr = `${o.name}: ${e?.message ?? e}`; console.warn('[jarvisVoice]', lastErr); }
        }
        return null;
      })().finally(() => setTimeout(() => inflight.delete(id), 0)));
      const hit = await inflight.get(id);
      if (!hit) return res.status(502).json({ ok: false, error: lastErr ?? 'no voice available' });
      send(hit, false);
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
}
