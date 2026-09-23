# MVE book layer — the hedged spread book as a sized system (pre-registered 2026-09-22)

*Registered before the real-data run (Railway, `mve.html` → 🧪 System backtest).
Results get appended below the line; nothing above it changes after the run.*

## 0. Why this exists, and a correction to the audit found while building it

The audit (`MVE_BOOK_FACTOR_AUDIT.md`) compared raw and factor-neutral books at an arbitrary
size (the neutral book rescaled to the raw book's gross). That gives a Sharpe, but no CAGR,
drawdown or trade list you could act on. This backtest adds a **sizing rule fixed in
advance**, so the system can be judged on the numbers that matter.

**Correction found on synthetic data before this module ever touched real data.** The
audit's hedge projects the book off the top-K PCs of **basket-demeaned, standardised**
currency returns. After that transform, a broad dollar move lands almost entirely on the
USD column, because every other currency's loading sits near the basket average. In
correlation-PCA terms it is effectively a one-column component, and it need not be among
the top 2.

On a synthetic market with a planted dollar edge:
- the PC-only hedge left the dollar book about ⅓ short USD (w_USD −3.5 → −1.1) and passed
  the dollar edge straight through (gross Sharpe 0.61 hedged vs 0.59 raw);
- projecting off the **USD unit vector as well** made net USD exactly zero and removed it
  (gross Sharpe 0.00).

`js/mve/bookSystem.test.mjs` pins both behaviours. So the audit's RELATIVE-VALUE reading
may be partly a dollar bet. This backtest settles it: it runs the audit's PC-only hedge
next to the corrected one and reports every version's leftover USD.

## 1. The system (fixed; no parameter is tuned here)

| Item | Setting |
|---|---|
| Signals | The 2Y and 10Y spread sleeves, `runSpreadBook('y2' / 'y10')`, frozen 2.0 / 126, exit 1.5, max hold 20d, pub lags +2d / +45d. Each trade at ½ weight (equal risk). |
| Hedge (primary) | Each open trade's currency vector projected off **[sd⊙PC₁, sd⊙PC₂, basket, USD]** (K = 2, 120-day window). The projection is linear, so book = Σ trades. |
| Sizing | Scale the book to a **10% annualised ex-ante vol** (window covariance) whenever anything is open, capped at **5× gross**. Flat when nothing is open. |
| Cost | **1 bp one-way** per unit of turnover on every pair traded, hedge legs included |
| Data | M1 → UTC daily closes, weekdays only, 7 USD majors, 2015→ |
| OOS | From the 2Y sleeve's own split date (60% of its trades) |
| No lookahead | Book decided at close t from data ≤ t, applied to return t+1 (truncation-tested) |

**Versions (same trades, same sizing, one run each):**

| Version | What it is |
|---|---|
| **primary** | The corrected hedge above |
| auditHedge | The audit's PC-only hedge |
| raw | The unhedged sleeves; this is the incumbent and the benchmark |
| primary2xCost | The primary at 2 bp one-way (cost stress) |

## 2. Reported

- **Full / IS / OOS:** CAGR, Sharpe ± SE (Lo 2002), Sortino, max DD, Calmar, longest
  underwater, skew, excess kurtosis.
- **Exposure and activity:** % days in market, average gross when active, % of active days
  at the gross cap, cost drag %/yr, and **leftover USD**. Leftover USD is the book's net
  USD as a share of its one-sided currency gross: 0% by construction for the primary, and
  measured for the others.
- **Trades:** count, win rate, profit factor, average trade, average hold.
- **Breakdowns:** yearly and monthly returns, and equity and drawdown curves.
- **Trade list with the house CSVs** (% Returns, R-Multiples, Currency P&L):
  - $100k account, compounding.
  - R = the trade's own ex-ante 1σ over 20 trading days at entry, so it varies per trade
    and isn't the % return relabelled.
  - MAE comes from the trade package's **daily-close** path. The hedged 7-leg package has
    no intraday path, and that's stated rather than hidden.

## 3. Pre-registered reading (primary)

**SYSTEM-WORTHY** requires all five:
1. full-sample net Sharpe **≥ 0.5**
2. IS net Sharpe **> 0**
3. OOS net Sharpe **≥ 0.5**
4. full-sample max drawdown **no worse than −25%** (2.5× the vol target)
5. full-sample Sharpe at **2× cost ≥ 0.3**

Otherwise **NOT-YET**, with the failed checks named. The primary is the verdict. The other
versions are context, and a better-looking one is **not** substituted after the fact.

**How the comparison is read:**
- **primary ≈ auditHedge, and both beat raw:** the audit's reading holds; the dollar
  leak didn't matter on real data.
- **auditHedge ≫ primary:** the audit's "relative value" was partly the leftover dollar.
  The honest edge is the primary's number.
- **primary ≪ raw:** hedging removes more edge than risk on real data, and the raw sleeves
  stay the better-evidenced version.

## 4. Known limits

- **Spot returns only**, no carry, the same as every sleeve result so far.
- **Leverage:** a hedged package has little volatility left, so the 10% target often needs
  3–5× gross, and the cap binds on some days. Realised vol can then sit below target. It's
  reported, not hidden.
- **The OOS window is not fresh.** It overlaps the grid the 2.0/126 config came from, as in
  the audit.
- **The forward tracker (`MVE_BOOK_FORWARD_TRACKER.md`) now tracks exactly this primary
  system.** It was switched before its first tick; its R2 manifest and log were confirmed
  empty.

## 5. Code

- `js/mve/bookSystem.js`:
  - `systemBookAt` builds one day's book. It is the single implementation, called by both
    the backtest walk and the forward tracker.
  - `runBookSystem`, `systemMetrics`, `byPeriod`, `readSystem`.
- `js/mve/bookSystemEngine.js` runs the four versions.
- `js/mve/bookSystem.test.mjs` (18/18) checks:
  - vol targeting and the cap;
  - per-trade P&L summing to the book;
  - a dollar bet: PC-only leaks it, PCs + USD removes it;
  - a relative-value edge survives;
  - a fully hedged-away book is flat, not noise;
  - no lookahead.
- `server.js`: `POST /api/mve-book/system/run` + `GET /status/:jobId` (async, 6h cache).
- `mve.html`: 🧪 panel.

---

## 6. Results

*(pending the Railway run)*
