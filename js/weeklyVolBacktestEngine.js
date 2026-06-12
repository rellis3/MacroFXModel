/**
 * Weekly Vol & Range Backtester — walk-forward, Monday-anchored.
 *
 * Strategy:
 *   Every Monday: EWMA(λ=0.94) vol from all prior daily closes → σ_d,
 *   scaled to weekly: σ_w = σ_d × √5.
 *   Mark 4 levels from Monday open:
 *     HL50_up/dn = open ± BM_P50 × hl_50_corr × σ_w  (median weekly range)
 *     HL75_up/dn = open ± BM_P75 × hl_75_corr × σ_w  (75th pct weekly range)
 *   Fade: limit orders placed at those levels, TP = Monday open (mean reversion).
 *
 * Modes:
 *   revHL50 — entry HL50, TP = Mon open, SL = HL75            (~3.8:1 R:R)
 *   revHL75 — entry HL75, TP = Mon open, SL = HL75 × slMult
 *   both    — both simultaneously (up to 4 fills per week per instrument)
 *
 * Supports all 26 Asia-Range pairs.
 * Requires process.env.OANDA_KEY.
 */

import {
  fetchD1, ewmaVarSeries,
  ASSET_PARAMS, BM_P50, BM_P75, HN_P50, HN_P75,
} from './volBacktestEngine.js';

const SQRT5 = Math.sqrt(5);

// ── All 26 instruments (Asia Range pair set) ──────────────────────────────────

export const WEEKLY_INSTRUMENTS = [
  // Majors
  { name: 'EURUSD', oanda: 'EUR_USD',  assetClass: 'fx'        },
  { name: 'GBPUSD', oanda: 'GBP_USD',  assetClass: 'fx'        },
  { name: 'USDJPY', oanda: 'USD_JPY',  assetClass: 'fx'        },
  { name: 'AUDUSD', oanda: 'AUD_USD',  assetClass: 'fx'        },
  { name: 'NZDUSD', oanda: 'NZD_USD',  assetClass: 'fx'        },
  { name: 'USDCAD', oanda: 'USD_CAD',  assetClass: 'fx'        },
  { name: 'USDCHF', oanda: 'USD_CHF',  assetClass: 'fx'        },
  { name: 'GBPJPY', oanda: 'GBP_JPY',  assetClass: 'fx'        },
  // EUR crosses
  { name: 'EURJPY', oanda: 'EUR_JPY',  assetClass: 'fx'        },
  { name: 'EURGBP', oanda: 'EUR_GBP',  assetClass: 'fx'        },
  { name: 'EURAUD', oanda: 'EUR_AUD',  assetClass: 'fx'        },
  { name: 'EURCAD', oanda: 'EUR_CAD',  assetClass: 'fx'        },
  { name: 'EURCHF', oanda: 'EUR_CHF',  assetClass: 'fx'        },
  { name: 'EURNZD', oanda: 'EUR_NZD',  assetClass: 'fx'        },
  // AUD crosses
  { name: 'AUDJPY', oanda: 'AUD_JPY',  assetClass: 'fx'        },
  { name: 'AUDNZD', oanda: 'AUD_NZD',  assetClass: 'fx'        },
  { name: 'AUDCAD', oanda: 'AUD_CAD',  assetClass: 'fx'        },
  { name: 'AUDCHF', oanda: 'AUD_CHF',  assetClass: 'fx'        },
  // GBP crosses
  { name: 'GBPAUD', oanda: 'GBP_AUD',  assetClass: 'fx'        },
  { name: 'GBPCAD', oanda: 'GBP_CAD',  assetClass: 'fx'        },
  { name: 'GBPCHF', oanda: 'GBP_CHF',  assetClass: 'fx'        },
  { name: 'GBPNZD', oanda: 'GBP_NZD',  assetClass: 'fx'        },
  // Other crosses
  { name: 'CADJPY', oanda: 'CAD_JPY',  assetClass: 'fx'        },
  { name: 'CHFJPY', oanda: 'CHF_JPY',  assetClass: 'fx'        },
  { name: 'NZDJPY', oanda: 'NZD_JPY',  assetClass: 'fx'        },
  // Commodity
  { name: 'GOLD',   oanda: 'XAU_USD',  assetClass: 'commodity' },
];

// ── Date helpers ──────────────────────────────────────────────────────────────

function getUTCDay(dateStr) {
  return new Date(dateStr + 'T12:00:00Z').getUTCDay(); // 0=Sun 1=Mon … 6=Sat
}

// Returns "YYYY-MM-DD" of the Monday of the week that contains dateStr.
function getWeekKey(dateStr) {
  const d   = new Date(dateStr + 'T12:00:00Z');
  const dow = d.getUTCDay();
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return mon.toISOString().substring(0, 10);
}

