# cb-meeting-drift — does the currency drift over the five days after an ECB or BoE decision, as the dollar does after the FOMC?

**Pre-registered 2026-10-26, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `cb-meeting-drift-own` (H1), `cb-meeting-drift-continue` (H2) |
| Branch | `ccr-42a42ec1-xka4ex` |
| Register row | `plans/RESEARCH_REGISTER.md` → `cb-meeting-drift` |
| Data | EURUSD M15 (`analysis/output/rate-surprise-events/m15/EUR_USD.parquet`) for ECB decisions 2014-01-09 → 2026-06-11; GBPUSD M15 (`analysis/output/rates_residual/m15/GBP_USD.parquet`, starts 2018-01) for BoE decisions 2018-02-08 → 2026-06-18. Decision dates and UTC times from `calendar_events.csv` (it covers USD/EUR/GBP only and ends 2026-07-02). Nothing after 2026-08-21 is read |
| Seed | `20261026` |
| Uncertainty | events resampled by calendar week (one bank's windows are ≥ 5 weeks apart; a same-week ECB and BoE pair moves together); control windows overlap, so they are resampled in moving blocks of 21 weekdays; B = 2000. Placebo: 10,000 draws of n control windows |
| Scripts / outputs | `scripts/cb-meeting-drift/` → `analysis/output/cb-meeting-drift/` |
| Harness | own script: the event clock (16:00 London, decision-specific dates) isn't expressible in `runStudy` |

## 1. The claim

From `plans/DIRECTION_RESEARCH_PROGRAMME.md` (P1). The one validated directional base rate in the repo is
`post-fomc-usd-drift`: the dollar basket rose +26bp on average over the five sessions after an FOMC decision, positive
65% of the time against 49% on other days. The placebo put it at the 99.8th percentile, and it held in both halves.
The question here is whether the same thing happens after the other two decisions we hold dates for: **does the euro
drift up after an ECB decision, and sterling after a BoE decision, over the following five sessions?**

## 2. Why it is not already settled

- `post-fomc-usd-drift` (validated) covers FOMC only, with the USD as the meeting currency. Nothing in the Evidence
  Book tests the post-meeting window for any other bank.
- `cb-tone-direction` (null) tested whether the FOMC *statement's tone* or the first 30-minute reaction predicts the
  next-day dollar. H2 here (continuation of the decision-day move) is the nearest relative. It differs in bank (ECB,
  BoE), in horizon (D+1..D+5, not next day) and in the reaction window (to 16:00 London, after the ECB press
  conference). It is not a re-run: it asks whether the day's reaction keeps going over a week, for banks never tested.
- `surprise-size` (validated) and `event-impact-map` are range results, not direction.
- `rate-surprise-events` asks about the size and fade of US data surprises, not central-bank meetings.

## 3. Definitions, fixed in advance

- **The setup.** Every scheduled ECB / BoE rate decision in the data window. The time comes from
  `calendar_events.csv` `datetime_raw` (UTC). The decision day D is the London calendar date. The BoE's two
  unscheduled emergency decisions (2020-03-11, 2020-03-19) are excluded. 2020-05-07, 2020-08-06 and 2020-11-05 were
  scheduled 07:00 London releases. They stay in, and their H2 reaction window starts at the price known 15 minutes
  before the stamped time instead of at 12:00. (Calendar fault noted 2026-10-26: summer 2014–2015 ECB/BoE stamps are
  one hour late. No rule here depends on the stamped minute after 12:00 London, so it doesn't matter.)
- **Knowable when?** The window opens at **16:00 London on D**. That is after the BoE release (12:00 London) and after
  the ECB press conference (which starts 45 minutes after the decision and runs about an hour). The price is the last
  M15 close known at that minute: bars are stamped at their open (checked: the FOMC spike lands in the bar stamped at
  the release minute), so "known at t" means the bar stamped t − 15 min.
- **The outcome.** The log return of the own currency against USD, 16:00 London D → 16:00 London on weekday D+5:
  EURUSD for ECB, GBPUSD for BoE. Units bp.
- **H1 sign.** Fixed: own currency up (+). That is the direct analogue of the FOMC result, where the meeting currency
  rose.
- **H2 sign.** The sign of the decision-day reaction, from the price known at 12:00 London to 16:00 London on D, times
  the D+1..D+5 outcome. Positive means continuation. Every decision in the sample is stamped at or after 12:00 London
  (BoE 12:00, ECB 12:45 or 13:15 London), and the 12:00 price is the bar stamped 11:45, so it is pre-release.
- **Instruments.** EURUSD (ECB), GBPUSD (BoE), reported separately and pooled. No basket.
- **The control.** The same 16:00 → 16:00+5-weekday window started on every weekday that isn't within −1..+5 weekdays
  of a decision by the same bank. Same pair, same span (EURUSD 2014-01 →, GBPUSD 2018-01 →), last start 2026-08-12 so
  every window ends by 2026-08-21. For H2 the control signal is the sign of the same-clock move (12:00 → 16:00 London) on
  the control day, times the following 5-day return.
- **The statistic.** Event mean minus control mean (bp). For H2: mean of sign × outcome, event minus control.
- **De-clustering.** None needed: decisions of one bank are at least five weeks apart. A pooled ECB and BoE window can
  overlap when both meet in the same week. They stay in, and the event bootstrap resamples by calendar week so
  same-week ECB and BoE windows move together.
- **Sample and halves.** Pooled split at 2020-07-01: H1 first half 2014-01 → 2020-06, second half 2020-07 → 2026-06.

## 4. Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| H1 | Pooled ECB + BoE: does the own currency rise more over D+1..D+5 than in control windows? | **Null.** The FOMC drift has no agreed mechanism, and the published post-meeting evidence is FOMC-specific. Prior about 20–25% |
| H2 | Pooled: does the decision-day reaction continue over D+1..D+5 more than a same-clock move on control days? | **Null.** `cb-tone-direction` found the FOMC reaction priced inside 30 minutes. Prior about 20% |
| GATE (each of H1, H2) | (i) bootstrap 95% interval of event − control, Holm-adjusted across H1/H2 (α = 0.025 for the smaller p), excludes 0 on the registered positive side; (ii) event mean above the 95th percentile of the 10,000 placebo means (one-sided, registered sign); (iii) positive in both halves. All three | |
| MIRROR | H1 with the opposite sign (own currency falls) | reported. A two-sided Holm pass on the negative side is banked as `context` and needs its own prereg; never `validated` here |

**Descriptive only (no pass/fail weight):** per bank; win rates; median; the same windows excluding any that contain an
FOMC decision; 1.5-pip round-trip cost as an afterthought; by year.

## 5. Power

Control SDs measured on control windows only (no decision window read), 2014+ / 2018+:

| Cell | n events | n control | Control SD | Design effect | MDE (80%, α) | Pass bar | Verdict |
|---|---|---|---|---|---|---|---|
| H1 pooled | 174 | 4,281 | 111 bp | 1 | **26.5 bp** (α = 0.025, two-sided) | statistical gate, §4 | **POWERED** for an FOMC-sized drift (+26 bp); not for anything much smaller |
| H1 ECB (descriptive) | 104 | 2,538 | 107 bp | 1 | 29.9 bp (α = 0.05) | — | descriptive |
| H1 BoE (descriptive) | 70 | 1,743 | 115 bp | 1 | 39.4 bp | — | descriptive |
| H2 pooled | 174 | 4,281 | ≈ 111 bp (\|outcome\|, same scale) | 1 | ≈ 26.5 bp | §4 | POWERED for the same size |

**Verdict rule for a miss.** `NULL` only if the upper 95% bound of event − control is below **+15 bp**, which rules
out a drift above about half the FOMC size. Otherwise `UNDERPOWERED`.

## 6. Multiplicity

- Scored cells: H1 pooled, H2 pooled. **Holm at α = 0.05** across the two.
- Disaggregation: per bank × {H1, H2} = 4 cells, reported with Benjamini–Hochberg at q = 0.10 and their chance
  baseline. A surviving slice is a candidate for its own prereg, never a result.
- Promotion bar: anything that sizes a position needs |t| ≥ 3 or a forward record.

## 7. What this does NOT test

- Not tradability: no financing, and costs are only an afterthought.
- Not the cause: a pass says the window drifts, not why.
- Not BoJ, RBA, RBNZ, BoC or SNB. Their dates aren't in this checkout; they need their own extension.
- Not the decision-day reaction itself (D0), which is priced within the hour (`cb-tone-direction`).
- Not 2014–2017 for the BoE: no GBPUSD M15 before 2018 here.

## 8. What each verdict changes

- **Pass (H1)** → `validated` (research-only below |t| 3). The base rate is generalised: "after an ECB / BoE decision
  the own currency has drifted +x bp over five sessions". It is added to the rules book (P8) as a calendar tilt with a
  forward record, and extended to the other five banks.
- **Pass (H2)** → `validated`, research-only: the decision-day move tends to continue for a week. Its own costed prereg
  follows.
- **Null** → banked. The FOMC drift is FOMC-specific: pages describe it as a Fed effect only and never generalise it to
  "central-bank meetings".
- **Underpowered** → banked. The extension needs more banks (BoJ/RBA/BoC/SNB/RBNZ dates) to pool, which is the next
  step.

---

## RESULTS — run <date>

*Written to `analysis/output/cb-meeting-drift/RESULTS.md`.*
