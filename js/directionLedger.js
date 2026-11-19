/**
 * Direction forecast ledger (forge/DIRECTION_BAR_PREREG.md, §L): the permanent forward record of every directional
 * forecast, baselines included, scored against what happened.
 *
 * One issue record per trading day (the latest completed OANDA daily mid candle, 17:00 New York close), written once:
 *   forward/direction_ledger/<date>.json            every forecast issued that day
 *   forward/direction_ledger/out/<date>_h<h>.json   the realised outcome and each forecast's score, once h closes exist
 * Nothing is overwritten and nothing is back-issued: a day the job missed stays a gap.
 *
 * Target, the same for every model: P(log close[t+h] / close[t] > 0), t = the issue day's close, h trading closes on.
 * Baselines (frozen at the last pre-lockbox date by scripts/direction-bar/bar.py, version in the file):
 *   B0 climatology   p_up = p0, decision NO-TRADE (climatology makes no call)
 *   B1 buy & hold    p_up = p0, decision LONG
 *   B2 momentum      p_up = P(up | sign of the 252-close log return), decision LONG/SHORT by that sign
 * Research forecasters are added to RESEARCH_FORECASTERS with their own model_id, version and prereg; the ledger
 * scores them on the same rows as the baselines.
 */

export const LEDGER_VERSION = 1;
export const HORIZONS = [1, 5, 20, 60];
export const INSTRUMENTS = { nq: 'NAS100_USD', es: 'SPX500_USD', gold: 'XAU_USD', eurusd: 'EUR_USD', gbpusd: 'GBP_USD', usdjpy: 'USD_JPY' };
export const TARGET = 'P(log close[t+h]/close[t] > 0); OANDA daily mid closes (17:00 New York); h trading closes';

/**
 * Research forecasters: { model_id, model_version, prereg, forecast(ctx) -> { p_up, mu_log?, decision, inputs?, flags? } | null }.
 * ctx = { date, inst, h, closes, baseline, external }. `external` is what the server gathered as of the issue close
 * (js/directionResearch.js); the live set is js/directionResearch.js RESEARCH, passed in by the server.
 */
export const RESEARCH_FORECASTERS = [];

