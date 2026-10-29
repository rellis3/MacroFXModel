# rule-a-book-forward: forward record of rule A on the chosen lines, alongside the portfolio book, as one combined book

**Pre-registered 2026-10-27, before any forward outcome existed.** The rule A chosen-lines arm starts recording with this commit's deploy. For the book, days after 2026-08-21 have never been built.

| | |
|---|---|
| ID / ledger id | `rule-a-book-forward-corr` (F1), `rule-a-book-forward-ruleA` (F2) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `rule-a-book-forward` |
| Data | **Rule A:** the live paper record (KV `paper_record_v1`), new arm `chosen`: the chosen v3 lines (persistence + IV ladder, `buildPersistInstruments`), OANDA live M1, 11 instruments. **Book:** `scripts/portfolio-book/build.mjs` `buildPortfolio()` rebuilt with `sample.to` = the scoring date; days after 2026-08-21 only. |
| Seed | `20261027` |
| Uncertainty | Moving-block bootstrap on weekdays, block = 20, B = 2000 |
| Scripts / outputs | `scripts/rule-a-book-forward/score.mjs` → `analysis/output/rule-a-book-forward/` |
| Harness | Own script. It reads the live record and calls the existing book builder; nothing is refitted. |

## 1. The claim
Lessons 01–06 produced one tradeable rule and one structural result:
- **The rule:** rule A, the rich-day break on the chosen v3 lines. In the backtest it made +0.162R per trade net of 2× spread, 2020-26.
- **The structural result:** rule A is a separate source of return from the CFD portfolio book (`rule-a-portfolio-second-book`, VALIDATED: correlation −0.01).

The claim: both hold out of sample. Rule A on the chosen lines stays positive, and the two books stay uncorrelated, so that holding them together at equal risk is better than either alone.

## 2. Why it is not already settled
- **Everything so far is backtest.**
- **The live paper record (`paper-record.html`, since 2026-10-02) runs the rule on the older Vote Atlas v4 lines,** not on the chosen v3 lines the backtest, Lessons 04–06 and the Decision Lab use:
  - 10 lines including CloseUp and ProjH, against rule A's 4 (O→H / O→L p50 and p75);
  - costs at 1× spread, against the backtest's 2×.
- **The v4 arm so far:** 56 closed trades, +0.65R per trade at 0.2σ/5R, 1× spread. It is noise-sized and on different lines, so it is not evidence for rule A as backtested.
- **The book has no forward record** (portfolio-book memory: "next step portfolio-book-confirm on a forward demo record").

## 3. Definitions, fixed in advance
- **Rule A chosen arm (live, paper only, no orders):**
  - Rich-day flags exactly as the paper record sets them: IV ÷ 20-day RV, set the evening before, thresholds 1.182 / 1.53.
  - Lines are the chosen ladder for that London session: O→H p50, p75 and O→L p50, p75 as % of the London-midnight open, with σ = `sigma_used_pct`. The ladder is captured on first use for the day and never updated.
  - Break: the first 1-minute close ≥ 0.05σ beyond a line, signal minute 00:00–10:00 London. Enter at the next bar's open.
  - Stop 0.2σ behind the line; target 5R; otherwise out at the day's last bar.
  - Cost: 2 × `costForPair`. The 0.1σ and 10R variants are recorded too.
  - One trade per line per day.
- **Rule A daily stream A_t:** the sum of net R of the chosen arm's 0.2σ/5R trades entered that weekday (0 if none), from the first full London day after deploy.
- **Book stream B_t:** the equal-weight mean of sleeves S1g, S2, S3g and S4 (Σ legs c / 1e8), registered costs, weekdays after 2026-08-21.
- **Combined book:** K_t = ½·A_t / 3.943 + ½·B_t / 0.001553. The scales are the backtest daily SDs of rule A at 1R per trade (2020-08 → 2026-08) and of B over the same days, frozen now.
- **Clusters-only rule A (descriptive):**
  - Frozen weights from the 2020-08 → 2026-08 backtest (`rule-a-portfolio`; clusters at corr ≥ 0.30, one budget each, no 1/σ):
    - AUDUSD, GBPUSD, GOLD, US2000, USDCAD, USDJPY: 1.375 each;
    - EURUSD, USDCHF: 0.6875 each;
    - NQ, SPX500, US30: 0.4583 each.
  - Paper record keys map spx → SPX500 and dow → US30.
- **Judgement date:** the later of 2027-10-29 and 200 common weekdays with both streams. Interim reads on the page are descriptive.

## 4. Hypotheses
| # | Question | Expectation |
|---|---|---|
| F1 | Do rule A (chosen arm) and the book stay uncorrelated? Pass: block-bootstrap 95% upper bound of corr(A, B) < 0.20 | Yes (backtest −0.01) |
| F2 | Is the chosen arm's net R per trade (0.2σ/5R, 2× spread) > 0, with lower bound > 0? | Positive (backtest +0.162R), but likely UNDERPOWERED in one year |
| MIRROR | The v4 arm on the same days, same 0.2σ/5R setting with costs raised to 2×. If v4 beats the chosen lines forward, the backtest's choice of lines is not confirmed | reported |

**Reported, not scored:**
- Sharpe of K against A and B alone.
- Clusters-only rule A against 1R per trade.
- Joint worst-5% days of A and B.
- Per-instrument R.
- The count of days the ladder was captured late (after 00:00).

## 5. Power
- **F1:** with 200–260 common weekdays, the SE of a near-zero correlation is about 0.07 with the block design. The upper bound clears 0.20 if the true correlation is below about 0.06. That is POWERED for the claim "not strongly correlated", and only weakly for "zero".
- **F2:** the backtest rate is about 340 trades a year, and the per-trade SD of a 5R/−1R structure is about 2R. That gives an SE of about 0.11R, so the MDE ≈ 0.3R, above the expected +0.16R. **UNDERPOWERED by design at one year.** An empty result is UNDERPOWERED, not NULL. The record keeps running, and F2 is re-judged each year with the full sample.

## 6. Multiplicity
- Two scored cells, F1 and F2, with Holm at α = 0.05.
- Everything else is descriptive.
- There are no interim tests: interim page reads carry no verdict.

## 7. What this does NOT test
- Real fills or slippage (paper, modelled spread).
- Any change to the rule.
- The book's financing haircuts (portfolio-book-validate).
- Live orders: none are placed by anything in this study.

## 8. What each verdict changes
- **F1 VALIDATED and F2 positive:** the combined book is the candidate for a demo account at small size, with its own prereg for execution.
- **F1 fails:** rule A is not counted as a separate leg. Its overlap with the book is named.
- **F2 negative after its first full year with the interval excluding +0.16R:** rule A is closed as a trading rule. The book continues alone.

## Amendments
