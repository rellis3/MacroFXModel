# FX Factor Book v2 — Pre-registered test

> **Status: RUN 2026-09-27 — factor book NULL (see §6); OU pending.** Frozen 2026-09-26, before
> any OANDA/FRED run. Written before the result exists so a null can't be
> re-narrated into a maybe (working agreement). Research only — nothing here is
> imported by a live bot, and the incumbent engines' defaults are unchanged
> (byte-identical output, regression-checked).
>
> Source ideas: `education/quantconnect_strategies.md` (§3.8–3.10, §4.2–4.5,
> §4.12) and `education/quantconnect_blogs.md` (§2, §4, §7, §13).
> Code: `js/fxFactorSignals.js` (Tier-1 math), `js/fxFactorV2.js` (selectors +
> orchestrator), `js/ouOptimal.js` + `js/ouPairsEngine.js` (OU bands). Routes:
> `POST /api/fx-factor-v2/run`, `POST /api/ou-pairs/run` (+ `/status/:id`).
> Page: `fx-factor-v2.html`.

## 1. What is being tested

Can the QuantConnect-derived upgrades beat the incumbent FX baskets **out of
sample, after costs**? Each variant is a `weightsAt` sizing selector plugged into
the existing engine (`runTrendBasket` / `runCarryBasket`), so loop, costs, carry
accrual, IS/OOS split and no-lookahead rebalance are the incumbent's own.

## 2. Data (identical for incumbent and variants)

- Prices: OANDA D1 mid OHLC via `fetchD1` (5000 bars, ≈2007→now), 7 G10
  currencies vs USD (EUR, GBP, AUD, NZD, JPY, CAD, CHF; USD_xxx inverted with
  high/low swapped).
- Rates: FRED 3-month interbank (the `CARRY_UNIVERSE` series). They are
  **monthly averages stamped on the 1st** — every rate observation is shifted
  **+60 days** for every carry run in this test (C0 included). `/api/fx-carry`
  is not changed; its absolute carry numbers read rates early and should be
  treated as optimistic until re-run with the lag.
- Risk gate: FRED `VIXCLS`, `VXVCLS` (VIX3M), `DGS10`, forward-filled onto the
  trading calendar and read with a **1-day lag**.
- Split: first 70% of common dates in-sample, last 30% out-of-sample.
- Costs: 2 bp per unit turnover (the incumbents' default).

## 3. Frozen parameters (`FX_FACTOR_V2_DEFAULTS`)

| Id | Variant | Frozen spec |
|---|---|---|
| T0 | Incumbent trend | `runTrendBasket` defaults: sign(12m), inverse 60d vol, targetVol 10%, weekly |
| **T1** | TSMOM-CF | t-stat of 252d log returns clipped ±1; Yang–Zhang vol (21d) from OHLC; correlation factor over 63d, CF capped 2.5; w = X·σ_tgt·CF/(N·σ) |
| T1a/b/c | Ablations (diagnostic) | each T1 piece alone |
| **T2** | Trend × vol regime | Carver multiplier M = EWMA₁₀(2 − 1.5·Q), Q = pctl of σ/mean(σ₁₀ᵧ) (EWMA-32 σ, ≥500d history, M ∈ [0.5, 2], ×1 before history) |
| **T5** | Residual multi-horizon XS momentum | residual vs equal-weight dollar factor (252d OLS); score = mean vol-normalised residual return over 63/126/189/252d; long top-2 / short bottom-2, inverse residual vol, short leg rescaled so Σw = 0; monthly |
| C0 | Incumbent carry | `runCarryBasket` defaults: sign(diff vs USD) × inverse 60d vol, monthly |
| **C1** | Carry × momentum agreement | C0 position kept only when sign(63d return) = sign(carry); else flat |
| C1b | Strict double sort (diagnostic) | tertiles by carry, better/worse half by 63d return (1-vs-1 on 7 ccys) |
| **C2** | Carry × vol regime | C0 × M (as T2) |
| **C3** | Carry × risk-off gate | flags: VIX/VIX3M > 1; VIX > 90th pctl of 504d; 10y > 2.5σ above its 90d mean. Multiplier max(0, 1 − 0.5·flags) |
| KB | Benchmark for K | 50/50 daily blend of T0 and C0 |
| **K1** | Carver trend+carry | EWMAC(8,16,32,64) ensemble + carry forecast (spans 5/20/60/120, ×30), 0.6/0.4, each rescaled so expanding mean |F| = 10, cap ±20; w = F/10·σ_tgt·CF/(N·σ); 10% buffer; decided daily |
| **K2** | K1 × vol regime | K1 × M |

Bold = primary (8 tests). Everything else is diagnostic and cannot "win".

## 4. Pass / fail (frozen)

For each primary variant vs its incumbent (T* vs T0, C* vs C0, K* vs KB), on OOS Sharpe:

- `too-few-oos-rebalances` if < 30 OOS rebalances.
- `within-noise` if |ΔSharpe| < SE of the incumbent's OOS Sharpe (Lo 2002).
- `no-improvement` if Δ ≤ 0.
- `improves-but-still-null` if the variant's own OOS Sharpe < its SE.
- `wins-oos` otherwise.
- **Evidence** requires `wins-oos` **and** `survivesBonferroni`
  (Δ ≥ 2.54 × SE; one-sided 5% over 9 primary tests including §5).
  A plain `wins-oos` without the Bonferroni flag is reported as a candidate for
  forward testing, not as a result.

**What "it worked" looks like:** at least one primary variant with
`survivesBonferroni = true`, and its per-year table not carried by one or two
years. **What "it didn't" looks like:** every primary is `within-noise` /
`no-improvement` / `improves-but-still-null`. Both outcomes are reported as-is.

Known limits stated up front: the SE used is the incumbent's (conservative for
correlated variants); 7 currencies is a thin cross-section (T5 and C1b hold 2–4
names); interbank carry is an upper bound on retail swap (see `carryEngine.js`).

