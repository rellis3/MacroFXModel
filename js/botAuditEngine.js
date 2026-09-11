/**
 * botAuditEngine — turns the live closed-trade book into the series a
 * monitoring tearsheet needs. Pure, no I/O, no DOM. `bot-audit.html` is the
 * only UI on top of it; everything numeric lives here so it can be tested.
 *
 * THE UNIT PROBLEM (read this before adding a metric).
 * Live trades are recorded in ACCOUNT CURRENCY with no stop distance stored, so
 * this book cannot be expressed in R and cannot be compared to any backtest we
 * have run. See `MD files/LIVE_BACKTEST_ALIGNMENT.md` §2.1-2.2. Until that
 * lands, metrics split into two classes and this engine keeps them apart:
 *
 *   SCALE-FREE  — valid with no capital base at all, because they are ratios of
 *                 the P&L stream to itself: Sharpe, Sortino, win rate, profit
 *                 factor, payoff, expectancy, max-DD in DOLLARS.
 *                 (Sharpe on daily $ P&L equals Sharpe on % returns whenever the
 *                 notional behind it is constant — the mean and the sd scale by
 *                 the same factor and it cancels. So it is honest to show it.)
 *   SCALE-BOUND — meaningless without a declared capital base: total return %,
 *                 CAGR, Calmar, max-DD %, time-in-drawdown, monthly return %.
 *
 * `summarize()` therefore returns `scaleBound: null` when no capital is given,
 * rather than quietly dividing by an assumed 100k. A tearsheet that invents its
 * own denominator is worse than one that admits it has none.
 *
 * WHY NOT ACCOUNT BALANCE: MacroFX, RegimeV1 and RegimeV2 all trade account
 * 10011001704. Balance is a SHARED quantity; per-bot return needs a declared
 * per-bot allocation, which does not exist in config yet.
 *
 * Reuses `backtestStats.js` / `metricsCore.js` for every shared formula rather
 * than re-deriving (REFERENCE_ENGINE_PLAYBOOK.md §3.4).
 */

import { backtestStats, portfolioStats } from './backtestStats.js';
import { profitFactor, sortinoRatio } from './metricsCore.js';
import { mean, stdev, mulberry32 } from './statsCore.js';

// ── Costs ────────────────────────────────────────────────────────────────────

/**
 * One trade's result. `gross` drops swap AND commission — the "before costs"
 * view, which exists purely so the cost drag can be SEEN by toggling, the way
 * a costed vs uncosted backtest is compared. Net is the default everywhere
 * because net is what the account got.
 *
 * A missing commission is 0, never a reason to skip the trade: paper rows and
 * pre-2026 records legitimately have none. `botsMissingCommission()` reports
 * which bots those are so the gap is stated rather than hidden.
 */
export function netOf(t, { gross = false } = {}) {
  const p = t?.profit || 0;
  return gross ? p : p + (t?.swap || 0) + (t?.commission || 0);
}

export function costOf(t) {
  return (t?.swap || 0) + (t?.commission || 0);
}

/** Bot keys that never report a commission field — their Net flatters them. */
export function botsMissingCommission(trades) {
  const seen = new Map();                       // bot -> sawCommissionField
  for (const t of trades) {
    const k = t.bot_key || '?';
    seen.set(k, (seen.get(k) || false) || t.commission != null);
  }
  return [...seen.entries()].filter(([, saw]) => !saw).map(([k]) => k).sort();
}

// ── Time ─────────────────────────────────────────────────────────────────────

const UK_DT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

/** Broker-clock epoch → true UTC epoch. Mirrors bot-config's `_tradeUtc`. */
export function tradeUtc(t, field, fallbackOffset = 0) {
  const raw = t?.[field];
  if (!raw) return null;
  return raw - (typeof t.tz_offset_sec === 'number' ? t.tz_offset_sec : fallbackOffset);
}

/** UK calendar date of a true-UTC epoch. The book is bucketed on the day the
 *  user WATCHED the trade close, not the day UTC happened to be on. */
