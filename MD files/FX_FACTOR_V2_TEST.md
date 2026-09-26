# FX Factor Book v2 — Pre-registered test

> **Status: PRE-REGISTERED, NOT YET RUN on real data** (frozen 2026-09-26, before
> any OANDA/FRED run). Written before the result exists so a null can't be
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

_Not yet run. Paste the route output summary here (date, commit, verdict table)
when it has been run on Railway._