/** OANDA daily candles -> [{ date: 'YYYY-MM-DD' (close date, UTC), c }], complete candles only, oldest first. */
export function closesFromCandles(candles) {
  return (candles || []).filter(k => k.complete && k.mid)
    .map(k => ({ date: new Date(Date.parse(k.time) + 86400_000).toISOString().slice(0, 10), c: +k.mid.c }))
    .filter(x => Number.isFinite(x.c))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const clip = p => Math.min(1 - 1e-4, Math.max(1e-4, p));
export const brier = (p, y) => (p - y) ** 2;
export const logScore = (p, y) => (y ? Math.log(clip(p)) : Math.log(1 - clip(p)));

/** Build the issue record for `date` from each instrument's closes (all <= date). */
export function issueRecord({ date, closes, baselines, issuedAt, code = null, research = RESEARCH_FORECASTERS, external = {}, externalStatus = null }) {
  const forecasts = [];
  for (const [inst, oanda] of Object.entries(INSTRUMENTS)) {
    const C = closes[inst];
    if (!C?.length || C.at(-1).date !== date) continue;            // this instrument has no close for the issue day
    const close = C.at(-1).c;
    const mom252 = C.length > 252 ? Math.log(close / C.at(-253).c) : null;
    for (const h of HORIZONS) {
      const b = baselines.instruments?.[inst]?.[h];
      if (!b) continue;
      const base = { inst, oanda, h, target: TARGET, inputs: { close, mom252 } };
      const add = (model_id, model_version, family, p_up, mu_log, decision, prereg, extra = null) =>
        forecasts.push({ id: `${date}|${inst}|${h}|${model_id}`, ...base, ...(extra ? { inputs: { ...base.inputs, ...extra.inputs }, flags: extra.flags } : {}),
          model_id, model_version, family, prereg, p_up, mu_log, decision });
      add('B0', baselines.version, 'baseline', b.p0, b.mu0, 'NO-TRADE', 'forge/DIRECTION_BAR_PREREG.md');
      add('B1', baselines.version, 'baseline', b.p0, b.mu0, 'LONG', 'forge/DIRECTION_BAR_PREREG.md');
      if (mom252 != null) {
        const pos = mom252 > 0;
        add('B2', baselines.version, 'baseline', pos ? b.p2_pos : b.p2_neg, null, pos ? 'LONG' : 'SHORT', 'forge/DIRECTION_BAR_PREREG.md');
      }
      for (const R of research) {
        let f = null;
        try { f = R.forecast({ date, inst, h, closes: C, baseline: b, external }); } catch { f = null; }
        if (f && Number.isFinite(f.p_up)) add(R.model_id, R.model_version, 'research', f.p_up, f.mu_log ?? null, f.decision ?? 'NO-TRADE', R.prereg, f.inputs || f.flags?.length ? { inputs: f.inputs, flags: f.flags ?? [] } : null);
      }
    }
  }
  return { v: LEDGER_VERSION, ledger: 'direction-ledger', prereg: 'forge/DIRECTION_BAR_PREREG.md', issue_date: date,
    issued_at: issuedAt, code, baselines_version: baselines.version, ...(externalStatus ? { external_status: externalStatus } : {}), forecasts };
}

/** Outcome of an issue record at horizon h, or null if h closes after the issue day do not exist yet. */
export function outcomeRecord(rec, h, closes, resolvedAt) {
  const outcomes = {}, scores = {};
  for (const inst of Object.keys(INSTRUMENTS)) {
    const fs = rec.forecasts.filter(f => f.inst === inst && f.h === h);
    if (!fs.length) continue;
    const C = closes[inst] || [];
    const i = C.findIndex(x => x.date === rec.issue_date);
    if (i < 0 || i + h >= C.length) return null;                 // not resolvable yet (or the issue close is missing)
    const r = Math.log(C[i + h].c / C[i].c), y = r > 0 ? 1 : 0;
    outcomes[inst] = { close_t: C[i].c, close_th: C[i + h].c, date_th: C[i + h].date, r_log: r, up: y };
    for (const f of fs) scores[f.id] = { brier: brier(f.p_up, y), log: logScore(f.p_up, y) };
  }
  return { v: LEDGER_VERSION, issue_date: rec.issue_date, h, resolved_at: resolvedAt, outcomes, scores };
}

/** Per model x instrument x horizon: n, Brier, skill vs B0 on the same rows, log-score difference and its CUSUM. */
export function summarise(records, outcomesList) {
  const byId = new Map();
  for (const r of records) for (const f of r.forecasts) byId.set(f.id, f);
  const cells = {};
  for (const o of [...outcomesList].sort((a, b) => a.issue_date.localeCompare(b.issue_date))) {
    for (const [id, s] of Object.entries(o.scores)) {
      const f = byId.get(id); if (!f) continue;
      const b0 = o.scores[`${o.issue_date}|${f.inst}|${f.h}|B0`]; if (!b0) continue;
      const k = `${f.model_id}|${f.inst}|${f.h}`;
      const c = cells[k] ??= { model_id: f.model_id, family: f.family, inst: f.inst, h: f.h, n: 0, brier: 0, brier_b0: 0, logdiff: 0, cusum: 0, cusum_max: 0, hits: 0, ev: new Set(), flags: f.flags ?? [] };
      c.ev.add(f.inputs?.event_key ?? o.issue_date);          // a run of consecutive rows from one trigger is one event
      c.n++; c.brier += s.brier; c.brier_b0 += b0.brier; c.logdiff += s.log - b0.log;
      c.cusum += s.log - b0.log; c.cusum_max = Math.max(c.cusum_max, c.cusum);
      const y = o.outcomes[f.inst].up;
      if (f.decision === 'LONG') c.hits += y; else if (f.decision === 'SHORT') c.hits += 1 - y;
    }
  }
  return Object.values(cells).map(({ ev, ...c }) => ({
    ...c, events: ev.size, brier: c.brier / c.n, brier_b0: c.brier_b0 / c.n, bss_vs_b0: 1 - c.brier / c.brier_b0, logdiff: c.logdiff / c.n,
    cusum_drop_from_peak: c.cusum_max - c.cusum,   // degradation: how far the cumulative log-score edge over B0 has fallen
  })).sort((a, b) => (a.inst + a.h + a.model_id).localeCompare(b.inst + b.h + b.model_id));
}

// ── Same-day row type (forge/BIAS_SCOREBOARD_PREREG.md, bias-scoreboard) ───────────────────────────────────────────
// A row = (London date D, instrument, target, model_id). The anchor is max(07:00 London, the forecaster's own knowable
// time, rounded up to the next minute); targets end at 21:00 London on D (d21, primary), 07:00 on the next London
// weekday (n07) or 07:00 on the 5th London weekday on (d5). Each row carries B0's p for its instrument and target, so B0
// is scored on the same y at the same anchor. Records are written once per (D, source) and never back-issued; the
// server owns the clock and the R2 keys (forward/direction_ledger/sameday/).
export const SAMEDAY_VERSION = 1;
export const SAMEDAY_PREREG = 'forge/BIAS_SCOREBOARD_PREREG.md';
export const SAMEDAY_TARGETS = ['d21', 'n07', 'd5'];
/** Extra horizons a source may ask for through issueSameDay({ targets }): d20 = 07:00 London 20 weekdays later (Bias Engine V2 file, prereg A7). */
export const EXTRA_TARGETS = ['d20'];
const R_SCALE = { d5: Math.sqrt(5), d20: Math.sqrt(20) };
export const SAMEDAY_CORE = { nq: 'NAS100_USD', es: 'SPX500_USD', gold: 'XAU_USD', eurusd: 'EUR_USD', gbpusd: 'GBP_USD', usdjpy: 'USD_JPY' };
export const SAMEDAY_EXTENDED = { us30: 'US30_USD', audusd: 'AUD_USD', nzdusd: 'NZD_USD', usdcad: 'USD_CAD', usdchf: 'USD_CHF', gbpjpy: 'GBP_JPY', eurjpy: 'EUR_JPY' };
export const SAMEDAY_INSTRUMENTS = { ...SAMEDAY_CORE, ...SAMEDAY_EXTENDED };
export const SAMEDAY_LATE_CUTOFF = [16, 0];        // a view knowable after 16:00 London is not a row for D
export const MID_LOOKBACK_MS = 5 * 60_000;          // mid at T = close of the last M1 bar starting in [T - 5 min, T)
export const SIGMA_N = 60;

/** UTC ms of a London wall-clock time on a London date (BST/GMT by the zone). */
export function londonMs(date, hh, mm = 0) {
  const guess = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), hh, mm);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess));
  const h = +parts.find(p => p.type === 'hour').value, m = +parts.find(p => p.type === 'minute').value;
  return guess - ((h - hh) * 60 + (m - mm)) * 60_000;
}
export const londonDateOf = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(ms));
export const isWeekday = date => { const d = new Date(`${date}T12:00:00Z`).getUTCDay(); return d >= 1 && d <= 5; };
/** The k-th London weekday after `date` (k = -1 gives the previous weekday). */
export function addWeekdays(date, k) {
  let d = new Date(`${date}T12:00:00Z`), n = 0;
  const step = k >= 0 ? 1 : -1;
  while (n < Math.abs(k)) { d = new Date(d.getTime() + step * 86400_000); if (d.getUTCDay() % 6) n++; }
  return d.toISOString().slice(0, 10);
}
export function targetEndMs(date, target) {
  if (target === 'd21') return londonMs(date, 21);
  if (target === 'n07') return londonMs(addWeekdays(date, 1), 7);
  if (target === 'd5') return londonMs(addWeekdays(date, 5), 7);
  if (target === 'd20') return londonMs(addWeekdays(date, 20), 7);
  throw new Error(`unknown same-day target ${target}`);
}
/** Anchor = max(07:00 London on D, knowable time rounded up to the next whole minute). */
export function anchorMs(date, knowableMs) {
  const open = londonMs(date, 7);
  if (!Number.isFinite(knowableMs)) return open;
  return Math.max(open, Math.ceil(knowableMs / 60_000) * 60_000);
}
/** Mid at T from M1 bars [{time (s), close}]: close of the last bar starting in [T - 5 min, T), else null. */
export function midAt(bars, ms) {
  let best = null;
  for (const b of bars || []) {
    const t = b.time * 1000;
    if (t >= ms - MID_LOOKBACK_MS && t < ms && Number.isFinite(b.close) && b.close > 0 && (!best || t > best.t)) best = { t, c: b.close };
  }
  return best ? best.c : null;
}
/** sigma_day for London date D: SD of the last 60 daily log returns of NY-close closes dated before D (closesFromCandles shape). */
export function sigmaDay(closes, date, n = SIGMA_N) {
  const C = (closes || []).filter(x => x.date < date && Number.isFinite(x.c) && x.c > 0);
  if (C.length < n + 1) return null;
  const w = C.slice(-(n + 1)), r = w.slice(1).map((x, i) => Math.log(x.c / w[i].c));
  const m = r.reduce((s, x) => s + x, 0) / n;
  return Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1));
}

