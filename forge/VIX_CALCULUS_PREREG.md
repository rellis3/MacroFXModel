# vix-calculus: C.OG's calculus framing of VIX, VVIX and the Nasdaq (Brownian scaling, integration, second derivatives, Garin's intraday rule out of sample, and the VX-futures test)

**Pre-registered 2026-10-23, before any outcome in this file was computed.** The data downloads (VIX 5-minute bars from
IB, VX futures settlements from CBOE) were started before this file was written. Neither download computes an outcome.

| | |
|---|---|
| ID / ledger ids | `vix-calculus`; scored questions `vix-brownian-scaling` (A), `vix-integral-gaps` (B), `vix-second-derivative` (C), `garin-vix-intraday-oos` (D), `vix-ratio-vx-futures` (E) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `vix-calculus` |
| Data | **A, B, C:** the `vvix-nasdaq-ratio` daily panel (VIX, VVIX, VXN, VIX3M, VIX9D from CBOE; NASDAQ100 from FRED), 2009-09-14 → 2026-08-21, 4,259 sessions. **D:** VIX 5-minute RTH bars from IB Gateway (`analysis/output/vix-calculus/data/VIX_5m.parquet`) and OANDA M1 SPX500 / NAS100 CFDs as ES / NQ stand-ins (`VolRangeForecaster/data/m1/`), 2016-01 → 2026-08-21. **E:** CBOE VX futures daily settlements per contract (`vx_settle.parquet`), 2013 → 2026-08-21. Lockbox: nothing after 2026-08-21 is scored. |
| Seed | `20261023` |
| Uncertainty | **A–C, E:** OLS with Newey–West (lag = horizon), 200 shifted-signal placebos (A has none, being descriptive). **D:** session-clustered bootstrap, 2,000 draws. |
| Scripts / outputs | `scripts/vix-calculus/` → `analysis/output/vix-calculus/`; results page `vix-calculus.html` |
| Harness | own scripts; A–C and E reuse `scripts/vvix-nasdaq-ratio/model.py` (`fit`, `CONTROLS`) |

## 1. The claim (required)

C.OG, VIP Discord, 2026-10-23 (screenshots shared by Rich; record in `education/cog-snippets.md` §3c):

> 12:24 Are you familiar with stuff like differentiation and integration?
> 12:25 That will be very useful. An example is when @Garin speaks about bonds. Within the bond structure pricing the
> discounted cash flows can be represented as integrals when payments are continuous. Same with stuff like brownian
> motion and stochastic modeling they use integrals to describe how random processes accumulate over time.
> 12:29 How quickly the ratio is changing could be modelled as dR/dt. Where R is the relative change of vix % at time
> t / the relative change of Nasdaq % at time t. Just make sure to factor in the sign as they're negatively correlated.

From the same thread:

- **Jordan (12:45)** wrote the per-Δt pricing card: "Nasdaq move priced in, per Δt = VXN·√Δt; VIX move priced in,
  per Δt = VVIX·√Δt; VIX % per 1% Nasdaq: R = VVIX / VXN".
- **Garin (12:15)**, which C.OG called "a good explanation": VIX spot can't be traded; VIX futures price where VIX is
  expected to be and usually sit above spot (contango), "so backtesting spot VIX could possibly overstate what's
  actually able to capture".
- **Garin's own intraday study**, shared the same day (`education/friend-vix-ratio-intraday/NOTES.md`): "When VIX
  reacts hard, ES leans up afterwards". It is in-sample 2016–2020, hourly readings of the VIX-per-index ratio since
  10:00 ET.

## 2. Why it is not already settled (required)

**Prior art on main** (`js/deskEvidence.js`, `.claude/skills/cog-knowledge/references/verdicts.md`, the register):

