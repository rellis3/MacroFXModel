/**
 * The standard outputs every new system produces (plans/DESK_ANALYST_PIPELINE.md §9ac), so a system built from a
 * research-pod proposal comes out the same way as the desk's existing backtests:
 *
 *   1. one trade list in the standard schema (below), written to analysis/output/systems/<id>/trades.json
 *   2. the quant tearsheet: js/backtestStats.js backtestStats (per-trade: win rate, expectancy, PF, payoff, CAGR,
 *      Sharpe, Sortino, Calmar, max drawdown and its length, bootstrap CIs, Monte Carlo drawdowns) and
 *      portfolioStats on the daily series (the honest Sharpe for concurrent trades, vol-targeted CAGR/DD, IID and block
 *      Monte Carlo, lag-1 autocorrelation), plus breakdowns by instrument, year and direction, streaks, R-multiple
 *      Monte Carlo and cost stress (js/validationDesk.js)
 *   3. the Prop Firm Toolkit CSVs in C.OG's three accepted formats (forge/OVERNIGHT_HOLD_TOOLKIT_PREREG.md §3):
 *        % returns    Date,Return %,MAE %                 Date = exit date (London)
 *        R-multiples  date,R,MAE (R)
 *        currency     Trade Date,PnL ($),Risk ($)         at the stated account and risk per trade
 *   4. the Data Terminal CSV: the C.OG import template (the same header as SignalCopier/outcome.py TEMPLATE_HEADER):
 *        Date,Time,Exit Date,Exit Time,Instrument,Direction,Model,Risk %,Return %,MAE %,MFE %,Tags,Notes
 *      times in London, Return/MAE/MFE in % of equity at Risk % per 1R
 *
 * The Python mirror (forge/system_exports.py) writes byte-identical CSVs from the same trades; both are checked
 * against tests/fixtures/system_exports/. Browser and Node; no I/O here (scripts/systems/writeSystemOutputs.mjs writes).
 *
 * Standard trade: { instrument, direction: 'Long'|'Short', entryMs, exitMs, entry?, stop?, exit?, riskPct (default 1),
 *   R, maeR?, mfeR?, returnPct?, maePct?, mfePct?, model?, tags?: string[], notes? }
 * R is the result in units of the trade's risk; returnPct = R × riskPct unless given. MAE is negative (against).
 */
import { backtestStats, portfolioStats } from './backtestStats.js';
import { tradeMonteCarlo, costStress } from './validationDesk.js';

export const TOOLKIT_HEADERS = { pct: 'Date,Return %,MAE %', r: 'date,R,MAE (R)', cash: 'Trade Date,PnL ($),Risk ($)' };
export const TERMINAL_HEADER = ['Date', 'Time', 'Exit Date', 'Exit Time', 'Instrument', 'Direction', 'Model', 'Risk %', 'Return %', 'MAE %', 'MFE %', 'Tags', 'Notes'];