const clipP = p => Math.min(0.99, Math.max(0.01, p));

/**
 * One same-day issue record for (D, source). `views` come from js/biasForecasters.js:
 *   { model_id, model_version, prereg?, inst, speaks, side (+1/-1/0), shift, knowable_ms, conviction?, inputs?, flags?, event_key? }
 * B0 rows are added when `withB0` (the base source). Every row is expanded over SAMEDAY_TARGETS with p_up = clip(p0 + side*shift).
 */
export function issueSameDay({ date, source, views = [], baselines, sigma = {}, anchors0700 = null, issuedAt, code = null, externalStatus = null, withB0 = false, insts = Object.keys(SAMEDAY_INSTRUMENTS), targets = SAMEDAY_TARGETS }) {
  const cutoff = londonMs(date, ...SAMEDAY_LATE_CUTOFF), forecasts = [], late = [];
  const p0Of = (inst, t) => baselines?.instruments?.[inst]?.[t]?.p0;
  const push = (v, t) => {
    const p0 = p0Of(v.inst, t);
    if (!Number.isFinite(p0)) return;
    const speaks = !!v.speaks && (v.side === 1 || v.side === -1) && Number.isFinite(v.shift);
    const side = speaks ? v.side : 0, a = anchorMs(date, v.knowable_ms);
    forecasts.push({ id: `${date}|${v.inst}|${t}|${v.model_id}`, row_type: 'sameday', inst: v.inst, oanda: SAMEDAY_INSTRUMENTS[v.inst], target: t,
      model_id: v.model_id, model_version: v.model_version, family: v.model_id === 'B0' ? 'baseline' : 'research', prereg: v.prereg ?? SAMEDAY_PREREG,
      speaks, side, shift: speaks ? v.shift : 0, p_up: speaks ? clipP(p0 + side * v.shift) : p0, b0_p: p0,
      decision: side > 0 ? 'LONG' : side < 0 ? 'SHORT' : 'NO-TRADE', conviction: v.conviction ?? null,
      knowable_ts: Number.isFinite(v.knowable_ms) ? new Date(v.knowable_ms).toISOString() : null, anchor_ts: new Date(a).toISOString(),
      sigma_day: sigma[v.inst] ?? null, event_key: v.event_key ?? null, inputs: v.inputs ?? {}, flags: v.flags ?? [] });
  };
  const all = withB0 ? [...insts.map(inst => ({ model_id: 'B0', model_version: baselines.version, inst, speaks: false, side: 0, shift: 0, knowable_ms: londonMs(date, 7) })), ...views] : views;
  for (const v of all) {
    if (!(v.inst in SAMEDAY_INSTRUMENTS)) continue;
    if (Number.isFinite(v.knowable_ms) && v.knowable_ms > cutoff) { late.push({ inst: v.inst, model_id: v.model_id, knowable_ts: new Date(v.knowable_ms).toISOString() }); continue; }
    for (const t of targets) push(v, t);
  }
  return { v: SAMEDAY_VERSION, ledger: 'direction-ledger', row_type: 'sameday', prereg: SAMEDAY_PREREG, issue_date: date, source, issued_at: issuedAt, code,
    baselines_version: baselines.version, ...(anchors0700 ? { anchors_0700: anchors0700 } : {}), ...(externalStatus ? { external_status: externalStatus } : {}),
    ...(late.length ? { late } : {}), forecasts };
}