- `vvix-nasdaq-ratio` (banked 2026-10-23) tested ratio *levels*: realised VVIX/NDX, realised VIX/NDX, and the implied
  VVIX/VXN (Jordan's R).
  - `vvix-ratio-range` VALIDATED: top decile → VIX about −7% over 20 sessions.
  - The implied-ratio cell failed Holm (t −2.95).
  - Nasdaq direction UNDERPOWERED.
  - Its "next" asked for a costed VX-futures test, which is **part E**.
- `vix-nasdaq-beta` (banked 2026-10-23) tested the signed beta level (nothing beyond the above) and **first-order dR/dt**
  (`vix-beta-change` VALIDATED research-only: bottom decile → Nasdaq +0.57% over 5 sessions).
- `iv-forecast` found IV adds to range forecasts and a "direction / VRP null", on FX/gold products, not the Nasdaq or
  VIX VRP.
- The realised-over-implied Nasdaq vol ratio has only been used as a **control**, never scored.

**Not yet tested anywhere:**

- (A) whether the IV·√Δt (Brownian) pricing of Jordan's card is calibrated across horizons for the Nasdaq and for the
  VIX, and whether VVIX/VXN equals the realised VIX-per-Nasdaq slope;
- (B) the *integrals*: accumulated squared returns against what was priced (variance risk premia for the Nasdaq and for
  the VIX), and the accumulated VIX move the Nasdaq did not explain;
- (C) the *second* derivative d²R/dt², and dR/dt of the implied ratio;
- (D) Garin's intraday rule on years he did not use;
- (E) the validated VIX give-back measured on tradable VX futures.

None of these is a banked null being re-dressed.

## 3. Definitions, fixed in advance (required)

### Common to A, B, C (daily)

- Entry is the close of d+1.
- Outcomes:
  - `ret5`, `ret20`: ln NDX change from the d+1 close;
  - `dvix20`: ln VIX change, d+1 → d+21;
  - `range20`: ln of realised 20-session NDX vol over VXN, starting d+2.
- Each outcome is standardised by its full-sample SD for reporting only. The test is the t-statistic, which doesn't
  depend on that scaling.
- Controls `CONTROLS` of `model.py`: VIX percentile, VIX > VIX3M, VIX9D/VIX, NDX 20-day return, NDX rv20/VXN.
- Extremes: each construction's percentile within its last 252 sessions (≥ 200 known, today included). `hi` = ≥ 90%,
  `lo` = ≤ 10%.
- Splits: discover 2009–2015, validate 2016–2020, test 2021 → 2026-08-21.

### A — Brownian scaling (descriptive calibration; verdict CONTEXT unless a registered expectation fails)

**A1. Expected absolute move ratio.** For each h ∈ {1, 5, 10, 20} sessions:

κ_N(h) = mean |ln NDX(d+h) − ln NDX(d)| ÷ mean[ VXN(d)/100 · √(h/252) · √(2/π) ]

The √(2/π) makes an exactly-priced Brownian motion give κ = 1. κ_V(h) is the same for ln VIX with VVIX. The CI is a
block bootstrap with blocks of h sessions.

**A2. Variance ratios.** VR(h) = Var(h-session log change) ÷ (h · Var(1-session)), for NDX and for ln VIX, h ∈ {5, 10,
20}. Brownian means VR = 1. The CI is a 20-session block bootstrap.

**A3. Jordan's R against the realised slope.** The ratio of the 20-session realised |β| (`vix-nasdaq-beta`'s B_level,
sign flipped) to VVIX/VXN on the same day. Reported as its median, and how it varies with the realised VIX–NDX
correlation.

**Registered expectations:**

- (a) κ_N(h) < 1 at every h (implied above realised, a positive VRP).
- (b) VR_N(20) within [0.8, 1.2].
- (c) κ_V(20) < κ_V(1) and VR_V(20) < 0.7 (VIX mean-reverts, so VVIX·√Δt overstates long-horizon VIX moves).
- (d) A3's median ≈ |ρ| ≈ 0.6–0.8 (the card omits the correlation).

**Verdict:** CONTEXT, with each expectation marked held / failed.

### B — Integrals (24 scored cells, Holm 24)

