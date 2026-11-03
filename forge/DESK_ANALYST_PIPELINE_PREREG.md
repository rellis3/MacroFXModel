# desk-analyst-pipeline — Does the desk's morning book call the day's direction better than chance, a single prompt and drift?

**Pre-registered 2026-11-03, before any outcome was computed.** No desk card has been scored against any price. The
scoring code is written after this file is pushed.

| | |
|---|---|
| ID / ledger id | `desk-analyst-pipeline` (one scored question, H1; H2-H5 are secondary cells under BH) |
| Branch | `ccr-4824155b-3im5ze` |
| Register row | `plans/RESEARCH_REGISTER.md` → `desk-analyst-pipeline` |
| Data | Forward only. The 41 desk instruments (`js/deskPack.js` `DESK_UNIVERSE`), OANDA M1 mid (`price=M`), London sessions from **2026-11-04**. Every scored date is after the lockbox date (2026-08-21) and after the system existed, so no parameter of the desk was fitted on any scored date. This test fits nothing and does not touch the H-A evaluation. |
| Seed | `20261103` (placebo shuffles and bootstrap, every script) |
| Uncertainty | Circular block bootstrap over London sessions, block 21 sessions, B = 2000 (`stats-defaults.md`). Cards are never resampled on their own: one day is one observation |
| Scripts / outputs | `js/deskScore.js` (pure scoring, tested in `js/deskScore.test.mjs`); daily rows saved by the server in KV `desk_run_score_<date>`; the verdict script `scripts/desk-analyst-pipeline/verdict.mjs` → `analysis/output/desk-analyst-pipeline/` |
| Harness | Own code. The unit is a forward daily book with its own price lines, which `runStudy` and `study.mjs` do not model |

## 1. The claim (required)

The pipeline (`plans/DESK_ANALYST_PIPELINE.md`) runs 11 analysts, a top-down debate (global, then currency, then
asset), a risk desk and a Head of Desk on the morning's Desk Pack. It writes one card per instrument on a five-step
scale (STRONG_LONG, LONG, FLAT, SHORT, STRONG_SHORT), with a size after a per-currency exposure cap. The owner wants
it to help "predict days". The claim tested is the plainest version: **on days when the book is written before
08:00 London, the direction of its cards, weighted by their size, beats chance over 08:00 to 21:00 London.**

## 2. Why it is not already settled (required)

- The Evidence Book holds many direction nulls on price-pattern inputs (the direction-bar programme; `day-recon-path-book`
  hard stop; `v3-p50-follow-pre2020` NULL). None tests a language-model synthesis of the whole desk.
- The forward ledger (`evidence_memory` feed) shows the desk's older single-signal calls at a 0.431 one-day hit rate
  (n = 420). That is a different system, the engine leans, not this book.
- So this is not a re-run of a banked null. It is the first test of the multi-agent book, and the prior from the
  repo's own direction record is **sceptical**: the expectation below is null.

## 3. Definitions, fixed in advance (required)

- **Eligible day.** A London weekday with a saved desk run whose `finishedAt` is before **08:00 London** on its own
  date, `mode = full` and `head.ok`. A run finished later (a manual run in the day) is scored and shown but is
  **not** in any scored cell, because it has seen part of the outcome window. If a date has several runs, the
  earliest eligible one counts.
- **Live card.** A card rated LONG or STRONG_LONG (direction +1) or SHORT or STRONG_SHORT (direction −1), with
  `levels` (open, up.p50, down.p50) present. FLAT and REVIEW cards carry no direction and are not scored.
- **Unit (u).** The day's own forecast scale for that instrument: u = ((up.p50 − open) + (open − down.p50)) / 2,
  from the card's `levels` (the vol forecast's O→H / O→L p50 lines in price, written before the run). Known at the
  run, no lookahead.
- **Entry and exit.** Entry = the open of the first M1 bar at or after 08:00 London. Exit = the close of the last M1
  bar before 21:00 London. Both inside the `london22` research window (data-rules item 1). A card with no M1 bar
  in either minute window (instrument closed, feed gap) is **recorded as missing and counted**, never dropped
  silently (data-rules item 6).
