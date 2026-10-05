# US-EXTRAS-CONFIRM — results

Pre-registration: `forge/US_EXTRAS_CONFIRM_PREREG.md`.

**Verdict: CONFIRMED.** Window 2011-01-03 → 2015-12-31, train before 2014-01-03. Test pinball (IV + extras) ÷ (IV only), median **0.9565**, better on **3/4**.

| index | train | test | B ÷ A |
|---|---|---|---|
| DOW | 753 | 503 | 0.9678 |
| NQ | 753 | 503 | 0.9452 |
| SPX | 753 | 503 | 0.9392 |
| US2000 | 753 | 503 | 1.0011 |

| extra | expected | joint β (std) | sign as ledger |
|---|---|---|---|
| vix_inv | + | 0.0373 | yes |
| front_dear | + | 0.046 | yes |
| front_calm | - | -0.0474 | yes |
| all_down | + | 0.0384 | yes |
| nq_dw | + | 0.0216 | yes |

| test days with | n | A p75 exceed | B p75 exceed |
|---|---|---|---|
| vix_inv | 152 | 0.388 | 0.191 |
| front_dear | 900 | 0.383 | 0.303 |
| front_calm | 388 | 0.183 | 0.296 |
| all_down | 408 | 0.412 | 0.311 |
| nq_dw | 472 | 0.392 | 0.284 |

## Data

- SPX: 1256/1258 sessions usable, 2011-01-05 to 2015-12-31
- NQ: 1256/1258 sessions usable, 2011-01-05 to 2015-12-31
- DOW: 1256/1258 sessions usable, 2011-01-05 to 2015-12-31
- US2000: 1256/1258 sessions usable, 2011-01-05 to 2015-12-31