export function ukDate(utcSec) {
  const p = Object.fromEntries(UK_DT.formatToParts(new Date(utcSec * 1000)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

// ── Normalisation ────────────────────────────────────────────────────────────

/**
 * Dedupe + attach derived time fields. Trades can arrive twice: the padded
 * date-range query overlaps buckets, and a backfill can re-push a position the
 * live path already merged. Dedupe on position_id + bot, NOT position_id alone —
 * two bots on the same MT5 account can hold the same ticket number space.
 *
 * Rows with no usable close stamp are dropped, and the count is REPORTED
 * (`droppedNoClose`) rather than silently swallowed: a filter that quietly eats
 * rows biases the survivors, which is the trap `REFERENCE_ENGINE_PLAYBOOK.md`
 * §6.7 exists for.
 */
export function normalizeTrades(raw, { fallbackOffset = 0 } = {}) {
  const seen = new Set();
  const out = [];
  let dupes = 0, droppedNoClose = 0;
  for (const t of raw || []) {
    const id = `${t.bot_key || '?'}|${t.position_id ?? t.ticket ?? ''}`;
    if (id.endsWith('|')) { /* no id — keep, cannot dedupe */ }
    else if (seen.has(id)) { dupes++; continue; }
    else seen.add(id);

    const uClose = tradeUtc(t, 'time_close', fallbackOffset);
    if (!uClose) { droppedNoClose++; continue; }
    const uOpen = tradeUtc(t, 'time_open', fallbackOffset);
    out.push({
      ...t,
      utcOpen:  uOpen,
      utcClose: uClose,
      day:      ukDate(uClose),
      holdSec:  uOpen && uClose ? uClose - uOpen : null,
    });
  }
  out.sort((a, b) => a.utcClose - b.utcClose);
  return { trades: out, dupes, droppedNoClose, kept: out.length, seen: (raw || []).length };
}

// ── Series ───────────────────────────────────────────────────────────────────

/**
 * Equity by trade — the "balance by deal" curve. `start` is the capital base;
 * pass 0 to get a pure cumulative-P&L curve when no allocation is declared.
 * Drawdown is tracked in BOTH dollars and percent-of-peak, but percent is only
 * meaningful when `start > 0` (otherwise the peak starts at zero and the first
 * loss is an infinite drawdown) — the caller gates on that, see `summarize`.
 */
export function equityByTrade(trades, start = 0, { gross = false } = {}) {
  let eq = start, peak = start;
  return trades.map((t, i) => {
    const pnl = netOf(t, { gross });
    eq += pnl;
    if (eq > peak) peak = eq;
    const ddAbs = eq - peak;
    return {
      i, t, pnl, equity: eq, peak, ddAbs,
      ddPct: peak > 0 ? (eq / peak - 1) * 100 : 0,
      day: t.day, utc: t.utcClose,
    };
  });
}

/** P&L summed per UK trading day. The honest basis for Sharpe: per-TRADE Sharpe
 *  × √(trades/yr) treats concurrent positions as independent bets, which they
 *  are not when six bots fire on one macro print. */
export function dailySeries(trades, { gross = false } = {}) {
  const m = new Map();
  for (const t of trades) {
    const d = t.day;
    if (!m.has(d)) m.set(d, { date: d, pnl: 0, n: 0, cost: 0 });
    const r = m.get(d);
    r.pnl += netOf(t, { gross });
    r.cost += costOf(t);
    r.n++;
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Daily equity, INCLUDING flat days between trades — a drawdown that lasts
 *  three weeks with no trades in it is still three weeks in drawdown, and a
 *  trade-indexed curve would show it as a single flat step. */
export function dailyEquity(daily, start = 0) {
  if (!daily.length) return [];
  const out = [];
  let eq = start, peak = start;
  const end = daily[daily.length - 1].date;
  const byDate = new Map(daily.map(d => [d.date, d]));
  let cur = daily[0].date;
  while (cur <= end) {
    const hit = byDate.get(cur);
    eq += hit ? hit.pnl : 0;
    if (eq > peak) peak = eq;
    out.push({
      date: cur, equity: eq, peak, pnl: hit ? hit.pnl : 0, n: hit ? hit.n : 0,
      ddAbs: eq - peak, ddPct: peak > 0 ? (eq / peak - 1) * 100 : 0,
    });
    const d = new Date(cur + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    cur = d.toISOString().slice(0, 10);
  }
  return out;
}

/**
 * Monthly P&L grid: {years: [{year, months:[12], total}], min, max}.
 * `capital > 0` switches the cells from dollars to percent of capital.
 * A month with no trades is null (not 0) — "flat" and "didn't trade" are
 * different facts and the heatmap must not paint them the same.
 */
export function monthlyReturns(daily, capital = 0) {
  const grid = new Map();
  for (const d of daily) {
    const [y, m] = d.date.split('-');
    const yr = +y, mo = +m - 1;
    if (!grid.has(yr)) grid.set(yr, new Array(12).fill(null));
    const row = grid.get(yr);
    row[mo] = (row[mo] || 0) + d.pnl;
  }
  const years = [...grid.entries()].sort((a, b) => a[0] - b[0]).map(([year, months]) => {
    const cells = months.map(v => (v == null ? null : (capital > 0 ? v / capital * 100 : v)));
    const present = cells.filter(v => v != null);
    return { year, months: cells, total: present.length ? present.reduce((s, x) => s + x, 0) : null };
  });
  const flat = years.flatMap(y => y.months).filter(v => v != null);
  return { years, min: flat.length ? Math.min(...flat) : 0, max: flat.length ? Math.max(...flat) : 0, pct: capital > 0 };
}

/** Rolling sum of daily P&L over `win` calendar days (as % of capital when
 *  given). Matches the screenshot's "rolling 63-day return" panel — 63 trading
 *  days ≈ one quarter. */
export function rollingReturn(dailyEq, win = 63, capital = 0) {
  const out = [];
  for (let i = 0; i < dailyEq.length; i++) {
    if (i < win) { out.push({ date: dailyEq[i].date, value: null }); continue; }
    const delta = dailyEq[i].equity - dailyEq[i - win].equity;
    out.push({ date: dailyEq[i].date, value: capital > 0 ? delta / capital * 100 : delta });
  }
  return out;
}

// ── Breakdowns ───────────────────────────────────────────────────────────────

export function groupBy(trades, keyFn, { gross = false } = {}) {
  const m = new Map();
  for (const t of trades) {
    const k = keyFn(t);
    if (k == null) continue;
    if (!m.has(k)) m.set(k, { key: k, n: 0, wins: 0, net: 0, gross: 0, cost: 0 });
    const r = m.get(k);
    const v = netOf(t, { gross });
    r.n++; if (v > 0) r.wins++;
    r.net += v;
    r.gross += (t.profit || 0);
    r.cost += costOf(t);
  }
  return [...m.values()].map(r => ({ ...r, winRate: r.n ? r.wins / r.n : 0, expectancy: r.n ? r.net / r.n : 0 })).sort((a, b) => b.net - a.net);
}

/**
 * MAE/MFE — how far a trade went against you before it worked, and how much of
 * its best moment it gave back. `mfe_pips`/`mae_pips` are already emitted by
 * `pylego/broker/mt5.py` and have never been rendered anywhere.
 *
 * Trades with no excursion data are counted separately (`missing`), never
 * treated as zero — a bot that reports no excursions would otherwise drag every
 * median toward 0 and look like it never went offside.
 *
 * NO GIVE-BACK FIGURE HERE, deliberately. Give-back is MFE minus what the trade
 * actually realised, and converting a realised price move into pips needs a
 * per-instrument pip size — which is a known live drift in this repo (js/utils.js
 * and levels.js say Gold is 0.1, the canonical registry says 1.0, a 10× error).
 * Computing it here would silently inherit that. `giveback.html` already answers
 * the give-back question through the audited path; this panel stays on the raw
 * excursions the broker reported.
 */
export function excursions(trades, { gross = false } = {}) {
  const rows = [], missing = [];
  for (const t of trades) {
    if (t.mfe_pips == null && t.mae_pips == null) { missing.push(t); continue; }
    const net = netOf(t, { gross });
    rows.push({ t, net, mfe: t.mfe_pips ?? null, mae: t.mae_pips ?? null, win: net > 0 });
  }
  const wins = rows.filter(r => r.win && r.mfe != null);
  const losses = rows.filter(r => !r.win && r.mae != null);
  return {
    rows, missing: missing.length, n: rows.length,
    medMfeWin:  med(wins.map(r => r.mfe)),
    medMaeWin:  med(wins.map(r => r.mae).filter(v => v != null)),
    medMaeLoss: med(losses.map(r => r.mae)),
    medMfeLoss: med(losses.map(r => r.mfe).filter(v => v != null)),
  };
}

/** Exit mix — which barrier ended the trade. `reason` is emitted by the pylego
 *  broker (deal-reason 4/5/other → sl/tp/manual) and, like the excursions,
 *  has never reached a screen. */
export function exitMix(trades, { gross = false } = {}) {
  return groupBy(trades, t => t.reason || 'unknown', { gross });
}

function med(a) {
  const s = a.filter(v => typeof v === 'number' && isFinite(v)).sort((x, y) => x - y);
  if (!s.length) return null;
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
}

// ── Headline ─────────────────────────────────────────────────────────────────

/** Minimum closed trades before a ratio metric is worth printing. Below this
 *  the confidence interval is wider than any difference you'd act on — see
 *  `LIVE_BACKTEST_ALIGNMENT.md` T4. Not a hard block: the UI greys them. */
export const MIN_N_RATIOS = 30;

/**
 * The headline battery. Returns `{ n, scaleFree, scaleBound, bootstrap, flags }`.
 *
 * `scaleBound` is null when `capital <= 0` — deliberately, see the unit note at
 * the top of this file. `bootstrap` resamples THIS book's own trades; read the
 * caveat on `bootstrapNote` before putting it in front of anyone.
 */
export function summarize(trades, { capital = 0, gross = false, bootRuns = 1000, mcRuns = 1000 } = {}) {
  const n = trades.length;
  if (!n) return { n: 0, scaleFree: null, scaleBound: null, bootstrap: null, flags: { empty: true } };

  const pnls  = trades.map(t => netOf(t, { gross }));
  const daily = dailySeries(trades, { gross });
  const dEq   = dailyEquity(daily, capital);
  const eqT   = equityByTrade(trades, capital, { gross });

  const wins = pnls.filter(x => x > 0), losses = pnls.filter(x => x < 0);
  const totalPnl  = pnls.reduce((s, x) => s + x, 0);
  const totalCost = trades.reduce((s, t) => s + costOf(t), 0);
  const grossPnl  = trades.reduce((s, t) => s + (t.profit || 0), 0);

  // Max drawdown in DOLLARS — always valid, no capital needed.
  const maxDDAbs = Math.min(0, ...eqT.map(p => p.ddAbs));

  // Sharpe/Sortino on the DAILY stream (concurrency-aware), annualised by √252.
  // Scale-free: identical whether the stream is dollars or percent of a fixed
  // notional, so it is honest to show with no capital declared.
  const dPnl   = dEq.map(d => d.pnl);
  const dMean  = mean(dPnl), dSd = stdev(dPnl);
  const sharpe = dSd > 1e-12 ? dMean / dSd * Math.sqrt(252) : 0;

  const scaleFree = {
    trades: n,
    tradingDays: dEq.length,
    activeDays: daily.length,
    winRate: n ? wins.length / n : 0,
    profitFactor: profitFactor(pnls),
    payoff: losses.length && wins.length ? (mean(wins) / -mean(losses)) : 0,
    expectancy: mean(pnls),
    totalPnl, grossPnl, totalCost,
    costPctOfGross: Math.abs(grossPnl) > 1e-9 ? Math.abs(totalCost / grossPnl) * 100 : null,
    avgWin: wins.length ? mean(wins) : 0,
    avgLoss: losses.length ? mean(losses) : 0,
    bestTrade: Math.max(...pnls),
    worstTrade: Math.min(...pnls),
    maxDDAbs,
    sharpe,
    sortino: sortinoRatio(dPnl, 252),
    medHoldSec: med(trades.map(t => t.holdSec).filter(v => v != null)),
  };

  let scaleBound = null;
  if (capital > 0) {
    const dPct = dEq.map(d => d.pnl / capital * 100);
    const ps   = portfolioStats(dPct, { periodsPerYear: 252, mc: false });
    const inDD = dEq.filter(d => d.ddAbs < -1e-9).length;
    scaleBound = {
      capital,
      totalReturnPct: totalPnl / capital * 100,
      cagr: ps.cagr,
      maxDDPct: ps.maxDD,
      calmar: ps.calmar ?? (ps.maxDD < 0 ? ps.cagr / Math.abs(ps.maxDD) : 0),
      volAnn: ps.annVol,
      timeInDDPct: dEq.length ? inDD / dEq.length * 100 : 0,
    };
  }

  // Bootstrap of THIS book — resampling its own trades. See `bootstrapNote`.
  const bs = backtestStats(pnls, trades.map(t => t.day), { bootRuns, mcRuns });

  return {
    n, scaleFree, scaleBound,
    bootstrap: { total: bs.bootstrap.total, sharpe: bs.bootstrap.sharpe, pPositive: bs.bootstrap.pPositive, mcMaxDD: bs.montecarlo.maxDD },
    series: { daily, dailyEquity: dEq, equityByTrade: eqT },
    flags: {
      thinSample: n < MIN_N_RATIOS,
      noCapital: !(capital > 0),
      missingCommission: botsMissingCommission(trades),
    },
  };
}

/**
 * What the distribution panel is and — more importantly — is NOT.
 *
 * The reference terminal this page is modelled on ranks a LIVE result inside
 * the distribution its BACKTEST predicted ("realised Sharpe sits at P49 of
 * expected"). We cannot do that: no bot has a frozen `expect_<bot>` artifact,
 * and until live trades carry a stop distance there is no common unit to rank
 * them in (`LIVE_BACKTEST_ALIGNMENT.md` §2.1, §4.3).
 *
 * What this panel does instead is resample the live book against ITSELF, which
 * answers a different and narrower question: how much of this result is the
 * luck of this particular sample and ordering? A wide band means the headline
 * is not a stable estimate. It CANNOT tell you the bot is under-performing its
 * design, because its design has never been written down in a comparable form.
 */
export const bootstrapNote =
  'Resampled from this book\'s OWN trades — it measures how much the headline depends on the luck of ' +
  'this sample and ordering, NOT whether the bot is beating its backtest. Ranking live against a ' +
  'frozen backtest expectation needs expect_<bot> + a stop distance per live trade ' +
  '(MD files/LIVE_BACKTEST_ALIGNMENT.md §4.3).';

// ── Backtest overlay ─────────────────────────────────────────────────────────
//
// THE OVERLAY'S OWN UNIT PROBLEM. A backtest curve is a % return on NAV; the
// live book is dollars. They cannot share an axis until a capital base is
// declared, so every function here works in PERCENT and the UI refuses the
// overlay entirely when capital is unset. Twin axes would "work" and would be
// a lie — two series scaled independently can be made to agree or disagree at
// will.

/** Compound a daily %-return series into a cumulative %-growth curve from 0. */
export function cumFromDaily(rets) {
  let eq = 1;
  return rets.map(r => { eq *= (1 + r / 100); return (eq - 1) * 100; });
}

/** Live book as cumulative % of declared capital, one point per calendar day. */
export function liveGrowthPct(dEq, capital) {
  if (!(capital > 0) || !dEq.length) return [];
  const base = dEq[0].equity - dEq[0].pnl;      // equity before the first day's P&L
  return dEq.map((d, k) => ({ k, date: d.date, cum: (d.equity - base) / capital * 100 }));
}

/**
 * The cone: for each horizon k = 1..N, the distribution of k-day cumulative
 * returns taken over EVERY k-day window in the backtest. Plotting the
 * percentiles against k gives a widening envelope, and the live curve laid
 * inside it answers the only question worth asking at three months of data —
 * *is this inside the range of outcomes this strategy produces over a window
 * this short?*
 *
 * This is deliberately NOT "the backtest clipped to the live dates". That
 * comparison uses one arbitrary window out of hundreds and is dominated by
 * which quarter the bot happened to be switched on in. Both are offered in the
 * UI; this is the default because the other one invites a conclusion the
 * sample cannot support.
 *
 * O(N × days). At N=90 over ~1,300 days that is ~120k multiply-adds — fine in
 * a browser, and it never touches the network twice.
 */
export function growthCone(rets, N, pcts = [5, 25, 50, 75, 95]) {
  const out = [];
  if (!rets.length || N < 1) return out;
  const horizon = Math.min(N, rets.length);
  // Rolling compounded growth for each start offset, extended one day at a time
  // so each horizon reuses the previous one's work rather than recomputing.
  let running = rets.map(r => 1 + r / 100);
  for (let k = 1; k <= horizon; k++) {
    const vals = [];
    for (let i = 0; i + k <= rets.length; i++) vals.push((running[i] - 1) * 100);
    vals.sort((a, b) => a - b);
    const at = p => vals.length ? vals[Math.min(vals.length - 1, Math.floor(p / 100 * vals.length))] : 0;
    const row = { k, n: vals.length };
    for (const p of pcts) row['p' + p] = at(p);
    out.push(row);
    // extend every window by one more day for the next horizon
    if (k < horizon) {
      const next = new Array(Math.max(0, rets.length - k));
      for (let i = 0; i + k < rets.length; i++) next[i] = running[i] * (1 + rets[i + k] / 100);
      running = next;
    }
  }
  return out;
}

/**
 * Where the live result sits inside the cone at its final horizon, as a
 * percentile. Returns null when there is nothing to rank against — never 50 as
 * a stand-in, which would read as "perfectly average" rather than "unknown".
 */
export function conePercentile(rets, N, liveCum) {
  if (!rets.length || !(N >= 1) || liveCum == null || !isFinite(liveCum)) return null;
  const k = Math.min(N, rets.length);
  const vals = [];
  for (let i = 0; i + k <= rets.length; i++) {
    let eq = 1;
    for (let j = 0; j < k; j++) eq *= (1 + rets[i + j] / 100);
    vals.push((eq - 1) * 100);
  }
  if (!vals.length) return null;
  return { pct: Math.round(vals.filter(v => v < liveCum).length / vals.length * 100), windows: vals.length, horizon: k };
}

/** Backtest daily rows clipped to a calendar window — the "same dates" mode. */
export function clipDaily(daily, fromIso, toIso) {
  return daily.filter(d => d.date >= fromIso && d.date <= toIso);
}

// ── Distribution battery ─────────────────────────────────────────────────────
//
// One resampled distribution per metric, so a realised figure can be read
// against the spread of figures the same book would have produced under a
// different draw. Mirrors the layout of the reference terminal's distributions
// tab: return metrics, risk metrics, trade metrics, each with realised value,
// mean, sd and percentile rank.
//
// TWO RESAMPLING BASES, and mixing them up would be a real error:
//   • basis 'trade' — resample CLOSED TRADES with replacement. Right for win
//     rate, profit factor, expectancy, avg win/loss: each trade is the unit.
//   • basis 'day'   — resample TRADING DAYS with replacement. Right for Sharpe,
//     volatility, drawdown, hit rate: those are properties of the daily return
//     stream, and resampling trades would silently destroy the calendar that
//     defines them (six trades on one day is one day of risk, not six).
//
// Path-dependent metrics (max drawdown, time in drawdown, avg drawdown) are
// computed on each resampled SEQUENCE, so their spread reflects ordering luck
// as well as sample luck — which is the whole point of showing them.
//
// What this is NOT: the reference terminal ranks a realised figure inside the
// distribution its MODEL predicted. This ranks it inside its own book's
// resamples. See `bootstrapNote` — the distinction is on the page, not just here.

export const DIST_METRICS = [
  { key: 'totalPnl',     group: 'Return', label: 'Total P&L',        fmt: 'money', basis: 'trade' },
  { key: 'returnPct',    group: 'Return', label: 'Total Return',     fmt: 'pct',   basis: 'day',   cap: true },
  { key: 'cagr',         group: 'Return', label: 'Return / Year',    fmt: 'pct',   basis: 'day',   cap: true },
  { key: 'sharpe',       group: 'Return', label: 'Sharpe (ann)',     fmt: 'num',   basis: 'day' },
  { key: 'sortino',      group: 'Return', label: 'Sortino (ann)',    fmt: 'num',   basis: 'day' },
  { key: 'calmar',       group: 'Return', label: 'Calmar',           fmt: 'num',   basis: 'day',   cap: true },

  { key: 'volAnn',       group: 'Risk',   label: 'Volatility (ann)', fmt: 'pct',   basis: 'day',   cap: true },
  { key: 'maxDD',        group: 'Risk',   label: 'Max Drawdown',     fmt: 'money', basis: 'day',   low: true },
  { key: 'avgDD',        group: 'Risk',   label: 'Avg Drawdown',     fmt: 'money', basis: 'day',   low: true },
  { key: 'timeInDD',     group: 'Risk',   label: 'Time in Drawdown', fmt: 'pctRaw', basis: 'day',  low: true },
  { key: 'worstDay',     group: 'Risk',   label: 'Worst Day',        fmt: 'money', basis: 'day',   low: true },
  { key: 'bestDay',      group: 'Risk',   label: 'Best Day',         fmt: 'money', basis: 'day' },
  { key: 'dailyHitRate', group: 'Risk',   label: 'Daily Hit Rate',   fmt: 'pctRaw', basis: 'day' },

  { key: 'winRate',      group: 'Trade',  label: 'Win Rate',         fmt: 'pctRaw', basis: 'trade' },
  { key: 'profitFactor', group: 'Trade',  label: 'Profit Factor',    fmt: 'num',   basis: 'trade' },
  { key: 'expectancy',   group: 'Trade',  label: 'Expectancy / Trade', fmt: 'money', basis: 'trade' },
  { key: 'avgWin',       group: 'Trade',  label: 'Avg Win',          fmt: 'money', basis: 'trade' },
  { key: 'avgLoss',      group: 'Trade',  label: 'Avg Loss',         fmt: 'money', basis: 'trade', low: true },
  { key: 'largestLoss',  group: 'Trade',  label: 'Largest Loss',     fmt: 'money', basis: 'trade', low: true },
];

// Plain-English definition + how to read the rank, per metric. Shown in the
// reading pane so a number is never presented without saying what it means —
// the reference terminal does this and it is the difference between a dashboard
// and a report.
export const METRIC_READING = {
  totalPnl:     'Sum of every closed trade, after swap and commission. The account-currency result, not a rate.',
  returnPct:    'Total P&L as a percent of the capital you declared. Moves inversely with that figure — it is an assumption, not a measurement.',
  cagr:         'The annualised growth rate implied by the window, compounded. Over a few months this extrapolates a short run to a year, so it swings hard.',
  sharpe:       'Mean daily P&L divided by its standard deviation, annualised by √252. Scale-free: identical whether measured in dollars or percent of a fixed notional.',
  sortino:      'Sharpe but penalising only downside deviation. Higher than Sharpe means the volatility is mostly upside.',
  calmar:       'Annualised return divided by the worst peak-to-trough drawdown. How much return each unit of pain bought.',
  volAnn:       'Standard deviation of daily returns, annualised. The width of the ride, not its direction.',
  maxDD:        'Deepest peak-to-trough fall in account currency, on the daily equity curve including flat days.',
  avgDD:        'Mean depth across every day spent below a prior peak. A shallow average with a deep max is one bad episode; a deep average is a book that lives underwater.',
  timeInDD:     'Percent of calendar days below a prior peak. High is normal for an active book — being at a new high is the exception, not the rule.',
  worstDay:     'The single worst trading day in the window.',
  bestDay:      'The single best trading day in the window.',
  dailyHitRate: 'Percent of ACTIVE days that finished positive. Different from win rate: a day is a day regardless of how many trades ran in it.',
  winRate:      'Percent of closed trades finishing positive AFTER costs. A trade that made money gross and lost it to commission counts as a loss here.',
  profitFactor: 'Gross profit divided by gross loss. Below 1.0 is a losing book; 1.0 is break-even before you have paid for your time.',
  expectancy:   'Average net result per trade. The number to multiply by expected trade count when projecting.',
  avgWin:       'Mean net result of winning trades.',
  avgLoss:      'Mean net result of losing trades. Compare to Avg Win: the ratio is the payoff the win rate has to clear.',
  largestLoss:  'The single worst closed trade. If it dwarfs Avg Loss, the stop is not doing what it is supposed to.',
};

function ddStatsOf(pnls) {
  let eq = 0, peak = 0, maxDD = 0, sumDD = 0, daysDown = 0;
  for (const p of pnls) {
    eq += p;
    if (eq > peak) peak = eq;
    const dd = eq - peak;
    if (dd < maxDD) maxDD = dd;
    if (dd < -1e-9) { daysDown++; sumDD += dd; }
  }
  return { maxDD, avgDD: pnls.length ? sumDD / pnls.length : 0, timeInDD: pnls.length ? daysDown / pnls.length * 100 : 0 };
}

/** Every metric for ONE sample (a trade list and its day list). */
function metricsOf(tradePnls, dayPnls, capital, years) {
  const wins = tradePnls.filter(x => x > 0), losses = tradePnls.filter(x => x < 0);
  const gp = wins.reduce((s, x) => s + x, 0), gl = -losses.reduce((s, x) => s + x, 0);
  const total = tradePnls.reduce((s, x) => s + x, 0);
  const dm = dayPnls.length ? dayPnls.reduce((s, x) => s + x, 0) / dayPnls.length : 0;
  const dsd = dayPnls.length > 1
    ? Math.sqrt(dayPnls.reduce((s, x) => s + (x - dm) ** 2, 0) / dayPnls.length) : 0;
  const down = dayPnls.filter(x => x < 0);
  const dsd_ = down.length ? Math.sqrt(down.reduce((s, x) => s + x * x, 0) / dayPnls.length) : 0;
  const dd = ddStatsOf(dayPnls);
  const dayTotal = dayPnls.reduce((s, x) => s + x, 0);
  const retPct = capital > 0 ? dayTotal / capital * 100 : null;
  // Compounded CAGR on the declared base — same convention as the headline.
  let cagr = null;
  if (capital > 0 && years > 0) {
    let eq = 1;
    for (const p of dayPnls) eq *= (1 + p / capital);
    cagr = (Math.pow(Math.max(1e-9, eq), 1 / years) - 1) * 100;
  }
  const maxDDPct = capital > 0 ? dd.maxDD / capital * 100 : null;
  return {
    totalPnl: total,
    returnPct: retPct,
    cagr,
    sharpe: dsd > 1e-12 ? dm / dsd * Math.sqrt(252) : 0,
    sortino: dsd_ > 1e-12 ? dm / dsd_ * Math.sqrt(252) : 0,
    calmar: (cagr != null && maxDDPct != null && maxDDPct < -1e-9) ? cagr / Math.abs(maxDDPct) : null,
    volAnn: capital > 0 ? dsd / capital * 100 * Math.sqrt(252) : null,
    maxDD: dd.maxDD,
    avgDD: dd.avgDD,
    timeInDD: dd.timeInDD,
    worstDay: dayPnls.length ? Math.min(...dayPnls) : 0,
    bestDay: dayPnls.length ? Math.max(...dayPnls) : 0,
    // Hit rate over ACTIVE days only — the definition the reading pane states.
    // `dayPnls` is calendar-filled (flat days included) because drawdown and
    // time-in-drawdown need every day; counting those flat days here instead
    // would report "days the book won" as a fraction of days it mostly did not
    // trade, which for a selective bot reads as a terrible hit rate and is
    // really just a measure of how often it stands aside.
    dailyHitRate: (() => {
      const act = dayPnls.filter(x => Math.abs(x) > 1e-9);
      return act.length ? act.filter(x => x > 0).length / act.length * 100 : 0;
    })(),
    winRate: tradePnls.length ? wins.length / tradePnls.length * 100 : 0,
    profitFactor: gl > 1e-9 ? gp / gl : (gp > 0 ? 99 : 0),
    expectancy: tradePnls.length ? total / tradePnls.length : 0,
    avgWin: wins.length ? gp / wins.length : 0,
    avgLoss: losses.length ? -gl / losses.length : 0,
    largestLoss: losses.length ? Math.min(...losses) : 0,
  };
}

/**
 * Realised value plus a resampled distribution for every metric.
 * `runs` resamples of the trade list (trade-basis metrics) and of the day list
 * (day-basis metrics), drawn independently and seeded so the same book always
 * reproduces the same bands.
 */
export function distributions(trades, { capital = 0, gross = false, runs = 800, seed = 0x9e3779b9 } = {}) {
  if (!trades.length) return null;
  const tradePnls = trades.map(t => netOf(t, { gross }));
  const daily = dailySeries(trades, { gross });
  const dEq = dailyEquity(daily, capital);
  const dayPnls = dEq.map(d => d.pnl);
  const years = dEq.length / 252;

  const realised = metricsOf(tradePnls, dayPnls, capital, years);
  const rng = mulberry32(seed >>> 0);
  const draw = arr => { const o = new Array(arr.length); for (let i = 0; i < arr.length; i++) o[i] = arr[(rng() * arr.length) | 0]; return o; };

  const samples = [];
  for (let i = 0; i < runs; i++) samples.push(metricsOf(draw(tradePnls), draw(dayPnls), capital, years));

  const out = {};
  for (const m of DIST_METRICS) {
    const vals = samples.map(s => s[m.key]).filter(v => v != null && isFinite(v)).sort((a, b) => a - b);
    const r = realised[m.key];
    if (!vals.length || r == null || !isFinite(r)) { out[m.key] = { realised: r, values: [], available: false }; continue; }
    const mean_ = vals.reduce((s, x) => s + x, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((s, x) => s + (x - mean_) ** 2, 0) / vals.length);
    const at = p => vals[Math.min(vals.length - 1, Math.floor(p / 100 * vals.length))];
    out[m.key] = {
      available: true, realised: r, values: vals, mean: mean_, sd,
      rank: Math.round(vals.filter(v => v < r).length / vals.length * 100),
      p: { 1: at(1), 5: at(5), 10: at(10), 25: at(25), 50: at(50), 75: at(75), 90: at(90), 95: at(95), 99: at(99) },
    };
  }
  return { runs, metrics: out, n: trades.length, days: dEq.length };
}

// ── Rolling edge ─────────────────────────────────────────────────────────────
//
// The monitoring question the reference terminal is built around: is the book
// STILL doing what it did, or has it slid into the adverse tail? A single
// full-sample win rate cannot answer that — it averages the good months in with
// the bad. This walks a fixed-size window of trades along the book and reports
// win rate and expectancy per window.
//
// THE BAND. To say whether the latest window is "bad" you need to know what a
// window of that size from THIS book normally looks like. So the band is built
// by drawing `window` trades at random (with replacement) from the whole book,
// `runs` times, and taking percentiles of each draw's win rate and expectancy.
// A latest window below P5 is in the tail of what this book produces — which is
// a reason to look, not a proof the edge is gone. It cannot see regime change,
// only that the recent run is unusual relative to the book's own history.
//
// Why resample rather than use the actual rolling windows as the reference:
// the latest window IS one of those, so ranking it against them is circular.

export function rollingEdge(trades, { window = 20, gross = false, runs = 600, seed = 0x9e3779b9 } = {}) {
  const pnls = trades.map(t => netOf(t, { gross }));
  const n = pnls.length;
  if (n < window || window < 2) return { window, n, enough: false, rows: [], full: null, band: null, last: null };

  const rows = [];
  let wins = 0, sum = 0;
  for (let i = 0; i < n; i++) {
    if (pnls[i] > 0) wins++;
    sum += pnls[i];
    if (i >= window) { if (pnls[i - window] > 0) wins--; sum -= pnls[i - window]; }
    if (i >= window - 1) rows.push({ i, day: trades[i].day, winRate: wins / window * 100, expectancy: sum / window });
  }
  // `sum` is the LAST window's total by now, so the full-sample figures come from
  // the whole array, not from it.
  const full = { winRate: pnls.filter(x => x > 0).length / n * 100, expectancy: pnls.reduce((s, x) => s + x, 0) / n };

  const rng = mulberry32(seed >>> 0);
  const wr = new Array(runs), ex = new Array(runs);
  for (let r = 0; r < runs; r++) {
    let w = 0, s = 0;
    for (let k = 0; k < window; k++) { const v = pnls[(rng() * n) | 0]; if (v > 0) w++; s += v; }
    wr[r] = w / window * 100; ex[r] = s / window;
  }
  wr.sort((a, b) => a - b); ex.sort((a, b) => a - b);
  const at = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p / 100 * arr.length))];
  const band = {
    winRate:    { p5: at(wr, 5), p25: at(wr, 25), p50: at(wr, 50), p75: at(wr, 75), p95: at(wr, 95) },
    expectancy: { p5: at(ex, 5), p25: at(ex, 25), p50: at(ex, 50), p75: at(ex, 75), p95: at(ex, 95) },
  };
  const last = rows[rows.length - 1];
  const rankIn = (arr, v) => Math.round(arr.filter(x => x < v).length / arr.length * 100);
  const read = last ? {
    winRateRank: rankIn(wr, last.winRate),
    expectancyRank: rankIn(ex, last.expectancy),
  } : null;
  return { window, n, enough: true, rows, full, band, last, read };
}

// ── Breakdowns ───────────────────────────────────────────────────────────────

const UK_HOUR_DT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false, weekday: 'short' });
/** UK wall-clock hour (0-23) and weekday (0=Mon..6=Sun) of a true-UTC epoch. */
export function ukClock(utcSec) {
  const p = Object.fromEntries(UK_HOUR_DT.formatToParts(new Date(utcSec * 1000)).map(x => [x.type, x.value]));
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday);
  return { hour: parseInt(p.hour, 10) % 24, dow: dow < 0 ? 0 : dow };
}

