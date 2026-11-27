// js/jarvis/helixBroadcastCore.js: the pure half of the H.E.L.I.X. broadcast hand-off (js/jarvis/helixBroadcast.js). No fetch, no KV, no Node APIs: tested in helixBroadcastCore.test.mjs.
//
// The laptop recorder (jarvis_broadcast/record_broadcast.py) uploads each video to YouTube (unlisted) and then tells the server; the SERVER sends the owner's Telegram note
// (Telegram is never sent from the laptop). This file checks what the laptop sent, words the notes, keeps the list of published videos (deduped by video id), finds a
// release that is due a special, and writes the podcast RSS. Description only: a note says a video is up, never what to trade.

export const KV_KEY = 'helix_published_v1';
export const MAX_ITEMS = 60;                 // the list Helix shows (and the dedupe window)
export const DAY_CAP = 16;                   // at most this many published notes a London day (morning, evening, short, podcast, a special or two, the weekly)
export const FAIL_CAP = 6;                   // at most this many failure notes a London day
export const PARTS = { morning: 'Morning briefing', evening: 'Evening briefing', afternoon: 'Afternoon briefing', weekly: 'Weekly recap', special: 'Release special', short: 'Short', podcast: 'Podcast episode', guide: 'Visual guide' };
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const EP_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{5,63}$/;

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const plain = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/** "4 min 31 s" / "52 s" / '' */
export function durWords(sec) {
  const s = Math.round(Number(sec)); if (!Number.isFinite(s) || s <= 0) return '';
  return s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}` : `${s} s`;
}

/** The YouTube link for a video id: Shorts get the /shorts/ form. */
export const videoUrl = (id, format) => (format === 'short' ? `https://youtube.com/shorts/${id}` : `https://youtu.be/${id}`);

/**
 * What the laptop sent after an upload, checked. body = { videoId, title, part, seconds?, format?, releaseKey? }.
 * Returns { ok: true, item } or { ok: false, error }. The link is BUILT from the id (never taken from the body), so a note can only ever point at youtube.com.
 */
export function validatePublished(body, nowMs = Date.now()) {
  const b = body && typeof body === 'object' ? body : {};
  const id = String(b.videoId ?? '').trim();
  if (!YT_ID.test(id)) return { ok: false, error: 'videoId must be an 11-character YouTube id' };
  const part = String(b.part ?? '').trim().toLowerCase();
  if (!PARTS[part] || part === 'podcast') return { ok: false, error: `part must be one of ${Object.keys(PARTS).filter(p => p !== 'podcast').join(', ')}` };
  const title = plain(b.title, 100); if (!title) return { ok: false, error: 'title required' };
  const format = b.format === 'short' || part === 'short' ? 'short' : 'wide';
  const secs = Number(b.seconds), seconds = Number.isFinite(secs) && secs > 0 && secs < 4 * 3600 ? Math.round(secs * 10) / 10 : null;
  const releaseKey = b.releaseKey ? plain(b.releaseKey, 80) : null;
  return { ok: true, item: { id, kind: 'video', part, title, format, url: videoUrl(id, format), seconds, releaseKey, at: new Date(nowMs).toISOString() } };
}

/** A failure the laptop reports: { part, error }. */
export function validateFailed(body) {
  const b = body && typeof body === 'object' ? body : {};
  const part = String(b.part ?? '').trim().toLowerCase();
  if (!PARTS[part]) return { ok: false, error: 'unknown part' };
  const error = plain(b.error, 300) || 'no reason given';
  return { ok: true, part, error };
}

/** The Telegram note (HTML parse mode) for a published item. */
export function publishedText(item) {
  const what = PARTS[item.part] ?? 'Broadcast';
  const meta = [durWords(item.seconds), item.kind === 'podcast' ? 'audio, private feed' : 'unlisted'].filter(Boolean).join(' · ');
  return [`<b>H.E.L.I.X. · ${esc(what)} is up</b>`, esc(item.title), esc(item.url), meta].filter(Boolean).join('\n');
}

/** The Telegram note for a failed run. */
export function failedText(part, error) {
  return [`<b>H.E.L.I.X. · ${esc(PARTS[part] ?? 'Broadcast')} FAILED</b>`, esc(error), 'Nothing new went to YouTube. The laptop log has the detail: jarvis_broadcast\\out\\run.log'].join('\n');
}

/** The stored list, normalised: { items: [...newest first], day: { date, sent, failed } }. */
export function readStore(raw) {
  let j = raw; if (typeof raw === 'string') { try { j = JSON.parse(raw); } catch { j = null; } }
  const items = Array.isArray(j?.items) ? j.items.filter(x => x && x.id) : [];
  const day = j?.day && typeof j.day === 'object' ? { date: j.day.date ?? null, sent: +j.day.sent || 0, failed: +j.day.failed || 0 } : { date: null, sent: 0, failed: 0 };
  return { items, day };
}

/** The day's counters, rolled over on a new London date. */
export const rollDay = (store, date) => (store.day.date === date ? store : { ...store, day: { date, sent: 0, failed: 0 } });

/**
 * Add a published item. Returns { store, duplicate, capped }. A video id already in the list is a duplicate (the laptop retries, the note is sent once).
 * Over the day's cap the item is still listed but no note is sent.
 */
export function addItem(store, item, date) {
  const s = rollDay(store, date);
  if (s.items.some(x => x.id === item.id)) return { store: s, duplicate: true, capped: false };
  const capped = s.day.sent >= DAY_CAP;
  const items = [item, ...s.items].slice(0, MAX_ITEMS);
  return { store: { items, day: { ...s.day, sent: s.day.sent + (capped ? 0 : 1) } }, duplicate: false, capped };
}

