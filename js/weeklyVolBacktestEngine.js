/**
 * Weekly Vol & Range Backtester — walk-forward, Monday-anchored.
 *
 * Strategy:
 *   Every Monday: EWMA(λ=0.94) vol from all prior daily closes → σ_d,
 *   scaled to weekly: σ_w = σ_d × √5.
 *   Mark 4 levels from Monday open:
 *     HL50_up/dn = open ± BM_P50 × hl_50_corr × σ_w  (median weekly range)
 *     HL75_up/dn = open ± BM_P75 × hl_75_corr × σ_w  (75th pct weekly range)
 *     OCMed_up/dn = open ± HN_P50 × oc_corr   × σ_w  (median OC body)
 *     OC75_up/dn  = open ± HN_P75 × oc_75_corr × σ_w (75th pct OC body)
 *   Fade: limit orders placed at those levels, TP = Monday open (mean reversion).
 *
 * Modes:
 *   revHL50   — entry HL50, TP = Mon open, SL = HL75            (~3.8:1 R:R)
 *   revHL75   — entry HL75, TP = Mon open, SL = HL75 × slMult
 *   both      — both simultaneously (up to 4 fills per week per instrument)
 *   ocLevels  — entry OCMed or OC75 (body fades)
 *   allLevels — all four levels simultaneously
 *
 * SL/TP modes (slMode / tpMode):
 *   'level' — use HL-geometry based levels (default)
 *   'atr'   — ATR30 × multiplier
 *   'pips'  — fixed pip distance
 *
 * Supports all 26 Asia-Range pairs.
 * Requires process.env.OANDA_KEY.
 */

import {
  fetchD1, ewmaVarSeries,
  ASSET_PARAMS, BM_P50, BM_P75, HN_P50, HN_P75,
} from './volBacktestEngine.js';

const SQRT5 = Math.sqrt(5);

// ── Pip sizes for all 26 instruments ─────────────────────────────────────────

export const PIP_SIZE = {
  EURUSD: 0.0001, GBPUSD: 0.0001, USDJPY: 0.01,  AUDUSD: 0.0001,
  NZDUSD: 0.0001, USDCAD: 0.0001, USDCHF: 0.0001, GBPJPY: 0.01,
  EURJPY: 0.01,   EURGBP: 0.0001, EURAUD: 0.0001, EURCAD: 0.0001,
  EURCHF: 0.0001, EURNZD: 0.0001, AUDJPY: 0.01,   AUDNZD: 0.0001,
  AUDCAD: 0.0001, AUDCHF: 0.0001, GBPAUD: 0.0001, GBPCAD: 0.0001,
  GBPCHF: 0.0001, GBPNZD: 0.0001, CADJPY: 0.01,   CHFJPY: 0.01,
  NZDJPY: 0.01,   GOLD:   0.1,
};

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

