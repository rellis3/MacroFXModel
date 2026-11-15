// js/deskAlertRules.js: DESK ALERT RULES (a rule you set; the older automatic board alerts are js/deskAlerts.js), the server half: the KV store, the route logic and the two-minute tick (the rules and the wording are js/deskAlertRulesCore.js).
// Desk-wide: one list for everyone on the one login. Stored in KV desk_alert_rules_v1 = { v:1, rules:[{ ..., state }], sent:{ day, n } }; a rule's own memory lives in the same
// record and is only written when it changes (an arm, a baseline, a fire), so this is a handful of writes a day, not one per tick.
// Delivery goes through the Railway server's own Telegram sender (never the Cloudflare cron worker), behind the master kill switch and its own switch tgMaster.deskAlertRules.
// The tick reads this server's routes over loopback (/api/live-layer, /api/fed-path, /api/replay/day), cached routes, nothing is fetched upstream here.
import { sanitizeStore, applyAction, run, noteText, touchesFromDay, todayLondon } from './deskAlertRulesCore.js';

export const KEY = 'desk_alert_rules_v1';
export const SENDER = 'deskAlertRules';

export async function readStore(kv) {
  try { const raw = await kv.get(KEY); return sanitizeStore(raw ? JSON.parse(raw) : {}); } catch { return sanitizeStore({}); }
}
const writeStore = (kv, store) => kv.put(KEY, JSON.stringify(store));

/**
 * Routes. GET: the list (the owner always; the desk login only once the owner switched the alerts on). POST: the OWNER only, whatever the switch says:
 * an alert sends a Telegram message to the owner's chat, so the desk login can read the list and never change it.
 */
export async function handle({ method, role, body, kv, on = () => true, now = Date.now() }) {
  if (!role) return { status: 401, json: { ok: false, error: 'sign in first' } };
  if (role !== 'owner' && !on('widget.alerts')) return { status: 403, json: { ok: false, error: 'not switched on' } };
  if (method === 'GET') { const s = await readStore(kv); return { status: 200, json: { ok: true, rules: s.rules.map(({ state, ...r }) => ({ ...r, firedAt: state?.firedAt ?? null })), sentToday: s.sent.day === todayLondon(now) ? s.sent.n : 0 } }; }
  if (method !== 'POST') return { status: 405, json: { ok: false, error: 'GET or POST' } };
  if (role !== 'owner') return { status: 403, json: { ok: false, error: 'owner only: an alert sends a Telegram message' } };
  const r = applyAction(await readStore(kv), body, now);
  if (!r.ok) return { status: r.status, json: { ok: false, error: r.error } };
  try { await writeStore(kv, r.store); } catch (e) { return { status: 500, json: { ok: false, error: `could not save: ${e.message}` } }; }
  return { status: 200, json: { ok: true, rules: r.store.rules.map(({ state, ...x }) => ({ ...x, firedAt: state?.firedAt ?? null })), sentToday: r.store.sent.day === todayLondon(now) ? r.store.sent.n : 0 } };
}

/**
 * One tick. deps: { kv, fetchFeed(path) -> { json } (path without /api/), send(text) -> Promise<bool>, canSend() -> bool, now(), log }.
 * Skips (and advances nothing) when Telegram cannot be reached or is muted, so an alert is never "used up" by a note nobody got.
 */
export async function tick({ kv, fetchFeed, send, canSend = () => true, now = () => Date.now(), log = console }) {
  const t = now(), store = await readStore(kv), live = store.rules.filter(r => !r.muted);
  if (!live.length) return { ok: true, skipped: 'no active alerts' };
  if (!canSend()) return { ok: true, skipped: 'telegram is off or muted' };
  const kinds = new Set(live.map(r => r.kind)), get = async p => { try { const r = await fetchFeed(p); return r?.json?.ok === false ? null : r?.json ?? null; } catch { return null; } };
  const ctx = { now: t, live: null, fed: null, touches: {} };
  if (kinds.has('range_used') || kinds.has('gap_closed')) ctx.live = await get('live-layer');
  if (kinds.has('fed_move') || kinds.has('data_stale')) ctx.fed = await get('fed-path');
  if (kinds.has('level_touch') && (ctx.live ?? await get('live-layer'))?.closed === false) {
    for (const m of new Set(live.filter(r => r.kind === 'level_touch').map(r => r.params.market))) {
      const day = await get(`replay/day?inst=${m}&date=${todayLondon(t)}`);
      if (day) ctx.touches[m] = touchesFromDay(day);
    }
  }
  const r = run(store, ctx);
  if (!r.changed) return { ok: true, fired: 0 };
  // merge the new memory into a fresh read, so a rule added or deleted while this tick ran is not undone
  const fresh = await readStore(kv), mem = new Map(r.rules.map(x => [x.id, x.state]));
  await writeStore(kv, { ...fresh, rules: fresh.rules.map(x => (mem.has(x.id) ? { ...x, state: mem.get(x.id) } : x)), sent: r.sent });
  let sent = 0;
  for (const f of r.fired) { try { if (await send(noteText(f.rule, f.text))) sent++; } catch (e) { log.error?.('[desk-alert-rules] send failed', e.message); } }
  return { ok: true, fired: r.fired.length, sent };
}
