// js/terminal/helixScoreCore.js: HELIX MEMORY, the scoring half. Pure (no fetch, no DOM, no clock of its own); the server's evening job (js/helixMemoryRoutes.js) does the reading and writing.
// Helix's broadcast says things about the day that the close can check ("gold is up 1.2 percent, twice its usual move", "a quiet start", "CPI came in above the 3.1 expected",
// "moving as one: the euro moves with the pound..."). Each such sentence is tagged when it is WRITTEN with a machine-readable claim (the planner and the scenes add { kind, ... };
// collectClaims() gathers them from the plan into the daily record). Here each claim is checked against what happened by the close, and the hit-rates per kind are summed with a
// Wilson interval. DESCRIPTION ONLY: scoring a description is calibration (did the words still describe the day by the close?), not a trading record. No P&L anywhere.
import { num } from './eveningCore.js';
import { ccyOfCountry } from './dayAheadCore.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
const r3 = v => (fin(v) ? Math.round(v * 1000) / 1000 : null);
const median = a => { const s = a.filter(fin).sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

/**
 * The claim kinds, what each says, and the rule the close is held to. A kind is checked only on the parts named in `parts` (a state claim made in the evening is the close already).
 */
export const CLAIM_KINDS = {
  mover_big: { label: 'A big move so far', says: 'X is up/down N percent, K times its usual move (the lead)', rule: "did X finish the day past its usual high-to-low range (the vol model's median day)?", parts: ['morning', 'afternoon'] },
  quiet_start: { label: 'A quiet start', says: 'a quiet start: most markets barely moving (the lead)', rule: 'was the day quiet: did the median market finish inside its usual high-to-low range?', parts: ['morning', 'afternoon'] },
  range_used: { label: 'Range already used', says: 'X has already used P percent of its typical range (the ranges scene)', rule: 'did X finish past its typical range?', parts: ['morning', 'afternoon'] },
  net_as_one: { label: 'Moving as one', says: 'moving as one: X moves with Y and against Z (the network scene)', rule: "did the group keep its usual signs today: at least two thirds of the members moved the way their correlation with the anchor says?", parts: ['morning', 'afternoon'] },
  release_vs_expected: { label: 'Release vs forecast', says: 'X came in at A, above/below/in line with the F expected (the evening releases scene)', rule: "does the calendar's final actual against its forecast say the same (above / below / in line)?", parts: ['morning', 'afternoon', 'evening'] },
  release_reaction: { label: 'Release reaction held', says: 'in the half hour after, the currency rose/fell P percent (the evening releases scene)', rule: "from the release to the close, was the currency's move still the same way as its first half hour?", parts: ['evening'] },
};
export const KIND_IDS = Object.keys(CLAIM_KINDS);
const KEY_RE = /^[A-Z0-9_]{2,12}$/, CCY_RE = /^[A-Z]{3}$/;
const clip = (s, n) => (s == null ? null : String(s).slice(0, n));
const numOr = v => (fin(+v) && v !== null && v !== '' ? +v : null);

/** One claim made safe for the record (unknown kinds dropped, every field typed and clipped). */
export function cleanClaim(c) {
  if (!c || typeof c !== 'object' || !CLAIM_KINDS[c.kind]) return null;
  const o = { kind: c.kind, id: clip(c.id, 80), part: /^[a-z]{3,12}$/.test(String(c.part ?? '')) ? c.part : null, item: Number.isInteger(c.item) ? c.item : null, spoken: c.spoken !== false };
  if (c.key != null && KEY_RE.test(String(c.key))) o.key = String(c.key);
  for (const k of ['ratio', 'oc', 'hl', 'range', 'used', 'quiet', 'n', 'todShare', 'ms', 'movePct', 'sign']) { const v = numOr(c[k]); if (v != null) o[k] = v; }
  if (c.ccy != null && CCY_RE.test(String(c.ccy))) o.ccy = String(c.ccy);
  if (c.pair != null && KEY_RE.test(String(c.pair))) o.pair = String(c.pair);
  if (c.anchor != null && KEY_RE.test(String(c.anchor))) o.anchor = String(c.anchor);
  if (Array.isArray(c.members)) o.members = c.members.slice(0, 12).map(m => ({ k: String(m?.k ?? ''), r: numOr(m?.r) })).filter(m => KEY_RE.test(m.k) && m.r != null);
  if (['above', 'below', 'inline'].includes(c.dir)) o.dir = c.dir;
  for (const k of ['name', 'actual', 'forecast', 'hm', 'cue']) if (c[k] != null) o[k] = clip(c[k], 120);
  return o;
}
export const cleanClaims = a => (Array.isArray(a) ? a.slice(0, 60).map(cleanClaim).filter(Boolean) : []);

/**
 * The claims of one plan (planBroadcast's { items }): a lead item carries x.lead.claim, a scene carries x.scene.claims. A claim with a `cue` counts as spoken only when the item's final
 * text still holds the cue (the quick cut may have trimmed the sentence away). Each gets an id (kind:key, numbered when repeated) and the item index. part = the programme's part of day.
 */
export function collectClaims(P, part = 'morning') {
  const out = [], seen = new Map();
  (P?.items ?? []).forEach((x, i) => {
    const list = [x?.lead?.claim, ...(Array.isArray(x?.scene?.claims) ? x.scene.claims : [])].filter(Boolean);
    for (const c0 of list) {
      const text = typeof x.text === 'string' ? x.text : '', spoken = c0.cue ? text.includes(c0.cue) : !!text;
      const base = `${c0.kind}:${c0.key ?? c0.anchor ?? c0.ccy ?? 'day'}${c0.hm ? `@${c0.hm}` : ''}`, k = (seen.get(base) ?? 0) + 1; seen.set(base, k);
      const c = cleanClaim({ ...c0, id: k > 1 ? `${base}#${k}` : base, part, item: i, spoken }); if (c) out.push(c);
    }
  });
  return out;
}

// ── the close ──
/**
 * The close snapshot from the vol forecaster's live session (/api/vol-forecast/live, i.e. getSessionStatus()): per market { oc, hl, range (hl_median), noise (oc_median), ratio = oc / noise }.
 * { ok, sessionDate, rows } or { ok: false, why } when the session is not today's (a stale or fallback session would score the wrong day).
 */
export function closeRows(status, date) {
  const inst = status?.instruments; if (!inst || typeof inst !== 'object') return { ok: false, why: 'no live session' };
  if (date && status.session_date && status.session_date !== date) return { ok: false, why: `the live session is ${status.session_date}, not ${date}` };
  const rows = {};
  for (const [k, v] of Object.entries(inst)) {
    if (!KEY_RE.test(k)) continue;
    const oc = numOr(v?.oc), hl = numOr(v?.hl), range = numOr(v?.forecast?.hl_median), noise = numOr(v?.forecast?.oc_median);
    if (oc == null && hl == null) continue;
    rows[k] = { oc: r3(oc), hl: r3(hl), range: r3(range), noise: r3(noise), ratio: oc != null && noise > 0 ? r3(oc / noise) : null };
  }
  return Object.keys(rows).length ? { ok: true, sessionDate: status.session_date ?? date ?? null, rows } : { ok: false, why: 'no market in the live session' };
}

// ── the rules ──
const res = (hit, why, detail = {}) => ({ hit, why, detail });
const nope = why => res(null, why);
const sameName = (a, b) => { const w = s => new Set(String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(x => x.length > 2)); const A = w(a), B = w(b); let n = 0; for (const x of A) if (B.has(x)) n++; return n >= Math.min(2, A.size, B.size) && n > 0; };
const dirOf = (a, f) => { const na = num(a), nf = num(f); if (na == null || nf == null) return null; return na > nf ? 'above' : na < nf ? 'below' : 'inline'; };
/** Chance that two markets correlated r share today's sign (bivariate normal): 1/2 + asin(r)/pi. */
export const signAgreeChance = r => 0.5 + Math.asin(Math.max(-1, Math.min(1, r))) / Math.PI;

/**
 * One claim against the day. ctx = { close: { rows } | null, events: [{ ms, country, event, actual, estimate }] | null, bars: { PAIR: [{ t (s), o, c }] } }.
 * Returns { hit: true | false | null (cannot be checked), why, detail }.
 */
export function scoreClaim(c, ctx = {}) {
  const rows = ctx.close?.rows ?? null;
  switch (c?.kind) {
    case 'mover_big': case 'range_used': {
      const r = rows?.[c.key]; if (!r) return nope('no close for that market');
      if (!(r.range > 0) || r.hl == null) return nope('no usual range for that market');
      const held = r.ratio != null && fin(c.ratio) ? Math.sign(r.ratio) === Math.sign(c.ratio) && Math.abs(r.ratio) >= 1 : null;
      return res(r.hl >= r.range, r.hl >= r.range ? 'finished past its usual range' : 'finished inside its usual range', { hl: r.hl, range: r.range, usedAtClose: r3(r.hl / r.range), closeRatio: r.ratio, held });
    }
    case 'quiet_start': {
      const u = Object.values(rows ?? {}).filter(r => r.range > 0 && r.hl != null).map(r => r.hl / r.range); if (u.length < 5) return nope('fewer than five markets with a usual range');
      const m = median(u), over = u.filter(x => x >= 1).length;
      return res(m < 1, m < 1 ? 'the median market stayed inside its usual range' : 'the median market ran past its usual range', { medianUsed: r3(m), over, n: u.length });
    }
    case 'net_as_one': {
      const a = rows?.[c.anchor]?.oc; if (!fin(a) || a === 0) return nope('no close move for the anchor');
      const m = (c.members ?? []).map(x => ({ ...x, oc: rows?.[x.k]?.oc })).filter(x => fin(x.oc) && x.oc !== 0); if (m.length < 2) return nope('fewer than two members with a close move');
      const agree = m.filter(x => Math.sign(a * x.oc) === Math.sign(x.r)).length, share = agree / m.length, chance = m.reduce((s, x) => s + signAgreeChance(Math.abs(x.r)), 0) / m.length;
      return res(share >= 2 / 3, `${agree} of ${m.length} members moved the usual way against ${c.anchor}`, { agree, n: m.length, share: r3(share), chance: r3(chance) });
    }
    case 'release_vs_expected': {
      const ev = (ctx.events ?? []).filter(e => fin(+e?.ms) && Math.abs(+e.ms - c.ms) <= 10 * 60e3 && (!c.ccy || ccyOfCountry(e.country) === c.ccy) && e.actual != null && String(e.actual).trim() !== '');
      const e = ev.find(x => sameName(x.event, c.name)) ?? (ev.length === 1 ? ev[0] : null); if (!e) return nope('the release is not in the calendar with an actual');
      const d = dirOf(e.actual, e.estimate ?? e.forecast); if (!d) return nope('the calendar has no comparable forecast');
      return res(d === c.dir, d === c.dir ? `the calendar agrees: ${d}` : `the calendar says ${d}, Helix said ${c.dir}`, { actual: String(e.actual), forecast: String(e.estimate ?? e.forecast), calendarDir: d });
    }
    case 'release_reaction': {
      if (!fin(c.movePct) || Math.abs(c.movePct) < 0.02) return nope('the first half hour barely moved');
      const b = ctx.bars?.[c.pair]; if (!Array.isArray(b) || !b.length) return nope('no bars for that pair');
      const b0 = b.find(x => x.t * 1000 >= c.ms - 1000 && x.t * 1000 < c.ms + 15 * 60e3), last = b[b.length - 1];
      if (!b0 || !(b0.o > 0) || !(last?.c > 0) || last.t <= b0.t) return nope('the bars do not cover the release to the close');
      const toClose = (last.c / b0.o - 1) * 100 * (c.sign === -1 ? -1 : 1);
      return res(Math.sign(toClose) === Math.sign(c.movePct), Math.sign(toClose) === Math.sign(c.movePct) ? 'the move kept its way to the close' : 'the move had turned by the close', { firstHalfHour: r3(c.movePct), toClose: r3(toClose) });
    }
    default: return nope('unknown kind');
  }
}

/**
 * A day's record (helix/days/<date>.json: { date, runs: { part: { claims } } }) scored: every spoken claim on a part its kind is checked on. The score file (helix/scores/<date>.json):
 * { date, scoredAt, close: { sessionDate, rows }, results: [{ id, kind, part, key, hit, why, detail }], counts: { kind: [hits, checked] }, unscorable }.
 */
export function scoreDay(record, ctx = {}, { now = Date.now() } = {}) {
  const results = [];
  for (const [part, run] of Object.entries(record?.runs ?? {})) {
    for (const c of cleanClaims(run?.claims)) {
      if (!c.spoken || !CLAIM_KINDS[c.kind].parts.includes(part)) continue;
      const s = scoreClaim(c, ctx);
      results.push({ id: c.id, kind: c.kind, part, key: c.key ?? c.anchor ?? c.ccy ?? null, said: c.cue ?? null, hit: s.hit, why: s.why, detail: s.detail });
    }
  }
  const counts = {}; let unscorable = 0;
  for (const r of results) { if (r.hit == null) { unscorable++; continue; } const k = (counts[r.kind] ??= [0, 0]); k[1]++; if (r.hit) k[0]++; }
  return { date: record?.date ?? null, scoredAt: new Date(now).toISOString(), close: ctx.close?.ok ? { sessionDate: ctx.close.sessionDate, rows: ctx.close.rows } : null, results, counts, unscorable,
    note: 'Calibration of what Helix said against the close. A description checked, not a trading record.' };
}

/** Wilson score interval for k hits in n (95% by default): { rate, lo, hi } or nulls when n = 0. */
export function wilson(k, n, z = 1.96) {
  if (!(n > 0)) return { rate: null, lo: null, hi: null };
  const p = k / n, z2 = z * z, d = 1 + z2 / n, c = (p + z2 / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / d;
  return { rate: r3(p), lo: r3(Math.max(0, c - h)), hi: r3(Math.min(1, c + h)) };
}

/**
 * The rolling scorecard (helix/scores/_summary.json): days: { date: counts } (a re-scored day replaces its entry; only the last `keepDays` dates are kept) and per kind
 * { label, rule, n, hits, rate, lo, hi, days } over all kept days, plus the chance baseline the net claims carry. Description calibration, not a P&L.
 */
export function mergeSummary(prev, score, { keepDays = 180, now = Date.now() } = {}) {
  const days = { ...(prev?.days ?? {}) }, chance = { ...(prev?.chance ?? {}) };
  if (score?.date) {
    days[score.date] = score.counts ?? {};
    const ch = (score.results ?? []).filter(r => r.kind === 'net_as_one' && r.hit != null && fin(r.detail?.chance)).map(r => r.detail.chance);
    if (ch.length) chance[score.date] = r3(ch.reduce((a, b) => a + b, 0) / ch.length); else delete chance[score.date];
  }
  const keep = Object.keys(days).sort().slice(-keepDays), kept = Object.fromEntries(keep.map(d => [d, days[d]])), keptChance = Object.fromEntries(keep.filter(d => d in chance).map(d => [d, chance[d]]));
  const kinds = {};
  for (const id of KIND_IDS) {
    let hits = 0, n = 0, nd = 0; for (const d of keep) { const c = kept[d]?.[id]; if (Array.isArray(c) && c[1] > 0) { hits += c[0]; n += c[1]; nd++; } }
    kinds[id] = { label: CLAIM_KINDS[id].label, rule: CLAIM_KINDS[id].rule, n, hits, days: nd, ...wilson(hits, n) };
  }
  const cv = Object.values(keptChance); if (cv.length) kinds.net_as_one.chancePerMember = r3(cv.reduce((a, b) => a + b, 0) / cv.length);
  const all = Object.values(kinds).reduce((a, k) => [a[0] + k.hits, a[1] + k.n], [0, 0]);
  return { updatedAt: new Date(now).toISOString(), from: keep[0] ?? null, to: keep[keep.length - 1] ?? null, nDays: keep.length, days: kept, chance: keptChance, kinds, all: { hits: all[0], n: all[1], ...wilson(all[0], all[1]) },
    note: 'How often what Helix described in the morning still described the day by the close, per kind of claim, with a 95% Wilson interval. Calibration of descriptions, not a trading record.' };
}
