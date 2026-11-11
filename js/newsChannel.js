/**
 * The shared news channel (owner request 2026-11-11): the desk's tier-1 and tier-2 headlines sent to a SEPARATE Telegram channel that other people can join.
 * Pure functions only (no network, no storage): server.js owns the KV key `news_channel_v1`, the routes and the send; the Desk Terminal News tab owns the settings modal.
 *
 *   channelMessage(h)                 the Telegram HTML note: tier, headline as a link, "Read the article", why, then the LONG and SHORT groups
 *   channelCandidates(wire, now, o)   which headlines qualify (tier by the read, with an impact, recent, not yet sent)
 *   allowChannel(state, id, tier, now)  one note per headline, at most 6 an hour for tier 1 and 10 for tier 2
 *   validateConfig(body, existing)    the bot token and chat id, checked; the token may be omitted to keep the saved one
 *   publicView(cfg)                   what the page may see: never the token, only its last four characters
 *
 * PRIVACY: unlike the desk's own breaking note (js/newsOps.js breakingMessage), this message NEVER carries the desk's live book cards
 * ("supports / against EURUSD long"): those are the owner's positions. LONG and SHORT come only from the news analyst's read of the headline.
 * Context, not a signal.
 */
import { allowAlert } from './newsOps.js';

export const CHANNEL_KV_KEY = 'news_channel_v1';
export const CAPS = { 1: 6, 2: 10 };          // notes an hour, by tier
export const MAX_AGE_MIN = 60;                // a headline older than this is not sent
export const MAX_PER_TICK = 3;                // at most this many sends in one 2-minute pass

/** The analyst's impact keys, in the order shown, with their flag/emoji and a plain name. */
export const MARKETS = [
  ['USD', '🇺🇸', 'USD'], ['EUR', '🇪🇺', 'EUR'], ['GBP', '🇬🇧', 'GBP'], ['JPY', '🇯🇵', 'JPY'], ['AUD', '🇦🇺', 'AUD'], ['NZD', '🇳🇿', 'NZD'], ['CAD', '🇨🇦', 'CAD'], ['CHF', '🇨🇭', 'CHF'],
  ['GOLD', '🥇', 'Gold'], ['OIL', '🛢️', 'Oil'], ['EQUITIES', '📈', 'Equities'], ['CRYPTO', '🪙', 'Crypto'],
];
const ORDER = Object.fromEntries(MARKETS.map(([k], i) => [k, i]));
const META = Object.fromEntries(MARKETS.map(([k, flag, name]) => [k, { flag, name }]));

const esc = x => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };
/** Only a plain http(s) link is allowed into the message, escaped for an attribute. Anything else is dropped. */
export function safeUrl(u) {
  const s = String(u ?? '').trim();
  if (!/^https?:\/\/[^\s<>"']+$/i.test(s) || s.length > 900) return null;
  return s.replace(/&/g, '&amp;');
}
const arrows = (v, up) => (up ? '▲' : '▼').repeat(Math.min(2, Math.abs(v)) || 1);

/** The impact map → { long: [{ key, v }], short: [{ key, v }] }, strongest first, then the fixed market order. Only keys the analyst may use. */
export function groups(impact) {
  const rows = Object.entries(impact ?? {}).filter(([k, v]) => k in ORDER && Number.isFinite(Number(v)) && Number(v) !== 0).map(([key, v]) => ({ key, v: Number(v) }));
  const by = (a, b) => Math.abs(b.v) - Math.abs(a.v) || ORDER[a.key] - ORDER[b.key];
  return { long: rows.filter(r => r.v > 0).sort(by), short: rows.filter(r => r.v < 0).sort(by) };
}
const item = (r, up) => `${META[r.key].flag} ${r.key === META[r.key].name ? r.key : META[r.key].name} ${arrows(r.v, up)}`;

const tierOf = h => (h?.read?.tier ?? h?.tier);
const ukTime = ms => (Number.isFinite(ms) ? new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }) : '');

