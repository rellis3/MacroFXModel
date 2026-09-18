# Market-sense tests — eight claims about "sensing a change", pre-registered together

> **Status: PRE-REGISTERED 2026-09-17 (commit 1da0940), all eight run the same
> day.** Scorecard: **2 pass** (S1 VIX inversion, S7 surprise size — by family),
> **3 null** (S3 front-end shock, S6 priced-in, S8 rotation), **1 null with a
> lesson** (S4: oil and breakevens move in the same window, there is no lag to
> wait for), **1 base rate** (S5: history does not say which leg of a broken
> link gives way), **1 too thin to score** (S2: 36 flips). Nothing above the
> Results line changed after the run.
> One harness (`analysis/market_sense_studies.mjs`), one discipline for all eight:
> the same paired-control method that closed the level-touch, approach-speed,
> squeeze and growth-vs-yields questions.

## Shared method

- **Data.** OANDA daily bars (session-dated) for NAS100, SPX500, US2000, XAU/USD,
  EUR/USD, USD/JPY, GBP/USD, AUD/USD, USD/CAD; FRED daily VIXCLS, VXVCLS, DGS2,
  DGS10, DFII10, T10YIE, DCOILWTICO, DTWEXBGS (keyless CSV, full history). Merged
  on shared dates; FRED holidays carried forward one session.
- **Outcome unit.** Range in ATR14 of the instrument, measured at the setup day,
  so 2008 and 2026 are on one scale. "Next-5d range" = max high − min low over the
  five following sessions ÷ ATR14. "Next-20d" likewise.
- **Control.** One non-setup day per setup day: same instrument, different ISO
  week, same ATR-percentile quintile (trailing 250-day rank of ATR/close), same
  20-day trend tercile; never itself inside the setup. Random draw, fixed seed.
- **Statistic.** Paired mean difference; ISO-week block bootstrap, 1,000 reps,
  95% CI. Setups with fewer than 40 paired days are reported, not scored.
- **Pass bar** (range studies). Primary difference ≥ +0.10 ATR with the CI clear
  of zero. A *narrower* result with the CI clear of zero is reported as a
  "calmer" finding, not a pass.
- **Population audit** at every filter step.
- Robustness for every scored study: R1 = 2018-01-01 onward only.

## The eight studies

**S1 — VIX term structure inverts → the week gets wide.**
Setup: first day VIX ≥ VIX3M after ≥3 days below. Outcomes: next-5d range on
SPX500, NAS100, USD/JPY, XAU/USD. Exit setup: first day back below after an
inversion of ≥3 days (expect narrower). Descriptive: episode lengths (median,
p75) and how many sessions after inversion the range stays above control.

**S2 — Stocks and bonds falling together = an inflation regime.**
Feature: 20-day correlation of SPX500 daily log returns with DGS10 daily changes.
Normal risk-on is positive (stocks up, yields up); "falling together" is
negative. Setup: first day the correlation crosses below −0.20 after ≥10 days
above. Outcomes: next-20d range on XAU/USD, EUR/USD, USD/JPY, SPX500.
Descriptive: how long the negative-correlation episodes last.

**S3 — Front-end shock → FX vol.**
Feature: 5-day change in DGS2. Setup: |Δ2Y| in the top decile of the trailing
population (threshold reported). Outcomes: next-5d range on EUR/USD, USD/JPY,
GBP/USD. Split reported for up-moves vs down-moves. Direction is NOT scored
(banked null, project_yield_asset_coupling).

**S4 — How long does an oil move take to reach breakevens?**
Setup: WTI 20-day move ≥ +10% (and, separately, ≤ −10%). Outcome: T10YIE change
over the following 5, 10 and 20 sessions, in bp, vs control. Pass bar for this
study only: +5bp (−5bp for the down setup) with the CI clear of zero at any
horizon. Descriptive: cross-correlation of 20-day oil change with 20-day
breakeven change at lags 0..20 sessions.

**S5 — Which side of a broken link gives way?**
(a) Real yield 20-day ≥ +15bp AND DTWEXBGS 20-day ≤ −0.5% (today's break).
Outcome over the next 20 sessions: share of episodes where the dollar caught up
(≥ +0.5%) vs where the real yield gave back (≤ −8bp) vs neither; DXY and real
yield mean changes vs control. (b) Real yield 20-day ≥ +15bp AND XAU 20-day ≥
+2%. Same outcomes for gold. These are BASE RATES with intervals; no pass bar,
no directional claim — the output is "historically this resolved by X in n% of
cases", or "n too small to say".

**S6 — "Priced in": does a well-telegraphed decision move less?**
Population: every FOMC decision day 2016-01-27 → latest (js/fomcHistory.js).
Feature: |Δ2Y| over the 20 sessions before the decision (how much repricing
already happened). Outcome: decision-day range/ATR on EUR/USD, USD/JPY,
XAU/USD, SPX500. Test: top tercile of prior repricing vs bottom tercile,
bootstrap over meetings. Pass: top-tercile range LOWER by ≥ 0.10 ATR with the
CI clear of zero (the "already priced" claim). The opposite sign is also
reported honestly.

**S7 — Data surprise size → range, by release.**
Population: the desk's own surprise store (econ_surprise_v1, ~10k releases,
2017→, actual vs consensus z-scored per series). Currency → pair: US→EUR/USD
and USD/JPY, GB→GBP/USD, EU→EUR/USD, JP→USD/JPY, AU→AUD/USD, CA→USD/CAD.
Outcome: release-session range/ATR and next-session range/ATR vs control
(non-release day for that pair). Split by |z| tercile and by family: CPI,
employment (NFP / unemployment / claims), GDP, rate decisions, retail sales,
PMI. Pass per family: top-|z| tercile release-day range ≥ +0.10 ATR vs control
with the CI clear of zero.

