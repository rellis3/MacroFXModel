# cot_weekly.csv: read this before using it

Written by `scripts/cot-crowding-programme/fetch_cot.py` (CFTC TFF / Disaggregated, weekly, `report_date` = the
Tuesday the positions are as of; public the following Friday 15:30 ET).

**Sign convention: JPY, CAD and CHF are stored in USD/xxx PAIR terms.** For those three, long and short are swapped
at fetch time (`MARKETS` flip = True), so a positive spec net means long USD/JPY (short yen). Every other symbol is
in its own futures terms (EUR, GBP, AUD, NZD, MXN = long the currency vs USD).

- A study in pair terms (USDJPY, USDCAD, USDCHF prices) can use the file as it is.
- A study in currency-strength terms (e.g. an FX8 basket where JPY means the yen) must multiply JPY/CAD/CHF by −1.

On 2026-10-31 `scripts/residual-pca-family/tags.py` was found reading the file in currency terms without the flip,
which inverted the crowd tag for JPY/CAD/CHF (REPO_REVIEW_2026-10-31 S4).