/** The Telegram note (HTML). Tier 1 is 🚨, tier 2 is 📌. Longs and shorts are grouped; each item has its flag and a ▲/▼ (two = a strong push). No book lines. */
export function channelMessage(h) {
  const tier = tierOf(h) === 1 ? 1 : 2;
  const url = safeUrl(h?.link), title = clip(h?.title, 300);
  const srcList = h?.sources?.length ? h.sources : [h?.source].filter(Boolean);
  const srcs = srcList.slice(0, 3).join(', ');
  const time = ukTime(h?.ms);
  const g = groups(h?.read?.impact);
  const lines = [
    `${tier === 1 ? '🚨' : '📌'} <b>TIER ${tier}</b>${time ? ` · ${time} UK` : ''}`,
    url ? `<a href="${url}"><b>${esc(title)}</b></a>` : `<b>${esc(title)}</b>`,
    url ? `<a href="${url}">→ Read the article</a>${srcList[0] ? ` (${esc(srcList[0])})` : ''}` : null,
    h?.read?.why ? `\nWhy: ${esc(clip(h.read.why, 200))}` : null,
    (g.long.length || g.short.length) ? '' : null,
    g.long.length ? `🟢 <b>LONG</b>   ${g.long.map(r => esc(item(r, true))).join('   ')}` : null,
    g.short.length ? `🔴 <b>SHORT</b>   ${g.short.map(r => esc(item(r, false))).join('   ')}` : null,
    `\n<i>Context, not a signal${srcs ? ` · ${esc(srcs)}` : ''}</i>`,
  ];
  return lines.filter(x => x !== null).join('\n');
}

/** Headlines that qualify: tier in `tiers` by the read, with at least one impact, recent, and not yet sent (in either tier). Oldest first. */
export function channelCandidates(wire, now, { tiers = [1, 2], sent = {}, since = 0 } = {}) {
  const sentIds = new Set([...Object.keys(sent?.[1]?.sent ?? {}), ...Object.keys(sent?.[2]?.sent ?? {})]);
  return (wire ?? []).filter(h => {
    const t = tierOf(h);
    if (!tiers.includes(t) || (t !== 1 && t !== 2)) return false;
    const g = groups(h?.read?.impact); if (!g.long.length && !g.short.length) return false;
    const seen = h.firstSeen ?? h.ms;
    return now - seen <= MAX_AGE_MIN * 60e3 && seen >= since && !sentIds.has(h.id);   // `since`: nothing older than the moment the channel was connected is sent (no flood on connect)
  }).sort((a, b) => a.ms - b.ms);
}

/** One note per headline and a per-tier hourly cap. state = { 1: {sent,times}, 2: {sent,times} }. Returns { ok, why, state }. */
export function allowChannel(state, id, tier, now) {
  const t = tier === 1 ? 1 : 2, r = allowAlert(state?.[t] ?? null, id, now, { perHour: CAPS[t] });
  return { ok: r.ok, why: r.why, state: { ...(state ?? {}), [t]: r.state } };
}

// ── the saved settings ──────────────────────────────────────────────────────────────────────────────────────────────
const TOKEN_RE = /^\d{6,12}:[A-Za-z0-9_-]{30,50}$/;
const CHAT_RE = /^(@[A-Za-z][A-Za-z0-9_]{3,31}|-?\d{5,20})$/;