export const SESSIONS = [
  { key: 'asia',    label: 'Asia (00–08 UK)',    from: 0,  to: 8 },
  { key: 'london',  label: 'London (08–13 UK)',  from: 8,  to: 13 },
  { key: 'overlap', label: 'LN/NY (13–18 UK)',   from: 13, to: 18 },
  { key: 'ny',      label: 'NY (18–22 UK)',      from: 18, to: 22 },
  { key: 'off',     label: 'Off-hours (22–24 UK)', from: 22, to: 24 },
];
export const sessionOf = h => SESSIONS.find(s => h >= s.from && h < s.to) || SESSIONS[SESSIONS.length - 1];
export const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Rows with fewer trades than this are shown but greyed — a 3-trade cell that
 *  reads 100% is noise wearing a number. */
export const MIN_N_CELL = 10;

/**
 * Every slice of the book that a trader actually asks about. All keyed on the
 * OPEN time in UK wall-clock — the moment the decision was made — not the close.
 */
export function breakdowns(trades, { gross = false } = {}) {
  const opened = trades.filter(t => t.utcOpen);
  const g = (src, fn) => groupBy(src, fn, { gross });
  const bySession = g(opened, t => sessionOf(ukClock(t.utcOpen).hour).label)
    .sort((a, b) => SESSIONS.findIndex(s => s.label === a.key) - SESSIONS.findIndex(s => s.label === b.key));
  const byDow = g(opened, t => DOW[ukClock(t.utcOpen).dow])
    .sort((a, b) => DOW.indexOf(a.key) - DOW.indexOf(b.key));
  const byHour = g(opened, t => String(ukClock(t.utcOpen).hour).padStart(2, '0') + ':00')
    .sort((a, b) => a.key.localeCompare(b.key));
  return {
    byPair:    g(trades, t => t.symbol || '?'),
    bySession, byDow, byHour,
    byDir:     g(trades, t => t.direction || '?'),
    byBotPair: g(trades, t => `${t.bot_key}|${t.symbol || '?'}`),
    noOpenTime: trades.length - opened.length,
  };
}

