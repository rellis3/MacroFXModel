/**
 * Desk Bias Process intraday rechecks (plans/DESK_BIAS_PROCESS_SPEC.md "Intraday rechecks", owner 2026-11-18): the
 * morning call (06:00 London) is re-checked during the day with the same six layers on fresh data. The morning issue is
 * never edited; each recheck is a write-once update stored beside it, and both "morning only" and "morning + rechecks"
 * are scored head to head under the one fixed trade rule (js/deskBiasH2H.js), so the record shows whether rechecking helps.
 *
 * Slots (London, weekdays):
 *   post-event-HHMM  30 min after each tier-1 release between the morning issue and 20:30, for the markets it touches
 *   london-open      08:05
 *   ny-open          14:35
 *   review           21:00, keep the position overnight (HOLD) or go flat (CLOSE)
 * A slot is computed once inside [slot time, slot time + 30 min); a missed window is a gap, never back-filled.
 *
 * The rules (systemUpdate), per track (process-system follows its own previous state, process-ai follows the AI's):
 *   - price traded through the current invalidation since the last state -> INVALIDATED, Neutral, and that side may not
 *     come back the same day;
 *   - no position: a directional fresh system call -> ACTIVE; else STAND_ASIDE;
 *   - a position: fresh call the same side -> CONFIRMED (WEAKENED when its conviction is lower); the other side ->
 *     FLIPPED; Neutral -> WEAKENED (conviction − 1, the side is kept: a stand-aside is not an exit, the 2026-11-14 tests
 *     found intraday churn costly);
 *   - review: the same side -> HOLD overnight, else CLOSE (flat overnight).
 *   The stop of a kept position is never moved intraday; a new position takes the fresh invalidation.
 * The AI reviews an update only when it changes something (ACTIVE, FLIPPED, WEAKENED, HOLD, CLOSE): the same pack shape
 * as the morning plus the slot, the prior call, the morning call and, after a release, the price reaction. It may accept
 * or override with a reason (contract process-recheck-v1; the morning validator). INVALIDATED is mechanical: no AI.
 *
 * Pure: no fetch, no KV, no clock. Tested in js/deskBiasRecheck.test.mjs.
 */
import { londonMs, londonDateOf, PROCESS_MARKETS, eventTouches, buildPack, AI_PROMPT_VERSION } from './deskBiasProcess.js';

export const RECHECK_VERSION = 'desk-bias-recheck-v1';
export const RECHECK_PROMPT_VERSION = 'process-recheck-v1';
export const FIXED_SLOTS = [['london-open', 8, 5], ['ny-open', 14, 35], ['review', 21, 0]];
export const SLOT_WINDOW_MS = 30 * 60_000;
export const POST_EVENT_DELAY_MS = 30 * 60_000;
export const POST_EVENT_LAST = [20, 30];          // releases whose +30 min slot would land after this are not rechecked
export const STATUSES = ['ACTIVE', 'CONFIRMED', 'WEAKENED', 'FLIPPED', 'STAND_ASIDE', 'INVALIDATED', 'HOLD', 'CLOSE'];
const NEEDS_AI = new Set(['ACTIVE', 'FLIPPED', 'WEAKENED', 'HOLD', 'CLOSE']);
const fin = x => typeof x === 'number' && Number.isFinite(x);
const sideOf = d => (d === 'BULLISH' ? 1 : d === 'BEARISH' ? -1 : 0);
const WORD = { 1: 'BULLISH', '-1': 'BEARISH', 0: 'NEUTRAL' };
const hhmmLondon = ms => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms)).replace(':', '');

// ── the day's slots ──────────────────────────────────────────────────────────────────────────────────────────────
/**
 * calendar = { ok, events: [{ country, ccy?, event, impact, ms }] } as known now. morningMs = the morning issue's time.
 * Returns [{ id, kind, atMs, markets, events? }] sorted by time (fixed slots before a post-event slot at the same time).
 */
