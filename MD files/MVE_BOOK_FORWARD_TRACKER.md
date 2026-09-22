# MVE book layer — forward paper tracker (pre-registered 2026-09-22)

*Registered before the first tick. Nothing above §7 changes once the tracker starts;
findings get appended below the line.*

> **Amended before the first tick (2026-09-22).** The R2 manifest and log were both
> confirmed empty when this was changed. The tracked book is now **the system from
> `MVE_BOOK_SYSTEM_BACKTEST.md`**: the same sleeves, hedged off K = 2 PCs + basket + **net
> USD**, sized to a **10% vol target** (5× gross cap), next to the unhedged sleeves at the
> same sizing. It was changed because the audit's PC-only hedge can leave a dollar bet in
> the book (that doc's §0), and a forward test should track the system actually being
> considered. The tracker calls the same `bookSystem.systemBookAt` as the backtest, and its
> manifest's reference numbers come from that backtest. The rules in §3 are unchanged. The
> table in §1 below describes the original design; where it differs, this note wins.

## 0. What is being tracked, and why

The book-layer audit (`MVE_BOOK_FACTOR_AUDIT.md` §8) read **RELATIVE-VALUE**: the 2Y/10Y
spread sleeves' edge survived removing the shared currency factors. Hedging raised OOS
Sharpe (combined 0.98 → 1.36) and cut volatility by about two thirds. Its pre-registered
consequence was: *the factor-neutral combined book becomes the candidate system for forward
paper tracking.*

The backtest can't settle whether that edge is real going forward:
- IS was weak for every version.
- The OOS strength sits in 2022–24.
- The OOS overlaps the grid the 2.0/126 config came from.

The only data nobody has looked at yet is the future, so this tracker records it.

## 1. Frozen (no changes once the first close is logged)

| Item | Setting |
|---|---|
| Book | **Combined**: 2Y + 10Y spread sleeves at ½ each, flat 1 unit per open trade |
| Sleeves | `runSpreadBook('y2' / 'y10')`, zWindow 126, entry \|z\| 2.0, exit 1.5, max hold 20d, pub lags US +2d / foreign +45d |
| Hedge | Projected off **K = 2** currency factors (the audit's noise-band K, now frozen) + the basket; 120-day window; rescaled to the raw book's gross; traded on the 7 USD majors |
| Code | The audit's own path: `bookFactorEngine.prepareBookInputs` → `bookFactor.windowFactors` + `neutralBook`. The backtest walk calls the same `neutralBook`, so the two can't drift |
| Data | M1 → UTC-date daily closes, weekdays only, the current (incomplete) UTC day always dropped |
| Cost | 1 bp one-way per unit of turnover on every pair, hedge legs included |
| Schedule | Daily 07:15 London (after the 00:05 M1 top-up); service `mveBookForward` (`SVC_MVE_BOOK_FORWARD=0` disables) |
| Storage | R2, append-only: `mve/book-forward/manifest.json` (frozen on the first tick) and `mve/book-forward/log.json` (one record per close, never edited) |

**Accounting.** At the close of day D the book rebalances to its new target, and that
rebalance's cost is booked on D. P&L on D is the previous record's book marked from the
previous record's **stored** closes to D's close, so later data revisions can't rewrite
history. Missed days (redeploy, outage) are held through, not back-filled.

## 2. Reference numbers (frozen into the manifest on the first tick)

The first tick runs the full-history backtest of exactly this book with K = 2 and the same
cost, and freezes these values into the manifest:
- neutral OOS Sharpe
- neutral full-sample max drawdown
- OOS volatility, neutral and raw

These should reproduce the audit's combined row (neutral OOS Sharpe 1.36). If they don't,
that's a parity problem to explain before tracking means anything.

## 3. Pre-registered rules

| Status | Rule |
|---|---|
| **PAUSED-PARITY** | Any day where replaying the previous logged close with the current code and data does not reproduce the logged book (max \|Δ position\| > 1e-6). The reading pauses until the cause is explained: a code change, a data revision or a bug. Checked first. |
| **KILL-DRAWDOWN** | Forward max drawdown worse than **1.5×** the backtest's full-sample max drawdown of the neutral book. |
| **KILL-INCONSISTENT** | From **126** logged trading days: forward annualised Sharpe below backtest OOS Sharpe − **2 SE** (SE = √(252/n)). This means it's statistically inconsistent with the backtest. |
| **REVIEW-DUE** | At **252** logged trading days: a formal review of forward Sharpe ± SE against the backtest. |
| **RUNNING** | Anything else. |

Also reported (information only): the raw combined book alongside, and the ratio of
neutral to raw volatility (backtest about 0.37).

## 4. What these rules can and cannot tell us (stated up front)

- **A year of data can't confirm a Sharpe ≈ 1 edge.** The standard error of an annualised
  Sharpe after one year is about 1.0. After 12 months the review can say "consistent with
  the backtest" or "not", but it can't prove there's an edge. Telling a Sharpe of 1 from
  0 at about 2 SE takes roughly 4 years.
- **The kill rules exist to catch a break early:** a drawdown the backtest never came near,
  or a Sharpe far below it.
- **The sleeves trade rarely.** The book is flat on many days, so the record builds slowly.
- **Spot only.** No swap/carry, matching the backtest. A real book would also earn or pay
  carry on every leg.

## 5. What a pass would and would not permit

**REVIEW-DUE with forward Sharpe within 2 SE of the backtest** permits a decision about
*small real size*. It doesn't prove the edge, and nothing here places orders. Real money
would be a separate, deliberate step with its own sizing and risk limits. A KILL status
retires the candidate. It does not invalidate the audit's reading about the historical
data.

## 6. Code

- `js/mve/bookForward.js` (pure: `forwardStep`, `summarizeForward`, `FORWARD_RULES`)
- `js/mve/bookForwardEngine.js` (I/O: `runForwardTick`, `readForward`)
- `js/mve/bookForward.test.mjs` (22/22)
- `server.js`: `GET /api/mve-book/forward`, `POST /api/mve-book/forward/run`, and the daily
  07:15 London tick (registered as `mveBookForward` in `js/serviceFlags.js`)
- `mve.html`: 📒 panel

`js/mve/bookFactor.js` gained `neutralBook`, one day's hedge. `runBookLayer` now calls it,
so the backtest and the tracker share one implementation.

**Dry run (sandbox, real M1 closes, stand-in sleeve trades, in-memory store):**
- Five ticks appended one close per new morning.
- A repeat tick the same morning appended nothing.
- Friday's close was logged on Monday.
- Every replay reproduced the logged book exactly (Δ = 0).
- Post-hedge factor exposure was about 1e-19.

---

## 7. Forward log

*(starts with the first Railway tick)*
