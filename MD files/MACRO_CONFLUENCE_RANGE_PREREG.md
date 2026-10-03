# MACRO-CONFLUENCE-RANGE — Does agreement across independent macro domains (liquidity momentum, yield-curve regime, credit stress) predict forward RANGE on FX/index instruments, even though it does not predict direction?

**Pre-registered 2026-10-03, before the harness was written or run.**

> Commit this file BEFORE writing the harness. `study.mjs bank` checks git and refuses a
> result whose pre-registration was committed afterwards.

## The claim

`macro-confluence-baa-credit` (NULL, 2026-10-03) tested whether three macro domains
agreeing on DIRECTION predicts forward direction, properly powered (77 episodes,
2009-2026). It did not, and the one nominal hit failed the mirror gate.

This is the pattern-match for this desk's OWN evidence record, not a new folk claim:
nineteen validated findings on this ledger skew overwhelmingly toward RANGE and TIMING
(`vix-inversion`, `gex-range`, `surprise-size`, `approach-speed`, `range-forecast-
calibrated`), while DIRECTION claims are close to uniformly null
(`yield-asset-coupling`, `curve-inversion`, `funding-stress`, `rates-pivot-lead`, both
confluence studies). The same three domains that failed to predict direction are
re-asked the question this desk's own track record says is more likely to pay off:
does macro confluence mark a higher-volatility REGIME, regardless of which way it
eventually resolves?

## Why it is not already settled

No study on this ledger has tested RANGE as the outcome for ANY of these three macro
domains, individually or combined — `funding-stress` and `curve-inversion` both tested
range too, but on different setups (funding stress episodes, inversion episodes), not
on this confluence definition. This reuses `macro-confluence-baa-credit`'s exact,
already-powered setup (same 77 episodes, same domains, same instruments) and changes
only the outcome measured — the cheapest, least-moved-goalpost re-ask available.

## Definitions, fixed in advance

- **Domains, setup, knowable-when, de-clustering, instruments**: identical to
  `macro-confluence-baa-credit` — Fed net liquidity z (|z|<0.3 flat), T10Y2Y 20d change
  (<2bp flat), BAA10Y−AAA10Y 20d change inverted (<5bp flat); confluence = all three
  agree in sign; 1-day FRED publication lag; 10-day de-clustering gap; EUR/USD, SPX500,
  GOLD; H = 5 and 20 trading days.
- **The change — the outcome**: forward range = (max high − min low) over the H days
  following the setup, ÷ ATR14 at the setup bar (the same ATR-normalised convention as
  `funding-stress` and `gex-range`), not forward return.
- **Primary test**: positive-confluence and negative-confluence pooled into one
  "confluence" event set (direction should not matter for a range claim) vs the same
  control as before (every day not within max(H) of a confluence episode, same span).
- **Secondary, descriptive only, not gating**: a dose-response check — mean forward
  range at 0, 1, 2 and 3 domains agreeing (not just the confluence/non-confluence
  split) — reported but not required for the verdict, since partial-agreement days were
  not de-clustered or control-matched the same way.
- **MIN_EVENTS**: 30 per cell, unchanged. Already known to clear it — 77 confluence
  episodes from the prior study.

## Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| a | Pooled confluence (either sign) → wider forward range (H=5, H=20) on EUR/USD, SPX500, GOLD, vs control? | **Real, weak-to-moderate.** Given this desk's dense range/timing validation record, I expect this to clear where the direction version did not — but I expect it to be modest (sub-0.15 ATR, in line with `funding-stress`'s own +0.10 ATR bar), not dramatic. |
| b | Does the effect hold separately for POSITIVE confluence alone and NEGATIVE confluence alone (not just pooled)? | **Expect yes, both.** If only one sign carries the pooled result, that is one sign's own volatility (plausibly the negative/risk-off side, which tends to realise bigger moves generally) masquerading as a confluence effect, not a genuine "agreement marks range" finding. |
| c | **THE GATE.** What must hold for this to count as real. | **All three.** (1) The pooled 95% CI (block bootstrap, block=5, 1000 reps) excludes zero AND the diff clears +0.10 ATR, matching `funding-stress`'s own bar. (2) Both halves of the pooled sample agree in sign. (3) BOTH signs separately (positive-only, negative-only) must each independently show diff > 0 — if one sign is flat or negative while the other carries the whole pooled effect, that is NOT confluence, it is one direction's own volatility, and the claim fails regardless of the pooled number. |

**My overall prior:** real but modest, clearing (a) and (c)(1)/(2) comfortably, with (c)(3)
the most likely place for this to fail if it does — risk-off (negative) macro alignment
plausibly carries more of the effect than risk-on alignment, which is itself worth
knowing even if it sinks the pooled claim as framed.

## What this does NOT test

- **Direction** — already closed by `macro-confluence-baa-credit`; this is range only.
- **A tradeable rule** — this is a research gate (does the regime marker exist), not an
  entry/stop/target design; translating a REAL verdict here into a sizing or stop-width
  rule is a separate, later step.
- **The dose-response secondary check** is descriptive, not gated — a clean 0→1→2→3
  staircase would be suggestive but cannot by itself pass or fail this study.
- **Causation or mechanism** — same caveat as every macro study on this ledger: a
  common driver could produce both the confluence AND the wider range.
