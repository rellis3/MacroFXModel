# hlproj-p90-morning-follow: results

**Setup**
- Prereg: `forge/HLPROJ_P90_MORNING_FOLLOW_PREREG.md` (f3a9fa44). Script: `scripts/hlproj-p90-morning-follow/score.py`. Seed 20261126.
- **Discovery (futures, post-hoc):** Jordan's HL moving projection at P90, inside touch, 07:00–10:00 London.
  Continuation 61.3% vs rejection 36.1%, placebo 45.6 / 49.3%. Follow gross +0.25R, net +0.10R, n = 380.
- **Replication:** 22 CFDs whose price paths aren't in the futures set (the FX crosses, PALLADIUM, UK100),
  2020 → 2026-08-21, gross.

## Verdicts (replication sample)

| Test | Result [90% CI] | Halves (2020–22 / 2023–26) | BH | Verdict |
|---|---|---|---|---|
| **R1** continuation − rejection, line − placebo | **−3.0 pp** [−11.9, +5.7] | −15.2 / +5.1 | no | **UNDERPOWERED** (estimate goes the wrong way) |
| **R2** follow gross R | +0.052R [−0.042, +0.138] | +0.010 / +0.081 | no | **UNDERPOWERED** |
| **R3** follow gross R, line − placebo | **−0.035R** [−0.139, +0.057] | −0.153 / +0.044 | no | **UNDERPOWERED** (estimate goes the wrong way) |

The cell on the CFD crosses (n = 812):

| | Continuation | Rejection | Follow gross |
|---|---|---|---|
| Line | 50.4% | 44.1% | +0.05R |
| Placebo | 51.7% | 42.4% | +0.09R |

- **The futures edge over placebo does not repeat.** A P90-sized stretch of the day's range early in the morning
  continues slightly more than it rejects (about +6 pp), but a placebo projection does the same or more.
- With an assumed 1.5-pip spread on the crosses (median cost about 0.09R), the follow is about −0.06R net.

## The time-of-day profile, both samples

| Window | CFD crosses: cont / rej (placebo) | Futures: cont / rej (placebo) |
|---|---|---|
| 00–07 | 53.6 / 43.0 (52.3 / 41.7) | — |
| 07–10 | 50.4 / 44.1 (51.7 / 42.4) | **61.3 / 36.1** (45.6 / 49.3) |
| 10–13 | 45.4 / 46.8 (44.2 / 43.6) | 52.8 / 43.2 (49.2 / 46.8) |
| 13–16 | 47.3 / 46.4 (44.8 / 47.4) | 52.5 / 45.4 (49.7 / 45.9) |
| 16–22 | 31.2 / 30.4 (27.9 / 31.5) | 37.8 / 37.3 (36.6 / 35.8) |

In both samples, the HL-projection P90 leans to continuation before 16:00 and goes quiet after 16:00 (a third of
touches go nowhere). The 07–10 futures cell is the only one well clear of its placebo, and it doesn't replicate.

**Graded weight:**
- Against "HL P90 in the London morning" as a level-specific edge (the futures cell looks like a search artefact).
- Weak, generic: an extreme range stretch before 16:00 leans to continuation (+3 to +10 pp), at real and placebo levels alike.

**Audit done with this study:** the NQ median 13–16 London outcomes were recomputed from the raw NT8 minute file,
independently of the build. They agree on 2,059 of 2,059 touches: continuation 48.9%, rejection 47.6%, consolidation
3.5% (NQ). From the first touch of the NQ Close median at 13–16, P75 is reached first 35% of the time and a 0.25σ
fall back first 62%.