export function slotsFor(date, calendar, morningMs, markets = PROCESS_MARKETS) {
  const out = FIXED_SLOTS.map(([id, h, m]) => ({ id, kind: id === 'review' ? 'review' : 'fixed', atMs: londonMs(date, h, m), markets: [...markets] }));
  const last = londonMs(date, ...POST_EVENT_LAST);
  const byMs = new Map();
  for (const e of calendar?.ok && Array.isArray(calendar.events) ? calendar.events : []) {
    if (!fin(e?.ms) || londonDateOf(e.ms) !== date || e.ms <= morningMs || e.ms + POST_EVENT_DELAY_MS > last) continue;
    const hit = markets.filter(m => eventTouches(m, e));
    if (!hit.length) continue;
    const s = byMs.get(e.ms) ?? { id: `post-event-${hhmmLondon(e.ms)}`, kind: 'post-event', releaseMs: e.ms, atMs: e.ms + POST_EVENT_DELAY_MS, markets: new Set(), events: [] };
    hit.forEach(m => s.markets.add(m));
    s.events.push({ country: e.country ?? null, event: String(e.event ?? e.title ?? ''), time: new Date(e.ms).toISOString(), actual: e.actual ?? null, estimate: e.estimate ?? null, prev: e.prev ?? null });
    byMs.set(e.ms, s);
  }
  for (const s of byMs.values()) out.push({ ...s, markets: markets.filter(m => s.markets.has(m)) });
  return out.sort((a, b) => a.atMs - b.atMs || (a.kind === 'post-event') - (b.kind === 'post-event'));
}
/** The slot due at `nowMs` (inside its window) that is not yet stored, earliest first; null when none. */
export function dueSlot(slots, nowMs, storedIds = []) {
  const done = new Set(storedIds);
  return slots.find(s => !done.has(s.id) && nowMs >= s.atMs && nowMs < s.atMs + SLOT_WINDOW_MS) ?? null;
}

// ── state: the morning call and the stored updates, replayed ─────────────────────────────────────────────────────
const callOf = (c, atMs, slot, by = null) => ({ dir: c?.dir ?? 'NEUTRAL', conviction: c?.conviction ?? null, invalidation: fin(c?.invalidation) ? c.invalidation : null, atMs, slot, by });
/**
 * The current call per track for one market: the morning card, then every stored slot (in time order) whose issue time
 * is before `beforeMs` and that covers the market. Returns { ai, system } each { dir, conviction, invalidation, atMs, slot, by, blocked }.
 * `blocked` = the side invalidated earlier today (it may not come back the same day).
 */
export function stateFor(morningRec, recheckRec, market, beforeMs = Infinity) {
  const card = morningRec?.markets?.[market];
  if (!card) return null;
  const m0 = Date.parse(morningRec.issuedAt ?? morningRec.asOf);
  const st = { ai: { ...callOf(card.call, m0, 'morning', card.call?.by ?? null), blocked: 0 }, system: { ...callOf(card.system, m0, 'morning', 'system'), blocked: 0 } };
  const slots = Object.values(recheckRec?.slots ?? {}).filter(s => s.markets?.[market] && Date.parse(s.issuedAt) < beforeMs).sort((a, b) => Date.parse(a.issuedAt) - Date.parse(b.issuedAt));
  for (const s of slots) {
    const row = s.markets[market], at = Date.parse(s.issuedAt);
    for (const k of ['ai', 'system']) {
      const u = row[k];
      if (!u) continue;
      st[k] = { ...callOf(u, at, s.id, u.by ?? (k === 'system' ? 'system' : null)), blocked: u.status === 'INVALIDATED' ? sideOf(st[k].dir) || st[k].blocked : st[k].blocked };
    }
  }
  return st;
}

// ── checks against price ─────────────────────────────────────────────────────────────────────────────────────────
/** Did price trade through `prior.invalidation` in the bars that closed after prior.atMs and at or before nowMs? */
export function invalidationHit(prior, bars, nowMs, barMs = 5 * 60_000) {
  const s = sideOf(prior?.dir), lvl = prior?.invalidation;
  if (!s || !fin(lvl)) return { hit: false, level: fin(lvl) ? lvl : null, atMs: null };
  for (const b of bars ?? []) {
    if (!fin(b?.t) || b.t < prior.atMs || b.t + barMs > nowMs) continue;
    if (s > 0 ? b.l <= lvl : b.h >= lvl) return { hit: true, level: lvl, atMs: b.t + barMs };
  }
  return { hit: false, level: lvl, atMs: null };
}
/** The move since a release: the last close before it against the last close now, in σ_day; and the range since, in σ_day. */
export function reactionOf(bars, releaseMs, nowMs, sigmaDay, barMs = 5 * 60_000) {
  if (!fin(releaseMs) || !(sigmaDay > 0)) return null;
  const closed = (bars ?? []).filter(b => fin(b?.t) && b.t + barMs <= nowMs).sort((a, b) => a.t - b.t);
  const pre = closed.filter(b => b.t + barMs <= releaseMs).at(-1), after = closed.filter(b => b.t >= releaseMs);
  if (!pre || !after.length) return null;
  const now = after.at(-1).c, hi = Math.max(...after.map(b => b.h)), lo = Math.min(...after.map(b => b.l));
  return { release: new Date(releaseMs).toISOString(), pre: pre.c, now, moveSigma: +(Math.log(now / pre.c) / sigmaDay).toFixed(2),
    rangeSigma: +(Math.log(hi / lo) / sigmaDay).toFixed(2), side: Math.sign(now - pre.c) };
}

