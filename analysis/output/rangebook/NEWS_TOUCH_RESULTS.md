# News at the vol lines — results

Pre-registration: forge/NEWS_TOUCH_PREREG.md (f24f55a). First pass of each line within 120 min after a release; 177,490 rows (16 FX/gold + 6 indices). S = surprise sign aligned with the touch (|z| ≥ 0.5); R = the first 5-minute reaction aligned (≥ 0.1σ). Within-cell continue difference aligned − against, day-bootstrap 95% CI. R net of spread.

| def | set | releases | aligned − against [95% CI] | 2016–22 | 2023–26 | n (al / ag) | follow aligned R (halves) | fade against R (halves) |
|---|---|---|---|---|---|---|---|---|
| S | FX | Major | +2.5pp [-0.8pp, +6.1pp] | +0.5pp | +5.4pp | 4,574 / 2,803 | -0.027 (-0.022 / -0.031) | -0.026 (-0.088 / +0.038) |
| S | FX | Moderate (unseen) | -0.9pp [-2.9pp, +1.3pp] | -0.7pp | -1.8pp | 9,692 / 7,946 | -0.046 (-0.042 / -0.055) | -0.073 (-0.069 / -0.085) |
| S | FX | both | +0.2pp [-1.6pp, +2.0pp] | -0.4pp | +1.5pp | 14,266 / 10,749 | -0.040 (-0.038 / -0.043) | -0.061 (-0.073 / -0.035) |
| R | FX | Major | -0.5pp [-3.0pp, +2.0pp] | -1.9pp | +1.4pp | 8,516 / 4,922 | -0.025 (-0.048 / -0.004) | -0.076 (-0.093 / -0.059) |
| R | FX | Moderate (unseen) | +1.7pp [+0.0pp, +3.4pp] **real** | +1.3pp | +3.4pp | 14,556 / 10,490 | -0.054 (-0.051 / -0.061) | -0.057 (-0.063 / -0.035) |
| R | FX | both | +1.0pp [-0.5pp, +2.3pp] | +0.5pp | +2.3pp | 23,072 / 15,412 | -0.043 (-0.050 / -0.030) | -0.063 (-0.070 / -0.047) |
| R | IDX | Major | -4.4pp [-8.6pp, +0.0pp] | -4.9pp | -4.7pp | 3,066 / 1,918 | -0.040 (-0.035 / -0.042) | -0.061 (-0.069 / -0.057) |
| R | IDX | Moderate (unseen) | +1.7pp [-1.6pp, +4.8pp] | +1.7pp | +1.7pp | 5,120 / 3,292 | -0.006 (+0.004 / -0.026) | +0.005 (+0.022 / -0.023) |
| R | IDX | both | -0.6pp [-3.2pp, +2.0pp] | +0.4pp | -1.5pp | 8,186 / 5,210 | -0.018 (-0.005 / -0.035) | -0.019 (-0.001 / -0.040) |

By surprise size (S, FX/gold, Major + Moderate):

| |z| | aligned − against [95% CI] | n (al / ag) | aligned continue | follow aligned R | fade against R |
|---|---|---|---|---|---|
| 0.5–1 | -0.3pp [-3.0pp, +2.6pp] | 5,776 / 4,413 | 37% | -0.050 | -0.061 |
| 1–2 | +0.2pp [-2.3pp, +2.8pp] | 5,780 / 4,395 | 38% | -0.046 | -0.060 |
| > 2 | +1.7pp [-2.5pp, +6.1pp] | 2,710 / 1,929 | 41% | -0.007 | -0.058 |

BH 10% over 12 tests: 0 survive.

**Verdict (pre-registered PASS rule):** S follow aligned: fail; S fade against: fail; R follow aligned: fail; R fade against: fail

## Reading
- **The news effect did not hold up on data it had not seen.** On Moderate releases (the holdout) a surprise in the
  touch's direction changes nothing (−0.9pp [−2.9, +1.3]). On Major releases, with the pre-registered first-touch /
  120-minute definition, it is +2.5pp with a CI that crosses zero, smaller than the +7.4pp seen in
  forge/FLOW_COLUMNS_PREREG.md (any pass, 60 minutes). That earlier number was partly the particular slice.
- The market's own first reaction (R) is a hair better than the surprise sign on Moderate FX releases (+1.7pp, CI
  touching zero) and points the other way on index Major releases (−4.4pp: indices fade the first reaction).
- Bigger surprises (|z| > 2) lean toward continuation (41%, follow −0.007R) but the CI is wide.
- 0 of 12 trading tests survive; every pre-registered PASS condition fails.
