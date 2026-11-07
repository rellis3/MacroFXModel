/**
 * The model-spend ledger: what every paid model call cost, by UTC day, by job and by the code that made it.
 *
 * Why it exists (2026-11-07): the Anthropic console showed $56.82 of Sonnet 5 on 2026-11-04 and nothing here could say
 * where it went. The in-memory ring buffer (server.js _modelCalls) is wiped on every deploy, and a task name alone
 * is too coarse: 'desk-head' is used by the desk Head, the evening edition, the intraday update, the research pod's
 * architect, the literature desk and a dozen more. So each call is recorded under its task AND its caller label
 * (e.g. 'desk:head', 'lit:dossier', '_rpThreadReply'), summed per UTC day (the day the Anthropic console uses), and
 * kept in KV so it survives a deploy.
 *
 * Money: Anthropic list prices per model (below, USD per million tokens, from the Claude API pricing table cached
 * 2026-10-06). A PRICE_<PROVIDER>_IN/_OUT/_CACHE_READ env var still overrides them, as before. A provider with no
 * list price here (DeepSeek, Kimi) shows tokens and no money until its PRICE_* vars are set: those prices are not
 * known to this file and a guessed one would be quoted later as measured.
 *
 * A call that failed with no reply (a timeout, a dropped connection) is counted under `noReply`: the provider may
 * still have finished and billed it, but no usage came back, so its cost is unknown, and the page says so.
 *
 * Pure: no KV, no clock, no env. server.js owns persistence and the cap's enforcement.
 */

