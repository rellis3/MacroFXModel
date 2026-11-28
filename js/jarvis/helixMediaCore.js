// js/jarvis/helixMediaCore.js: the pure half of the H.E.L.I.X. MEDIA routes (js/jarvis/helixMedia.js). No fetch, no KV, no R2: tested in helixMediaCore.test.mjs.
//
// The published list (KV helix_published_v1, js/jarvis/helixBroadcastCore.js) keeps only the last 60 items, for the Telegram dedupe. The MEDIA section wants EVERY
// video, so the videos are also kept in an archive in R2 (helix/media/videos.json, at most ARCHIVE_MAX rows, newest first): each read of /api/helix/media folds
// the published list into it, and the laptop can backfill the uploads from before the list existed (POST /api/helix/broadcasts/backfill, never a Telegram note).
// This file checks a backfill, merges lists, and works out an HTTP Range request. Description only: a row is a title, a part, a length and a date.
import { PARTS } from './helixBroadcastCore.js';

export const ARCHIVE_KEY = 'helix/media/videos.json';
export const ARCHIVE_MAX = 2000;            // ~250 bytes a row: about 500 KB at the cap, years of broadcasts
export const BACKFILL_MAX = 300;            // rows in one backfill request
export const VIDEO_PARTS = Object.keys(PARTS).filter(p => p !== 'podcast');
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const EARLIEST = Date.parse('2026-01-01T00:00:00Z');

const plain = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const secsOf = v => { const s = Number(v); return Number.isFinite(s) && s > 0 && s < 4 * 3600 ? Math.round(s * 10) / 10 : null; };

/** One archive row from a published item or a backfill row (already checked). The link is always rebuilt from the id on the page, never stored from a body. */
export const archiveRow = x => ({ id: x.id, part: x.part, title: x.title, format: x.format === 'short' || x.part === 'short' ? 'short' : 'wide', seconds: secsOf(x.seconds), at: x.at });

/**
 * A backfill body: { items: [{ videoId, title, part, at, seconds?, format? }] }. Returns { ok: true, items, rejected: [{ i, error }] } or { ok: false, error }.
 * Rows are checked one by one (a bad row is listed and skipped, the rest go in); ids are deduped within the body (the first wins).
 */
export function validateBackfill(body, nowMs = Date.now()) {
  const rows = Array.isArray(body?.items) ? body.items : null;
  if (!rows) return { ok: false, error: 'items must be an array' };
  if (!rows.length) return { ok: false, error: 'items is empty' };
  if (rows.length > BACKFILL_MAX) return { ok: false, error: `at most ${BACKFILL_MAX} items a request` };
  const items = [], rejected = [], seen = new Set();
  rows.forEach((b, i) => {
    const r = b && typeof b === 'object' ? b : {};
    const id = String(r.videoId ?? '').trim();
    if (!YT_ID.test(id)) return rejected.push({ i, error: 'videoId must be an 11-character YouTube id' });
    if (seen.has(id)) return rejected.push({ i, error: 'duplicate videoId in this request' });
    const part = String(r.part ?? '').trim().toLowerCase();
    if (!VIDEO_PARTS.includes(part)) return rejected.push({ i, error: `part must be one of ${VIDEO_PARTS.join(', ')}` });
    const ms = Date.parse(String(r.at ?? ''));
    if (!Number.isFinite(ms) || ms < EARLIEST || ms > nowMs + 86_400_000) return rejected.push({ i, error: 'at must be an ISO time between 2026 and now' });
    const title = plain(r.title, 100) || `H.E.L.I.X. ${PARTS[part]}`;
    seen.add(id);
    items.push(archiveRow({ id, part, title, format: r.format, seconds: r.seconds, at: new Date(ms).toISOString() }));
  });
  return { ok: true, items, rejected };
}

/** The archive as stored, normalised: rows with a valid id, part and time only. */
export function readArchive(raw) {
  const rows = Array.isArray(raw?.videos) ? raw.videos : Array.isArray(raw) ? raw : [];
  return rows.filter(x => x && YT_ID.test(String(x.id ?? '')) && VIDEO_PARTS.includes(x.part) && Number.isFinite(Date.parse(x.at ?? ''))).map(archiveRow);
}

/** The video rows of the published list (KV): podcast items (id pod-...) are left out, they come from the podcast index. */
export const publishedVideos = items => (Array.isArray(items) ? items : []).filter(x => x && x.kind !== 'podcast' && YT_ID.test(String(x.id ?? '')) && VIDEO_PARTS.includes(x.part)).map(archiveRow);

/**
 * Merge rows into the archive. A video already there keeps its row (the first word wins: the published list is written by the upload itself), except that a
 * missing length is filled in. Returns { videos (newest first, at most ARCHIVE_MAX), added, duplicates }.
 */
export function mergeVideos(archive, rows, max = ARCHIVE_MAX) {
  const byId = new Map((archive ?? []).map(x => [x.id, { ...x }]));
  let added = 0, duplicates = 0;
  for (const r of rows ?? []) {
    const have = byId.get(r.id);
    if (have) { duplicates++; if (have.seconds == null && r.seconds != null) have.seconds = r.seconds; continue; }
    byId.set(r.id, { ...r }); added++;
  }
  const videos = [...byId.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, max);
  return { videos, added, duplicates };
}

/** The podcast episodes for the page, from the R2 index (helix/podcast/index.json), each with its MP3 address under the feed's private path; [] with no feed. */
export function podcastRows(episodes, feedBase) {
  if (!feedBase) return [];
  return (Array.isArray(episodes) ? episodes : []).filter(e => e && /^[A-Za-z0-9][A-Za-z0-9_-]{5,63}$/.test(String(e.id ?? '')) && Number.isFinite(Date.parse(e.at ?? '')))
    .map(e => ({ id: e.id, part: PARTS[e.part] ? e.part : 'podcast', title: plain(e.title, 120) || 'H.E.L.I.X. episode', seconds: secsOf(e.seconds), at: e.at, src: `${feedBase}/${e.id}.mp3` }))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 120);
}

/**
 * One HTTP Range header against a body of `size` bytes. Returns null (no usable range: send the whole body with 200), { start, end } (inclusive: send 206),
 * or { unsatisfiable: true } (send 416 with Content-Range: bytes * /size). Only a single range is honoured; a multi-range request gets the whole body (allowed by RFC 9110).
 */
export function byteRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header ?? '').trim());
  if (!m || (!m[1] && !m[2]) || !(size > 0)) return null;
  let start, end;
  if (!m[1]) { const n = +m[2]; if (n === 0) return { unsatisfiable: true }; start = Math.max(0, size - n); end = size - 1; }
  else { start = +m[1]; end = m[2] ? Math.min(size - 1, +m[2]) : size - 1; }
  if (start >= size || start > end) return { unsatisfiable: true };
  return { start, end };
}
