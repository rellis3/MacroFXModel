# Direction research: first-principles re-examination (2026-10-31)

Scope: code-level audit of the direction gatekeeper (`direction-bar`), 8 of the broadest direction nulls, a map of
the untested design space, and new study proposals. No repo file was modified. Everything new here is a **power
computation on placebo signals** (no real signal was scored), labelled exploratory, not pre-registered; data cut at
2026-08-21. Scratch: `review/work_direction/` (`xs_power.py`, `mde.json`, FRED H.10 CSVs in `fred/`).

## TL;DR

1. **The gatekeeper's arithmetic is right; its scope is too narrow, and the scope is what kills ideas.**
   `scripts/direction-bar/bar.py` is careful: B0 is lookahead-free (outcomes enter the expanding mean only at t+h),
   always-on MDEs already use overlapping data with a placebo that carries the overlap (equivalent to HAC, not
   non-overlapping), A1 fixed four real faults. Its conclusion "single-instrument 20–60 day direction is not
   judgeable from 20 years" is **correct** and I reproduce it (EURUSD, persistent signal, 20d: IC MDE 0.156 vs its
   0.18). But:
   - it measures everything on **OANDA 2006–2026 only** (20 years), when FRED H.10 gives the same currencies daily
     from **1971**;
   - its one cross-sectional design (the Phase 1 gate) uses **8 currencies, 2006+**: MDE IC 0.060 (I get 0.063).
     That gate **could not detect carry**, the one factor this repo has itself shown to exist (Sharpe 0.54 on 9
     currencies → monthly IC ≈ 0.05);
   - it has no **pooled time-series design with instrument-specific signals**, which is how a per-country macro
     engine would actually be used.
2. **Recomputed MDEs (80% power, two-sided 5%, single test, IC of a persistent random signal on real returns):**

   | Design | Data | MDE (IC) | vs direction-bar |
   |---|---|---|---|
   | XS rank IC, 8 ccy, monthly (replication of the Phase 1 gate) | 2006–2026 | **0.063** | 0.060 |
   | XS, G10 (9 + USD), monthly | 1976–2026 | **0.043** | −32% |
   | XS, G10, weekly rebalance, 4-week horizon (overlapping) | 1976–2026 | **0.038** | −40% |
   | XS, G10 + 7 EM, monthly | 1995–2026 | **0.037** | −42% |
   | XS, G10 + 7 EM, monthly | 2006–2026 | 0.044 | −30% |
   | TS single instrument, 20d, half-life 20d | EURUSD 2006– | 0.156 | ≈0.18 |
   | TS single instrument, 20d | JPY 1976– | 0.111 | — |
   | TS pooled G10, 20d, **one common signal** | 1976– | 0.074 | — |
   | TS pooled G10, 20d, **independent per-country signals** | 1976– | **0.035** | — (4.4× smaller than single) |
   | TS pooled G10, independent signals | 2006– | 0.050 | — |

   Plausible macro ICs are 0.05–0.10 at 1 month. **Every long-panel cross-sectional or per-country-pooled design
   clears that bar at the single-test level, and still clears 0.05 at a family of 10 (×1.30 → 0.049–0.057).**
   In Sharpe terms a book needs 2.8/√years: 0.62 on 2006–26, **0.39 on 1976–2026**.
3. **Most banked direction nulls are honest but narrow**: single-instrument time-series, changes not levels, US-only
   drivers, hit-rate currency. Two have real defects (macro-confluence; yields-to-fx is an unregistered scan
   with a broken hit metric). One reads past the lockbox (macro-confluence re-run to 2026-10-02).
4. **Never tested at all:** FX value / REER, real-rate differential *levels*, curve-slope differentials, relative
   growth/inflation momentum across countries, cross-sectional option skew, regime-conditioned cross-sectional
   factors, and the dashboard's composite market-state score as a forecaster (its only attempt, macro-confluence,
   is defective). These are exactly where the macro literature finds direction.

---

## A. Audit of the gatekeeper (`direction-bar`)

