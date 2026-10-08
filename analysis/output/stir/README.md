# Short-term-rate futures archive (15-min, from IBKR)

**Added 2026-10-08: fed funds (ZQ, CBOT), 12 consecutive months.** Unlike the SOFR legs this is MONTHLY and
CONSECUTIVE, because a per-FOMC-meeting probability is the difference between the month containing a meeting and the
month before it, pro-rated by where in the month the meeting falls -- a gap and the meeting between cannot be
isolated. That is the CME FedWatch calculation, and the reason `rates.html` has carried a 2-year-yield PROXY since it
was built and `fed-path.html` has to say "window, not meeting" about the Atlanta Fed series on every surface. The
month list is GENERATED, not hard-coded: monthlies would go stale within weeks. Expect the back months to be thin --
check volume before reading anything into a 15-minute bar out at 9-12 months, the same lesson the EUR legs taught.
Skip it with `--no-zq`; it is 12 contracts and most of the runtime.

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
| ICEEU_ER3U6.csv | 3M €STR Sep'26 (ICE) | 9,863 | same | 2 |
| EUREX_FST3_20261216_M.csv | 3M €STR Sep'26 (Eurex) | 6,919 | 2026-04-07 06:00 → 2026-10-08 13:15 | 0 |

**The €STR futures barely trade intraday** (median 2 and 0 contracts per 15 minutes): their 15-min closes are mostly
stale prints. **Euribor is the usable euro leg** for anything intraday. CME €STR (CME_ESRM7.csv, Jun'27, 5,771 bars, 2026-04-13 → 2026-10-07)
was added on the second pull. Thin contracts gain bars mid-history on a re-pull (IBKR skips some empty 15-min bars),
so the merge also fills gaps, not just the newest end.
