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

## What changed on the page and in the briefs (2026-09-17)

- ✓ chip on SPX500 / NAS100 / XAU / USD/JPY cards while VIX ≥ VIX3M: "wider week
  likely", with the S1 numbers.
- ✓ chip on the clock tier when today's high-impact event for the pair's currency
  is an employment, CPI, GDP, PMI or rate-decision release on a pair where S7
  passed, with that cell's number; CPI notes the next-session effect.
- The chain's oil → breakevens row and the real-yield → dollar / gold rows carry
  the S4 and S5 findings in their text.
- The "priced in" line says the S6 null.
- Both AI prompts (morning brief, chain read) receive a TESTED ON THIS DESK block
  listing every verdict above, and are told to lean on it before folklore and to
  say "tested null here" when they touch a nulled relationship.
