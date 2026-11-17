/**
 * Desk Bias Process head to head (plans/DESK_BIAS_PROCESS_SPEC.md "Head to head"): every competitor's daily side on the
 * same markets and days, scored the same way. Forward only: it reads stored records (process issues, the bias
 * scoreboard's same-day rows, the FundaBias log) and price bars; nothing is back-issued.
 *
 * One fixed trade rule for everyone:
 *   - enter at the call time (mid at the call's knowable time, the first bar at or after it);
 *   - stop at the competitor's invalidation when it gave one on the losing side of entry, else 1 σ_day;
 *   - exit when the side flips or goes Neutral (at the next call's time), at the stop (at the stop, or the bar's open
 *     when price gaps through it), or Friday 21:00 London, whichever comes first;
 *   - cost: half the bar's own bid/ask spread at entry and at exit (the bar's `sp`; a fallback table only when a bar
 *     carries none). A day with no record for a competitor is a gap: the position is held, never assumed Neutral.
 * Metrics per competitor: hit rate (call time -> 21:00 London, and -> 07:00 the next weekday) against the B0 base
 * rate on the same rows, R per trade (gross and net) with a day-cluster bootstrap interval, hit rate by conviction,
 * Neutral share, and for process-ai the override record (did overriding beat the system call on those days?).
 *
 * Pure: no fetch, no clock. Tested in js/deskBiasH2H.test.mjs. CLI: scripts/bias-scoreboard/h2h.mjs.
 */
import { londonMs, londonDateOf, addWeekdays } from './directionLedger.js';

export const H2H_VERSION = 'desk-bias-h2h-v1';
export const SEED = 20261117, BOOT_B = 2000;
export const PRICE_LOOKBACK_MS = 15 * 60_000;
const fin = x => typeof x === 'number' && Number.isFinite(x);
const sideOf = d => (d === 'BULLISH' || d === 1 ? 1 : d === 'BEARISH' || d === -1 ? -1 : 0);
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

