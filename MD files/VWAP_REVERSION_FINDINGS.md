# VWAP Reversion — Findings (NULL)

**Question.** Is session VWAP a *tradeable intraday fair-value level* — or
practitioner folklore? Tested the two opposite hypotheses about a price touch
relative to VWAP, plus a continuation control, through one entry primitive
(`js/vwapReversionEngine.js`), on real OANDA M1, with costs and a true IS/OOS
split.

**Pre-registered prior (before running):** `band_fade` ~15–20%, `vwap_bounce`
~10% chance of a real after-cost OOS edge. Default expectation: **null**.
"Worked" = pooled OOS per-trade **t > 2**, positive mean, majority of pairs
OOS-positive. "Null" = t ≈ 0, or positive only gross / only in-sample.

**Outcome: NULL — and worse, it loses the cost.** Confirmed, not hoped.

---

## The modes

| Mode | Idea | Family | Prior |
|---|---|---|---|
| `band_fade` (A) | fade the ±2σ VWAP band back to VWAP | mean-reversion | ~15–20% |
| `vwap_bounce` (B) | after a stretch, trade the pull-back to VWAP betting it holds | support/resistance (folklore) | ~10% |
| `band_follow` (control) | break through the band, target the next band out | continuation | — |

All three are the SAME primitive with `{location, action}` swapped — not three
bespoke legs. Fill walker (`walkBars`) and IS/OOS reporter (`summarizeSplit`)
are imported from the baseplate, not re-implemented.

---

## Result — 26 pairs, real OANDA M1 2016–2026, costed

Setup: session anchor = UTC day; entry band = 2.0σ; stop = 1.5σ; cost = 0.012%
round-trip per trade; OOS = last 40% of the timeline. VWAP σ-bands built from
tick-weighted `hlc3`. Pooled per-trade **t-stat** is annualisation-free —
a t near 0 is a null; strongly negative means the mode loses the cost every
trade.

| Mode | OOS n | OOS mean/trade | OOS t | OOS win% | pairs OOS-positive | median pair Sharpe |
|---|---|---|---|---|---|---|
| `band_fade` (A) | 32,715 | **−0.0135%** | **−46.6** | 38.8% | **0 / 26** | −0.28 |
| `vwap_bounce` (B) | 32,156 | **−0.0127%** | **−21.7** | 41.2% | **0 / 26** | −0.15 |
| `band_follow` (control) | 32,155 | **−0.0149%** | **−71.9** | 32.6% | **0 / 26** | −0.47 |

In-sample is the same story (band_fade IS mean −0.0134%, t −56.0; the sign does
not flip between IS and OOS — it's structurally negative both ways). The
continuation control (`band_follow`) bleeds the most, as you'd expect if the
series is choppy at this scale but the fade still has no exploitable reversion.

### There is no gross edge either

The mean loss ≈ the cost, so back out the 0.012% cost and `band_fade`'s **gross**
mean is ≈ **−0.0015%/trade** — indistinguishable from zero, marginally negative.
This is not "a real edge killed by transaction costs." At a 2σ band with a 1.5σ
stop the reward:risk is ~1.33:1, needing ~43% wins to break even gross; the modes
print 33–41%. VWAP-relative entries at this configuration are a coin flip at best,
and costs make them a clear loss.

---

## Why this was the base rate

- **VWAP predicts nothing on its own.** It is a volume-weighted average of past
  price — a lagging fair-value *estimate*, not a forecast. Fading or bouncing off
  it is the support/resistance heuristic with a moving line; `TRADABILITY_REVIEW.md`
  and `CLAUDE.md` already flag S/R as folklore with no durable after-cost evidence.
- **FX "volume" is tick count, not traded volume.** The weighting that gives an
  equity VWAP its meaning (real institutional participation) is absent here, so an
  FX VWAP is weaker still — a slightly-fancier moving average.
- **Execution can't manufacture edge.** The original design used VWAP as the
  *trigger* on top of a macro/vol/OI stack. This isolates the trigger and shows it
  carries no standalone edge — consistent with the honest-teammate point that a
  confluence of individually-null signals is still null.

---

## What would (and wouldn't) change the verdict

A null here does **not** prove "VWAP is useless in every form." What it rules out
is the *standalone* fade/bounce/break at a σ-band being tradeable after costs.
Things deliberately **not** tested (and not obviously worth testing given a 0/26,
gross-flat result):

- VWAP as a *conditioning filter* on an edge that already exists (e.g. only take
  a proven momentum/carry signal when price is on the "right" side of VWAP). That
  is meta-labeling — it needs a primary edge to size, which this repo does not yet
  have validated intraday.
- Session anchors other than UTC-day (London/NY open), or anchored-VWAP to
  events. Different line, same folklore family; the prior stays low.

## Status

Kept as a **costed, reproducible harness**, not shipped as a strategy:
`js/vwapReversionEngine.js` + `vwap-reversion.html` (`/api/vwap-reversion/*`).
The engine's one primitive is available for any future VWAP-conditioned idea.
Registered in `LEGO_MODULES.md`.
