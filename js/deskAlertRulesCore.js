// js/deskAlertRulesCore.js: DESK ALERT RULES, the pure half. A rule is a condition on a number the terminal already computes; when it becomes true the desk gets ONE Telegram note.
// No fetch, no KV, no clock of its own (js/deskAlertRules.js runs it every two minutes on the server; js/terminal/alertsView.js is the page).
//
//   rule  { id, kind, params, muted, name?, createdAt, state }      kinds below; `state` is the rule's own memory (never user input)
//   KINDS range_used   a market has used >= pct% of today's forecast median range         source: /api/live-layer (state.range.rows[].used)
//         fed_move     the Fed path's next-meeting priced move shifted >= bp               source: /api/fed-path (zq.meetings[0].moveBp)
//         data_stale   a laptop-fed tile's data age went red (the data-age chip)           source: /api/fed-path (zq.asOf, asOf), thresholds of js/terminal/dataAge.js
//         level_touch  price touched an option wall or a forecast line (the Replay's rule) source: /api/replay/day (js/replayCore.js scanTouches)
//         gap_closed   a market that opened away from Friday's close has come back to it    source: /api/live-layer (indices / EM rows: live, ref, chgPct)
//
// ONE NOTE PER EPISODE: each kind keeps a small memory (armed, baseline, last touch, gap phase) so a condition that stays true does not repeat. On top of that
// every rule has a cooldown, the desk has a daily cap, and there are at most MAX_RULES rules. Wording is description, never a trade instruction: it says what a
// number did, and for the forecast lines that they are an estimate of size, not of direction (the Evidence Book: range and timing validate, direction does not).
import { INSTRUMENTS as REPLAY_INSTRUMENTS, sessionOpen, scanTouches, londonDate, sessionWindow } from './replayCore.js';
import { ageLevel, ageWords } from './terminal/dataAge.js';

export const MAX_RULES = 30, DAILY_CAP = 12, NAME_MAX = 40;
export const LIVE_INDICES = ['NQ', 'SPX', 'DOW', 'RUT'];
export const LIVE_EM = ['USDCNH', 'USDMXN', 'USDZAR', 'USDTRY', 'USDBRL', 'USDINR'];
export const FEEDS = {
  'fed-zq': { label: 'Fed futures strip (the laptop\'s ZQ pull)', warnH: 36, badH: 96 },
  'fed-atlanta': { label: 'Atlanta Fed rate-hike odds', warnH: 36, badH: 96 },
};
const HOUR = 3600e3, MIN = 60e3;
const fin = v => v != null && v !== '' && Number.isFinite(+v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, lo, hi, d) => (fin(v) ? clamp(+v, lo, hi) : d);
const mkt = s => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

/** What each kind needs and how it reads in words. `check` cleans params (or returns null = not a valid rule); `describe` is the rule in a sentence. */
export const KINDS = {
  range_used: { label: 'Range used', cooldownMin: 180, help: 'A market has used this share of its forecast day\'s median range.', fields: [['market', 'text', 'EURUSD'], ['pct', 'number', 80]],
    check: p => { const m = mkt(p.market); return m ? { market: m, pct: Math.round(num(p.pct, 30, 300, 80)) } : null; },
    describe: p => `${p.market} has used ${p.pct}% of today's forecast median range` },
  fed_move: { label: 'Fed path move', cooldownMin: 60, help: 'The Fed path\'s priced move for the next meeting shifts by this many basis points.', fields: [['bp', 'number', 5]],
    check: p => ({ bp: Math.round(num(p.bp, 1, 100, 5) * 10) / 10 }), describe: p => `The Fed path's next-meeting priced move shifts by ${p.bp}bp` },
  data_stale: { label: 'Data gone stale', cooldownMin: 720, help: 'A laptop-fed tile\'s data age goes red (older than its limit).', fields: [['feed', 'feed', 'fed-zq']],
    check: p => (FEEDS[p.feed] ? { feed: p.feed } : null), describe: p => `${FEEDS[p.feed]?.label ?? p.feed} goes very stale` },
  level_touch: { label: 'Level touched', cooldownMin: 15, help: 'Price touches an option wall or a forecast line, by the Replay\'s own rule.', fields: [['market', 'text', 'NQ'], ['which', 'which', 'any']],
    check: p => { const m = mkt(p.market); return REPLAY_INSTRUMENTS[m] ? { market: m, which: ['oi', 'fc', 'any'].includes(p.which) ? p.which : 'any' } : null; },
    describe: p => `${p.market} touches ${p.which === 'oi' ? 'an option wall' : p.which === 'fc' ? 'a forecast line' : 'an option wall or a forecast line'}` },
  gap_closed: { label: 'Weekend gap closed', cooldownMin: 600, help: 'A market that opened the week away from Friday\'s close comes back to it.', fields: [['market', 'text', 'NQ'], ['minPct', 'number', 0.3]],
    check: p => { const m = mkt(p.market); return LIVE_INDICES.includes(m) || LIVE_EM.includes(m) ? { market: m, minPct: Math.round(num(p.minPct, 0.05, 5, 0.3) * 100) / 100 } : null; },
    describe: p => `${p.market} comes back to Friday's close after opening ${p.minPct}% or more away from it` },
};
export const KIND_IDS = Object.keys(KINDS);
export const describeRule = r => (KINDS[r?.kind] ? KINDS[r.kind].describe(r.params) : 'unknown rule');