- **B1. Nasdaq VRP.** `vrpN = (VXN/100)² − 252 · mean_{20}(Δln NDX²)`. This is the priced variance minus the
  accumulated (integrated) realised variance over 20 sessions. Because B1 *is* the rv20/VXN control re-expressed, **B1
  cells drop `c_rv20_over_vxn` from the controls**.
- **B2. VIX VRP.** `vrpV = (VVIX/100)² − 252 · mean_{20}(Δln VIX²)`.
- **B3. Accumulated unexplained fear.**
  - `F20(d) = Σ_{k=d−19..d} (Δln VIX_k − β̂ · Δln NDX_k)`.
  - β̂ is the VIX-on-NDX slope over the 252 sessions ending d−20, so it's estimated outside the window being summed.
  - Positive means the VIX rose more than the Nasdaq accounts for.
  - **B3 cells add the banked `R_b_hi`, `R_b_lo` flags as controls**, so it must add something beyond `vvix-ratio-range`.
- Cells: 3 constructions × 2 tails × 4 outcomes = 24.

### C — Second derivatives (16 scored cells, Holm 16)

- **C1. d²R/dt².** `B_change(d) − B_change(d−5)`, with B_change as in `vix-nasdaq-beta`. **The cells add the
  `B_change_hi`, `B_change_lo` flags as controls**, so it must add something beyond the banked dR/dt.
- **C2. dR_imp/dt.** `ln(VVIX/VXN)(d) − ln(VVIX/VXN)(d−5)`. **The cells add `R_c_hi`, `R_c_lo` as controls.**
- Cells: 2 × 2 × 4 = 16.

### Gate for B and C

A cell is **VALIDATED** when all three hold:

- Holm α 0.05 within its part;
- the same sign in all three periods;
- |t| above its shifted-signal placebo p95.

Otherwise it is **NULL** when its 95% interval lies inside ±0.2 SD, or **UNDERPOWERED** when it doesn't. A part's
ledger verdict is VALIDATED if any of its cells is, and its entry lists them.

### D — Garin's intraday rule, out of sample (4 scored cells, Holm 4, one-sided in his stated direction)

Reproduced from his description:

- **Instruments:** ES ≈ SPX500 CFD, NQ ≈ NAS100 CFD (OANDA M1).
- **Reading times:** 11:00, 12:00, 13:00, 14:00, 15:00, 16:00 ET on full RTH days. A day with no VIX bar or index bar
  at 10:00 or the reading time is skipped, and the count is reported.
- **Prices:**
  - index price at time T: the close of the last M1 bar starting before T;
  - VIX price at T: the close of the 5-minute bar ending at T.
- **Ratio:** R*(T) = −(VIX % change 10:00→T) ÷ (index % change 10:00→T). Sign-adjusted, so bigger means the VIX is
  reacting harder against the index. Readings where |index % change| < 0.01% are skipped, because the ratio is
  undefined there; the share skipped is reported.
- **Buckets:** terciles of R*, cut **per index on 2016–2020 only** (his sample), applied unchanged to 2021+. Barely /
  Middle / Hard.
- **Day type:** index down or up 10:00 → T.
- **Outcome:** the index log change from T to 16:55 ET, divided by that index's SD of the same T→16:55 change over the
  previous 60 sessions (causal; his "units of its normal move").
- **Test period:** 2021-01-04 → 2026-08-21.
- **Cells:** Hard − Barely mean outcome, for ES-down, ES-up, NQ-down and NQ-up.
  - One-sided p (Hard > Barely, his stated direction for ES). The session-clustered bootstrap draws whole days, so a
    day's six readings move together.
  - Holm across the 4.
  - A cell passes if its Holm-adjusted p < 0.05 **and** Hard − Barely > 0 in at least 4 of the 6 calendar years
    2021–2026.
