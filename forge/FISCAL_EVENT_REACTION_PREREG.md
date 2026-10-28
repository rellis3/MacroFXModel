# fiscal-event-reaction — Do UK Budgets and US Quarterly Refundings move bonds more than an ordinary day, and does more supply mean higher yields?

**Pre-registered 2026-10-28, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `fiscal-event-reaction` (scored cells S1, S2, D1, D2 below; one ledger entry per cell: `fiscal-reaction-uk-size`, `fiscal-reaction-us-size`, `fiscal-reaction-uk-direction`, `fiscal-reaction-us-direction`) |
| Branch | `claude/fiscal-event-reaction` (pushed to main) |
| Register row | `plans/RESEARCH_REGISTER.md` → `fiscal-event-reaction` |
| Data | OANDA mid M1 (`price=M`): UK10YB_GBP (10y gilt CFD), GBP_USD, UK100_GBP; USB02Y_USD, USB10Y_USD, USB30Y_USD. Events 2008-01 → 2026-08-21 (lockbox: the 2026-10-28 Budget and the 2026-11-04 refunding are shown on the site, never scored) |
| Event lists | UK: every Budget / Autumn Statement / Spring Statement / Spring Forecast with an OBR outlook, dates from the obr.uk EFO sitemap (2010-06-22 → 2026-03-03), plus the 2022-09-23 Growth Plan and the 2022-10-17 emergency statement (flagged `unscheduled`). US: every quarterly refunding policy statement 2008 Q1 → 2026 Q3 from the Treasury "Official Remarks on Quarterly Refunding" archive (74), date from the press release |
| Seed | `20261028` |
| Uncertainty | events are months apart, so an iid bootstrap over events, B = 2000 |
| Scripts / outputs | `scripts/fiscal-event-reaction/` → `analysis/output/fiscal-event-reaction/` and `backfill/fiscal_history.json` (the site's history table) |
| Harness | own script: the unit is an event window on bond CFDs, which neither `runStudy` nor `study.mjs` loads |

## 1. The claim

The site now reads each UK fiscal event and US refunding when it lands (`fiscal-events.html`). Whether those reads matter depends on two things. **Size:** do these events move bonds more than the same clock window on an ordinary day? **Direction:** when the event adds supply (more gilt sales than planned, bigger US coupon auctions), do yields rise?

## 2. Why it is not already settled

- `event-impact-map` (validated) and `priced-in-direction` (null) in the Evidence Book come from `MD files/EVENT_RESPONSE_BOOK.md`. That book covers calendar releases with a headline number. Budgets and refundings have no headline number, so they were never in it.
- `cb-tone-direction` (null) is central-bank tone, not fiscal supply.
- There is no Evidence Book, forge, plans or register entry on budgets, gilt remits or refunding (grepped 2026-10-28). The house prior from those books is that size replicates and direction is a coin flip. D1 and D2 test whether supply news is the exception, because it is a quantity change rather than a tone.

## 3. Definitions, fixed in advance

- **t0, UK:** the start of the Chancellor's statement, London clock. 12:30 for Wednesday events. Exceptions, set by hand from the record:
  - 2018-10-29 (Monday): 15:30.
  - 2022-09-23 (Growth Plan): 09:30.
  - 2022-10-17 (emergency statement): 11:00.
  - 2022-11-17 (Autumn Statement, Thursday): 11:00.
  - 2025-11-26: 11:40, when the OBR outlook was published early.
  - Tuesday and Thursday statements (2010-06-22, 2011-11-29, 2013-12-05, 2018-03-13): 12:30.
- **t0, US:** 08:30 New York on the policy-statement date. Before 2009 the statements came with a press conference later in the morning; the window covers both.
- **Window:** UK [t0 − 5 min, t0 + 180 min], which covers the speech, the Red Book and the OBR outlook. US [t0 − 5 min, t0 + 90 min].
- **Move:** the last M1 close at or before the window end, minus the last M1 close at or before the window start, as % of the start price. For bond CFDs the yield move is approx. bp = −move% × 100 / D, with D = 8.5 (UK 10y), 1.9 / 8.0 / 17 (US 2y / 10y / 30y), as in `js/yieldLegs.js`. Shown on the site only; the ratios do not depend on D.
- **Control days:** the same weekday and the same local clock window on the 8 preceding weeks. A control day is dropped if it is itself an event in either list or has fewer than 30 minutes of M1 in the window. An event needs ≥ 4 control days, or it is dropped (counted).
- **Size ratio** per event: |move_event| / median(|move_control|). The statistic is the geometric mean of the ratio across events, with a bootstrap 95% CI.
- **UK supply change (D1):** the Red Book's gilt-sales change for the remit year ("an increase / a reduction of £X billion"), extracted by `extractRedBook` in `js/fiscalEvents.js`. Older wordings may get added patterns, validated on the document text only, before any price is joined. Events with no extractable change are excluded and counted.
- **US coupon-size change (D2):** +1 / 0 / −1 per policy statement: nominal coupon auction sizes increased / unchanged / reduced at this refunding. Coded by regex on the statement, and every ±1 row is printed with its sentence and checked by hand before prices are joined.
- **Yield move for D1/D2:** UK 10y and US 10y approx. bp in the window (sign = −price move).

## 4. Hypotheses, expectation first

| Cell | Hypothesis | Expectation | THE GATE (pass) | THE MIRROR (fail looks like) |
|---|---|---|---|---|
| S1 | UK gilt 10y size ratio > 1 on scheduled events | ~1.5× (gilts trade the remit and the OBR's numbers) | geometric-mean ratio CI lower > 1, Holm p < 0.05 | CI spans 1: the read is narrative, not a market event for gilts |
| S2 | US 10y size ratio > 1 on refunding statements | ~1.2× (most refundings are no-change; 2023-24 were not) | as S1 | as S1 |
| D1 | Spearman ρ(UK supply change, 10y bp) > 0 | small positive | ρ CI excludes 0 with ρ > 0, Holm p < 0.05 | ρ ≈ 0: supply size doesn't set direction on the day |
| D2 | Spearman ρ(US coupon change, 10y bp) > 0 | small positive, concentrated in 2023-24 | as D1 | as D1 |

Disaggregation, described only (BH q = 0.10, never promoted to results):
- GBP/USD and FTSE 100 size ratios;
- US 2y/30y size ratios;
- each size cell with and without the two unscheduled 2022 UK events;
- the range ratio (high − low in the window).

## 5. Power — what this design can and cannot find

| Cell | n (expected) | Assumed SD | MDE (80% power, α 0.05) | Verdict if CI spans the bar |
|---|---|---|---|---|
| S1 | ~33 scheduled | log-ratio SD ≈ 0.8 (event-book families) | ratio ≈ 1.48× | UNDERPOWERED unless CI upper < 1.48 (then NULL) |
| S2 | 74 | 0.8 | ratio ≈ 1.30× | UNDERPOWERED unless CI upper < 1.30 (then NULL) |
| D1 | ≤ 33, likely ~20 with an extractable change | — | ρ ≈ 0.55 (n 20) – 0.47 (n 33) | UNDERPOWERED by design if n < 30; fewer than 15 rows = not scored |
| D2 | 74, of which ~10–15 non-zero | — | ρ ≈ 0.32 | UNDERPOWERED if CI includes both 0 and 0.32 |

D1 is expected to be UNDERPOWERED. It is registered so that it is counted.

## 6. Multiplicity — how many cells, and the corrected bar

Four scored cells, Holm α = 0.05. No variants: the windows, D and the control rule above are the only ones run. Any later change goes in Amendments, and a post-hoc change can only demote.

## 7. What this does NOT test

- Whether a model read (stance / supply / credibility) predicts the move. There are too few reads, and they would be written after the fact.
- Expectations: no dealer-survey surprise. "Change vs previous plan" is not "change vs expected".
- Overnight or next-day drift.
- Any trade.

## 8. What each verdict changes

- **S1/S2 VALIDATED:** the Fiscal Events page and the event page carry "moves gilts / Treasuries ~N× an ordinary day" as size context, like the Event Response Book.
- **NULL/UNDERPOWERED:** the page says the read is context, not a market mover.
- **D1/D2 VALIDATED:** the supply chip may say "more supply has meant higher yields on the day, N of M".
- **Otherwise:** no direction wording, as for every other event.

## Amendments

### A1 — 2026-10-28 — PRE-RESULTS
No price had been fetched or joined when this was written.
- **US coupon-size coding is by hand, not regex.** The regex in §3 missed the known 2018 and Aug/Nov 2023 increases and counted guidance ("may decide to") as change. The codes are in `US_COUPON_CODES` in `scripts/fiscal-event-reaction/extract.mjs`, one quoted sentence per ±1 row, and the script checks each quote appears verbatim in its statement. Rule: ±1 only when the statement announces larger or smaller nominal coupon auctions, or a new coupon tenor, for the coming quarter. Retrospective description and medium-term guidance are 0. Result: 13 × +1, 10 × −1, 52 × 0.
- **US n is 75, not 74.** 2008 Q1 to 2026 Q3 is 75 statements.
- **UK supply change.** Red Book patterns were added for the 2010–2024 wordings ("Planned gilt sales in … will be reduced by £X billion", "Total gilt sales … are now forecast to increase by £X billion", "an increase in gross gilt issuance this year of £X billion", "gross gilt issuance is projected to rise by £X billion", "additional gilt sales of £X billion", "gilt issuance (a decline of £X billion"). Where the document has no in-year revision (spring Budgets set a new remit; several statements left the revision to a separate DMO notice, and dmo.gov.uk is bot-shielded), the row is excluded. That leaves 13 scheduled, pre-lockbox rows with a revision: below the §5 floor of 15, so **D1 is not scored and is UNDERPOWERED by design**. The rows are shown as description only.

## RESULTS — not yet run