// ── rules in and out ──
const newId = (now, i = 0) => `a${now.toString(36)}${i}${Math.floor(Math.random() * 1296).toString(36)}`;
/** A rule from a request body: { ok:true, rule } (state empty) or { ok:false, error }. */
export function makeRule(body, now = Date.now()) {
  const k = KINDS[body?.kind];
  if (!k) return { ok: false, error: `Unknown alert kind. Choose one of: ${KIND_IDS.join(', ')}.` };
  const params = k.check(body.params ?? {});
  if (!params) return { ok: false, error: `Those settings do not make a "${k.label}" alert: ${k.help}` };
  const name = String(body.name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, NAME_MAX);
  return { ok: true, rule: { id: newId(now), kind: body.kind, params, muted: false, ...(name ? { name } : {}), createdAt: new Date(now).toISOString(), state: {} } };
}
/** Stored value -> { v:1, rules:[...] } with invalid entries dropped and the cap applied. State is kept as a plain object of numbers, strings and booleans only. */
export function sanitizeStore(raw) {
  const out = [], seen = new Set();
  for (const r of Array.isArray(raw?.rules) ? raw.rules : []) {
    const k = KINDS[r?.kind]; if (!k || out.length >= MAX_RULES) continue;
    const params = k.check(r.params ?? {}); if (!params || typeof r.id !== 'string' || !/^[\w-]{3,30}$/.test(r.id) || seen.has(r.id)) continue;
    seen.add(r.id);
    const st = {}; for (const [a, b] of Object.entries(r.state && typeof r.state === 'object' ? r.state : {})) if (/^\w{1,20}$/.test(a) && (typeof b === 'number' || typeof b === 'boolean' || (typeof b === 'string' && b.length < 40))) st[a] = b;
    out.push({ id: r.id, kind: r.kind, params, muted: !!r.muted, ...(typeof r.name === 'string' && r.name ? { name: r.name.slice(0, NAME_MAX) } : {}), createdAt: typeof r.createdAt === 'string' ? r.createdAt.slice(0, 30) : null, state: st });
  }
  return { v: 1, rules: out, sent: raw?.sent && typeof raw.sent === 'object' ? { day: String(raw.sent.day ?? '').slice(0, 10), n: Math.max(0, Math.round(+raw.sent.n || 0)) } : { day: '', n: 0 } };
}

/** One action on the stored list: add | delete | mute | unmute | rename. Returns { ok, store } or { ok:false, status, error }. */
export function applyAction(store, body, now = Date.now()) {
  const a = String(body?.action ?? '');
  const rules = store.rules.slice();
  if (a === 'add') {
    if (rules.length >= MAX_RULES) return { ok: false, status: 400, error: `At most ${MAX_RULES} alerts: delete one first.` };
    const r = makeRule(body, now); if (!r.ok) return { ok: false, status: 400, error: r.error };
    if (rules.some(x => x.kind === r.rule.kind && JSON.stringify(x.params) === JSON.stringify(r.rule.params))) return { ok: false, status: 400, error: 'That alert already exists.' };
    return { ok: true, store: { ...store, rules: [...rules, r.rule] }, rule: r.rule };
  }
  if (!['delete', 'mute', 'unmute', 'rename'].includes(a)) return { ok: false, status: 400, error: 'Unknown action: add, delete, mute, unmute or rename.' };
  const at = rules.findIndex(x => x.id === body?.id);
  if (at < 0) return { ok: false, status: 404, error: 'No such alert.' };
  if (a === 'delete') { rules.splice(at, 1); return { ok: true, store: { ...store, rules } }; }
  if (a === 'mute' || a === 'unmute') { rules[at] = { ...rules[at], muted: a === 'mute' }; return { ok: true, store: { ...store, rules } }; }
  if (a === 'rename') { const n = String(body.name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, NAME_MAX); const r = { ...rules[at] }; if (n) r.name = n; else delete r.name; rules[at] = r; return { ok: true, store: { ...store, rules } }; }
  return { ok: false, status: 400, error: 'Unknown action: add, delete, mute, unmute or rename.' };
}

