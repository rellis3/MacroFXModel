/**
 * Ladder export text — the "Forecast" half of the two-family export set.
 *
 * ONE builder for all three horizons. Daily / Weekly / Monthly differ only in which
 * ladder object they read (`ladder`, `ladder_weekly`, `ladder_monthly`), so they
 * cannot drift apart the way the previous Export / Calibrated / Export-v2 /
 * Extended / Weekly / Weekly-cal builders did — those were six near-copies of the
 * same loop, each with its own quietly different constants.
 *
 * This module lives in `js/` rather than inside the page precisely so the server
 * route and the browser button render byte-identical text from the same code.
 * The COG family is NOT here: `js/cogBands.js` reproduces COG's own published line
 * and is deliberately a separate calc with a separate purpose.
 */

import { RUNGS } from './forecastLadder.js';

const LW = 30;
const _div = n => { const pre = `──── ${n} `; return pre + '─'.repeat(Math.max(0, LW - pre.length)); };
const _pc = x => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(2) : '—');

// Row labels are the LEGACY ones, deliberately. `pine/cog_volatility_v3_sessions.pine`
// (and the other Pine consumers) parse this text by grepping literal tokens —
// "RANGE" / "MOVE" / "OPEN HIGH" / "OPEN LOW" / "DRIFT" to find the row, then
// `f_firstNumAfter(row, ": ")` for the median and `f_lastNumBefore(row, "75th")` for
// the 75th. Renaming the rows to "H-L range … p50 · p75" silently breaks every
// pasted indicator: the row stops matching, or the 75th resolves to na.
//
// So the p90 rung is APPENDED after the "75th" token, where the old parser cannot
// see it and does not need to. Existing indicators keep working untouched and simply
// start drawing better-calibrated numbers; a new indicator version can pick up p90.
const QTY_ROW = {
  hl: { label: 'High to Low range', p75Word: '75th Percentile' },
  oc: { label: 'Open to Close move', p75Word: '75th Percentile' },
  oh: { label: 'Open High (upside)', p75Word: '75th' },
  ol: { label: 'Open Low  (downside)', p75Word: '75th' },
};

const HORIZON_TITLE = {
  daily:   'VOL & RANGE FORECAST',
  weekly:  'VOL & RANGE FORECAST — WEEKLY (5-day)',
  monthly: 'VOL & RANGE FORECAST — MONTHLY (20-day)',
};

// `<label> : <p50>% median · <p75>% <75th-word> · <p90>% 90th`
function _rungRow(key, q) {
  if (!q || q.p50 == null) return null;
  const cfg = QTY_ROW[key];
  let row = `${cfg.label.padEnd(24)}: ${_pc(q.p50)}% median · ${_pc(q.p75)}% ${cfg.p75Word}`;
  if (q.p90 != null) row += ` · ${_pc(q.p90)}% 90th`;
  return row;
}

/**
 * Build the Forecast export text.
 *
 * @param {object} data      the forecast payload ({ session_label, instruments })
 * @param {string} horizon   'daily' | 'weekly' | 'monthly'
 * @param {object} opts      { includeDrift = true }
 */
