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

const QTY_LABEL = {
  hl: 'H-L range',
  oc: 'O-C move',
  oh: 'O-H (high from open)',
  ol: 'O-L (low from open)',
};

const HORIZON_TITLE = {
  daily:   'VOL & RANGE FORECAST',
  weekly:  'VOL & RANGE FORECAST — WEEKLY (5-day)',
  monthly: 'VOL & RANGE FORECAST — MONTHLY (20-day)',
};

// One instrument's rungs. Every line reads "p50 · p75 · p90" in the same order so
// the eye can scan down a column, and the rung NAMES are printed rather than
// implied — the whole point of the rebuild is that a rung means what it says.
function _rungRow(label, q) {
  if (!q) return null;
  const cells = RUNGS.map(r => `${_pc(q[r])}% ${r}`).join(' · ');
  return `${label.padEnd(22)}: ${cells}`;
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
    const tag = first[key].event_tag ?? 'none';
    const mult = first[key].event_mult ?? 1;
    const desc = tag === 'none' ? 'no US Major release' : tag;
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
    lines.push(`Volatility (annualized): ${_pc(L.vol_annual)}%`);
    for (const q of ['hl', 'oc', 'oh', 'ol']) {
      const row = _rungRow(QTY_LABEL[q], L[q]);
      if (row) lines.push(row);
    }
    // Drift is REPORTED, not applied. The fitted O-H / O-L carry each instrument's
    // structural asymmetry (indices fall harder than they rise), which is a
    // different thing from today's trailing drift — the old v2 lines tilted by the
    // latter. Keeping the read visible means nothing is lost while drift
    // conditioning is still an open fit.
    if (includeDrift && Number.isFinite(f.drift_d) && Math.abs(f.drift_d) > 0.05) {
      const d = f.drift_d;
      lines.push(`Drift read            : d=${d >= 0 ? '+' : ''}${d.toFixed(2)} `
               + `(${d > 0 ? 'mild bullish' : 'mild bearish'} — reported, not applied)`);
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