// ── the numbers each kind reads ──
const pct1 = v => `${Math.round(v * 10) / 10}`;
const sgn = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v * 10) / 10);

/** Level touches today for one market, from the /api/replay/day payload (the Replay's own functions). [] when the payload has no bars. */
export function touchesFromDay(day) {
  const m1 = Array.isArray(day?.bars) ? day.bars : [], win = day?.win;
  if (!m1.length || !win) return [];
  const open = sessionOpen(m1, win);
  return scanTouches(m1.filter(b => b[0] >= win.start && b[0] < win.end), { oi: day.oi?.entries ?? [], fc: day.forecast, open });
}
export const todayLondon = now => londonDate(now);
export { sessionWindow };

/** The most recent Sunday 00:00 UTC, as a date string: the key for "this FX week". */
export const weekKey = now => new Date(Math.floor(now / 864e5) * 864e5 - new Date(now).getUTCDay() * 864e5).toISOString().slice(0, 10);

// ── evaluating one rule ──
/**
 * ctx = { now, live: /api/live-layer, fed: /api/fed-path, touches: { NQ: [events] } }. A source that is missing (null) leaves the rule untouched.
 * Returns { fire: bool, text?: string, state } where state is the rule's NEW memory (the caller stores it when it changed).
 */
export function evaluate(rule, ctx) {
  const p = rule.params, st = { ...(rule.state ?? {}) }, now = ctx.now ?? Date.now();
  const none = () => ({ fire: false, state: st });
  switch (rule.kind) {
    case 'range_used': {
      const live = ctx.live; if (!live || live.closed !== false) return none();
      const row = live.state?.range?.rows?.find(r => mkt(r.name) === p.market); if (!row || !fin(row.used)) return none();
      const used = +row.used * 100, day = londonDate(now);
      if (st.day !== day) { st.day = day; st.armed = true; }
      if (used < p.pct - 10) st.armed = true;
      if (st.armed !== false && used >= p.pct) { st.armed = false; return { fire: true, state: st, text: `${p.market} has used ${Math.round(used)}% of today's forecast median range${row.hours != null ? ` in ${pct1(row.hours)}h of the day` : ''}. The forecast is an estimate of the size of the day's move, not of its direction.` }; }
      return { fire: false, state: st };
    }
    case 'fed_move': {
      const m = ctx.fed?.zq?.meetings?.[0]; if (!m || !fin(m.moveBp)) return none();
      const cur = +m.moveBp;
      if (st.meeting !== m.meeting || !fin(st.base)) { st.meeting = m.meeting; st.base = cur; return { fire: false, state: st }; }   // first look at this meeting: remember it, say nothing
      if (Math.abs(cur - st.base) >= p.bp) { const was = st.base; st.base = cur; return { fire: true, state: st, text: `The Fed path moved: the ${m.meeting} meeting now prices ${sgn(cur)}bp, it was ${sgn(was)}bp when this alert last looked (a change of ${pct1(Math.abs(cur - was))}bp). Futures-implied pricing, not a forecast of what the Fed will do.` }; }
      return { fire: false, state: st };
    }
    case 'data_stale': {
      const f = FEEDS[p.feed], asOf = p.feed === 'fed-zq' ? ctx.fed?.zq?.asOf : ctx.fed?.asOf; if (!f || !asOf) return none();
      const t = /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? Date.parse(asOf) + 24 * HOUR : Date.parse(asOf); if (!Number.isFinite(t)) return none();
      const h = Math.max(0, (now - t) / HOUR), lvl = ageLevel(h, f);
      if (lvl !== 'bad') { st.armed = true; return { fire: false, state: st }; }
      if (st.armed !== false) { st.armed = false; return { fire: true, state: st, text: `${f.label} has gone very stale: its last data is ${ageWords(h)}. On the terminal the tile shows the red data-age chip. The laptop pull is probably not running.` }; }
      return { fire: false, state: st };
    }
    case 'level_touch': {
      const ev = ctx.touches?.[p.market]; if (!Array.isArray(ev)) return none();
      const last = fin(st.lastT) ? +st.lastT : null, top = ev.reduce((m, e) => Math.max(m, e.t), 0);
      if (last == null) { st.lastT = Math.max(top, now - 0); return { fire: false, state: st }; }   // first look: only touches from now on
      const fresh = ev.filter(e => e.t > last && (p.which === 'any' || e.kind === p.which));
      st.lastT = Math.max(last, top);
      if (!fresh.length) return { fire: false, state: st };
      const lines = fresh.slice(-3).map(e => `${e.label} ${e.price}`).join('; ');
      return { fire: true, state: st, text: `${p.market} touched ${fresh.length === 1 ? 'a level' : `${fresh.length} levels`}: ${lines}. Levels are where price has been drawn to, with no claim about which way it goes next.` };
    }
    case 'gap_closed': {
      const live = ctx.live; if (!live || live.closed !== false) return none();
      const r = live.indices?.rows?.[p.market] ?? (live.em?.pairs?.[p.market] ? { live: live.em.pairs[p.market].live, ref: live.em.pairs[p.market].ref, chgPct: live.em.pairs[p.market].chgLive, refDate: live.em.pairs[p.market].refDate } : null);
      if (!r || !fin(r.live) || !fin(r.ref) || !fin(r.chgPct)) return none();
      const wk = weekKey(now), sinceOpenH = (() => { const d = new Date(now), dow = d.getUTCDay(), h = d.getUTCHours() + d.getUTCMinutes() / 60; return dow === 0 ? Math.max(0, h - 21) : dow === 1 ? h + 3 : 99; })();
      if (st.wk !== wk) {
        st.wk = wk;
        st.phase = sinceOpenH <= 12 && Math.abs(+r.chgPct) >= p.minPct ? 'gap' : 'none';   // only a gap seen at the open counts; a rule that first looks on Wednesday has no gap to watch
        st.sign = +r.chgPct > 0 ? 1 : -1;
        return { fire: false, state: st };
      }
      if (st.phase === 'gap' && (Math.abs(+r.chgPct) <= 0.03 || Math.sign(+r.chgPct) === -st.sign)) { st.phase = 'done'; return { fire: true, state: st, text: `${p.market} has closed the weekend gap: it is back at Friday's close (${r.ref}). A gap closing describes where price has been; it says nothing about what comes next.` }; }
      return { fire: false, state: st };
    }
    default: return none();
  }
}