- **Ledger verdict:** VALIDATED if **both ES cells** pass. NULL if both ES cells' 95% intervals exclude his in-sample
  difference (ES-down +0.12, ES-up +0.10) and lie inside ±0.05. Otherwise UNDERPOWERED. The NQ cells are reported with
  the same rule. He found no NQ pattern, and we register the expectation that NQ fails.
- **Also reported, not scored:** his 2016–2020 table recomputed by our code. This is the reproduction check: if our
  in-sample numbers differ in sign from his, the definitions differ, and that is written up before the out-of-sample
  result is interpreted.

### E — the validated VIX give-back on VX futures (2 scored cells, Holm 2)

- **Contract held:** the nearest VX contract with ≥ 35 calendar days to expiry at the d+1 close. It is held 20 sessions
  and never rolled within the hold.
- **Outcome:** ln F(d+21) − ln F(d+1) of that same contract.
- **Cells:** `R_a_hi` and `R_b_hi` (the banked top-decile flags) → outcome, with the `vvix-nasdaq-ratio` controls, NW
  lag 20, placebos, and three periods (2013–2016, 2017–2020, 2021–2026-08-21).
- **Gate:** Holm 2 at α 0.05, negative sign in all three periods, above the placebo.
- **Also reported:**
  - the same cell with spot ln VIX on the same 2013+ dates, which shows how much of the spot effect a futures holder
    captures;
  - a descriptive non-overlapping short-VX rule, net of 0.10 VX points round trip.
- **Ledger verdict (`vix-ratio-vx-futures`):** VALIDATED if both cells pass. NULL if the interval lies inside ±0.2 SD.
  Otherwise UNDERPOWERED.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| A | Is IV·√Δt calibrated? | Nasdaq: roughly Brownian, implied > realised. VIX: strongly mean-reverting, so VVIX·√Δt overstates 20-day moves. Jordan's R overstates the slope by about 1/\|ρ\|. |
| B1 | Nasdaq VRP extremes | Possible positive Nasdaq drift after a high VRP (literature, at longer horizons). Weak at 5/20 days. |
| B2 | VIX VRP extremes | Possible VIX mean-reversion read; sign not predicted. |
| B3 | Accumulated unexplained fear | Largely the banked `vvix-ratio-range`; expect little beyond it. |
| C1 | d²R/dt² beyond dR/dt | **Null**: second differences of a noisy slope are mostly noise. |
| C2 | dR_imp/dt beyond the implied level | Possible; sign not predicted. |
| D | Garin's ES lean on 2021–2026 | **Underpowered / small**: his in-sample rank correlations were 0.00–0.12. |
| E | The VIX give-back on futures | **Smaller than spot**, because contango already prices part of it. Possibly still negative. |

## 5. Power (required)

- **A:** descriptive, with intervals reported.
- **B, C:** the same panel, regression and outcomes as `vvix-nasdaq-ratio`. Its planted-signal power applies
  (`analysis/output/vvix-nasdaq-ratio/power.json`): at Holm-24, 80% power needs ≈ 0.35 SD at 5 days and ≈ 0.6 SD at
  20 days. Holm 16 is slightly easier.
- **D:** before scoring, a planted check runs on **2016–2020 only**, which is Garin's sample, not the test period.
  - It adds +δ normal-moves to Hard-bucket outcomes, runs the exact D pipeline on that period's day count scaled to the
    test period's, and reports the δ with 80% power.
  - The result is written as a PRE-RESULTS amendment before the 2021+ outcomes are read.
- **E:** about 3,400 sessions, 20-session outcome. Expected 80% power ≈ 0.65 SD. Checked with the same planted method on
  2013–2016 before scoring, as a PRE-RESULTS amendment.

## 6. Multiplicity (required)

- **Scored:** A 0 (descriptive), B 24, C 16, D 4, E 2. Holm is applied within each part, because each part answers a
  separate question and gets a separate ledger id.
- The family total is 46 scored cells. A Holm-46 view across all of them is also reported, and any cell that passes
  within its part but fails Holm-46 is flagged in RESULTS.