export function buildLadderExportText(data, horizon = 'daily', opts = {}) {
  const { includeDrift = true } = opts;
  const key = horizon === 'weekly' ? 'ladder_weekly'
            : horizon === 'monthly' ? 'ladder_monthly' : 'ladder';

  const lines = [
    `**${HORIZON_TITLE[horizon] ?? HORIZON_TITLE.daily}**`,
    `**For session: ${data?.session_label ?? '—'}**`,
  ];

  // The event bucket is a headline fact, not a footnote: it moves every band on the
  // page by up to ±20%, and a reader who doesn't know today is an NFP day cannot
  // interpret the numbers.
  const first = Object.values(data?.instruments ?? {}).find(f => f?.[key]);
  if (first) {
    const tag = first[key].event_tag;
    const mult = first[key].event_mult ?? 1;
    // Three distinct states, and the difference matters: a clean calendar earns the
    // quiet-day discount, an unreadable one must not.
    const desc = tag == null ? 'calendar unavailable — no conditioning applied'
               : tag === 'none' ? 'no scheduled release in this market'
               : tag === 'holiday' ? 'bank holiday — thin session'
               : tag === 'high' ? 'high-impact release'
               : tag;
    lines.push(`Event bucket: ${desc} (σ ×${mult.toFixed(3)})`);
    if (first[key].width_source === 'sqrt-scaled') {
      lines.push('NOTE: √-time scaled widths — no fitted multiplier for this horizon.');
    }
  }
  lines.push('');

  for (const [name, f] of Object.entries(data?.instruments ?? {})) {
    const L = f?.[key];
    if (!L || !(L.vol_annual > 0)) continue;
    lines.push(_div(name));
    lines.push(`Volatility (annualized) : ${_pc(L.vol_annual)}%`);
    for (const q of ['hl', 'oc', 'oh', 'ol']) {
      const row = _rungRow(q, L[q]);
      if (row) lines.push(row);
    }
    // Drift is REPORTED, not applied. The fitted O-H / O-L carry each instrument's
    // structural asymmetry (indices fall harder than they rise), which is a
    // different thing from today's trailing drift — the old v2 lines tilted by the
    // latter. Keeping the read visible means nothing is lost while drift
    // conditioning is still an open fit.
    if (includeDrift && Number.isFinite(f.drift_d)) {
      const d = f.drift_d;
      // Prefer the ranked readout: "Strong bullish (top 4% of days) · +0.47%/day".
      // The raw ratio stays FIRST in the row because the indicator's drift parser
      // takes the first number after ": " to slope its arrow — the words are for
      // the human, the number is for the machine, and neither may displace the
      // other. Falls back to the old wording when no readout is available.
      const lbl = f.drift_read?.text
        ?? (Math.abs(d) < 0.1 ? 'Neutral' : d > 0 ? 'Mild bullish' : 'Mild bearish');
      // Same "Drift (d=μ/σ)" token the indicator greps for. Reported, not applied —
      // the fitted O-H / O-L carry each instrument's STRUCTURAL asymmetry, which is a
      // different thing from today's trailing drift. Conditioning the rungs on d is
      // an open fit (measured: a 14.5pp swing in O-H p50 across drift terciles).
      lines.push(`Drift (d=μ/σ)           : ${d >= 0 ? '+' : ''}${d.toFixed(3)}  →  ${lbl}`);
    }
    lines.push('');
  }

  if (first) {
    lines.push(`[fitted ladder · σ=${first[key].estimator ?? '—'} · widths ${first[key].width_source}`
             + ` · p50/p75/p90 = exceeded 50%/25%/10% of periods]`);
  }
  return lines.join('\n');
}

/**
 * Session add-on: the Asia / London / New York percentile blocks, appended to a
 * Forecast export. Kept because it is measured EMPIRICALLY from real session
 * buckets (js/sessionStats.js) rather than √-scaled off the daily σ — a different
 * and better-founded calc than the one it sits beside.
 */
export function buildSessionAddendum(statsData) {
  const inst = statsData?.instruments ?? statsData?.stats ?? {};
  if (!Object.keys(inst).length) return '';
  const lines = ['', '**SESSION RANGES — Asia / London / New York**',
                 '(empirical percentiles of real session buckets, not √-scaled)', ''];
  for (const [name, s] of Object.entries(inst)) {
    if (!s?.asia || !s?.london) continue;
    lines.push(_div(name));
    for (const [label, k] of [['Asia', 'asia'], ['London', 'london'], ['New York', 'ny']]) {
      const v = s[k];
      if (v) lines.push(`${label.padEnd(10)} range : ${_pc(v.p50)}% median · ${_pc(v.p75)}% 75th`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