// ── Per-bar trade resolution ───────────────────────────────────────────────────
// Returns { outcome, pnlPct } if the trade closes on this bar, else null.
// P&L is expressed as % of mondayOpen (anchor price, not entry).
function resolveOnBar(side, entry, tp, sl, bar, mondayOpen) {
  const { high, low } = bar;
  if (side === 'SELL') {
    // SL is above entry — check first (extension means loss)
    if (high >= sl) return { outcome: 'loss', pnlPct: +((entry - sl) / mondayOpen * 100).toFixed(5) };
    // TP is below entry (mean reversion back to Monday open)
    if (low  <= tp) return { outcome: 'win',  pnlPct: +((entry - tp) / mondayOpen * 100).toFixed(5) };
  } else {
    if (low  <= sl) return { outcome: 'loss', pnlPct: +((sl - entry) / mondayOpen * 100).toFixed(5) };
    if (high >= tp) return { outcome: 'win',  pnlPct: +((tp - entry) / mondayOpen * 100).toFixed(5) };
  }
  return null; // still open
}

// ── Weekly trade simulator ─────────────────────────────────────────────────────
// Walks each D1 bar in the week, placing limit orders at HL50/HL75 levels and
// resolving outcomes bar-by-bar.  Returns an array of trade objects (1–4 per week).
function simulateWeek(mondayOpen, weekBars, levelPcts, opts) {
  const { hl50pct, hl75pct } = levelPcts;
  const { strategy = 'revHL50', slMult = 1.5, spreadPct = 0 } = opts;

  const hl50Up = mondayOpen * (1 + hl50pct / 100);
  const hl75Up = mondayOpen * (1 + hl75pct / 100);
  const hl50Dn = mondayOpen * (1 - hl50pct / 100);
  const hl75Dn = mondayOpen * (1 - hl75pct / 100);

  const doHL50 = strategy === 'revHL50' || strategy === 'both';
  const doHL75 = strategy === 'revHL75' || strategy === 'both';

  // TP for all fades = Monday open (full mean-reversion target)
  // SL for revHL50: HL75 (same geometry as daily Rev-HL50)
  // SL for revHL75: HL75 × slMult above Monday open
  const slUpFor50 = hl75Up;
  const slDnFor50 = hl75Dn;
  const slUpFor75 = mondayOpen * (1 + hl75pct * slMult / 100);
  const slDnFor75 = mondayOpen * (1 - hl75pct * slMult / 100);

  const slots = {
    SELL_HL50: null,
    BUY_HL50:  null,
    SELL_HL75: null,
    BUY_HL75:  null,
  };

  for (const bar of weekBars) {
    const { date, high, low } = bar;

    // ── Check new fills (only first hit per slot) ────────────────────────────
    if (doHL50 && !slots.SELL_HL50 && high >= hl50Up) {
      const res = resolveOnBar('SELL', hl50Up, mondayOpen, slUpFor50, bar, mondayOpen);
      slots.SELL_HL50 = { side: 'SELL', level: 'HL50', entry: hl50Up, tp: mondayOpen, sl: slUpFor50, fillDate: date, ...(res ?? { outcome: 'open', pnlPct: 0 }) };
    }
    if (doHL50 && !slots.BUY_HL50 && low <= hl50Dn) {
      const res = resolveOnBar('BUY', hl50Dn, mondayOpen, slDnFor50, bar, mondayOpen);
      slots.BUY_HL50 = { side: 'BUY', level: 'HL50', entry: hl50Dn, tp: mondayOpen, sl: slDnFor50, fillDate: date, ...(res ?? { outcome: 'open', pnlPct: 0 }) };
    }
    if (doHL75 && !slots.SELL_HL75 && high >= hl75Up) {
      const res = resolveOnBar('SELL', hl75Up, mondayOpen, slUpFor75, bar, mondayOpen);
      slots.SELL_HL75 = { side: 'SELL', level: 'HL75', entry: hl75Up, tp: mondayOpen, sl: slUpFor75, fillDate: date, ...(res ?? { outcome: 'open', pnlPct: 0 }) };
    }
    if (doHL75 && !slots.BUY_HL75 && low <= hl75Dn) {
      const res = resolveOnBar('BUY', hl75Dn, mondayOpen, slDnFor75, bar, mondayOpen);
      slots.BUY_HL75 = { side: 'BUY', level: 'HL75', entry: hl75Dn, tp: mondayOpen, sl: slDnFor75, fillDate: date, ...(res ?? { outcome: 'open', pnlPct: 0 }) };
    }

    // ── Carry open trades into this bar ─────────────────────────────────────
    for (const t of Object.values(slots)) {
      if (t?.outcome === 'open') {
        const res = resolveOnBar(t.side, t.entry, t.tp, t.sl, bar, mondayOpen);
        if (res) Object.assign(t, res);
      }
    }
  }

  // ── Force-close anything still open at EOW ────────────────────────────────
  const eowClose = weekBars.at(-1)?.close ?? mondayOpen;
  const eowDate  = weekBars.at(-1)?.date;
  for (const t of Object.values(slots)) {
    if (t?.outcome === 'open') {
      t.pnlPct = t.side === 'SELL'
        ? +((t.entry - eowClose) / mondayOpen * 100).toFixed(5)
        : +((eowClose - t.entry) / mondayOpen * 100).toFixed(5);
      t.closeDate = eowDate;
    }
  }

  // ── Collect filled trades, apply spread ───────────────────────────────────
  const result = Object.values(slots)
    .filter(Boolean)
    .map(t => ({ ...t, filled: true, pnlPct: +(t.pnlPct - spreadPct).toFixed(5) }));

  return result.length
    ? result
    : [{ filled: false, side: '', level: '', outcome: 'no_fill', pnlPct: 0, fillDate: null }];
}

