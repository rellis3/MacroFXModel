// js/corrHistoryPersist.js: keep bot/data/corr_history.json across deploys.
// The file is ~12 MB, built from 5 years of OANDA H4 bars for ~30 instruments (about 3 minutes and a few hundred OANDA calls) and lives on Railway's
// ephemeral disk, so every deploy wiped it and the server rebuilt it from scratch a minute after boot. The terminal's own daily panel and the hedge-alerts
// summary were already kept in KV; this keeps the big file too (gzipped, about 1.5 MB, in R2) and puts it back at boot when it is still fresh enough.
// Injected I/O so the logic is tested without a disk or R2.

import { gzipSync, gunzipSync } from 'node:zlib';

export const CORR_R2_KEY = 'state/corr_history.json.gz';

/** After a successful build: gzip the file and put it in R2. Returns { ok, bytes } or { ok:false, reason }; never throws. */
export async function saveCorrHistory({ readFile, putBuffer, configured }) {
  try {
    if (!configured()) return { ok: false, reason: 'R2 not configured' };
    const raw = readFile();
    if (!raw || raw.length < 1000) return { ok: false, reason: 'history file missing or empty' };
    const gz = gzipSync(Buffer.from(raw));
    const ok = await putBuffer(CORR_R2_KEY, gz, 'application/gzip');
    return ok === false ? { ok: false, reason: 'R2 put failed' } : { ok: true, bytes: gz.length };
  } catch (e) { return { ok: false, reason: e.message }; }
}

/**
 * At boot, when the disk copy is missing: fetch it back, check it parses and carries a `generated` time, and write it with that time as the file's
 * modified time (so the refresh's "is it fresh?" test sees the DATA's age, not the restore time). Older than `maxAgeMs`: leave it, the refresh rebuilds.
 * Returns { restored, ageH?, reason? }; never throws.
 */
export async function restoreCorrHistory({ exists, getBuffer, writeFile, touch, configured, now = Date.now(), maxAgeMs }) {
  try {
    if (exists()) return { restored: false, reason: 'disk copy present' };
    if (!configured()) return { restored: false, reason: 'R2 not configured' };
    const gz = await getBuffer(CORR_R2_KEY);
    if (!gz?.length) return { restored: false, reason: 'no copy in R2' };
    const text = gunzipSync(gz).toString('utf8');
    const gen = Date.parse(JSON.parse(text).generated);
    if (!Number.isFinite(gen)) return { restored: false, reason: 'copy has no generated time' };
    const ageMs = now - gen;
    if (ageMs > maxAgeMs) return { restored: false, reason: `copy is ${(ageMs / 3600e3).toFixed(1)}h old` };
    writeFile(text); touch(gen);
    return { restored: true, ageH: +(ageMs / 3600e3).toFixed(2) };
  } catch (e) { return { restored: false, reason: e.message }; }
}
