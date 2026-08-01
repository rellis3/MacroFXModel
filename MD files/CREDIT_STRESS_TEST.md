# Credit-Stress Index (CSI) Overlay — pre-registration

> **Status: PRE-REGISTERED, NOT YET RUN.** Design and pass/fail frozen **before** the
> first live-data run (needs FRED + OANDA on Railway via `credit-stress.html`).
> Editing criteria after seeing results voids the test. One shot.

## What this is — and is NOT

A **risk-overlay brick**, not a strategy. The CSI composites credit-stress gauges
into one z-scored index and the test asks only one question: **does scaling a book's
exposure by CSI improve its OOS Sharpe versus (a) no gate and (b) the same gate built
on VIX alone?** Credit stress as a *directional alpha* signal is explicitly not
claimed and not tested — stress gauges are coincident-to-lagging for direction.

**The benchmark is named up front: VIX alone.** All CSI components (quality spread,
HY OAS, VIX; CDS omitted — Markit data isn't retail-accessible, and CDX≈HY OAS
anyway) load on the same risk-off factor. If the composite can't beat its simplest
ingredient as a gate, the extra components are decoration. **Blunt odds ~30–40%**
the composite beats VIX-alone OOS — better than most ideas here because
risk-scaling is the replicated use of this data, but "VIX was enough" is a very
live outcome and would itself be a useful (cheap) answer.

## Design (frozen)

**Components** (FRED, daily): quality spread = `BAMLC0A4CBBB − BAMLC0A1CAAA`;
HY OAS = `BAMLH0A0HYM2`; VIX = `VIXCLS`.

**Index:** each component rolling-z-scored over **252 trading days** (`statsCore.
rollingZScore`, no fitted parameters), **equal-weighted mean** on common dates.
Weights are frozen at equal — fitting weights to history is the overfitting path.

**Publication lags:** OAS series shift **+2 calendar days**, VIX **+1** (FRED posts
BAML OAS next business day). The gate at day *t* uses the latest CSI value dated
**≤ t−1** (as-of lookup — decisions use yesterday's published index).

**Gate rule (frozen tiers):** exposure ×1.0 while CSI z < 1 · ×0.5 while 1 ≤ z < 2
· ×0.0 while z ≥ 2. Same rule for the VIX-only baseline (on VIX's own 252d z).

**Targets** (both reported; the primary decides):
- **PRIMARY — the equal-weight long-currency basket** (the trend basket's benchmark:
  long EUR GBP AUD NZD JPY CAD CHF vs USD): the purest always-on risk book — exactly
  what a stress gate is supposed to protect.
- **SECONDARY — the trend basket itself** (evidence-backed sleeve; already partially
  defensive, so the gate has less to add — reported, not decisive).

**Split:** 60/40 IS/OOS by date, same daily-MTM stats as the basket engines. Costs:
the underlying books already charge their own; the gate itself trades rarely (tier
changes) and its turnover cost is charged at the same bps on exposure change.

## Pass / fail (frozen — both outcomes written first)

**"It worked" =** on the PRIMARY target, ALL of:
1. CSI-gated **OOS Sharpe > ungated** OOS Sharpe;
2. CSI-gated **OOS Sharpe > VIX-only-gated** OOS Sharpe;
3. Same ranking holds in-sample, ties allowed (IS consistency — an OOS-only fluke
   doesn't count, but a stretch where the gates never fire must not fail it).

Then the CSI earns: promotion as a sizing input candidate for the live sleeves
(wired behind a flag, still not alpha). Max drawdown change is **reported** as
secondary evidence but does not decide.

**"It didn't" =** anything less. Specifically: if CSI beats ungated but not
VIX-only, the recorded verdict is **"gate real, composite unnecessary — use VIX"**;
if neither beats ungated, the verdict is **"no gate"**. Either null is recorded
here and in `BACKTEST_INDEX.md`; no weight-fitting, tier-tuning or component
swapping to rescue it.

## Diagnostics displayed alongside (NOT part of the test)

**"Credit Vega"** — rolling 63d beta of Δ(HY OAS, bps) on Δ(VIX, points), labelled
High/Elevated/Normal/Low by its trailing 3y percentile. Reading: low = credit
absorbing vol spikes; high = stress transmitting into credit. Strictly a rolling
beta ("vega" is display shorthand). It contributes **nothing** to the CSI, the
gate, or the verdict — adding inputs to a pre-registered test voids it. If CSI
passes, a vega-conditioned gate may be proposed as a **new** pre-registered
follow-up; it must never be retrofitted into this one.

## Amendment 2026-07-18 — run 1 INVALID (data), components substituted, criteria untouched

The 2026-07-18 run is **not a verdict**: FRED now serves the ICE BofA OAS series
(`BAMLC0A1CAAA`/`BAMLC0A4CBBB`/`BAMLH0A0HYM2`) with only a **trailing ~3-year
window** (observed: 787 obs from 2023-07-20 despite requesting 2004). After the
252d z warmup the CSI did not exist before ~mid-2024, and the gate fails OPEN with
no reading — so "CSI-gated" was bit-identical to "Ungated" through 2008/2011/2020
(the IS rows matched exactly). Banking "no-gate" from a run where the gate was
asleep for ~94% of the period would record noise as a verdict. Per the working
agreement ("data limits beat fake productivity"), the run is recorded as
**invalid — data unavailable**.

**Substitution (declared before any valid full-history run):** the credit legs
move to Moody's series, daily and unrestricted on FRED since 1986:
- quality spread = `BAA10Y − AAA10Y` (Baa−Aaa quality slope)
- credit spread = `BAA10Y` (Baa over 10Y Treasury)
- `VIXCLS` unchanged.

Everything else — z window, equal weights, gate tiers, lags, targets, the frozen
pass/fail and the VIX-only benchmark — is **unchanged**. This is a data
substitution forced by availability, not component iteration. The one live shot
remains pending.

## Result (final — the one VALID run, 2026-07-18, post-amendment, full 2004+ history)

- Date run: **2026-07-18** (2005-01-02 → 2026-07-17, 6141 days; Moody's legs 5,633
  obs from 2004-01-04 — data complete, 2008/2011/2020 all in-window)
- PRIMARY (risk basket): ungated OOS Sharpe **−0.08** · VIX-gated **−0.15** ·
  CSI-gated **−0.15** (CSI OOS maxDD −17.6% vs ungated −19.9% — reported, not
  decisive)
- SECONDARY (trend basket): ungated **−0.08** · VIX-gated **−0.06** · CSI-gated
  **−0.22**
- Verdict: **NULL — `no-gate`, banked.** Gating made the book WORSE out-of-sample,
  and the composite added nothing over VIX (OOS identical at −0.15). Criteria
  1 and 2 both failed; per pre-registration there is no tier/weight/component
  iteration.
- The instructive detail: **in-sample the CSI gate genuinely helped** (IS Sharpe
  +0.01 vs −0.10 ungated, maxDD −24.4% vs −28.3% — it sidestepped the GFC-era
  drawdowns), then **hurt OOS** (2017–2026). The OOS era's stress events (above
  all March 2020) were fast V-shapes: a daily z-tier gate de-risks *after* the
  hit lands and is still flat through the snapback. Slow-burn crises rewarded
  stress-gating; modern fast crashes punish it. That regime change is the
  finding.
- Disposition: `credit-stress.html` stays as a **read-only stress dashboard**
  (CSI level + Credit Vega diagnostic — both working correctly post-amendment);
  wired into no sizing path. The durable risk lever on these books remains
  inverse-vol sizing, which they already have. `BACKTEST_INDEX.md` Q12
  answered ⛔.