/** 7 × 24 grid of {n, wins, net} by UK weekday × UK hour of OPEN. */
export function hourWeekdayGrid(trades, { gross = false } = {}) {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ n: 0, wins: 0, net: 0 })));
  let skipped = 0;
  for (const t of trades) {
    if (!t.utcOpen) { skipped++; continue; }
    const { hour, dow } = ukClock(t.utcOpen);
    const c = grid[dow][hour];
    const v = netOf(t, { gross });
    c.n++; c.net += v; if (v > 0) c.wins++;
  }
  let maxAbs = 0;
  for (const row of grid) for (const c of row) maxAbs = Math.max(maxAbs, Math.abs(c.net));
  return { grid, maxAbs, skipped, days: DOW };
}

// ── Portfolio structure: correlation, effective bets, exposure ───────────────

/** Weekday ISO dates from `from` to `to` inclusive — the calendar a daily P&L
 *  stream is laid on. Weekends are excluded so a flat Saturday is not counted
 *  as a zero-return day. */
export function weekdays(from, to) {
  const out = [];
  let cur = from;
  while (cur <= to) {
    const d = new Date(cur + 'T00:00:00Z');
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(cur);
    d.setUTCDate(d.getUTCDate() + 1); cur = d.toISOString().slice(0, 10);
  }
  return out;
}

