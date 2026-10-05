# CROSS-IV — results

Pre-registration: `forge/CROSS_IV_PREREG.md`.

**Verdict: PASS.** Train before 2023-05-02, test after. Pooled β (std) 0.1107, elasticity 0.591 (σ_adj ∝ (IV/σ)^elasticity). Test pinball B÷A median **0.9653**, better on **100%** of crosses.

Transfer check (majors' elasticity 0.786, frozen): median 0.9689, better on 100%.

| test days | n | A p75 exceed | B p75 exceed | transfer |
|---|---|---|---|---|
| iv_low | 4254 | 15.8% | 22.8% | 25.4% |
| iv_high | 4065 | 31.9% | 23.3% | 20.8% |
| all_days | 13049 | 23.8% | 23.5% | 23.6% |

| cross | train | test | B÷A | transfer÷A | A p75 | B p75 | corr(leg IV, next-20 RV) |
|---|---|---|---|---|---|---|---|
| AUDCAD | 1205 | 870 | 0.9416 | 0.9423 | 25.9% | 23.8% | 0.432 |
| AUDCHF | 1205 | 870 | 0.9462 | 0.9477 | 23.4% | 22.1% | 0.317 |
| AUDJPY | 1209 | 870 | 0.9572 | 0.9594 | 23.1% | 22.4% | 0.427 |
| CADCHF | 1205 | 869 | 0.9272 | 0.9249 | 23.0% | 24.5% | 0.385 |
| CADJPY | 1205 | 870 | 0.9605 | 0.9577 | 23.1% | 24.9% | 0.463 |
| CHFJPY | 1205 | 870 | 0.9689 | 0.9689 | 22.4% | 24.0% | 0.565 |
| EURAUD | 1205 | 870 | 0.9749 | 0.9825 | 24.3% | 23.6% | 0.473 |
| EURCAD | 1205 | 870 | 0.9653 | 0.971 | 20.5% | 21.3% | 0.592 |
| EURCHF | 1205 | 870 | 0.9757 | 0.9764 | 22.6% | 24.4% | 0.544 |
| EURGBP | 1697 | 870 | 0.9844 | 0.9887 | 27.4% | 25.9% | 0.61 |
| EURJPY | 1697 | 870 | 0.9752 | 0.9779 | 21.7% | 22.0% | 0.594 |
| GBPAUD | 1205 | 870 | 0.9544 | 0.963 | 27.0% | 22.4% | 0.439 |
| GBPCAD | 1205 | 870 | 0.9703 | 0.9698 | 22.8% | 22.9% | 0.522 |
| GBPCHF | 1205 | 870 | 0.9553 | 0.9513 | 26.1% | 27.0% | 0.454 |
| GBPJPY | 1697 | 870 | 0.9735 | 0.9749 | 23.4% | 22.0% | 0.469 |

## Data audit

- AUDCAD: 2075/2628 usable, 2018-10-02 to 2026-08-21
- AUDCHF: 2075/2628 usable, 2018-10-02 to 2026-08-21
- AUDJPY: 2079/2632 usable, 2018-10-02 to 2026-08-21
- CADCHF: 2074/2628 usable, 2018-10-02 to 2026-08-21
- CADJPY: 2075/2628 usable, 2018-10-02 to 2026-08-21
- CHFJPY: 2075/2628 usable, 2018-10-02 to 2026-08-21
- EURAUD: 2075/2628 usable, 2018-10-02 to 2026-08-21
- EURCAD: 2075/2628 usable, 2018-10-02 to 2026-08-21
- EURCHF: 2075/2628 usable, 2018-10-02 to 2026-08-21
- EURGBP: 2567/2628 usable, 2016-11-14 to 2026-08-21
- EURJPY: 2567/2628 usable, 2016-11-14 to 2026-08-21
- GBPAUD: 2075/2628 usable, 2018-10-02 to 2026-08-21
- GBPCAD: 2075/2628 usable, 2018-10-02 to 2026-08-21
- GBPCHF: 2075/2628 usable, 2018-10-02 to 2026-08-21
- GBPJPY: 2567/2628 usable, 2016-11-14 to 2026-08-21