/**
 * Outcome of D's issue records at one target, or null before end + 5 min. `mid(inst, ms)` -> number | null (the caller
 * fetches M1). Each row is scored, with B0's p on the same y; rows whose anchor or end price is missing are listed in
 * `unresolved` with the reason, never dropped.
 */
export async function outcomeSameDay(recs, target, mid, { now, resolvedAt }) {
  const rows = recs.flatMap(r => r.forecasts.filter(f => f.target === target));
  if (!rows.length) return null;
  const date = recs[0].issue_date, endMs = targetEndMs(date, target);
  if (now < endMs + MID_LOOKBACK_MS) return null;
  const prices = {}, scores = {}, unresolved = {};
  const get = async (inst, ms) => { const p = prices[inst] ??= {}; if (!(ms in p)) p[ms] = await mid(inst, ms); return p[ms]; };
  for (const f of rows) {
    const aMs = Date.parse(f.anchor_ts), a = await get(f.inst, aMs), e = await get(f.inst, endMs);
    if (!Number.isFinite(a) || !Number.isFinite(e)) { unresolved[f.id] = !Number.isFinite(a) ? 'no anchor price' : 'no end price'; continue; }
    const y = e > a ? 1 : 0, r = Math.log(e / a), sh = R_SCALE[target] ?? 1;
    scores[f.id] = { y, brier: brier(f.p_up, y), log: logScore(f.p_up, y), b0_brier: brier(f.b0_p, y), b0_log: logScore(f.b0_p, y),
      hit: f.speaks ? (f.side > 0 ? y : 1 - y) : null, r_log: r,
      R: f.speaks && f.sigma_day > 0 ? f.side * r / (f.sigma_day * sh) : null };
  }
  const px = Object.fromEntries(Object.entries(prices).map(([i, m]) => [i, Object.fromEntries(Object.entries(m).map(([k, v]) => [new Date(+k).toISOString(), v]))]));
  return { v: SAMEDAY_VERSION, row_type: 'sameday', issue_date: date, target, end_ts: new Date(endMs).toISOString(), resolved_at: resolvedAt, prices: px, scores, unresolved };
}