- **Card score.** R = direction × (exit − entry) / u, clipped to [−3, +3].
- **Day score (primary).** S = Σ sizeᵢ·Rᵢ / Σ sizeᵢ over the day's live cards with size > 0. Size is the Head of
  Desk's size after the exposure cap. A day with no live sized card has no S and is not counted (recorded).
- **Costs.** None in the primary. This scores a forecast, not a trade (§7). A cost-on version (half the OANDA spread
  each way, in u) is reported, not scored.
- **Controls.**
  - **Shuffle placebo.** For each day, the live cards' directions are permuted across that day's cards, keeping the
    count of longs and shorts and the sizes. 2000 shuffles per day. Each shuffle keeps the day's market moves and
    the book's net tilt. It removes only which market got which sign.
  - **Single-prompt control (H2).** On the same morning, one model call (same model tier as the Head, the same pack
    read in one 60 k-character slice, the same card schema) writes its own 41 cards. Role file
    `desk/roles/control_single.md`, written before this test starts and frozen except for amendments.
  - **Drift (H5).** "Long every instrument the desk has a live card on, equal weight", the same window.
- **Sample.** Every eligible day from 2026-11-04. Halves for the stability gate: the first and second half of the
  eligible days at the judgement date, split by date.
- **What may change during the window.** The owner may edit role files and prompts as he reads the book. Every run
  records `rolesHash` (SHA-1 of all role files) and the model of each call. The test scores **the desk as operated**,
  and the verdict reports the result by roles hash as description. A change to the card scale, the universe or the
  eligibility time is an amendment, written before the next scored day.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| H1 | Mean day score S̄ > 0 (the scored cell) | **Null.** The repo's direction record says direction rarely survives |
| H2 | Desk minus single-prompt control, both scored **unweighted** (mean of direction × R over live cards, sign only), paired by day: mean difference > 0 | **Null** |
| H3 | Conviction: mean R of STRONG cards minus mean R of the other live cards, day-clustered: > 0 | **Null** |
| H4 | Race: among live cards where price touches entry + u or entry − u before 21:00, share where the lean-side line is touched first > 50% (day-clustered) | **Null** (≈ 50%) |
| H5 | Desk unweighted score minus the drift benchmark, paired by day: > 0 | **Null** |
| **THE GATE** (H1) | VALIDATED only if all hold: the bootstrap 95% CI of S̄ is above 0; S̄ ≥ **0.05 u**; S̄ is above the 95th percentile of the shuffle placebo's mean; and S̄ > 0 in both halves | |
| **THE MIRROR** | The shuffle placebo is the mirror: a book whose signs are scrambled within the day. Its mean should sit near 0; if it does not, the design is biased (a net-tilt or drift effect) and that is reported before any verdict | |

## 5. Power — what this design can and cannot find (required)

No day has been scored, so there is no control sample yet. Rule, fixed now:

| Cell | Planned n | Outcome SD | Design effect | MDE (80%, α 0.05 two-sided) | Pass bar | Verdict |
|---|---|---|---|---|---|---|
| H1 day score | ≥ 120 eligible days | from the **shuffle placebo's** day-score SD over the first 20 eligible days (a control sample: it never uses the book's own signs) | 1 (one observation per day; block bootstrap handles serial correlation) | `mdeMeanDiff`, filled in Amendment A3 at day 20 | 0.05 u | POWERED if MDE ≤ 0.05 u at the planned n |

- At day 20, Amendment A3 (PRE-RESULTS for the scored cells: it reads only placebo SDs) records the SD, the MDE at
  120 days, and **N_req**, the eligible days needed for MDE ≤ 0.05 u.
- **Judgement date** = the day the eligible count reaches max(120, N_req). If that has not happened by
  **2027-12-31**, H1 is **UNDERPOWERED** and the test closes.
- Rough expectation, for scale: with a day-score SD near 0.4 u, 120 days gives an MDE near 0.10 u, so the pass bar
  may need about 500 days. If A3 says so, the verdict is very likely UNDERPOWERED unless the owner extends the
  window. That is written here so it cannot be argued later.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cell:** H1 only. One cell, no correction. Its gate is conjunctive (CI, size bar, placebo, both halves).
