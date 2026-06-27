# MacroFXModel — System Assessment

> A candid engineering & methodology review of the platform, written as a
> companion to `CODEBASE_OVERVIEW.md`. The goal is not to praise or dismiss but
> to separate **what is genuinely strong** from **what is still unproven**, and
> to give a concrete, prioritized path to closing the gap.
>
> Verdict in one line: **strong research, not yet proof.** The thinking and
> engineering instincts are well above typical retail quant work; the validation
> depth has not yet caught up with the breadth of what's been built.

---

## 1. What Is Genuinely Strong

### 1.1 Conceptual coherence
This is not a pile of indicators. There is a real, consistent thesis running
through the whole platform:

> **Macro sets the weather → regime sets the state → vol forecasting sizes the
> bet → structural confluence picks the entry.**

Most retail systems implement one of those layers. This one implements all four
and wires them together (macro tier score gates the bots, HMM regime gates
entries, vol forecast drives sizing and stops, Fib confluence places the order).
Integrating the layers is the hard part, and it's been done.

### 1.2 Sound theoretical foundations
The math is correct, not hand-waved:
- **EWMA (λ=0.94) / GARCH(1,1)** for volatility — standard, defensible.
- **Brownian-motion range percentiles** (Feller range distribution, half-normal
  for open-close drift) — this is the *right* way to turn σ into an expected
  range, and it's rare to see it done properly.
- **HMM + BOCPD** for regime and change-point detection — appropriate tools.
- **Walk-forward with train/holdout splits**, FRED **publication lags** to
  prevent lookahead, **paper-mode by default**, supervised auto-restart.

These are precisely the things most people skip. They weren't skipped here.

### 1.3 Intellectual honesty
The repo's own working docs are self-skeptical in a way that is rarer and more
valuable than any single strategy:
- `VOL_CALIBRATION_TRACKER.md` openly logs the NQ GARCH model oscillating
  between +59% and −21% error and **resists** the urge to keep refitting.
- `FORECASTER_OPTIMIZER_RESULTS_LOG.md` flags its own best config's 11–12h entry
  window as *"smells like curve-fit"* and *"all in-sample."*

A system that documents its own weaknesses is far more trustworthy than one that
only reports wins.

---

## 2. Where the Risk Lives

### 2.1 Almost everything is in-sample — and the docs admit it
**This is the single biggest risk in the platform.** The headline numbers
(55–65% win rates, ~20–28% CAGR, Sharpe > 2 optimizer configs) are largely:
- selected as best-of-N (e.g. best of ~600 random configs per pair), then
- checked on a relatively thin out-of-sample tail.

Best-of-N ranked on the same data is multiple-comparisons bias: with enough
configs, *something* will look great on noise. The holdout check helps but isn't
sufficient. **Treat these numbers as design targets, not results.**

> Mitigation: combinatorially-purged cross-validation (or a genuine rolling
> walk-forward where the selection window never touches the test window),
> plus a deflated-Sharpe adjustment for the number of trials run.

### 2.2 Optimistic fills
Several backtesters (Asia-range fade, vol-level fade) place **limit orders at
the exact Fib / forecast level** and then count the reversion. This
systematically overstates edge: in live trading, the fills you *don't* get are
disproportionately the ones that would have lost (price blew through the level
and kept going). A backtest that always gets the limit fill is counting the
winners and silently dropping the losers.

> Mitigation: model adverse fills — require the level to be **breached and
> reclaimed**, add slippage to limit fills, and/or assume partial fills. Expect
> this to eat a meaningful chunk of the apparent win rate. That's not a bug;
> it's the real number.

### 2.3 Sprawl and duplicated logic
~100 JS files, ~85 Python, ~50 HTML backtesters, ~80 docs, regime versions
V1→V7, and — critically — **the same strategy logic reimplemented across JS
engines and Python ports** (`ForecasterOptimizer` is described as a
"bit-identical" port of a JS engine).

"Bit-identical" is a standing correctness liability: the moment the two
implementations drift, the backtest and the live bot disagree and there is no
authoritative answer to *which one is right*. This is a trust problem, not just
a tidiness one.

> Mitigation: one shared, single-source-of-truth backtest/execution engine that
> both research and live trading call. If a port must exist, gate it with a
> golden-output diff test that fails CI on any divergence.

### 2.4 Diversification may be partly illusory
Carry, momentum, gold-macro, macro-equity, and the FX bots are, at the factor
level, substantially **long the same Fed-liquidity / risk-on regime**. A
combined book of N correlated strategies has materially less drawdown protection
than "N strategies" implies. The diversification explorer is the right instinct,
but the ~−16% base-case max drawdown looks optimistic given the shared factor
exposure.

