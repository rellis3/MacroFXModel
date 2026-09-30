// Event-tag proxy for backtests: maps calendar_events.csv (USD/EUR/GBP, 2014 ->
// 2026-07-02) onto the export's buckets. NOT the ForexFactory history the ladder's
// multipliers were fitted on (forge/ff_calendar.py; unavailable here), so Stage 0
// runs both this and an all-'none' variant — see forge/V4_STAGE0_PREREG.md.
import fs from 'fs';
import { instrumentCurrencies } from '../../js/volForecast.js';

const RANK = { FOMC: 6, NFP: 5, CPI: 4, high: 3, holiday: 2, none: 1 };
const RE_FOMC = /^(fed interest rate decision|fomc economic projections|fed press conference)$/i;
const RE_NFP = /^payroll jobs growth$/i;
const RE_CPI = /^(core )?inflation rate (month-over-month|year-over-year)$/i;

export function loadCalendarProxy(path = 'calendar_events.csv') {
  const text = fs.readFileSync(path, 'latin1');
  const rows = [];
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line) continue;
    const c = line.split(',');   // event names contain no commas in the fields used
    rows.push({ date: c[0], ccy: c[3], impact: c[4], event: c[5] });
  }
  const dates = rows.map(r => r.date).filter(d => /^\d{4}-\d\d-\d\d$/.test(d)).sort();
  const cover = [dates[0], dates.at(-1)];
  return function tagFor(instrument) {
    const ccys = new Set(instrumentCurrencies(instrument));
    const byDate = new Map();
    for (const r of rows) {
      if (!ccys.has(r.ccy)) continue;
      let tag = r.impact === 'Major' ? 'high' : 'none';
      if (r.ccy === 'USD' && r.impact === 'Major') {
        if (RE_FOMC.test(r.event)) tag = 'FOMC';
        else if (RE_NFP.test(r.event)) tag = 'NFP';
        else if (RE_CPI.test(r.event)) tag = 'CPI';
      }
      if (RANK[tag] > RANK[byDate.get(r.date) ?? 'none']) byDate.set(r.date, tag);
    }
    return date => (date < cover[0] || date > cover[1]) ? null : (byDate.get(date) ?? 'none');
  };
}