**S8 — Rotation underneath a quiet index.**
Feature: 20-day relative log return NAS100 minus US2000. Setup: |relative| in
the top decile. Outcomes: next-20d range on NAS100 and SPX500 vs control.
Descriptive: the relative-return series' own persistence (does an extreme
mean-revert or extend over the following 20 sessions — reported as a base rate).

**S9 — Two moves after the Fed (pre-registered 2026-09-17 evening, after S1–S8 had
run; before S9 was run).** Claim (Crown, 2026-09-17): the first move after an
FOMC decision trades *surprise vs what was priced* — front end, dollar, stocks —
and the second move, over the following sessions, trades *what the policy does
to the economy*: the 10-year, which the Fed does not control, can fall as slower
growth and lower inflation are priced, flattening the curve and unwinding the
dollar and equity impulse. Population: the 85 FOMC decision days 2016→2026.
Day-0 move = decision-day close vs prior close; second move = sessions d+1..d+5
and d+1..d+20. Four questions, each a base rate on FOMC days against the same
statistic on matched non-FOMC days (a random non-FOMC day with a day-0 move of
the same instrument in the same absolute-size quintile, different week):
(a) **Curve after a hawkish day 0** (Δ2Y d0 ≥ +5bp): Δ(10Y − 2Y) over d+1..d+20
— does the long end lag the front end (flattening) more than after a matched
non-FOMC 2Y jump? (b) **Dollar fade**: share of meetings where the dollar
(DTWEXBGS; EUR/USD and USD/JPY as checks) gives back ≥ half of its day-0 move
within 20 sessions, vs the same share after matched non-FOMC dollar days.
(c) **Equity relief**: same for SPX500. (d) **First move ≠ final verdict**:
continuation rate — sign(d+1..d+20 move) = sign(day-0 move) — on FOMC days vs
matched non-FOMC days, per instrument (2Y, 10Y, dollar, SPX500). Pass bar for
(a): flattening ≥ 5bp more than control with the CI clear of zero. (b)–(d) are
base rates with bootstrap intervals over meetings; a difference of ≥ 15
percentage points with the interval clear of zero is reported as a finding,
anything less as "no difference from an ordinary big day". n ≈ 40 per hawkish/
dovish half is thin; that is stated wherever it binds.

**S10 — Crowded short in long bonds into the Fed (pre-registered 2026-09-17,
before running).** Claim (Crown, 2026-09-17, on a TLT call spread): into an FOMC
positions square up, long bonds were the exception — everyone short — and when the
consensus hike was delivered the long end rallied (yields fell from the 10-year
out) as term premium slipped, forcing shorts to cover. Three testable pieces:
(1) **Squaring up**: leveraged-fund gross positioning (long + short, share of open
interest) in T-bond and 10Y-note futures on the report before an FOMC vs two
reports before, against the same two-week change in random non-FOMC fortnights.
(2) **Crowded short into the event**: leveraged-fund net (long − short) / open
interest in T-bond futures (merged CFTC names "U.S. TREASURY BONDS" / "UST BOND",
TFF futures-only, 2010→), as of the last report dated on or before the Tuesday of
the meeting week; percentile over the trailing 156 weeks; bottom tercile of
meetings = crowded short. (3) **The rally**: change in DGS30 and DGS10 over d0..d+5
and d0..d+20 after the decision, crowded-short meetings vs the rest, bootstrap over
meetings; and the same statistic on matched non-FOMC days with the same
positioning tercile (a random day in the same report week), to separate
"crowded shorts revert" from "crowded shorts revert *because of the Fed*".
Sub-split reported for consensus decisions (day-0 |Δ2Y| < 5bp). Pass: crowded-short
meetings show DGS30 falling ≥ 5bp more than the rest over d0..d+5 with the CI
clear of zero AND more than the matched non-FOMC comparison. n ≈ 28 per tercile is
thin; stated wherever it binds.

