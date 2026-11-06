/**
 * Pictures the owner attaches to a research-pod question (owner, 2026-11-06): chart screenshots, stats tables,
 * TradingView setups, phone screenshots.
 *
 * The three researchers run on the task `research-pod`, DeepSeek by default, which cannot read images. So each picture
 * is read ONCE, when it is uploaded, by a vision model (task `research-vision`, Sonnet on Anthropic) into a written
 * reading: what it is, every number and label transcribed, what a trader would read from it, and what is unreadable.
 * The owner can correct the reading before sending. The reading is stored with the owner's message in the case, and
 * every researcher and the Head of Research work from it as text. The Head of Research (Anthropic) also gets the
 * pictures themselves, so it can check the transcriptions against them.
 *
 * Stores: the image bytes in R2 (research/images/<id>.<ext>), or a bounded in-memory map when R2 is not configured;
 * the readings in KV research_images ({ v: 1, images: [record] }, newest first, capped), so an attach by id finds them.
 *
 * Pure: no fetch, no fs, no process.env. Tested in js/researchImages.test.mjs.
 */

export const MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
export const EXT_MIME = Object.fromEntries(Object.entries(MIME_EXT).map(([m, e]) => [e, m]));
/** After the page's resize (1600 px long side, JPEG 0.85) a picture is well under 1 MB; 6 MB leaves room for a raw PNG. */
export const MAX_BYTES = 6 * 1024 * 1024;
export const MAX_PER_MESSAGE = 6;
export const MAX_INDEX = 300;
export const INDEX_KEY = 'research_images';
export const PICTURES_HEADER = 'Pictures the owner attached (read by a vision model; the numbers are transcribed, not verified)';
const MAX_TEXT = 4000;

const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);

/** The type a buffer's first bytes say it is (png, jpeg, webp), or null. */
export function sniffMime(buf) {
  if (!buf || buf.length < 12) return null;
  const b = i => buf[i];
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'image/png';
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg';
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return 'image/webp';
  return null;
}

/**
 * Check an upload: the Content-Type must be png, jpeg or webp, the bytes must be that type, and the size within
 * MAX_BYTES. Returns { ok, mime, ext } or { ok: false, status, error }.
 */
export function validateUpload({ contentType, buf }) {
  const mime = String(contentType ?? '').split(';')[0].trim().toLowerCase().replace('image/jpg', 'image/jpeg');
  if (!MIME_EXT[mime]) return { ok: false, status: 415, error: 'send a PNG, JPEG or WebP image (Content-Type image/png, image/jpeg or image/webp)' };
  const n = buf?.length ?? 0;
  if (!n) return { ok: false, status: 400, error: 'no image in the request body' };
  if (n > MAX_BYTES) return { ok: false, status: 413, error: `the image is ${(n / 1048576).toFixed(1)} MB; the limit is ${MAX_BYTES / 1048576} MB` };
  const real = sniffMime(buf);
  if (real !== mime) return { ok: false, status: 415, error: real ? `the file is ${real}, not ${mime}` : 'the file is not a PNG, JPEG or WebP image' };
  return { ok: true, mime, ext: MIME_EXT[mime] };
}

export const ID_RE = /^img-\d{4}-\d{2}-\d{2}-[a-z0-9]{4,24}$/;
export const isImageId = id => typeof id === 'string' && ID_RE.test(id);
/** A new image id: img-<London date>-<base36 time><random>. */
export const newImageId = (date, now = Date.now(), rand = Math.random()) => `img-${date}-${now.toString(36)}${Math.floor(rand * 36 ** 4).toString(36).padStart(4, '0')}`;
export const r2Key = (id, ext) => `research/images/${id}.${ext}`;
export const imageUrl = id => `/api/research-pod/image?id=${encodeURIComponent(id)}`;

// ── the vision call ─────────────────────────────────────────────────────────────────────────────────────────────

export const VISION_SYSTEM = [
  "You read one picture the owner of a macro and FX trading desk attached to a question for the desk's researchers.",
  'The researchers cannot see the picture: they will work only from what you write. Be exact and complete, and never guess.',
  'Reply with one JSON object and nothing else.',
].join(' ');

/** The prompt for one picture; `context` is the owner's question or message, if any, so the reading knows what matters. */
export function visionPrompt({ context = '' } = {}) {
  const ctx = str(context, 1500);
  return [
    ctx ? `The owner's question or message this picture goes with:\n${ctx}\n` : 'The owner has not written the question yet.\n',
    'Read the picture and reply with this JSON object:',
    '{',
    '  "description": "what the picture is, in one to three sentences: a chart, a table, a screenshot of what, from which app or site if visible",',
    '  "extracted": ["every number, price level, date, time, label, axis value, timeframe, instrument, indicator setting and column heading visible, transcribed EXACTLY as shown (one item each, e.g. \\"Instrument: EURUSD\\", \\"Timeframe: 4H\\", \\"Level 1.0850 marked as resistance\\", \\"Row 2: Sharpe 1.42\\")"],',
    '  "observations": ["what a trader would read from it, each one plainly marked as read from the picture, not verified (e.g. \\"From the picture: price is above the 200-period line drawn on the chart\\")"],',
    '  "uncertain": ["anything unreadable, cut off, blurred or ambiguous, and which numbers you are not sure of"]',
    '}',
    'Rules: transcribe numbers digit for digit; do not round, convert or infer a number that is not shown. If a value is hard to read, put it in "uncertain" and not in "extracted". Do not judge whether a trade or idea is good. Keep each item to one line. At most 80 extracted items.',
  ].join('\n');
}