Files: `forge/DIRECTION_BAR_PREREG.md`, `scripts/direction-bar/bar.py`, `analysis/output/direction-bar/RESULTS.md`,
`results.json`. The withdrawn §0 table of `plans/MACRO_DIRECTION_RESEARCH_PROPOSAL.md` (vs 50%, non-overlapping) is
correctly superseded by it.

### A1. Overlapping vs non-overlapping, HAC

- **Sparse cells** (`placebo_sparse`) draw K events spaced ≥ h apart. Correct for a sparse event: events cannot overlap.
- **Always-on signals** (`placebo_ic`) use **every daily row** with an h-day overlapping outcome and an AR(1)
  placebo signal; the SD of the placebo IC carries the overlap exactly as HAC would. n_eff it reports: EURUSD 20d
  1,540 (half-life 1) / 239 (half-life 20). I reproduce 324 on FRED noon data. **So the bar does not throw away
  overlap.** The withdrawn §0 table did (n/h), and for a fast signal that understated power by ~2.6× in SD.
- **Regime cells** use overlapping runs; it says so (n_eff 52 for 458 days at 20d). Correct.
- Verdict: **no material power is lost to overlap.** Overlap + HAC buys a lot only for signals that change faster
  than the horizon; macro signals don't.

### A2. Currency: hit rate vs magnitude

- Labels (a)/(b)/(c) and the plausibility bar are in **σ units**, which is right. But the headline numbers people
  quote (Evidence Book entry, RESULTS §1: "NQ 20d must show ≥ 0.95 or ≤ 0.36") are the **hit-rate** MDEs.
- From `results.json`: the hit-rate MDE is larger than the σ-unit MDE translated to probability
  (Δp ≈ φ(Φ⁻¹(p0))·δ) by a factor whose square is the efficiency: **0.54–0.77** across instruments × horizons
  (EURUSD 20d: 29.5 pp vs 24.0 pp implied). A hit-rate test needs **1.3–1.9× the sample** of a return test for the
  same effect, and it is blind to skewed payoffs (trend, carry-crash avoidance) where a <50% hit is profitable.
