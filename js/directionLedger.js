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