const lines = (v, max, n = 300) => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : [])
  .map(x => (typeof x === 'string' ? x : x && typeof x === 'object' ? Object.entries(x).map(([k, y]) => `${k}: ${typeof y === 'object' ? JSON.stringify(y) : y}`).join(', ') : x == null ? '' : String(x)))
  .map(x => x.trim().slice(0, n)).filter(Boolean).slice(0, max);

/** Check the vision model's reply: { description, extracted[], observations[], uncertain[] }. */
export function validateReading(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const description = str(obj.description, 800);
  const errors = [];
  if (!description) errors.push('description is missing');
  const value = { description, extracted: lines(obj.extracted, 80), observations: lines(obj.observations, 20, 400), uncertain: lines(obj.uncertain, 20) };
  if (errors.length) return { ok: false, errors };
  return { ok: true, value };
}

/** The reading as the text the researchers read (and the owner edits on the page). */
export function readingText(r) {
  if (!r) return '';
  const sec = (h, xs) => (xs?.length ? `${h}:\n${xs.map(x => `- ${x}`).join('\n')}` : '');
  return [r.description ? `What it is: ${r.description}` : '', sec('Transcribed from the picture', r.extracted), sec('Read from the picture (not verified)', r.observations), sec('Unreadable or uncertain', r.uncertain)]
    .filter(Boolean).join('\n').slice(0, MAX_TEXT);
}

// ── the index (KV research_images) ──────────────────────────────────────────────────────────────────────────────

export const emptyIndex = () => ({ v: 1, images: [] });
export const readIndex = raw => (raw && typeof raw === 'object' && Array.isArray(raw.images) ? { v: 1, images: raw.images } : emptyIndex());
/** One image's record: { id, ext, mime, bytes, at, stored: 'r2'|'memory', reading, text, model }. */
export function imageRecord({ id, ext, mime, bytes, at = new Date().toISOString(), stored, reading, model = null }) {
  return { id, ext, mime, bytes, at, stored, reading, text: readingText(reading), model };
}
/** Put a record into the index (replace by id), newest first, capped (the oldest readings go; an attached one lives on in its case). */
export const putImage = (index, rec, max = MAX_INDEX) => { const ix = readIndex(index); return { v: 1, images: [rec, ...ix.images.filter(x => x.id !== rec.id)].slice(0, max) }; };
export const findImage = (index, id) => readIndex(index).images.find(x => x.id === id) ?? null;

// ── attaching to a message ──────────────────────────────────────────────────────────────────────────────────────

/**
 * The `images` of a request: ids, or { id, text } where text is the owner's corrected reading. At most
 * MAX_PER_MESSAGE, each id once. Returns { ok, items: [{ id, text|null }] } or { ok: false, error }.
 */
export function parseAttach(list, { max = MAX_PER_MESSAGE } = {}) {
  if (list == null) return { ok: true, items: [] };
  if (!Array.isArray(list)) return { ok: false, error: 'images must be a list of image ids' };
  if (list.length > max) return { ok: false, error: `at most ${max} pictures per message` };
  const items = [], seen = new Set();
  for (const x of list) {
    const id = typeof x === 'string' ? x : x?.id;
    if (!isImageId(id)) return { ok: false, error: `not an image id: ${String(id).slice(0, 60)}` };
    if (seen.has(id)) continue; seen.add(id);
    items.push({ id, text: typeof x === 'object' ? str(x.text, MAX_TEXT) : null });
  }
  return { ok: true, items };
}

/**
 * What is stored with the owner's message: { id, url, mime, reading, text, edited, model }. `text` is what the
 * researchers read: the owner's corrected text when they edited it, else the vision model's reading rendered.
 */
export function attachment(rec, editedText = null) {
  const auto = rec.text ?? readingText(rec.reading);
  const text = editedText && editedText !== auto ? editedText.slice(0, MAX_TEXT) : auto;
  return { id: rec.id, url: imageUrl(rec.id), mime: rec.mime, reading: rec.reading ?? null, text, edited: text !== auto, model: rec.model ?? null };
}

/** Resolve a request's images against the index: { ok, attachments } or { ok: false, error } (an unknown id fails). */
export function resolveAttach(index, list) {
  const p = parseAttach(list); if (!p.ok) return p;
  const out = [];
  for (const it of p.items) { const rec = findImage(index, it.id); if (!rec) return { ok: false, error: `no picture ${it.id} (upload it again)` }; out.push(attachment(rec, it.text)); }
  return { ok: true, attachments: out };
}

/** The prompt text for a message's pictures (empty when there are none). */
export function picturesText(atts, { header = true } = {}) {
  if (!atts?.length) return '';
  const body = atts.map((a, i) => `Picture ${i + 1} (${a.id}${a.edited ? ', reading corrected by the owner' : ''}):\n${a.text || '(no reading)'}`).join('\n\n');
  return header ? `${PICTURES_HEADER}:\n${body}` : body;
}

/** Every picture in a case, the most recent first, each once: the question's, every round's, the pending message's. */
export function caseImages(c, max = MAX_PER_MESSAGE) {
  const all = [...(c?.images ?? []), ...(c?.rounds ?? []).flatMap(r => r.images ?? []), ...(c?.pending?.images ?? [])];
  const seen = new Set(), out = [];
  for (const a of all.reverse()) { if (a?.id && !seen.has(a.id)) { seen.add(a.id); out.push(a); } if (out.length >= max) break; }
  return out;
}