/**
 * One daily P&L stream per group (bot, instrument, …) on a SHARED weekday
 * calendar, zero-filled. Zero-filling is correct for portfolio purposes: a day
 * a bot did not trade contributed exactly nothing to the book's variance that
 * day. `activeDays` per group records how many days actually had a trade, so a
 * correlation between two groups that were rarely both active can be flagged.
 */
export function dailyByGroup(trades, keyFn, { gross = false } = {}) {
  if (!trades.length) return { keys: [], days: [], series: {}, activeDays: {} };
  const days = weekdays(trades[0].day, trades[trades.length - 1].day);
  const idx = new Map(days.map((d, i) => [d, i]));
  const series = {}, activeDays = {};
  for (const t of trades) {
    const k = keyFn(t); if (k == null) continue;
    if (!series[k]) { series[k] = new Array(days.length).fill(0); activeDays[k] = new Set(); }
    const i = idx.get(t.day);
    if (i == null) continue;        // a close on a weekend lands nowhere — rare, reported by caller if it matters
    series[k][i] += netOf(t, { gross });
    activeDays[k].add(t.day);
  }
  const keys = Object.keys(series);
  const act = {}; for (const k of keys) act[k] = activeDays[k].size;
  return { keys, days, series, activeDays: act };
}

function pearson(a, b) {
  const n = a.length; if (n < 2) return null;
  let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
  if (saa < 1e-18 || sbb < 1e-18) return null;
  return sab / Math.sqrt(saa * sbb);
}

