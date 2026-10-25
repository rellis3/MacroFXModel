# Open questions and known issues

When one of these is answered, move it to the right reference file with the date and the source.

## Questions for C.OG (the blue line)

1. ~~The exact tickers and contract months.~~ **Answered 2026-10-13 (C.OG, Discord): "Try sofr and i2! — that's three month euribor futures, provided by ice."** His shared Pine (`C.OG — Euribor vs SOFR Rate Spread`) defaults: EUR leg `ICEEUR:I2!` (2nd listed Euribor, serial months, rolls monthly; = IX6 Nov26 on 17–22 Sep), USD leg `CME:SR3U2026`, spread = EUR rate − USD rate, manual map spread×0.2 + 1.445 (≈1.2, NOT 7.5–8.5) or rolling auto-fit to the chart's high/low, optional EMA, `t + N days` plot offset, `request.security` on a user-chosen data timeframe (default D, lookahead off, fixnan). He never said ESTR is used — that was our inference from his Discord wording.
2. The formula and units (why does it sit at 7.5–8.5?).
3. The vendor and pull frequency (is it forward-filled?).
4. The timezone of the timestamps.

## Unresolved research (from `COG_OBSERVED_SYSTEM.md` §4–5 and the worklogs)

- Early exit vs tier mix behind his −3.06% average loss. Inference (ours): about a third of his edge may be in the
  discretionary exit.
- A runs test on his directions (slow macro direction vs fast pre-open read).
- Fit his stage-2 stops against our estimators.
- The forward record needs about 30 rows; it has 2.
- Rerun S1/S3 using real SR3 − €STR short-rate futures. Reopen the composite only with about a year more 1-minute data
  (≈ April 2027).
- COG gap: A/B a shorter-half-life σ inside `ratio_yz` (deferred).
- Build the MAE noise-threshold stop sweep (snippet 1).
- The euro rows of rates tests 1/4/7, and the same questions on EURUSD.

## Known inconsistencies in the cog files (as of 2026-10-12)

- `cog/lessons/*.html` and `cog/hub.html` have no `<!-- DESK:START/END -->` markers despite many repo mentions. This
  may conflict with the deskStrip rule; check before relying on stripping.

Fixed 2026-10-18: cog lesson titles/crumbs/footers now point to `cog/hub.html`; the hub's CLAUDE.md link; a status
banner on `cog-replication/README.md`.

Fix these only when asked, or when touching the file anyway, and then remove the line here.

**2026-10-14 (C.OG, Discord, tier 2):** his chart is two TradingView tabs, Nasdaq on one and "the raw indicator with no smoothing or adjustment" on the other; "you'll be able to match it perfectly". Smoothing = none, forward shift = 0. Unanswered still: his data timeframe, and the exact settings of the Python-built version in the video.

**2026-10-18 (questions drafted for C.OG, not yet answered):** how exactly is "confirmation" defined in his code (the 45-minute wait, a threshold?); which price field, timestamps, contracts and roll handling does his script use for the exported line, and which Nasdaq series; has he measured how often the pattern occurs over the whole history; his pair compares SOFR Sep-Dec 2026 with Euribor Mar-Jun 2027 (no overlapping reference period): deliberate?; what he plans with PCA, residuals and the variance-versus-correlation split.


**2026-10-18 (his ES dealer-hedging chart, `education/cog-snippets.md` §2; not yet asked):** are the per-strike fans delta or gamma; which expiries; IV source ("IV less ATM" = sticky-strike shift?); the difference between "flip (zero crossing)", "total gamma flip" and "zero gamma"; what the white line is; does he assume dealers long calls / short puts.

**2026-10-25 (C.OG promo video, "Options, rates, commodities and liquidity, in one feed"; open):** is it a paid product or member feed, and when; the data sources; whether the commodities "z-score" is mean/sd or a two-year range position; the rolling-correlation window; whether any panel carries a tested signal. See `education/cog-snippets.md` §4.