- **Descriptive:** event paths, D's in-sample reproduction, E's net-of-cost rule.

## 7. What this does NOT test (required)

- An exact intraday dR/dt on VVIX/VXN: the intraday VVIX and VXN legs have about 60 days of history, so this is forward
  only.
- Bond-pricing integrals: C.OG's bond example was an analogy, and the rates legs are covered elsewhere.
- Any execution of D as a strategy with costs. D asks only whether his measured lean holds out of sample.
- Anything after 2026-08-21.

## 8. What each verdict changes (required)

- **A:** whatever the result, it goes on the results page and corrects Jordan's card on Atlas (the honest
  "VIX % per 1% Nasdaq priced in" needs ρ).
- **B / C pass:** a context line in Atlas's Fear versus the Nasdaq block, research-only unless |t| ≥ 3 with all
  controls.
- **D pass:** Garin's lean becomes a validated intraday context read for ES. **Fail:** it is recorded as not holding
  out of sample, and he gets the numbers.
- **E pass:** a costed short-VX rule prereg with a forward record. **Fail:** the spot give-back stays a vol read with
  no tradeable form, which is Garin's point confirmed.

## Amendments

### A1 — 2026-10-23 — PRE-RESULTS (E power; no real E outcome read)

`scripts/vix-calculus/vx.py power` used synthetic fat-tailed 20-session outcomes (t(4) daily shocks summed, 300 reps)
on the real E sample: 3,314 sessions with a VX outcome, the real R_a/R_b flags and the registered controls. It found
80% power at a planted **0.5 SD**:

| Planted effect | Power (R_a / R_b) |
|---|---|
| 0.2 SD | 0.22 / 0.21 |
| 0.3 SD | 0.42 / 0.40 |
| 0.5 SD | 0.84 / 0.80 |

This is better than the 0.65 SD written in §5.

- The spot give-back was −0.29 SD, so a futures effect of the same size in SD units would be found less than half the
  time.
- An E cell that fails with its interval reaching past −0.2 SD is therefore **UNDERPOWERED**, not NULL.

Synthetic noise replaced the "planted on 2013–2016" wording of §5, so no real outcome was used.

### A2 — 2026-10-23 — note (results of A, B and C seen before E and D were run)

Parts A–C ran before this amendment. E's definitions are unchanged from the registered text, except for one fix: the
three-period sign check coded "negative in all three periods", as §3 E says. The first draft of that line was garbled
and was fixed before E ran. D is unchanged.

### A3 — 2026-10-23 — PRE-RESULTS (D power; no 2021+ outcome read)

`scripts/vix-calculus/intraday.py power` ran on 2016–2020 readings only, which is Garin's sample:

- whole days resampled to 1,420 test-period days;
- in-sample bucket effects removed;
- +δ normal-moves planted on Hard;
- the registered session-clustered bootstrap with one-sided Holm-4 (worst case α 0.0125), 100 reps.

| δ (normal moves) | ES-down | ES-up | NQ-down | NQ-up |
|---|---|---|---|---|
| 0.10 | 0.00 | 0.00 | 0.00 | 0.05 |
| 0.15 | 0.06 | 0.78 | 0.23 | 0.96 |
| 0.20 | 0.56 | 1.00 | 0.88 | 1.00 |

**What this means for the verdict:**

- Garin's in-sample Hard − Barely differences (ES-down +0.12, ES-up +0.10) sit **below** what this design detects:
  about 0.15 on up days and about 0.2 on down days.
- D can confirm his lean only if it is larger out of sample than in.
- A D fail is therefore expected to be **UNDERPOWERED**, as the registered rule says, unless its intervals are tight
  enough to meet the NULL clause.
- The readings builder's lookup was fixed before this check: an M1/5m bar at or within 5 minutes before each time, so
  that gaps in the CFD bars don't drop readings. That is a data-plumbing fix, made before any D outcome was read.


## RESULTS

To follow in `analysis/output/vix-calculus/RESULTS.md`.