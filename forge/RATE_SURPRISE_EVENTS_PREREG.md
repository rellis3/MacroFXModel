# rate-surprise-events — Do rate or data surprises at FOMC / CPI / payrolls carry information about EURUSD and Nasdaq returns AFTER the signal is known, beyond the asset's own reaction, and is it executable?

**Pre-registered 2026-10-21, before any post-signal outcome was computed.**

The event features, the timestamp audit (`analysis/output/rate-surprise-events/DATA_AUDIT.md`) and a planted-signal
power check (`power.json`) were computed first. They read only signal-side data, never a return after entry.

| | |
|---|---|
| ID / ledger id | `rate-surprise-events`; scored questions `rate-surprise-eurusd`, `rate-surprise-nq` |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `rate-surprise-events` |
| Data | **Events:** 526 (FOMC 131, core CPI m/m 196, payrolls 199), 2010-01 → 2026-08-21. ff_calendar gives dates + forecast/actual for 2010–17 (clock times from the published schedule); calendar_events.csv gives UTC stamps + consensus/actual for 2018+. **Prices:** OANDA M15 mid for the US 2y and 10y Treasury CFDs, EUR_USD and NAS100_USD (one source, fetched read-only with `to` = 2026-08-21). **Costs:** OANDA M1 bid/ask history (`data/m1_bidask`, 2016-10+). Nasdaq futures 1-min history is not available, so NAS100 (the index CFD) stands in for NQ |
| Seed | `20261021` |
| Uncertainty | Within-family permutation of the signal (2000 draws) for the primary p; event bootstrap (2000) for net returns; Newey–West lag 1 over event order for Clark–West |
| Scripts / outputs | `scripts/rate-surprise-events/` → `analysis/output/rate-surprise-events/` |
| Harness | own scripts (event study; no harness event mode) |

## 1. The claim (required)

This is Phase 2 of the owner's rates brief (2026-10-21). "The market response to a rate surprise may provide more
useful information than an ordinary change in the yield level or yield spread." Do unexpected changes in policy
expectations or macro data give a measurable and executable trading advantage for EURUSD or Nasdaq that ordinary yield
levels, spreads and price-based benchmarks lack?

## 2. Why it is not already settled (required)

Nearest entries:

- **`cb-tone-direction`** (null): the FOMC first 30-minute *asset* reaction / statement tone → the next-day dollar,
  82 meetings.
- **`post-fomc-usd-drift`** (validated): the dollar drifts up for 5 days after *any* FOMC, unconditional on the
  surprise.
- **`surprise-size`** (validated): data-surprise *size* widens the session range. That is volatility, not direction.
- **`news-asymmetry`** (null): bad vs good surprise, the first 30 minutes.
- **`priced-in-direction`** (null): the pre-event yield state.
- **`yield-predictive-ladder`** (yesterday): ordinary daily rate changes, null / underpowered.

None of them used the **market-measured policy surprise**: the US 2y move inside the release window. None measured
**post-signal** returns with the signal timed realistically. None asked whether the surprise adds anything **beyond
the asset's own reaction** in the same window. CPI and payrolls have not been tested for post-signal direction at all.

## 3. Definitions, fixed in advance (required)

**Event time t:**

- CPI and payrolls: 08:30 ET.
- FOMC:
  - 14:00 ET from 2013;
  - 14:15 ET in 2010–12;
  - 12:30 ET at the 2011–12 press-conference meetings.
- Only scheduled events are included.

**Reaction window W:** 15 min for CPI and payrolls; 60 min for FOMC (statement plus the first 30 min of the press
conference, where one follows).

**Signals** (hawkish = positive), all known at t + W:

- **`rs2`, the market rate surprise:** −log change of the US 2y CFD price over [t, t+W], ÷ (trailing 28-day σ of
  15-min changes × √(W/15)).
- **`ds`, the data surprise:**
  - CPI and payrolls: (actual − consensus) ÷ the standard deviation of that family's previous surprises, needing ≥ 12
    prior events;
  - FOMC: (decision − consensus) ÷ 25 bp;
  - missing consensus = 0.
- **`rs10`, the 10y variant:** descriptive only.

**Direction of the signal, fixed before outcomes (no fitting):**

- **EURUSD:** S = −signal (hawkish → USD up → EURUSD down).
- **Nasdaq:** S = signal × L, where L is the sign of the correlation between Nasdaq and the US 2y yield over the
  previous 60 sessions (daily changes at 16:00 ET). The stock–rate sign flips by regime (`stir-curve-map`).
- **Interpretation:** a positive correlation between S and the later return = **continuation** (the move goes on in
  the direction the surprise implies); negative = **reversal**.

**Entry:** at t + W + 15 min, one full bar after the window. This is a realistic, conservative signal delay.
Sensitivity: + 30 min.

**Outcome** `y_h = ln(P(end_h) / P(entry))`, divided by σ15 × √(elapsed 15-min bars). Four horizons:

| | Ends at | Elapsed bars used for scaling |
|---|---|---|
| h1 | entry + 60 min | 4 |
| h2 | 16:00 ET the same day | intraday bars |
| h3 | 16:00 ET the next business day | + 92 per day |
| h4 | 16:00 ET five business days later | + 92 per day |

**Baseline and benchmarks:**

- **No-signal benchmark:** 0 (and the family mean).
- **Price-based baseline B1:** the asset's own window reaction, the hour into the release, and family dummies.
- **Primary statistic:** the walk-forward residual of y on B1 (slope fitted on *earlier* events only, ≥ 30), then its
  correlation with S. By construction this is the information **beyond the asset's own reaction**.