/** Minimum days on which BOTH groups traded before a correlation is shown. */
export const MIN_BOTH_ACTIVE = 15;

/**
 * Pearson correlation of daily P&L between every pair of groups, plus the days
 * both were active. A pair with too few jointly-active days is still computed
 * but flagged `thin` — two bots that almost never trade on the same day can
 * show a strong correlation driven by three coincidences.
 */
export function correlationMatrix(dbg) {
  const { keys, series, days } = dbg;
  const n = keys.length;
  const rho = keys.map(() => new Array(n).fill(1));
  const both = keys.map(() => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = series[keys[i]], b = series[keys[j]];
    let nb = 0; for (let d = 0; d < days.length; d++) if (a[d] !== 0 && b[d] !== 0) nb++;
    const r = pearson(a, b);
    rho[i][j] = rho[j][i] = r;
    both[i][j] = both[j][i] = nb;
  }
  return { keys, rho, both, days: days.length };
}

/** Eigenvalues of a symmetric matrix by cyclic Jacobi rotation. Small n only —
 *  we have at most ~23 bots. Nulls (undefined correlations) are treated as 0. */
export function symEigen(M) {
  const n = M.length;
  const A = M.map(r => r.map(v => (v == null || !isFinite(v)) ? 0 : v));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (off < 1e-14) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-15) continue;
      const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {
        const akp = A[k][p], akq = A[k][q];
        A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = A[p][k], aqk = A[q][k];
        A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk;
      }
    }
  }
  return A.map((r, i) => r[i]).sort((a, b) => b - a);
}

