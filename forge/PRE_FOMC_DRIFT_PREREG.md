# pre-fomc-drift — do US equity index futures still rise in the 24 hours before a scheduled FOMC announcement?

**Pre-registered 2026-10-26, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `pre-fomc-drift-nq` |
| Branch | `ccr-42a42ec1-xka4ex` |
| Register row | `plans/RESEARCH_REGISTER.md` → `pre-fomc-drift` |
| Data | NAS100 CFD M15 (`analysis/output/rate-surprise-events/m15/NAS100_USD.parquet`, 2009-11 → 2026-08-21) for all 99 scheduled FOMC decisions 2014-01-29 → 2026-06-17 in `calendar_events.csv` (the unscheduled 2020-03-03 and 2020-03-15 are excluded). SPX500 M15 (`analysis/output/rates_residual/m15/SPX500_USD.parquet`, 2018 →) descriptive only. Nothing after 2026-08-21 is read |
| Seed | `20261026` |
| Uncertainty | events resampled iid (6+ weeks apart); control windows resampled in moving blocks of 21 weekdays; B = 2000. Placebo: 10,000 draws of n control windows |
| Scripts / outputs | `scripts/cb-meeting-drift/pre_fomc.py` (shares loaders with `cb-meeting-drift`) → `analysis/output/pre-fomc-drift/` |
| Harness | own script (an intraday clock tied to the announcement) |

## 1. The claim

Lucca & Moench (2015), *The Pre-FOMC Announcement Drift*, Journal of Finance 70(1): the S&P 500 rose about 49 bp on
average in the 24 hours before scheduled FOMC announcements (1994–2011). That was a large share of the equity premium
over the period, and there was no comparable move afterwards. Later work reports that the effect weakened after the
paper's sample. Named in `plans/DIRECTION_RESEARCH_PROGRAMME.md` as P2.

## 2. Why it is not already settled

- `post-fomc-usd-drift` (validated) is the **after** window, and in the dollar.
- `vol-crush-drift` (null) is the session **after** a Fed/CPI day on which VIX fell 5%+.
- `fomc-leadup-surprise-table` (context) conditions on the long end's move into the meeting and the surprise. It
  scores the five sessions after, not the 24 hours before.
- `rates-vol-gap`, `rate-surprise-events`: data releases, not FOMC lead-ins.

None scores the pre-announcement window in equities. This is not a re-cut.

## 3. Definitions, fixed in advance

- **The setup.** Each scheduled FOMC decision day D. All 99 are stamped 14:00 ET (18:00/19:00 UTC) in the calendar.
- **The window.** From the price known at **14:00 ET on weekday D−1** to the price known at **13:45 ET on D**. That
  is 15 minutes before the statement, so no announcement information enters. "Known at t" means the close of the M15
  bar stamped t − 15 min (bars are stamped at their open; checked on the FOMC spike).
- **The outcome.** The log return of NAS100 over the window, in bp.
- **The control.** The same clock window (14:00 ET weekday d−1 → 13:45 ET d) for every weekday d, 2014-01 →
  2026-08-12, that isn't within −2..+2 weekdays of a scheduled FOMC decision.
- **The statistic.** Event mean minus control mean (bp). This removes the index's ordinary drift.
- **Instruments.** NQ scored. SPX descriptive (only 67 meetings since 2018).
- **Halves.** 2014-01 → 2019-12 and 2020-01 → 2026-06.

## 4. Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| H1 | Does NQ rise more in the 24 hours before a scheduled FOMC statement than in the same clock window on other days? | **Weak yes or null.** The paper's 49 bp is unlikely to have survived at full size. Prior about 35% for a pass |
| GATE | (i) bootstrap 95% interval of event − control excludes 0 on the positive side; (ii) event mean above the 95th percentile of 10,000 placebo means (one-sided); (iii) event − control positive in both halves. All three | |
| MIRROR | a significant fall before FOMC | reported; banked as `context` only, needs its own prereg |

**Descriptive only:** SPX; the post-statement window 14:00 → 16:00 ET D; the window two days earlier (14:00 ET D−2 →
13:45 ET D−1); by year; with the 3 largest events removed; win rates; a 1-point NQ round-trip cost.

## 5. Power

| Cell | n events | n control | Control SD | Design effect | MDE (80%, α 0.05 two-sided) | Pass bar | Verdict |
|---|---|---|---|---|---|---|---|
| H1 NQ | 99 | 2,715 | 122 bp | 1 | **34.9 bp** | statistical gate, §4 | **POWERED** for the paper's 49 bp; not for a drift under ~35 bp |
| SPX (descriptive) | 67 | 1,853 | 110 bp | 1 | 38.4 bp | — | descriptive |

**Verdict rule for a miss.** `NULL` only if the upper 95% bound of event − control is below **+20 bp** (under about
40% of the paper's size). Otherwise `UNDERPOWERED`.

## 6. Multiplicity

One scored cell (H1 NQ): no correction. SPX and the extra windows are descriptive. Promotion to a live rule needs
|t| ≥ 3 or a forward record.

## 7. What this does NOT test

- Not why: the paper's explanation (resolution of uncertainty, risk premia) isn't tested.
- Not tradability: CFD financing and spread are an afterthought only.
- Not 1994–2013: the decision calendar here starts in 2014.
- Not FX or bonds before FOMC.

## 8. What each verdict changes

- **Pass** → `validated` (research-only below |t| 3): "NQ has risen +x bp more than usual in the 24 hours before Fed
  statements". It joins the rules book as a calendar tilt with a forward record, then gets a costed prereg.
- **Null** → banked: the pre-FOMC drift is gone in this market since 2014. Pages don't cite the paper as a live
  effect.
- **Underpowered** → banked. The next step would be the 1994–2013 dates (Fed website) on longer NQ history.

---

## RESULTS — run <date>

*Written to `analysis/output/pre-fomc-drift/RESULTS.md`.*
