# Day reconstruction M7/M8: path-book decision rules

**Status:** FROZEN 2026-10-29 (owner-approved). Committed with `forge/DAY_RECON_REACH_CALIBRATION_PREREG.md` (M6) before
any M6 outcome code existed. M7's full pre-registration, written after the M6 review, must adopt these rules unchanged.
No M6 or M7 outcome may be used to alter them.

**Programme:** M6 (reach, p90 boundary, timing) → M7 (post-touch path and excursion book, under these rules) → M8
(forward validation, only if M7 triggers and only after separate approval) → one consolidated evidence book. GOLD, NQ and
EURUSD; Fixed OH/OL and Projected H/L kept separate; M2 archive only; lockbox (after 2026-08-21) sealed.

### R0. Three separate conclusions

The book records three kinds of finding separately. One never stands in for another.

| Conclusion | Statistic | What it can't establish |
|---|---|---|
| **Behaviour**: what price does after a touch | category shares; magnitude and time distributions | anything about expectancy or forecast-specificity |
| **Forecast-specificity**: does it differ at forecast lines from comparable lines | forecast − B2 placebo, for shares (Δ share) or expectancy (Δ_EV) | that the behaviour pays |
| **Expectancy**: does a reference race have positive behavioural expectancy | per-touch EV in R against the cost hurdle | forecast-specificity (needs Δ_EV), or an executable strategy (needs separate trading validation) |

### R1. Unit, orientation and references

- **Unit:** first touches of p50 and p75.
  - M5's exclusions apply, plus R1-x below.
  - Point-in-time era (2020-08-21 → 2026-08-20), with 2016–20 as the sign check.
  - Fixed OH/OL and Projected H/L separate, per instrument.
  - p90 is excluded, because it has no next rung; M6 Part B covers it.
- **Side:** s = +1 for an upper-level touch (OH, ProjH); s = −1 for a lower-level touch (OL, ProjL).
  - At an **upper** touch, **continuation is up** and a **fade is down**.
  - At a **lower** touch, **continuation is down** and a **fade is up**.
- **Entry reference E:** the close of the touch bar k. All path measurement starts at bar k+1.
- **References:** N = the next rung outward; P = the previous rung (the open, for p50); O = the open.
  - For projected levels, N and P are frozen at their touch-bar prices.
- **Oriented position** at any price x: z(x) = s · (x − E) ÷ scale, in σ, where scale = open × σ_used. Positive means
  continuation.
- **Distances:** a = z(N) > 0 (σ to the next rung, ahead); b = −z(P) > 0 (σ to the previous rung, behind).
- **R1-x. Excluded and counted:**
  - touches with a ≤ 0 or b ≤ 0, i.e. the touch bar closed at or beyond N or behind P;
  - touches with a < 0.10σ or b < 0.10σ, for the expectancy statistic only. Payoff ratios explode and spread dominates.
    **Decision D1 (approved).**
- **Reached:**
  - N is reached at the first bar j ≥ k+1 where the bar's extreme trades through N in the continuation direction (high if
    s = +1, low if s = −1). P is reached the same way, in the fade direction.
  - The comparison rule is the archive's own rule for `next_<level>_min`.
  - The M7 build must agree exactly with the archive on fixed levels. The disagreement rate on projected levels (frozen
    vs moving references) is reported.
- **Horizon:** the session's last bar, `t_last` (22:00 London or earlier on short sessions). close_end = that bar's close.
- **Data:** M1 mid prices from the path parquet. Exits are at exactly N or P, with no slippage: this is behavioural, not
  execution. Bars that open already beyond N or P (data gaps) are counted and reported, not adjusted.

### R2. Path categories (behaviour)

| Category | Definition |
|---|---|
| 1. Direct continuation | N reached first; min z before N > −0.25σ |
| 2. Pullback then continuation | N reached first; min z before N ≤ −0.25σ |
| 3. Reversal then recovery | P reached first; N reached later, by the last bar |
| 4a. Failed, held above the open | P reached first; N not reached; O not reached (p75 only) |
| 4b. Failed, deep reversal | P reached first; N not reached; O reached (for p50, P is O, so every p50 failure is 4b) |
| 5a. Stalled | neither reached; max z < 0.25σ and min z > −0.25σ |
| 5b. Unresolved with movement | neither reached; otherwise |
| U. Unordered | N and P first reached in the same bar |

