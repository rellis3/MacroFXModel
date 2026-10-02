// Rich-vol break paper record — pure logic (no I/O). The live job in js/paperRecordRoutes.js calls these.
//
// The rule (fade-continue-book branch, forge/BREAK_IVRV_PREREG.md + forge/IVRV_COT_PREREG.md):
//   On a day when implied vol is RICH versus realised vol, take the first 1-minute close at least 0.05σ through a
//   Vol Forecast line between 00:00 and 10:00 London, entering at the next bar's open in the break direction.
//   Stop 0.1σ or 0.2σ behind the line; targets 5R and 10R; exit at the London day's last bar. One break per line per day.
// Backtest: +0.118R per trade on FX/gold (CVOL), +0.212R with settlement IV, +0.071R on indices (CBOE vol indices).
// This record is a forward test, not a trading rule.
import { LINE_SIDE, linesAtBar } from './voteAtlasV4Lines.js';

export const BREAK_LINES = ['OH_p50', 'OH_p75', 'CloseUp_p50', 'CloseUp_p75', 'ProjH_p50',
                            'OL_p50', 'OL_p75', 'CloseDn_p50', 'CloseDn_p75', 'ProjL_p50'];
export const STOPS = [0.1, 0.2];
export const TARGETS = [5, 10];
export const END_MIN = 600;            // entries from 00:00 to 10:00 London (signal bar minute < 600)
export const BREAK_SIGMA = 0.05;       // a close this far through the line (in σ) counts as a break

// Instruments and where their implied vol comes from. `rich` = IV ÷ RV at or above this is a rich day.
//   cme:  settlement-built 30-day IV from the nightly options capture (oi_store ivTermStructure); threshold = top third
//         of IV ÷ RV in 2020–22 on the settlement source (1.182).
//   cboe: the CBOE vol index's latest daily close; threshold = top third of the index set in 2016–22 (1.53).
//   Gold has no settlement IV history, so its threshold is borrowed from FX and marked provisional.
export const INSTRUMENTS = [
  { key: 'eurusd', sym: 'EURUSD', oi: 'EUR/USD', src: 'cme', rich: 1.182 },
  { key: 'gbpusd', sym: 'GBPUSD', oi: 'GBP/USD', src: 'cme', rich: 1.182 },
  { key: 'audusd', sym: 'AUDUSD', oi: 'AUD/USD', src: 'cme', rich: 1.182 },
  { key: 'usdcad', sym: 'USDCAD', oi: 'USD/CAD', src: 'cme', rich: 1.182 },
  { key: 'usdchf', sym: 'USDCHF', oi: 'USD/CHF', src: 'cme', rich: 1.182 },
  { key: 'usdjpy', sym: 'USDJPY', oi: 'USD/JPY', src: 'cme', rich: 1.182 },
  { key: 'gold',   sym: 'GOLD',   oi: 'XAU/USD', src: 'cme', rich: 1.182, provisional: true },
  { key: 'nq',     sym: 'NQ',     cboe: 'VXN', src: 'cboe', rich: 1.53 },
  { key: 'spx',    sym: 'SPX',    cboe: 'VIX', src: 'cboe', rich: 1.53 },
  { key: 'dow',    sym: 'DOW',    cboe: 'VXD', src: 'cboe', rich: 1.53 },
  { key: 'us2000', sym: 'US2000', cboe: 'RVX', src: 'cboe', rich: 1.53 },
];

// 20-day realised vol (annualised %) from daily closes (ascending), using the last 21 closes.
export function realisedVol20(closes) {
  const c = (closes ?? []).filter(Number.isFinite);
  if (c.length < 21) return null;
  const lr = []; for (let i = c.length - 20; i < c.length; i++) lr.push(Math.log(c[i] / c[i - 1]));
  const m = lr.reduce((a, b) => a + b, 0) / lr.length;
  const sd = Math.sqrt(lr.reduce((a, b) => a + (b - m) ** 2, 0) / (lr.length - 1));
  return sd > 0 ? sd * Math.sqrt(252) * 100 : null;
}

// Rich-day flag from implied vol (annualised %) and daily closes.
export function richFlag(inst, ivPct, closes) {
  const rv = realisedVol20(closes);
  if (!(ivPct > 0) || !(rv > 0)) return { iv: ivPct ?? null, rv, ratio: null, rich: null };
  const ratio = ivPct / rv;
  return { iv: round(ivPct, 3), rv: round(rv, 3), ratio: round(ratio, 3), rich: ratio >= inst.rich };
}