**S11 — Price vs yield spread: divergence, alignment, and who pays (pre-registered
2026-09-17, before running).** The owner's question: when a pair's move diverges from
its yield-spread move, vs when the two are aligned, what follows — and which pairs
get hurt. Data: OANDA daily bond CFDs (USB10Y_USD, DE10YB_EUR, UK10YB_GBP; bond
PRICE is the inverse of yield, so the FX-bullish spread is +US_price −foreign_price
∝ foreign yield − US yield, i.e. rising = the foreign leg pays relatively more) and
EUR/USD, GBP/USD daily closes — the two pairs with a foreign 10Y CFD. USD/JPY, AUD/USD
have no foreign-leg CFD and are not scored. Features at day t: 20-session log change
in the pair (%) and 20-session change in the spread (bond-price points, standardised
by its own trailing-250 stdev); **divergence** = the two moved ≥ 1 stdev each in
OPPOSITE directions; **alignment** = ≥ 1 stdev each the SAME direction. Outcomes vs
matched controls (same ATR quintile, trend tercile, different week): next-20-session
range in ATR (the "damage" question, as range); and, as base rates with intervals, the
share of divergence episodes where the gap closed by the PAIR moving back toward the
spread vs by the SPREAD moving toward the pair over the following 20 sessions (gap
= standardised pair − standardised spread; closure = |gap| shrinks by ≥ half; which
leg moved more). Pass bar for range: ≥ +0.10 ATR with the CI clear of zero. The
closure split is a base rate; no pass bar, no direction claim. The 2Y-spread
mean-reversion sleeve already validated here (YIELD_SPREAD_STRATEGY.md) is a
different object — the spread's own z-score — and is not re-tested.

**S12 — The owner's framing, as a table (pre-registered 2026-09-17, before
running).** "After FOMC, when the 30-year had already moved into the meeting and the
Fed was more hawkish than expected, price sold off." Population: 84 FOMC decision
days 2016→. Rows = lead-up: Δ30Y over the 20 sessions before the meeting, split
at ±8bp (up / flat / down). Columns = surprise on the day: Δ2Y on the decision day,
split at ±5bp (hawkish / neutral / dovish). Cells: share of meetings where SPX500,
the broad dollar and gold were HIGHER five sessions after the decision, with a
bootstrap interval, and the mean move. No pass bar: this is a base-rate table
whose job is to show the owner the numbers behind the five registered nulls. A
cell with fewer than 10 meetings is printed with its n and not discussed. Reading
rule stated in advance: a cell only means something if its interval excludes 50%
AND the neighbouring cells do not contradict it; with nine cells and n≈84, one
cell clearing 50% by chance is expected.

**S13 — Does watching more pairs add breadth? (pre-registered 2026-09-17, before
running.)** Claim A: "the number of things you watch is the number of real
opportunities you get." The measurable version is Grinold's law — IR ≈ IC × √N —
and its catch: N is the number of *independent* bets, not tickers. Sleeves: the
2Y yield-spread z-score sleeve (`YIELD_SPREAD_STRATEGY.md`) and, separately, the
Asia fib atlas vote portfolio — both already have a record here, so neither is
being invented for this test. Universes of size 1, 2, 4, 8, 16, 26 drawn from
`instrumentRegistry` order; 1,000 bootstrap draws of universe membership at each
size (fixed seed), so no universe is hand-picked after the fact. Costs charged in
per pair from the spread profile (a cross at 3 pips is not a free extra signal).
Report: OOS Sharpe vs size, against both √N and √N_eff, where
N_eff = (Σλ)²/Σλ² of the correlation matrix of the sleeve's own per-pair daily
P&L. Reading rule fixed now: breadth "pays" only if OOS Sharpe at N=26 beats N=4
by ≥0.3 with a bootstrap CI clear of zero, on ≥30 OOS trades per universe. Prior
stated in advance: the dollar factor should put N_eff for 26 FX pairs somewhere
around 3–6, in which case the curve flattens by N≈6 and the honest version of the
claim on this desk is "watch six things properly".

**S14 — Does a multi-year regime break precede anything? (pre-registered
2026-09-17, before running.)** Claim A's alert object: "when something breaks a
multi-year regime, I hear about it instantly." Setup, defined now: a series
closes outside its trailing 3-year (756-session) high/low range for the first
time in ≥60 sessions. Universe: 26 FX + gold + SPX500/NAS100, plus the FRED set
already in the harness (DGS2, DGS10, DGS30, DFII10, T10YIE, HY OAS, VIXCLS,
DTWEXBGS). Outcomes: next-5d and next-20d range in ATR14 against the shared
paired control (same instrument, different ISO week, same ATR-percentile
quintile, same 20-day trend tercile), plus the up-share for direction. Reading
rule fixed now: "worth an alert" needs range ≥ +0.30 ATR with the CI clear of
zero, on ≥30 paired episodes, in **at least three of the four instrument families**
(FX majors, FX crosses, metals/indices, rates/credit) — one family clearing on its
own is what chance looks like across ~35 series. Anything less goes in the book as
another null, and `today.html` says regime breaks are description.