// ── ATR ───────────────────────────────────────────────────────────────────────
// Average True Range over the last `period` D1 bars (requires ≥2 bars).
function computeATR(bars, period = 30) {
  const n = bars.length;
  if (n < 2) return 0;
  const start = Math.max(1, n - period);
  let sum = 0, count = 0;
  for (let i = start; i < n; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low  - bars[i - 1].close)
    );
    sum += tr; count++;
  }
  return count > 0 ? sum / count : 0;
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
// Walks each D1 bar in the week, placing limit orders at levels and resolving
// outcomes bar-by-bar.  Returns an array of trade objects (1–8 per week max).
//
// levelPcts: { hl50pct, hl75pct, ocMedpct, oc75pct, atr30 }
function simulateWeek(mondayOpen, weekBars, levelPcts, opts) {
  const { hl50pct, hl75pct, ocMedpct, oc75pct, atr30 = 0 } = levelPcts;
  const {
    strategy  = 'revHL50',
    slMode    = 'level',
    tpMode    = 'open',
    slMult    = 1.5,
    atrSlMult = 1.5,
    atrTpMult = 2.0,
    slPips    = 30,
    tpPips    = 50,
    spreadPct = 0,
    pair      = '',
  } = opts;

  const pip     = PIP_SIZE[pair] ?? 0.0001;
  const safeAtr = atr30 > 0 ? atr30 : null; // null → ATR mode falls back to level-based

  // ── Entry price levels ────────────────────────────────────────────────────────
  const hl50Up  = mondayOpen * (1 + hl50pct  / 100);
  const hl75Up  = mondayOpen * (1 + hl75pct  / 100);
  const hl50Dn  = mondayOpen * (1 - hl50pct  / 100);
  const hl75Dn  = mondayOpen * (1 - hl75pct  / 100);
  const ocMedUp = mondayOpen * (1 + ocMedpct / 100);
  const ocMedDn = mondayOpen * (1 - ocMedpct / 100);
  const oc75Up  = mondayOpen * (1 + oc75pct  / 100);
  const oc75Dn  = mondayOpen * (1 - oc75pct  / 100);

  // ── SL / TP resolvers ────────────────────────────────────────────────────────
  const getSl = (side, entry, fallback) => {
    if (slMode === 'atr'  && safeAtr) return side === 'SELL' ? entry + safeAtr * atrSlMult : entry - safeAtr * atrSlMult;
    if (slMode === 'pips')             return side === 'SELL' ? entry + slPips  * pip       : entry - slPips  * pip;
    return fallback;
  };
  const getTp = (side, entry, fallback) => {
    if (tpMode === 'atr'  && safeAtr) return side === 'SELL' ? entry - safeAtr * atrTpMult : entry + safeAtr * atrTpMult;
    if (tpMode === 'pips')             return side === 'SELL' ? entry - tpPips  * pip       : entry + tpPips  * pip;
    return fallback; // default: mondayOpen
  };

  // ── Strategy flags ────────────────────────────────────────────────────────────
  const doHL50  = strategy === 'revHL50'  || strategy === 'both'     || strategy === 'allLevels';
  const doHL75  = strategy === 'revHL75'  || strategy === 'both'     || strategy === 'allLevels';
  const doOCMed = strategy === 'ocLevels' || strategy === 'allLevels';
  const doOC75  = strategy === 'ocLevels' || strategy === 'allLevels';

  // ── Pre-compute SL / TP prices per slot ──────────────────────────────────────
  // Level-based SL defaults:
  //   HL50  → SL at HL75 (same geometry as daily Rev-HL50)
  //   HL75  → SL at HL75 × slMult beyond Monday open
  //   OCMed → SL at OC75 (next level out)
  //   OC75  → SL at HL50 (next level out)
  const slMap = {
    SELL_HL50:  getSl('SELL', hl50Up,  hl75Up),
    BUY_HL50:   getSl('BUY',  hl50Dn,  hl75Dn),
    SELL_HL75:  getSl('SELL', hl75Up,  mondayOpen * (1 + hl75pct * slMult / 100)),
    BUY_HL75:   getSl('BUY',  hl75Dn,  mondayOpen * (1 - hl75pct * slMult / 100)),
    SELL_OCMed: getSl('SELL', ocMedUp, oc75Up),
    BUY_OCMed:  getSl('BUY',  ocMedDn, oc75Dn),
    SELL_OC75:  getSl('SELL', oc75Up,  hl50Up),
    BUY_OC75:   getSl('BUY',  oc75Dn,  hl50Dn),
  };
  const tpMap = {
    SELL_HL50:  getTp('SELL', hl50Up,  mondayOpen),
    BUY_HL50:   getTp('BUY',  hl50Dn,  mondayOpen),
    SELL_HL75:  getTp('SELL', hl75Up,  mondayOpen),
    BUY_HL75:   getTp('BUY',  hl75Dn,  mondayOpen),
    SELL_OCMed: getTp('SELL', ocMedUp, mondayOpen),
    BUY_OCMed:  getTp('BUY',  ocMedDn, mondayOpen),
    SELL_OC75:  getTp('SELL', oc75Up,  mondayOpen),
    BUY_OC75:   getTp('BUY',  oc75Dn,  mondayOpen),
  };

  const slots = {
    SELL_HL50:  null,
    BUY_HL50:   null,
    SELL_HL75:  null,
    BUY_HL75:   null,
    SELL_OCMed: null,
    BUY_OCMed:  null,
    SELL_OC75:  null,
    BUY_OC75:   null,
  };

  for (const bar of weekBars) {
    const { date, high, low } = bar;

    // ── Check new fills (only first hit per slot) ────────────────────────────
    const tryFill = (key, side, level, entry) => {
      if (!slots[key]) {
        const sl = slMap[key], tp = tpMap[key];
        const res = resolveOnBar(side, entry, tp, sl, bar, mondayOpen);
        const mfe0 = side === 'SELL'
          ? Math.max(0, entry - bar.low)  / mondayOpen * 100
          : Math.max(0, bar.high - entry) / mondayOpen * 100;
        const mae0 = side === 'SELL'
          ? Math.max(0, bar.high - entry) / mondayOpen * 100
          : Math.max(0, entry - bar.low)  / mondayOpen * 100;
        slots[key] = { side, level, entry, tp, sl, fillDate: date, mfe: mfe0, mae: mae0,
                       ...(res ?? { outcome: 'open', pnlPct: 0 }) };
      }
    };

    if (doHL50  && high >= hl50Up)  tryFill('SELL_HL50',  'SELL', 'HL50',  hl50Up);
    if (doHL50  && low  <= hl50Dn)  tryFill('BUY_HL50',   'BUY',  'HL50',  hl50Dn);
    if (doHL75  && high >= hl75Up)  tryFill('SELL_HL75',  'SELL', 'HL75',  hl75Up);
    if (doHL75  && low  <= hl75Dn)  tryFill('BUY_HL75',   'BUY',  'HL75',  hl75Dn);
    if (doOCMed && high >= ocMedUp) tryFill('SELL_OCMed', 'SELL', 'OCMed', ocMedUp);
    if (doOCMed && low  <= ocMedDn) tryFill('BUY_OCMed',  'BUY',  'OCMed', ocMedDn);
    if (doOC75  && high >= oc75Up)  tryFill('SELL_OC75',  'SELL', 'OC75',  oc75Up);
    if (doOC75  && low  <= oc75Dn)  tryFill('BUY_OC75',   'BUY',  'OC75',  oc75Dn);

    // ── Carry open trades into this bar ─────────────────────────────────────
    for (const t of Object.values(slots)) {
      if (t?.outcome === 'open') {
        const mfeInc = t.side === 'SELL'
          ? Math.max(0, t.entry - bar.low)  / mondayOpen * 100
          : Math.max(0, bar.high - t.entry) / mondayOpen * 100;
        const maeInc = t.side === 'SELL'
          ? Math.max(0, bar.high - t.entry) / mondayOpen * 100
          : Math.max(0, t.entry - bar.low)  / mondayOpen * 100;
        if (mfeInc > (t.mfe ?? 0)) t.mfe = mfeInc;
        if (maeInc > (t.mae ?? 0)) t.mae = maeInc;
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
      // outcome stays 'open' — distinguishes EOW force-close from TP/SL
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
  const { dateFrom = '', dateTo = '', minLookback = 60, atrPeriod = 30 } = opts;
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

    const hl50pct  = BM_P50 * p.hl_50_corr  * sigmaW * 100;
    const hl75pct  = BM_P75 * p.hl_75_corr  * sigmaW * 100;
    const ocMedpct = HN_P50 * p.oc_corr     * sigmaW * 100;
    const oc75pct  = HN_P75 * p.oc_75_corr  * sigmaW * 100;

    // ATR from bars before this Monday (for ATR-mode SL/TP)
    const barsBeforeMonday = bars.slice(Math.max(0, mondayIdx - atrPeriod - 5), mondayIdx);
    const atr30 = computeATR(barsBeforeMonday, atrPeriod);

    const mondayOpen = mondayBar.open;
    const levelPcts  = { hl50pct, hl75pct, ocMedpct, oc75pct, atr30 };
    const trades     = simulateWeek(mondayOpen, weekBars, levelPcts, opts);

    for (const t of trades) {
      records.push({
        week:        weekKey,
        date:        mondayDate,
        hl50_pct:    +hl50pct.toFixed(4),
        hl75_pct:    +hl75pct.toFixed(4),
        oc_med_pct:  +ocMedpct.toFixed(4),
        oc75_pct:    +oc75pct.toFixed(4),
        atr30:       +atr30.toFixed(6),
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
        mfe_pct:     t.mfe != null ? +t.mfe.toFixed(5) : null,
        mae_pct:     t.mae != null ? +t.mae.toFixed(5) : null,
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
      const trades = runWeeklyBacktest(bars, cfg.assetClass, { ...opts, pair: cfg.name })
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