/**
 * How many INDEPENDENT bets the book really holds.
 *   nEff      — participation ratio of the correlation eigenvalues, (Σλ)²/Σλ².
 *               N for uncorrelated groups, 1 for perfectly correlated.
 *   divRatio  — Σ(individual daily sd) / portfolio daily sd. 1 when everything
 *               moves together, √N when independent.
 * Both are given because they fail differently: nEff ignores sizing, divRatio
 * is dominated by whichever group is biggest.
 */
export function effectiveBets(dbg, corr) {
  const { keys, series, days } = dbg;
  const n = keys.length;
  if (!n) return { n: 0, nEff: null, divRatio: null, eigen: [] };
  const eigen = symEigen(corr.rho);
  const sum = eigen.reduce((s, x) => s + x, 0), sumSq = eigen.reduce((s, x) => s + x * x, 0);
  const nEff = sumSq > 1e-12 ? (sum * sum) / sumSq : null;
  const sd = a => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
  const port = new Array(days.length).fill(0);
  for (const k of keys) for (let d = 0; d < days.length; d++) port[d] += series[k][d];
  const sumSd = keys.reduce((s, k) => s + sd(series[k]), 0), portSd = sd(port);
  return { n, nEff, divRatio: portSd > 1e-12 ? sumSd / portSd : null, eigen, topShare: sum > 0 ? eigen[0] / sum : null };
}

/** P(B lost | A lost), per ordered pair, on days both were active. The question
 *  a correlation coefficient blurs: when this one bleeds, does that one too? */
export function coincidentLoss(dbg) {
  const { keys, series, days } = dbg;
  const n = keys.length, out = keys.map(() => new Array(n).fill(null));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i === j) continue;
    let aLoss = 0, bothLoss = 0;
    for (let d = 0; d < days.length; d++) {
      if (series[keys[i]][d] < 0 && series[keys[j]][d] !== 0) { aLoss++; if (series[keys[j]][d] < 0) bothLoss++; }
    }
    out[i][j] = aLoss >= 5 ? { p: bothLoss / aLoss, n: aLoss } : null;
  }
  return out;
}

/** Worst joint days: the days with the most groups losing at once. */
export function worstJointDays(dbg, top = 5) {
  const { keys, series, days } = dbg;
  return days.map((d, i) => {
    let losers = 0, active = 0, net = 0;
    for (const k of keys) { const v = series[k][i]; if (v !== 0) active++; if (v < 0) losers++; net += v; }
    return { day: d, losers, active, net };
  }).filter(r => r.active > 0).sort((a, b) => b.losers - a.losers || a.net - b.net).slice(0, top);
}

// ── Currency legs ────────────────────────────────────────────────────────────
//
// UNITS ARE LOTS, NOT NOTIONAL, ON PURPOSE. Converting lots to money needs a
// per-instrument contract size, and this repo has a documented live drift on
// exactly that kind of constant (Gold pip 0.1 vs 1.0 — a 10× error that
// reached KV). Within FX a lot is 100k of base everywhere, so FX legs are
// comparable with each other in lots. A non-FX instrument (gold, an index) is
// its own leg with NO counter-currency leg added: its USD notional per lot is
// unknowable here, and inventing it would put a number on the USD line that
// looks like the others and is not.

export function legsOf(symbol, direction, lots, resolve) {
  const sign = direction === 'BUY' ? 1 : direction === 'SELL' ? -1 : 0;
  if (!sign || !lots) return [];
  let ins = null;
  try { ins = resolve(symbol); } catch (e) { ins = null; }
  if (!ins) return [{ ccy: String(symbol || '?').toUpperCase(), lots: sign * lots, kind: 'unknown' }];
  if (ins.assetClass === 'fx') {
    const [base, quote] = String(ins.display).split('/');
    return [{ ccy: base, lots: sign * lots, kind: 'fx' }, { ccy: quote, lots: -sign * lots, kind: 'fx' }];
  }
  const name = String(ins.display).split(/[\/_]/)[0];
  return [{ ccy: name, lots: sign * lots, kind: ins.assetClass }];
}

/** Positions open at instant `utc` (open ≤ utc < close), from the closed book. */
export function openAt(trades, utc) {
  return trades.filter(t => t.utcOpen != null && t.utcOpen <= utc && t.utcClose > utc);
}

/** Net lots per leg for a set of positions. */
export function netLegs(positions, resolve) {
  const m = new Map();
  for (const p of positions) {
    for (const l of legsOf(p.symbol, p.direction, p.lots || 0, resolve)) {
      const cur = m.get(l.ccy) || { ccy: l.ccy, lots: 0, kind: l.kind, positions: 0 };
      cur.lots += l.lots; cur.positions++;
      m.set(l.ccy, cur);
    }
  }
  return [...m.values()].sort((a, b) => Math.abs(b.lots) - Math.abs(a.lots));
}

/** Net legs at the end of each weekday in the book — the exposure the book
 *  carried overnight, day by day. Also the open-position count. */
export function exposureSeries(trades, resolve) {
  if (!trades.length) return { days: [], legs: [], series: {}, concurrency: [] };
  const days = weekdays(trades[0].day, trades[trades.length - 1].day);
  const legSet = new Set(), rows = [], concurrency = [];
  for (const d of days) {
    const eod = Math.floor(new Date(d + 'T23:59:59Z').getTime() / 1000);
    const open = openAt(trades, eod);
    const legs = netLegs(open, resolve);
    legs.forEach(l => legSet.add(l.ccy));
    rows.push(new Map(legs.map(l => [l.ccy, l.lots])));
    concurrency.push({ day: d, open: open.length });
  }
  const legs = [...legSet];
  const series = {};
  for (const c of legs) series[c] = rows.map(r => r.get(c) || 0);
  return { days, legs, series, concurrency, maxConcurrent: Math.max(0, ...concurrency.map(c => c.open)) };
}

// ── Risk ─────────────────────────────────────────────────────────────────────

/** Drawdown episodes on a daily equity path: depth, length, recovery time. */
export function drawdownEpisodes(dEq) {
  const eps = [];
  let inDD = false, start = null, trough = 0, troughDay = null, peakEq = 0;
  for (let i = 0; i < dEq.length; i++) {
    const d = dEq[i];
    if (d.ddAbs < -1e-9) {
      if (!inDD) { inDD = true; start = d.date; trough = d.ddAbs; troughDay = d.date; peakEq = d.peak; }
      else if (d.ddAbs < trough) { trough = d.ddAbs; troughDay = d.date; }
    } else if (inDD) {
      eps.push({ start, trough: troughDay, end: d.date, depth: trough, depthPct: peakEq > 0 ? trough / peakEq * 100 : null,
                 days: Math.round((new Date(d.date) - new Date(start)) / 86400000), recovered: true });
      inDD = false;
    }
  }
  if (inDD) eps.push({ start, trough: troughDay, end: null, depth: trough, depthPct: peakEq > 0 ? trough / peakEq * 100 : null,
                       days: Math.round((new Date(dEq[dEq.length - 1].date) - new Date(start)) / 86400000), recovered: false });
  return eps.sort((a, b) => a.depth - b.depth);
}

