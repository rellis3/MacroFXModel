# spx-usdchf-next-day — after a strong US stock day, does USD/CHF fall the next day?

**Pre-registered 2026-11-05, before any outcome was computed on the data it will be judged on.**

| | |
|---|---|
| ID / ledger id | `spx-usdchf-next-day` (one scored question) |
| Branch | `ccr-4824155b-3im5ze` |
| Register row | `plans/RESEARCH_REGISTER.md` → `spx-usdchf-next-day` |
| Data | OANDA daily mid closes, the 17:00 New York bar (`fetchD1` in `js/volBacktestEngine.js`, the bar the lead-lag grid used), `SPX500_USD` and `USD_CHF`, plus `US30_USD` for the replication cell. **Window: the first session after 2026-08-21 onwards** (forward data; see "Why this window") |
| Seed | `20261105` (one for every script in this study) |
| Uncertainty | heteroskedasticity-robust standard error of the lag-1 cross-correlation for the scored cell; month-block (21 sessions) bootstrap, B = 2000, for the descriptive trade cell |
| Scripts / outputs | `scripts/spx-usdchf-next-day/` → `analysis/output/spx-usdchf-next-day/` |
| Harness | own script (`score.mjs`): one cross-correlation and one descriptive rule; neither harness fits a forward lag test |

## 1. The claim

From our own lead-lag grid (`js/leadLag.js`, `/api/lead-lag`, owner request 2026-11-04). It scanned 1,892 leader → follower pairs of 44 markets over 2014-03 → 2026-08-21. **No pair survived** BH 10% with both halves agreeing. The strongest cluster of near misses was the US equity indices leading USD/CHF one day later, in the opposite direction:

| Leader | r (lag 1) | halves | p (Bonferroni over 5 lags) |
|---|---|---|---|
| S&P 500 | −0.101 | −0.069 / −0.151 | 0.0019 |
| Dow | −0.097 | −0.068 / −0.145 | 0.0034 |
| Russell 2000 | −0.089 | −0.074 / −0.113 | 0.0016 |

The claim: **a US equity up-day is followed by a USD/CHF fall the next day (and a down-day by a rise).** One mechanism: a risk-on day in New York is read the next morning by Europe and Switzerland, and the franc reprices then, a day after US stocks. That is a story, not evidence.

**Exploratory looks already taken, all on data to 2026-08-21 (owner request, 2026-11-04):**
- the quick test (`/api/research-pod/quick-test`, stored), which skips the day after the signal: NULL at 2, 3 and 6 days after;
- the same test with no skipped day, first 60% of days (2007 → 2019-03) against the last 40% (2019-03 → 2026-08):

  | | 2007 → 2019 | 2019 → 2026 |
  |---|---|---|
  | S&P, next day | d −0.05 (p 0.51) | d −0.28 [−0.42, −0.11] |
  | Dow, next day | d −0.01 | d −0.27 |
  | Russell, next day | d −0.04 | d −0.16 |

So the effect is **present since 2019 and absent before**. It was found by scanning, so every number above is selection-biased upward. Only data the scan never saw can judge it.

## 2. Why it is not already settled

- `spread-leads-fx-hours` (NULL) and `yields-to-fx-direction` (RE-RUN) are rates → FX leads, not equities → FX.
- The FOMC-next-day entry (statement tone → next-day dollar, NULL) concerns events, not daily equity moves.
- No ledger entry tests equity returns → next-day FX. This is not a re-run of a banked null.

## 3. Definitions, fixed in advance

- **Leader** `a_t` = log(SPX500 close_t / close_{t−1}), on the 17:00 New York daily bar.
- **Follower** `b_{t+1}` = log(USDCHF close_{t+1} / close_t), on the same bar and clock. Both closes are known at 17:00 New York on their own day, so there is no clock offset: the leader is fully known one full session before the follower's window opens.
- **Sessions:** weekday bars present for both markets. A day missing for either market is dropped, and the pair (t, t+1) must be consecutive sessions of the common calendar.
- **Scored statistic:** the Pearson correlation `r = corr(a_t, b_{t+1})` over the window, with the heteroskedasticity-robust standard error `se = sqrt(Σ u_t² v_{t+1}²) / sqrt(Σ u_t² · Σ v_{t+1}²)` (u, v demeaned). This is exactly `xcorr(a, b, 1)` in `js/leadLag.js`. `z = r / se`, one-sided p = Φ(z), because the sign (negative) is fixed here.
- **Controls (reported, not scored):**
  - lag 0 (same day; context only);
  - lag 2 (the time-shift control: it should be near zero if the effect is a one-day lead);
  - the mean of lags 3–5.