> Mitigation: compute the **effective number of independent bets** (e.g. via the
> correlation matrix / PCA on strategy returns), and stress the combined book
> through a single liquidity-contraction scenario (2018Q4, 2020Q1, 2022) rather
> than trusting per-strategy drawdowns to be independent.

### 2.5 "The edge is in the layering" cuts both ways
Each confluence filter raises the win rate **and shrinks the sample**. The
"top 1–3% setups hit 70%+" claim is almost certainly tiny-N, and stacking
filters until the in-sample stats look good is the textbook overfitting failure
mode. The star-rating / confluence-source design is exactly where this can creep
in unnoticed.

> Mitigation: report sample size next to every win-rate claim; require a minimum
> N (e.g. ≥100 trades) before a filter combination is considered "validated";
> and prefer **fewer, pre-registered** filters over post-hoc stacking.

### 2.6 Calibration instability
The NQ/index GARCH vol whiplashes (slow α+β≈0.97 decay vs reference vol that
mean-reverts in ~1 session). This is honestly tracked, but an unstable vol model
propagates directly into sizing and stop placement, so it's load-bearing.

> Mitigation: the tracker's own conclusion is right — fix estimator *dynamics*
> (α, the news-shock weight), not the static correction factors. Consider a
> regime-switching or shorter-memory estimator for index futures specifically.

### 2.7 Operational fragility (lower priority, but real)
A single Railway process supervises three live bots + the web server; KV is an
in-memory mock in that path; execution depends on MT5. Worth confirming:
**order idempotency across restarts** (does a crash-restart risk double-submitting
or losing position state?) and **position reconciliation** against the broker on
startup.

---

## 3. Overall Verdict

| Dimension | Assessment |
|---|---|
| **Idea quality** | High — coherent, multi-layer, theoretically grounded |
| **Engineering discipline** | Good — lookahead control, walk-forward, paper-first, honest logs |
| **Breadth** | Very high — possibly too high for one person to validate |
| **Validation depth** | **The gap** — mostly in-sample, optimistic fills, thin OOS |
| **Operational maturity** | Reasonable for personal scale; a few resilience unknowns |

This is closer to a junior systematic desk's research stack than a hobby
project. The instincts (control lookahead, validate out-of-sample, paper-trade
first, log your own calibration failures) are the marks of someone who has been
burned and learned from it.

**The distance left to travel is from research to proof.** A lot of plausible
edges have been built; it has not yet been *demonstrated* that any single one
survives out-of-sample with realistic fills and costs. Breadth has outrun the
depth of validation — which is the good problem to have, because it's fixable
without building anything new.

---

## 4. Prioritized Punch-List

The highest-leverage move is to **stop building strategies and start proving
them.** In rough priority order:

### P0 — Prove one thing end-to-end
1. **Pick the 2–3 most promising systems and shelve the rest.** Archive (don't
   delete) the others to cut maintenance surface and cognitive load. Candidate
   keepers based on the review: RegimeV2 (most developed + deployed), the
   vol-range forecaster (best theoretical footing), and one structural system
   (Gold Bot or Asia-range confluence).
2. **Build one shared backtest/execution engine** as the single source of truth,
   with **adverse-fill + transaction-cost + slippage modeling baked in.** Live
   and backtest must call the same code path. Add a golden-output regression
   test so any divergence fails loudly.
3. **Re-run the kept systems through honest OOS** — purged/embargoed
   cross-validation or true rolling walk-forward, with deflated-Sharpe for the
   number of trials. Record the *realistic* numbers, even if they're worse.

### P1 — Forward-validate
4. **Run a forward paper-trading log** for the kept systems and compare **live
   signal vs backtest signal weekly.** This is the only thing that distinguishes
   a real edge from a fitted one. Three clean months before any real capital.
5. **Stabilize the vol estimator** for index futures (fix α, not the correction
   factors) so sizing/stops stop whiplashing.

### P2 — Harden
6. **Compute effective-number-of-bets** across the combined book and stress it
   through a single liquidity-contraction scenario; resize allocations to the
   *real* diversification, not the nominal strategy count.
7. **Confirm operational safety**: order idempotency across restarts, startup
   position reconciliation against the broker, and KV persistence in the live
   path (not the in-memory mock).
8. **Attach sample sizes to every performance claim** in the docs and set a
   minimum-N bar before a filter/confluence combination is called "validated."

---

## 5. The One-Sentence Takeaway

You've built a genuinely good research platform with the right bones; the work
that remains is not more building but **ruthless out-of-sample validation with
realistic fills** on a small number of chosen systems — that's what converts
"plausible edges" into "an edge you can size into."

---

*This assessment reflects a structured code-and-docs review. Performance figures
referenced here are quoted from the repository's own backtests and are in-sample
unless explicitly validated otherwise — verify before acting.*