- **Secondary cells** H2-H5: Benjamini-Hochberg at q = 0.10 across the four (`benjaminiHochberg`), p-values from
  the bootstrap CIs via `pFromCI`. A secondary cell that survives BH is a candidate, never a result.
- **Disaggregation** (by asset group, by instrument, by roles hash, by global tone): descriptive, BH q = 0.10 with
  `chanceBaseline`, never a pass.
- **Promotion bar:** nothing here sizes a real position. If H1 passes, any live use needs |t| ≥ 3 on H1 or a second
  forward window.

## 7. What this does NOT test (required)

- **Tradability.** No costs, no stops, no plan zones, no entry timing beyond 08:00. A pass is not a trading system.
- **Size as risk.** Sizes weight the day score; whether the sizes are good risk is not tested.
- **The newsletter, the rulings, the currency ranking** as separate forecasts. Only the cards are scored.
- **Multi-day calls.** Only 08:00 to 21:00 on the run's own date.
- **Cause.** A pass says the book's signs lined up with the day; not which analyst or stage made that happen.
- **Interim numbers.** The desk-run page shows the running score from day one, labelled "interim, not judged".
  Nothing is decided from it before the judgement date, and the pipeline is not tuned to it: a role edit made
  because of the running score is logged as an amendment (POST-HOC, can only demote).

## 8. What each verdict changes (required)

- **VALIDATED** → ledger `validated` (research-only until |t| ≥ 3); the cards stay labelled "context" on every page
  until a second forward window confirms. The newsletter may say "the desk's book has called the day better than
  chance over N days", with the number.
- **NULL** → ledger `null`; the desk page and the newsletter say the book's direction has been tested and found no
  edge; the book stays as written context (rulings, plans, levels), and the reflection loop is judged on its own.
- **UNDERPOWERED** → ledger `underpowered`; say how many days the bar would need; the owner decides whether to extend.

## Amendments

### A1 — 2026-11-03 — PRE-RESULTS
§3 said a card with no M1 bar "in either minute window" is missing, without saying how wide the windows are. Fixed
now, before any card has been scored: **entry** = the open of the first M1 bar in [08:00, 09:00) London; **exit** =
the close of the last M1 bar in [16:00, 21:00) London (US grain and soft CFDs stop trading before 21:00, and their
last bar of the day is their exit). A card with no bar in either window is missing, counted and reported by
instrument. The power amendment named in §5 is now A2. No outcome had been computed.

### A2 — 2026-11-03 — PRE-RESULTS
Session updates (Phase 5) are built: at 08:05 and 14:35 London an update agent may change some cards. They do not
touch this test. The scored book is the morning book as written before 08:00, kept apart in `desk_run_elig_<date>`
and never edited. The updates are stored beside it and scored in the evening as a description only: new view minus
old view over the rest of the day, size-weighted. They are in no scored cell, and no cell here changes. The power
amendment named in §5 is now A3. No outcome had been computed.

### A4 — 2026-11-03 — PRE-RESULTS
Two additions, neither a scored cell. **Attribution** (Phase 10, `js/deskAttribution.js`): each layer is scored as its
own book on the same moves (the global tone alone, the currency ranking alone, the asset desks, the Head unweighted,
the Head sized), with what each step added. **The data quality officer** (Phase 14, `js/deskDataQuality.js`): before a
run, a pack it would hold (no forecast lines, three or more critical feeds out, or an analyst seeing under 40% of its
data) is rebuilt once. A run still counts only if it finishes before 08:00 London (§3); this changes no rule. No
outcome had been computed.

### A5 — 2026-11-03 — PRE-RESULTS
Before the first counted day, the morning pipeline gains one stage. **The red team** (Phase 7,
`desk/roles/red_team.md`) attacks the asset desks' draft book after the risk desk. Its targets are crowding,
contradictions, tested-null ideas, events in the window, stretched moves and missing data. The Head of Desk then answers
each challenge and may change cards. The scored book is still the Head's book as written before 08:00 (§3), and the
desk is still scored as operated. The single-prompt control (H2) is unchanged and never sees the red team. **Portfolio
risk** (Phase 11, `js/deskRisk.js`) describes the book's concentration and scenarios and is not a scored cell. No
outcome had been computed.

---

## RESULTS — not run

*Nothing above this line changes after the run.*