## 5. OU optimal bands (separate, one primary test)

- Pairs (crosses built from the vs-USD series): AUD/NZD, EUR/CHF, EUR/GBP, AUD/CAD.
- Spread X = A/A₀ − β·B/B₀ on a trailing 252d window, refit every 63d (model
  only replaced while flat). **β = 1 (the listed cross) is primary**; Leung–Li's
  max-likelihood β is a diagnostic only — in testing the likelihood rewarded low
  increment variance and chose β ≈ 0.7 on a synthetic 1:1 cross, leaving a
  directional leg in the "spread".
- OU mode: Leung–Li levels with c = round-trip cost in X units, r = 5%, long at
  X ≤ d*, exit X ≥ b*; short side = the same problem on −X.
- Benchmark: same fit, enter at θ ∓ 2·sd, exit at θ.
- Costs 2 bp of gross per side; open trades marked to the last bar, never dropped.
- **Primary**: pooled equal-weight daily book of the 4 pairs, OU vs benchmark,
  same verdict rules as §4 with "trades" in place of rebalances (≥30 OOS trades).
- Model property to expect (not a bug — matches a scipy reference to 1e-9):
  Leung–Li discounts the spread *level*; on a zero-centred cross with r = 5% the
  exit sits 2–3 sd past the mean, so the OU book trades far less than the ±2σ
  benchmark. If it fails §4 for this reason, the pre-committed next step is a
  structural change (e.g. an explicit stop-loss exit per Leung–Li §5 or a
  capital-normalised value), not re-tuning r or c.

## 6. Results

### 6.1 Factor book — run 2026-09-27 on Railway (`main` @ 84d67c82)

OOS from 2021-01-14 (≈5.7 y). SE of the incumbent's OOS Sharpe = 0.413 for
every family, so the Bonferroni bar is Δ ≥ 1.05 Sharpe. FRED coverage: USD 271,
CHF 272, NZD 272, GBP 265, EUR 265, AUD 272, JPY 271, CAD 272 monthly obs;
VIX3M 4729, UST10Y 5687, VIX 5750 daily.

