# Short-term-rate futures archive (15-min, from IBKR)

The legs of C.OG's SOFR vs euro short-rate spread (see `plans/STUDY_BOOK_2026-10-08.md`).

- **One file per contract:** `<EXCHANGE>_<localSymbol>.csv`, e.g. `CME_SR3U6.csv` (SOFR Sep'26, the one on his screen),
  `CME_SR3Z6.csv`, `CME_SR3H7.csv`, `CME_SR3M7.csv`; euro legs as `ICEEU_I??.csv` (Euribor), `ICEEU_ER3??.csv`,
  `EUREX_ST3??.csv`, `CME_ESTR??.csv` once pulled.
- **Columns:** `time` (UTC, bar START), `open, high, low, close, volume, average, barCount` (IBKR TRADES bars).
- **Source:** `python scratchpad/ibkr_stir_pull.py` with TWS / IB Gateway open (see the script header). Catalogued in
  `js/dataCatalogue.js` (`SOFR3`, `EUR_STIR`, source `ibkr`).

**This is an archive, not a cache.** IBKR serves only about 6 months of 15-minute history. Each run of the pull script
merges into these files (new bars added, overlapping bars replaced by the newer pull), so running it every few months
grows the history. Deleting a file loses bars IBKR will not serve again.

## First pull (2026-10-08)

| file | contract | bars | from → to (UTC) | median 15-min volume |
|---|---|---|---|---|
| CME_SR3U6.csv | SOFR Sep'26 | 11,752 | 2026-04-12 22:00 → 2026-10-08 13:15 | |
| CME_SR3Z6.csv | SOFR Dec'26 | 11,767 | same | |
| CME_SR3H7.csv | SOFR Mar'27 | 11,773 | same | |
| CME_SR3M7.csv | SOFR Jun'27 | 11,771 | same | |
| ICEEU_IZ6.csv | 3M Euribor Dec'26 (ICE) | 10,513 | 2026-04-07 00:00 → 2026-10-08 13:15 | 566 |
| ICEEU_ER3_front-2026-10-08.csv | 3M €STR (ICE), front on 2026-10-08, month not recorded | 9,863 | same | 2 |
| EUREX_ST3_front-2026-10-08.csv | 3M €STR (Eurex), front on 2026-10-08, month not recorded | 6,919 | 2026-04-07 06:00 → 2026-10-08 13:15 | 0 |

**The €STR futures barely trade intraday** (median 2 and 0 contracts per 15 minutes): their 15-min closes are mostly
stale prints. **Euribor is the usable euro leg** for anything intraday. The two `_front-2026-10-08` files came from an
earlier version of the pull script that did not record the contract month; later pulls write the real `localSymbol`.
