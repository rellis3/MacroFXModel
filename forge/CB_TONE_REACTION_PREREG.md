# cb-tone-reaction — does the ECB / BoE / BoJ statement's hawkish shift line up with the first-30-minute move in the home currency?

**Pre-registered 2026-10-28, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `cb-tone-reaction` (the one scored cell: pooled across the three banks) |
| Branch | `claude/cb-tone-reaction` (pushed to main as it goes) |
| Register row | `plans/RESEARCH_REGISTER.md` → `cb-tone-reaction` |
| Data | Statements: ECB monetary policy statements (press conference), BoE Monetary Policy Summary and minutes, BoJ Statement on Monetary Policy, every scheduled meeting 2016-01 → 2026-08-21, fetched from the banks' own sites. Prices: 1-minute EUR/USD, GBP/USD, USD/JPY from `VolRangeForecaster/data/m1/*_m1.parquet` (UTC, 2016-01-04 → 2026-08-20). Secondary only: 10y Bund and gilt CFD prices, OANDA M1 mid, fetched per event window. Ends at the lockbox (2026-08-21); the later meetings are not scored |
| Seed | `20261028` (every script in this study) |
| Uncertainty | event bootstrap, resampling meetings within bank (meetings are ≥ 5 weeks apart, so independent), B = 2000; plus a within-bank permutation of the tone shift, 2000 shuffles |
| Scripts / outputs | `scripts/cb-tone-reaction/` → `analysis/output/cb-tone-reaction/` |
| Harness | own scripts (an event study on minute data with a text scorer; `runStudy.mjs` is built for daily trade rules) |

## 1. The claim (required)

The ECB, BoE and BoJ Sentiment pages read each statement and call it hawkish or dovish. The new Release Reaction
families (2026-10-28) show what every market did around the same meetings. The owner's question: does the read line
up with what the market did? Stated as a test: **when a bank's statement is more hawkish than its previous one, does
the home currency rise against the dollar in the first 30 minutes?**

This is a check that the read measures something (concurrent validity), not a forecast. A pass says the tone read
agrees with the market's own instant read. It does not say the read tells you anything the price hasn't already
shown.

## 2. Why it is not already settled (required)

- `cb-tone-direction` (NULL, 2026-08-20, `MD files/CB_SENTIMENT_PRICE_TEST.md`) tested the **FOMC** only. Its
  registered cell, tone shift vs the **next-day** dollar move, was null (t = −0.75). Its descriptive concurrent-validity
  cell, tone shift vs the **first 30 minutes**, was positive: lexicon t = 2.04, corr 0.22 (LLM t = 2.63), n = 81.
- That prereg said ECB/BoE/BoJ would be tested on the next-day question only if the FOMC passed; it didn't. This study
  does **not** reopen the next-day question. It asks the 30-minute question, which was never scored for any bank
  other than the Fed and was never a gated cell for the Fed either.
- Nothing in `js/deskEvidence.js`, the register, or `forge/` scores ECB, BoE or BoJ statement text against a price
  move (searched for hawk / dovish / tone / sentiment, 2026-10-28). The ECB, BoE and BoJ engines have 3-4 scored
  meetings each in production, so no LLM-score history exists to test.

## 3. Definitions, fixed in advance (required)

**The scorer.** `js/cbLexicon.js`, version `cb-lexicon-v1`, unchanged. It was frozen on 2026-08-17 for the FOMC and has
never been run on ECB, BoE or BoJ text, so it can't have been tuned to them. score = (H − D) / (H + D) over hawkish
and dovish term hits. **Tone shift** Δ = this statement's score minus the same bank's previous scored statement. No
LLM scorer (it knows what happened after each meeting, and it costs money).

Known weakness, accepted: the term lists were written for Fed statements ("target range", "the Committee's"). Some
will rarely match ECB, BoE or BoJ wording, and some will misfire (the ECB's "net asset purchases" ending in 2018 counts
dovish). That is part of what's tested.

**Coverage gate (scorer reads the bank at all).** A statement is *scored* if H + D ≥ 3. If fewer than 60% of a bank's
statements are scored, that bank's cell is UNDERPOWERED (the scorer can't read it) and the bank leaves the pooled cell.
A Δ needs both statements scored.

