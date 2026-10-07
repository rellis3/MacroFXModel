# Meta-labelling built properly — layers 1–2 checks (before any model)

Pre-registration: `forge/META_LABEL_PROPER_PREREG.md`. Builder: `scripts/meta_proper/build_events.mjs`. 2016-01 → 2026-08, 6 USD pairs.

## Layer 1 — primary (yield-spread side, |z| ≥ 1.0, at CUSUM events)

| | value |
|---|---|
| CUSUM events | 6,490 (~102 per pair per year) |
| primary fires | 4,384 (68%) |
| precision, all primary bets | **50.9%** |
| precision, the traded strategy's zone \|z\| ≥ 2.0 | **56.0%** (1,074 bets) |
| no-skill baseline (either side at random) | 49.6% |
| recall (primary profit-barrier hits ÷ events where a barrier was hit) | 34.7% |
| mean net return per bet: all / \|z\| ≥ 2 | +0.009% / +0.096% |
| precision by year | 2016 .548 · 2017 .429 · 2018 .514 · 2019 .466 · 2020 .429 · 2021 .550 · 2022 .554 · 2023 .592 · 2024 .527 · 2025 .466 · 2026 .507 |

As designed: a high-recall, low-precision primary. The edge sits in the high-|z| zone (56% vs 50%), which |z| as a
feature lets the meta-model find rather than having it imposed.

## Layer 2 — triple-barrier labels (±2σ, 10 trading days, stop first, 0.02% cost)

| | value |
|---|---|
| ended at profit / stop / time | 44.9% / 43.0% / 12.0% |
| label balance (y = 1) | 50.9% |
| mean days held | 5.7 calendar days |
| exits strictly after entry (no look-ahead) | yes, all |
| **average uniqueness** | **0.122**: heavy overlap; 4,384 bets carry roughly 530 bets' worth of independent information |
| CUSUM move with the primary's side / against | 50.7% of bets; precision 50.3% / 51.5% |

Notes:
- UTC daily bars include the short Sunday-evening bar, exactly as the yield-spread engine builds them.
- σ is the point-in-time export σ (the chosen forecast's history starts 2020-08).