const LDN = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** London date and time of a ms timestamp: ['YYYY-MM-DD', 'HH:MM']. */
export function london(ms) {
  if (!Number.isFinite(ms)) return ['', ''];
  const p = Object.fromEntries(LDN.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return [`${p.year}-${p.month}-${p.day}`, `${p.hour}:${p.minute}`];
}
const num = (x, d = 4) => (Number.isFinite(x) ? String(+x.toFixed(d)) : '');
const fin = x => Number.isFinite(x);

/** Fill the derived fields and check each trade; returns { trades, errors }. Trades are sorted by exit time. */
export function normaliseTrades(raw, { riskPct = 1, model = '' } = {}) {
  const trades = [], errors = [];
  (raw ?? []).forEach((t, i) => {
    const dir = /^(long|buy|1)$/i.test(String(t?.direction ?? t?.side ?? '')) ? 'Long' : /^(short|sell|-1)$/i.test(String(t?.direction ?? t?.side ?? '')) ? 'Short' : null;
    const rp = fin(t?.riskPct) ? t.riskPct : riskPct;
    const R = fin(t?.R) ? t.R : fin(t?.returnPct) && rp > 0 ? t.returnPct / rp : null;
    if (!t?.instrument || !dir || !fin(t?.exitMs) || !fin(R)) { errors.push(`trade ${i}: needs instrument, direction, exitMs and R (or returnPct)`); return; }
    const maeR = fin(t.maeR) ? t.maeR : fin(t.maePct) && rp > 0 ? t.maePct / rp : null, mfeR = fin(t.mfeR) ? t.mfeR : fin(t.mfePct) && rp > 0 ? t.mfePct / rp : null;
    trades.push({ instrument: String(t.instrument), direction: dir, entryMs: fin(t.entryMs) ? t.entryMs : t.exitMs, exitMs: t.exitMs,
      entry: t.entry ?? null, stop: t.stop ?? null, exit: t.exit ?? null, riskPct: rp, R,
      maeR: fin(maeR) ? Math.min(0, maeR) : null, mfeR: fin(mfeR) ? Math.max(0, mfeR) : null,
      returnPct: fin(t.returnPct) ? t.returnPct : R * rp, maePct: fin(t.maePct) ? t.maePct : fin(maeR) ? Math.min(0, maeR) * rp : null, mfePct: fin(t.mfePct) ? t.mfePct : fin(mfeR) ? Math.max(0, mfeR) * rp : null,
      model: t.model ?? model, tags: Array.isArray(t.tags) ? t.tags : t.tags ? String(t.tags).split(/[ ,]+/).filter(Boolean) : [], notes: t.notes ?? '' });
  });
  trades.sort((a, b) => a.exitMs - b.exitMs || a.entryMs - b.entryMs);
  return { trades, errors };
}

const esc = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** A Prop Firm Toolkit CSV. kind: 'pct' | 'r' | 'cash'. MAE missing = the result itself if a loss, else 0. */
export function toolkitCsv(trades, kind = 'pct', { account = 100000, riskPct = null } = {}) {
  const rows = [TOOLKIT_HEADERS[kind]]; if (!rows[0]) throw new Error(`kind must be pct, r or cash`);
  for (const t of trades) {
    const d = london(t.exitMs)[0], maeR = fin(t.maeR) ? t.maeR : Math.min(0, t.R), rp = riskPct ?? t.riskPct;
    if (kind === 'pct') rows.push(`${d},${num(t.returnPct)},${num(fin(t.maePct) ? t.maePct : maeR * t.riskPct)}`);
    else if (kind === 'r') rows.push(`${d},${num(t.R)},${num(maeR)}`);
    else { const risk = account * rp / 100; rows.push(`${d},${(t.R * risk).toFixed(2)},${risk.toFixed(2)}`); }
  }
  return rows.join('\n') + '\n';
}

/** The Data Terminal CSV (C.OG import template). */
export function terminalCsv(trades) {
  const rows = [TERMINAL_HEADER.join(',')];
  for (const t of trades) {
    const [d, tm] = london(t.entryMs), [ed, et] = london(t.exitMs);
    const notes = t.notes || [t.entry != null ? `entry ${t.entry}` : '', t.stop != null ? `SL ${t.stop}` : '', t.exit != null ? `exit ${t.exit}` : ''].filter(Boolean).join('; ');
    rows.push([d, tm, ed, et, t.instrument, t.direction, t.model, num(t.riskPct), num(t.returnPct), num(t.maePct), num(t.mfePct), t.tags.join(' '), notes].map(esc).join(','));
  }
  return rows.join('\n') + '\n';
}

/** Parse a Data Terminal CSV back to standard trades (dates read as London wall-clock times). */
export function parseTerminalCsv(text) {
  const lines = String(text ?? '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  const split = l => { const out = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; };
  const head = split(lines[0] ?? '').map(h => h.trim()), ix = Object.fromEntries(head.map((h, i) => [h, i]));
  if (!TERMINAL_HEADER.every(h => h in ix)) return { trades: [], errors: ['not a Data Terminal CSV: header must be ' + TERMINAL_HEADER.join(',')] };
  const ms = (d, t) => { if (!d) return NaN; const [y, m, dd] = d.split('-').map(Number), [hh, mm] = (t || '00:00').split(':').map(Number); const guess = Date.UTC(y, m - 1, dd, hh, mm); const [gd, gt] = london(guess); const off = (Date.UTC(...gd.split('-').map((v, i) => (i === 1 ? +v - 1 : +v)), ...gt.split(':').map(Number)) - guess); return guess - off; };
  return normaliseTrades(lines.slice(1).map(l => { const c = split(l), g = h => c[ix[h]] ?? ''; const rp = +g('Risk %') || 1;
    return { instrument: g('Instrument'), direction: g('Direction'), entryMs: ms(g('Date'), g('Time')), exitMs: ms(g('Exit Date') || g('Date'), g('Exit Time') || g('Time')), riskPct: rp,
      returnPct: g('Return %') === '' ? NaN : +g('Return %'), maePct: g('MAE %') === '' ? NaN : +g('MAE %'), mfePct: g('MFE %') === '' ? NaN : +g('MFE %'), model: g('Model'), tags: g('Tags'), notes: g('Notes') }; }));
}

const r3 = x => (fin(x) ? +x.toFixed(3) : null);
const group = (trades, key) => { const m = {}; for (const t of trades) (m[key(t)] ??= []).push(t); return m; };
const brief = ts => { const r = ts.map(t => t.returnPct), w = r.filter(x => x > 0), l = r.filter(x => x < 0), s = r.reduce((a, b) => a + b, 0);
  return { trades: ts.length, winRate: r3(w.length / ts.length), totalPct: r3(s), expectancyPct: r3(s / ts.length), meanR: r3(ts.reduce((a, t) => a + t.R, 0) / ts.length), profitFactor: l.length ? r3(w.reduce((a, b) => a + b, 0) / -l.reduce((a, b) => a + b, 0)) : null }; };

/**
 * The quant tearsheet for a system's trades. costR: optional per-trade cost in R (spread + commission) for the cost
 * stress; trialSharpes: other variants tried, for the deflated Sharpe in portfolioStats' caller.
 */
export function tearsheet(trades, { costR = null, seed = 0x9e3779b9 } = {}) {
  if (!trades?.length) return { ok: false, error: 'no trades' };
  const pct = trades.map(t => t.returnPct), dates = trades.map(t => london(t.exitMs)[0]);
  const byDay = {}; trades.forEach((t, i) => { byDay[dates[i]] = (byDay[dates[i]] ?? 0) + t.returnPct; });
  const days = Object.keys(byDay).sort(), daily = days.map(d => byDay[d]);
  let run = 0, worst = 0, best = 0, cur = 0;
  for (const t of trades) { if (t.R > 0) { cur = cur > 0 ? cur + 1 : 1; } else if (t.R < 0) { cur = cur < 0 ? cur - 1 : -1; } else cur = 0; best = Math.max(best, cur); worst = Math.min(worst, cur); run++; }
  const R = trades.map(t => t.R), mae = trades.map(t => t.maeR).filter(fin), mfe = trades.map(t => t.mfeR).filter(fin);
  return {
    ok: true, from: dates[0], to: dates.at(-1), trades: trades.length, days: days.length, instruments: [...new Set(trades.map(t => t.instrument))],
    perTrade: backtestStats(pct, dates, { seed }), portfolio: portfolioStats(daily, { mc: true }),
    rMultiples: { mean: r3(R.reduce((a, b) => a + b, 0) / R.length), median: r3([...R].sort((a, b) => a - b)[R.length >> 1]), monteCarlo: tradeMonteCarlo(R, { seed }),
      maeMedian: mae.length ? r3([...mae].sort((a, b) => a - b)[mae.length >> 1]) : null, mfeMedian: mfe.length ? r3([...mfe].sort((a, b) => a - b)[mfe.length >> 1]) : null },
    streaks: { longestWin: best, longestLoss: -worst },
    byInstrument: Object.fromEntries(Object.entries(group(trades, t => t.instrument)).map(([k, v]) => [k, brief(v)])),
    byYear: Object.fromEntries(Object.entries(group(trades, t => london(t.exitMs)[0].slice(0, 4))).sort().map(([k, v]) => [k, brief(v)])),
    byDirection: Object.fromEntries(Object.entries(group(trades, t => t.direction)).map(([k, v]) => [k, brief(v)])),
    costs: fin(costR) ? costStress(R.map(r => r + costR), R.map(() => costR), { periodsPerYear: Math.max(1, Math.round(trades.length / Math.max(0.25, days.length / 252))) }) : null,
    label: 'backtest description; the validation desk gates decide whether it goes to paper',
  };
}

/** Every standard output as { filename: content } (the writer and the page both use this). */
export function systemFiles(id, trades, meta = {}, { account = 100000 } = {}) {
  const ts = tearsheet(trades, meta);
  return {
    'trades.json': JSON.stringify({ id, meta, trades }, null, 1),
    'tearsheet.json': JSON.stringify({ id, meta, ...ts }, null, 1),
    'toolkit_pct.csv': toolkitCsv(trades, 'pct'),
    'toolkit_r.csv': toolkitCsv(trades, 'r'),
    'toolkit_cash.csv': toolkitCsv(trades, 'cash', { account }),
    'data_terminal.csv': terminalCsv(trades),
  };
}