**Documents (one per meeting, fetched now from the original pages).**
- ECB: the monetary policy statement read at the press conference (`ecb.isYYMMDD~….en.html`), found from the year
  index `…/press/press_conference/monetary-policy-statement/<year>/html/index_include.en.html`. The decision press
  release is not scored.
- BoE: the Monetary Policy Summary and minutes page (`/monetary-policy-summary-and-minutes/<year>/<month>-<year>`;
  2016 pages are `mpc-<month>-2016`), article text only. Its published date is read from the page.
- BoJ: Statement on Monetary Policy (`/en/mopo/mpmdeci/state_<year>/kYYMMDDa.htm`, or the `mpr_<year>/kYYMMDDa.pdf`
  where only a PDF exists), dates from the year index `/en/mopo/mpmdeci/mpr_<year>/index.htm`.
- Unscheduled actions are left out: they have no comparable statement, or fall outside the clock rule (BoE March 2020
  emergency cuts, ECB 18 March 2020 and 15 June 2022). The first statement per bank only seeds Δ.

**Event clock (direction-free, from the rule, never from the sign of a move).**
- ECB: one fixed window, **13:44 → 15:15 Frankfurt**. It covers both of the ECB's schemes over the sample (decision at
  13:45 with the statement at 14:30, and the later decision at 14:15 with the statement at 14:45), up to 30 minutes
  after the statement starts.
- BoE: **11:59 → 12:30 London**. If the 07:00 London 5-minute GBP/USD true range is larger than the 12:00 one that
  day, the clock is 06:59 → 07:30 instead (2020 releases moved to 07:00). This compares sizes only, never signs.
- BoJ: no fixed time. The statement minute is the start of the largest absolute 1-minute USD/JPY move between 01:30
  and 05:30 UTC on the decision day (the Layer 1 rule). Window = that minute − 1 → + 30. Picking by size inflates
  |R0| but not its sign, so the sign test is not circular. The size is.

**Outcome.** R0 = log return of the home currency against the dollar over the window, in bp: EUR/USD for the ECB,
GBP/USD for the BoE, −USD/JPY for the BoJ (so + = home currency up). Close of the minute before the window opens to
the close of the last minute.

**Join proof (clock check).** Every event's first-5-minute true range from the event minute must be ≥ 2× the
median of the same clock window on the 20 previous weekdays with no event from this study. Pass if ≥ 90% clear it.
Events that fail are listed and stay in (dropping them would select on the outcome). If the proof fails, the clock is
wrong and the study stops before scoring.

**Sample.** 2016-01 → 2026-08-21; halves 2016-2020 and 2021-2026-08 for the stability gate.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | **Scored cell.** Pooled over the banks that pass coverage: correlation of z(Δ) with z(R0), each z within bank | **Yes, small**: corr ≈ 0.15-0.2, a bit below the FOMC's 0.22, since the lexicon was written for the Fed |
| b | Per bank (ECB, BoE, BoJ) | Descriptive. Expect the BoE strongest (its minutes give vote splits in words) and the BoJ weakest (short, formulaic statements) |
| — | **THE GATE** | Pooled corr > 0 with the bootstrap 95% interval above 0, the permutation p < 0.05 one-sided, **and** positive in both halves |
| — | **THE MIRROR** | A significantly negative pooled corr (hawkish text, currency falls) is recorded as its own finding. It is not a pass, and it would mean the lexicon misreads these banks |

Descriptive only, no pass weight:
- 10y Bund (ECB) and gilt (BoE) moves in the same window, as yields (price sign flipped).
- R1, the window end to the same clock next weekday. Not scored, because the FOMC version was null. Shown only so
  nobody re-runs it.
- Concentration: by year, without the largest 1% of |R0|, and 2023-2026 alone.
- Placebo: the same windows on the weekday before each meeting. Its pooled corr should be near 0.

## 5. Power — what this design can and cannot find (required)

Correlation test, one-sided α = 0.05, 80% power: MDE r ≈ (1.645 + 0.84) / √n.