- **Replication cell (descriptive):** the Dow (`US30_USD`) in place of the S&P.
- **Descriptive trade cell:**
  - Threshold: a walk-forward 80th / 20th percentile of `a_t` from the 250 sessions before t (from OANDA history before the window, so it is available from the first session).
  - Rule: short USDCHF close_t → close_{t+1} after a top-quintile S&P day, long after a bottom-quintile day.
  - Cost: 2 pips round trip, net.
  - Reported: mean per trade with a month-block bootstrap 95% interval (seed above), trade count and hit rate.
- **Window:** every session from the first session after 2026-08-21 to the judgement date.

**Why this window.** No statistic linking the S&P (or any index) to USDCHF has been computed on any session after 2026-08-21. The grid and the quick tests cut at the lockbox. The lockbox itself (`forge/LOCKBOX_PROTOCOL.md`) reserves those sessions only for layers 3, 5 and 6 (the ladder, remaining-travel and confidence models), so this study can use them. About 53 sessions (2026-08-24 → 2026-11-04) were already in the past at registration, but unseen for this question. Everything after is forward.

## 4. Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| H1 | r(S&P_t, USDCHF_{t+1}) < 0 on the window | **Yes, weakly:** r ≈ −0.05 to −0.09, if the post-2019 regime persists; the full 2007–2026 estimate was −0.045 (quick test, all days) |
| — | **THE GATE**, judged once at **N ≥ 765 usable sessions**: one-sided p < 0.05 **and** r ≤ −0.05 **and** the lag-2 control has \|r\| < 0.05 | |
| — | **THE MIRROR** is built in: the correlation uses down-days and up-days alike, and the descriptive rule trades both sides | |
| — | **Futility look**, once, at N = 500: if r > 0 (the wrong sign), close as NULL early. If the true r is −0.09, P(r > 0 at N = 500) ≈ 2%. No early stop for success | |

## 5. Power

The MDE of a correlation at 80% power, one-sided α = 0.05, is (1.645 + 0.842) / √N (the robust SE is close to 1/√N here). The control sample is USDCHF's daily SD 2019-03 → 2026-08: 0.477%, n = 1,946. That SD is used only for the descriptive trade cell.

| Cell | Planned N | MDE (\|r\|) | Pass bar | Verdict |
|---|---|---|---|---|
| H1 at 250 sessions (~Aug 2027) | 250 | 0.157 | 0.05 | UNDERPOWERED (not judged) |
| H1 at 500 sessions (~Aug 2028), futility only | 500 | 0.111 | — | futility look |
| **H1 at 765 sessions (~Aug 2029)** | **765** | **0.090** | **r ≤ −0.05, p < 0.05** | **POWERED for the in-sample size (0.09), not for half of it** |

Read it plainly: the study can confirm an effect as large as the in-sample one. If the true effect is the full-history −0.045, it will most likely come back UNDERPOWERED, not NULL, because MDE 0.09 > 0.045. The trade cell is far from powered: about 1,900 sessions would be needed to see 0.045% a trade against a 0.48% SD. It is description only.

## 6. Multiplicity

- **Scored cells:** one (H1 at N ≥ 765). No correction needed.
- The replication and trade cells are descriptive and carry no pass/fail weight.
- **Selection:** the hypothesis was chosen from 1,892 scanned pairs. That is why it is judged only on data the scan never saw, with its sign fixed. The pass bar is not lowered by the scan, and it is not raised either, because the forward data is independent of the selection.
- **Promotion to anything live** (a desk input, a bot) needs |t| ≥ 3 on the forward window, about 1,100 sessions at r = −0.09. A pass at |t| ≥ 1.645 is a research-only `validated`.

## 7. What this does NOT test

- **Tradability.** The trade cell is description; a pass on H1 is not a strategy.
- **Cause.** Whether the franc reprices on the European open, or whether it is the dollar side, is not tested.
- **Other pairs.** USDJPY, EURCHF and CHFJPY are not tested. A pooled "safe-haven FX" version would be a different study.
- **Intraday timing.** When in the next session the move happens is not tested.
- **The 2007–2019 absence.** This study does not explain why the effect was absent before 2019.

## 8. What each verdict changes

- **VALIDATED** (research-only):
  - a ledger entry;
  - the lead-lag panel names it as a forward-confirmed lead;
  - nothing reaches the desk until |t| ≥ 3.
- **NULL** (gate failed while powered, or the futility stop):
  - a ledger entry;
  - the near miss is labelled closed on the Pair and lead-lag panels, and the stocks → franc story is not used.
- **UNDERPOWERED:**
  - a ledger entry;
  - the pair stays a near miss;
  - re-judge only with a new prereg that pools a pre-registered family (e.g. US equities → CHF and JPY pairs).

## Amendments

*(none)*

---

## RESULTS — run <YYYY-MM-DD>

*Written to `analysis/output/spx-usdchf-next-day/RESULTS.md` when judged. Nothing above this line changes after a run.*