// Breaks in a London day so far. `d` is a v4Days() day (static lines, ladder, open, sigmaFrac); `bars` are its M1 bars
// (ascending, complete). Mirrors scripts/rangebook/asym_build.mjs (BREAK branch): lines priced from bars before k,
// first close >= 0.05σ beyond a line with minute < 600, entry at bar k+1's open. Returns only breaks whose entry bar exists.
export function detectBreaks(d, bars) {
  const unit = d.sigmaFrac * d.open, out = [], done = new Set();
  if (!(unit > 0)) return out;
  let runHi = d.open, runLo = d.open;
  for (let k = 0; k < bars.length; k++) {
    const b = bars[k];
    if ((b.time - d.openSec) / 60 >= END_MIN) break;
    if (k > 0) {
      const lv = linesAtBar(d, k, runHi, runLo);
      for (const name of BREAK_LINES) {
        const L = lv[name]; if (L == null || done.has(name)) continue;
        const up = LINE_SIDE[name] === 'up';
        if ((up ? b.close >= L + BREAK_SIGMA * unit : b.close <= L - BREAK_SIGMA * unit) && k + 1 < bars.length) {
          done.add(name);
          out.push({ line: name, signalK: k, entryK: k + 1, dir: up ? 1 : -1, level: L, entry: bars[k + 1].open,
                     signalTime: b.time, entryTime: bars[k + 1].time });
        }
      }
    }
    if (b.high > runHi) runHi = b.high;
    if (b.low < runLo) runLo = b.low;
  }
  return out;
}

// Walk a trade from its entry bar. Stop wins a same-bar tie; the entry bar can hit the target (as in the backtest).
// `final` = true when the London day is complete (exit at the last bar if nothing hit).
export function simulate(bars, entryK, dir, entry, stop, target, costPx, final) {
  const risk = (entry - stop) * dir;
  for (let j = entryK; j < bars.length; j++) {
    const b = bars[j];
    if (dir > 0 ? b.low <= stop : b.high >= stop) return { status: 'stop', R: round(-1 - costPx / risk, 4), exitTime: b.time };
    if (dir > 0 ? b.high >= target : b.low <= target) return { status: 'target', R: round((target - entry) * dir / risk - costPx / risk, 4), exitTime: b.time };
  }
  const last = bars.at(-1);
  const mtm = round((last.close - entry) * dir / risk - costPx / risk, 4);
  return final ? { status: 'day end', R: mtm, exitTime: last.time } : { status: 'open', R: mtm, exitTime: null };
}

// One break -> a trade with the four pre-registered variants (stop 0.1σ/0.2σ × 5R/10R). `R` = mean of the four.
export function scoreTrade(d, bars, brk, costPx, final) {
  const unit = d.sigmaFrac * d.open, variants = {};
  for (const s of STOPS) {
    const stop = brk.level - brk.dir * s * unit, risk = (brk.entry - stop) * brk.dir;
    if (!(risk > 0)) continue;
    for (const t of TARGETS) {
      variants[`${s}σ/${t}R`] = { stop: round(stop, 6), target: round(brk.entry + brk.dir * t * risk, 6), ...simulate(bars, brk.entryK, brk.dir, brk.entry, stop, brk.entry + brk.dir * t * risk, costPx, final) };
    }
  }
  const vs = Object.values(variants);
  const done = vs.length === 4 && vs.every(v => v.status !== 'open');
  return { variants, R: vs.length === 4 ? round(vs.reduce((a, v) => a + v.R, 0) / 4, 4) : null, done };
}

// H1 trend state at a signal time from M1 closes (completed hours only): +1 = close > EMA20 > EMA50, -1 = the mirror, 0 = neither,
// null = fewer than 50 hours. Same definition as the research's htf_trend_build.mjs. Recorded on each trade, not used as a filter:
// the fade-continue-book stack test (STACK_RICHIV_TREND_RESULTS.md) found breaks AGAINST the H1 trend far stronger on indices
// (+0.62R, n=199) but on too few days to act on; the forward record settles it.
export function h1TrendState(packed, tSec) {
  const s = [], c = [];
  for (let i = 0; i < packed.n && packed.times[i] < Math.floor(tSec / 3600) * 3600; i++) {
    const b = Math.floor(packed.times[i] / 3600) * 3600;
    if (s[s.length - 1] !== b) { s.push(b); c.push(packed.closes[i]); } else c[c.length - 1] = packed.closes[i];
  }
  if (c.length < 50) return null;
  const ema = n => { const k = 2 / (n + 1); let o = c[0]; for (let i = 1; i < c.length; i++) o = c[i] * k + o * (1 - k); return o; };
  const e20 = ema(20), e50 = ema(50), last = c[c.length - 1];
  return last > e20 && e20 > e50 ? 1 : last < e20 && e20 < e50 ? -1 : 0;
}

function round(x, n) { if (x == null || !Number.isFinite(x)) return null; const p = 10 ** n; return Math.round(x * p) / p; }