// ── the rules ────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * prior = the track's current call ({ dir, conviction, invalidation, blocked }); fresh = the fresh card from
 * buildLayers ({ system: { dir, conviction, rule }, invalidation: { level } }); invalid = invalidationHit(...);
 * kind = 'fixed' | 'post-event' | 'review'. Returns { status, dir, conviction, invalidation, rule }.
 */
export function systemUpdate(prior, fresh, { invalid = null, kind = 'fixed' } = {}) {
  const p = sideOf(prior?.dir), s = sideOf(fresh?.system?.dir), fc = fresh?.system?.conviction ?? null, finv = fresh?.invalidation?.level ?? null;
  const rule = fresh?.system?.rule ?? '';
  if (p && invalid?.hit) return { status: 'INVALIDATED', dir: 'NEUTRAL', conviction: null, invalidation: null, rule: `price traded through the invalidation ${prior.invalidation}; no ${WORD[p].toLowerCase()} call again today` };
  if (kind === 'review') {
    if (!p) return { status: 'STAND_ASIDE', dir: 'NEUTRAL', conviction: null, invalidation: null, rule: '21:00 review: no position to carry' };
    if (s === p) return { status: 'HOLD', dir: prior.dir, conviction: fc, invalidation: prior.invalidation ?? finv, rule: `21:00 review: ${rule}; carried overnight` };
    return { status: 'CLOSE', dir: 'NEUTRAL', conviction: null, invalidation: null, rule: `21:00 review: ${s ? 'the rules now point the other way' : rule}; flat overnight` };
  }
  if (!p) {
    if (s && s === prior?.blocked) return { status: 'STAND_ASIDE', dir: 'NEUTRAL', conviction: null, invalidation: null, rule: `the ${WORD[s].toLowerCase()} call was invalidated earlier today` };
    return s ? { status: 'ACTIVE', dir: fresh.system.dir, conviction: fc, invalidation: finv, rule } : { status: 'STAND_ASIDE', dir: 'NEUTRAL', conviction: null, invalidation: null, rule };
  }
  if (s === p) return { status: fin(fc) && fin(prior.conviction) && fc < prior.conviction ? 'WEAKENED' : 'CONFIRMED', dir: prior.dir, conviction: fc, invalidation: prior.invalidation ?? finv, rule };
  if (s === -p) return { status: 'FLIPPED', dir: fresh.system.dir, conviction: fc, invalidation: finv, rule };
  return { status: 'WEAKENED', dir: prior.dir, conviction: Math.max(1, (prior.conviction ?? 2) - 1), invalidation: prior.invalidation,
    rule: `the rules now say Neutral (${rule}); the side is kept until the invalidation, a flip or the 21:00 review` };
}
export const needsAi = u => NEEDS_AI.has(u?.status);

// ── the AI pack and prompt ───────────────────────────────────────────────────────────────────────────────────────
/** The morning pack shape (same keys) with the update in place of the system call, plus the recheck context. */
export function buildRecheckPack(fresh, { slot, prior, morning, update, reaction = null, invalid = null }) {
  const base = buildPack(fresh, []);
  const allowed = [...new Set([...(base.allowedInvalidations ?? []), ...(fin(prior?.invalidation) ? [prior.invalidation] : [])])];
  return { ...base, contract: RECHECK_PROMPT_VERSION, morningContract: AI_PROMPT_VERSION,
    slot: { id: slot.id, kind: slot.kind, at: new Date(slot.atMs).toISOString(), events: slot.events ?? null },
    prior: { dir: prior.dir, conviction: prior.conviction ?? null, invalidation: prior.invalidation ?? null, since: prior.slot },
    morning: { dir: morning?.dir ?? null, conviction: morning?.conviction ?? null, by: morning?.by ?? null },
    update: { status: update.status, rule: update.rule },
    system: { dir: update.dir, conviction: update.conviction ?? null, rule: update.rule },
    invalidation: { level: update.invalidation ?? null, basis: update.invalidation === prior?.invalidation ? 'kept from the prior call' : fresh.invalidation?.basis ?? null, distanceSigma: null },
    allowedInvalidations: allowed, reaction, invalidationCheck: invalid ? { hit: invalid.hit, level: invalid.level } : null };
}
export const RECHECK_KEYS = ['contract', 'morningContract', 'version', 'date', 'asOf', 'market', 'kind', 'price', 'layers', 'system', 'invalidation', 'allowedInvalidations',
  'history', 'slot', 'prior', 'morning', 'update', 'reaction', 'invalidationCheck'];