// ── Walk-forward weekly backtester ────────────────────────────────────────────

export function runWeeklyBacktest(bars, assetClass, opts = {}) {
  const { dateFrom = '', dateTo = '', minLookback = 60 } = opts;
  const p = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;

  // Build full EWMA var series incrementally (O(n), avoids O(n²) re-computation)
  const closes  = bars.map(b => b.close);
  const logRets = [];
  for (let i = 1; i < closes.length; i++) logRets.push(Math.log(closes[i] / closes[i - 1]));
  const ewmaVars = ewmaVarSeries(logRets);
  // ewmaVars[i] = EWMA var after observing logRets[0..i], corresponds to close of bars[i+1].
  // To predict range for bars[k]: use ewmaVars[k-2] (var through bars[k-1]).

  const dateToIdx = new Map();
  for (let i = 0; i < bars.length; i++) dateToIdx.set(bars[i].date, i);

  // Group D1 bars by ISO week
  const weekMap = new Map();
  for (const bar of bars) {
    const wk = getWeekKey(bar.date);
    if (!weekMap.has(wk)) weekMap.set(wk, []);
    weekMap.get(wk).push(bar);
  }
  const sortedWeeks = [...weekMap.entries()].sort(([a], [b]) => a < b ? -1 : 1);

  const records = [];

  for (const [weekKey, weekBars] of sortedWeeks) {
    if (!weekBars.length) continue;

    // Monday bar is the anchor; fall back to first bar if Monday is a holiday
    const mondayBar  = weekBars.find(b => getUTCDay(b.date) === 1) ?? weekBars[0];
    const mondayDate = mondayBar.date;
    const mondayIdx  = dateToIdx.get(mondayDate) ?? 0;

    if (mondayIdx < minLookback) continue;
    if (dateFrom && weekKey < dateFrom.substring(0, 10)) continue;
    if (dateTo   && weekKey > dateTo.substring(0, 10))   continue;

    // EWMA var at Monday open = computed through all closes before Monday
    const varIdx = Math.max(0, mondayIdx - 2);
    const sigmaD = Math.sqrt(Math.max(ewmaVars[varIdx] ?? 0, 1e-12));
    const sigmaW = sigmaD * SQRT5;

    const hl50pct  = BM_P50 * p.hl_50_corr * sigmaW * 100;
    const hl75pct  = BM_P75 * p.hl_75_corr * sigmaW * 100;
    const ocMedpct = HN_P50 * p.oc_corr    * sigmaW * 100;

    const mondayOpen = mondayBar.open;
    const levelPcts  = { hl50pct, hl75pct, ocMedpct };
    const trades     = simulateWeek(mondayOpen, weekBars, levelPcts, opts);

    for (const t of trades) {
      records.push({
        week:        weekKey,
        date:        mondayDate,
        hl50_pct:    +hl50pct.toFixed(4),
        hl75_pct:    +hl75pct.toFixed(4),
        oc_med_pct:  +ocMedpct.toFixed(4),
        monday_open: +mondayOpen.toFixed(6),
        filled:      t.filled,
        side:        t.side,
        level:       t.level,
        outcome:     t.outcome,
        pnl_pct:     t.pnlPct,
        entry:       t.entry   != null ? +t.entry.toFixed(6)   : null,
        tp:          t.tp      != null ? +t.tp.toFixed(6)      : null,
        sl:          t.sl      != null ? +t.sl.toFixed(6)      : null,
        fill_date:   t.fillDate ?? null,
      });
    }
  }

  return records;
}

// ── Public: run all instruments ────────────────────────────────────────────────

export async function runFullWeeklyBacktest(opts = {}, instruments = WEEKLY_INSTRUMENTS) {
  if (!process.env.OANDA_KEY) throw new Error('OANDA_KEY not set — cannot fetch D1 data');

  const allTrades = [];
  const log       = [];

  for (const cfg of instruments) {
    try {
      log.push(`Fetching ${cfg.name}…`);
      const bars   = await fetchD1(cfg.oanda, 5000);
      log.push(`  ${bars.length} bars (${bars[0]?.date} → ${bars.at(-1)?.date})`);
      const trades = runWeeklyBacktest(bars, cfg.assetClass, opts)
        .map(r => ({ instrument: cfg.name, ...r }));
      allTrades.push(...trades);
      log.push(`  ${trades.filter(t => t.filled).length} filled`);
    } catch (e) {
      log.push(`  ${cfg.name}: ${e.message}`);
    }
  }

  return { trades: allTrades, log };
}

export { WEEKLY_INSTRUMENTS as INSTRUMENTS };