/** Count a failure note. Returns { store, capped }. */
export function addFailure(store, date) {
  const s = rollDay(store, date), capped = s.day.failed >= FAIL_CAP;
  return { store: { ...s, day: { ...s.day, failed: s.day.failed + (capped ? 0 : 1) } }, capped };
}

// ── release specials ──
/** The releases that earn a special: payrolls, CPI, the Fed's decision and the other central banks' rate decisions. Minutes, speeches and testimony do not. */
export const SPECIAL_RE = /\b(non-?farm|payrolls?|cpi\b|consumer price index|fomc|federal funds rate|fed funds|rate decision|rate statement|cash rate|official bank rate|bank rate|main refinancing|deposit facility rate|overnight rate|policy rate|monetary policy statement)/i;
export const SPECIAL_SKIP_RE = /\b(minutes|speaks|speech|testimony|press conference|meeting minutes|expectations)\b/i;
export const SPECIAL_FROM_MIN = 30, SPECIAL_TO_MIN = 80;      // record 30 minutes after the print; the laptop checks every 10 minutes, so the window is generous
const CCY = { USD: 'USD', US: 'USD', EUR: 'EUR', EU: 'EUR', GBP: 'GBP', GB: 'GBP', UK: 'GBP', JPY: 'JPY', JP: 'JPY', AUD: 'AUD', AU: 'AUD', NZD: 'NZD', NZ: 'NZD', CAD: 'CAD', CA: 'CAD', CHF: 'CHF', CH: 'CHF' };

/** One key per release: "<London date>|<ccy>|<HH:MM UTC>" (two parts of one print share a key, so one special covers both). */
export const releaseKey = (ms, ccy) => `${new Date(ms).toISOString().slice(0, 10)}|${ccy}|${new Date(ms).toISOString().slice(11, 16)}`;

/**
 * Releases due a special now. events = ForexFactory's week as /api/events serves it ([{ ms | date, country | ccy, impact | rank, event | title }]).
 * done = Set of release keys already recorded. Returns [{ key, ccy, ms, name }] (several rows of one print are merged), oldest first.
 */
export function specialsDue(events, nowMs, done = new Set(), { fromMin = SPECIAL_FROM_MIN, toMin = SPECIAL_TO_MIN } = {}) {
  const out = new Map();
  for (const e of Array.isArray(events) ? events : []) {
    const ms = Number.isFinite(+e?.ms) ? +e.ms : Date.parse(e?.date ?? ''); if (!Number.isFinite(ms)) continue;
    const rank = Number.isFinite(+e?.rank) ? +e.rank : { high: 3, medium: 2, low: 1 }[String(e?.impact ?? '').toLowerCase()] ?? 0;
    if (rank < 3) continue;
    const name = String(e?.event ?? e?.title ?? '').trim(); if (!SPECIAL_RE.test(name) || SPECIAL_SKIP_RE.test(name)) continue;
    const ccy = CCY[String(e?.ccy ?? e?.country ?? '').toUpperCase()]; if (!ccy) continue;
    const age = (nowMs - ms) / 60_000; if (age < fromMin || age > toMin) continue;
    const key = releaseKey(ms, ccy); if (done.has(key)) continue;
    const x = out.get(key); if (x) { if (!x.names.includes(name)) x.names.push(name); } else out.set(key, { key, ccy, ms, names: [name] });
  }
  return [...out.values()].sort((a, b) => a.ms - b.ms).map(x => ({ key: x.key, ccy: x.ccy, ms: x.ms, name: x.names.join(' and ') }));
}

// ── the podcast ──
/** A podcast episode the laptop uploads: query { id, title, part, seconds }. */
export function validateEpisode(q, bytes) {
  const id = String(q?.id ?? '').trim(); if (!EP_ID.test(id)) return { ok: false, error: 'id must be 6-64 letters, digits, - or _' };
  const part = String(q?.part ?? '').trim().toLowerCase(); if (!PARTS[part] || part === 'short' || part === 'podcast') return { ok: false, error: 'unknown part' };
  const title = plain(q?.title, 120); if (!title) return { ok: false, error: 'title required' };
  if (!(bytes > 1000)) return { ok: false, error: 'no audio' };
  const secs = Number(q?.seconds), seconds = Number.isFinite(secs) && secs > 0 && secs < 4 * 3600 ? Math.round(secs) : null;
  return { ok: true, ep: { id, part, title, seconds, bytes } };
}

const rfc822 = iso => new Date(iso).toUTCString();
const hms = s => { const t = Math.max(0, Math.round(+s || 0)); return `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
/** RSS 2.0 with the iTunes tags podcast apps read. base = 'https://host/api/helix/podcast/<key>'. Not listed in any directory (itunes:block). */
export function podcastRss(episodes, base) {
  const items = (episodes ?? []).map(e => `<item><title>${esc(e.title)}</title><guid isPermaLink="false">helix-${esc(e.id)}</guid><pubDate>${rfc822(e.at)}</pubDate>`
    + `<enclosure url="${esc(`${base}/${e.id}.mp3`)}" length="${+e.bytes || 0}" type="audio/mpeg"/>${e.seconds ? `<itunes:duration>${hms(e.seconds)}</itunes:duration>` : ''}`
    + `<description>${esc(`${PARTS[e.part] ?? 'Briefing'} from the desk, narrated by H.E.L.I.X. Description only. Not a forecast, not advice, not a trade.`)}</description></item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>H.E.L.I.X. Briefings</title><link>${esc(base)}/feed.xml</link>`
    + '<language>en-gb</language><description>The desk briefings as audio. Description only. Not a forecast, not advice, not a trade.</description><itunes:block>Yes</itunes:block><itunes:explicit>false</itunes:explicit>'
    + `${items}</channel></rss>\n`;
}