| Id | IS Sh | OOS Sh | OOS ann % | OOS vol % | OOS maxDD % | OOS rebal | ΔOOS | Verdict |
|---|---|---|---|---|---|---|---|---|
| T0 | −0.16 | −0.03 | −0.52 | 17.05 | −34.76 | 296 | – | incumbent |
| **T1** | −0.08 | −0.08 | −0.62 | 7.84 | −17.07 | 296 | −0.05 | within-noise |
| T1a | −0.04 | −0.09 | −1.12 | 12.91 | −29.50 | 296 | −0.06 | within-noise (diag) |
| T1b | −0.20 | −0.05 | −0.80 | 16.24 | −32.55 | 296 | −0.02 | within-noise (diag) |
| T1c | −0.18 | 0.05 | 0.53 | 10.30 | −18.40 | 296 | +0.08 | within-noise (diag) |
| **T2** | −0.20 | −0.07 | −1.31 | 20.04 | −34.66 | 296 | −0.04 | within-noise |
| **T5** | −0.77 | −0.03 | −0.45 | 13.35 | −32.89 | 70 | −0.00 | within-noise |
| C0 | −0.11 | 0.57 | 9.34 | 15.69 | −23.64 | 70 | – | incumbent |
| **C1** | −0.06 | 0.11 | 1.30 | 11.36 | −25.90 | 70 | −0.46 | no-improvement |
| C1b | −0.07 | 0.71 | 2.99 | 4.13 | −7.68 | 70 | +0.14 | within-noise (diag) |
| **C2** | −0.09 | 0.47 | 10.27 | 21.05 | −36.80 | 70 | −0.10 | within-noise |
| **C3** | −0.20 | 0.61 | 9.56 | 14.97 | −22.45 | 70 | +0.04 | within-noise |
| KB | −0.18 | 0.35 | 4.29 | 12.02 | −22.47 | 70 | – | incumbent |
| **K1** | 0.03 | 0.00 | 0.01 | 12.07 | −27.25 | 296 | −0.35 | within-noise |
| **K2** | −0.01 | −0.10 | −1.62 | 15.83 | −36.01 | 296 | −0.45 | no-improvement |

**Pre-registered reading: "it didn't."** All 8 factor-book primaries are
`within-noise` or `no-improvement`; none survives Bonferroni. The largest
positive primary Δ is C3's +0.04. Reported as-is.

What the numbers also say (context, not verdicts):

- **The incumbents themselves have no demonstrated edge.** The G10-vs-USD trend
  basket is negative in-sample (2008–2021) and flat out of sample. Carry is
  negative in-sample and +0.57 out of sample, which is 1.4 SE, over a
  rate-divergence era (2021–26). That is regime dependence, not evidence.
- **T5's IS Sharpe of −0.77 is not a sign bug.** On audit, the selector goes
  long the top residual-momentum scores, as specified. Flipping the sign
  post hoc would not help: OOS it is −0.03, so reversal is ≈0 too.
- **Power.** With 5.7 y OOS, one SE is 0.41 Sharpe, and Bonferroni needs +1.05.
  The literature sizes these overlays at +0.1–0.3. This design could not have
  confirmed a realistic improvement; it could only have caught a large one.
  Every observed Δ is also ≤ +0.14, so none of the overlays is large.

### 6.2 Audit notes (bug review before accepting the null)

- **No-lookahead:** prefix-vs-full tests pass for every variant (§ tests). The
  rebalance uses data ≤ i−1.
- **Design flaw found in C2/C3.** The overlays multiply the incumbent's *target*
  weights, and the carry book only re-targets every 21 days. So the risk gate
  and the vol regime were read once a month. A risk-off gate that looks once a
  month is largely blind to the fast crashes it exists for. C3 as run therefore
  tested "monthly gate", not the idea. This did not affect the trend (weekly) or
  K1/K2 (daily) overlays.
- **OU pooled test (§5):** results not yet recorded.

### 6.3 Next steps (not pre-registered yet — the OOS window has been seen)

Any follow-up is now contaminated by having seen 2021–26. It is labelled as
such and should be forward-tested before being believed.

1. **C3 re-specified as a daily overlay.** Hold the monthly carry targets, but
   scale the live book daily by the gate multiplier. Cost is charged on the
   turnover this causes.
2. **Paired-difference SE as a diagnostic column.** Use the SE of (variant −
   incumbent) daily returns, not the incumbent's own SE. It is the fair test for
   an overlay that shares most of its noise with the incumbent. Verdicts stay on
   the frozen rule.
3. **Move the sizing bricks to where breadth exists.** CF sizing and the
   vol-regime multiplier are portfolio-construction tools. 7 USD crosses give
   them little to work with. The multi-asset `trendFollowEngine` is the engine
   with an existing trend result.