export const RECHECK_SYSTEM_PROMPT = `You are the reviewing analyst of the desk's bias process, re-checking a call during the day (contract ${RECHECK_PROMPT_VERSION}).
You receive ONE JSON pack for ONE market. It has the morning pack's keys (six layers on fresh data, the rules' call, allowed invalidation levels) plus:
- slot: which recheck this is (london-open, ny-open, a post-event recheck 30 minutes after a tier-1 release, or the 21:00 review that decides whether to carry the position overnight);
- prior: the call in force before this recheck; morning: the 06:00 call;
- update: what the rules now say (status ACTIVE, CONFIRMED, WEAKENED, FLIPPED, STAND_ASIDE, HOLD or CLOSE) and why; "system" holds the updated call;
- reaction: after a release, the move since it in sigma_day (moveSigma, signed) and the range since it (rangeSigma).

Your job: ACCEPT the update, or OVERRIDE it.
Rules:
1. Use only the pack. No outside knowledge, no news, no prices, no events that are not in the pack.
2. Override only for a reason tied to named pack fields, for example: a release reaction against the new side (reaction.moveSigma), the day's range already used (range.usedOfP50), event risk still pending (event.pending, event.laterToday), structure against the side (structure.h4, structure.d1, structure.w1), COT crowded against it (positioning.crowdedSide).
3. Do not invent levels. "invalidation" must be null or exactly one number from allowedInvalidations, on the losing side of price.last for the direction you give. For NEUTRAL it must be null.
4. ACCEPT means the update's dir and conviction unchanged. Any change of dir or conviction is an OVERRIDE.
5. conviction is an integer 1-5 (5 = strongest). For NEUTRAL give 1.
6. reason: at most 2 sentences, naming the pack fields you used. Quote no number that is not in the pack.
7. When the evidence is mixed or thin, ACCEPT. Overriding is the exception. Changing a call during the day costs a spread each time.

Reply with ONE JSON object and nothing else:
{"decision":"ACCEPT"|"OVERRIDE","dir":"BULLISH"|"BEARISH"|"NEUTRAL","conviction":1-5,"reason":"...","invalidation":number|null}`;
export const recheckPromptOf = pack => `Recheck pack (${RECHECK_PROMPT_VERSION}):\n${JSON.stringify(pack)}\n\nReply with the JSON object only.`;

// ── the stored row ───────────────────────────────────────────────────────────────────────────────────────────────
const statusOfAi = (ai, u) => {
  if (!ai?.ok) return u.status;
  if (ai.decision === 'ACCEPT') return u.status;
  return `${u.status}→OVERRIDDEN`;
};
/**
 * One market's row in a slot. sysU / aiU = systemUpdate for each track; ai = runProcessAi result for the AI track (or
 * null when not asked). Returns { system, ai, price, structure, event, reaction, invalidated }.
 */