export function rng(seed = SEED) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ── prices ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** Mid at T: the close of the last bar that closed at or before T (within 15 min). bars: [{ t (open ms), o, h, l, c, sp? }] sorted. */
export function priceAt(bars, ms, barMs) {
  let lo = 0, hi = bars.length - 1, best = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (bars[m].t + barMs <= ms) { best = m; lo = m + 1; } else hi = m - 1; }
  if (best < 0 || ms - (bars[best].t + barMs) > PRICE_LOOKBACK_MS) return null;
  return { c: bars[best].c, sp: fin(bars[best].sp) ? bars[best].sp : null, i: best };
}
/** Friday 21:00 London of the week holding `ms` (the next week's when `ms` is already past it). */
export function fridayCloseMs(ms) {
  let d = londonDateOf(ms);
  for (let k = 0; k < 8; k++) {
    if (new Date(`${d}T12:00:00Z`).getUTCDay() === 5) { const f = londonMs(d, 21); if (f > ms) return f; }
    d = new Date(Date.parse(`${d}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
  }
  return null;
}

// ── the trade rule ───────────────────────────────────────────────────────────────────────────────────────────────
/**
 * calls: one competitor on one market, [{ date, ms, dir|side, invalidation?, sigmaDay }] (any order). Returns the trades:
 * { side, entryMs, entry, stop, stopBasis, exitMs, exit, exitWhy, R, cost, Rnet, open? }.
 */
export function tradeRule(calls, bars, { barMs = 5 * 60_000, spread = null } = {}) {
  const cs = [...calls].filter(c => fin(c.ms)).sort((a, b) => a.ms - b.ms), trades = [];
  let pos = null;
  const sp = p => (fin(p?.sp) ? p.sp : fin(spread) ? spread : 0);
  const close = (ms, price, why, spAt) => {
    const R = pos.side * (price - pos.entry) / pos.risk, cost = (pos.spEntry / 2 + spAt / 2) / pos.risk;
    trades.push({ side: pos.side, date: pos.date, entryMs: pos.entryMs, entry: pos.entry, stop: pos.stop, stopBasis: pos.stopBasis, exitMs: ms, exit: price, exitWhy: why,
      R: +R.toFixed(4), cost: +cost.toFixed(4), Rnet: +(R - cost).toFixed(4) });
    pos = null;
  };
  // walk bars from the position's last checked bar up to (not including) `untilMs`: stop and Friday close
  const walk = untilMs => {
    if (!pos) return;
    const end = Math.min(untilMs, pos.friMs ?? Infinity);
    for (let i = pos.next; i < bars.length && bars[i].t + barMs <= end; i++) {
      const b = bars[i];
      pos.next = i + 1;
      const hitStop = pos.side > 0 ? b.l <= pos.stop : b.h >= pos.stop;
      if (hitStop) { const gap = pos.side > 0 ? b.o <= pos.stop : b.o >= pos.stop; close(b.t + barMs, gap ? b.o : pos.stop, gap ? 'stop (gap)' : 'stop', sp(b)); return; }
    }
    if (pos && pos.friMs != null && untilMs >= pos.friMs) {
      const p = priceAt(bars, pos.friMs, barMs);
      if (p) close(pos.friMs, p.c, 'friday 21:00', sp(p));
    }
  };
  for (const c of cs) {
    walk(c.ms);
    const s = sideOf(c.dir ?? c.side);
    if (pos && s === pos.side) continue;                                    // same side: hold
    const p = priceAt(bars, c.ms, barMs);
    if (pos) {                                                             // flip or Neutral: exit at the call time
      if (!p) continue;                                                    // no price at the call: keep holding, a later bar decides
      close(c.ms, p.c, s ? 'flip' : 'neutral', sp(p));
    }
    if (!s || !p) continue;
    const entry = p.c, inv = c.invalidation, sig = c.sigmaDay;
    let stop = null, stopBasis = null;
    if (fin(inv) && (s > 0 ? inv < entry : inv > entry)) { stop = inv; stopBasis = 'invalidation'; }
    else if (fin(sig) && sig > 0) { stop = entry * (1 - s * sig); stopBasis = '1 sigma_day'; }
    if (stop == null) continue;                                            // no stop can be set: no trade (stated by the caller's counts)
    pos = { side: s, date: c.date, entryMs: c.ms, entry, stop, stopBasis, risk: Math.abs(entry - stop), spEntry: sp(p), next: p.i + 1, friMs: fridayCloseMs(c.ms) };
  }
  walk(Infinity);
  if (pos) trades.push({ side: pos.side, date: pos.date, entryMs: pos.entryMs, entry: pos.entry, stop: pos.stop, stopBasis: pos.stopBasis, open: true });
  return trades;
}

// ── per-call outcomes (hit vs B0) ────────────────────────────────────────────────────────────────────────────────
/** Signed outcome of one call to 21:00 London that day (d21) and 07:00 the next weekday (n07). */
export function callOutcome(call, bars, { barMs = 5 * 60_000 } = {}) {
  const a = priceAt(bars, call.ms, barMs);
  const ends = { d21: londonMs(call.date, 21), n07: londonMs(addWeekdays(call.date, 1), 7) }, out = {};
  for (const [k, ms] of Object.entries(ends)) {
    const e = ms > call.ms ? priceAt(bars, ms, barMs) : null;
    out[k] = a && e ? { y: e.c > a.c ? 1 : 0, ret: Math.log(e.c / a.c) } : null;
  }
  return out;
}

// ── metrics ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** Day-cluster bootstrap of the mean of `vals` ([{ day, v }]): [2.5%, 97.5%]. */
export function dayBoot(vals, { b = BOOT_B, seed = SEED } = {}) {
  const days = [...new Set(vals.map(x => x.day))].sort(), by = new Map(days.map(d => [d, []]));
  for (const x of vals) by.get(x.day).push(x.v);
  if (days.length < 2) return null;
  const R = rng(seed), out = [];
  for (let k = 0; k < b; k++) { let s = 0, n = 0; for (let j = 0; j < days.length; j++) for (const v of by.get(days[Math.floor(R() * days.length)])) { s += v; n++; } if (n) out.push(s / n); }
  out.sort((x, y) => x - y);
  return [out[Math.floor(0.025 * (out.length - 1))], out[Math.ceil(0.975 * (out.length - 1))]].map(x => +x.toFixed(4));
}

/**
 * The head-to-head table. calls: [{ competitor, market, date, ms, dir|side, conviction?, invalidation?, sigmaDay?, by?,
 * systemDir? }] (process-ai rows carry `by` and `systemDir` for the override record). bars: { market: [...] }.
 * b0: { market: { d21, n07 } } (p_up). spreads: fallback { market: price units }. Rows are compared on the shared
 * market-days (every listed competitor has a record) and on all of each competitor's own rows.
 */
export function headToHead({ calls, bars, b0 = {}, spreads = {}, barMs = 5 * 60_000, seed = SEED, b = BOOT_B }) {
  const comps = [...new Set(calls.map(c => c.competitor))].sort();
  const key = c => `${c.market}|${c.date}`;
  const have = new Map();
  for (const c of calls) { if (!have.has(key(c))) have.set(key(c), new Set()); have.get(key(c)).add(c.competitor); }
  const shared = new Set([...have].filter(([, s]) => comps.every(x => s.has(x))).map(([k]) => k));
  const outcomes = new Map();
  const outOf = c => { const k = `${c.market}|${c.ms}|${c.date}`; if (!outcomes.has(k)) outcomes.set(k, bars[c.market]?.length ? callOutcome(c, bars[c.market], { barMs }) : { d21: null, n07: null }); return outcomes.get(k); };

  const table = comps.map(comp => {
    const mine = calls.filter(c => c.competitor === comp);
    const block = rows => {
      const speak = rows.filter(c => sideOf(c.dir ?? c.side));
      const hits = {};
      for (const t of ['d21', 'n07']) {
        const v = speak.map(c => { const o = outOf(c)[t], s = sideOf(c.dir ?? c.side), p0 = b0[c.market]?.[t] ?? 0.5; return o ? { day: c.date, hit: (s > 0 ? o.y : 1 - o.y), b0: s > 0 ? p0 : 1 - p0, ret: s * o.ret, sig: c.sigmaDay } : null; }).filter(Boolean);
        hits[t] = { n: v.length, hit: v.length ? +mean(v.map(x => x.hit)).toFixed(4) : null, b0: v.length ? +mean(v.map(x => x.b0)).toFixed(4) : null,
          excess: v.length ? +mean(v.map(x => x.hit - x.b0)).toFixed(4) : null, excessCi: dayBoot(v.map(x => ({ day: x.day, v: x.hit - x.b0 })), { b, seed }) };
      }
      const calib = {};
      for (const c of speak) { const o = outOf(c).d21; if (!o) continue; const k = c.conviction ?? 'none', s = sideOf(c.dir ?? c.side); (calib[k] ??= { n: 0, hits: 0 }).n++; calib[k].hits += s > 0 ? o.y : 1 - o.y; }
      for (const v of Object.values(calib)) { v.hit = +(v.hits / v.n).toFixed(4); delete v.hits; }
      return { records: rows.length, speaking: speak.length, neutralShare: rows.length ? +(1 - speak.length / rows.length).toFixed(4) : null, hits, calibration: calib };
    };
    // trades run on the competitor's full sequence per market (a position spans days), R counted per trade
    const trades = [];
    for (const m of [...new Set(mine.map(c => c.market))]) if (bars[m]?.length) trades.push(...tradeRule(mine.filter(c => c.market === m), bars[m], { barMs, spread: spreads[m] }).map(t => ({ ...t, market: m })));
    const closed = trades.filter(t => !t.open), sharedTrades = closed.filter(t => shared.has(`${t.market}|${t.date}`));
    const rBlock = ts => ({ trades: ts.length, win: ts.length ? +mean(ts.map(t => (t.Rnet > 0 ? 1 : 0))).toFixed(4) : null, meanR: ts.length ? +mean(ts.map(t => t.R)).toFixed(4) : null,
      meanRnet: ts.length ? +mean(ts.map(t => t.Rnet)).toFixed(4) : null, totalRnet: +ts.reduce((s, t) => s + t.Rnet, 0).toFixed(4), meanRnetCi: dayBoot(ts.map(t => ({ day: t.date, v: t.Rnet })), { b, seed }),
      exits: ts.reduce((a, t) => ((a[t.exitWhy] = (a[t.exitWhy] ?? 0) + 1), a), {}) });
    return { competitor: comp, shared: { ...block(mine.filter(c => shared.has(key(c)))), R: rBlock(sharedTrades) }, all: { ...block(mine), R: rBlock(closed) }, open: trades.filter(t => t.open).length };
  });

  // the override record: process-ai days where the AI overrode the system call
  const ov = calls.filter(c => c.competitor === 'process-ai' && c.by === 'ai-override').map(c => {
    const o = outOf(c).d21, sa = sideOf(c.dir ?? c.side), ss = sideOf(c.systemDir);
    if (!o || !(c.sigmaDay > 0)) return null;
    return { day: c.date, market: c.market, ai: c.dir, system: c.systemDir, aiRet: sa * o.ret / c.sigmaDay, sysRet: ss * o.ret / c.sigmaDay };
  }).filter(Boolean);
  const override = { n: ov.length, aiBetter: ov.filter(x => x.aiRet > x.sysRet).length, systemBetter: ov.filter(x => x.sysRet > x.aiRet).length,
    meanDiffSigma: ov.length ? +mean(ov.map(x => x.aiRet - x.sysRet)).toFixed(4) : null, diffCi: dayBoot(ov.map(x => ({ day: x.day, v: x.aiRet - x.sysRet })), { b, seed }),
    rows: ov.map(x => ({ ...x, aiRet: +x.aiRet.toFixed(3), sysRet: +x.sysRet.toFixed(3) })) };

  const days = [...new Set(calls.map(c => c.date))].sort();
  return { version: H2H_VERSION, seed, competitors: comps, days: days.length, first: days[0] ?? null, last: days.at(-1) ?? null, sharedMarketDays: shared.size,
    sharedDays: new Set([...shared].map(k => k.split('|')[1])).size, table, override,
    note: 'Running table, forward only; a formal verdict waits for 60 and 120 shared days (bias-scoreboard prereg). Intervals are day-cluster bootstraps.' };
}

// ── turning stored records into calls ────────────────────────────────────────────────────────────────────────────
/** Process issues (desk_bias_process_<date>) -> process-ai and process-system calls. Knowable at the record's issuedAt. */
export function processCalls(records) {
  const out = [];
  for (const r of records ?? []) {
    const ms = Date.parse(r.issuedAt ?? r.asOf ?? '');
    for (const [market, c] of Object.entries(r.markets ?? {})) {
      const sig = c.layers?.range?.sigmaDay ?? null;
      out.push({ competitor: 'process-ai', market, date: r.date, ms, dir: c.call?.dir ?? 'NEUTRAL', conviction: c.call?.conviction ?? null, invalidation: c.call?.invalidation ?? null, sigmaDay: sig, by: c.call?.by ?? null, systemDir: c.system?.dir ?? null });
      out.push({ competitor: 'process-system', market, date: r.date, ms, dir: c.system?.dir ?? 'NEUTRAL', conviction: c.system?.conviction ?? null, invalidation: c.system?.invalidation ?? null, sigmaDay: sig });
    }
  }
  return out;
}
/**
 * Same-day ledger records (forward/direction_ledger/sameday/<D>_<source>.json) -> calls for the listed models, d21 rows
 * only (one per instrument and day), side and knowable time as recorded, no invalidation. `nameOf` maps a ledger
 * instrument (eurusd) to the market name (EURUSD). σ_day from the row.
 */
export function ledgerCalls(records, nameOf, models = ['max-signals', 'desk-rating', 'bias-engine', 'h4-trend', 'fundabias']) {
  const out = [], want = new Set(models);
  for (const r of records ?? []) for (const f of r.forecasts ?? []) {
    if (f.target !== 'd21' || !want.has(f.model_id) || !nameOf[f.inst]) continue;
    out.push({ competitor: f.model_id, market: nameOf[f.inst], date: r.issue_date, ms: Date.parse(f.knowable_ts ?? f.anchor_ts), side: f.speaks ? f.side : 0, conviction: f.conviction ?? null, invalidation: null, sigmaDay: f.sigma_day ?? null });
  }
  return out;
}