/**
 * Per model x target (pooled over `insts`) and per model x target x instrument: eligible rows (B0 rows resolved on those
 * instruments), speaking rows, coverage, unresolved speaking rows, hit rate, mean R, mean log-score difference vs B0,
 * Brier skill vs B0, events.
 */
export function summariseSameDay(recs, outs, { insts = Object.keys(SAMEDAY_CORE) } = {}) {
  const byId = new Map(recs.flatMap(r => r.forecasts.map(f => [f.id, f])));
  const set = new Set(insts), cells = {}, elig = {};
  const cell = (k, f, inst) => cells[k] ??= { model_id: f.model_id, target: f.target, inst, rows: 0, n: 0, unresolved: 0, hits: 0, R: 0, nR: 0, logdiff: 0, brier: 0, brier_b0: 0, ev: new Set() };
  for (const o of outs) {
    for (const [id, s] of Object.entries(o.scores)) {
      const f = byId.get(id); if (!f || !set.has(f.inst)) continue;
      if (f.model_id === 'B0') { for (const k of [`${f.target}|*`, `${f.target}|${f.inst}`]) elig[k] = (elig[k] ?? 0) + 1; }
      for (const [k, inst] of [[`${f.model_id}|${f.target}|*`, '*'], [`${f.model_id}|${f.target}|${f.inst}`, f.inst]]) {
        const c = cell(k, f, inst); c.rows++;
        if (!f.speaks) continue;
        c.n++; c.hits += s.hit; c.logdiff += s.log - s.b0_log; c.brier += s.brier; c.brier_b0 += s.b0_brier;
        if (Number.isFinite(s.R)) { c.R += s.R; c.nR++; }
        c.ev.add(f.event_key ?? o.issue_date);
      }
    }
    for (const id of Object.keys(o.unresolved || {})) {
      const f = byId.get(id); if (!f || !set.has(f.inst) || !f.speaks) continue;
      for (const [k, inst] of [[`${f.model_id}|${f.target}|*`, '*'], [`${f.model_id}|${f.target}|${f.inst}`, f.inst]]) cell(k, f, inst).unresolved++;
    }
  }
  return Object.values(cells).map(({ ev, ...c }) => {
    const e = elig[`${c.target}|${c.inst}`] ?? 0;
    return { ...c, eligible: e, coverage: e ? c.n / e : null, events: ev.size, hit_rate: c.n ? c.hits / c.n : null, mean_R: c.nR ? c.R / c.nR : null,
      logdiff: c.n ? c.logdiff / c.n : null, bss_vs_b0: c.n && c.brier_b0 ? 1 - c.brier / c.brier_b0 : null, brier: undefined, brier_b0: undefined, hits: undefined, R: undefined };
  }).map(c => JSON.parse(JSON.stringify(c))).sort((a, b) => (a.model_id + a.target + a.inst).localeCompare(b.model_id + b.target + b.inst));
}