| Cell | Planned n | Design effect | **MDE (r)** | Pass bar | Verdict |
|---|---|---|---|---|---|
| a. pooled, three banks | ≈ 240 (ECB ≈ 84, BoE ≈ 84, BoJ ≈ 84, less first meetings and unscored) | ≈ 1 (a few ECB/BoE same-day meetings; within-bank events ≥ 5 weeks apart) | **0.16** | CI above 0, both halves positive | POWERED for an effect ≥ 0.16 (FOMC 0.22) |
| a. pooled, two banks (one fails coverage) | ≈ 160 | ≈ 1 | 0.20 | same | POWERED for the FOMC-size effect, only just |
| b. per bank | ≈ 80 | 1 | 0.28 | — | UNDERPOWERED by design for a 0.22 effect: descriptive only |

**Verdict rule for cell a.** VALIDATED if the gate holds. NULL if the gate fails and the bootstrap 95% upper bound is
below the MDE (0.16 with three banks, 0.20 with two), so an effect of the size we were looking for is ruled out.
UNDERPOWERED otherwise, or if fewer than two banks pass coverage.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **One scored cell** (a, pooled). No correction. Its gate is conjunctive (interval, permutation and both halves).
- Per-bank cells (b): BH q = 0.10 over 3 with `chanceBaseline`. A bank that survives is a candidate, not a result.
- No variants. One window per bank and one scorer, as fixed above. If the clock proof fails, the study stops; it is not
  re-cut with a different window.

## 7. What this does NOT test (required)

- **Not a forecast.** The window is the reaction itself. A pass does not mean the read predicts anything after it:
  the FOMC version of that is a banked null.
- Not the live pages' LLM read. The live engines score with an LLM that has 3-4 meetings of history per bank. A pass
  says a frozen word count lines up with the market. That supports the pages' read but doesn't validate it.
- Not surprise against expectations: Δ is against the previous statement, not against what was priced.
- Not tradable, and costs are not relevant: the move is over before a text score could be computed.

## 8. What each verdict changes (required)

- **Validated** → ledger `validated` (research-only). Each Sentiment page and the Release Reaction detail say: "a
  hawkish shift in this bank's wording has lined up with the currency rising in the first 30 minutes (2016-2026, n,
  corr)". The engines stay context-only.
- **Null** → ledger `null`. The pages say the hawk/dove read has **not** lined up with the currency for this bank
  under a word count. The next step is a bank-specific lexicon on a fresh prereg (2026-09 onward are unscored meetings).
- **Underpowered** → say which: lexicon coverage (needs a bank-specific scorer) or sample size (wait for meetings
  after the lockbox).

## Amendments

### A1 — 2026-10-28 — PRE-RESULTS
Text extraction, fixed while auditing the fetched documents. No price data had been read.
- ECB: 2017-2020 pages end the statement with "We are now at your disposal for questions" followed by `* * *`, so those
  markers were added to the Q&A cut. All 85 ECB statements are now cut before the Q&A (median 1,441 words; before
  the fix, 19 pages still carried the Q&A, up to 8,000 words).
- BoJ: the HTML pages carry the site menu. The body now runs from "At the Monetary Policy Meeting held" to before
  the attendee list ("Members present" / "Others present") or the release-times footer. Statements at meetings with
  no outlook report have been very short since 2024 (61-225 words): they are real, not extraction failures, and
  mostly fall under the coverage gate (H + D < 3).
- Coverage as fetched: ECB 84 of 85 statements scored, BoE 82 of 88, BoJ 72 of 85. All three pass the 60% gate.
- ECB clock proof: the first-5-minute true range is taken at both 13:45 and 14:15 Frankfurt and the larger is used,
  for the event and for its baseline days alike (the ECB moved its decision time during the sample; size only, no sign).
- BoE's 2016 pages (11 meetings, the move from 12 to 8 meetings a year) and the March 2020 emergency cuts (no
  summary page of their own) came out of the month pages as expected: every BoE date is a Thursday.

---

## RESULTS — run <date>

*Written to `analysis/output/cb-tone-reaction/RESULTS.md`.*
