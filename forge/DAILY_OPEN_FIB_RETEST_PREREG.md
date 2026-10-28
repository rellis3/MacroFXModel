# daily-open-fib-retest — after an impulse off the gold daily open, does a limit at the fib 1 (stop 1.2, target the 0) earn net R?

**Pre-registered 2026-10-27, before any outcome was computed.** (No real-data outcome exists anywhere: the M1 cache is
not present in the session that wrote this. The only runs so far are the synthetic random-walk and planted-edge checks
in §5, which never touch market data.)

| | |
|---|---|
| ID / ledger id | `daily-open-fib-retest` (one scored question). Family: **misc** (`plans/MISC_STUDIES.md`); not C.OG material |
| Branch | `ccr-94b856c7-n6z2q6` |
| Register row | `plans/RESEARCH_REGISTER.md` → `daily-open-fib-retest` |
| Data | XAUUSD OANDA **mid** M1, `VolRangeForecaster/data/m1/gold_m1.parquet`, every broker session in the file up to the session that opens 2026-08-20 18:00 New York (ends 2026-08-21, the last pre-lockbox day). Mid by owner's instruction (2026-10-27); costs are an assumed constant (§3). NQ and EURUSD descriptive only, if their files are present |
| Seed | `20261027` (the only seed in this study) |
| Uncertainty | date-clustered block bootstrap, blocks of 20 consecutive sessions, B = 2000 |
| Scripts / outputs | `scripts/daily-open-fib-retest/` (`engine.py` rules, `score.py` scorer, `test_engine.py` unit checks) → `analysis/output/daily-open-fib-retest/` |
| Harness | own script: the rule is a per-session intrabar state machine on M1 that `runStudy.mjs` / `study.mjs` don't express; sessions come from the existing `DailyOpenResearch.data.Days` (broker anchor) so the session split matches that earlier suite |

## 1. The claim

Source: YouTube `@Jay-ColezTrades`, "My Daily Open Strategy Explained" (watched by the owner 2026-10-27; screenshots of
the XAUUSD 1-minute chart, Vantage, 26 Oct 2026). This is **not** C.OG material and isn't filed under cog.

In the presenter's words: *"when market opens … we look to attack the market as it's at its lowest volume … Asia shows
us where it wants to go then we capitalize on that … we move to the downside. We are now looking for another sell
position off this top wick basically to manipulate the high and tag the fresh daily open. So you'll pull your fib … from
the high … the entry is the one on the fib … you need the 1.2 fib here for your stop loss. And then you need your TP at
the low … it should equivalate to about five R … I always go break even at one R."* Variants he mentions: a 2R or 3R
target "if you're not good at holding".

From the screenshots (our reading): fib 1 = 4019.10 = the daily-open price, which was also the session high (price fell
straight from the open); fib 0 = 4004.11, the impulse low (~23:45 UTC); 1.2 = 4022.09; the position tool shows reward
15.02, ratio 5.01; fill on the rally back to the 1 at ~00:15 UTC (spiked ~0.5 through it, not to the 1.1); target at
~01:55 UTC (low 4004.08).

## 2. Why it is not already settled

- **`level-touch` (null, 2026-10-24 audit)**: touches of pre-drawn levels including the daily open show no usable
  reaction (+0.002 of the day range). That entry scores *every* touch with a symmetric reaction race. This claim is
  narrower: only the first return to the opening extreme after an impulse away from it, with a 0.2-leg stop and a
  1.0-leg target. A small rejection effect would not show up as a mean reaction across all touches, but it could still
  pay at 5:1. So this is a different question, not a re-cut of that null.
- **`DailyOpenResearch/` (not banked, not pre-registered)**: same playbook family on the same data. Finding #10: a swing
  retested later in the day breaks first 52% vs rejects 48% (gold), and fading it is ≈ 0 gross, negative net. Finding
  #5: fib pullbacks of 0.382–0.786 after impulse legs are negative net. Neither tests a full (depth 1.0) retrace to the
  *opening* extreme with this 1.2 stop and 0 target. Both set the prior expectation (§4).

## 3. Definitions, fixed in advance

All in `scripts/daily-open-fib-retest/engine.py`; minutes are counted from the session's first bar.

- **Session**: `DailyOpenResearch.data.Days(df, "broker")`. A session opens 17:00 New York; the gold feed's first bar
  prints at 18:00 New York (23:00 UK most of the year; 22:00 UK in the 1–3 weeks when US and UK clocks disagree, as
  on 26 Oct 2026). Weekend stubs and sessions with no prior ADR are skipped.
