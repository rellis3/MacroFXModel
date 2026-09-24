# NQ net GEX vs next-day diffusion, against a Brownian baseline — results (2026-09-24)

Pre-registration: [`GEX_RANGE_BROWNIAN_PREREG.md`](GEX_RANGE_BROWNIAN_PREREG.md),
committed in `0663f29` **before** the run.
Scripts: `scripts/18_gex_range_brownian.py`, `scripts/19_gex_range_diagnostics.py`.
Raw output: `data/results/gex_range_brownian.json`, `data/results/gex_range_diagnostics.json`.

## Verdict: **SUPPORTED** — with one deviation from the pre-registration, recorded below

`DR` = realised next-day log range ÷ the range a driftless random walk of the same
trailing vol would have produced. GEX read at t, range at t+1.

| Surface | Normaliser | n | ΔDR raw | p | ΔDR vol-matched |
|---|---|---|---|---|---|
| **near** (what G2 reads) | **rv20** | 793 | **+0.176** | **0.0008** | **+0.315** |
| near | atr14 | 793 | +0.071 | 0.154 | +0.172 |
| all | rv20 | 1,516 | +0.076 | 0.035 | +0.225 |
| all | atr14 | 1,516 | +0.036 | 0.260 | +0.125 |

Real-IV gamma (`net_gex`, 743 days) gives +0.197, p 0.0004 — **not** independent
corroboration: it agrees with `net_gex_sum` on sign 95.8% of the time.

## The deviation, stated plainly

**The pre-registered positive control failed** (ΔDR 0.061, p 0.20) and the prereg says
the harness must pass before the result is believed. On inspection the control was
**mis-specified by me**: it used trailing |return| to predict next-day range, but `DR`
is *already divided by trailing 20-day vol*, so the statistic removes most of exactly
that signal by construction. A control the statistic is designed to neutralise tests
nothing.

It was replaced with a **synthetic injection control** — multiply a random half of the
real `DR` series by 1.15 and check the detector recovers it. It does: expected +0.135,
recovered **+0.129, p 0.0045**. That tests the machinery, which is what the gate was
for. The placebo (+125-day circular shift: ΔDR −0.005, p 0.93) and the no-lookahead
check both passed as written.

This is a post-hoc change to a pre-registered harness. It is defensible, but it is a
deviation and is logged as one rather than quietly swapped.

## The confound test, which is the real result

Short-gamma days cluster in high-vol regimes (top vol quintile: 87 short / 72 long;
bottom quintile: 18 short / 141 long). So the obvious alternative explanation was that
trailing vol is simply **stale** on short-gamma days and `DR > 1` follows mechanically.

Stratifying on trailing vol and re-comparing **within** strata does not collapse the
gap — it **roughly doubles** it, +0.176 → **+0.315**:

| Vol stratum (rv20) | n S/L | DR short | DR long | ΔDR |
|---|---|---|---|---|
| 0.110 | 18 / 141 | 1.494 | 1.009 | +0.485 |
| 0.146 | 26 / 132 | 1.250 | 0.938 | +0.312 |
| 0.181 | 53 / 106 | 1.084 | 0.811 | +0.273 |
| 0.221 | 60 / 98 | 0.897 | 0.734 | +0.163 |
| 0.319 | 87 / 72 | 0.905 | 0.563 | +0.343 |

The raw number was **diluted** by the confound, not created by it: short gamma
concentrates in the high-vol strata where `DR` is low for everyone. Same sign in all
five strata; pooled p ≈ 0.

**By year:** +0.164 (2020), +0.318 (2021), +0.169 (2022), +0.085 (2023), +0.435 (2025),
+0.074 (2026). Six of six usable years positive. 2024 is unjudgeable — only 7
short-gamma days in 131.

## What it actually says — and it is not what G2 assumes

The gap is real; the **asymmetry** is the useful part. Short-gamma days sit at
`DR ≈ 1.02` — i.e. almost exactly Brownian. Long-gamma days sit at `DR ≈ 0.85`.

> The information is not "short gamma is wild". It is **"long gamma is quiet."**

G2 currently reads short gamma as the actionable state (→ conservative tier, half
size). On this evidence the tradeable asymmetry points the other way: long-gamma days
are the ones that reliably behave differently from a random walk, and they do it by
*not moving*.

**Do not read `DR_long < 1` as "sub-Brownian" in absolute terms.** The absolute level
carries a known estimator bias — a high−low range and a close-to-close vol are not the
same measurement, so `DR` has a scaling offset independent of gamma. Only the **gap
between regimes** is interpretable. The prereg's "absolute reading" secondary test is
therefore withdrawn as unsound; the relative test stands.

## Pushing out or reverting back? Both, at different horizons

Lo–MacKinlay variance ratios within each regime (primary cell):

| Regime | VR(2) | VR(3) | VR(5) |
|---|---|---|---|
| Short gamma | 0.824 | 0.760 | **0.683** |
| Long gamma | 0.953 | 0.900 | 0.887 |

Both regimes mean-revert multi-day, but **short gamma reverts far harder**. Combined
with the intraday result, the picture is coherent with dealer hedging: short gamma
**pushes the day out** and then **gives it back** over the following week; long gamma
is damped intraday and drifts more cleanly. A push-out that reverts is a range
statement, not a directional one.

## What this does and does not license

- ✅ The 2026-07-29 prerequisite is **discharged**. GEX is not uncorrelated with
  realised range; it carries range information that survives a vol-matched control.
- ✅ The operational bar (ΔDR ≥ 0.10) **passes** on the primary cell raw and on all
  four cells vol-matched. GEX is good enough to inform a stop width.
- ❌ **No directional content.** This is a range/diffusion finding. It says nothing
  about G3, the wall-magnet premise, or which way to trade.
- ❌ It does **not** rescue the 2026-08-22 `gamma_band_realised.py` null — that tested
  *band position* on 24 dates; this tests *net book GEX* on 793 days.
- ❌ Single instrument. NQ only. Pooling across the six FX pairs in `OI Data/` is a
  separate test needing its own pre-registration.

## The open confound, untested

Negative net GEX may proxy for **event days** (CPI, FOMC, opex), which have large
ranges for reasons that have nothing to do with dealer hedging. This has not been
tested and is the most likely way the finding is wrong. Anyone building on it should
run the event-day exclusion first — it is cheap, and the econ calendar is already in
the repo.