/** Concentration: how much of the result rides on a handful of trades. */
export function concentration(trades, { gross = false } = {}) {
  const pnls = trades.map(t => netOf(t, { gross })).sort((a, b) => b - a);
  const n = pnls.length;
  if (!n) return null;
  const total = pnls.reduce((s, x) => s + x, 0);
  const grossProfit = pnls.filter(x => x > 0).reduce((s, x) => s + x, 0);
  const top = k => pnls.slice(0, Math.min(k, n)).reduce((s, x) => s + x, 0);
  const without = k => total - top(k);
  const q = Math.max(1, Math.floor(n * 0.1));
  const topDecile = pnls.slice(0, q).reduce((s, x) => s + x, 0) / q;
  const botDecile = pnls.slice(-q).reduce((s, x) => s + x, 0) / q;
  return {
    n, total, grossProfit,
    top1Share:  grossProfit > 0 ? top(1) / grossProfit : null,
    top5Share:  grossProfit > 0 ? top(5) / grossProfit : null,
    top10Share: grossProfit > 0 ? top(10) / grossProfit : null,
    withoutTop5: without(5), withoutTop10: without(10),
    tailRatio: botDecile < 0 ? topDecile / -botDecile : null,
  };
}

// ── Projection ───────────────────────────────────────────────────────────────
//
// Monte Carlo of the NEXT `horizon` trading days by resampling this book's own
// daily P&L with replacement, tested against prop-firm style rules: a profit
// target, a max drawdown from the starting balance, a max daily loss. Days are
// the unit, not trades, because the rules are stated per day and a day's
// concurrency is already baked into its P&L.
//
// What this is: "if the next N days are drawn from the same distribution as
// the last M, how often does this book pass". What it is NOT: a forecast. It
// assumes the future is a reshuffle of the past, which is precisely the thing a
// regime change breaks. The UI gates it on sample size and says so.

export function projectPaths(dayPnls, { horizon = 30, runs = 2000, capital = 0, targetPct = 10, maxDDPct = 10, dailyLossPct = 5, seed = 0x9e3779b9 } = {}) {
  const n = dayPnls.length;
  if (n < 10 || !(capital > 0)) return null;
  const rng = mulberry32(seed >>> 0);
  const target = capital * targetPct / 100, maxDD = capital * maxDDPct / 100, dailyLoss = capital * dailyLossPct / 100;
  const finals = new Array(runs);
  const pathsAt = Array.from({ length: horizon + 1 }, () => []);   // equity distribution at each day
  let pass = 0, bustDD = 0, bustDaily = 0, neither = 0;
  const passDays = [];
  for (let r = 0; r < runs; r++) {
    let eq = 0, peak = 0, outcome = null;
    pathsAt[0].push(0);
    for (let d = 1; d <= horizon; d++) {
      const v = dayPnls[(rng() * n) | 0];
      eq += v; if (eq > peak) peak = eq;
      pathsAt[d].push(eq);
      if (outcome) continue;
      if (v <= -dailyLoss)   { outcome = 'daily'; bustDaily++; continue; }
      if (eq <= -maxDD)      { outcome = 'dd';    bustDD++;    continue; }   // FTMO-style: absolute, from start
      if (eq >= target)      { outcome = 'pass';  pass++; passDays.push(d); continue; }
    }
    if (!outcome) neither++;
    finals[r] = eq;
  }
  const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
  const fan = pathsAt.map((arr, d) => ({ d, p5: pct(arr, 5), p25: pct(arr, 25), p50: pct(arr, 50), p75: pct(arr, 75), p95: pct(arr, 95) }));
  passDays.sort((a, b) => a - b);
  return {
    runs, horizon, capital, rules: { targetPct, maxDDPct, dailyLossPct },
    pPass: pass / runs, pBustDD: bustDD / runs, pBustDaily: bustDaily / runs, pNeither: neither / runs,
    medianDaysToPass: passDays.length ? passDays[Math.floor(passDays.length / 2)] : null,
    finalPct: { p5: pct(finals, 5) / capital * 100, p50: pct(finals, 50) / capital * 100, p95: pct(finals, 95) / capital * 100 },
    fan, sampleDays: n,
  };
}

// ── Expectation: horizon-matched window distributions ────────────────────────
//
// The frozen expect_<bot> artifact holds the backtest's daily returns. To rank
// a live window of N days fairly, every headline metric is computed over EVERY
// N-day window of that series, and the live figure is placed inside that
// distribution. A 3-month live Sharpe against a 5-year backtest Sharpe is a
// category error; against the spread of 3-month Sharpes the backtest itself
// produced, it is the right question. Same construction as `growthCone`, for
// the tiles instead of the curve.
//
// Lightweight per-window maths (mean/sd/compound/drawdown in one pass) rather
// than portfolioStats(), because ~1,200 windows × a full stats battery is
// seconds in a browser and this runs on every render.

export function windowDist(rets, N) {
  const out = { n: 0, horizon: Math.min(N, rets.length), totalReturn: [], cagr: [], sharpe: [], sortino: [], maxDD: [], volAnn: [], calmar: [] };
  const k = out.horizon;
  if (!rets.length || k < 5) return out;
  for (let i = 0; i + k <= rets.length; i++) {
    let eq = 1, peak = 1, dd = 0, sum = 0, dsq = 0;
    for (let j = i; j < i + k; j++) {
      const r = rets[j];
      sum += r;
      if (r < 0) dsq += r * r;
      eq *= (1 + r / 100); if (eq > peak) peak = eq;
      const d = eq / peak - 1; if (d < dd) dd = d;
    }
    const m = sum / k;
    // Two-pass variance: the one-pass form (Σr²/k − m²) leaves ~1e-17 of
    // cancellation residue on a constant series, which then divides into a
    // Sharpe of 10^8 instead of the guarded 0.
    let ss = 0; for (let j = i; j < i + k; j++) { const d = rets[j] - m; ss += d * d; }
    const sd = Math.sqrt(ss / k);
    const dsd = Math.sqrt(dsq / k);
    const total = (eq - 1) * 100, years = k / 252;
    const cagr = (Math.pow(Math.max(1e-9, eq), 1 / years) - 1) * 100;
    const maxDD = dd * 100;
    out.totalReturn.push(total); out.cagr.push(cagr);
    out.sharpe.push(sd > 1e-12 ? m / sd * Math.sqrt(252) : 0);
    out.sortino.push(dsd > 1e-12 ? m / dsd * Math.sqrt(252) : 0);
    out.maxDD.push(maxDD); out.volAnn.push(sd * Math.sqrt(252));
    out.calmar.push(maxDD < -1e-9 ? cagr / Math.abs(maxDD) : 0);
  }
  out.n = out.sharpe.length;
  return out;
}

/** Percentile rank of `v` in `arr` (0-100), and the P5/P50/P95 of `arr`.
 *  null when there is nothing to rank against — never 50 as a stand-in. */
export function rankAgainst(arr, v) {
  if (!arr || !arr.length || v == null || !isFinite(v)) return null;
  const s = [...arr].sort((a, b) => a - b);
  const at = p => s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))];
  return { rank: Math.round(s.filter(x => x < v).length / s.length * 100), p5: at(5), p50: at(50), p95: at(95), n: s.length };
}
