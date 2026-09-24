# Event-day confound and the G3 wall-magnet test — results (2026-09-24)

Pre-registration: [`G3_AND_EVENTDAY_PREREG.md`](G3_AND_EVENTDAY_PREREG.md), committed
in `0afafbb` **before** the run. Script: `scripts/20_eventday_and_g3.py`.
Raw output: `data/results/eventday_and_g3.json`.

---

## TEST A — event-day confound: **SURVIVES**

The GEX range finding named this as the most likely way it was wrong. It isn't.

| Subset | n | vol-matched ΔDR |
|---|---|---|
| Covered subset, all days | 602 | +0.304 |
| **Non-event days only** | **449** | **+0.306** |
| Event days only | 153 | +0.306 |
| *(full 793-day frame, for reference)* | 793 | +0.315 |

Event days = FOMC decision, CPI m/m, Core CPI m/m, NFP, plus computed monthly opex,
excluded on **t+1** because that is when the range is measured.

The three numbers are **identical to three decimal places**. If events drove the
effect, the event subset would carry it and the clean subset would not; instead the
gap is the same whether the next day is an FOMC decision or an ordinary Tuesday. The
confound is not just insufficient to explain the finding — it contributes nothing.

190 rows after the calendar's 2025-04-07 end were dropped rather than assumed
event-free, as pre-registered.

---

## TEST B — G3 wall-magnet direction: **NULL**

| | n | Hit rate | 95% CI | Spearman IC | p |
|---|---|---|---|---|---|
| IS (to 2024-01-30) | 369 | 50.7% | 45.6–55.8 | +0.101 | 0.052 |
| **OOS** | **246** | **48.8%** | **42.5–55.0** | +0.061 | 0.344 |

OOS hit rate is **below a coin flip** and sits inside the pre-registered null band
(48–52%). IC is insignificant. The classic in-sample-flatters pattern the lesson
warns about: IC halves and its p-value goes from borderline to nothing.

Placebo (block-shuffled edge) returned 49.9% — the harness is not manufacturing a
result. Feasibility is not the binding constraint: spread/ATR = 0.0074, far inside
the 0.15 gate. **There is simply nothing to trade.**

### The buckets do lean the predicted way — and it is within noise

| Bucket (edge %) | IS mean next-day | OOS mean next-day |
|---|---|---|
| < −1.5 | −0.063% (n197) | +0.041% (n119) |
| −1.5..−0.5 | −0.573% (n10) | −0.222% (n10) |
| −0.5..0.5 | +0.236% (n10) | +0.547% (n12) |
| 0.5..1.5 | −0.338% (n15) | +0.137% (n16) |
| **> 1.5** | **+0.234% (n137)** | **+0.250% (n89)** |

The two extreme buckets lean in the predicted direction in both halves (wall above
spot → higher next-day return). But the OOS gap is 0.21%/day against a per-bucket
standard error of roughly 0.16% — so the difference carries an SE of about 0.22% and
is indistinguishable from zero. That is the same story the hit rate and the IC tell.
**Reporting the lean as a finding would be reading noise**, and the middle buckets
(n = 10–16) are far too thin to establish a staircase at all.

### Population accounting

| G3 state | Days | % |
|---|---|---|
| VALID (tradable) | 615 | 77.6% |
| NEUTRAL — walls balanced | 170 | 21.4% |
| NEUTRAL — pinned (|edge| < 0.15%) | **8** | **1.0%** |

Two things fall out:

1. **The 0.15% pin gate is effectively dead code.** It fires on 8 days in 793. The
   wall sits more than 1.5% from spot on the large majority of days, which is why the
   bucket distribution is bimodal and the middle is empty.
2. `sign(edge_pct)` therefore *is* essentially the whole signal — which is exactly
   what the hit rate measures, and it gets 48.8% out of sample.

---

## What this means for the COG shadow

**G3 supplies the shadow's only directional input, and that input has no directional
content.** The trade/no-trade decision is `G1.bias === G3.direction`; G2 cannot move
it. So on this evidence the shadow's direction is G1's macro bias, gated by a coin flip.

This is consistent with, and independent of, the 2026-09-23 wall placebo (walls reject
no more than neighbouring strikes). That tested walls as barriers, this as magnets.
Both come back null. **The expectation of a null was written into the pre-registration
before the run**, so this is a confirmed prior, not a surprise.

### It does not follow that the shadow should be switched off

- G2's range layer is now validated twice (Test A above), and the useful asymmetry —
  *long gamma is quiet* — is real.
- G1 has never been tested on its own. The forward log cannot test it either, because
  the conflict rule means most days produce an abstention.

### What should change

1. The live G3 alert should stop presenting a direction as if it carried information.
2. `DECISIONS.md` should record that the wall-magnet inference for Gate 3 is falsified
   on 615 days — the reversal condition the 2026-07-29 "macro stays in" entry named
   was the runs test, which no longer needs to wait.
3. The natural next test is **G1 alone**: does net-liquidity bias predict NQ direction?
   It is the last untested layer, the data is already assembled, and it is the one COG
   actually stated he uses. That needs its own pre-registration.
