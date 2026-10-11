// "Project output" exports — the project's chosen lines with their out-of-sample track record (vol-forecast-v3 Export menu).
//
// Daily  = the chosen forecast (persistence + IV; forge/FORECAST_PICK_PREREG.md, confirmed point-in-time in VF3 Stage B).
// Weekly = Forecast Weekly · Reverting (forge/HORIZON_REVERSION_PREREG.md).
// The line rows are the existing exports' text, unchanged, so the TradingView indicators read them exactly as before. This only
// adds a header and one "Track record" line per instrument (a label the indicators do not parse). Pure — the server passes
// the already-built text in.
import { PROJECT_OUTPUT_EVIDENCE as EV } from './projectOutputEvidence.js';

const pct = v => (v == null || !Number.isFinite(v) ? '–' : `${Math.round(v * 100)}`);
const ALIAS = { SPX: 'SPX500', DOW: 'US30' };

export function trackRecordLine(name, horizon, ev = EV) {
  const k = ALIAS[name] ?? name;
  if (horizon === 'weekly') {
    const w = ev.weekly[k];
    return w ? `Track record (weekly)   : H-L exceeded ${pct(w.hl_p50)}/${pct(w.hl_p75)}% at p50/p75 · target 50/25 · ${w.n_test} test weeks` : null;
  }
  const d = ev.daily[k];
  if (!d) return null;
  return `Track record (daily)    : O→H reached ${pct(d.oh_p50)}/${pct(d.oh_p75)}/${pct(d.oh_p90)}% · O→L ${pct(d.ol_p50)}/${pct(d.ol_p75)}/${pct(d.ol_p90)}%`
    + ` · H-L ${pct(d.hl_p50)}/${pct(d.hl_p75)}/${pct(d.hl_p90)}% · target 50/25/10 · ${d.n} days out of sample`;
}

function header(horizon, ev = EV) {
  const c = ev.daily_vs_weekly;
  if (horizon === 'weekly') return [
    '**★ PROJECT OUTPUT — WEEKLY LINES (Forecast Weekly · Reverting)**',
    `Why weekly: outcomes sit closer to the line (spread of realised ÷ forecast ${c.sd_log.daily_median} daily → ${c.sd_log.weekly_median} weekly, tighter on ${Math.round(c.sd_log.weekly_better_share * 100)}% of instruments)`,
    `and one spread costs ${(c.cost_share_of_median_range.daily_median * 100).toFixed(1)}% of a typical day's range vs ${(c.cost_share_of_median_range.weekly_median * 100).toFixed(1)}% of a week's. Forecast skill is the same (R² ${c.r2.daily_median} vs ${c.r2.weekly_median}).`,
    'Lines are size, not direction: which side gets hit first is the distance ratio, and what happens at a line is ~50/50 (no validated edge).',
    '',
  ];
  return [
    '**★ PROJECT OUTPUT — DAILY LINES (chosen: persistence + IV)**',
    'The best of every daily forecast tested (VF3 Stage B, point-in-time 2020-08 → 2026-08: pinball 0.960 of the production export where IV exists, 0.977 elsewhere).',
    'Known misses: NFP/CPI days run ~6pp past the p75 line; GBPCAD and US2000 lines run tight, UK100 and DE30 wide (see each Track record).',
    'Live reach odds for every level (30 min → 22:00) and which-first: level-scenarios.html. After a touch is ~50/50 — no direction is claimed.',
    '',
  ];
}

/** Insert the header after the existing title lines and one track-record line at the end of each instrument block. */
export function annotateProjectOutput(text, horizon = 'daily', ev = EV) {
  const lines = String(text ?? '').split('\n');
  const out = [];
  let name = null, i = 0;
  // keep the existing title + session lines first (everything up to the first blank line)
  while (i < lines.length && lines[i].trim() !== '') out.push(lines[i++]);
  out.push('', ...header(horizon, ev));
  const flush = () => { if (name) { const t = trackRecordLine(name, horizon, ev); if (t) out.push(t); } name = null; };
  for (; i < lines.length; i++) {
    const m = lines[i].match(/^──── (\S+) /);
    if (m) { flush(); name = m[1]; out.push(lines[i]); continue; }
    if (lines[i].trim() === '' && name) { flush(); out.push(lines[i]); continue; }
    out.push(lines[i]);
  }
  flush();
  return out.join('\n');
}