**S15 — The non-reaction: a big surprise, no move. (pre-registered 2026-09-17,
before running.)** Claim B's kernel: "crude didn't break down on the biggest
supply build." Setup: a release whose surprise is top-decile by |z| against its
own history, where the instrument's reaction over the release session is
**bottom-tercile** relative to what the Event Response Book expects for that
family × instrument (residual = realized ÷ expected multiple). Populations: (a)
oil — 1,306 EIA Weekly Crude Oil Inventory prints (2014-01 → 2026-07,
`calendar_events.csv`, actual vs consensus) against WTI (`WTICO_USD`), with API
stocks as a robustness leg; (b) the generalised version — the surprise store
behind S7 (7,932 pair-releases, 2017→) across the 9 country|category blocks in
`eventImpactMap`. Outcomes, both populations: next-5d and next-20d range in ATR14
vs paired control, **and** the direction share *in the direction the surprise
implied* (a build is bearish crude; a hawkish CPI surprise is bullish the
currency), because the claim here is directional, unlike every range study
above. Reading rule fixed now: a pass needs the directional share's bootstrap CI
to exclude 50% on ≥40 paired episodes in the oil population, and to hold with the
same sign on the generalised population. A range-only result is reported as a
size finding, not as Crown's claim. Prior stated in advance: this desk has nulled
every direction test it has run (yields→FX, CB tone, priced-in, post-FOMC drift,
S12's table), so the base case is null — the point is that this one is cheap to
settle and the data is already here.

**S16 — Weird × technical, the conjunction (conditional pre-registration,
2026-09-17).** Runs only if S15 returns anything at all; registered now so the
conjunction cannot be fished for afterwards. Claim B, step 2: the anomaly matters
more when the technicals agree — "if there's a recent breakout, I'm even more
interested." Setup: S15's non-reaction episodes, split by whether the instrument
had a breakout in the prior 10 sessions, defined with the desk's existing object
(a close through a tracked level with confirmation, `motif_track`'s definition,
not a fresh one). Outcome: the same directional share and next-20d range as S15.
Reading rule fixed now: the conjunction "adds" only if the breakout subgroup's
directional share beats the non-breakout subgroup by ≥10pp with the paired CI
clear of zero **and** the subgroup has ≥30 episodes. Two subgroups, one test, no
further slicing — if the split is run on anything else (session, family, pair),
it is exploratory and labelled so.

**S17 — The gold/oil ratio mean-reverts (pre-registered 2026-09-18, before
running).** Claim (Crown, 2026-09-18): crude is "the dominant market" right now
(war supply constraints, shipping costs) and has run up faster than gold, so
CL1÷GC1 (or USO÷GLD) is stretched; historically this ratio mean-reverts because
one side overextends relative to the other, and gold should "catch back up."
This is a trading claim, not a mechanism-only chain link — it is structurally
identical to this desk's one validated cross-asset sleeve
(`YIELD_SPREAD_STRATEGY.md`: rolling z-score of a spread, extreme z bets on
reversion), so it is tested the same way, not added to `js/macroChain.js` as
description.

**Definition, fixed now.** Ratio = ln(WTI close ÷ gold close) (`WTICO_USD` ÷
`XAU_USD`, OANDA daily, matching Crown's CL÷GC orientation — rising = oil rich
vs gold). Rolling 126-session z-score (same window family as the yield-spread
sleeve's validated region, reused rather than invented). Setup: first session
of a new episode with |z| ≥ 2.0 (same entry threshold as the sleeve), scored
separately for oil-rich (z ≥ +2) and gold-rich (z ≤ −2) — the mechanism claims
symmetry even though Crown's current call is one-sided. Population: full OANDA
daily history for both instruments (≈2005→).

**Outcome.** Relative return over the next 5 and 20 sessions: `ln(goldF/gold) −
ln(oilF/oil)`. The reversion call implies this should be **positive** after an
oil-rich setup (gold outperforms) and **negative** after a gold-rich setup.
ISO-week-block bootstrap share of episodes matching that sign, 95% CI, against
the **named benchmark**: the same share computed unconditionally (all trading
days, not just setup days) — a "mean-reverts" claim that cannot beat the
unconditional rate of gold-beats-oil has not shown anything (`CLAUDE.md`'s
"name the benchmark before claiming improvement").

**Pass bar, fixed in advance.** A leg (oil-rich→gold-outperforms,
gold-rich→oil-outperforms) passes only if its conditional share's CI excludes
50% **and** beats the unconditional benchmark share by ≥10pp, on ≥40 episodes,
scored separately at 5d and 20d. A cell that clears "CI excludes 50%" without
clearing the benchmark margin is reported as a base rate, not a finding — same
distinction this desk already drew on S5 and S11. Whether the ratio's own |z|
shrinks over the horizon (mean reversion of the spread itself, independent of
which leg moves) is reported separately as description, not scored against the
pass bar — S11 already banked that closure and direction are different claims.

**Status: NOT YET RUN.** Needs `WTICO_USD` daily bars via OANDA — blocked in
this session (network egress denied to OANDA/FRED at the time of writing, and
unlike S13–S15 there is no local fallback: `VolRangeForecaster/data/m1/` has no
oil file, confirmed by directory listing, and no oil price series exists
anywhere else in this repo, confirmed by search). The harness is written in
`analysis/market_sense_studies.mjs` (S17), committed and reviewed, unexecuted.

## What a pass changes on the page

A validated range effect earns a ✓ chip on the instrument it was measured on,
worded as range, never direction. A base-rate study (S4, S5) earns a sentence in
the chain row it describes. Every result, pass or null, goes into the morning
brief and the chain read as a "TESTED ON THIS DESK" block so the prose leans on
what was measured before it leans on folklore.

---

## Results

Data as fetched 2026-09-17: ~5,000 daily bars per instrument (2007/08 → 2026-09-16);
FRED series complete. Unconditional next-5d range ≈ 2.3 ATR, next-20d ≈ 4.6 ATR,
single day ≈ 1.0 ATR. Output: `analysis/output/market_sense_studies.json`.

### S1 — VIX term structure inverts → the week gets wide. **PASS.**
86 first-day inversions (133 episodes; median length 1 session, p75 3 — inversions
are brief). Next-5d range vs matched control: SPX500 **+0.76 ATR** [+0.29, +1.29],
NAS100 **+0.82** [+0.53, +1.14], USD/JPY **+0.44** [+0.08, +0.88], XAU/USD **+0.43**
[+0.11, +0.78]. The 20-day range is also wider on the indices and gold (+0.9 to
+1.2 ATR). R1 (2018+) has 39 entries — one short of the scoring floor, so it is not
scored; the exit setup (first day back in contango) has 34, also unscored. What the
page may say: on the first day VIX trades above VIX3M, the coming week has run
roughly a third wider on indices and ~20% wider on gold and USD/JPY. Range, never
direction.

### S2 — Stocks and bonds falling together. **Not scored (n=36 flips).**
Negative-correlation episodes: 71 since 2008, median 5 sessions, p75 17; 17% of all
days. Too few clean flips to test the range claim. Kept as description only.

### S3 — Front-end shock → FX vol. **NULL — and hawkish shocks run calmer.**
Top decile |Δ2Y over 5 sessions| ≥ 14bp, ~211 first-day shocks per pair. Next-5d
range vs control: EUR/USD −0.09 (null), USD/JPY +0.08 (null), GBP/USD −0.05 (null).
Split by direction: after a 2Y **up** shock EUR/USD is *calmer* (−0.34 [−0.57,
−0.14]) and so is GBP/USD (−0.28); after a 2Y **down** shock USD/JPY is wider
(+0.33 [+0.03, +0.63], marginal). The folklore — "a rates shock means FX
volatility next week" — is not there. If anything a hawkish front-end repricing is
followed by a quieter week in the dollar pairs.

### S4 — Oil → breakevens lag. **NULL, with the useful part being WHY.**
128 first-day oil +10% moves, 96 −10%. Breakeven change over the next 5/10/20
sessions vs control: nothing at any horizon (+1.0bp at 10 sessions with a CI of
±2, the rest ~0). Only **43%** of oil-up episodes see breakevens move ≥5bp the
same way within 20 sessions (44% for oil-down). The cross-correlation of 20-day
oil change with 20-day breakeven change is **0.37 at lag 0** and decays to 0.09
at 20 sessions. Reading: oil and inflation pricing move in the *same* window.
If breakevens did not move with oil, waiting will not bring them — the bond
market has already made its call. That is what today's quiet oil → breakevens
link means: not "not yet", but "not this time".

### S5 — Which side of a broken link gives way? **No tendency.**
(a) real +15bp & dollar −0.5% over 20 days: 55 episodes. Next 20 sessions: the
dollar caught up (≥+0.5%) in **47%**, fell further (≤−0.5%) in 36%; the real yield
gave back ≥8bp in **40%**, rose another 8bp+ in 36%. Means: dollar +0.3% [−0.1,
+0.8], real yield +1.7bp [−4.7, +7.6] — indistinguishable from unconditional.
(b) real +15bp & gold +2%: 45 episodes; gold next 20 +0.5% [−0.8, +1.6], ≥2% in
33%, ≤−2% in 29%. History does not say which leg gives way. The chain rows say
so now instead of implying a resolution.

### S6 — "Priced in": does a telegraphed decision move less? **NULL.**
85 FOMC decision days (2016-01 → 2026-07). Decision-day range by tercile of prior
20-session |Δ2Y| (cut-points ~5/16bp): EUR/USD low-repricing 1.43 ATR vs
high 1.32 (diff −0.11 [−0.32, +0.11]); USD/JPY 1.23 vs 1.30; XAU 1.28 vs 1.35;
SPX500 1.33 vs 1.31. Decision days run ~1.3 ATR — a third wider than a normal
day — **whether or not the front end had already repriced**. "It's priced in"
does not shrink the decision-day range; the page's "priced in" line now carries
that.

### S7 — Data surprise size → range, by family. **PASS for employment, CPI
(next session), rate decisions, GDP and PMI on specific pairs; NULL for retail
sales.** 7,932 pair-releases from the desk's own store (2017→). Release-session
range vs matched non-release control:

| family | strongest cells (diff in ATR, 95% CI) | note |
|---|---|---|
| rate decision | EUR/USD **+0.42** [+0.28, +0.57] all; **+0.49** top-\|z\|; USD/JPY **+0.27** [+0.16, +0.39]; GBP/USD next session **+0.37** [+0.18, +0.54] | the decision is the event; surprise size adds little on the day |
| employment | AUD/USD **+0.19** [+0.10, +0.28] top-\|z\|; EUR/USD **+0.16** [+0.05, +0.28] top-\|z\|, next session **+0.14**; USD/JPY next session **+0.16**; USD/CAD all **+0.11** | surprise size matters: top tercile ≈ 2× the all-release effect |
| CPI | release day marginal (EUR/USD +0.10 [−0.01, +0.19]); **next session** EUR/USD **+0.27** [+0.16, +0.40], USD/JPY **+0.25** [+0.01, +0.50]; GBP/USD all **+0.19** | a CPI surprise shows up in the *following* session (the release lands late in the OANDA session; Asia/London carry the reaction) |
| GDP | EUR/USD top-\|z\| **+0.22** [+0.06, +0.37]; USD/CAD all **+0.16** | |
| PMI | USD/JPY **+0.22** [+0.10, +0.36] top-\|z\|; others null | |
| retail sales | nothing clears +0.10 with a clean CI | null |

### S8 — Rotation underneath a quiet index. **NULL.**
140 top-decile extremes of the 20-day NAS100 − US2000 relative return (≥ 6.1pp).
Next-20d range NAS100 −0.31 [−0.86, +0.22], SPX500 −0.23; next-5d +0.15 [−0.06,
+0.38]. The extreme extended in 45% of cases (mean −0.6pp, i.e. mild reversion,
CI includes zero). Rotation extremes do not precede wider index ranges. Banked.

### S9 — Two moves after the Fed. **No difference from an ordinary big day.**
84 FOMC decision days (2016→), each matched to a non-FOMC day with a day-0 move of
the same size in the same instrument. Share of the day-0 move given back by at
least half within 20 sessions: 2Y 38% (matched 39%), 10Y 50% (45%), dollar 48%
(40%), SPX500 45% (51%). Continuation rates likewise indistinguishable (all
differences inside ±10pp with intervals across zero). The curve test could not be
scored for hawkish days (14 meetings with a 2Y day-0 move ≥ +5bp); on the 20
dovish days the curve flattened 5.5bp over 20 sessions vs 4.5bp on matched days —
no difference.

Reading: "the first move is not the final verdict" is true, and it is true of
*every* big day — roughly half of large day-0 moves in any of these instruments
give back half or more within a month, FOMC or not. The specific mechanism Crown
describes (long end repricing the economy and unwinding the dollar/equity
impulse) does not show up as a Fed-specific tendency at the daily horizon. It may
be right on individual meetings; it is not a base rate you can lean on. What is
usable is the plain base rate: after a decision day, the move you see at the close
has about even odds of being half-undone within 20 sessions, same as any big day.

### S10 — Crowded short in long bonds into the Fed. **Wrong on all three counts.**
84 meetings 2010→2026 with CFTC T-bond positioning (leveraged funds, TFF).
(1) *Squaring up*: leveraged gross positioning/OI **rose** +0.4pp into meetings
(CI across zero) vs −0.0pp in random fortnights — no squaring-up. (2) *Crowded
short*: the crowded-short tercile of meetings (net ≤ 28th percentile, mean −24%
of OI) exists, but **right now leveraged funds are the LEAST short in three years**
— net −15% of OI at the **94th** percentile on the 2026-09-08 report (the fund
community is structurally short T-bond futures through the basis trade, so the
percentile is what matters, not the sign). "Everybody's short TLT" is not what the
CFTC data shows for this meeting. (3) *The rally*: after crowded-short meetings the
30-year yield **rose** +4.0bp over 5 sessions vs −0.3bp after the rest (diff
+4.3bp [−2.3, +10.6]); on consensus decisions only (day-0 |Δ2Y| < 5bp) the gap
is **+9.1bp [+1.3, +16.5]** — the long end sold off *more*, the shorts were paid.
The same positioning split on non-FOMC days shows +0.7bp — the direction is
general, the Fed only amplifies it. Banked as: a crowded leveraged short in
long-bond futures into a Fed meeting has NOT been followed by a long-end rally;
if anything the reverse. A single meeting can go the other way; that is not a
tendency.

### S11 — Price vs yield spread: divergence, alignment, who pays. **NULL.**
EUR/USD (Bund vs T-note) and GBP/USD (Gilt vs T-note), 4,629 days each; 44 and 51
first-day divergence episodes, 145 and 149 alignments. Next-20-session range vs
matched controls: EUR/USD divergence −0.51 ATR [−1.21, +0.19] (if anything calmer),
GBP/USD +0.16 [−0.86, +1.16]; alignment +0.10 / −0.28, all across zero. A pair
moving against its yield spread does not get "damaged" afterwards, and moving with
it does not get quieter. Closure: the standardised gap halved within 20 sessions in
64% / 71% of divergences — but the PAIR reversing toward the spread happened in
48% / 39%, against an unconditional 49% / 50% — no tendency; on GBP it was the
spread that gave (59%). Consistent with the banked yields → FX direction null and
with the Event Response Book's §6/§7. Divergence is description; the only
yield-spread object with a validated record here remains the 2Y spread's own
z-score mean reversion (YIELD_SPREAD_STRATEGY.md), which is a different thing.
n=44/51 is thin and stated as such.

### S12 — Lead-up × surprise → direction after FOMC, as a table. **The cell the
owner described has happened 7 times in ten years; nothing in the table clears
the pre-registered reading rule.**
84 meetings. Share HIGHER five sessions after the decision (bootstrap 95%):

| lead-up (Δ30Y, 20 sessions) × surprise (Δ2Y day 0) | n | SPX500 up | dollar up | gold up |
|---|---|---|---|---|
| 30Y up × hawkish | **7** | n<10 | n<10 | n<10 |
| 30Y up × neutral | 16 | 56% [31,81] | 75% [56,94] | 25% [6,50] |
| 30Y flat × neutral | 16 | 50% | 56% | 63% |
| 30Y down × neutral | 18 | 50% | 50% | 56% |
| all other cells | 2–8 | n<10 | n<10 | n<10 |

Margins: after a **hawkish** surprise (n=14) SPX up 36% [14,64], dollar up 64%
[43,86], gold 50%; after a **dovish** one (n=20) dollar up 35% [15,55]. After a
30Y **rise into** the meeting (n=31) gold was up only 29% [13,45] — the one
margin whose interval excludes 50%, and with 27 margin cells one is expected by
chance, so it is noted, not claimed. On the day itself the reaction is visible
but softer than the story: hawkish → SPX up 43%, dollar up 43%; dovish → SPX up
65%, dollar up 20% (the dovish reaction is the clearer one in this proxy).

Reading: the "30Y already moved, Fed more hawkish than expected, price sold off"
sequence is not a base rate — it is seven meetings, and the surrounding cells
sit on 50%. What the table does show is the shape of every registered null:
the day-0 reaction exists (weakly, in a daily proxy), and five sessions later
the shares are coin flips with wide intervals. Direction after the Fed is not
in this data at n=84, whichever way it is cut.

### S13 — Does watching more pairs add breadth? **Partial: N_eff scored, the
sleeve comparison and the full 26-pair Sharpe curve NOT RUN.**

`analysis/market_sense_studies.mjs`'s S13 needs FRED (the yield-spread sleeve's
foreign short rates) and OANDA (the full 26-pair + gold daily series), both
blocked in the session that ran this — see the environment note below. Only the
raw-instrument N_eff leg is scored here, run OFFLINE from local M1 parquet
(`analysis/coverage_funnel_local.mjs`, 25 of the 26 registry FX pairs — no
local NZD/CAD file — + gold, resampled to daily; 3,025 common trading days,
2016-01 → 2026-09):

| universe | N | N_eff (eigenvalue decomposition of the daily-return correlation matrix) |
|---|---|---|
| all 26 (25 local + gold) | 26 | **5.58** |
| 7 USD majors only | 7 | **2.41** |
| 18 crosses only | 18 | **4.71** |

This is exactly the shape the pre-registration's prior predicted: *"the dollar
factor should put N_eff for 26 FX pairs somewhere around 3–6."* It landed at
5.58 — inside that range, and the majors-only cut (2.41) says most of that
concentration is the dollar factor specifically, not FX in general. Read
plainly: 26 tickers watched is **~5.6 independent bets**, not 26. Crown's
"1,700 signals" needs the same audit before it means what it sounds like it
means; this desk's own 26-pair FX book alone loses ~80% of its nominal breadth
to one factor.

**Not run, and not claimed:** (b) the yield-spread sleeve's own N_eff and its
Sharpe-vs-universe-size curve (needs FRED; the code is written and reviewed in
`market_sense_studies.mjs`, committed, unexecuted) — this was already going to
be capped at the sleeve's real 6-pair ceiling, not the registered N=26, per
the scope note in that file. The registered pass bar (OOS Sharpe N=26 vs N=4,
≥0.3, CI clear of zero) needs both legs and neither ran to completion; nothing
here is scored against it.

### S14 — Does a multi-year regime break precede anything? **NOT SCORABLE —
episode counts came back too thin everywhere, on 3 of the registered 4
families (rates/credit not run at all).**

Same offline run, same "first close outside the trailing 3-year (756-session)
range, first time in ≥60 sessions" setup as registered, across FX majors (7),
FX crosses (18) and gold (1) — 26 series, 2016→2026. **Every single series
came back below the 40-episode MIN_N floor**: the qualifying-break count per
instrument ranged 4–11 (median 8) over the ~10.7-year local history. This is
mechanically expected, not a bug — a *first-in-3-years* break, cooled down to
one count per 60 sessions, on a 10-year window is a rare-event definition by
construction; getting 40+ of them needs either decades more history than the
local M1 cache has, or a shorter lookback/cooldown than the one that was
pre-registered. 0 of 3 attempted families clear (none could even be scored).
Rates/credit (DGS2/10/30, DFII10, T10YIE, HY, VIX, DXY — needs FRED) did not
run at all, so **the registered "≥3 of 4 families" bar cannot be evaluated
here on any reading** — at most 3 of 4 were ever attemptable offline, and none
of those 3 produced a scorable cell. Banked as: this setup's episode count is
too rare for the paired-bootstrap discipline at the window this desk pre-
registered; a real answer needs either more history or a loosened definition,
pre-registered again before re-running — not silently loosened here.

### S15 — The non-reaction: a big surprise, no move. **(b) generalized leg:
NULL. (a) oil leg: NOT RUN.**

(a) needs WTI daily bars, which exist nowhere locally in this repo (the M1
parquet cache is FX + gold only) — not scored, no oil-specific verdict exists
yet either way. (b) reran the S7-style surprise store **entirely from local
data**: `calendar_events.csv`'s own actual/consensus columns, z-scored per
(country, event) series (113 series with ≥20 prints each; 18,178 usable
release-pair rows) — not the live API S7 originally pulled from, but the same
raw feed underneath it. Top-decile |z| surprise, bottom-tercile same-session
reaction, directional share over the next 5/20 sessions in the surprise-
implied direction:

| pair | non-reaction episodes | next-5d share (implied direction) | next-20d share |
|---|---|---|---|
| EUR/USD | 321 | 54% [48, 60] | 52% [46, 57] |
| USD/JPY | 190 | 51% [44, 57] | 45% [38, 53] |
| GBP/USD | 46 | 48% [35, 63] | 59% [43, 72] |

AUD/USD and USD/CAD never accumulated a usable series — `calendar_events.csv`'s
AU/CA coverage for the five registered families (CPI, employment, GDP, rate
decision, PMI) is too thin locally to build a per-series z. All three scored
pairs clear the registered ≥40-episode floor; **none clears the registered
reading rule** (CI must exclude 50%) — every interval straddles it, EUR/USD's
tightest of the three at [48,60]. Consistent with the base case stated in the
pre-registration and with every other direction test on this desk: the "sleeping
surprise resolves in its implied direction" claim is null on the generalized
leg. The oil-specific case Crown actually described is still untested.

### S16 — Weird × technical, the conjunction. **NOT RUN.** Conditional on
S15(a), which did not run (no local WTI). Nothing to split.

### A note on how S13–S16 were run (2026-09-18)

This session's network egress was blocked to all four hosts
`analysis/market_sense_studies.mjs` needs for a full S13–S16 run — FRED,
OANDA, this desk's own Railway API, and CFTC (house convention, `CLAUDE.md`:
*"OANDA is reachable in Railway, not in the sandbox... that's environment, not
a bug"* — this run hit the FRED/Railway/CFTC version of the same thing). The
full harness is implemented and committed either way
(`analysis/market_sense_studies.mjs`), unexecuted. What's reported above ran
from a second, local-only script (`analysis/coverage_funnel_local.mjs`) built
specifically to answer the parts of S13–S16 that two files already in this
repo can answer with zero network calls: `VolRangeForecaster/data/m1/*.parquet`
(M1 bars, resampled to daily here) and `calendar_events.csv`. Its first run
silently corrupted 22 of 26 parquet files — they don't share one column
layout (four files carry two extra spread columns the rest don't, shifting
where `datetime` sits) — caught before any number below was written down, not
after; the fix reads each file's own schema instead of assuming a fixed
column index. **To get S13(b), S14's rates/credit family, S15(a) and S16: run
`node analysis/market_sense_studies.mjs S13,S14,S15,S16` from an environment
with that network access** (wherever S1–S12 were originally run).

## What changed on the page and in the briefs (2026-09-17)

- ✓ chip on SPX500 / NAS100 / XAU / USD/JPY cards while VIX ≥ VIX3M: "wider week
  likely", with the S1 numbers.
- ✓ chip on the clock tier when today's high-impact event for the pair's currency
  is an employment, CPI, GDP, PMI or rate-decision release on a pair where S7
  passed, with that cell's number; CPI notes the next-session effect.
- The chain's oil → breakevens row and the real-yield → dollar / gold rows carry
  the S4 and S5 findings in their text.
- The "priced in" line says the S6 null.
- The FOMC block in the brief and the evidence ledger carry S9: a decision-day
  move fades at the same rate as any big day; do not narrate a Fed-specific
  "second move" as if it were a tendency.
- Both AI prompts (morning brief, chain read) receive a TESTED ON THIS DESK block
  listing every verdict above, and are told to lean on it before folklore and to
  say "tested null here" when they touch a nulled relationship.