/** Body { token?, chatId, on?, tiers? } + the saved config → { ok, cfg } or { ok:false, error }. An empty token keeps the saved one. */
export function validateConfig(body, existing = null, now = Date.now()) {
  const b = body && typeof body === 'object' ? body : {};
  const given = typeof b.token === 'string' ? b.token.trim() : '';
  const token = given || existing?.token || '';
  if (!token) return { ok: false, error: 'the bot token is required (from @BotFather)' };
  if (!TOKEN_RE.test(token)) return { ok: false, error: 'that does not look like a bot token (it should look like 123456789:AA... from @BotFather)' };
  const chatId = String(b.chatId ?? existing?.chatId ?? '').trim();
  if (!CHAT_RE.test(chatId)) return { ok: false, error: 'the channel must be @channelname (a public channel) or its number, for example -1001234567890' };
  if (/^@.*bot$/i.test(chatId)) return { ok: false, error: `${chatId} looks like a bot's name (it ends in "bot"). Messages go to a CHANNEL, not to the bot: create a channel, add the bot as an administrator, then enter the channel's @name here (or its -100... number)` };
  const tiers = Array.isArray(b.tiers) ? [...new Set(b.tiers.map(Number).filter(n => n === 1 || n === 2))].sort() : (existing?.tiers ?? [1, 2]);
  if (!tiers.length) return { ok: false, error: 'pick tier 1, or tier 1 and 2' };
  const on = typeof b.on === 'boolean' ? b.on : (existing?.on ?? true);
  return { ok: true, cfg: { v: 1, token, chatId, on, tiers, savedAt: new Date(now).toISOString() } };
}
const NOT_STORED = 'The settings did not reach the permanent store (Cloudflare KV), so they would be lost on the next deploy. Nothing was changed. Try again in a minute; if it repeats, check CF_ACCOUNT_ID and CF_API_TOKEN on Railway.';
const same = (a, b) => !!a && !!b && a.token === b.token && a.chatId === b.chatId && a.on === b.on && JSON.stringify(a.tiers) === JSON.stringify(b.tiers);
/**
 * Save and PROVE it. kv.put() keeps the value in memory alone when the durable backend rejects a write (and says nothing), so "Saved" would be a lie that surfaces at the next
 * deploy. This writes, reads the value back through the strict path (which throws on a backend failure), and only then answers ok. kv = { put, getStrict }.
 */
export async function persistConfig(kv, cfg) {
  try { await kv.put(CHANNEL_KV_KEY, JSON.stringify(cfg)); } catch { return { ok: false, error: NOT_STORED }; }
  let back = null; try { back = parseConfig(await kv.getStrict(CHANNEL_KV_KEY)); } catch { back = null; }
  return same(back, cfg) ? { ok: true } : { ok: false, error: NOT_STORED };
}
/** Disconnect and prove the token is really gone from the store. kv = { del, getStrict }. */
export async function removeConfig(kv) {
  try { await kv.del(CHANNEL_KV_KEY); } catch { return { ok: false, error: 'The saved token could not be deleted from the permanent store. Try again in a minute.' }; }
  let back = null; try { back = parseConfig(await kv.getStrict(CHANNEL_KV_KEY)); } catch { back = { stillThere: true, token: '', chatId: '' }; }
  return back ? { ok: false, error: 'The saved token could not be deleted from the permanent store. Try again in a minute.' } : { ok: true };
}

/** Telegram's error text → plain words saying what to fix, with Telegram's own words kept in brackets. */
export function explainTelegramError(desc) {
  const d = String(desc ?? '').trim();
  const rules = [
    [/can'?t send messages to (the )?bots?/i, "That is the bot's own name. Messages go to a CHANNEL, not to the bot: create a channel, add the bot as an administrator, and enter the channel's @name."],
    [/chat not found/i, 'Telegram cannot find that channel. Check the @name (public channels) or use the -100... number, and make sure the bot has been added to the channel.'],
    [/not a member|was kicked|was blocked/i, 'The bot is not in the channel. Add it to the channel as an administrator.'],
    [/not enough rights|no rights|administrator rights|CHAT_WRITE_FORBIDDEN|can'?t send messages to the channel/i, 'The bot is in the channel but is not allowed to post. In the channel: Administrators, the bot, and allow "Post messages".'],
    [/unauthorized|invalid token|token/i, 'Telegram rejected the bot token. Copy it whole from @BotFather (it looks like 123456789:AA...).'],
    [/too many requests|retry after/i, 'Telegram asked us to slow down. It will try again on the next pass.'],
  ];
  const hit = rules.find(([re]) => re.test(d));
  return hit ? `${hit[1]} (Telegram said: ${d})` : d;
}
export function parseConfig(raw) {
  try { const c = typeof raw === 'string' ? JSON.parse(raw) : raw; return c && typeof c.token === 'string' && typeof c.chatId === 'string' ? c : null; } catch { return null; }
}
/** What the page may see: never the token. */
export const publicView = cfg => (cfg ? { configured: true, chatId: cfg.chatId, on: cfg.on !== false, tiers: cfg.tiers ?? [1, 2], tokenHint: `••••${String(cfg.token).slice(-4)}`, savedAt: cfg.savedAt ?? null } : { configured: false });