- **Secondary forecast comparison:** walk-forward OLS B0 / B1 / M_RS (B1 + rs2) / M_DS (B1 + ds) / M_ALL, scored with
  Clark–West on 2018–26.

**Splits:** discover 2010–17 (256 events), validate 2018–21 (127), test 2022 → 2026-08-21 (143).

**Dependence:**

- Events are separate days.
- h4 windows can overlap between events a few days apart (CPI and payrolls in the same week), so the event bootstrap
  uses month blocks for h4 and Clark–West uses Newey–West lag 1.
- The permutation is within family.

**Predefined splits (descriptive, BH q 0.10):**

- surprise direction (hawkish / dovish, sign of rs2);
- large surprise (|rs2| ≥ 1.5);
- policy regime (182-day change in the decided target: hiking / cutting / hold);
- real-yield trend (60-day DFII10);
- risk (VIX vs its 252-day median);
- family (FOMC / CPI / payrolls).

**Costs:**

- From 2016-10, the real bid/ask spread at the entry and exit minutes (full spread round trip) plus slippage of
  0.2 bp (EURUSD) / 0.5 bp (NAS100).
- Before 2016-10, 1.5 × the median 2016–26 entry spread of the same family.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | The rate surprise and the asset's reaction are the same news in the window | **Yes**. Already measured: corr(rs2, react) EURUSD −0.83, NAS100 −0.40 |
| b | After the signal, the surprise predicts continuation or reversal beyond the asset's own reaction | **Null** for EURUSD (little unique variance left). Small and uncertain for Nasdaq |
| c | The data surprise adds beyond the market surprise | **Null** |
| d | Any effect is concentrated in a few announcements (2020, 2022) | Likely, if anything shows |
| | **THE GATE (per cell; 16 scored cells)** | All three: the pooled 2010–26 permutation p passes Holm at α 0.05 across the 16 cells; the correlation has the same sign in discover, validate and test; it remains with the top 5 \|y\| events dropped |
| | **THE GATE (tradable)** | For passing cells only. Trade the sign fixed by the *discover-period* correlation (continuation or reversal) on every 2018–26 event, risk-normalised. The net mean per event (after the costs above) has an event-bootstrap 95% interval above 0 over 2018–26, is > 0 in test 2022–26, and beats both the no-signal benchmark and the B1 rule (trade the continuation of the asset's own reaction) |
| | **THE MIRROR** | Reversal (negative correlation) is a pass in its own right, under the same gate. The direction is taken from the discover period, never from the test |

## 5. Power — measured on this sample before registering (required)

The power was measured by planting synthetic outcomes on the real events (`power.json`, 400 draws, fat-tailed noise).
It shows the probability of detection:

| Cell | n | pooled p < 0.05 at ρ = 0.10 / 0.20 / 0.30 | full gate at ρ = 0.10 / 0.20 / 0.30 | ρ at 80% (pooled) |
|---|---|---|---|---|
| EURUSD × rs2 | 466 | 0.15 / 0.52 / 0.87 | 0.01 / 0.17 / 0.45 | ≈ 0.27 |
| EURUSD × ds | 495 | 0.20 / 0.63 / 0.91 | 0.03 / 0.17 / 0.46 | ≈ 0.25 |
| NAS100 × rs2 | 466 | 0.37 / 0.91 / 1.00 | 0.07 / 0.62 / 0.95 | ≈ 0.17 |
| NAS100 × ds | 493 | 0.20 / 0.64 / 0.95 | 0.02 / 0.18 / 0.52 | ≈ 0.24 |

**Pass bar (economic): |ρ| ≥ 0.10.** Every cell's MDE exceeds it, so the design is **UNDERPOWERED by design for
effects near 0.10**. It can detect large post-announcement effects (≈ 0.2–0.3). EURUSD × rs2 is weakest because the
rate surprise is −0.83 collinear with EURUSD's own reaction.

Verdict words follow §5 of the template:

- **Null** only where the 95% interval of ρ excludes ±0.10. That is not expected at these n.
- **Underpowered** otherwise.
- **Validated** only via the gate.

The constraint is the event count: about 32 events a year across three families. Doubling the history again is not
possible (the CFDs and calendar consensus start in 2008–10). More power would need more event types or more assets.

## 6. Multiplicity (required)

- **Scored:** 2 assets × 2 signals (rs2, ds) × 4 horizons = **16 cells**. Holm α 0.05 on the permutation p, plus the
  conjunctive period and concentration conditions.
- **Descriptive (BH q 0.10 with a chance baseline):**
  - splits: 6 split variables × 2–3 levels × 16 = about 220;
  - the rs10 variant: 8;
  - the Clark–West forecast ladder: 2 assets × 4 horizons × 3 models = 24.
- **Promotion:** nothing goes to MacroFXModel without the tradable gate and |t| ≥ 3 (or a forward record).

## 7. What this does NOT test (required)

- Other release families (ISM, retail sales, PCE, jobless claims) and other central banks.
- Sub-15-minute timing. The M15 grid sets the floor: anything inside the first 15 minutes is in the window by design.
- Nasdaq **futures** (NAS100 is the index CFD, with a near-identical path but different costs).
- Cause.
- Intraday market depth or fill risk beyond the quoted spread.

## 8. What each verdict changes (required)

- **Validated + tradable:** a candidate event sleeve with its own forward record before anything in MacroFXModel.
- **Validated (predictive only):** a context line on release days ("after hawkish surprises EURUSD has tended to …").
- **Underpowered:** recorded with the power table. The question is closed for this sample size, with the data path
  stated (more release families as one family, more USD assets).
- **Null where intervals exclude 0.10:** recorded for that cell.

## Amendments

(none)

## RESULTS

See `analysis/output/rate-surprise-events/RESULTS.md`.
