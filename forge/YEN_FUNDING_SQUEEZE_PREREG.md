# yen-funding-squeeze — Does faster growth in yen lent outside Japan (as known at publication) predict a bigger yen squeeze next quarter than current volatility already implies?

**Pre-registered 2026-10-20, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `yen-funding-squeeze-usdjpy`, `yen-funding-squeeze-audjpy` (two scored cells) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `yen-funding-squeeze` |
| Data | BIS LBS, latest vintage: yen cross-border claims on all countries minus claims on Japan (`Q.{S,F}.C.A.JPY.A.5J.A.5A.A.{5J,JP}.N`). Yahoo daily closes `JPY=X` (USDJPY, 1996+) and `AUDJPY=X` (2003-12+). Outcome quarters run up to 2026-Q2, before the lockbox. |
| Seed | `20261020` |
| Uncertainty | Moving-block bootstrap over quarters, block 4, B = 2000 |
| Scripts / outputs | `scripts/yen-funding-squeeze/` → `analysis/output/yen-funding-squeeze/` |
| Harness | Own script (quarterly). |

## 1. The claim (required)

Yen-funded carry trades borrow yen to buy higher-yielding assets. When the trade unwinds, the yen jumps (October 2008, August 2024). BIS data shows how much yen banks lend to borrowers **outside Japan**, which is the carry-funding footprint. The desk version: when that lending has been growing fast, is the next quarter's largest yen rally (the squeeze) bigger than current volatility predicts? This is about size, not direction. It is the idea raised on 2026-10-20 from the bank-credit page.

## 2. Why it is not already settled (required)

- `yen-into-yields` (context): yen firming while US yields rise, followed by a volatile week. It found 35 episodes, too few to score, and it uses a price pattern. This study uses a funding **quantity** at a quarterly horizon.
- `squeeze-fuel` (null) is about retail OANDA positioning, which is a different crowd and a different data source.

## 3. Definitions, fixed in advance (required)

- **Signal.** `g_Y(q)` = 4-quarter FX-adjusted growth of yen lent outside Japan: (sum of four F flows to all countries − the same to Japan) ÷ (stock to all − stock to Japan, four quarters back) × 100. It is known at the end of q+2 and used for quarter q+3.
- **Outcome (squeeze size).** `S(q)` = the largest peak-to-trough **fall** in the cross (USDJPY, AUDJPY) within the quarter, from daily closes, in % of the peak, using a running maximum from the quarter's first close. A fall in these crosses is yen strength. The quantity predicted is `log S(q+3)`.
- **Volatility control.** `log S(q+3)` is regressed on `log RV(q+2)`, the annualised realised vol of daily log returns of the same cross in the last quarter known when the signal arrives. The scored statistic is the partial correlation of `g_Y(q)` with the residual.
- **Placebo.** Circular shifts of at least 12 quarters, outside the central 95%.
- **Sample.** USDJPY outcome quarters 1997-Q1 → 2026-Q2 (≈ 118); AUDJPY 2004-Q2 → 2026-Q2 (≈ 89). Halves split at the midpoint of each sample.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | `usdjpy`: does fast yen-offshore growth predict a bigger yen squeeze than vol predicts (partial r > 0)? | **Weak positive or null.** |
| b | `audjpy`: the same on the classic carry cross. | **Weak positive or null.** |
| — | **THE GATE** (per cell): Holm-corrected bootstrap CI excludes 0; the same sign in both halves; outside the placebo 95%. | |
| — | **THE MIRROR**: when yen funding is shrinking (g < 0), squeezes are smaller; the correlation covers it. | |

## 5. Power (required)

| Cell | n | MDE (r, 80%, Holm α 0.025) | Useful bar | Verdict |
|---|---|---|---|---|
| usdjpy | ≈ 118 | (2.24 + 0.84) / √118 ≈ 0.28 | 0.15 | **UNDERPOWERED by design** |
| audjpy | ≈ 89 | ≈ 0.33 | 0.15 | **UNDERPOWERED by design** |

The two crosses share the yen leg, so the cells are correlated and Holm is conservative here. Verdict words: VALIDATED if the gate holds; NULL if the CI lies inside (−0.15, +0.15); otherwise UNDERPOWERED.

## 6. Multiplicity (required)

- Scored cells: `usdjpy`, `audjpy` (Holm).
- Descriptive only: EURJPY; the raw correlation; the share of yen-offshore lending going to the UK, Singapore and Switzerland (the hedge-fund hubs); and the outcome as the quarter's largest 5-day yen gain.
- Promotion: |t| ≥ 3 plus a forward record.

## 7. What this does NOT test (required)

- The direction of USDJPY, or the timing of an unwind.
- Intraday squeeze mechanics, or positioning from COT or the IMM.
- Point-in-time BIS data (latest vintage only, so revision lookahead remains).

## 8. What each verdict changes (required)

- **VALIDATED** → ledger entry (research-only). The Desk Watch `yen-funding-build` trigger and the JPY currency note cite it as "historically bigger squeezes" with the effect size. A forward record starts. No sizing until |t| ≥ 3.
- **NULL / UNDERPOWERED** → ledger entry. The trigger and the note keep their context wording.