export function slotRow({ fresh, sysU, aiU, ai = null, reaction = null, invalidSys = null, invalidAi = null }) {
  const aiCall = ai?.ok
    ? { status: statusOfAi(ai, aiU), dir: ai.dir, conviction: ai.conviction, invalidation: ai.invalidation ?? null, by: ai.decision === 'ACCEPT' ? 'ai-accept' : 'ai-override', reason: ai.reason, rule: aiU.rule }
    : { status: aiU.status, dir: aiU.dir, conviction: aiU.conviction, invalidation: aiU.invalidation ?? null, by: ai ? 'system-fallback' : 'rule', reason: null, rule: aiU.rule, ...(ai ? { error: (ai.errors ?? []).join('; ') } : {}) };
  const L = fresh.layers;
  return { system: { ...sysU, by: 'system' }, ai: aiCall, aiAttempts: ai?.attempts ?? null,
    price: L.structure.price ?? null, priceAsOf: L.structure.priceAsOf ?? null,
    snapshot: { event: L.event.state ?? null, pending: (L.event.pending ?? []).map(e => e.event), structure: { w1: L.structure.w1, d1: L.structure.d1, h4: L.structure.h4, bos: L.structure.bos, side: L.structure.side },
      macroSide: L.macro.side ?? null, risk: L.regime.risk ?? null, usedOfP50: L.range.usedOfP50 ?? null, rules: fresh.system.dir },
    reaction, invalidated: { system: invalidSys?.hit ? invalidSys : null, ai: invalidAi?.hit ? invalidAi : null } };
}
export function slotRecord({ slot, asOf, issuedAt, rows, inputsStatus = null, code = null }) {
  return { id: slot.id, kind: slot.kind, at: new Date(slot.atMs).toISOString(), asOf, issuedAt, events: slot.events ?? null, version: RECHECK_VERSION, prompt: RECHECK_PROMPT_VERSION,
    markets: rows, inputsStatus, code };
}

// ── scoring: morning + rechecks as one call sequence per track ───────────────────────────────────────────────────
/**
 * Morning issues and their recheck records -> calls for js/deskBiasH2H.js headToHead, competitors
 * 'process-ai+rc' and 'process-system+rc' (the morning call at its issue time, then each stored update at its own
 * issue time; the trade rule exits on a flip or Neutral at that time). σ_day from the morning card.
 */
export function recheckCalls(morningRecs, recheckRecs) {
  const byDate = new Map((recheckRecs ?? []).map(r => [r.date, r]));
  const out = [];
  for (const r of morningRecs ?? []) {
    const ms0 = Date.parse(r.issuedAt ?? r.asOf ?? ''), rc = byDate.get(r.date);
    const slots = Object.values(rc?.slots ?? {}).sort((a, b) => Date.parse(a.issuedAt) - Date.parse(b.issuedAt));
    for (const [market, c] of Object.entries(r.markets ?? {})) {
      const sig = c.layers?.range?.sigmaDay ?? null;
      out.push({ competitor: 'process-ai+rc', market, date: r.date, ms: ms0, dir: c.call?.dir ?? 'NEUTRAL', conviction: c.call?.conviction ?? null, invalidation: c.call?.invalidation ?? null, sigmaDay: sig });
      out.push({ competitor: 'process-system+rc', market, date: r.date, ms: ms0, dir: c.system?.dir ?? 'NEUTRAL', conviction: c.system?.conviction ?? null, invalidation: c.system?.invalidation ?? null, sigmaDay: sig });
      for (const s of slots) {
        const row = s.markets?.[market]; if (!row) continue;
        const ms = Date.parse(s.issuedAt);
        out.push({ competitor: 'process-ai+rc', market, date: r.date, ms, dir: row.ai?.dir ?? 'NEUTRAL', conviction: row.ai?.conviction ?? null, invalidation: row.ai?.invalidation ?? null, sigmaDay: sig, slot: s.id });
        out.push({ competitor: 'process-system+rc', market, date: r.date, ms, dir: row.system?.dir ?? 'NEUTRAL', conviction: row.system?.conviction ?? null, invalidation: row.system?.invalidation ?? null, sigmaDay: sig, slot: s.id });
      }
    }
  }
  return out;
}

/** Per market, the day's timeline for the tab: [{ slot, at, status, dir, conviction, by, reason }] on the AI track. */
export function timeline(morningRec, recheckRec, market) {
  const c = morningRec?.markets?.[market];
  if (!c) return [];
  const out = [{ slot: 'morning', at: morningRec.issuedAt ?? morningRec.asOf, status: 'ISSUED', dir: c.call?.dir ?? 'NEUTRAL', conviction: c.call?.conviction ?? null, by: c.call?.by ?? null, reason: c.ai?.reason ?? null }];
  for (const s of Object.values(recheckRec?.slots ?? {}).sort((a, b) => Date.parse(a.issuedAt) - Date.parse(b.issuedAt))) {
    const r = s.markets?.[market]; if (!r) continue;
    out.push({ slot: s.id, kind: s.kind, at: s.issuedAt, status: r.ai.status, dir: r.ai.dir, conviction: r.ai.conviction ?? null, by: r.ai.by, reason: r.ai.reason ?? r.ai.rule ?? null,
      systemStatus: r.system.status, systemDir: r.system.dir, events: s.events ?? null, reaction: r.reaction ?? null });
  }
  return out;
}