- **Why 0.25σ:** the programme's move unit (M3, M4), and about half the median rung gap of 0.44–0.48σ, which comes from
  forecast inputs, not outcomes.
- **Reported within each category, as full distributions:**
  - further travel: max z after the touch;
  - retrace depth: −min z before the decisive event;
  - time to N, P or O;
  - adverse movement before the decisive event.

**Bar-level resolution: gaps, same-bar events and ordering.** The path is M1 bars (open, high, low, close). Events are
ordered **between** bars only, never within a bar. One rule applies to every bar:

- **First-reach bars.** j_N = the first bar j ≥ k+1 at which N is reached under R1's rule (high ≥ N if s = +1, low ≤ N
  if s = −1, the archive's comparison); j_P likewise in the fade direction; j_O likewise for the open. A reference never
  reached by the last bar has j = ∞.
- **Gap bars.** A bar whose **open** is already at or beyond a reference reaches that reference at that bar, by the same
  comparison (its high or low is then also beyond it). Nothing else about the bar is treated differently.
- **First event.** j_N < j_P → N first; j_P < j_N → P first; j_N = j_P (finite) → U; both ∞ → neither.
- **The open is not used to order events inside a bar.** A bar that opens beyond N and also trades to P is U, like any
  other bar that reaches both. The data can show that both happened in that minute, not which came first under this
  rule, and the archive (which records each reference's first bar and treats equal minutes as unordered) and M3–M5 use
  the same convention. U is scored −1 in both races (D2).
- **"Before an event."** Any quantity measured before the decisive event (min z for categories 1 and 2, retrace depth,
  adverse movement) uses E and bars k+1 … j_event − 1 only. The decisive bar's other extreme is not used, because its
  timing relative to the event inside the bar cannot be established. If the event is at bar k+1, the quantity is taken
  from E alone (z = 0).
- **Later events.** Category 3 needs N at a bar strictly after j_P (j_N > j_P holds by construction once P is first).
  Categories 4a/4b need only whether O is reached at any bar k+1 … last: O lies beyond P on the fade side, so reaching O
  implies P has been reached by that bar, and no ordering is needed.
- **Valuation.** A reference reached in a gap bar is valued at the reference price exactly (R1: no slippage, not
  adjusted).
- **Reported (affected observations),** per instrument × family × rung, forecast and each phantom factor:
  - touches whose decisive bar opened at or beyond the reference it reached ("gap-resolved"), by category and by race
    outcome, with the gap distance beyond the reference in σ (median and maximum);
  - U touches, split into those whose bar opened beyond N or P and those whose bar did not.

  These counts change no classification or payoff.

**Mutually exclusive and exhaustive.** Every eligible touch falls into exactly one of four first-event branches:
1. N first;
2. P first;
3. both in the same bar (U);
4. neither by the last bar.

Within each branch the split is a single comparison:
- N first: min z against −0.25σ, giving 1 or 2;
- P first: N reached later or not, then for p75 failures O reached or not, giving 3, 4a or 4b;
- neither: max z and min z against ±0.25σ, giving 5a or 5b.

So the categories cover every outcome with no overlap by construction. The build **asserts** that each eligible touch
gets exactly one label and that the counts add up to the eligible total. If that fails, the run stops before any
statistic is computed.

**Archive agreement check.** This runs before any category share or expectancy is computed.
- **Fixed levels:** for every eligible touch, the bar at which the M7 path first reaches N, P and O must equal the
  archive's `next_<N>_min`, `next_<P>_min` and `next_Open_min`. Both use the same side convention (the touch-bar close)
  and start at bar k+1.
- **Required agreement is 100%.** Any disagreement stops the run, and the disagreements are reported before anything else
  proceeds.
- **Projected levels** (frozen references vs the archive's moving ones): the disagreement rate is reported, not required
  to be zero.

**Counts reported** per instrument × family × rung:

| Reported | Detail |
|---|---|
| Touches | total |
| Exclusions | by reason: M5's set; a ≤ 0 or b ≤ 0; a or b < 0.10σ (expectancy only) |
| U | unordered cases |
| Gap bars | bars opening beyond N or P, as above |
| Categories | each count |
| Check | assigned total = eligible total |

### R3. Per-touch expectancy

**Status:** EV is a **behavioural reference-race statistic**. It measures how price paths resolve against the ladder's own
rungs. It is **not an estimate of strategy returns**: no fills, slippage, execution rules, sizing or account costs are
modelled. The cost hurdle is only a materiality bar.

There are two **reference races**. They use the ladder's own rungs and are behavioural yardsticks, not trade designs.
Payoffs are defined per touch i, in R of that race (R_i = that race's stop distance in σ):

| Outcome for touch i | Fade (R_i = a_i; target P, stop N) | Continuation (R_i = b_i; target N, stop P) |
|---|---|---|
| P reached first | +b_i / a_i | −1 |
| N reached first | −1 | +a_i / b_i |
| N and P in the same bar (U) | −1 | −1 |
| Neither by the last bar | −z(close_end) / a_i | +z(close_end) / b_i |

- **Unresolved values:** the oriented move to close_end ÷ that race's R. For the fade this is positive when price ends
  on the fade side of E; for continuation, when it ends on the continuation side. Because neither reference was reached,
  the value lies strictly between −1 and the win payoff.
- **Unordered counts as −1** in both races. This is strict, and the M3 convention. **Decision D2 (approved)**; EV with U
  touches excluded is reported as a sensitivity and changes no classification.
- **Cell EV:** the mean of payoff_i over every eligible touch, unresolved included. This per-touch mean is the only
  definition.
- **The shorthand:** EV = p_F·(b/a) − p_C + (unresolved term) is an illustration that holds only when a and b are the
  same for every touch. It is never used for computation.

**Unresolved decomposition.** Reported for every cell, forecast and placebo:
- **unresolved share:** n_unresolved ÷ n;
- **resolved contribution:** (1/n) · Σ payoffs of resolved and U touches;
- **unresolved contribution:** (1/n) · Σ payoffs of unresolved touches;
- **mean unresolved payoff** (per unresolved touch).

The two contributions add up to EV exactly. Each has a bootstrap interval. They show how much of EV comes from the 22:00
close convention. No alternative valuation of unresolved touches is computed. These are reporting columns, not a variant.

- **Break-even** is EV = 0.
- **Readability column:** for each cell, the mean of a_i/(a_i+b_i) (fade) or b_i/(a_i+b_i) (continuation) is reported
  as the share-only break-even among resolved touches. It is labelled descriptive.

**Cost hurdle (materiality bar, not an execution-cost model).** Every quantity is per touch i, in the race being scored:

| Quantity | Definition | Units |
|---|---|---|
| c_I, spread cost | the instrument's median bid/ask spread at the touch minute, one spread per round trip, divided by scale (open × σ_used) | σ |
| R_i, race risk distance | a_i for the fade, b_i for continuation: the same R_i that scales payoff_i | σ |
| k_i, spread cost in R | c_I ÷ R_i | R |
| h_i, per-touch hurdle | max(2 × k_i, 0.05) | R |
| H, cell hurdle | (1/n) · Σ h_i over exactly the eligible touches and race that enter that cell's EV (D1 exclusions applied) | R |

- **Frozen c_I**, copied from `analysis/output/day-reconstruction/m3/REPORT.md` §6, whose ±0.5σ column states the spread
  in R of a 0.5σ race (so c_I = 0.5σ × that entry): GOLD 0.5 × 0.04 = **0.020σ**; NQ 0.5 × 0.01 = **0.005σ**; EURUSD
  0.5 × 0.07 = **0.035σ**.
- **Why 2× and 0.05R:** the M5 convention (`forge/DAY_RECON_APPROACH_PATH_PREREG.md`): twice the spread, with a 0.05R
  floor because M4 showed that pricing exits at the level overstates real fills by about that much.
- **Consistency with EV:** EV and H are means over the same touches with the same per-touch R_i, so T2 condition 2
  (EV_fc ≥ H) is the same statement as mean(payoff_i − h_i) ≥ 0. H is **not** max(2 × c_I ÷ mean R, 0.05), which differs
  whenever R varies.
- **Range under D1:** R_i ≥ 0.10σ, so h_i is at most 0.40R (GOLD), 0.10R (NQ) and 0.70R (EURUSD).
- **Where it applies:** forecast EV only (T2 condition 2). The placebo enters through Δ_EV (condition 3), unchanged. In
  the untagged-day sensitivity, H is recomputed on the same subset.

**Placebo:**
- The identical per-touch calculation is run at each phantom ladder (×0.70/0.85/1.15/1.30). Each uses its own N, P, E,
  a and b, on the same days and path.
- EV_pl = Σ_f w_f · EV(f), with w = (−1/6, 2/3, 2/3, −1/6).
- Δ_EV = EV_fc − EV_pl.

**Not in the race:** overshoot and adverse-move distributions are reported beside EV but never change the race.
Alternative stops or targets are execution design and out of scope.

### R4. Uncertainty

- A paired date bootstrap: B = 2000, seed 20261030, with one Poisson(1) weight per calendar date shared by forecast and
  all phantom touches.
- 95% percentile intervals; two-sided p = 2 × min(share ≤ 0, share ≥ 0), floor 1/B.
- **Untagged-day sensitivity:** untagged days excluded. A result that depends on them is flagged.

### R5. Triggers for M8

**T1: forecast-specific behaviour.**
- **Cells:** instrument × family × rung × category, using all touches.
- **Statistic:** Δ share = forecast − B2 phantom share.
- **Family:** one BH family at q < 0.10.
- **Trigger:** BH-significant, |Δ| ≥ 5pp (**D3**), and the same sign in Y1–Y3, Y4–Y6 and 2016–20.
- **What it supports:** the forecast-specificity and behaviour conclusions only. It permits **behavioural** forward
  validation, never a trading stage. Its EV is reported but not claimed.

**T2: forecast-specific expectancy.**
- **Cells**, marginal, not crossed: instrument × family × rung × race (fade or continuation) × condition level. The
  condition levels are:
  - all touches;
  - the 4 M6 Part C time windows (by touch-bar time);
  - range-used terciles: fixed levels only, boundaries from point-in-time features only, frozen in M7's
    pre-registration before outcomes;
  - M5's frozen P1 terciles;
  - M5's frozen P2 terciles.

  That is about 150 cells × 2 races.
- Cells with fewer than 150 eligible touches, counted from features before outcomes, are descriptive and outside the
  family.
- **Family:** one BH family at q < 0.10.
- **Triggers only if all four hold:**
  1. EV_fc > 0, BH-significant;
  2. the EV_fc point ≥ the cell hurdle H (R3);
  3. Δ_EV's 95% interval excludes 0 and its point ≥ 0.05R;
  4. EV_fc and Δ_EV have the same sign in Y1–Y3, Y4–Y6 and 2016–20.

**Recorded, not triggering:**
- **Market-wide expectancy:** EV meets conditions 1, 2 and 4 but not 3. Banked as "market-wide, not forecast-specific"
  context (**D4**).
- **Category or magnitude differences** without a trigger are banked as behaviour.

### R6. How M7 and M8 results map to the framework's labels (for the synthesis)

| Label | Required evidence |
|---|---|
| **"Fade worth considering"** at a level type and condition | a T2 fade cell **confirmed by M8**. Before M8: "candidate, unconfirmed" |
| **"Continuation more likely than the spacing implies"** | a T2 continuation cell confirmed by M8, same status rule |
| **"Insufficient evidence"** | everything else (the default), shown with the effect sizes ruled out |
| Always shown, descriptive | category shares, magnitudes, times and adverse moves with intervals. Raw "which level first" probabilities are labelled as mostly reflecting distance |

None of these labels validates an executable strategy.

### R7. Hard stop

**If neither T1 nor T2 triggers:**
- The direction programme on the existing production ladder closes and the synthesis follows.
- **Recording:**
  - "No tested effect met the pre-registered evidence standard";
  - per cell, the effect sizes its interval rules out (e.g. "fade EV above +x R excluded at 95%");
  - the cells that remain underpowered;
  - the conditions that were never tested.
- **Not claimed:** that no directional effect can exist.
- **No additions:** no new conditions, thresholds, variants or studies in response.

### R8. M8: forward validation (only if T1 or T2 triggers)

- **What is validated:** exactly the triggering statistic in the same cell, with the frozen M7 code: Δ share for T1;
  EV_fc and Δ_EV for T2.
- **Data and approval:**
  - **The lockbox is not accessed** under these rules.
  - **If M7 triggers**, nothing starts automatically. The exact M8 plan is returned for separate owner approval first:
    - the triggering cells;
    - V, D and touches per session from M7;
    - δ_plan;
    - the computed sample size and sessions;
    - the feasibility verdict against the 500-session cap;
    - start date, look dates and data source (forward sessions, plus the lockbox only if the owner approves it then).
- **Planning effect:**

  | Trigger | δ_plan |
  |---|---|
  | T1 | max(½ × M7 estimate, 3pp) |
  | T2 | max(½ × M7 EV, cell hurdle) |

  Halving the M7 estimate allows for winner's curse (selection among many tests).
- **Sample size:**
  - required touches n = (1.645 + 0.842)² × V × D ÷ δ_plan²;
  - V is M7's per-touch variance of the statistic, D its day-cluster design effect;
  - sessions = n ÷ M7's touches per session in that cell.
- **Feasibility cap:** above **500 sessions** (**D5**), M8 isn't started. The finding is banked "M7 only, unconfirmed:
  validation infeasible at this effect size".
- **Looks:** one final analysis. One non-binding futility look at 50%: stop if the point estimate ≤ 0. No early stop for
  success.
- **Success:**
  - the one-sided 95% lower bound is above 0;
  - for T2, also the EV point ≥ hurdle and Δ_EV's lower bound > 0;
  - at most 3 cells, chosen by M7 z-score, Holm-adjusted;
  - estimates and intervals are reported whatever the outcome.
- **If M8 fails:** that finding is closed. Go to synthesis.
- **Behaviour vs trading:** M8 validates behaviour only (mid prices, reference races, cost hurdle as a materiality bar).
  Trading validation is a separate later stage outside this programme, with its own pre-registration and owner approval.
  It would cover bid/ask fills, slippage, account costs and swap, stop and target design, sizing and live execution. It
  is open only to an M8-confirmed T2 cell.

### R9. Complete evidence reporting

**Every tested T1 and T2 cell is recorded**, whether or not it is significant. Descriptive cells (fewer than 150 touches)
are recorded too, marked as outside the BH family.

| Column | T1 cells | T2 cells |
|---|---|---|
| instrument, family, rung, condition level, race or category | ✓ | ✓ |
| n eligible touches (forecast; each phantom factor) | ✓ | ✓ |
| forecast estimate (share or EV) with 95% interval | ✓ | ✓ |
| B2 placebo estimate with interval | ✓ | ✓ |
| Δ (share or EV) with interval, raw p, BH-adjusted result | ✓ | ✓ |
| unresolved share, resolved and unresolved contributions | ✓ (as context) | ✓ |
| cost hurdle H, and EV − H | — | ✓ |
| Y1–Y3, Y4–Y6 and 2016–20 estimates (sign stability) | ✓ | ✓ |
| untagged-days-excluded estimate | ✓ | ✓ |
| **effect sizes ruled out**: the interval bounds as statements, e.g. "Δ above +x excluded at 95%" | ✓ | ✓ |
| classification: triggered / market-wide context (T2) / underpowered / ruled out beyond ±x | ✓ | ✓ |

The full tables go in M7's results files and the Evidence Book entry. The synthesis summarises them but doesn't replace
them.

### Decisions (settled 2026-10-29)

| # | Decision |
|---|---|
| D1 | Expectancy excludes touches with a or b < 0.10σ (counted from features before outcomes) |
| D2 | Unordered (same-bar N and P) touches score −1R in both races; "excluded" reported as a sensitivity only |
| D3 | T1 materiality threshold 5pp |
| D4 | Market-wide expectancy (fails the placebo condition) does not trigger M8 |
| D5 | M8 feasibility cap 500 sessions; no lockbox access unless separately approved after a trigger |