/**
 * Run every rule. Returns { fired: [{ rule, text }], rules, sent, changed }: `rules` has the new memory, `sent` the day's count.
 * A muted rule does nothing at all (its memory is not advanced, so un-muting starts fresh from the next look). A rule on cooldown still advances its memory but sends nothing,
 * and so does everything past the daily cap.
 */
export function run(store, ctx) {
  const now = ctx.now ?? Date.now(), day = londonDate(now), sent = store.sent?.day === day ? { day, n: store.sent.n } : { day, n: 0 };
  const fired = [];
  let changed = store.sent?.day !== day && store.sent?.n > 0;
  const rules = store.rules.map(r => {
    if (r.muted) return r;
    const o = evaluate(r, { ...ctx, now });
    let st = o.state;
    if (o.fire) {
      const cool = (KINDS[r.kind]?.cooldownMin ?? 60) * MIN, ok = !(fin(st.firedAt) && now - st.firedAt < cool) && sent.n < DAILY_CAP;
      if (ok) { fired.push({ rule: r, text: o.text }); sent.n++; st = { ...st, firedAt: now }; }
    }
    if (JSON.stringify(st) !== JSON.stringify(r.state ?? {})) { changed = true; return { ...r, state: st }; }
    return r;
  });
  if (fired.length) changed = true;
  return { fired, rules, sent, changed };
}
export const noteText = (rule, text) => `🔔 Desk alert${rule.name ? ` · ${rule.name}` : ''}\n${text}\n(${describeRule(rule)})`;
