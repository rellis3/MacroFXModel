# COMBINED-RANGE — results

Pre-registration: `forge/COMBINED_RANGE_PREREG.md`.

## indices

**Verdict: PASS.** Train before 2022-08-29, test after. Test pinball B÷A median **0.9004**, B better on **100%** of instruments; flagged states closer to 25%: 7/7.

| feature | expected | joint β (std) | range multiplier | sign as in ledger |
|---|---|---|---|---|
| vix_inv | + | 0.0287 | ×1.106 | yes |
| front_dear | + | 0.0334 | ×1.074 | yes |
| front_calm | - | -0.059 | ×0.885 | yes |
| iv_sig | + | 0.192 | ×2.01 | yes |
| all_down | + | 0.0132 | ×1.034 | yes |
| nq_dw | + | 0.0472 | ×1.116 | yes |

| state (test) | days | A p75 exceed | B p75 exceed |
|---|---|---|---|
| vix_inv | 328 | 37.5% | 21.3% |
| front_dear | 2144 | 31.7% | 23.7% |
| front_calm | 1839 | 19.6% | 27.5% |
| all_down | 1151 | 33.4% | 23.7% |
| nq_dw | 1709 | 34.1% | 21.4% |
| iv_sig_low | 1833 | 13.1% | 25.2% |
| iv_sig_high | 2038 | 36.4% | 22.2% |
| all_days | 6138 | 25.8% | 25.0% |

| instrument | train | test | B÷A pinball | A p75 exc | B p75 exc |
|---|---|---|---|---|---|
| DE30 | 1516 | 1013 | 0.9447 | 26.9% | 20.5% |
| DOW | 1543 | 1030 | 0.8761 | 26.0% | 26.3% |
| NQ | 1543 | 1030 | 0.8782 | 25.2% | 26.7% |
| SPX | 1543 | 1030 | 0.8617 | 26.2% | 28.2% |
| UK100 | 1510 | 1005 | 0.9466 | 26.1% | 17.8% |
| US2000 | 1543 | 1030 | 0.9226 | 24.7% | 30.4% |

## fx_gold

**Verdict: PASS.** Train before 2023-01-09, test after. Test pinball B÷A median **0.9389**, B better on **100%** of instruments; flagged states closer to 25%: 5/7.

| feature | expected | joint β (std) | range multiplier | sign as in ledger |
|---|---|---|---|---|
| vix_inv | + | 0.0041 | ×1.014 | yes |
| front_dear | + | 0.0101 | ×1.021 | yes |
| front_calm | - | -0.0408 | ×0.918 | yes |
| iv_sig | + | 0.1337 | ×2.195 | yes |
| all_down | + | 0.011 | ×1.027 | yes |
| nq_dw | + | -0.0088 | ×0.981 | **no / ~0** |

| state (test) | days | A p75 exceed | B p75 exceed |
|---|---|---|---|
| vix_inv | 361 | 27.7% | 27.7% |
| front_dear | 2195 | 27.7% | 24.6% |
| front_calm | 2111 | 19.7% | 24.8% |
| all_down | 1184 | 27.1% | 24.3% |
| nq_dw | 1727 | 23.6% | 22.5% |
| iv_sig_low | 2319 | 13.7% | 23.1% |
| iv_sig_high | 2210 | 35.1% | 25.7% |
| all_days | 6653 | 23.2% | 23.8% |

| instrument | train | test | B÷A pinball | A p75 exc | B p75 exc |
|---|---|---|---|---|---|
| AUDUSD | 1122 | 953 | 0.9331 | 22.7% | 22.7% |
| EURUSD | 1664 | 953 | 0.9533 | 22.9% | 22.5% |
| GBPUSD | 1654 | 953 | 0.9509 | 24.3% | 23.4% |
| GOLD | 1635 | 935 | 0.9133 | 26.5% | 28.0% |
| USDCAD | 1122 | 953 | 0.9389 | 24.4% | 22.8% |
| USDCHF | 1122 | 953 | 0.9307 | 21.6% | 23.9% |
| USDJPY | 1654 | 953 | 0.9549 | 20.1% | 23.2% |

## Data audit

- NQ: 2573/2584 sessions usable (100%), 2016-09-06 to 2026-08-21
- SPX: 2573/2584 sessions usable (100%), 2016-09-06 to 2026-08-21
- DOW: 2573/2584 sessions usable (100%), 2016-09-06 to 2026-08-21
- US2000: 2573/2584 sessions usable (100%), 2016-09-06 to 2026-08-21
- DE30: 2529/2540 sessions usable (100%), 2016-09-06 to 2026-08-20
- UK100: 2515/2526 sessions usable (100%), 2016-09-07 to 2026-08-20
- EURUSD: 2617/2628 sessions usable (100%), 2016-09-06 to 2026-08-21
- GBPUSD: 2607/2628 sessions usable (99%), 2016-09-20 to 2026-08-21
- USDJPY: 2607/2628 sessions usable (99%), 2016-09-20 to 2026-08-21
- GOLD: 2570/2581 sessions usable (100%), 2016-09-06 to 2026-08-21
- AUDUSD: 2075/2628 sessions usable (79%), 2018-10-02 to 2026-08-21
- USDCAD: 2075/2628 sessions usable (79%), 2018-10-02 to 2026-08-21
- USDCHF: 2075/2628 sessions usable (79%), 2018-10-02 to 2026-08-21