/** USD per million tokens. cacheWrite is the 5-minute write rate (1.25x input). */
export const LIST_PRICES = {
  'claude-sonnet-5':   { in: 2,   out: 10,  cacheRead: 0.2,  cacheWrite: 2.5 },
  'claude-sonnet-5-5': { in: 2,   out: 10,  cacheRead: 0.2,  cacheWrite: 2.5 },
  'claude-opus-5':     { in: 5,   out: 25,  cacheRead: 0.5,  cacheWrite: 6.25 },
  'claude-opus-5-5':   { in: 4,   out: 20,  cacheRead: 0.2,  cacheWrite: 5 },
  'claude-haiku-5-5':  { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-fable-5-1':  { in: 10,  out: 50,  cacheRead: 1,    cacheWrite: 12.5 },
};

/** The price for one call: a PRICE_* env override for the provider wins, then the model's list price, else null. */
export function priceFor(provider, model, envPrices = {}) {
  const e = envPrices?.[provider];
  if (e && (e.in != null || e.out != null)) return { in: e.in ?? 0, out: e.out ?? 0, cacheRead: e.cacheRead ?? e.in ?? 0, cacheWrite: e.cacheWrite ?? e.in ?? 0, source: 'env' };
  const id = String(model ?? '').replace(/-\d{8}$/, '');
  const l = LIST_PRICES[id];
  return l ? { ...l, source: 'list' } : null;
}

/** USD for one call's usage, or null when there is no price. */
export function usdOf(usage = {}, price) {
  if (!price) return null;
  const t = k => Number(usage?.[k] ?? 0) || 0;
  return (t('in') * price.in + t('out') * price.out + t('cacheRead') * price.cacheRead + t('cacheWrite') * price.cacheWrite) / 1e6;
}

/** The UTC day of a timestamp, as the Anthropic console reports it. */
export const utcDay = ms => new Date(ms).toISOString().slice(0, 10);

const rowKey = c => [c.provider, c.model, c.task, c.label].map(x => String(x ?? '?')).join('|');
const emptyRow = c => ({ provider: c.provider ?? null, model: c.model ?? null, task: c.task ?? null, label: c.label ?? null,
  calls: 0, in: 0, out: 0, cacheRead: 0, cacheWrite: 0, usd: 0, priced: false, errors: 0, noReply: 0, truncated: 0, blocked: 0 });

/** A fresh day. */
export const emptyDay = day => ({ day, rows: {}, usd: 0, anthropicUsd: 0, calls: 0 });

/**
 * Add one call to a day (mutates and returns it). `call`: { provider, model, task, label, usage?, ok, httpStatus?,
 * truncated?, blocked? }. `envPrices`: the PRICE_* config.
 */
export function addCall(day, call, envPrices = {}) {
  const k = rowKey(call);
  const r = day.rows[k] ??= emptyRow(call);
  if (call.blocked) { r.blocked++; return day; }
  r.calls++; day.calls++;
  if (call.ok === false) { r.errors++; if (!call.httpStatus) r.noReply++; return day; }
  const u = call.usage ?? {};
  for (const f of ['in', 'out', 'cacheRead', 'cacheWrite']) r[f] += Number(u[f] ?? 0) || 0;
  if (call.truncated) r.truncated++;
  const usd = usdOf(u, priceFor(call.provider, call.model, envPrices));
  if (usd != null) {
    r.priced = true; r.usd = +(r.usd + usd).toFixed(6); day.usd = +(day.usd + usd).toFixed(6);
    if (call.provider === 'anthropic') day.anthropicUsd = +(day.anthropicUsd + usd).toFixed(6);
  }
  return day;
}

/** Merge day b into day a (same date; e.g. what KV held plus what this process recorded before it loaded). */
export function mergeDays(a, b) {
  const out = emptyDay(a?.day ?? b?.day);
  for (const d of [a, b]) {
    if (!d) continue;
    out.usd = +(out.usd + (d.usd ?? 0)).toFixed(6);
    out.anthropicUsd = +(out.anthropicUsd + (d.anthropicUsd ?? 0)).toFixed(6);
    out.calls += d.calls ?? 0;
    for (const [k, r] of Object.entries(d.rows ?? {})) {
      const o = out.rows[k] ??= emptyRow(r);
      for (const f of ['calls', 'in', 'out', 'cacheRead', 'cacheWrite', 'errors', 'noReply', 'truncated', 'blocked']) o[f] += r[f] ?? 0;
      o.usd = +(o.usd + (r.usd ?? 0)).toFixed(6); o.priced = o.priced || !!r.priced;
    }
  }
  return out;
}

/** A day for display: rows as a list, dearest first. */
export function daySummary(d) {
  const rows = Object.values(d?.rows ?? {}).sort((a, b) => (b.usd - a.usd) || (b.out - a.out));
  const byTask = {};
  for (const r of rows) {
    const t = byTask[r.task ?? '?'] ??= { task: r.task, calls: 0, usd: 0, in: 0, out: 0 };
    t.calls += r.calls; t.usd = +(t.usd + r.usd).toFixed(6); t.in += r.in; t.out += r.out;
  }
  return {
    day: d?.day ?? null, usd: +(d?.usd ?? 0).toFixed(4), anthropicUsd: +(d?.anthropicUsd ?? 0).toFixed(4), calls: d?.calls ?? 0,
    noReply: rows.reduce((a, r) => a + r.noReply, 0), blocked: rows.reduce((a, r) => a + r.blocked, 0),
    byTask: Object.values(byTask).sort((a, b) => b.usd - a.usd), rows,
  };
}

/**
 * Is the next Anthropic call allowed? `cap` in USD (0 or less = no cap). Only Anthropic calls are capped: it is
 * the provider whose bill prompted this, and the only one with known prices here.
 */
export function capCheck({ provider, spentUsd, cap }) {
  if (provider !== 'anthropic' || !(cap > 0)) return { ok: true };
  if (spentUsd >= cap) return { ok: false, reason: `daily Anthropic spend cap reached: $${spentUsd.toFixed(2)} spent today (UTC) against a cap of $${cap.toFixed(2)}. Raise it on the Bot Config page (AI models tab) or wait for 00:00 UTC.` };
  return { ok: true };
}

/**
 * The caller label for a call that did not name itself: the first frame on the stack outside the model-call plumbing
 * and outside node_modules / Node internals. A named function gives its name ("_rpThreadReply"); an unnamed one (an
 * Express route handler) gives its file and line ("server.js:8850"). Rough, but it turns "desk-head" into the job.
 */
export function callerFromStack(stack, skip = ['callModel', '_modelJson', '_litModel', 'askValidated', 'callerFromStack', '_aiCallerLabel']) {
  for (const line of String(stack ?? '').split('\n').slice(1)) {
    const m = line.match(/^\s*at (?:async )?(?:([^\s(]+) \()?(.+?):(\d+):\d+\)?\s*$/);
    if (!m) continue;
    const [, name, file, ln] = m;
    if (/node_modules|^node:|\(native\)|^internal\//.test(file)) continue;
    if (name && skip.some(s => name === s || name.endsWith('.' + s))) continue;
    if (name && !/^(new |Promise\.|process\.|Array\.|Function\.|Module\.|<anonymous>)/.test(name)) return name;
    return `${String(file).split('/').pop()}:${ln}`;
  }
  return null;
}
