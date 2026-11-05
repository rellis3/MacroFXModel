/**
 * The master kill switch for every Telegram message the server sends (owner, 2026-11-05).
 *
 * Two layers, both can only SILENCE:
 *   master     one flag for everything, stored in KV `tg_master_all` as { on, at }. Missing or unreadable = ON,
 *              so a fresh deploy or a KV hiccup never mutes the owner by accident; only an explicit on:false mutes.
 *   per sender ai_alert_cfg.tgMaster[sender] (the ⚙ Alerts modal rows). Missing = ON, only false mutes.
 *
 * A message goes out only when the master is on AND its sender's switch is on. A send with no sender name (a test
 * message, the newsletter) answers to the master alone.
 *
 * Pure: no fetch, no KV, no clock. Tested in js/telegramGuard.test.mjs.
 */
export const TG_ALL_KEY = 'tg_master_all';

/** The stored master flag, from a KV string or object: { on, at }. Anything but an explicit on:false reads as on. */
export function parseMaster(raw) {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  if (!v || typeof v !== 'object') return { on: true, at: null };
  return { on: v.on !== false, at: typeof v.at === 'string' ? v.at : null };
}

/** The record to store when the owner flips the master. */
export const masterRecord = (on, now = new Date()) => ({ on: on !== false, at: new Date(now).toISOString() });

/** Is the master on? */
export const masterOn = master => master?.on !== false;

/** Send or not: the master first, then the sender's own switch (missing = on). */
export function shouldSend({ master, tgMaster, sender } = {}) {
  if (!masterOn(master)) return false;
  if (!sender) return true;
  return tgMaster?.[sender] !== false;
}

/** Does this request go to Telegram's bot API? (the in-process backstop in server.js blocks these when muted) */
export function isTelegramUrl(input) {
  const u = typeof input === 'string' ? input : input?.url ?? input?.href ?? String(input ?? '');
  return /^https?:\/\/api\.telegram\.org\//i.test(u);
}

/** Server routes that are proxied to the Cloudflare worker and send a Telegram message from there. */
export const WORKER_TG_ROUTES = ['/api/telegram', '/api/regime-v2/tg-test', '/api/regime-v7/tg-test'];
export const isWorkerTgRoute = (method, path) => String(method).toUpperCase() === 'POST' && WORKER_TG_ROUTES.includes(String(path ?? '').replace(/\/+$/, ''));

export const MUTED_TEXT = 'All Telegram messages are off (⚙ Alerts → All Telegram messages). Nothing was sent.';