- **ADR**: median of the previous 20 session ranges (strictly prior; `Days.adr20`).
- **Running state**: H, L = running high/low since the first bar, with the bar each was last set on.
- **Armed (sell)**: as of the previous bar, L was set after H, and A − L ≥ `min_imp` × ADR, and the bar is at or
  before minute 360 (05:00 UK). Buy mirrors this (H set after L, H − A ≥ `min_imp` × ADR).
- **A, the fib 1**: `anchor=high` → H (the opening wick, the video's drawing; **primary**); `anchor=do` → the first
  bar's open (the daily-open price), with the open required to sit inside the extremes.
- **The fib 0**: L as of the bar before the fill. Levels track new lows until the fill and freeze at the fill.
- **Entry**: limit at A, filled on the first armed bar whose high reaches A (fill at A, or at the bar's open if it
  opens beyond A). One trade per session; the first side to fill wins.
- **Stop**: the 1.2 = A + 0.2 × (A − L). 1R = 0.2 × (A − L).
- **Target**: the 0 (= +5R; primary), or entry − 3R / − 2R (variants).
- **Break-even**: when a bar's low reaches A − 1R, the stop moves to A from the next bar (primary on; variant off).
- **Exit**: stop, target, break-even stop, or the open of the first bar at/after minute 540 (08:00 UK, the London
  open), whichever comes first. A session that ends earlier closes at its last bar's open.
- **Conservative fills**: on the fill bar only the stop can trigger (the bar came up through A, so its low isn't
  credited); a later bar touching both stop and target counts as the stop; a bar opening beyond the stop exits at its
  open; a time exit at a bar's open beats anything else in that bar.
- **Outcome**: R per trade, gross; net = gross − cost / risk, with cost = **0.30 round trip on gold** (the
  `DailyOpenResearch` assumption; NQ 1.5 points, EURUSD 1.5 pips). This is mid data with a constant cost; it is not a
  bid/ask fill model (§7).
- **Knowable when**: every level is set from bars before the fill bar, so nothing uses information from after the
  order would have been working.
- **Control**: (i) the driftless random walk, under which any stop/target placement has zero gross expectancy;
  (ii) **28 shifted-anchor placebos**: the identical rule started 30, 60, …, 840 minutes after the real open on the
  same session (a pseudo-open), primary settings. The real mean must beat the market-generated distribution, not
  just zero.
- **De-clustering**: one trade per session by construction.
- **Sample / stability split**: sessions in date order, split at the median session into halves h1 / h2.

## 4. Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| a | Primary (gold, `anchor=high`, `min_imp` 0.10, target 0 (5R), BE at 1R): mean **net** R per trade | **Null.** Gross about 0 to slightly negative (retests break slightly more than they hold, `DailyOpenResearch` #10); net clearly negative, because 1R is only 0.2 of a small leg and a 0.30 cost is expected to be ~0.15–0.4R |
| b | Gross mean vs the 28 shifted-anchor placebos | Inside their spread |
| — | **THE GATE** (all three): (1) block-bootstrap 95% CI of mean **net** R lies above 0; (2) mean net R > 0 in **both** halves; (3) mean **gross** R above **all 28** shifted-anchor means (one-sided p ≤ 1/29 = 0.034) | |
| — | **THE MIRROR** | The buy side is inside the primary (both sides trade). The opposite bet (fade the retest: buy the break of the 1) is the complement of this race and is not scored separately |

Verdict word: VALIDATED if the gate passes; UNDERPOWERED if the measured MDE (§5) exceeds the pass bar; otherwise NULL.

## 5. Power

The control SD comes from the synthetic random walk on the exact pipeline (`score.py --synthetic rw`; 2,690 sessions,
gold-like per-minute volatility). It touches no market data.

| Cell | Planned n | Outcome SD (RW control) | Design effect | **MDE** (80%, α 0.05 two-sided) | Pass bar | Verdict |
|---|---|---|---|---|---|---|
| a: primary, net R | ≈ 2,000 trades (RW fill rate 77% of ≈ 2,650 sessions) | 1.75 R | 1 (one trade per session; vol clustering handled by the block bootstrap) | 2.80 × 1.75 / √2000 ≈ **0.11 R** | **0.15 R net** per trade | POWERED |

- **Pass bar**: +0.15R net per trade. At ~200 trades a year and 1% risk per trade that is roughly +30% a year before
  compounding. Below that, an overnight 1-minute limit strategy isn't worth its execution risk on mid-only evidence.
  The scorer recomputes the MDE from the real n and SD; if it exceeds 0.15R, the verdict is UNDERPOWERED.
- **Planted positive control** (`--synthetic plant`): after each primary fill, a drift of 0.25 of the leg toward the 0
  over 60 minutes. Recovered as +0.21R gross [+0.14, +0.30], both halves positive, above all 28 shifts → VALIDATED.
  The pure random walk gives +0.016R [−0.05, +0.09], 19 of 28 shifts beaten → no pass. The sweep and depth components
  on the random walk match the analytic nulls to within 0.01–0.02 (e.g. P(0 before 1.2) = 0.167 vs 1/6).
- **Unit checks** (`test_engine.py`, 13 checks) include the video's trade, which scores +5R with the 1 at 4019.10 and
  the 0 at 4004.11.

## 6. Multiplicity

- **Scored cell**: one (a). The gate is conjunctive (CI, both halves, placebo), so no further correction.
- **Disaggregation (descriptive, BH q = 0.10 via `pFromCI`, with `chanceBaseline`)**: the other 23 variants
  (anchor `high`/`do` × `min_imp` 0.10/0.20 × target 0/3R/2R × BE on/off); NQ and EURUSD at all 24 variants; slices
  by year, vol regime (`Days.vol_ratio`) and impulse size (0.10–0.15, 0.15–0.25, 0.25–0.40, > 0.40 ADR). A variant
  that survives BH is a **candidate for its own prereg on fresh data** (the lockbox tail or a forward record), never a
  result. With 24 variants per instrument, about 1 is expected to clear a 5% bar by chance (the random-walk run showed
  exactly 1 of 24).

## 7. What this does NOT test

- **Real fills.** Mid prices with a constant 0.30 cost. A short exits at the ask, and rollover spreads at the 23:00
  open are wider than daytime spreads. The screenshot trade's target was taken by only ~3 cents, and the break-even
  stop came within cents of the entry, so fills at these exact levels can flip individual outcomes. The bid/ask
  re-run (`data/m1_bidask/gold_m1.parquet`) is the follow-up, under its own amendment or prereg.
- **The presenter's discretion** (which wick, skipping days, live adjustments). Only the mechanical rule is tested.
- **Other brokers' session clocks.** Vantage's daily open and OANDA's can differ by cents; anchors are levels from
  the same feed that's being scored.
- **Direction or cause.** A pass says the rule earned net R on this data, not why.
- **The lockbox.** Sessions after 2026-08-21 are not scored.

## 8. What each verdict changes

- **Pass** → ledger entry `daily-open-fib-retest` (domain `misc`), research-only until |t| ≥ 3 or a forward/bid-ask
  confirmation; next step is the bid/ask re-run and a lockbox-tail check under a new prereg.
- **Null** → ledger entry (domain `misc`); the misc index records the verdict. **The null decomposition below is run
  and banked alongside it (owner's rule 2026-10-27).**
- **Underpowered** → say so; pooling gold, NQ and EURUSD in a pre-registered family would be the way to get power.

### Null decomposition: the reusable components (descriptive, pre-registered now)

Whatever the verdict, but required on a NULL, the scorer reports the strategy's parts separately so later misc tests
can reuse any part that carries signal on its own. Each part is compared with the random-walk value **and** with the
same quantity under the 28 shifted anchors:

| Part | What it measures | Null |
|---|---|---|
| C1 impulse | how often the open produces an impulse ≥ 0.10 ADR before 05:00 UK; impulse size, time to the extreme, time to the fill; the risk in ADR and the cost in R (whether the setup is even affordable) | descriptive; shifted anchors |
| C2 return to the anchor | share of sessions where price comes back to the fib 1 before the cut-off | shifted anchors |
| C3 sweep beyond the 1 | after the fill, P(price reaches 1.1 / 1.2 / 1.272 / 1.382 / 1.5 / 1.618 before the 0): which stop placement survives the "manipulation" | RW 1/x; shifted anchors |
| C4 depth before the 1.2 | P(price reaches 0.786 / 0.618 / 0.5 / 0.382 / 0 before the 1.2 stop): which target the move actually delivers | RW 0.2 / (0.2 + 1 − d); shifted anchors |
| C5 break-even | of the trades the break-even stop closed, the share that went on to the 0 before the 1.2 | descriptive; with vs without BE |
| C6 slices | net and gross R by year, vol regime and impulse size | descriptive |

A component counts as a **reusable candidate** only if its observed rate lies outside both the random-walk value's CI
and the shifted-anchor 5–95% band, on the same side in both halves, and survives BH q = 0.10 across all C3/C4 cells.
Candidates go into `plans/MISC_STUDIES.md` ("Reusable components found") with their numbers, as inputs for later
preregs. They are never results in their own right.

## Amendments

### A1 — 2026-10-28 — PRE-RESULTS: bid/ask fills become the primary; 0.30 impulse; pass-bar code fix

Written before any real-data outcome was computed (the only runs remain the synthetic checks of §5). Owner's brief
of 2026-10-28: "Real fills. This is decisive, because the stop is only 0.2 of a small leg and the 23:00 rollover
spread is wide … use bid/ask … report the mid-price result next to it", and "test a few thresholds (e.g. 0.10, 0.20
and 0.30 of the average daily range)". Run on the owner's laptop, where both M1 files are present.

1. **Primary fill model = bid/ask.** Data `data/m1_bidask/gold_m1.parquet` (OANDA practice, `open..close` = mid,
   then `bid_o..bid_c`, `ask_o..ask_c`; starts 2016-10-23), sessions up to the one opening 2026-08-20 18:00 New York
   (same lockbox cut). Sessions and ADR come from its mid columns via the same `Days(…, "broker")`. The fib is drawn
   on the **bid** (what a retail broker chart shows). **Sell**: fills when the bid high reaches A (at A, or the bid
   open if a bar opens above A); the stop triggers when the ask high reaches the 1.2; the target fills when the ask
   low reaches it; break-even arms when the ask low reaches A − 1R and stops when the ask high comes back to A; the
   time exit is at the ask open. **Buy**: the mirror — fills when the ask low reaches A (the bid-drawn opening low),
   exits on the bid. No cost is added (spread only). A stop on the fill bar exits at no better than entry + the
   spread at that bar's open (a position opened inside a spread wider than the stop can't be closed for less).
   Rows invalid on mid, bid or ask (or ask below bid) are dropped and counted.
2. **The gate on the primary**: (1) block-bootstrap 95% CI of mean bid/ask R above 0; (2) mean bid/ask R > 0 in both
   halves; (3) mean **mid gross** R of the same sessions (levels and fills on the file's mid columns) above all 28
   shifted-anchor mid gross means. Leg 3 stays on mid because it asks whether the open matters *in price*; spreads
   differ by hour, so a bid/ask placebo would mix the two questions. The bid/ask shifted means are reported,
   descriptive only. MDE from the bid/ask n and SD; pass bar +0.15R.
3. **Mid stays as the secondary**: (a) the registered cell exactly as registered (`VolRangeForecaster/data/m1`,
   0.30 cost, from 2016-01) and (b) mid with 0.30 on the bid/ask file's own sessions, so the spread's cost is the
   gap between (b) and the primary.
4. **`min_imp` 0.30 added**: 36 variants per instrument per fill model (anchor high/do × 0.10/0.20/0.30 × target
   0/3R/2R × BE on/off); BH q = 0.10 across all 36 within each instrument and model. Primary unchanged.
5. **Code fix**: `score.py` had `PASS_BAR = 0.10`; the prereg (§5) says +0.15R. The prereg governs; set to 0.15.
6. **Added descriptive slices**: minutes from the open to the 1 (≤ 15, 15–60, > 60: how literally "the opening wick"
   holds), R per year and max drawdown in R for the gated cell, the spread at the fill in R, bid/ask R by year and
   vol regime. Components C1–C4 stay on mid geometry (spread-free); C5 also with bid/ask.
7. **NQ and EURUSD** (descriptive) in both models where `data/m1_bidask` has them.
8. **Expectation for the primary**: below the mid result, and negative. Gold's median spread is ~0.32 overall and
   wider at the 23:00 reopen, against a median 1R of a few dollars.
9. **The screenshot trade itself** (26 Oct 2026) is in the lockbox and after the bid/ask file's last bar
   (2026-10-20), so it can't be scored; "typical or lucky" is answered from the distribution of exits.
10. **Unit checks**: 18 (13 + 5 bid/ask: zero spread equals mid; the video trade misses its 0 on the ask with a 0.5
    spread; a fill-bar stop inside a wide spread loses the spread; buys need the ask at the bid-drawn low).
    Synthetic re-runs unchanged in kind: random walk NULL (19 of 28 shifts), planted edge VALIDATED.

---

## RESULTS — run <YYYY-MM-DD>

*Written to `analysis/output/daily-open-fib-retest/RESULTS.md`. Nothing above this line changes after the run.*