- B2 (momentum) and B3 (carry) are judged **only as Brier-scored P(up) forecasts of one market** ("negative Brier
  skill in 23 of 24 cells"). That is the least favourable currency for both: momentum's value is magnitude-weighted,
  carry's is a cross-sectional book. RESULTS says this ("does not say the books lose money"), but the table reads as
  a strike against them. They should also be scored as σ-unit returns / Sharpe vs B1.
- Many legacy direction nulls are hit-rate tests: `nonus-yield-gap-direction`, `crack-disagreement-direction`,
  `v4-dirtag`, `cb-tone-direction` (sign agreement), `priced-in-direction` §7 (k-NN hit), `direction-vote-at-lines`
  S7a. Their intervals are ~1.5× wider than a return test on the same data.

### A3. Per-instrument vs cross-sectional / pooled

- Single-instrument MDEs are right. The pooling factor `m_eff = m²/Σρ²` (A1 fix) is a fair *common-signal* number
  (main6 3.5, fx7 2.8). It is not the right number for **instrument-specific signals**, where the pooled variance
  depends on the correlation of signal×return products, not returns. My placebo with independent per-currency
  signals gives n_eff ≈ 6,300 (G10 1976–) vs 640 for one currency: MDE 0.035 vs 0.111, a 3.1× gain; a common
  signal gets 0.074.
- The only cross-sectional design in the bar is the 8-currency, 2006+ monthly gate (MDE 0.060). Extending to the
  history FRED already holds cuts it to 0.043 (G10 1976+), 0.038 (weekly overlapping), 0.037 (G10+EM 1995+).
- **Calibration against the repo's own positive:** `rate-diff-xsmom` carry (9 currencies) earned Sharpe 0.54
  1976–2014, 0.26 2015–26. For a 9-name ranked book SR ≈ IC·√(12·N) → IC ≈ 0.05 (0.025 post-2015). With MDE
  0.060 the Phase 1 gate has <80% power for carry itself. With 0.043 it is detectable; the rate-xsmom result
  (CI above zero 1976–2014) is consistent with that.
- Cross-sections also remove the need for B0 at all (demeaned returns have no drift), which matters because B0 is
  itself badly non-stationary (bar's own numbers: USDJPY 60d bias +35 pp in the last year, EURUSD 60d −11 pp).

### A4. Is B0 lookahead-free?

Yes. `frame()`: `known_up = up.shift(h)`, expanding mean over known outcomes only, needs 504. B2 conditions on
`ms.shift(h)` with outcomes known at t. B3 rates are as-of `asof ≤ t+22h`. Ledger baselines are frozen at
2026-08-21. No lookahead found.

### A5. Code issues found

| # | Where | Issue | Effect |
|---|---|---|---|
| 1 | `mde(sd, bias)` | MDE = **|placebo mean| + z·SD**, but the positive control (`control_sparse`) plants z·SD and tests **centred on the placebo mean**. The two are inconsistent | Hit-rate MDEs at 60d inflated by the bias (+4.7 pp NQ, +7.0 pp ES). Conservative, not anti-conservative |
| 2 | `placebo_regime` | no finite-population correction (A1 fix 4 applied it only to sparse cells) | regime MDEs slightly understated (the placebo draws runs from the same finite history); minor |
| 3 | `label()` | (a)/(b)/(c) depends on a fixed 10%-coverage sparse cell (K = 23 at 20d). A long/short signal active on all periods has K ≈ 250 non-overlapping 20d periods → 0.18σ | The "(b) everywhere above 1 day" label is an assumption about cell rarity, not about direction |
| 4 | `xs_ic_gate` | 8 currencies, 2006+, only `phi ∈ {0, 0.9}` monthly | gate MDE ~40% higher than the data in hand supports |
| 5 | B2/B3 scoring | Brier on 1-bit conditional climatology only | wrong currency for momentum/carry (A2) |

No bug that flips a conclusion. The problem is the frame: it answers "can one market's direction be judged from
20 years?" (no) and is then used as if it answered "can macro direction be judged?" (it can, cross-sectionally
and pooled, on the history FRED holds).

### A6. Recommended amendments to the bar (not made)

1. Add a long-panel XS gate (FRED H.10 1976+, G10; EM as a holdout universe) and a pooled-independent-signal TS
   design to the MDE map.
2. Quote σ-unit MDEs in headlines; hit rate as secondary.
3. Make `mde()` consistent with the control (drop |bias| or centre the control's test on 0).
4. Score B2/B3 also as returns (σ units / Sharpe vs B1).

---

## B. Code-level audit of 8 direction nulls

| Ledger id(s) | What was actually tested | Defects found | Rules out | Does NOT rule out |
|---|---|---|---|---|
| **yields-to-fx-direction** (`analysis/yield_asset_coupling.py`, `analysis/output/yield_coupling/study_main.csv`; doc = a memory note, no prereg) | 18 Yahoo assets × 6 **US-only** yield drivers (2y,10y,30y,slope,real,BE) × **changes** over 1/5/21d, lag 1 row → forward 1/5/21d; per-asset rank IC, NW t, circular-shift null; 972 cells, 2006–2026 | (i) unregistered scan banked as `null`; (ii) `hit = sign(−x)==sign(y)` uses the bond-price sign for every asset (wrong for USDJPY/USDCAD) and counts unchanged-yield days (common at the ZLB, 2-dp data) as misses → hits of 0.33–0.40; cosmetic, verdict used IC; (iii) Yahoo FX has Sunday rows, yields forward-filled onto them; (iv) **no differentials** — FX direction from US yields alone | per-asset |IC| ≳ 0.05 at 1d and ≳ 0.15 at 21d for US yield *changes* | rate **differentials**, **levels** (carry/real-rate gap), cross-section. Note point estimates at 21d reach 0.06–0.07 (USDCAD y10, y2; NW t ≤ 1.4) — exactly the undetectable band |
| **yield-ladder-eurusd / -nq** (`scripts/yield-predictive-ladder/run.py`, `panel.py`) | walk-forward ridge on 5/20d **changes** of US 2y, real, BE, TP, slope (+US−DE 2y/10y for EURUSD), as-of d−1, target from EURUSD noon/NDX close at 1/5/20d, 2015–2026 OOS | MSE-CV with λ ∈ up to 1000·n chose maximum shrinkage → forecasts ≈ yearly intercept (null-audit caught it, verdict → underpowered). Feature at d−1 close vs target from d noon skips ~20 h (deliberate, conservative; kills any 1-day lead) | ρ ≥ 0.10 at 1d (planted control) | anything at 5–20d; levels; cross-section; the planted control itself says the design finds nothing at 5d |
| **rate-diff-xsmom** (`scripts/rate_xsmom/study.py`) | **cross-sectional**, 9 ccy, 1976–2026, monthly, rank on Δ(3m-rate differential) over 1/3/6/12m, terciles, 45-day lag, spot + carry − 2bp | clean; EUR leg uses German 3m throughout; OECD monthly averages. FX momentum arm only 3m lookback | Δ-rate-differential momentum Sharpe ≳ 0.45 (CI on mean [−0.07, +0.23]%/mo) | carry (it **works**: 0.54 to 2014), value, real-rate levels, composites. This is the best-powered direction test in the repo and its positive arm is the textbook one |
| **macro-confluence-direction / -baa-credit** (`analysis/macro_confluence_baa_credit_study.mjs`, `scripts/macro-confluence-rerun/run.mjs`) | days when net-liquidity, curve (20d ΔT10Y2Y) and credit (20d ΔBaa−Aaa) all +1 or all −1; 45/42 episodes; forward 5/20d EURUSD/SPX/gold vs all other days | (i) **liquidity leg = z of the latest 1-day change** of a series whose WALCL/TGA legs update weekly (pre-2013 RRP≈0 → it moves only on H.4.1 days); not the 4-week tailwind it claims to be; (ii) the "beyond a single domain" claim is never tested — control is all other days; (iii) all-three-agree throws away almost all information (87 episodes in 17 years); (iv) earlier bug read SPX/gold at EURUSD row positions (fixed); (v) **re-run END_DATE = 2026-10-02: scored data after the 2026-08-21 lockbox** | ±0.6% 20d effects on 45 events | the composite as a continuous score; anything at plausible size |
| **net-liquidity-tailwind-spx / -nq** (`scripts/net-liquidity-tailwind/run.py`) | weekly, first-published vintages, rising vs falling 4-week ΔNL → next 20d SPX/NAS100, 2011-07 → 2026-07 | clean point-in-time. Hard-coded 2011-07 start; H.4.1 legs are barely revised and exist from 2002-12/2003, so ~8 more years were available with a release-time as-of | > 2.0–2.4 pp per 4 weeks | the measured +0.4 pp/4wk (~5%/yr, same sign both halves, +1.3–2.0 pp at 13w) — economically large and untestable on this window |
| **policy-direction-at-lines S5b** (`scripts/policy_direction/score.py`) | EURUSD 5- and 20-day non-overlapping holds on the sign of the 63-day ΔUS−DE 2y, 2000–2026, 2-bday lag | clean | single-pair Sharpe ≳ 0.5 (mean +1 bp [−5, +8] per 5d, Sharpe 0.06) | Sharpe 0.2–0.4 (the literature range for this signal on one pair); any pooled version |
| **GLI FX ranker** (q6-netliq-rerun §3, `GlobalLiquidity/`, exploratory, never banked) | per-currency central-bank liquidity impulse spread, 26 pairs (8 currencies), weekly, 2008–2026 | text claims "973 weeks is plenty to see a 0.5 Sharpe": SE ≈ 1/√18.6 = 0.23, MDE ≈ 0.65 — overstated; a 0.02 result does exclude ~0.5 but not 0.3 | Sharpe ≥ 0.5 | the per-country macro-impulse idea at realistic size; G10 long history |
| **trend-following-fx / fx-factor-book-v2** | FX-only TSMOM on 7 USD pairs; overlays tested on 5.7 years OOS | correctly self-labelled underpowered (Sharpe SE 0.41, MDE +1.4); carry-risk-off gate C3 ran monthly by design flaw | big overlays only | FX TSMOM at 0.2–0.4, regime-gated carry |

Also checked, sound as far as they go: `bank-credit-panel-fx` (XS, 20 blocs, interval inside 0.05 — a **proper** XS
null), `fx-dollar-funding-exposure` (XS, proper null), `basis-stress-*` (clean, intervals inside 0.10),
`cot-positioning-factor` (XS 8 instruments, IC −0.032, p 0.094: narrow, close to a fade effect).

**Overall:** the repo's direction nulls are mostly *correct readings of low-power designs*. Typically the 95% CI
excludes effects ≥ 2–3× the plausible macro size, and says nothing about the plausible size. The few designs with
real power (rate-xsmom, bank-credit-panel-fx, COT crowding pooled over 34 markets, positioning-into-release pooled
over 6 pairs) are exactly the ones that found something or produced an informative null.

---

## C. The untested space

Codes: **P** tested properly (power adequate for a plausible effect, or the null CI excludes it), **N** tested
narrowly (one construction, single instrument, low power, or unregistered), **D** tested with a defect,
**U** never tested.

| Driver (data in repo) | TS single instrument | Cross-sectional / RV | Regime-conditional (state × signal) | Event-conditional | Composite / market-state score |
|---|---|---|---|---|---|
| Growth (INDPRO/ISM, GDPNow, surprises) | N (quadrant context, unregistered) | **U** | N (quadrant tilts, context) | N (US-only `rate-surprise-events`, underpowered; release next-day hit 45–55%) | **U** |
| Inflation / breakevens | N (Δ in ladder, coupling) | **U** (inflation differentials) | N | N (CPI, US only) | **U** |
| Policy path / STIR / 2y | P (STIR book, ladder, S5b — single instrument) | P (`rate-diff-xsmom`, Δ diff: null) | N (ladder R2 interactions, follow-through) | N (post-FOMC validated; other CBs never) | **U** |
| Real yields | N (Δ only) | **U** (real-rate gap level) | N (R1 real-up) | U | U |
| Curve slope | N (inversion → equities; Δslope) | **U** (relative slopes) | D (confluence leg) | U | D |
| Credit spreads | P (credit-leads-equities, 1–20d) | U | D (confluence), N (liq gate, HY 2.7y) | U | D |
| Liquidity (net liq, GLI) | N (tailwind, underpowered; G1 tide OOS null) | N (GLI ranker, exploratory) | N (liq gate) | N (quarter-end) | N (macro-equity: net-liq ablation = 0) |
| COT / positioning | P (crowding programme, state D validated) | N (`cot-positioning-factor` p 0.094) | P (states × trend) | P (positioning into release, validated) | P (features add nothing) |
| OI / gamma | N (CME NQ/FX book, 2020+) | U | N (gamma fade/follow) | N (opex: range) | U |
| Vol surface (VIX, VVIX, skew, FX IV) | P (VIX-beta, VVIX/VXN on NQ; demotion proposed) | **U** (FX risk-reversal ranking; CVOL/iv_daily data exist) | D (carry risk-off gate C3 flaw) | N (VIX inversion → range) | U |
| USD funding / xccy basis | P (`basis-stress-*` nulls) | P (`fx-dollar-funding-exposure` null) | P (exposure × risk-off weeks) | N (quarter-end) | U |
| BIS bank flows | P-underpowered (quarterly, MDE 0.24) | P (`bank-credit-panel-fx` null) | U | U | U |
| Carry | N (TS carry dead) | **P (works 1976–2014, Sharpe 0.54; 0.26 after)** | D (C3) | U | U (FX factor stack registered, not run) |
| Momentum / trend | P (FX TSMOM null; multi-asset ≈ B&H) | N (3m FX XS momentum only) | P (COT × trend) | U | N (portfolio book, context) |
| Valuation / REER / PPP | **U** | **U** | **U** | U | **U** (non-US CPI is a feature-store gap) |

**Headline.** The P cells are overwhelmingly single-instrument time series or sparse events. Cross-sectional design
has been used for only four drivers (Δ-rate differential, carry, BIS flows, USD funding exposure; COT narrowly), and
the one textbook factor among them (carry) is positive. **Value, real-rate gap, curve gap, relative growth and
inflation momentum, XS skew, regime-conditioned XS factors and the composite market-state score have never been
tested.** The composite's only attempt (macro-confluence) is defective and read past the lockbox. The "macro
direction is dead here" impression comes from running macro through the lowest-power design (one market, one
horizon, a hit rate) many times.

---

## D. Proposed new studies (each needs a register row and prereg before any outcome is computed)

### D1. `fx-xs-value-realrate-long` — cross-sectional value and real-rate gap on the long G10 panel
- **Hypothesis:** currencies cheap on PPP/REER and with a high real short-rate gap outperform the basket over the
  next 1 and 3 months, beyond carry.
- **Design:** monthly rank IC (Fama–MacBeth) and terciled dollar-neutral book; primary = value, secondary = real-rate
  gap, control = carry; incremental test B+X vs B (carry). Discover G10 1976–2005, confirm G10 2006–2026-08-21, and
  **holdout universe** EM7 (MXN, ZAR, SGD, KRW, BRL, INR, THB) 1995–2026, never looked at (the COT-holdout pattern
  that produced the repo's strongest historical evidence).
- **Baselines:** zero (demeaned), carry-only book, equal-weight USD basket; B0 is unnecessary (no drift in a
  cross-section).
- **Power:** MDE IC 0.043 (G10 1976+), 0.044 (G10+EM 2006+); Sharpe MDE 0.39 on 50 years vs 0.62 on 2006+. Published
  value IC ≈ 0.04–0.08.
- **Why it's new:** value has never been run (the FX factor stack lists it but is 8 currencies, 2005+, and not
  run). This is the same study with ~2.3× the information.
- **Data:** FRED H.10 `DEX*` daily (fetched in scratch; same series as `scripts/rate_xsmom/study.py`), `IR3TIB01*`
  3m rates (already used), CPI `CPALTT01*M659N`/index (OECD, fixed 60-day lag, as FX_FACTOR_STACK Addendum A
  allows), BIS REER on FRED (`RB**BIS`, 1994+) as a robustness arm. Costs: rate-xsmom's 2bp turnover plus
  `spread_profile`.

### D2. `xs-macro-momentum` — per-country economic engine, cross-sectionally
- **Hypothesis:** relative 6–12-month trends in each country's growth (IP, unemployment), inflation (CPI) and policy
  rate rank its currency (and, as a second independent family, its 10y bond and equity index) over the next month
  (Brooks 2017, "macro momentum").
- **Design:** one pre-registered composite (equal-weight z of the four trend legs, signs from theory, no fitting) →
  monthly XS rank IC per asset class; pooled-TS IC with per-country signals as the secondary. Holm across 3 asset
  classes.
- **Power:** per-country signals are close to independent → MDE IC 0.035–0.043 (G10 1976+) vs 0.11–0.16 for any
  single market. This is the dashboard's "economic engine" put in the one design that can judge it.
- **Why it's new:** no cross-country growth/inflation momentum test exists (C-matrix rows 1–2, XS column = U).
- **Data/PIT:** FRED OECD MEI (`PRINTO01*`, `LRHUTTTT*`, `CPALTT01*`, `IR3TIB01*`, `IRLTLT01*`, `SPASTT01*`),
  3-month publication lag; these are latest-vintage, so register a vintage-safe confirm on ALFRED 2013-06+ and treat
  the pre-2013 result as H-R with revision risk stated.

### D3. `release-relative-drift` — pooled, relative post-release drift across 8 economies
- **Hypothesis:** after a standardised data surprise in country c, currency c drifts relative to the equal-weight
  basket over D+1..D+5 beyond its day-0 reaction (two-sided: continuation or fade).
- **Design:** local projection of relative return (σ units) on surprise z and on the day-0 reaction; date-clustered
  bootstrap; placebo = same weekday non-release days; family Holm across {surprise, residual reaction} × {1d, 5d}.
- **Power:** `features/surprises` has 10,025 scored releases for 8 countries 2015-11 → (≈2,000 distinct days to the
  lockbox) → MDE ≈ 0.06σ, vs ρ 0.17–0.24 for the US-only 526-event `rate-surprise-events`. FF calendar 2007–2025
  (data root) extends it with printed actuals for an extra 8 years.
- **Why it's new:** the relative, multi-country design removes USD drift and common shocks; all earlier release
  direction tests were one pair, raw direction or hit rate.

### D4. `xs-carry-state-conditioning` — does the market-state engine time the cross-sectional factors?
- **Hypothesis:** the next-month return of the XS carry (and D1 value) book is lower when the pre-registered global
  state is stressed (VIX level/term inversion, 20d Δ Baa−Treasury, 13-week net-liquidity impulse, 3-month USD trend),
  i.e. state × signal, not a direction call.
- **Design:** one composite state, terciles fixed on the discovery window; contrast top vs bottom tercile; also a
  continuous IC.
- **Power, stated honestly:** on 1979–2026 carry (569 months) MDE ≈ 0.7%/month for the tercile contrast, corr 0.12.
  The literature carry-crash asymmetry is of that order in stress months, so expect UNDERPOWERED unless the effect is
  large. Run it only alongside D1 (cost is low; the components are shared). Fixes the C3 monthly-gate design flaw in
  `fx-factor-book-v2`.

### D5. `market-state-composite-forward` — put the composite into the ledger now
- **Hypothesis:** the Global Read / scorecard composite, with instrument-specific signs fixed ex ante, carries
  σ-unit IC > 0 against B0 at 5 and 20 days pooled across the 6 ledger instruments.
- **Design:** register it as a `RESEARCH_FORECASTERS` entry in `js/directionLedger.js`; historical PIT
  reconstruction 2006–2026 is reported as H-R context only (pooled common-signal MDE ≈ 0.07–0.10, so it cannot pass
  historically); the forward ledger is the judge, with a pre-set count.
- **Why:** the dashboard was built to produce this, and it has never been scored. A forward record costs nothing and
  is the only clean out-of-sample evidence left.

Also endorse the proposal's **H3 (pooled post-decision drift across six central banks)**: ~80 FOMC events become
~1,000+, MDE ≈ 0.09σ, never run.

### Constraints respected in all five
- Lockbox: nothing after 2026-08-21 is scored; D5 accrues forward only.
- Point-in-time: fixed publication lags on monthly OECD series, release timestamps for surprises, vintage-safe
  confirms where vintages exist.
- Costs: turnover-based, measured spreads.
- Not banked nulls in new clothes: none of value, macro momentum, relative release drift, state-conditioned XS
  factors or the composite score has a ledger entry. D1 and D4 extend registered-but-unrun designs, with more power.

## Bottom line for the owner

The past "null" answers on direction were mostly true about the question actually asked: can one market's direction
be read from 20 years of history? That question cannot be answered, by this repo or anyone. They were wrong to
generalise from it. The macro-direction designs that work in the literature (cross-sectional, pooled across
countries with country-specific signals, 50-year panels, relative event drift) have mostly not been run here. The
data to run them is free (FRED H.10 from 1971, OECD MEI, BIS) and partly already in the repo. On those designs a
plausible macro edge (IC 0.04–0.08) is detectable.
